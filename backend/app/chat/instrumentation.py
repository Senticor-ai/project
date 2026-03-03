"""Chat observability: OTel spans, Prometheus metrics, structured log events.

Encapsulates all chat-specific instrumentation in one module so that
``routes.py`` stays focused on request handling.  Context managers wrap
existing code blocks — no logic changes, only observability added.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass

import httpx
from prometheus_client import Counter, Histogram

from ..observability import anonymize_identifier, get_logger

logger = get_logger("chat.instrumentation")


# ---------------------------------------------------------------------------
# OTel tracer (lazy, no-op when SDK is absent or tracing disabled)
# ---------------------------------------------------------------------------


def _get_tracer():
    """Return an OTel tracer for chat spans.

    Gracefully returns ``None`` when the SDK is not installed or tracing
    is disabled — same pattern as ``observability._add_otel_context``.
    """
    try:
        from opentelemetry import trace

        return trace.get_tracer("chat", "0.1.0")
    except Exception:  # noqa: BLE001
        return None


def _start_span(name: str):
    tracer = _get_tracer()
    if tracer is None:
        return None
    return tracer.start_span(name)


def _end_span(span) -> None:
    if span is not None:
        span.end()


def _fail_span(span, exc: Exception) -> None:
    if span is None or not span.is_recording():
        return
    span.set_attribute("error.type", type(exc).__name__)
    span.record_exception(exc)
    try:
        from opentelemetry.trace import StatusCode

        span.set_status(StatusCode.ERROR, str(exc)[:200])
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

CHAT_REQUESTS_TOTAL = Counter(
    "chat_requests_total",
    "Total chat completion requests.",
    ["backend", "status"],
)

CHAT_REQUEST_DURATION_SECONDS = Histogram(
    "chat_request_duration_seconds",
    "End-to-end chat request duration in seconds.",
    ["backend", "status"],
    buckets=(1, 5, 10, 30, 60, 120, 300),
)

CHAT_STREAM_FIRST_TOKEN_SECONDS = Histogram(
    "chat_stream_first_token_seconds",
    "Time to first streamed token in seconds.",
    ["backend"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60),
)

CHAT_PERSISTENCE_TOTAL = Counter(
    "chat_persistence_total",
    "Persistence write outcomes for chat messages.",
    ["target", "outcome"],
)

CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL = Counter(
    "chat_openclaw_ensure_running_total",
    "OpenClaw container ensure_running outcomes.",
    ["outcome"],
)

CHAT_OPENCLAW_ENSURE_RUNNING_DURATION_SECONDS = Histogram(
    "chat_openclaw_ensure_running_duration_seconds",
    "OpenClaw ensure_running duration in seconds.",
    ["outcome"],
    buckets=(0.1, 0.5, 1, 5, 10, 30, 60),
)


# ---------------------------------------------------------------------------
# Chat context (shared span attributes)
# ---------------------------------------------------------------------------


@dataclass
class ChatContext:
    """Attributes attached to every chat span and log event."""

    conversation_id: str
    request_id: str | None
    user_id: str
    org_id: str
    agent_backend: str = "unknown"
    model: str | None = None


def _set_span_attrs(span, ctx: ChatContext) -> None:
    if span is None or not span.is_recording():
        return
    span.set_attribute("chat.conversation_id", ctx.conversation_id)
    if ctx.request_id:
        span.set_attribute("chat.request_id", ctx.request_id)
    span.set_attribute("chat.user_id_hash", anonymize_identifier(ctx.user_id))
    span.set_attribute("chat.agent_backend", ctx.agent_backend)
    if ctx.model:
        span.set_attribute("chat.model", ctx.model)


# ---------------------------------------------------------------------------
# Span context managers
# ---------------------------------------------------------------------------


@contextmanager
def span_chat_completions(ctx: ChatContext):
    """Top-level span wrapping the entire ``/chat/completions`` handler."""
    span = _start_span("backend.chat.completions")
    _set_span_attrs(span, ctx)
    start = time.monotonic()
    status = "success"
    try:
        yield span
    except Exception as exc:
        status = "error"
        _fail_span(span, exc)
        raise
    finally:
        duration = time.monotonic() - start
        CHAT_REQUESTS_TOTAL.labels(backend=ctx.agent_backend, status=status).inc()
        CHAT_REQUEST_DURATION_SECONDS.labels(backend=ctx.agent_backend, status=status).observe(
            duration
        )
        _end_span(span)
        logger.info(
            "chat.completions.finished",
            conversation_id=ctx.conversation_id,
            request_id=ctx.request_id,
            backend=ctx.agent_backend,
            status=status,
            duration_seconds=round(duration, 3),
        )


@contextmanager
def span_db_setup(ctx: ChatContext):
    """Span for DB setup: conversation lookup, user message persist, history fetch."""
    span = _start_span("backend.chat.db_setup")
    _set_span_attrs(span, ctx)
    try:
        yield span
    except Exception as exc:
        _fail_span(span, exc)
        raise
    finally:
        _end_span(span)


@contextmanager
def span_ensure_running(ctx: ChatContext):
    """Span for OpenClaw ``ensure_running()``."""
    span = _start_span("backend.openclaw.ensure_running")
    _set_span_attrs(span, ctx)
    start = time.monotonic()
    outcome = "success"
    try:
        yield span
    except Exception as exc:
        outcome = "failure"
        _fail_span(span, exc)
        raise
    finally:
        duration = time.monotonic() - start
        CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL.labels(outcome=outcome).inc()
        CHAT_OPENCLAW_ENSURE_RUNNING_DURATION_SECONDS.labels(outcome=outcome).observe(duration)
        if span is not None and span.is_recording():
            span.set_attribute("openclaw.outcome", outcome)
        _end_span(span)
        logger.info(
            "chat.openclaw.ensure_running",
            conversation_id=ctx.conversation_id,
            outcome=outcome,
            duration_seconds=round(duration, 3),
        )


# ---------------------------------------------------------------------------
# Persistence recording
# ---------------------------------------------------------------------------


def record_persistence_outcome(
    target: str,
    success: bool,
    ctx: ChatContext,
    error: Exception | None = None,
) -> None:
    """Record a persistence write outcome (metric + structured log)."""
    outcome = "success" if success else "failure"
    CHAT_PERSISTENCE_TOTAL.labels(target=target, outcome=outcome).inc()

    log_kwargs: dict = {
        "conversation_id": ctx.conversation_id,
        "request_id": ctx.request_id,
        "outcome": outcome,
        "target": target,
    }
    if error:
        log_kwargs["error_type"] = type(error).__name__
        log_kwargs["error_detail"] = str(error)[:200]

    if success:
        logger.info("chat.persistence", **log_kwargs)
    else:
        logger.warning("chat.persistence", **log_kwargs)


# ---------------------------------------------------------------------------
# First-token tracker
# ---------------------------------------------------------------------------


class FirstTokenTracker:
    """Track time-to-first-token for streaming responses."""

    def __init__(self, backend: str) -> None:
        self._backend = backend
        self._start = time.monotonic()
        self._recorded = False

    def mark_first_token(self) -> None:
        if not self._recorded:
            self._recorded = True
            ttft = time.monotonic() - self._start
            CHAT_STREAM_FIRST_TOKEN_SECONDS.labels(backend=self._backend).observe(ttft)


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------


def classify_error(exc: Exception, backend: str) -> str:
    """Classify an exception for span attributes and logging.

    Returns a short string such as ``"provider_timeout"`` or
    ``"container_unreachable"``.
    """
    if isinstance(exc, httpx.TimeoutException):
        return "container_timeout" if backend == "openclaw" else "provider_timeout"
    if isinstance(exc, httpx.ConnectError):
        return "container_unreachable" if backend == "openclaw" else "provider_unreachable"
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if 500 <= status < 600:
            return "container_error" if backend == "openclaw" else "provider_error"
        return "client_error"
    return "backend_error"
