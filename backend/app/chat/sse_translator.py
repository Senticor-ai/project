"""Translate OpenAI-compatible SSE stream to NDJSON events.

OpenClaw's /v1/chat/completions endpoint streams Server-Sent Events
in OpenAI format.  This module translates those into the NDJSON wire
format the frontend expects (text_delta, tool_calls, done, error).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field


@dataclass
class _ToolCallAccumulator:
    """Accumulates streamed fragments for a single tool call."""

    id: str = ""
    name: str = ""
    arguments: str = ""


@dataclass
class SseToNdjsonTranslator:
    """Stateful translator: feed SSE lines, get NDJSON dicts back."""

    full_text: str = ""
    tool_calls: list[dict] | None = None
    _tool_accumulators: dict[int, _ToolCallAccumulator] = field(default_factory=dict)

    def feed(self, line: str) -> list[dict]:
        """Process one SSE line, return zero or more NDJSON event dicts."""
        line = line.strip()
        if not line or line.startswith(":"):
            return []  # comment or blank

        if not line.startswith("data: "):
            return []

        data = line[6:]  # strip "data: " prefix

        if data == "[DONE]":
            return [{"type": "done", "text": self.full_text}]

        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            return []

        events: list[dict] = []
        choices = chunk.get("choices", [])
        if not choices:
            return events

        choice = choices[0]
        delta = choice.get("delta", {})
        finish_reason = choice.get("finish_reason")

        # Text content
        content = delta.get("content")
        if content:
            self.full_text += content
            events.append({"type": "text_delta", "content": content})

        # Tool call fragments
        tool_call_deltas = delta.get("tool_calls")
        if tool_call_deltas:
            for tc_delta in tool_call_deltas:
                idx = tc_delta.get("index", 0)
                if idx not in self._tool_accumulators:
                    self._tool_accumulators[idx] = _ToolCallAccumulator()
                acc = self._tool_accumulators[idx]

                if "id" in tc_delta:
                    acc.id = tc_delta["id"]
                func = tc_delta.get("function", {})
                if "name" in func:
                    acc.name = func["name"]
                if "arguments" in func:
                    acc.arguments += func["arguments"]

        # Emit assembled tool_calls on finish
        if finish_reason in ("tool_calls", "stop") and self._tool_accumulators:
            assembled: list[dict] = []
            for _idx in sorted(self._tool_accumulators):
                acc = self._tool_accumulators[_idx]
                try:
                    args = json.loads(acc.arguments)
                except json.JSONDecodeError:
                    args = {}
                assembled.append({"name": acc.name, "arguments": args})

            self.tool_calls = assembled
            events.append({"type": "tool_calls", "toolCalls": assembled})
            self._tool_accumulators.clear()

        return events
