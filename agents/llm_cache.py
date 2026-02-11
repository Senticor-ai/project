"""File-based LLM response cache and trace logging.

Provides:
- CachedTracedChatGenerator: drop-in replacement for OpenAIChatGenerator
  with file-based response caching and per-call trace logging.
- Traces written to storage/traces/ as JSON files (one per LLM call).
- Cache stored in storage/llm_cache/ as JSON files keyed by SHA-256 hash
  of (model + messages + tool names).
"""

import hashlib
import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage, StreamingChunk
from haystack.tools import Tool, Toolset

logger = logging.getLogger(__name__)

MONOREPO_ROOT = Path(__file__).resolve().parents[1]
TRACES_DIR = MONOREPO_ROOT / "storage" / "traces"
CACHE_DIR = MONOREPO_ROOT / "storage" / "llm_cache"

# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_messages(messages: list[ChatMessage]) -> list[dict]:
    """Serialize ChatMessage list for storage. Gracefully handles errors."""
    result = []
    for m in messages:
        try:
            result.append(m.to_dict())
        except Exception:
            # Fallback: capture what we can
            result.append({"role": str(m.role), "text": m.text or ""})
    return result


def _serialize_tools(tools: list[Tool] | None) -> list[dict]:
    if not tools:
        return []
    return [
        {"name": t.name, "description": t.description, "parameters": t.parameters}
        for t in tools
    ]


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


def _cache_key(model: str, messages: list[dict], tool_names: list[str]) -> str:
    payload = json.dumps(
        {"model": model, "messages": messages, "tools": tool_names},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _read_cache(
    model: str, messages: list[ChatMessage], tools: list[Tool] | None
) -> dict | None:
    serialized = _serialize_messages(messages)
    tool_names = [t.name for t in (tools or [])]
    key = _cache_key(model, serialized, tool_names)
    cache_file = CACHE_DIR / f"{key}.json"

    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text())
        replies = [ChatMessage.from_dict(r) for r in data["replies"]]
        logger.info("LLM cache HIT: %s (%s)", key[:12], model)
        return {"replies": replies}
    except Exception as exc:
        logger.warning("LLM cache read error for %s: %s", key[:12], exc)
        return None


def _write_cache(
    model: str,
    messages: list[ChatMessage],
    tools: list[Tool] | None,
    response: dict[str, Any],
) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    serialized = _serialize_messages(messages)
    tool_names = [t.name for t in (tools or [])]
    key = _cache_key(model, serialized, tool_names)
    cache_file = CACHE_DIR / f"{key}.json"

    try:
        data = {
            "model": model,
            "cached_at": datetime.now(UTC).isoformat(),
            "replies": [r.to_dict() for r in response.get("replies", [])],
        }
        cache_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        logger.info("LLM cache SET: %s (%s)", key[:12], model)
    except Exception as exc:
        logger.warning("LLM cache write error for %s: %s", key[:12], exc)


# ---------------------------------------------------------------------------
# Trace writer
# ---------------------------------------------------------------------------


def _write_trace(
    *,
    model: str,
    messages: list[ChatMessage],
    tools: list[Tool] | None,
    response: dict[str, Any],
    duration_ms: float,
    cache_hit: bool,
) -> None:
    TRACES_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC)
    safe_model = model.replace("/", "_").replace(":", "_")
    filename = f"{ts.strftime('%Y%m%d_%H%M%S_%f')}_{safe_model}.json"

    trace = {
        "timestamp": ts.isoformat(),
        "model": model,
        "duration_ms": round(duration_ms, 1),
        "cache_hit": cache_hit,
        "request": {
            "messages": _serialize_messages(messages),
            "tools": _serialize_tools(tools),
        },
        "response": {
            "replies": [r.to_dict() for r in response.get("replies", [])],
        },
    }

    try:
        (TRACES_DIR / filename).write_text(
            json.dumps(trace, indent=2, ensure_ascii=False)
        )
        logger.info("Trace written: %s", filename)
    except Exception as exc:
        logger.warning("Trace write error: %s", exc)


# ---------------------------------------------------------------------------
# Cached + traced generator (drop-in replacement for OpenAIChatGenerator)
# ---------------------------------------------------------------------------


class CachedTracedChatGenerator(OpenAIChatGenerator):
    """OpenAIChatGenerator with file-based response caching and per-call trace logging.

    Every LLM call is:
    1. Checked against the file cache (cache hit → skip API call)
    2. Logged as a JSON trace file in storage/traces/
    3. Cached for future identical requests in storage/llm_cache/
    """

    def run(
        self,
        messages: list[ChatMessage],
        streaming_callback: Callable[[StreamingChunk], None]
        | Callable[[StreamingChunk], Awaitable[None]]
        | None = None,
        generation_kwargs: dict[str, Any] | None = None,
        *,
        tools: list[Tool] | list[Toolset] | list[Tool | Toolset] | Toolset | None = None,
        tools_strict: bool | None = None,
    ) -> dict[str, list[ChatMessage]]:
        # Resolve tools list for cache/trace (flatten Toolset if needed)
        tool_list: list[Tool] | None = None
        if tools is not None:
            if isinstance(tools, list):
                tool_list = [t for t in tools if isinstance(t, Tool)]
            elif isinstance(tools, Toolset):
                tool_list = list(tools)

        # Check cache
        cached = _read_cache(self.model, messages, tool_list)
        if cached is not None:
            _write_trace(
                model=self.model,
                messages=messages,
                tools=tool_list,
                response=cached,
                duration_ms=0,
                cache_hit=True,
            )
            return cached

        # Call the real LLM
        start = time.monotonic()
        result = super().run(
            messages=messages,
            streaming_callback=streaming_callback,
            generation_kwargs=generation_kwargs,
            tools=tools,
            tools_strict=tools_strict,
        )
        duration_ms = (time.monotonic() - start) * 1000

        # Write trace and cache
        _write_trace(
            model=self.model,
            messages=messages,
            tools=tool_list,
            response=result,
            duration_ms=duration_ms,
            cache_hit=False,
        )
        _write_cache(self.model, messages, tool_list, result)

        return result
