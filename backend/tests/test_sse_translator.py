"""Tests for SSE-to-NDJSON translator."""

from __future__ import annotations

import json

import pytest

from app.chat.sse_translator import SseToNdjsonTranslator

pytestmark = pytest.mark.unit


def _sse(data: dict | str) -> str:
    """Build an SSE data line from a dict or raw string."""
    if isinstance(data, str):
        return f"data: {data}"
    return f"data: {json.dumps(data)}"


def _chunk(delta: dict, finish_reason: str | None = None) -> dict:
    """Build a minimal OpenAI SSE chunk."""
    choice: dict = {"index": 0, "delta": delta}
    if finish_reason:
        choice["finish_reason"] = finish_reason
    return {"choices": [choice]}


class TestTextStreaming:
    def test_text_delta_events(self):
        t = SseToNdjsonTranslator()
        events = t.feed(_sse(_chunk({"content": "Hallo "})))
        assert events == [{"type": "text_delta", "content": "Hallo "}]

        events = t.feed(_sse(_chunk({"content": "Welt!"})))
        assert events == [{"type": "text_delta", "content": "Welt!"}]

        assert t.full_text == "Hallo Welt!"

    def test_done_event_carries_full_text(self):
        t = SseToNdjsonTranslator()
        t.feed(_sse(_chunk({"content": "Hi"})))
        events = t.feed("data: [DONE]")
        assert events == [{"type": "done", "text": "Hi"}]

    def test_empty_stream(self):
        t = SseToNdjsonTranslator()
        events = t.feed("data: [DONE]")
        assert events == [{"type": "done", "text": ""}]


class TestToolCallStreaming:
    def test_single_tool_call_assembled(self):
        t = SseToNdjsonTranslator()

        # First chunk: tool call id + name
        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "function": {"name": "create_action", "arguments": ""},
                            }
                        ]
                    }
                )
            )
        )

        # Argument chunks (streamed token-by-token)
        args_parts = ['{"name":', '"Einkaufen",', '"bucket":"next"}']
        for part in args_parts:
            t.feed(_sse(_chunk({"tool_calls": [{"index": 0, "function": {"arguments": part}}]})))

        # Finish
        events = t.feed(_sse(_chunk({}, finish_reason="tool_calls")))

        assert len(events) == 1
        assert events[0]["type"] == "tool_calls"
        tool_calls = events[0]["toolCalls"]
        assert len(tool_calls) == 1
        assert tool_calls[0]["name"] == "create_action"
        assert tool_calls[0]["arguments"] == {"name": "Einkaufen", "bucket": "next"}

        # Also stored on translator
        assert t.tool_calls == tool_calls

    def test_multiple_tool_calls(self):
        t = SseToNdjsonTranslator()

        # Two tool calls in parallel (different indices)
        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "function": {"name": "create_action", "arguments": ""},
                            },
                            {
                                "index": 1,
                                "id": "call_2",
                                "function": {
                                    "name": "create_reference",
                                    "arguments": "",
                                },
                            },
                        ]
                    }
                )
            )
        )

        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {
                                    "arguments": json.dumps({"name": "Task 1", "bucket": "next"})
                                },
                            }
                        ]
                    }
                )
            )
        )

        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 1,
                                "function": {"arguments": json.dumps({"name": "Ref 1"})},
                            }
                        ]
                    }
                )
            )
        )

        events = t.feed(_sse(_chunk({}, finish_reason="tool_calls")))

        assert len(events) == 1
        tool_calls = events[0]["toolCalls"]
        assert len(tool_calls) == 2
        assert tool_calls[0]["name"] == "create_action"
        assert tool_calls[0]["arguments"]["name"] == "Task 1"
        assert tool_calls[1]["name"] == "create_reference"
        assert tool_calls[1]["arguments"]["name"] == "Ref 1"

    def test_text_then_tool_calls(self):
        """Text content followed by tool calls in the same response."""
        t = SseToNdjsonTranslator()

        text_events = t.feed(_sse(_chunk({"content": "Ich erstelle das."})))
        assert text_events == [{"type": "text_delta", "content": "Ich erstelle das."}]

        args = json.dumps({"name": "Test", "bucket": "next"})
        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "c1",
                                "function": {
                                    "name": "create_action",
                                    "arguments": args,
                                },
                            }
                        ]
                    }
                )
            )
        )

        events = t.feed(_sse(_chunk({}, finish_reason="tool_calls")))
        assert events[0]["type"] == "tool_calls"
        assert t.full_text == "Ich erstelle das."


class TestEdgeCases:
    def test_blank_lines_ignored(self):
        t = SseToNdjsonTranslator()
        assert t.feed("") == []
        assert t.feed("   ") == []

    def test_comments_ignored(self):
        t = SseToNdjsonTranslator()
        assert t.feed(": keep-alive") == []

    def test_non_data_lines_ignored(self):
        t = SseToNdjsonTranslator()
        assert t.feed("event: message") == []
        assert t.feed("id: 123") == []

    def test_malformed_json_ignored(self):
        t = SseToNdjsonTranslator()
        assert t.feed("data: {not valid json}") == []

    def test_no_choices(self):
        t = SseToNdjsonTranslator()
        assert t.feed(_sse({"id": "chatcmpl-1", "object": "chat.completion.chunk"})) == []

    def test_finish_reason_stop_without_tools(self):
        """finish_reason=stop with no tool accumulators should not emit tool_calls."""
        t = SseToNdjsonTranslator()
        t.feed(_sse(_chunk({"content": "Hi"})))
        events = t.feed(_sse(_chunk({}, finish_reason="stop")))
        assert events == []

    def test_malformed_tool_arguments_default_empty(self):
        """If tool arguments can't be parsed as JSON, default to empty dict."""
        t = SseToNdjsonTranslator()
        t.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "c1",
                                "function": {
                                    "name": "test",
                                    "arguments": "not json",
                                },
                            }
                        ]
                    }
                )
            )
        )
        events = t.feed(_sse(_chunk({}, finish_reason="tool_calls")))
        assert events[0]["toolCalls"][0]["arguments"] == {}


class TestFullConversation:
    def test_realistic_sse_stream(self):
        """Simulate a complete realistic SSE stream."""
        t = SseToNdjsonTranslator()
        all_events: list[dict] = []

        # Build SSE lines programmatically
        sse_lines = [
            _sse(_chunk({"role": "assistant", "content": ""})),
            _sse(_chunk({"content": "Klar"})),
            _sse(_chunk({"content": ", ich erstelle das."})),
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_xyz",
                                "type": "function",
                                "function": {
                                    "name": "create_action",
                                    "arguments": "",
                                },
                            }
                        ]
                    }
                )
            ),
            # Streamed argument chunks
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"arguments": '{"name": "Einkaufen gehen",'},
                            }
                        ]
                    }
                )
            ),
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"arguments": ' "type": "create_action",'},
                            }
                        ]
                    }
                )
            ),
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"arguments": ' "bucket": "next"}'},
                            }
                        ]
                    }
                )
            ),
            _sse(_chunk({}, finish_reason="tool_calls")),
            "",
            "data: [DONE]",
        ]

        for line in sse_lines:
            all_events.extend(t.feed(line))

        types = [e["type"] for e in all_events]
        assert types == ["text_delta", "text_delta", "tool_calls", "done"]

        assert t.full_text == "Klar, ich erstelle das."
        assert t.tool_calls is not None
        assert len(t.tool_calls) == 1
        assert t.tool_calls[0]["name"] == "create_action"
        assert t.tool_calls[0]["arguments"]["name"] == "Einkaufen gehen"
        assert t.tool_calls[0]["arguments"]["bucket"] == "next"
