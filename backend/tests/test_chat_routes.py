"""Tests for the chat routes (/chat/completions, /chat/execute-tool).

The backend enriches requests with conversation history from the DB
and streams NDJSON responses from the agents service.
"""

from __future__ import annotations

import dataclasses
import json
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock

import httpx

from app.chat.queries import get_conversation_messages
from app.config import settings

_DUMMY_REQUEST = httpx.Request("POST", "http://localhost:8002/chat/completions")


def _patch_settings(monkeypatch, **overrides):
    """Replace module-level settings with a copy that has overrides applied.

    Defaults to haystack backend so existing tests keep hitting the Haystack path.
    """
    overrides.setdefault("default_agent_backend", "haystack")
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.chat.routes.settings", patched)
    monkeypatch.setattr("app.routes.agent_settings.settings", patched)
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

    def test_forwards_extended_ui_context_to_agents(self, auth_client, monkeypatch):
        _patch_settings(
            monkeypatch,
            agents_url="http://localhost:8002",
            agent_require_user_api_key=False,
        )
        monkeypatch.setattr("app.chat.routes.get_user_agent_backend", lambda _user_id: "haystack")

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
            json={
                "message": "Was ist hier los?",
                "conversationId": "conv-ui-context",
                "context": {
                    "timezone": "Europe/Berlin",
                    "locale": "de-DE",
                    "localTime": "2026-02-24T14:00:00+01:00",
                    "currentPath": "/settings/email",
                    "currentUrl": "http://project.localhost:5173/settings/email",
                    "appView": "settings",
                    "appSubView": "email",
                    "activeBucket": None,
                    "visibleErrors": ["OAuth token expired"],
                    "visibleWorkspaceSnapshot": {
                        "activeBucket": "next",
                        "visibleItems": [
                            {
                                "id": "urn:app:action:a1",
                                "type": "Action",
                                "bucket": "next",
                                "name": "Ship release notes",
                                "focused": True,
                            }
                        ],
                    },
                },
            },
        )
        assert response.status_code == 200
        assert len(captured_payloads) == 1
        user_context = captured_payloads[0]["userContext"]
        assert user_context["currentPath"] == "/settings/email"
        assert user_context["appView"] == "settings"
        assert user_context["appSubView"] == "email"
        assert user_context["visibleErrors"] == ["OAuth token expired"]
        assert user_context["visibleWorkspaceSnapshot"]["activeBucket"] == "next"
        assert (
            user_context["visibleWorkspaceSnapshot"]["visibleItems"][0]["name"]
            == "Ship release notes"
        )
        trace_context = captured_payloads[0]["traceContext"]
        assert trace_context["externalConversationId"] == "conv-ui-context"
        assert trace_context["userId"] is not None
        assert trace_context["orgId"] is not None
        assert trace_context["dbConversationId"] is not None

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

    def test_openclaw_streams_starting_detail_when_container_is_booting(
        self, auth_client, monkeypatch
    ):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")
        monkeypatch.setattr("app.chat.routes.get_user_agent_backend", lambda _user_id: "openclaw")
        monkeypatch.setattr(
            "app.chat.routes.ensure_running",
            lambda _user_id: (_ for _ in ()).throw(RuntimeError("still starting")),
        )
        monkeypatch.setattr(
            "app.chat.routes.get_container_status",
            lambda _user_id: {"status": "starting", "error": None},
        )

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-openclaw-starting"},
        )
        assert response.status_code == 200

        parsed = _parse_ndjson(response)
        error_events = [e for e in parsed if e["type"] == "error"]
        assert len(error_events) == 1
        assert "still starting" in error_events[0]["detail"].lower()

    def test_openclaw_streams_status_error_detail_from_container_state(
        self, auth_client, monkeypatch
    ):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")
        monkeypatch.setattr("app.chat.routes.get_user_agent_backend", lambda _user_id: "openclaw")
        monkeypatch.setattr(
            "app.chat.routes.ensure_running",
            lambda _user_id: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        monkeypatch.setattr(
            "app.chat.routes.get_container_status",
            lambda _user_id: {"status": "error", "error": "Health check timeout after 15s"},
        )

        response = auth_client.post(
            "/chat/completions",
            json={"message": "Hallo", "conversationId": "conv-openclaw-error"},
        )
        assert response.status_code == 200

        parsed = _parse_ndjson(response)
        error_events = [e for e in parsed if e["type"] == "error"]
        assert len(error_events) == 1
        assert "health check timeout" in error_events[0]["detail"].lower()


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

    def test_relays_agents_401_for_reauth(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            401,
            json={"detail": "Invalid delegated token"},
            request=_DUMMY_EXECUTE_REQUEST,
        )
        monkeypatch.setattr("app.chat.routes.httpx.post", lambda *a, **kw: mock_response)

        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 401
        assert "Invalid delegated token" in response.json()["detail"]

    def test_relays_agents_structured_401_detail(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            401,
            json={
                "detail": {
                    "message": "Invalid delegated token",
                    "code": "UNAUTHENTICATED",
                    "needsReauth": True,
                }
            },
            request=_DUMMY_EXECUTE_REQUEST,
        )
        monkeypatch.setattr("app.chat.routes.httpx.post", lambda *a, **kw: mock_response)

        response = auth_client.post("/chat/execute-tool", json=_CLI_EXECUTE_REQUEST)
        assert response.status_code == 401
        body = response.json()
        assert body["detail"]["code"] == "UNAUTHENTICATED"
        assert body["detail"]["needsReauth"] is True

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

    def test_cli_triage_handled_locally(self, auth_client, monkeypatch):
        """copilot_cli 'items triage' commands should be handled locally
        without forwarding to the agents service."""
        from unittest.mock import AsyncMock

        _patch_settings(monkeypatch, agents_url=None)  # No agents → would 503 if forwarded

        mock_triage = AsyncMock(
            return_value={
                "item_id": "item-abc",
                "canonical_id": "urn:app:action:abc",
                "schema_jsonld": {"name": "GitHub PR #64", "@type": ["schema:Action"]},
            }
        )
        monkeypatch.setattr("app.chat.routes._patch_item_local", mock_triage)
        monkeypatch.setattr(
            "app.chat.routes._resolve_item_id_for_patch",
            lambda item_id, _org_id: item_id,
        )

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": [
                        "items",
                        "triage",
                        "--id",
                        "01jksnyyypf0vbead2gcr7p80w",
                        "--bucket",
                        "inbox",
                        "--status",
                        "completed",
                        "--apply",
                    ],
                },
            },
            "conversationId": "conv-42",
        }

        response = auth_client.post("/chat/execute-tool", json=request)
        assert response.status_code == 200
        body = response.json()
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:abc"

    def test_cli_triage_works_without_agents_url(self, auth_client, monkeypatch):
        """Triage should work even when agents service is not configured."""
        from unittest.mock import AsyncMock

        _patch_settings(monkeypatch, agents_url=None)

        mock_triage = AsyncMock(
            return_value={
                "item_id": "item-abc",
                "canonical_id": "urn:app:action:abc",
                "schema_jsonld": {"name": "Newsletter", "@type": ["schema:DigitalDocument"]},
            }
        )
        monkeypatch.setattr("app.chat.routes._patch_item_local", mock_triage)
        monkeypatch.setattr(
            "app.chat.routes._resolve_item_id_for_patch",
            lambda item_id, _org_id: item_id,
        )

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": [
                        "items",
                        "triage",
                        "--id",
                        "urn:app:ref:xyz",
                        "--bucket",
                        "inbox",
                        "--status",
                        "completed",
                        "--apply",
                    ],
                },
            },
            "conversationId": "conv-42",
        }

        response = auth_client.post("/chat/execute-tool", json=request)
        assert response.status_code == 200

    def test_cli_triage_positional_id_with_extra_flags_handled_locally(
        self,
        auth_client,
        monkeypatch,
    ):
        """Positional triage ids should be handled locally, ignoring unknown flags."""
        from unittest.mock import AsyncMock

        _patch_settings(monkeypatch, agents_url=None)

        mock_triage = AsyncMock(
            return_value={
                "item_id": "item-xyz",
                "canonical_id": "urn:app:action:xyz",
                "schema_jsonld": {"name": "Inbox Mail", "@type": ["schema:Action"]},
            }
        )
        monkeypatch.setattr("app.chat.routes._patch_item_local", mock_triage)
        monkeypatch.setattr(
            "app.chat.routes._resolve_item_id_for_patch",
            lambda item_id, _org_id: item_id,
        )

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": [
                        "items",
                        "triage",
                        "urn:app:email:fd38b8c6210f5a44",
                        "--bucket",
                        "next",
                        "--name",
                        "ignore me",
                        "--apply",
                    ],
                },
            },
            "conversationId": "conv-42",
        }

        response = auth_client.post("/chat/execute-tool", json=request)
        assert response.status_code == 200
        body = response.json()
        assert body["createdItems"][0]["canonicalId"] == "urn:app:action:xyz"
        called_item_id = mock_triage.await_args.args[0]
        assert called_item_id == "urn:app:email:fd38b8c6210f5a44"

    def test_cli_non_triage_still_forwarded(self, auth_client, monkeypatch):
        """Non-triage copilot_cli commands should still forward to agents."""
        _patch_settings(monkeypatch, agents_url="http://localhost:8002")

        mock_response = httpx.Response(
            200,
            json={"createdItems": []},
            request=_DUMMY_EXECUTE_REQUEST,
        )
        monkeypatch.setattr("app.chat.routes.httpx.post", lambda *a, **kw: mock_response)

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": ["items", "create", "--type", "Action", "--name", "Test"],
                },
            },
            "conversationId": "conv-42",
        }

        response = auth_client.post("/chat/execute-tool", json=request)
        assert response.status_code == 200

    def test_cli_triage_resolves_canonical_id_and_updates_item(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url=None)

        item_payload = {
            "item": {
                "@id": f"urn:app:action:{uuid.uuid4()}",
                "@type": "Action",
                "_schemaVersion": 2,
                "name": "Needs triage",
                "additionalProperty": [
                    {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
                ],
            },
            "source": "manual",
        }
        create_resp = auth_client.post("/items", json=item_payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        item_id = created["item_id"]
        canonical_id = created["canonical_id"]

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": ["items", "triage", "--id", canonical_id, "--bucket", "reference", "--apply"],
                },
            },
            "conversationId": "conv-42",
        }

        triage_resp = auth_client.post("/chat/execute-tool", json=request)
        assert triage_resp.status_code == 200

        item_resp = auth_client.get(f"/items/{item_id}")
        assert item_resp.status_code == 200
        props = {
            p["propertyID"]: p["value"]
            for p in item_resp.json()["item"]["additionalProperty"]
            if isinstance(p, dict) and "propertyID" in p and "value" in p
        }
        assert props["app:bucket"] == "reference"

    def test_cli_triage_missing_item_returns_404_not_500(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, agents_url=None)

        request = {
            "toolCall": {
                "name": "copilot_cli",
                "arguments": {
                    "argv": [
                        "items",
                        "triage",
                        "--id",
                        "urn:app:action:does-not-exist",
                        "--bucket",
                        "reference",
                        "--apply",
                    ]
                },
            },
            "conversationId": "conv-42",
        }

        response = auth_client.post("/chat/execute-tool", json=request)
        assert response.status_code == 404
        assert response.json()["detail"] == "Item not found"


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
