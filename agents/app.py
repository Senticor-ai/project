"""Agents service — FastAPI app for the Tay GTD copilot.

Runs as a separate service (default port 8002). The backend proxies
requests to this service at /chat/completions.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from haystack.dataclasses import ChatMessage
from pydantic import BaseModel

# Load .env from monorepo root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend_client import AuthContext  # noqa: E402 — must load env before importing
from tay import MODELS, create_agent  # noqa: E402
from tool_executor import ToolCallInput, execute_tool  # noqa: E402
from tracing import configure_tracing, shutdown_tracing  # noqa: E402

logger = logging.getLogger(__name__)


def _enable_haystack_logging():
    """Enable Haystack's real-time pipeline logging to stdout."""
    import logging as stdlib_logging

    from haystack import tracing
    from haystack.tracing.logging_tracer import LoggingTracer

    stdlib_logging.getLogger("haystack").setLevel(stdlib_logging.DEBUG)
    tracing.tracer.is_content_tracing_enabled = True
    tracing.enable_tracing(
        LoggingTracer(
            tags_color_strings={
                "haystack.component.input": "\x1b[1;31m",
                "haystack.component.name": "\x1b[1;34m",
            }
        )
    )
    logger.info("Haystack LoggingTracer enabled (content tracing ON)")


@asynccontextmanager
async def lifespan(application: FastAPI):
    _enable_haystack_logging()
    tracer_provider = configure_tracing(application)
    yield
    shutdown_tracing(tracer_provider)


app = FastAPI(title="TerminAndoYo Agents", version="0.1.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ChatCompletionRequest(BaseModel):
    message: str
    conversationId: str  # V1: accepted but unused. V2: pass message history for context.


class ChatToolCallResponse(BaseModel):
    name: str
    arguments: dict


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


@app.get("/health")
async def health():
    return {"status": "ok"}


def _find_assistant_message(result: dict) -> ChatMessage:
    """Extract the last assistant message from agent result.

    When the Haystack Agent exits on a tool-name exit condition, it executes
    the tool's no-op function and ``result["last_message"]`` is the *tool
    result* (role=tool).  The actual LLM message with text and tool_calls is
    one step earlier in ``result["messages"]``.
    """
    last = result["last_message"]
    if last.tool_calls:
        return last  # Already the assistant message (text exit condition)

    # Search backwards for the assistant message with tool_calls
    for msg in reversed(result.get("messages", [])):
        if msg.tool_calls:
            return msg

    return last  # Fallback: pure-text reply


async def run_agent(message: str) -> ChatMessage:
    """Run the Haystack agent with model fallback.

    Tries each model in MODELS (from AGENT_MODEL env var) in order.
    Falls back to the next model if the current one fails.
    """
    user_msg = ChatMessage.from_user(message)
    last_error: Exception | None = None

    for model in MODELS:
        try:
            agent = create_agent(model)
            result = await agent.run_async(messages=[user_msg])
            return _find_assistant_message(result)
        except Exception as exc:
            last_error = exc
            logger.warning("Model %s failed: %s. Trying next model...", model, exc)

    # All models failed
    raise RuntimeError(f"All {len(MODELS)} models failed. Last error: {last_error}") from last_error


@app.post("/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(req: ChatCompletionRequest):
    try:
        last_message = await run_agent(req.message)
    except Exception as exc:
        logger.exception("Agent error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Map Haystack ChatMessage to our response format
    text = last_message.text or ""
    tool_calls = None

    if last_message.tool_calls:
        tool_calls = [
            ChatToolCallResponse(
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
