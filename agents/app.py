"""Agents service — FastAPI app for the Tay GTD copilot.

Runs as a separate service (default port 8001). The backend proxies
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

from tay import create_agent  # noqa: E402 — must load env before importing

logger = logging.getLogger(__name__)

app = FastAPI(title="TerminAndoYo Agents", version="0.1.0")

# Create the agent once at startup
_agent = create_agent()

# ---------------------------------------------------------------------------
# Pydantic models
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
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}


async def run_agent(message: str) -> ChatMessage:
    """Run the Haystack agent with a user message and return the last message."""
    user_msg = ChatMessage.from_user(message)
    result = await _agent.run_async(messages=[user_msg])
    return result["last_message"]


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
