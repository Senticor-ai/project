"""Chat proxy — forwards requests to the agents service."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..config import settings
from ..deps import get_current_org, get_current_user
from ..http import get_client_ip

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
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/completions", response_model=ChatCompletionResponse)
def chat_completions(req: ChatCompletionRequest):
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    try:
        resp = httpx.post(
            f"{settings.agents_url}/chat/completions",
            json=req.model_dump(),
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


@router.post("/execute-tool", response_model=ExecuteToolResponse)
def execute_tool(
    req: ExecuteToolRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    current_org: dict = Depends(get_current_org),
):
    """Forward approved tool call to agents service for execution."""
    if not settings.agents_url:
        raise HTTPException(status_code=503, detail="Agents service not available")

    # Extract session token from cookie
    session_token = request.cookies.get(settings.session_cookie_name)
    client_ip = get_client_ip(request)

    try:
        resp = httpx.post(
            f"{settings.agents_url}/execute-tool",
            json={
                "toolCall": req.toolCall.model_dump(),
                "conversationId": req.conversationId,
                "auth": {
                    "sessionToken": session_token,
                    "sessionCookieName": settings.session_cookie_name,
                    "orgId": current_org["org_id"],
                    "clientIp": client_ip,
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
