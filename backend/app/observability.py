from __future__ import annotations

import contextvars
import logging
import os
import sys
import uuid
from collections.abc import Mapping

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars, get_contextvars
from structlog.stdlib import add_logger_name

REQUEST_ID_HEADER = "X-Request-ID"
USER_ID_HEADER = "X-User-ID"
REQUEST_ID_ENV = "REQUEST_ID"
USER_ID_ENV = "USER_ID"


def _add_otel_context(
    logger: object,  # noqa: ARG001
    method_name: str,  # noqa: ARG001
    event_dict: dict,
) -> dict:
    """Inject ``trace_id`` and ``span_id`` from the current OTEL span.

    Enables log ↔ trace correlation in Grafana (Loki ↔ Tempo).
    Gracefully no-ops when the OTEL SDK is not installed or tracing
    is disabled.
    """
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

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        add_logger_name,
        _add_otel_context,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer = (
        structlog.dev.ConsoleRenderer()
        if log_format == "console"
        else structlog.processors.JSONRenderer()
    )

    processors = shared_processors + [renderer]

    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(level=logging.INFO, stream=sys.stdout, format="%(message)s")


def get_logger(name: str | None = None):
    return structlog.get_logger(name)


def generate_request_id() -> str:
    return str(uuid.uuid4())


def bind_request_context(request_id: str, method: str, path: str) -> None:
    bind_contextvars(request_id=request_id, http_method=method, http_path=path)


def bind_user_context(user_id: str | None, email: str | None = None) -> None:
    if user_id:
        bind_contextvars(user_id=str(user_id))
    if email:
        bind_contextvars(user_email=email)


def clear_request_context() -> None:
    clear_contextvars()


def get_request_context() -> dict:
    context = get_contextvars()
    return {
        "request_id": context.get("request_id"),
        "user_id": context.get("user_id"),
    }


def request_context_headers(
    headers: Mapping[str, str] | None = None,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    if headers:
        merged.update(headers)

    context = get_request_context()
    if context.get("request_id"):
        merged[REQUEST_ID_HEADER] = str(context["request_id"])
    if context.get("user_id"):
        merged[USER_ID_HEADER] = str(context["user_id"])

    return merged


def request_context_env(
    env: Mapping[str, str] | None = None,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    if env:
        merged.update(env)

    context = get_request_context()
    if context.get("request_id"):
        merged[REQUEST_ID_ENV] = str(context["request_id"])
    if context.get("user_id"):
        merged[USER_ID_ENV] = str(context["user_id"])

    return merged


def run_in_context(func, *args, **kwargs):
    ctx = contextvars.copy_context()
    return ctx.run(func, *args, **kwargs)
