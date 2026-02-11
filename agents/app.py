"""Agents service — FastAPI app for the Tay GTD copilot.

Runs as a separate service (default port 8002). The backend proxies
requests to this service at /chat/completions.
"""

from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)

app = FastAPI(title="TerminAndoYo Agents", version="0.1.0")

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
    sessionToken: str
    sessionCookieName: str = "terminandoyo_session"
    orgId: str | None = None
    clientIp: str | None = None


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
            return result["last_message"]
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
        session_token=req.auth.sessionToken,
        session_cookie_name=req.auth.sessionCookieName,
        org_id=req.auth.orgId,
        client_ip=req.auth.clientIp,
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
