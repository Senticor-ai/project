"""Chat proxy — forwards requests to the agents service with conversation history."""

from __future__ import annotations

import json
import logging
from collections.abc import Generator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import settings
from ..delegation import create_delegated_token
from ..deps import get_current_org, get_current_user
from .queries import get_conversation_messages, get_or_create_conversation, save_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Pydantic models (matching frontend contract)
# ---------------------------------------------------------------------------


class ChatCompletionRequest(BaseModel):
    message: str
    conversationId: str


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


# ---------------------------------------------------------------------------
# Helpers
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
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/completions")
def chat_completions(
    req: ChatCompletionRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    # 1. Get or create conversation
    conv = get_or_create_conversation(
        org_id=current_org["org_id"],
        user_id=str(current_user["id"]),
        external_id=req.conversationId,
    )
    conversation_id = str(conv["conversation_id"])

    # 2. Save user message
    save_message(conversation_id, "user", req.message)

    # 3. Fetch history and build messages array for agents
    history = get_conversation_messages(conversation_id)
    messages = _build_agent_messages(history)

    agent_payload = {
        "messages": messages,
        "conversationId": req.conversationId,
        "stream": True,
    }

    # 4. Stream response from agents and persist
    return StreamingResponse(
        _stream_and_persist(settings.agents_url, agent_payload, conversation_id),
        media_type="application/x-ndjson",
    )


@router.post("/execute-tool", response_model=ExecuteToolResponse)
def execute_tool(
    req: ExecuteToolRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    current_org: dict = Depends(get_current_org),  # noqa: B008
):
    """Forward approved tool call to agents service for execution."""
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    # Create a short-lived delegated JWT instead of forwarding the session cookie
    delegated_token = create_delegated_token(
        user_id=str(current_user["id"]),
        org_id=current_org["org_id"],
    )

    try:
        resp = httpx.post(
            f"{settings.agents_url}/execute-tool",
            json={
                "toolCall": req.toolCall.model_dump(),
                "conversationId": req.conversationId,
                "auth": {
                    "token": delegated_token,
                    "orgId": current_org["org_id"],
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
