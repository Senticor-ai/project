"""Tests for the agents FastAPI app.

Mocks the Haystack Agent so we can test the HTTP layer
without calling any real LLM.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from haystack.dataclasses import ChatMessage, ToolCall


@pytest.fixture()
def client():
    from app import app

    return TestClient(app)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health_check(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Text-only response
# ---------------------------------------------------------------------------


def test_chat_text_response(client: TestClient):
    reply = ChatMessage.from_assistant("Hallo! Wie kann ich helfen?")

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-1"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Hallo! Wie kann ich helfen?"
    assert body.get("toolCalls") is None


# ---------------------------------------------------------------------------
# Tool-call response
# ---------------------------------------------------------------------------


def test_chat_tool_call_response(client: TestClient):
    tool_calls = [
        ToolCall(
            tool_name="create_action",
            arguments={
                "type": "create_action",
                "name": "E-Mail beantworten",
                "bucket": "next",
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Hier ist mein Vorschlag:",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={"message": "Ich muss eine Mail beantworten", "conversationId": "conv-2"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Hier ist mein Vorschlag:"
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "create_action"
    assert tc["arguments"]["name"] == "E-Mail beantworten"
    assert tc["arguments"]["bucket"] == "next"


# ---------------------------------------------------------------------------
# Error handling — agent raises
# ---------------------------------------------------------------------------


def test_chat_error_handling(client: TestClient):
    with patch(
        "app.run_agent",
        new_callable=AsyncMock,
        side_effect=RuntimeError("LLM timeout"),
    ):
        resp = client.post(
            "/chat/completions",
            json={"message": "Hilfe", "conversationId": "conv-3"},
        )

    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "LLM timeout" in body["detail"]
