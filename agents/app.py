"""Agents service — FastAPI app for the Copilot productivity assistant.

Runs as a separate service (default port 8002). The backend proxies
requests to this service at /chat/completions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator  # noqa: UP035 — keep for 3.12 compat

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from haystack.dataclasses import ChatMessage, StreamingChunk, ToolCall
from pydantic import BaseModel

# Load .env from monorepo root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# fmt: off
from backend_client import AuthContext  # noqa: E402 — must load env before importing
from copilot import MODELS, RuntimeLlmConfig, create_agent  # noqa: E402
from secrets_manager import SecretsManager, get_secrets_manager  # noqa: E402
from tool_executor import CopilotCliError, ToolCallInput, execute_tool  # noqa: E402
from tracing import configure_tracing, shutdown_tracing  # noqa: E402
# fmt: on

logger = logging.getLogger(__name__)

# Initialize secrets manager (env fallback for dev, Vault/AWS for production)
secrets_manager: SecretsManager | None
try:
    secrets_manager = get_secrets_manager()
except Exception as e:
    # Keep startup resilient when optional provider SDKs are not installed.
    backend = os.environ.get("SECRETS_BACKEND", "env").lower()
    if backend in {"vault", "aws"} and isinstance(e, ImportError):
        logger.warning(
            "Secrets backend '%s' SDK unavailable, falling back to environment variables: %s",
            backend,
            e,
        )
        secrets_manager = None
    elif backend != "env":
        # Fail fast for configured non-env backends when dependencies are present
        # but backend init/auth still fails.
        logger.error(f"Failed to initialize secrets manager ({backend}): {e}")
        raise
    else:
        logger.warning(f"Secrets manager initialization issue (using env fallback): {e}")
        secrets_manager = None


def _enable_haystack_logging(*, enable_otel_tracing: bool) -> None:
    """Enable Haystack logging and tracing integration."""
    import logging as stdlib_logging

    from haystack import tracing
    from haystack.logging import configure_logging as configure_haystack_logging
    from haystack.tracing.logging_tracer import LoggingTracer

    use_json_env = os.getenv("HAYSTACK_LOG_JSON")
    use_json: bool | None = None
    if use_json_env is not None:
        use_json = use_json_env.lower() in {"1", "true", "yes"}
    configure_haystack_logging(use_json=use_json)

    level_name = os.getenv("HAYSTACK_LOG_LEVEL", "INFO").upper()
    level = getattr(stdlib_logging, level_name, stdlib_logging.INFO)
    stdlib_logging.getLogger("haystack").setLevel(level)

    tracing.tracer.is_content_tracing_enabled = True

    if enable_otel_tracing:
        try:
            from haystack.tracing.opentelemetry import OpenTelemetryTracer
            from opentelemetry import trace as otel_trace

            tracing.enable_tracing(
                OpenTelemetryTracer(
                    otel_trace.get_tracer("senticor.agents.haystack"),
                )
            )
            logger.info("Haystack OpenTelemetryTracer enabled")
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to enable Haystack OpenTelemetry tracer: %s", exc)

    tracing.enable_tracing(
        LoggingTracer(
            tags_color_strings={
                "haystack.component.input": "\x1b[1;31m",
                "haystack.component.name": "\x1b[1;34m",
            }
        )
    )
    logger.info("Haystack LoggingTracer enabled")


@asynccontextmanager
async def lifespan(application: FastAPI):
    tracer_provider = configure_tracing(application)
    _enable_haystack_logging(enable_otel_tracing=tracer_provider is not None)
    yield
    shutdown_tracing(tracer_provider)


app = FastAPI(title="Senticor Project Agents", version="0.1.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ChatToolCallResponse(BaseModel):
    id: str | None = None
    name: str
    arguments: dict


class MessagePayload(BaseModel):
    """A single message in the conversation history."""

    role: str  # "user" | "assistant"
    content: str
    toolCalls: list[ChatToolCallResponse] | None = None


class ChatAuthPayload(BaseModel):
    """Auth context from the backend chat proxy for read tools."""

    token: str
    orgId: str | None = None


class UserContextPayload(BaseModel):
    """User context forwarded from the backend for prompt personalization."""

    username: str | None = None
    email: str | None = None
    timezone: str | None = None
    locale: str | None = None
    localTime: str | None = None
    currentPath: str | None = None
    currentUrl: str | None = None
    appView: str | None = None
    appSubView: str | None = None
    activeBucket: str | None = None
    visibleErrors: list[str] | None = None
    visibleWorkspaceSnapshot: dict | None = None


class TraceContextPayload(BaseModel):
    externalConversationId: str | None = None
    dbConversationId: str | None = None
    userId: str | None = None
    orgId: str | None = None
    sessionId: str | None = None
    requestId: str | None = None
    trailId: str | None = None


class ChatLlmPayload(BaseModel):
    """Per-request LLM override from backend user settings."""

    provider: str
    apiKey: str
    model: str | None = None


class ChatCompletionRequest(BaseModel):
    messages: list[MessagePayload]
    conversationId: str
    stream: bool = False
    auth: ChatAuthPayload | None = None
    userContext: UserContextPayload | None = None
    traceContext: TraceContextPayload | None = None
    llm: ChatLlmPayload | None = None


class ChatCompletionResponse(BaseModel):
    text: str
    toolCalls: list[ChatToolCallResponse] | None = None


# -- Execute tool models (for approved tool calls) --


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict


class AuthContextPayload(BaseModel):
    token: str  # Delegated JWT from backend
    orgId: str | None = None


class ExecuteToolRequest(BaseModel):
    toolCall: ToolCallPayload
    conversationId: str
    auth: AuthContextPayload


class CreatedItemRefResponse(BaseModel):
    canonicalId: str
    name: str
    type: str


class ExecuteToolResponse(BaseModel):
    createdItems: list[CreatedItemRefResponse]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _status_code_for_tool_error(exc: CopilotCliError) -> int:
    code = (exc.error_code or "").upper()

    if code in {
        "UNAUTHENTICATED",
        "INVALID_DELEGATED_TOKEN",
        "INVALID_TOKEN",
        "TOKEN_EXPIRED",
    }:
        return 401

    if code in {"PERMISSION_DENIED", "FORBIDDEN"}:
        return 403

    if code in {
        "VALIDATION_ERROR",
        "INVALID_ARGUMENT",
        "INVALID_BUCKET",
        "APPROVAL_REQUIRED",
        "ITEM_NOT_FOUND",
        "PROJECT_NOT_FOUND",
        "ACTION_NOT_FOUND",
    }:
        return 400

    detail_lower = exc.detail.lower()
    if "invalid delegated token" in detail_lower or "unauthenticated" in detail_lower:
        return 401

    return 500


@app.get("/health")
async def health():
    return {"status": "ok"}


def _find_assistant_message(result: dict) -> ChatMessage:
    """Extract the last assistant message from agent result.

    When the Haystack Agent exits on a tool-name exit condition, it executes
    the tool's no-op function and ``result["last_message"]`` is the *tool
    result* (role=tool).  The actual LLM message with text and tool_calls is
    one step earlier in ``result["messages"]``.

    When the agent exits on "text", ``last_message`` is the assistant text
    message — return it directly.  Do NOT search backwards for earlier
    tool_calls, as those belong to inline read tools (e.g.
    ``list_workspace_overview``) that were already executed by the agent.
    """
    last = result["last_message"]
    if last.tool_calls:
        return last  # Already the assistant message with exit tool_calls

    # Only search backwards if last_message is a tool result (role=tool),
    # meaning the agent exited on a tool-name exit condition.
    if last.role == "tool":
        for msg in reversed(result.get("messages", [])):
            if msg.tool_calls:
                return msg

    return last  # Pure-text reply (agent exited on "text")


def _to_haystack_messages(messages: list[MessagePayload]) -> list[ChatMessage]:
    """Convert wire-format messages to Haystack ChatMessage objects."""
    haystack_messages: list[ChatMessage] = []
    for msg in messages:
        if msg.role == "user":
            haystack_messages.append(ChatMessage.from_user(msg.content))
        elif msg.role == "assistant":
            if msg.toolCalls:
                tool_calls = [
                    ToolCall(
                        id=tc.id or f"call_history_{i}",
                        tool_name=tc.name,
                        arguments=tc.arguments,
                    )
                    for i, tc in enumerate(msg.toolCalls)
                ]
                haystack_messages.append(
                    ChatMessage.from_assistant(msg.content, tool_calls=tool_calls)
                )
            else:
                haystack_messages.append(ChatMessage.from_assistant(msg.content))
    return haystack_messages


def _build_auth_context(
    auth_payload: ChatAuthPayload | None,
) -> AuthContext | None:
    """Convert wire auth payload to AuthContext for agent tools."""
    if auth_payload is None:
        return None
    return AuthContext(token=auth_payload.token, org_id=auth_payload.orgId)


def _build_llm_config(payload: ChatLlmPayload | None) -> RuntimeLlmConfig | None:
    if payload is None:
        return None
    return RuntimeLlmConfig(
        provider=payload.provider,
        api_key=payload.apiKey,
        model=payload.model,
    )


async def run_agent(
    messages: list[MessagePayload],
    auth: AuthContext | None = None,
    user_context: dict | None = None,
    trace_context: dict | None = None,
    llm_config: RuntimeLlmConfig | None = None,
) -> ChatMessage:
    """Run the Haystack agent with model fallback.

    Tries each model in MODELS (from AGENT_MODEL env var) in order.
    Falls back to the next model if the current one fails.
    """
    haystack_messages = _to_haystack_messages(messages)
    last_error: Exception | None = None

    for model in MODELS:
        try:
            if llm_config is None:
                agent = create_agent(
                    model,
                    auth=auth,
                    user_context=user_context,
                    trace_context=trace_context,
                )
            else:
                agent = create_agent(
                    model,
                    auth=auth,
                    user_context=user_context,
                    trace_context=trace_context,
                    llm_config=llm_config,
                )
            result = await agent.run_async(messages=haystack_messages)
            return _find_assistant_message(result)
        except Exception as exc:
            last_error = exc
            logger.warning("Model %s failed: %s. Trying next model...", model, exc)

    raise RuntimeError(f"All {len(MODELS)} models failed. Last error: {last_error}") from last_error


def _format_tool_calls(msg: ChatMessage) -> list[dict] | None:
    """Format Haystack tool_calls to wire format, preserving IDs."""
    if not msg.tool_calls:
        return None
    return [{"id": tc.id, "name": tc.tool_name, "arguments": tc.arguments} for tc in msg.tool_calls]


async def run_agent_streaming(
    messages: list[MessagePayload],
    auth: AuthContext | None = None,
    user_context: dict | None = None,
    trace_context: dict | None = None,
    llm_config: RuntimeLlmConfig | None = None,
) -> AsyncGenerator[str, None]:
    """Run the agent and yield NDJSON events as text streams in.

    Events:
    - {"type": "text_delta", "content": "..."}  — incremental text token
    - {"type": "tool_calls", "toolCalls": [...]} — tool calls at end
    - {"type": "done", "text": "full text"}      — final event
    - {"type": "error", "detail": "..."}         — error
    """
    haystack_messages = _to_haystack_messages(messages)
    queue: asyncio.Queue[StreamingChunk | None] = asyncio.Queue()

    async def streaming_callback(chunk: StreamingChunk) -> None:
        await queue.put(chunk)

    async def _run_agent_task() -> ChatMessage:
        last_error: Exception | None = None
        for model in MODELS:
            try:
                if llm_config is None:
                    agent = create_agent(
                        model,
                        auth=auth,
                        user_context=user_context,
                        trace_context=trace_context,
                    )
                else:
                    agent = create_agent(
                        model,
                        auth=auth,
                        user_context=user_context,
                        trace_context=trace_context,
                        llm_config=llm_config,
                    )
                result = await agent.run_async(
                    messages=haystack_messages,
                    streaming_callback=streaming_callback,
                )
                return _find_assistant_message(result)
            except Exception as exc:
                last_error = exc
                logger.warning("Model %s failed (streaming): %s", model, exc)
        raise RuntimeError(
            f"All {len(MODELS)} models failed. Last error: {last_error}"
        ) from last_error

    # Run agent in background task, stream chunks from queue
    task = asyncio.create_task(_run_agent_task())
    full_text = ""

    try:
        while True:
            # Wait for chunks or task completion
            try:
                chunk = await asyncio.wait_for(queue.get(), timeout=0.1)
            except TimeoutError:
                if task.done():
                    # Drain remaining chunks
                    while not queue.empty():
                        chunk = queue.get_nowait()
                        if chunk is None:
                            break
                        if chunk.content:
                            full_text += chunk.content
                            event = {"type": "text_delta", "content": chunk.content}
                            yield json.dumps(event) + "\n"
                    break
                continue

            if chunk is None:
                break
            if chunk.content:
                full_text += chunk.content
                yield json.dumps({"type": "text_delta", "content": chunk.content}) + "\n"

        # Get final result for tool_calls
        result_msg = await task
        tool_calls = _format_tool_calls(result_msg)
        if tool_calls:
            yield json.dumps({"type": "tool_calls", "toolCalls": tool_calls}) + "\n"

        # If agent returned text but no streaming happened (e.g. cache hit),
        # emit the full text as a single delta
        result_text = result_msg.text or ""
        if result_text and not full_text:
            full_text = result_text
            yield json.dumps({"type": "text_delta", "content": result_text}) + "\n"

        yield json.dumps({"type": "done", "text": full_text or result_text}) + "\n"

    except Exception as exc:
        logger.exception("Streaming error")
        if not task.done():
            task.cancel()
        yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"


@app.post("/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    auth = _build_auth_context(req.auth)
    uctx = req.userContext.model_dump() if req.userContext else None
    trace_ctx = req.traceContext.model_dump(exclude_none=True) if req.traceContext else {}
    if req.conversationId and "externalConversationId" not in trace_ctx:
        trace_ctx["externalConversationId"] = req.conversationId
    llm = _build_llm_config(req.llm)

    if req.stream:
        return StreamingResponse(
            run_agent_streaming(
                req.messages,
                auth=auth,
                user_context=uctx,
                trace_context=trace_ctx,
                llm_config=llm,
            ),
            media_type="application/x-ndjson",
        )

    try:
        last_message = await run_agent(
            req.messages,
            auth=auth,
            user_context=uctx,
            trace_context=trace_ctx,
            llm_config=llm,
        )
    except Exception as exc:
        logger.exception("Agent error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    text = last_message.text or ""
    tool_calls = None

    if last_message.tool_calls:
        tool_calls = [
            ChatToolCallResponse(
                id=tc.id,
                name=tc.tool_name,
                arguments=tc.arguments,
            )
            for tc in last_message.tool_calls
        ]

    return ChatCompletionResponse(text=text, toolCalls=tool_calls)


@app.post("/execute-tool", response_model=ExecuteToolResponse)
async def execute_tool_endpoint(req: ExecuteToolRequest):
    """Execute an approved tool call by creating items via the backend API."""
    auth = AuthContext(
        token=req.auth.token,
        org_id=req.auth.orgId,
    )

    try:
        created = await execute_tool(
            ToolCallInput(name=req.toolCall.name, arguments=req.toolCall.arguments),
            conversation_id=req.conversationId,
            auth=auth,
        )
    except CopilotCliError as exc:
        status_code = _status_code_for_tool_error(exc)
        if status_code >= 500:
            logger.exception("Tool execution error")
        else:
            logger.warning("Tool execution failed with status %s: %s", status_code, exc)
        detail: dict[str, object] = {
            "message": exc.detail,
            "needsReauth": status_code == 401,
        }
        if exc.error_code:
            detail["code"] = exc.error_code
        if exc.retryable is not None:
            detail["retryable"] = exc.retryable
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except Exception as exc:
        logger.exception("Tool execution error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ExecuteToolResponse(
        createdItems=[
            CreatedItemRefResponse(
                canonicalId=ref.canonical_id,
                name=ref.name,
                type=ref.item_type,
            )
            for ref in created
        ]
    )
