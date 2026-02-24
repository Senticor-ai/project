from app.observability import (
    TRAIL_ID_HEADER,
    USER_ID_HEADER,
    anonymize_identifier,
    bind_request_context,
    bind_user_context,
    clear_request_context,
    get_request_context,
    request_context_headers,
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


def test_bind_user_context_sets_session_and_anonymous_id() -> None:
    bind_request_context("req-2", "POST", "/items")
    bind_user_context("user-1", "user@example.com", session_id="session-1")
    context = get_request_context()

    assert context["user_id"] == "user-1"
    assert context["session_id"] == "session-1"
    assert context["user_id_anon"]
    assert context["user_id_anon"] != context["user_id"]


def test_request_context_headers_include_trail_id() -> None:
    bind_request_context("req-3", "GET", "/search", trail_id="trail-123")
    bind_user_context("user-2")
    headers = request_context_headers()

    assert headers[USER_ID_HEADER] == "user-2"
    assert headers[TRAIL_ID_HEADER] == "trail-123"
