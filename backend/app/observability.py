from __future__ import annotations

import contextvars
import logging
import os
import sys
import uuid
from collections.abc import Mapping, MutableMapping

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars, get_contextvars
from structlog.stdlib import add_logger_name

REQUEST_ID_HEADER = "X-Request-ID"
USER_ID_HEADER = "X-User-ID"
REQUEST_ID_ENV = "REQUEST_ID"
USER_ID_ENV = "USER_ID"


def configure_logging() -> None:
    log_format = os.environ.get("LOG_FORMAT", "json").lower()

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        add_logger_name,
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
        processors=processors,  # type: ignore[arg-type]
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
) -> MutableMapping[str, str]:
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
) -> MutableMapping[str, str]:
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
