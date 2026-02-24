"""Tests for the chat routes (/chat/completions, /chat/execute-tool).

The backend enriches requests with conversation history from the DB
and streams NDJSON responses from the agents service.
"""

from __future__ import annotations

import dataclasses
import json
from contextlib import contextmanager
from unittest.mock import MagicMock

import httpx

from app.chat.queries import get_conversation_messages
from app.config import settings

_DUMMY_REQUEST = httpx.Request("POST", "http://localhost:8002/chat/completions")


def _patch_settings(monkeypatch, **overrides):
    """Replace module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.chat.routes.settings", patched)
    return patched


def _make_stream_response(events: list[dict]) -> MagicMock:
    """Build a mock httpx streaming response that yields NDJSON lines."""
    lines = [json.dumps(e) for e in events]

    @contextmanager
    def mock_stream(*args, **kwargs):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.iter_lines = MagicMock(return_value=iter(lines))
        yield mock_resp

    return mock_stream


def _parse_ndjson(response) -> list[dict]:
    """Parse NDJSON streaming response body into list of events."""
    text = response.content.decode()
    return [json.loads(line) for line in text.strip().split("\n") if line.strip()]


# ---------------------------------------------------------------------------
# Chat completions
# ---------------------------------------------------------------------------


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

    def test_streams_text_response(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "Hallo! "},
            {"type": "text_delta", "content": "Wie kann ich helfen?"},
            {"type": "done", "text": "Hallo! Wie kann ich helfen?"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-text"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/x-ndjson")

        parsed = _parse_ndjson(response)
        text_deltas = [e for e in parsed if e["type"] == "text_delta"]
        assert len(text_deltas) == 2
        assert text_deltas[0]["content"] == "Hallo! "

        done_events = [e for e in parsed if e["type"] == "done"]
        assert len(done_events) == 1

    def test_streams_tool_calls_response(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "Hier:"},
            {
                "type": "tool_calls",
                "toolCalls": [
                    {"name": "create_action", "arguments": {"name": "Test", "bucket": "next"}},
                ],
            },
            {"type": "done", "text": "Hier:"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Erstelle", "conversationId": "conv-tools"},
        )
        assert response.status_code == 200

        parsed = _parse_ndjson(response)
        tool_events = [e for e in parsed if e["type"] == "tool_calls"]
        assert len(tool_events) == 1
        assert tool_events[0]["toolCalls"][0]["name"] == "create_action"

    def test_stores_user_and_assistant_messages(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "Antwort"},
            {"type": "done", "text": "Antwort"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        # Capture the conversation_id by patching get_or_create_conversation
        from app.chat import queries as q

        original_get_or_create = q.get_or_create_conversation
        captured_conv_id = {}

        def capturing_get_or_create(*args, **kwargs):
            result = original_get_or_create(*args, **kwargs)
            captured_conv_id["id"] = str(result["conversation_id"])
            return result

        monkeypatch.setattr("app.chat.routes.get_or_create_conversation", capturing_get_or_create)

        auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-persist"},
        )

        conv_id = captured_conv_id["id"]
        msgs = get_conversation_messages(conv_id)
        assert len(msgs) == 2
        assert msgs[0]["role"] == "user"
        assert msgs[0]["content"] == "Hallo"
        assert msgs[1]["role"] == "assistant"
        assert msgs[1]["content"] == "Antwort"

    def test_multi_turn_sends_history_to_agents(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        captured_payloads: list[dict] = []

        def capturing_stream(*args, **kwargs):
            payload = kwargs.get("json") or (args[1] if len(args) > 1 else {})
            if isinstance(payload, str):
                payload = json.loads(payload)
            captured_payloads.append(payload)
            return _make_stream_response(
                [
                    {"type": "text_delta", "content": "ok"},
                    {"type": "done", "text": "ok"},
                ]
            )(*args, **kwargs)

        monkeypatch.setattr("app.chat.routes.httpx.stream", capturing_stream)

        conv_id = "conv-multi-turn"

        # First message
        auth_client.post(
            "/chat/completions",
            json={"message": "Erste Nachricht", "conversationId": conv_id},
        )

        # Second message
        auth_client.post(
            "/chat/completions",
            json={"message": "Zweite Nachricht", "conversationId": conv_id},
        )

        # Second call should include history from first turn
        assert len(captured_payloads) == 2
        second_payload = captured_payloads[1]
        messages = second_payload["messages"]

        # Should have: user1, assistant1, user2
        assert len(messages) == 3
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Erste Nachricht"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "ok"
        assert messages[2]["role"] == "user"
        assert messages[2]["content"] == "Zweite Nachricht"

    def test_forwards_user_llm_config_to_agents(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        from app.routes.agent_settings import UserLlmConfig

        monkeypatch.setattr(
            "app.chat.routes.get_user_llm_config",
            lambda _user_id: UserLlmConfig(
                provider="openrouter",
                model="google/gemini-3-flash-preview",
                api_key="or-key-user",
            ),
        )

        captured_payloads: list[dict] = []

        def capturing_stream(*args, **kwargs):
            payload = kwargs.get("json") or (args[1] if len(args) > 1 else {})
            if isinstance(payload, str):
                payload = json.loads(payload)
            captured_payloads.append(payload)
            return _make_stream_response(
                [
                    {"type": "text_delta", "content": "ok"},
                    {"type": "done", "text": "ok"},
                ]
            )(*args, **kwargs)

        monkeypatch.setattr("app.chat.routes.httpx.stream", capturing_stream)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-llm-payload"},
        )
        assert response.status_code == 200
        assert len(captured_payloads) == 1
        assert captured_payloads[0]["llm"] == {
            "provider": "openrouter",
            "model": "google/gemini-3-flash-preview",
            "apiKey": "or-key-user",
        }

    def test_returns_error_for_anthropic_key_on_copilot(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        from app.routes.agent_settings import UserLlmConfig

        monkeypatch.setattr(
            "app.chat.routes.get_user_llm_config",
            lambda _user_id: UserLlmConfig(
                provider="anthropic",
                model="claude-sonnet-4-5-20250929",
                api_key="ant-key",
            ),
        )

        called = {"stream": False}

        def _unexpected_stream(*args, **kwargs):
            called["stream"] = True
            return _make_stream_response([])(*args, **kwargs)

        monkeypatch.setattr("app.chat.routes.httpx.stream", _unexpected_stream)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-anthropic-copilot"},
        )

        assert response.status_code == 200
        assert called["stream"] is False
        parsed = _parse_ndjson(response)
        assert parsed[0]["type"] == "error"
        assert "openrouter" in parsed[0]["detail"].lower()

    def test_streams_error_when_agents_down(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        @contextmanager
        def _raise_connection(*args, **kwargs):
            raise httpx.ConnectError("Connection refused")
            yield  # required for @contextmanager generator syntax

        monkeypatch.setattr("app.chat.routes.httpx.stream", _raise_connection)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-down"},
        )
        assert response.status_code == 200  # StreamingResponse always starts 200

        parsed = _parse_ndjson(response)
        error_events = [e for e in parsed if e["type"] == "error"]
        assert len(error_events) == 1
        assert "unreachable" in error_events[0]["detail"].lower()

    def test_streams_error_when_agents_timeout(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        @contextmanager
        def _raise_timeout(*args, **kwargs):
            raise httpx.ReadTimeout("Read timed out")
            yield  # required for @contextmanager generator syntax

        monkeypatch.setattr("app.chat.routes.httpx.stream", _raise_timeout)

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-timeout"},
        )
        parsed = _parse_ndjson(response)
        error_events = [e for e in parsed if e["type"] == "error"]
        assert len(error_events) == 1
        assert "timeout" in error_events[0]["detail"].lower()


# ---------------------------------------------------------------------------
# Execute tool proxy
# ---------------------------------------------------------------------------

# Request with copilot_cli tool (forwarded to agents service)
_CLI_EXECUTE_REQUEST = {
    "toolCall": {
        "name": "copilot_cli",
        "arguments": {"argv": ["items", "create", "--type", "Action", "--name", "Einkaufen"]},
    },
    "conversationId": "conv-42",
}

# Request with semantic tool name (handled locally by backend)
_SEMANTIC_EXECUTE_REQUEST = {
    "toolCall": {"name": "create_action", "arguments": {"name": "Einkaufen", "bucket": "next"}},
    "conversationId": "conv-42",
}

_DUMMY_EXECUTE_REQUEST = httpx.Request("POST", "http://localhost:8002/execute-tool")


class TestExecuteTool:
    def test_returns_401_without_auth(self, client):
        response = client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 401

    def test_returns_503_when_agents_not_configured_for_cli_tools(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url=None)
        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 503

    def test_proxies_cli_tool_to_agents(self, auth_client, monkeypatch):
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

        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 200
        body = response.json()
        assert len(body["createdItems"]) == 1
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:a1"

    def test_forwards_auth_context_for_cli_tool(self, auth_client, monkeypatch):
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

        auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)

        payload = captured_kwargs["json"]
        assert "auth" in payload
        # Delegated JWT token (not session cookie)
        assert isinstance(payload["auth"]["token"], str)
        assert len(payload["auth"]["token"]) > 20  # JWT is a long string
        # Org ID from the user's org
        assert payload["auth"]["orgId"] is not None
        # Old session fields should NOT be present
        assert "sessionToken" not in payload["auth"]
        assert "sessionCookieName" not in payload["auth"]
        assert "clientIp" not in payload["auth"]

    def test_returns_502_when_agents_down(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise(*args, **kwargs):
            raise httpx.ConnectError("Connection refused")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise)

        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 502

    def test_returns_504_when_agents_timeout(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        def _raise(*args, **kwargs):
            raise httpx.ReadTimeout("Read timed out")

        monkeypatch.setattr("app.chat.routes.httpx.post", _raise)

        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 504

    def test_semantic_tool_handled_locally(self, auth_client, monkeypatch):
        """Semantic tool names (create_action, etc.) are handled by the backend
        without forwarding to the agents service."""
        from unittest.mock import AsyncMock

        from app.chat.tool_executor import CreatedItemRef

        mock_execute = AsyncMock(
            return_value=[
                CreatedItemRef(
                    canonical_id="urn:app:action:local1",
                    name="Einkaufen",
                    item_type="action",
                )
            ]
        )
        monkeypatch.setattr("app.chat.routes.local_execute_tool", mock_execute, raising=False)

        response = auth_client.post("/chat/execute-tool", json=_SEMANTIC_EXECUTE_REQUEST)
        assert response.status_code == 200
        body = response.json()
        assert len(body["createdItems"]) == 1
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:local1"

    def test_semantic_tool_works_without_agents_url(self, auth_client, monkeypatch):
        """Semantic tools don't need agents service — they should work even
        when AGENTS_URL is not configured."""
        from unittest.mock import AsyncMock

        from app.chat.tool_executor import CreatedItemRef

        _patch_settings(monkeypatch, agents_url=None)
        mock_execute = AsyncMock(
            return_value=[
                CreatedItemRef(
                    canonical_id="urn:app:action:local2",
                    name="Einkaufen",
                    item_type="action",
                )
            ]
        )
        monkeypatch.setattr("app.chat.routes.local_execute_tool", mock_execute, raising=False)

        response = auth_client.post("/chat/execute-tool", json=_SEMANTIC_EXECUTE_REQUEST)
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Conversation management
# ---------------------------------------------------------------------------


class TestListConversations:
    def test_returns_401_without_auth(self, client):
        response = client.get("/chat/conversations")
        assert response.status_code == 401

    def test_returns_empty_list_initially(self, auth_client):
        response = auth_client.get("/chat/conversations")
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_conversations_after_chat(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "Hallo"},
            {"type": "done", "text": "Hallo"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        auth_client.post(
            "/chat/completions",
            json={"message": "Test", "conversationId": "conv-list-1"},
        )

        response = auth_client.get("/chat/conversations")
        assert response.status_code == 200
        conversations = response.json()
        assert len(conversations) >= 1

        conv = next(c for c in conversations if c["externalId"] == "conv-list-1")
        assert conv["agentBackend"] == "haystack"
        assert "conversationId" in conv


class TestGetConversationMessages:
    def test_returns_401_without_auth(self, client):
        response = client.get("/chat/conversations/fake-id/messages")
        assert response.status_code == 401

    def test_returns_messages_for_conversation(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "Antwort"},
            {"type": "done", "text": "Antwort"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        # Create a conversation via chat
        auth_client.post(
            "/chat/completions",
            json={"message": "Frage", "conversationId": "conv-msgs-1"},
        )

        # Get conversation ID from list
        response = auth_client.get("/chat/conversations")
        conversations = response.json()
        conv = next(c for c in conversations if c["externalId"] == "conv-msgs-1")

        # Fetch messages
        response = auth_client.get(f"/chat/conversations/{conv['conversationId']}/messages")
        assert response.status_code == 200
        messages = response.json()
        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Frage"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "Antwort"


class TestArchiveConversation:
    def test_returns_401_without_auth(self, client):
        response = client.patch("/chat/conversations/fake-id/archive")
        assert response.status_code == 401

    def test_returns_404_for_nonexistent_conversation(self, auth_client):
        response = auth_client.patch(
            "/chat/conversations/00000000-0000-0000-0000-000000000000/archive"
        )
        assert response.status_code == 404

    def test_archives_conversation(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        events = [
            {"type": "text_delta", "content": "ok"},
            {"type": "done", "text": "ok"},
        ]
        monkeypatch.setattr("app.chat.routes.httpx.stream", _make_stream_response(events))

        # Create a conversation
        auth_client.post(
            "/chat/completions",
            json={"message": "Test", "conversationId": "conv-archive-1"},
        )

        # Get conversation ID
        response = auth_client.get("/chat/conversations")
        conversations = response.json()
        conv = next(c for c in conversations if c["externalId"] == "conv-archive-1")

        # Archive it
        response = auth_client.patch(f"/chat/conversations/{conv['conversationId']}/archive")
        assert response.status_code == 204

        # Should no longer appear in list
        response = auth_client.get("/chat/conversations")
        conversations = response.json()
        archived = [c for c in conversations if c["externalId"] == "conv-archive-1"]
        assert len(archived) == 0
