"""End-to-end tests for CSRF protection."""

import uuid

import pytest

# Minimal valid ItemJsonLd payload matching ItemCreateRequest schema.
# The CSRF middleware validates the token before body parsing, so tests that
# check 403 responses don't need a valid body — but tests that expect 201 do.
_ITEM_PAYLOAD = {
    "source": "manual",
    "item": {
        "@type": "Action",
        "@id": f"urn:app:inbox:{uuid.uuid4()}",
        "_schemaVersion": 2,
        "startTime": None,
        "endTime": None,
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
            {"@type": "PropertyValue", "propertyID": "app:rawCapture", "value": "CSRF test"},
        ],
    },
}


@pytest.fixture
def csrf_enabled():
    """Enable CSRF for the duration of a test, regardless of env import order."""
    from app.config import settings

    original = settings.csrf_enabled
    object.__setattr__(settings, "csrf_enabled", True)
    try:
        yield
    finally:
        object.__setattr__(settings, "csrf_enabled", original)


@pytest.fixture
def authenticated_client(csrf_enabled, auth_client):
    """Authenticated client with CSRF middleware enabled."""
    return auth_client


def test_csrf_enabled_config(csrf_enabled):
    """Verify CSRF is enabled in settings."""
    from app.config import settings

    assert settings.csrf_enabled is True


def test_csrf_token_endpoint_returns_token(client, csrf_enabled):
    """GET /auth/csrf should return a CSRF token and set cookie."""
    response = client.get("/auth/csrf")
    assert response.status_code == 200

    data = response.json()
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 0

    from app.config import settings

    assert settings.csrf_cookie_name in response.cookies


def test_post_without_csrf_token_returns_403(authenticated_client):
    """POST /items without CSRF token should return 403 Forbidden."""
    response = authenticated_client.post(
        "/items",
        json={"title": "Test Item", "source_system": "manual"},
    )
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_post_with_csrf_token_succeeds(authenticated_client):
    """POST /items with valid CSRF token should succeed."""
    from app.config import settings

    csrf_response = authenticated_client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]

    payload = {
        **_ITEM_PAYLOAD,
        "item": {**_ITEM_PAYLOAD["item"], "@id": f"urn:app:inbox:{uuid.uuid4()}"},
    }
    response = authenticated_client.post(
        "/items",
        json=payload,
        headers={settings.csrf_header_name: csrf_token},
    )
    assert response.status_code == 201


def test_get_request_not_protected_by_csrf(authenticated_client):
    """GET requests should not require CSRF token."""
    response = authenticated_client.get("/items")
    assert response.status_code == 200


def test_csrf_token_mismatch_returns_403(authenticated_client):
    """POST with mismatched CSRF token/cookie should return 403."""
    from app.config import settings

    authenticated_client.get("/auth/csrf")
    response = authenticated_client.post(
        "/items",
        json={"title": "Test Item", "source_system": "manual"},
        headers={settings.csrf_header_name: "wrong_token_value"},
    )
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_chat_completions_with_invalid_csrf_returns_403(authenticated_client):
    """POST /chat/completions with mismatched CSRF must return 403 (not 500)."""
    from app.config import settings

    authenticated_client.get("/auth/csrf")
    response = authenticated_client.post(
        "/chat/completions",
        json={},
        headers={settings.csrf_header_name: "wrong_token_value"},
    )
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_csrf_exempts_login_endpoint(client, csrf_enabled):
    """POST /auth/login should work without CSRF token (exempt)."""
    response = client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "wrong_password"},
    )
    assert response.status_code == 401
    assert "Invalid CSRF token" not in response.text


def test_csrf_exempts_register_endpoint(client, csrf_enabled):
    """POST /auth/register should work without CSRF token (exempt)."""
    suffix = uuid.uuid4().hex
    response = client.post(
        "/auth/register",
        json={
            "email": f"exempt-{suffix}@example.com",
            "password": "test_password_123",
            "username": f"exempt{suffix[:8]}",
        },
    )
    assert response.status_code == 200
    assert "Invalid CSRF token" not in response.text


def test_patch_without_csrf_token_returns_403(authenticated_client):
    """PATCH /items/{id} without CSRF token should return 403."""
    from app.config import settings

    csrf_response = authenticated_client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]

    payload = {
        **_ITEM_PAYLOAD,
        "item": {**_ITEM_PAYLOAD["item"], "@id": f"urn:app:inbox:{uuid.uuid4()}"},
    }
    create_response = authenticated_client.post(
        "/items",
        json=payload,
        headers={settings.csrf_header_name: csrf_token},
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["item_id"]

    response = authenticated_client.patch(
        f"/items/{item_id}",
        json={"title": "Updated Title"},
    )
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_delete_without_csrf_token_returns_403(authenticated_client):
    """DELETE /items/{id} without CSRF token should return 403."""
    from app.config import settings

    csrf_response = authenticated_client.get("/auth/csrf")
    csrf_token = csrf_response.json()["csrf_token"]

    payload = {
        **_ITEM_PAYLOAD,
        "item": {**_ITEM_PAYLOAD["item"], "@id": f"urn:app:inbox:{uuid.uuid4()}"},
    }
    create_response = authenticated_client.post(
        "/items",
        json=payload,
        headers={settings.csrf_header_name: csrf_token},
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["item_id"]

    response = authenticated_client.delete(f"/items/{item_id}")
    assert response.status_code == 403
    assert "Invalid CSRF token" in response.json()["detail"]


def test_csrf_disabled_allows_post_without_token(authenticated_client, csrf_enabled):
    """When CSRF is disabled, POST should not be blocked by CSRF middleware."""
    from app.config import settings

    original = settings.csrf_enabled
    object.__setattr__(settings, "csrf_enabled", False)
    try:
        response = authenticated_client.post(
            "/items",
            json={"title": "No CSRF Required", "source_system": "manual"},
        )
    finally:
        object.__setattr__(settings, "csrf_enabled", original)

    assert response.status_code != 403 or "Invalid CSRF token" not in response.text
