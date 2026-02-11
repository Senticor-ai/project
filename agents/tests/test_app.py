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


# ---------------------------------------------------------------------------
# Model fallback
# ---------------------------------------------------------------------------


class TestModelFallback:
    """Test that run_agent tries multiple models when earlier ones fail."""

    @pytest.mark.anyio
    async def test_fallback_to_second_model(self):
        """First model fails, second succeeds."""
        from app import run_agent

        reply = ChatMessage.from_assistant("Erfolg!")
        call_count = 0

        async def _mock_run_async(messages):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Model unavailable")
            return {"last_message": reply}

        mock_agent = AsyncMock()
        mock_agent.run_async = _mock_run_async

        with (
            patch("app.MODELS", ["model-a", "model-b"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            result = await run_agent("Hallo")

        assert result.text == "Erfolg!"
        assert call_count == 2

    @pytest.mark.anyio
    async def test_all_models_fail(self):
        """All models fail — raises RuntimeError."""
        from app import run_agent

        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(side_effect=RuntimeError("Kaputt"))

        with (
            patch("app.MODELS", ["model-a", "model-b"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            with pytest.raises(RuntimeError, match="All 2 models failed"):
                await run_agent("Hallo")

    @pytest.mark.anyio
    async def test_first_model_succeeds_no_fallback(self):
        """First model works — no fallback needed."""
        from app import run_agent

        reply = ChatMessage.from_assistant("Sofort!")

        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(return_value={"last_message": reply})
        create_agent_mock = patch("app.create_agent", return_value=mock_agent)

        with patch("app.MODELS", ["model-a", "model-b"]), create_agent_mock as ca_mock:
            result = await run_agent("Hallo")

        assert result.text == "Sofort!"
        # create_agent called only once (for model-a)
        ca_mock.assert_called_once_with("model-a")


# ---------------------------------------------------------------------------
# Execute tool endpoint
# ---------------------------------------------------------------------------


class TestExecuteTool:
    """Test POST /execute-tool endpoint."""

    def _make_request(self, tool_name="create_action", arguments=None):
        return {
            "toolCall": {
                "name": tool_name,
                "arguments": arguments or {"name": "Einkaufen", "bucket": "next"},
            },
            "conversationId": "conv-42",
            "auth": {
                "sessionToken": "tok-abc",
                "sessionCookieName": "terminandoyo_session",
                "orgId": "org-1",
                "clientIp": "192.168.1.1",
            },
        }

    def test_success(self, client: TestClient):
        from backend_client import CreatedItemRef

        mock_result = [CreatedItemRef("urn:app:action:a1", "Einkaufen", "action")]

        with patch("app.execute_tool", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post("/execute-tool", json=self._make_request())

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["createdItems"]) == 1
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:a1"
        assert body["createdItems"][0]["name"] == "Einkaufen"
        assert body["createdItems"][0]["type"] == "action"

    def test_project_with_actions(self, client: TestClient):
        from backend_client import CreatedItemRef

        mock_result = [
            CreatedItemRef("urn:app:project:p1", "Umzug", "project"),
            CreatedItemRef("urn:app:action:a1", "Kartons", "action"),
            CreatedItemRef("urn:app:reference:r1", "Checkliste", "reference"),
        ]

        with patch("app.execute_tool", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(
                "/execute-tool",
                json=self._make_request(
                    "create_project_with_actions",
                    {
                        "project": {"name": "Umzug", "desiredOutcome": "Neue Wohnung"},
                        "actions": [{"name": "Kartons", "bucket": "next"}],
                        "documents": [{"name": "Checkliste"}],
                    },
                ),
            )

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["createdItems"]) == 3

    def test_error_returns_500(self, client: TestClient):
        with patch(
            "app.execute_tool",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Backend down"),
        ):
            resp = client.post("/execute-tool", json=self._make_request())

        assert resp.status_code == 500
        assert "Backend down" in resp.json()["detail"]

    def test_validation_error_returns_422(self, client: TestClient):
        # Missing required fields
        resp = client.post("/execute-tool", json={"toolCall": {"name": "x"}})
        assert resp.status_code == 422
