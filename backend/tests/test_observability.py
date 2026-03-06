from concurrent.futures import ThreadPoolExecutor

from app.observability import (
    TRAIL_ID_HEADER,
    USER_ID_HEADER,
    anonymize_identifier,
    bind_request_context,
    bind_user_context,
    clear_request_context,
    get_request_context,
    request_context_headers,
    wrap_with_context,
)


def teardown_function() -> None:
    clear_request_context()


def test_anonymize_identifier_is_deterministic() -> None:
    first = anonymize_identifier("user-123")
    second = anonymize_identifier("user-123")
    other = anonymize_identifier("user-456")

    assert first == second
    assert first != other


def test_bind_request_context_sets_trail_id() -> None:
    bind_request_context("req-1", "GET", "/health")
    context = get_request_context()

    assert context["request_id"] == "req-1"
    assert context["trail_id"]


def test_bind_user_context_sets_session_id() -> None:
    bind_request_context("req-2", "POST", "/items")
    bind_user_context("user-1", "user@example.com", session_id="session-1")
    context = get_request_context()

    assert context["user_id"] == "user-1"
    assert context["session_id"] == "session-1"


def test_request_context_headers_include_trail_id() -> None:
    bind_request_context("req-3", "GET", "/search", trail_id="trail-123")
    bind_user_context("user-2")
    headers = request_context_headers()

    assert headers[USER_ID_HEADER] == "user-2"
    assert headers[TRAIL_ID_HEADER] == "trail-123"


def test_wrap_with_context_preserves_contextvars_in_thread() -> None:
    """wrap_with_context must capture contextvars at call-site, not in thread."""
    import contextvars

    test_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
        "test_var", default=None
    )
    test_var.set("captured-at-call-site")

    wrapped = wrap_with_context(lambda: test_var.get())

    # Clear in main thread to prove the wrapper uses the snapshot
    test_var.set(None)

    with ThreadPoolExecutor(max_workers=1) as pool:
        result = pool.submit(wrapped).result()

    assert result == "captured-at-call-site"
