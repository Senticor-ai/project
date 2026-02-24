"""Tests for llm_cache trace context persistence."""

from __future__ import annotations

import json

from haystack.dataclasses import ChatMessage

from llm_cache import _write_trace


def test_write_trace_includes_context(tmp_path, monkeypatch):
    monkeypatch.setattr("llm_cache.TRACES_DIR", tmp_path)

    _write_trace(
        model="openai/gpt-4o-mini",
        messages=[ChatMessage.from_user("Hallo")],
        tools=None,
        response={"replies": [ChatMessage.from_assistant("Hi")]},
        duration_ms=12.3,
        cache_hit=False,
        trace_context={
            "externalConversationId": "conv-1",
            "sessionId": "sess-1",
            "userId": "user-1",
        },
    )

    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text())
    assert payload["context"]["externalConversationId"] == "conv-1"
    assert payload["context"]["sessionId"] == "sess-1"
    assert payload["context"]["userId"] == "user-1"
    assert payload.get("error") is None


def test_write_trace_records_error(tmp_path, monkeypatch):
    monkeypatch.setattr("llm_cache.TRACES_DIR", tmp_path)

    _write_trace(
        model="openai/gpt-4o-mini",
        messages=[ChatMessage.from_user("Hallo")],
        tools=None,
        response={"replies": []},
        duration_ms=3.0,
        cache_hit=False,
        trace_context={"externalConversationId": "conv-2"},
        error="upstream timeout",
    )

    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text())
    assert payload["error"] == "upstream timeout"
