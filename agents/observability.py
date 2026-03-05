"""Structured logging with request context for the agents service.

Mirrors the backend's observability.py pattern: structlog with context vars
so every log line automatically includes request_id, trail_id, trace_id, and
span_id for cross-service correlation in Grafana (Loki ↔ Tempo).
"""

from __future__ import annotations

import logging
import os
import sys
import uuid

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars
from structlog.typing import EventDict, Processor

REQUEST_ID_HEADER = "X-Request-ID"
TRAIL_ID_HEADER = "X-Trail-ID"


def _add_otel_context(
    logger: object,  # noqa: ARG001
    method_name: str,  # noqa: ARG001
    event_dict: EventDict,
) -> EventDict:
    """Inject trace_id and span_id from the current OTEL span."""
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            event_dict["trace_id"] = format(ctx.trace_id, "032x")
            event_dict["span_id"] = format(ctx.span_id, "016x")
    except Exception:  # noqa: BLE001
        pass
    return event_dict


def configure_logging() -> None:
    log_format = os.environ.get("LOG_FORMAT", "json").lower()

    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_otel_context,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer: Processor = (
        structlog.dev.ConsoleRenderer()
        if log_format == "console"
        else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(level=logging.INFO, stream=sys.stdout, format="%(message)s")


def get_logger(name: str | None = None):
    return structlog.get_logger(name)


def generate_request_id() -> str:
    return str(uuid.uuid4())


def bind_request_context(
    request_id: str,
    method: str,
    path: str,
    trail_id: str | None = None,
) -> None:
    bind_contextvars(
        request_id=request_id,
        http_method=method,
        http_path=path,
        trail_id=trail_id or str(uuid.uuid4()),
    )


def bind_trace_context(trace_context: dict) -> None:
    """Bind trace context fields from the chat completions payload."""
    if not trace_context:
        return
    bindings: dict[str, str] = {}
    if trace_context.get("requestId"):
        bindings["request_id"] = str(trace_context["requestId"])
    if trace_context.get("trailId"):
        bindings["trail_id"] = str(trace_context["trailId"])
    if trace_context.get("userId"):
        bindings["user_id"] = str(trace_context["userId"])
    if trace_context.get("orgId"):
        bindings["org_id"] = str(trace_context["orgId"])
    if trace_context.get("externalConversationId"):
        bindings["conversation_id"] = str(trace_context["externalConversationId"])
    if trace_context.get("sessionId"):
        bindings["session_id"] = str(trace_context["sessionId"])
    if bindings:
        bind_contextvars(**bindings)


def clear_request_context() -> None:
    clear_contextvars()
