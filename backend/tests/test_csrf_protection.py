"""
End-to-end tests for CSRF protection.

Tests verify that CSRF protection correctly:
1. Blocks POST requests without CSRF token when CSRF_ENABLED=true
2. Allows POST requests with valid CSRF token
3. Exempts safe methods (GET, HEAD, OPTIONS)
4. Exempts auth endpoints (login, register, refresh, csrf)
"""

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Set CSRF_ENABLED=true before importing the app
os.environ["CSRF_ENABLED"] = "true"

from app.main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture
def test_user():
    """Create a test user for authentication."""
    # Register a test user
    response = client.post(
        "/auth/register",
        json={
            "email": "csrf_test@example.com",
            "password": "test_password_123",
            "username": "csrftest",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def authenticated_session(test_user):
    """Login and return session cookies."""
    response = client.post(
        "/auth/login",
        json={"email": "csrf_test@example.com", "password": "test_password_123"},
    )
    assert response.status_code == 200
    return response.cookies


def test_csrf_enabled_config():
    """Verify CSRF is enabled in settings."""
    from app.config import settings

    assert settings.csrf_enabled is True


def test_csrf_token_endpoint_returns_token():
    """GET /auth/csrf should return a CSRF token and set cookie."""
    response = client.get("/auth/csrf")

    # Should return 200 OK
    assert response.status_code == 200

    # Should return token in response body
    data = response.json()
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 0

    # Should set CSRF cookie
    from app.config import settings

    assert settings.csrf_cookie_name in response.cookies


def test_post_without_csrf_token_returns_403(authenticated_session):
    """POST /items without CSRF token should return 403 Forbidden."""
    # Make POST request without CSRF token header
    response = client.post(
        "/items",
        json={
            "title": "Test Item",
            "source_system": "manual",
        },
        cookies=authenticated_session,
    )

    # Should be blocked by CSRF protection
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_post_with_csrf_token_succeeds(authenticated_session):
    """POST /items with valid CSRF token should succeed."""
    from app.config import settings

    # Get CSRF token
    csrf_response = client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]
    csrf_cookie = csrf_response.cookies.get(settings.csrf_cookie_name)

    # Combine session cookies with CSRF cookie
    all_cookies = dict(authenticated_session)
    all_cookies[settings.csrf_cookie_name] = csrf_cookie

    # Make POST request with CSRF token header
    response = client.post(
        "/items",
        json={
            "title": "Test Item with CSRF",
            "source_system": "manual",
        },
        cookies=all_cookies,
        headers={settings.csrf_header_name: csrf_token},
    )

    # Should succeed (201 Created)
    assert response.status_code == 201


def test_get_request_not_protected_by_csrf(authenticated_session):
    """GET requests should not require CSRF token."""
    # Make GET request without CSRF token
    response = client.get("/items", cookies=authenticated_session)

    # Should succeed (safe method, no CSRF required)
    assert response.status_code == 200


def test_csrf_token_mismatch_returns_403(authenticated_session):
    """POST with mismatched CSRF token/cookie should return 403."""
    from app.config import settings

    # Get CSRF token
    csrf_response = client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]

    # Combine session cookies with CSRF cookie
    all_cookies = dict(authenticated_session)
    all_cookies[settings.csrf_cookie_name] = csrf_response.cookies.get(
        settings.csrf_cookie_name
    )

    # Make POST request with wrong CSRF token in header
    response = client.post(
        "/items",
        json={
            "title": "Test Item",
            "source_system": "manual",
        },
        cookies=all_cookies,
        headers={settings.csrf_header_name: "wrong_token_value"},
    )

    # Should be blocked by CSRF protection
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_csrf_exempts_login_endpoint():
    """POST /auth/login should work without CSRF token (exempt)."""
    response = client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "wrong_password"},
    )

    # Should not be blocked by CSRF (exempt endpoint)
    # Will return 401 (invalid credentials) not 403 (CSRF)
    assert response.status_code == 401
    assert "Invalid CSRF token" not in response.text


def test_csrf_exempts_register_endpoint():
    """POST /auth/register should work without CSRF token (exempt)."""
    response = client.post(
        "/auth/register",
        json={
            "email": "exempt_test@example.com",
            "password": "test_password_123",
            "username": "exempttest",
        },
    )

    # Should not be blocked by CSRF (exempt endpoint)
    assert response.status_code == 201
    assert "Invalid CSRF token" not in response.text


def test_patch_without_csrf_token_returns_403(authenticated_session, test_user):
    """PATCH /items/{id} without CSRF token should return 403."""
    from app.config import settings

    # First create an item with CSRF protection
    csrf_response = client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]
    csrf_cookie = csrf_response.cookies.get(settings.csrf_cookie_name)

    all_cookies = dict(authenticated_session)
    all_cookies[settings.csrf_cookie_name] = csrf_cookie

    create_response = client.post(
        "/items",
        json={"title": "Original Title", "source_system": "manual"},
        cookies=all_cookies,
        headers={settings.csrf_header_name: csrf_token},
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["id"]

    # Try to PATCH without CSRF token
    response = client.patch(
        f"/items/{item_id}",
        json={"title": "Updated Title"},
        cookies=authenticated_session,
    )

    # Should be blocked by CSRF protection
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_delete_without_csrf_token_returns_403(authenticated_session):
    """DELETE /items/{id} without CSRF token should return 403."""
    from app.config import settings

    # First create an item with CSRF protection
    csrf_response = client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]
    csrf_cookie = csrf_response.cookies.get(settings.csrf_cookie_name)

    all_cookies = dict(authenticated_session)
    all_cookies[settings.csrf_cookie_name] = csrf_cookie

    create_response = client.post(
        "/items",
        json={"title": "To Be Deleted", "source_system": "manual"},
        cookies=all_cookies,
        headers={settings.csrf_header_name: csrf_token},
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["id"]

    # Try to DELETE without CSRF token
    response = client.delete(
        f"/items/{item_id}",
        cookies=authenticated_session,
    )

    # Should be blocked by CSRF protection
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_csrf_disabled_allows_post_without_token():
    """When CSRF_ENABLED=false, POST should work without token."""
    # Temporarily set CSRF to disabled
    with patch("app.config.settings.csrf_enabled", False):
        # Create a new client with CSRF disabled
        from app.main import app

        test_client = TestClient(app)

        # Login to get session
        test_client.post(
            "/auth/register",
            json={
                "email": "nocsrf@example.com",
                "password": "test_password_123",
                "username": "nocsrf",
            },
        )
        login_response = test_client.post(
            "/auth/login",
            json={"email": "nocsrf@example.com", "password": "test_password_123"},
        )

        # Try POST without CSRF token
        response = test_client.post(
            "/items",
            json={"title": "No CSRF Required", "source_system": "manual"},
            cookies=login_response.cookies,
        )

        # Should succeed when CSRF is disabled
        # (May still fail for other reasons like validation, but not CSRF)
        assert response.status_code != 403 or "Invalid CSRF token" not in response.text
