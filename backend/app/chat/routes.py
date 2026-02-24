"""Chat proxy — forwards requests to the agents service with conversation history.

Supports two backends:
- Haystack (default): proxies to the agents/ service via NDJSON
- OpenClaw: calls OpenClaw's /v1/chat/completions (SSE), translates to NDJSON.
  OpenClaw uses native skills (exec + curl) to call the backend API directly.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator, Generator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import settings
from ..container.manager import ensure_running, write_token_file
from ..delegation import create_delegated_token
from ..deps import get_current_org, get_current_user
from ..routes.agent_settings import get_user_agent_backend, get_user_llm_config
from .queries import (
    archive_conversation,
    get_conversation_messages,
    get_or_create_conversation,
    list_conversations,
    save_message,
)
from .sse_translator import SseToNdjsonTranslator
from .tool_executor import AuthContext as ToolAuthContext
from .tool_executor import execute_tool as local_execute_tool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Pydantic models (matching frontend contract)
# ---------------------------------------------------------------------------


class ChatClientContext(BaseModel):
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


class ChatCompletionRequest(BaseModel):
    message: str
    conversationId: str
    context: ChatClientContext | None = None


class ChatToolCallResponse(BaseModel):
    name: str
    arguments: dict


class ChatCompletionResponse(BaseModel):
    text: str
    toolCalls: list[ChatToolCallResponse] | None = None


# -- Execute tool models --


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict


class ExecuteToolRequest(BaseModel):
    toolCall: ToolCallPayload
    conversationId: str


class CreatedItemRefResponse(BaseModel):
    canonicalId: str
    name: str
    type: str


class ExecuteToolResponse(BaseModel):
    createdItems: list[CreatedItemRefResponse]


class ConversationSummaryResponse(BaseModel):
    conversationId: str
    externalId: str
    title: str | None
    agentBackend: str
    createdAt: str
    updatedAt: str


class ConversationMessageResponse(BaseModel):
    messageId: str
    role: str
    content: str
    toolCalls: list[dict] | None = None
    createdAt: str


# ---------------------------------------------------------------------------
# Helpers — Haystack path (unchanged)
# ---------------------------------------------------------------------------


def _build_agent_messages(history: list[dict]) -> list[dict]:
    """Convert DB message rows to the wire format expected by agents service."""
    messages: list[dict] = []
    for m in history:
        entry: dict = {"role": m["role"], "content": m["content"]}
        if m.get("tool_calls"):
            entry["toolCalls"] = m["tool_calls"]
        messages.append(entry)
    return messages


def _stream_and_persist(
    agents_url: str,
    agent_payload: dict,
    conversation_id: str,
) -> Generator[bytes, None, None]:
    """Stream NDJSON from agents, forward to client, persist assistant response."""
    full_text = ""
    tool_calls: list[dict] | None = None

    try:
        with httpx.stream(
            "POST",
            f"{agents_url}/chat/completions",
            json=agent_payload,
            timeout=60.0,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                yield (line + "\n").encode()
                try:
                    event = json.loads(line)
                    if event.get("type") == "text_delta":
                        full_text += event.get("content", "")
                    elif event.get("type") == "tool_calls":
                        tool_calls = event.get("toolCalls")
                    elif event.get("type") == "done":
                        # done event may carry the full text
                        if not full_text and event.get("text"):
                            full_text = event["text"]
                except json.JSONDecodeError:
                    pass
    except httpx.ConnectError:
        yield json.dumps({"type": "error", "detail": "Agents service unreachable"}).encode() + b"\n"
        return
    except httpx.TimeoutException:
        yield json.dumps({"type": "error", "detail": "Agents service timeout"}).encode() + b"\n"
        return
    except httpx.HTTPStatusError as exc:
        detail = f"Agents service error: {exc.response.status_code}"
        yield json.dumps({"type": "error", "detail": detail}).encode() + b"\n"
        return

    # Persist the assistant response after stream completes
    save_message(conversation_id, "assistant", full_text, tool_calls)


# ---------------------------------------------------------------------------
# Helpers — OpenClaw path
# ---------------------------------------------------------------------------


def _build_openai_messages(history: list[dict]) -> list[dict]:
    """Convert DB message rows to OpenAI chat format."""
    messages: list[dict] = []
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    return messages


async def _stream_openclaw(
    openclaw_url: str,
    openclaw_token: str,
    messages: list[dict],
    conversation_id: str,
    user_id: str,
    org_id: str,
) -> AsyncGenerator[bytes, None]:
    """Stream SSE from OpenClaw, translate to NDJSON.

    Phase 3: OpenClaw uses native skills (exec + curl) to create items
    directly via the backend API. No function-calling tools, no auto-execution.
    """
    # Write fresh delegated token for the skill to use
    delegated_token = create_delegated_token(
        user_id=user_id,
        org_id=org_id,
        actor="openclaw",
        scope="items:read items:write",
        ttl_seconds=300,
    )
    write_token_file(user_id, delegated_token)

    translator = SseToNdjsonTranslator()

    payload = {
        "model": "openclaw",
        "messages": messages,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {openclaw_token}",
        "Content-Type": "application/json",
        "x-openclaw-agent-id": "copilot",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{openclaw_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    ndjson_events = translator.feed(line)
                    for event in ndjson_events:
                        # Forward text and done events; skip tool_calls
                        # (OpenClaw handles exec tool calls internally)
                        if event["type"] in ("text_delta", "done", "error"):
                            yield (json.dumps(event) + "\n").encode()
    except httpx.ConnectError:
        err = {"type": "error", "detail": "OpenClaw service unreachable"}
        yield (json.dumps(err) + "\n").encode()
        return
    except httpx.TimeoutException:
        yield (json.dumps({"type": "error", "detail": "OpenClaw service timeout"}) + "\n").encode()
        return
    except httpx.HTTPStatusError as exc:
        detail = f"OpenClaw error: {exc.response.status_code}"
        yield (json.dumps({"type": "error", "detail": detail}) + "\n").encode()
        return

    # Persist assistant response (text only, no tool_calls)
    save_message(conversation_id, "assistant", translator.full_text)

    # Notify frontend that items may have changed
    yield (json.dumps({"type": "items_changed"}) + "\n").encode()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/completions")
def chat_completions(
    request: Request,
    req: ChatCompletionRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    user_id = str(current_user["id"])
    org_id = current_org["org_id"]
    agent_backend = get_user_agent_backend(user_id)

    # 1. Get or create conversation (scoped by agent_backend)
    conv = get_or_create_conversation(
        org_id=org_id,
        user_id=user_id,
        external_id=req.conversationId,
        agent_backend=agent_backend,
    )
    conversation_id = str(conv["conversation_id"])

    # 2. Save user message
    save_message(conversation_id, "user", req.message)

    # 3. Fetch history
    history = get_conversation_messages(conversation_id)

    # 4. Route to the right backend

    if agent_backend == "openclaw":
        try:
            container_url, container_token = ensure_running(user_id)
        except ValueError as exc:
            logger.warning(
                "container.not_configured",
                extra={"user_id": user_id, "detail": str(exc)},
            )
            detail = (
                "Copilot ist noch nicht eingerichtet. "
                "Bitte öffne die Einstellungen → Copilot-Einrichtung "
                "und hinterlege einen API-Schlüssel."
            )
            err = json.dumps({"type": "error", "detail": detail})

            async def _config_error_stream() -> AsyncGenerator[bytes, None]:
                yield (err + "\n").encode()

            return StreamingResponse(
                _config_error_stream(),
                media_type="application/x-ndjson",
            )
        except Exception:
            logger.exception("container.ensure_running_failed", extra={"user_id": user_id})
            err = json.dumps({"type": "error", "detail": "Failed to start OpenClaw container"})

            async def _error_stream() -> AsyncGenerator[bytes, None]:
                yield (err + "\n").encode()

            return StreamingResponse(
                _error_stream(),
                media_type="application/x-ndjson",
            )

        messages = _build_openai_messages(history)

        return StreamingResponse(
            _stream_openclaw(
                container_url,
                container_token,
                messages,
                conversation_id,
                user_id=user_id,
                org_id=org_id,
            ),
            media_type="application/x-ndjson",
        )

    # Default: Haystack path (unchanged)
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    llm_config = get_user_llm_config(user_id)
    if settings.agent_require_user_api_key and llm_config is None:
        detail = (
            "Copilot ist noch nicht eingerichtet. "
            "Bitte öffne Einstellungen → Agent Setup und hinterlege einen API-Schlüssel."
        )
        err = json.dumps({"type": "error", "detail": detail})

        async def _config_error_stream() -> AsyncGenerator[bytes, None]:
            yield (err + "\n").encode()

        return StreamingResponse(
            _config_error_stream(),
            media_type="application/x-ndjson",
        )
    if llm_config and llm_config.provider == "anthropic":
        detail = (
            "Copilot unterstützt nur OpenRouter- oder OpenAI-Schlüssel. "
            "Bitte aktualisiere den Provider in Einstellungen → Agent Setup."
        )
        err = json.dumps({"type": "error", "detail": detail})

        async def _provider_error_stream() -> AsyncGenerator[bytes, None]:
            yield (err + "\n").encode()

        return StreamingResponse(
            _provider_error_stream(),
            media_type="application/x-ndjson",
        )

    # Create delegated token so the agent can read items/files
    delegated_token = create_delegated_token(
        user_id=user_id,
        org_id=org_id,
        scope="items:read items:write",
        ttl_seconds=300,
    )

    messages = _build_agent_messages(history)
    user_context: dict[str, object | None] = {
        "username": current_user.get("username"),
        "email": current_user.get("email"),
    }
    if req.context:
        user_context["timezone"] = req.context.timezone
        user_context["locale"] = req.context.locale
        user_context["localTime"] = req.context.localTime
        user_context["currentPath"] = req.context.currentPath
        user_context["currentUrl"] = req.context.currentUrl
        user_context["appView"] = req.context.appView
        user_context["appSubView"] = req.context.appSubView
        user_context["activeBucket"] = req.context.activeBucket
        user_context["visibleErrors"] = req.context.visibleErrors
        user_context["visibleWorkspaceSnapshot"] = req.context.visibleWorkspaceSnapshot

    trace_context: dict[str, str] = {
        "externalConversationId": req.conversationId,
        "dbConversationId": conversation_id,
        "userId": user_id,
        "orgId": org_id,
    }
    session_id = current_user.get("session_id")
    if session_id:
        trace_context["sessionId"] = str(session_id)
    request_id = getattr(request.state, "request_id", None)
    if request_id:
        trace_context["requestId"] = str(request_id)
    trail_id = getattr(request.state, "trail_id", None)
    if trail_id:
        trace_context["trailId"] = str(trail_id)

    agent_payload = {
        "messages": messages,
        "conversationId": req.conversationId,
        "stream": True,
        "auth": {
            "token": delegated_token,
            "orgId": org_id,
        },
        "userContext": user_context,
        "traceContext": trace_context,
    }
    if llm_config:
        agent_payload["llm"] = {
            "provider": llm_config.provider,
            "model": llm_config.model,
            "apiKey": llm_config.api_key,
        }

    return StreamingResponse(
        _stream_and_persist(settings.agents_url, agent_payload, conversation_id),
        media_type="application/x-ndjson",
    )


@router.post("/execute-tool", response_model=ExecuteToolResponse)
async def execute_tool_endpoint(
    req: ExecuteToolRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    """Execute an approved tool call.

    Semantic tool names (create_project_with_actions, create_action,
    create_reference) are handled locally using the backend's own item
    creation API.  The low-level ``copilot_cli`` tool is forwarded to the
    agents service for CLI execution.
    """
    user_id = str(current_user["id"])
    org_id = current_org["org_id"]

    delegated_token = create_delegated_token(
        user_id=user_id,
        org_id=org_id,
        scope="items:read items:write",
        ttl_seconds=300,
    )

    # Semantic tool names are handled locally — no agents service needed
    tool_name = req.toolCall.name
    if tool_name in ("create_project_with_actions", "create_action", "create_reference"):
        auth_ctx = ToolAuthContext(token=delegated_token, org_id=org_id)
        try:
            created = await local_execute_tool(
                tool_name=tool_name,
                arguments=req.toolCall.arguments,
                conversation_id=req.conversationId,
                auth=auth_ctx,
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

    # Low-level copilot_cli: forward to agents service
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    try:
        resp = httpx.post(
            f"{settings.agents_url}/execute-tool",
            json={
                "toolCall": req.toolCall.model_dump(),
                "conversationId": req.conversationId,
                "auth": {
                    "token": delegated_token,
                    "orgId": org_id,
                },
            },
            timeout=60.0,
        )
        resp.raise_for_status()
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=502, detail="Agents service unreachable") from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Agents service timeout") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502, detail=f"Agents service error: {exc.response.status_code}"
        ) from exc

    return resp.json()


# ---------------------------------------------------------------------------
# Conversation management
# ---------------------------------------------------------------------------


@router.get("/conversations", response_model=list[ConversationSummaryResponse])
def list_conversations_endpoint(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    """List active conversations for the current user."""
    user_id = str(current_user["id"])
    org_id = current_org["org_id"]
    agent_backend = get_user_agent_backend(user_id)

    rows = list_conversations(org_id=org_id, user_id=user_id, agent_backend=agent_backend)
    return [
        ConversationSummaryResponse(
            conversationId=str(r["conversation_id"]),
            externalId=r["external_id"],
            title=r.get("title"),
            agentBackend=r["agent_backend"],
            createdAt=r["created_at"].isoformat(),
            updatedAt=r["updated_at"].isoformat(),
        )
        for r in rows
    ]


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[ConversationMessageResponse],
)
def get_conversation_messages_endpoint(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    """Get messages for a specific conversation."""
    messages = get_conversation_messages(conversation_id)
    return [
        ConversationMessageResponse(
            messageId=str(m["message_id"]),
            role=m["role"],
            content=m["content"],
            toolCalls=m.get("tool_calls"),
            createdAt=m["created_at"].isoformat(),
        )
        for m in messages
    ]


@router.patch("/conversations/{conversation_id}/archive", status_code=204)
def archive_conversation_endpoint(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    """Archive (soft-delete) a conversation."""
    org_id = current_org["org_id"]
    updated = archive_conversation(conversation_id, org_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
