"""
Tests for rate limiting on auth and file upload endpoints.

This module verifies that:
1. Auth endpoints (/auth/login, /auth/register) are limited to 5 requests/minute
2. File upload endpoints are limited to 120 requests/minute
3. Rate limit exceeded returns HTTP 429 with Retry-After header
"""

import time
import uuid

import pytest


def test_auth_login_rate_limiting(client):
    """
    Test that /auth/login endpoint enforces 5 requests/minute rate limit.

    Verification steps:
    1. Send 5 POST requests to /auth/login with invalid credentials
    2. Verify all 5 return 401 (invalid credentials)
    3. Send 6th POST request
    4. Verify 6th returns 429 (rate limited)
    5. Verify response includes Retry-After header
    """
    endpoint = "/auth/login"
    payload = {"email": "test@example.com", "password": "wrongpassword"}

    # Send first 5 requests - all should return 401 (invalid credentials)
    for i in range(1, 6):
        response = client.post(endpoint, json=payload)
        assert response.status_code == 401, (
            f"Request {i} expected 401 (invalid credentials), got {response.status_code}"
        )

        # Small delay between requests
        time.sleep(0.1)

    # 6th request should hit rate limit
    response = client.post(endpoint, json=payload)
    assert response.status_code == 429, (
        f"Request 6 expected 429 (rate limited), got {response.status_code}"
    )

    # Verify Retry-After header is present
    assert "retry-after" in response.headers or "Retry-After" in response.headers, (
        "Rate limit response missing Retry-After header"
    )

    retry_after = response.headers.get("retry-after") or response.headers.get("Retry-After")
    assert retry_after, "Retry-After header is empty"

    # Verify it's a reasonable value (should be 60 seconds based on implementation)
    try:
        retry_seconds = int(retry_after)
        assert 0 < retry_seconds <= 60, (
            f"Retry-After value {retry_seconds} is outside expected range (1-60)"
        )
    except ValueError:
        pytest.fail(f"Retry-After header value '{retry_after}' is not a valid integer")


def test_auth_register_rate_limiting(client):
    """
    Test that /auth/register endpoint enforces 5 requests/minute rate limit.
    """
    endpoint = "/auth/register"
    suffix = str(int(time.time() * 1000))
    payload = {
        "email": f"rate-limit-{suffix}@example.com",
        "password": "testpassword123",
        "username": f"ratelimit{suffix[-8:]}",
    }

    # Send 5 requests rapidly
    responses = []
    for _ in range(5):
        response = client.post(endpoint, json=payload)
        responses.append(response.status_code)
        time.sleep(0.1)

    # 6th request should hit rate limit
    response = client.post(endpoint, json=payload)
    assert response.status_code == 429, f"Expected 429 (rate limited), got {response.status_code}"

    # Verify Retry-After header
    retry_after = response.headers.get("retry-after") or response.headers.get("Retry-After")
    assert retry_after, "Rate limit response missing Retry-After header"


def test_file_upload_rate_limiting(client):
    """
    Test that file upload endpoints enforce 120 requests/minute rate limit.

    Note: This test verifies the /files/initiate endpoint which should have
    a 120 requests/minute limit. The threshold allows large multi-file drops
    (for example 32 files) without immediately failing.
    """
    endpoint = "/files/initiate"

    # Reset limiter state so this test is independent from auth rate-limit tests
    # that run earlier in this file.
    from app.rate_limit import limiter

    limiter._storage.reset()  # type: ignore[attr-defined]

    # Create and login a dedicated user for this test.
    suffix = uuid.uuid4().hex
    email = f"upload-rate-{suffix}@example.com"
    password = "Testpass1!"
    register_response = client.post(
        "/auth/register",
        json={"email": email, "password": password, "username": f"upload{suffix[:8]}"},
    )
    assert register_response.status_code == 200

    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200
    org_id = login_response.json()["default_org_id"]
    client.headers.update({"X-Org-Id": org_id})

    payload = {
        "filename": "test.pdf",
        "content_type": "application/pdf",
        "total_size": 1024,
    }

    # Send 120 requests - none should be rate limited yet.
    for i in range(1, 121):
        response = client.post(endpoint, json=payload)
        # No request should be rate limited before the configured threshold.
        assert response.status_code != 429, f"Request {i} unexpectedly hit rate limit"

    # 121st request should hit rate limit
    response = client.post(endpoint, json=payload)
    assert response.status_code == 429, (
        f"Expected request 121 to hit rate limit (429), got {response.status_code}"
    )
    retry_after = response.headers.get("retry-after") or response.headers.get("Retry-After")
    assert retry_after, "Rate limit response missing Retry-After header"


def test_rate_limit_retry_after_header_format(client):
    """
    Test that the Retry-After header has the correct format.

    The header should contain the number of seconds to wait.
    """
    endpoint = "/auth/login"
    payload = {"email": "test@example.com", "password": "wrongpassword"}

    # Trigger rate limit by sending 6 requests
    for _ in range(6):
        response = client.post(endpoint, json=payload)
        time.sleep(0.1)

    # The last response should have been rate limited
    if response.status_code == 429:
        retry_after = response.headers.get("retry-after") or response.headers.get("Retry-After")

        # Verify format (should be an integer representing seconds)
        assert retry_after.isdigit(), f"Retry-After should be an integer, got '{retry_after}'"

        # Verify reasonable value
        retry_seconds = int(retry_after)
        assert 0 < retry_seconds <= 60, f"Retry-After {retry_seconds}s is outside expected range"
