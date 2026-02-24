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
from datetime import UTC, datetime
from pathlib import Path
from typing import (  # noqa: UP035 — must match Haystack's parent types exactly
    Any,
    Awaitable,
    Callable,
    Union,
)

from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.core.component import component
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
        {"name": t.name, "description": t.description, "parameters": t.parameters} for t in tools
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


def _read_cache(model: str, messages: list[ChatMessage], tools: list[Tool] | None) -> dict | None:
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
    trace_context: dict[str, Any] | None = None,
    error: str | None = None,
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
        "context": trace_context or {},
        "request": {
            "messages": _serialize_messages(messages),
            "tools": _serialize_tools(tools),
        },
        "response": {
            "replies": [r.to_dict() for r in response.get("replies", [])],
        },
    }
    if error:
        trace["error"] = error

    try:
        (TRACES_DIR / filename).write_text(json.dumps(trace, indent=2, ensure_ascii=False))
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

    Overrides both ``run`` and ``run_async`` because Haystack's Agent uses
    ``run_async`` exclusively — the synchronous ``run`` is only used when
    calling the generator outside an Agent.
    """

    def __init__(
        self,
        *args: Any,
        trace_context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._trace_context = trace_context or {}

    def _resolve_tools(
        self,
        tools: list[Tool] | list[Toolset] | list[Tool | Toolset] | Toolset | None,
    ) -> list[Tool] | None:
        """Flatten tools/toolsets to a plain list for cache/trace."""
        if tools is None:
            return None
        if isinstance(tools, list):
            return [t for t in tools if isinstance(t, Tool)]
        if isinstance(tools, Toolset):
            return list(tools)
        return None

    def _check_cache_and_trace(
        self,
        messages: list[ChatMessage],
        tool_list: list[Tool] | None,
    ) -> dict[str, list[ChatMessage]] | None:
        """Check cache; if hit, write trace and return cached result."""
        cached = _read_cache(self.model, messages, tool_list)
        if cached is not None:
            _write_trace(
                model=self.model,
                messages=messages,
                tools=tool_list,
                response=cached,
                duration_ms=0,
                cache_hit=True,
                trace_context=self._trace_context,
            )
        return cached

    def _record_result(
        self,
        messages: list[ChatMessage],
        tool_list: list[Tool] | None,
        result: dict[str, list[ChatMessage]],
        duration_ms: float,
    ) -> None:
        """Write trace and cache for a fresh LLM result."""
        _write_trace(
            model=self.model,
            messages=messages,
            tools=tool_list,
            response=result,
            duration_ms=duration_ms,
            cache_hit=False,
            trace_context=self._trace_context,
        )
        _write_cache(self.model, messages, tool_list, result)

    @component.output_types(replies=list[ChatMessage])
    def run(
        self,
        messages: list[ChatMessage],
        streaming_callback: Union[  # noqa: UP007 — must match Haystack's parent types exactly
            Callable[[StreamingChunk], None],
            Callable[[StreamingChunk], Awaitable[None]],
            None,
        ] = None,
        generation_kwargs: dict[str, Any] | None = None,
        *,
        tools: list[Tool] | list[Toolset] | list[Tool | Toolset] | Toolset | None = None,
        tools_strict: bool | None = None,
    ) -> dict[str, list[ChatMessage]]:
        tool_list = self._resolve_tools(tools)

        cached = self._check_cache_and_trace(messages, tool_list)
        if cached is not None:
            return cached

        start = time.monotonic()
        try:
            result = super().run(
                messages=messages,
                streaming_callback=streaming_callback,
                generation_kwargs=generation_kwargs,
                tools=tools,
                tools_strict=tools_strict,
            )
        except Exception as exc:
            _write_trace(
                model=self.model,
                messages=messages,
                tools=tool_list,
                response={"replies": []},
                duration_ms=(time.monotonic() - start) * 1000,
                cache_hit=False,
                trace_context=self._trace_context,
                error=str(exc),
            )
            raise
        self._record_result(messages, tool_list, result, (time.monotonic() - start) * 1000)
        return result

    @component.output_types(replies=list[ChatMessage])
    async def run_async(
        self,
        messages: list[ChatMessage],
        streaming_callback: Union[  # noqa: UP007 — must match Haystack's parent types exactly
            Callable[[StreamingChunk], None],
            Callable[[StreamingChunk], Awaitable[None]],
            None,
        ] = None,
        generation_kwargs: dict[str, Any] | None = None,
        *,
        tools: list[Tool] | list[Toolset] | list[Tool | Toolset] | Toolset | None = None,
        tools_strict: bool | None = None,
    ) -> dict[str, list[ChatMessage]]:
        tool_list = self._resolve_tools(tools)

        cached = self._check_cache_and_trace(messages, tool_list)
        if cached is not None:
            return cached

        start = time.monotonic()
        try:
            result = await super().run_async(
                messages=messages,
                streaming_callback=streaming_callback,
                generation_kwargs=generation_kwargs,
                tools=tools,
                tools_strict=tools_strict,
            )
        except Exception as exc:
            _write_trace(
                model=self.model,
                messages=messages,
                tools=tool_list,
                response={"replies": []},
                duration_ms=(time.monotonic() - start) * 1000,
                cache_hit=False,
                trace_context=self._trace_context,
                error=str(exc),
            )
            raise
        self._record_result(messages, tool_list, result, (time.monotonic() - start) * 1000)
        return result
