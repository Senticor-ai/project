"""Tests for the chat proxy route (/chat/completions).

The backend proxies requests to the agents service via httpx.
These tests monkeypatch httpx and settings to test the HTTP layer
without a real agents service.
"""

import dataclasses

import httpx

from app.config import settings

_DUMMY_REQUEST = httpx.Request("POST", "http://localhost:8002/chat/completions")


def _patch_settings(monkeypatch, **overrides):
    """Replace module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.chat.routes.settings", patched)
    return patched


class TestChatCompletions:
    def test_returns_401_without_auth(self, client):
        response = client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-1"},
        )
        assert response.status_code == 401

    def test_returns_503_when_agents_not_configured(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url=None)
        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-1"},
        )
        assert response.status_code == 503
        assert "not available" in response.json()["detail"].lower()

    def test_returns_422_for_missing_message(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")
        response = auth_client.post(
            "/chat/completions",
            json={"conversationId": "conv-1"},
        )
        assert response.status_code == 422

    def test_proxies_text_only_response(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            200,
            json={"text": "Hallo! Wie kann ich helfen?", "toolCalls": None},
            request=_DUMMY_REQUEST,
        )
        monkeypatch.setattr(
            "app.chat.routes.httpx.post",
            lambda *args, **kwargs: mock_response,
        )

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-1"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["text"] == "Hallo! Wie kann ich helfen?"
        assert body.get("toolCalls") is None

    def test_proxies_tool_calls_response(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            200,
            json={
                "text": "Hier ist mein Vorschlag:",
                "toolCalls": [
                    {
                        "name": "create_action",
                        "arguments": {
                            "type": "create_action",
                            "name": "E-Mail beantworten",
                            "bucket": "next",
                        },
                    }
                ],
            },
            request=_DUMMY_REQUEST,
        )
        monkeypatch.setattr(
            "app.chat.routes.httpx.post",
            lambda *args, **kwargs: mock_response,
        )

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Ich muss eine Mail beantworten", "conversationId": "conv-2"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["text"] == "Hier ist mein Vorschlag:"
        assert len(body["toolCalls"]) == 1
        tc = body["toolCalls"][0]
        assert tc["name"] == "create_action"
        assert tc["arguments"]["bucket"] == "next"

    def test_returns_502_when_agents_down(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise_connection(*args, **kwargs):
            raise httpx.ConnectError("Connection refused")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise_connection)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-3"},
        )
        assert response.status_code == 502
        assert "agents" in response.json()["detail"].lower()

    def test_returns_504_when_agents_timeout(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise_timeout(*args, **kwargs):
            raise httpx.ReadTimeout("Read timed out")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise_timeout)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-4"},
        )
        assert response.status_code == 504
        assert "timeout" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Execute tool proxy
# ---------------------------------------------------------------------------

_EXECUTE_REQUEST = {
    "toolCall": {"name": "create_action", "arguments": {"name": "Einkaufen", "bucket": "next"}},
    "conversationId": "conv-42",
}

_DUMMY_EXECUTE_REQUEST = httpx.Request("POST", "http://localhost:8002/execute-tool")


class TestExecuteTool:
    def test_returns_401_without_auth(self, client):
        response = client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)
        assert response.status_code == 401

    def test_returns_503_when_agents_not_configured(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url=None)
        response = auth_client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)
        assert response.status_code == 503

    def test_proxies_response(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            200,
            json={
                "createdItems": [
                    {"canonicalId": "urn:app:action:a1", "name": "Einkaufen", "type": "action"}
                ]
            },
            request=_DUMMY_EXECUTE_REQUEST,
        )
        monkeypatch.setattr("app.chat.routes.httpx.post", lambda *a, **kw: mock_response)

        response = auth_client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)
        assert response.status_code == 200
        body = response.json()
        assert len(body["createdItems"]) == 1
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:a1"

    def test_forwards_auth_context(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        captured_kwargs: dict = {}

        def capture_post(*args, **kwargs):
            captured_kwargs.update(kwargs)
            return httpx.Response(
                200,
                json={"createdItems": []},
                request=_DUMMY_EXECUTE_REQUEST,
            )

        monkeypatch.setattr("app.chat.routes.httpx.post", capture_post)

        auth_client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)

        payload = captured_kwargs["json"]
        assert "auth" in payload
        # Session token should be present (from auth cookie)
        assert payload["auth"]["sessionToken"] is not None
        # Org ID from the user's org
        assert payload["auth"]["orgId"] is not None
        # Session cookie name from settings
        assert "sessionCookieName" in payload["auth"]

    def test_returns_502_when_agents_down(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise(*args, **kwargs):
            raise httpx.ConnectError("Connection refused")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise)

        response = auth_client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)
        assert response.status_code == 502

    def test_returns_504_when_agents_timeout(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise(*args, **kwargs):
            raise httpx.ReadTimeout("Read timed out")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise)

        response = auth_client.post("/chat/execute-tool", json=_EXECUTE_REQUEST)
        assert response.status_code == 504
