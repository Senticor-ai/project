"""Chat proxy — forwards requests to the agents service."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..deps import get_current_user

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
