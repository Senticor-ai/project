"""Tests for the agents FastAPI app.

Mocks the Haystack Agent so we can test the HTTP layer
without calling any real LLM.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from haystack.dataclasses import ChatMessage, ToolCall


@pytest.fixture()
def client():
    from app import app

    return TestClient(app)


def _msgs(text: str) -> list[dict]:
    """Build a single-user-message payload for the API."""
    return [{"role": "user", "content": text}]


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
            json={"messages": _msgs("Hallo"), "conversationId": "conv-1"},
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
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "create",
                    "--type",
                    "Action",
                    "--name",
                    "E-Mail beantworten",
                    "--bucket",
                    "next",
                    "--apply",
                ]
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
            json={"messages": _msgs("Ich muss eine Mail beantworten"), "conversationId": "conv-2"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Hier ist mein Vorschlag:"
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    assert tc["arguments"]["argv"][0] == "items"
    assert "E-Mail beantworten" in tc["arguments"]["argv"]


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
            json={"messages": _msgs("Hilfe"), "conversationId": "conv-3"},
        )

    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "LLM timeout" in body["detail"]


# ---------------------------------------------------------------------------
# Model fallback
# ---------------------------------------------------------------------------


class TestFindAssistantMessage:
    """Test _find_assistant_message extracts the right message from agent results."""

    def test_text_reply_returned_directly(self):
        """Pure text reply — last_message is already the assistant message."""
        from app import _find_assistant_message

        reply = ChatMessage.from_assistant("Hallo!")
        result = {"last_message": reply, "messages": [reply]}

        assert _find_assistant_message(result) is reply

    def test_tool_exit_returns_assistant_with_tool_calls(self):
        """Tool exit condition — last_message is tool result, but assistant msg has tool_calls."""
        from app import _find_assistant_message

        # Simulate Haystack Agent result when exiting on tool name
        assistant_msg = ChatMessage.from_assistant(
            "Hier mein Vorschlag:",
            tool_calls=[
                ToolCall(
                    tool_name="copilot_cli",
                    arguments={"argv": ["items", "create", "--type", "Action", "--name", "Test"]},
                ),
            ],
        )
        tool_result_msg = ChatMessage.from_tool(
            tool_result='{"name": "Test", "bucket": "next"}',
            origin=assistant_msg.tool_calls[0],
        )

        result = {
            "last_message": tool_result_msg,
            "messages": [assistant_msg, tool_result_msg],
        }

        found = _find_assistant_message(result)
        assert found is assistant_msg
        assert found.tool_calls is not None
        assert found.tool_calls[0].tool_name == "copilot_cli"

    def test_text_exit_ignores_inline_read_tools(self):
        """Agent exits on text after using inline read tools — must NOT return the read tool's message."""
        from app import _find_assistant_message

        # Simulate: agent called list_workspace_overview (inline), then replied with text
        inline_tool_msg = ChatMessage.from_assistant(
            "",
            tool_calls=[
                ToolCall(
                    tool_name="list_workspace_overview",
                    arguments={},
                ),
            ],
        )
        inline_tool_result = ChatMessage.from_tool(
            tool_result='{"projects": []}',
            origin=inline_tool_msg.tool_calls[0],
        )
        text_reply = ChatMessage.from_assistant("Hier ist deine Workspace-Übersicht.")

        result = {
            "last_message": text_reply,
            "messages": [inline_tool_msg, inline_tool_result, text_reply],
        }

        found = _find_assistant_message(result)
        # Must return the text reply, NOT the inline_tool_msg
        assert found is text_reply
        assert not found.tool_calls  # empty list, not the inline read tool

    def test_fallback_when_no_messages(self):
        """No messages list — falls back to last_message."""
        from app import _find_assistant_message

        reply = ChatMessage.from_assistant("Fallback")
        result = {"last_message": reply}

        assert _find_assistant_message(result) is reply


class TestModelFallback:
    """Test that run_agent tries multiple models when earlier ones fail."""

    @pytest.mark.anyio
    async def test_fallback_to_second_model(self):
        """First model fails, second succeeds."""
        from app import MessagePayload, run_agent

        reply = ChatMessage.from_assistant("Erfolg!")
        call_count = 0

        async def _mock_run_async(messages, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("Model unavailable")
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _mock_run_async

        with (
            patch("app.MODELS", ["model-a", "model-b"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            result = await run_agent([MessagePayload(role="user", content="Hallo")])

        assert result.text == "Erfolg!"
        assert call_count == 2

    @pytest.mark.anyio
    async def test_all_models_fail(self):
        """All models fail — raises RuntimeError."""
        from app import MessagePayload, run_agent

        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(side_effect=RuntimeError("Kaputt"))

        with (
            patch("app.MODELS", ["model-a", "model-b"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            with pytest.raises(RuntimeError, match="All 2 models failed"):
                await run_agent([MessagePayload(role="user", content="Hallo")])

    @pytest.mark.anyio
    async def test_first_model_succeeds_no_fallback(self):
        """First model works — no fallback needed."""
        from app import MessagePayload, run_agent

        reply = ChatMessage.from_assistant("Sofort!")

        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(
            return_value={"last_message": reply, "messages": [reply]},
        )
        create_agent_mock = patch("app.create_agent", return_value=mock_agent)

        with patch("app.MODELS", ["model-a", "model-b"]), create_agent_mock as ca_mock:
            result = await run_agent([MessagePayload(role="user", content="Hallo")])

        assert result.text == "Sofort!"
        # create_agent called only once (for model-a)
        ca_mock.assert_called_once_with(
            "model-a",
            auth=None,
            user_context=None,
            trace_context=None,
        )

    @pytest.mark.anyio
    async def test_passes_runtime_llm_config_to_create_agent(self):
        """Per-request LLM config is forwarded to create_agent."""
        from app import MessagePayload, run_agent
        from copilot import RuntimeLlmConfig

        reply = ChatMessage.from_assistant("Konfiguriert!")
        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(
            return_value={"last_message": reply, "messages": [reply]},
        )

        llm_config = RuntimeLlmConfig(
            provider="openai",
            api_key="oa-key-user",
            model="gpt-4o-mini",
        )

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent) as create_agent_mock,
        ):
            result = await run_agent(
                [MessagePayload(role="user", content="Hallo")],
                llm_config=llm_config,
            )

        assert result.text == "Konfiguriert!"
        assert create_agent_mock.call_count == 1
        kwargs = create_agent_mock.call_args.kwargs
        assert kwargs["llm_config"] == llm_config

    @pytest.mark.anyio
    async def test_tool_exit_extracts_assistant_message(self):
        """Agent exits on tool name — run_agent returns assistant msg, not tool result."""
        from app import MessagePayload, run_agent

        assistant_msg = ChatMessage.from_assistant(
            "Hier ist dein Projekt:",
            tool_calls=[
                ToolCall(
                    tool_name="copilot_cli",
                    arguments={
                        "argv": [
                            "items",
                            "create",
                            "--type",
                            "Project",
                            "--name",
                            "Test",
                            "--description",
                            "Projekt",
                            "--apply",
                        ]
                    },
                ),
            ],
        )
        tool_result = ChatMessage.from_tool(
            tool_result="{}",
            origin=assistant_msg.tool_calls[0],
        )

        mock_agent = AsyncMock()
        mock_agent.run_async = AsyncMock(
            return_value={
                "last_message": tool_result,
                "messages": [assistant_msg, tool_result],
            },
        )

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            result = await run_agent([MessagePayload(role="user", content="Erstelle ein Projekt")])

        assert result.tool_calls is not None
        assert result.tool_calls[0].tool_name == "copilot_cli"
        assert result.text == "Hier ist dein Projekt:"


# ---------------------------------------------------------------------------
# Multi-turn conversation
# ---------------------------------------------------------------------------


class TestMultiTurn:
    """Test that conversation history is passed to the Haystack Agent."""

    @pytest.mark.anyio
    async def test_multi_turn_messages_passed_to_agent(self):
        """Agent receives full conversation history."""
        from app import MessagePayload, run_agent

        reply = ChatMessage.from_assistant("Klar, hier sind die Details.")
        captured_messages: list = []

        async def _capture_run_async(messages, **kwargs):
            captured_messages.extend(messages)
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _capture_run_async

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            result = await run_agent(
                [
                    MessagePayload(role="user", content="Erstelle ein Projekt für Steuererklärung"),
                    MessagePayload(role="assistant", content="Ich habe ein Projekt erstellt."),
                    MessagePayload(role="user", content="Füge noch eine Aktion hinzu"),
                ]
            )

        assert result.text == "Klar, hier sind die Details."
        # Agent should have received 3 Haystack ChatMessages
        assert len(captured_messages) == 3
        assert captured_messages[0].text == "Erstelle ein Projekt für Steuererklärung"
        assert captured_messages[1].text == "Ich habe ein Projekt erstellt."
        assert captured_messages[2].text == "Füge noch eine Aktion hinzu"

    @pytest.mark.anyio
    async def test_assistant_tool_calls_in_history(self):
        """Assistant messages with tool_calls are reconstructed properly."""
        from app import MessagePayload, run_agent

        reply = ChatMessage.from_assistant("Erledigt!")
        captured_messages: list = []

        async def _capture_run_async(messages, **kwargs):
            captured_messages.extend(messages)
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _capture_run_async

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            from app import ChatToolCallResponse

            await run_agent(
                [
                    MessagePayload(role="user", content="Erstelle eine Aktion"),
                    MessagePayload(
                        role="assistant",
                        content="Hier mein Vorschlag:",
                        toolCalls=[
                            ChatToolCallResponse(
                                id="call_abc123",
                                name="copilot_cli",
                                arguments={
                                    "argv": [
                                        "items",
                                        "create",
                                        "--type",
                                        "Action",
                                        "--name",
                                        "Test",
                                    ]
                                },
                            )
                        ],
                    ),
                    MessagePayload(role="user", content="Noch eine bitte"),
                ]
            )

        assert len(captured_messages) == 3
        assistant_msg = captured_messages[1]
        assert assistant_msg.tool_calls is not None
        assert assistant_msg.tool_calls[0].tool_name == "copilot_cli"
        # ToolCall must preserve the original id (required by OpenAI API format)
        assert assistant_msg.tool_calls[0].id == "call_abc123"

    @pytest.mark.anyio
    async def test_tool_calls_without_id_get_synthetic_id(self):
        """Tool calls from old history (no id) get a synthetic id for OpenAI compat."""
        from app import MessagePayload, run_agent

        reply = ChatMessage.from_assistant("OK!")
        captured_messages: list = []

        async def _capture_run_async(messages, **kwargs):
            captured_messages.extend(messages)
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _capture_run_async

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            from app import ChatToolCallResponse

            await run_agent(
                [
                    MessagePayload(role="user", content="Erstelle eine Aktion"),
                    MessagePayload(
                        role="assistant",
                        content="Hier:",
                        toolCalls=[
                            ChatToolCallResponse(
                                # No id — simulates old DB records
                                name="copilot_cli",
                                arguments={
                                    "argv": [
                                        "items",
                                        "create",
                                        "--type",
                                        "Action",
                                        "--name",
                                        "Test",
                                    ]
                                },
                            )
                        ],
                    ),
                    MessagePayload(role="user", content="Danke, noch eine"),
                ]
            )

        assistant_msg = captured_messages[1]
        assert assistant_msg.tool_calls is not None
        # Should have a synthetic fallback id, not None
        assert assistant_msg.tool_calls[0].id is not None
        assert assistant_msg.tool_calls[0].id == "call_history_0"


# ---------------------------------------------------------------------------
# Streaming endpoint
# ---------------------------------------------------------------------------


class TestStreaming:
    """Test the streaming (NDJSON) response path."""

    def test_streaming_text_response(self, client: TestClient):
        """Streaming returns NDJSON events ending with done."""
        reply = ChatMessage.from_assistant("Hallo Welt!")

        async def _mock_run_async(messages, streaming_callback=None, **kwargs):
            # Simulate streaming by calling the callback
            if streaming_callback:
                from haystack.dataclasses import StreamingChunk

                await streaming_callback(StreamingChunk(content="Hallo "))
                await streaming_callback(StreamingChunk(content="Welt!"))
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _mock_run_async

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-stream",
                    "stream": True,
                },
            )

        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/x-ndjson")

        lines = [line for line in resp.text.strip().split("\n") if line]
        events = [json.loads(line) for line in lines]

        # Should have text_delta events and a done event
        text_deltas = [e for e in events if e["type"] == "text_delta"]
        assert len(text_deltas) >= 1

        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1

    def test_streaming_with_tool_calls(self, client: TestClient):
        """Streaming emits tool_calls event after text."""
        tool_calls = [
            ToolCall(
                tool_name="copilot_cli",
                arguments={"argv": ["items", "create", "--type", "Action", "--name", "Test"]},
            ),
        ]
        reply = ChatMessage.from_assistant("Hier:", tool_calls=tool_calls)

        async def _mock_run_async(messages, streaming_callback=None, **kwargs):
            if streaming_callback:
                from haystack.dataclasses import StreamingChunk

                await streaming_callback(StreamingChunk(content="Hier:"))
            return {"last_message": reply, "messages": [reply]}

        mock_agent = AsyncMock()
        mock_agent.run_async = _mock_run_async

        with (
            patch("app.MODELS", ["model-a"]),
            patch("app.create_agent", return_value=mock_agent),
        ):
            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Erstelle"),
                    "conversationId": "conv-stream-tools",
                    "stream": True,
                },
            )

        events = [json.loads(line) for line in resp.text.strip().split("\n") if line]
        tool_events = [e for e in events if e["type"] == "tool_calls"]
        assert len(tool_events) == 1
        assert tool_events[0]["toolCalls"][0]["name"] == "copilot_cli"

    def test_non_streaming_default(self, client: TestClient):
        """Without stream=True, returns normal JSON response."""
        reply = ChatMessage.from_assistant("Normal response")

        with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
            resp = client.post(
                "/chat/completions",
                json={"messages": _msgs("Hallo"), "conversationId": "conv-no-stream"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["text"] == "Normal response"


# ---------------------------------------------------------------------------
# Execute tool endpoint
# ---------------------------------------------------------------------------


class TestExecuteTool:
    """Test POST /execute-tool endpoint."""

    def _make_request(self, tool_name="copilot_cli", arguments=None):
        return {
            "toolCall": {
                "name": tool_name,
                "arguments": arguments
                or {
                    "argv": [
                        "items",
                        "create",
                        "--type",
                        "Action",
                        "--name",
                        "Einkaufen",
                        "--bucket",
                        "next",
                        "--apply",
                    ]
                },
            },
            "conversationId": "conv-42",
            "auth": {
                "token": "jwt-delegated-tok",
                "orgId": "org-1",
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

    def test_multiple_created_items(self, client: TestClient):
        from backend_client import CreatedItemRef

        mock_result = [
            CreatedItemRef("urn:app:project:p1", "Umzug", "project"),
            CreatedItemRef("urn:app:action:a1", "Kartons", "action"),
            CreatedItemRef("urn:app:reference:r1", "Checkliste", "reference"),
        ]

        with patch("app.execute_tool", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(
                "/execute-tool",
                json=self._make_request("copilot_cli", {"argv": ["projects", "list", "--json"]}),
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


# ---------------------------------------------------------------------------
# User context integration — verifies context flows through to create_agent
# ---------------------------------------------------------------------------


class TestUserContextIntegration:
    """Verify that userContext from the request reaches create_agent and the system prompt."""

    USER_CONTEXT = {
        "username": "Wolfgang",
        "email": "wolf@example.com",
        "timezone": "Europe/Berlin",
        "locale": "de-DE",
        "localTime": "2026-02-13T15:30:00+01:00",
    }

    def test_user_context_passed_to_create_agent(self, client: TestClient):
        """userContext from request payload reaches create_agent."""
        reply = ChatMessage.from_assistant("Hallo Wolfgang!")

        with patch("app.create_agent") as ca_mock:
            mock_agent = AsyncMock()
            mock_agent.run_async = AsyncMock(
                return_value={"last_message": reply, "messages": [reply]},
            )
            ca_mock.return_value = mock_agent

            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-ctx-1",
                    "userContext": self.USER_CONTEXT,
                },
            )

        assert resp.status_code == 200
        ca_mock.assert_called_once()
        _, kwargs = ca_mock.call_args
        ctx = kwargs["user_context"]
        for key, value in self.USER_CONTEXT.items():
            assert ctx[key] == value

    def test_user_context_rendered_in_system_prompt(self, client: TestClient):
        """userContext ends up in the rendered system prompt passed to the Agent."""
        from copilot import build_system_prompt

        prompt = build_system_prompt(self.USER_CONTEXT)

        assert "Wolfgang" in prompt
        assert "Europe/Berlin" in prompt
        assert "de-DE" in prompt
        assert "2026-02-13T15:30:00+01:00" in prompt
        # System time is always present
        assert "Systemzeit (UTC)" in prompt

    def test_missing_user_context_graceful(self, client: TestClient):
        """Request without userContext works — create_agent gets None."""
        reply = ChatMessage.from_assistant("Hallo!")

        with patch("app.create_agent") as ca_mock:
            mock_agent = AsyncMock()
            mock_agent.run_async = AsyncMock(
                return_value={"last_message": reply, "messages": [reply]},
            )
            ca_mock.return_value = mock_agent

            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-ctx-2",
                },
            )

        assert resp.status_code == 200
        _, kwargs = ca_mock.call_args
        assert kwargs["user_context"] is None

    def test_partial_user_context(self, client: TestClient):
        """Partial userContext (only some fields) still works."""
        reply = ChatMessage.from_assistant("Hallo!")
        partial_ctx = {"username": "Wolfgang", "timezone": "Europe/Berlin"}

        with patch("app.create_agent") as ca_mock:
            mock_agent = AsyncMock()
            mock_agent.run_async = AsyncMock(
                return_value={"last_message": reply, "messages": [reply]},
            )
            ca_mock.return_value = mock_agent

            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-ctx-3",
                    "userContext": partial_ctx,
                },
            )

        assert resp.status_code == 200
        _, kwargs = ca_mock.call_args
        ctx = kwargs["user_context"]
        assert ctx["username"] == "Wolfgang"
        assert ctx["timezone"] == "Europe/Berlin"
        # Missing fields default to None
        assert ctx["email"] is None
        assert ctx["locale"] is None

    def test_partial_context_in_prompt(self):
        """Partial context renders only populated fields in prompt."""
        from copilot import build_system_prompt

        prompt = build_system_prompt({"username": "Wolfgang"})
        assert "Wolfgang" in prompt
        # Fields not provided should not appear
        assert "Europe/Berlin" not in prompt
        assert "Sprache/Region" not in prompt

    def test_streaming_with_user_context(self, client: TestClient):
        """userContext flows through to the streaming path too."""
        reply = ChatMessage.from_assistant("Streaming!")

        async def _mock_run_async(messages, streaming_callback=None, **kwargs):
            if streaming_callback:
                from haystack.dataclasses import StreamingChunk

                await streaming_callback(StreamingChunk(content="Streaming!"))
            return {"last_message": reply, "messages": [reply]}

        with patch("app.create_agent") as ca_mock:
            mock_agent = AsyncMock()
            mock_agent.run_async = _mock_run_async
            ca_mock.return_value = mock_agent

            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-ctx-stream",
                    "stream": True,
                    "userContext": self.USER_CONTEXT,
                },
            )

        assert resp.status_code == 200
        ca_mock.assert_called_once()
        _, kwargs = ca_mock.call_args
        ctx = kwargs["user_context"]
        for key, value in self.USER_CONTEXT.items():
            assert ctx[key] == value

    def test_trace_context_passed_to_create_agent(self, client: TestClient):
        """traceContext from request payload reaches create_agent."""
        reply = ChatMessage.from_assistant("Hallo!")

        with patch("app.create_agent") as ca_mock:
            mock_agent = AsyncMock()
            mock_agent.run_async = AsyncMock(
                return_value={"last_message": reply, "messages": [reply]},
            )
            ca_mock.return_value = mock_agent

            resp = client.post(
                "/chat/completions",
                json={
                    "messages": _msgs("Hallo"),
                    "conversationId": "conv-trace-1",
                    "traceContext": {
                        "externalConversationId": "conv-trace-1",
                        "dbConversationId": "db-conv-1",
                        "userId": "user-1",
                        "orgId": "org-1",
                        "sessionId": "session-1",
                        "requestId": "req-1",
                        "trailId": "trail-1",
                    },
                },
            )

        assert resp.status_code == 200
        _, kwargs = ca_mock.call_args
        trace_ctx = kwargs["trace_context"]
        assert trace_ctx["sessionId"] == "session-1"
        assert trace_ctx["dbConversationId"] == "db-conv-1"
