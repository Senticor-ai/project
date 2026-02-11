"""Tests for email routes — skeleton endpoints (Slice 1).

These tests exercise the HTTP layer: auth, routing, response shapes.
Database-backed endpoints (list, update, disconnect, sync) require
the full test database with email_connections table.
"""

import dataclasses
import uuid

from app.config import settings


def _patch_settings(monkeypatch, **overrides):
    """Replace the module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.email.routes.settings", patched)
    monkeypatch.setattr("app.email.gmail_oauth.settings", patched)
    return patched


class TestGmailAuthorize:
    def test_returns_401_without_auth(self, client):
        response = client.get("/email/oauth/gmail/authorize")
        assert response.status_code == 401

    def test_returns_500_when_gmail_not_configured(self, auth_client, monkeypatch):
        """Gmail client ID/secret are empty by default in test env."""
        _patch_settings(monkeypatch, gmail_client_id="", gmail_client_secret="")
        response = auth_client.get("/email/oauth/gmail/authorize")
        assert response.status_code == 500
        assert "not configured" in response.json()["detail"]

    def test_returns_url_when_configured(self, auth_client, monkeypatch):
        _patch_settings(
            monkeypatch,
            gmail_client_id="test-client-id",
            gmail_client_secret="test-secret",
            gmail_state_secret="test-state-secret-32chars-minimum!",
        )
        response = auth_client.get("/email/oauth/gmail/authorize")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "accounts.google.com" in data["url"]
        assert "test-client-id" in data["url"]


class TestGmailCallback:
    def test_invalid_state_returns_400(self, client):
        response = client.get(
            "/email/oauth/gmail/callback",
            params={"code": "fake-code", "state": "invalid-jwt"},
            follow_redirects=False,
        )
        assert response.status_code == 400


class TestListConnections:
    def test_returns_401_without_auth(self, client):
        response = client.get("/email/connections")
        assert response.status_code == 401

    def test_returns_empty_list(self, auth_client):
        response = auth_client.get("/email/connections")
        assert response.status_code == 200
        assert response.json() == []


class TestGetConnection:
    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.get(f"/email/connections/{fake_id}")
        assert response.status_code == 404


class TestUpdateConnection:
    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.patch(
            f"/email/connections/{fake_id}",
            json={"sync_interval_minutes": 15},
        )
        assert response.status_code == 404

    def test_returns_400_when_no_fields(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.patch(
            f"/email/connections/{fake_id}",
            json={},
        )
        assert response.status_code == 400


class TestDisconnect:
    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.delete(f"/email/connections/{fake_id}")
        assert response.status_code == 404


class TestTriggerSync:
    def test_returns_401_without_auth(self, client):
        fake_id = str(uuid.uuid4())
        response = client.post(f"/email/connections/{fake_id}/sync")
        assert response.status_code == 401

    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.post(f"/email/connections/{fake_id}/sync")
        assert response.status_code == 404
