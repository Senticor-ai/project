"""Tests for email routes — skeleton endpoints (Slice 1).

These tests exercise the HTTP layer: auth, routing, response shapes.
Database-backed endpoints (list, update, disconnect, sync) require
the full test database with email_connections table.
"""

import dataclasses
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from app.config import settings
from app.db import db_conn, jsonb


def _patch_settings(monkeypatch, **overrides):
    """Replace the module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.email.routes.settings", patched)
    monkeypatch.setattr("app.email.gmail_oauth.settings", patched)
    return patched


def _seed_active_connection(
    auth_client,
    *,
    calendar_sync_enabled: bool = True,
    calendar_selected_ids: list[str] | None = None,
    calendar_sync_tokens: dict[str, str] | None = None,
    last_calendar_sync_error: str | None = None,
) -> tuple[str, str, str]:
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]
    connection_id = str(uuid.uuid4())
    selected_ids = calendar_selected_ids or ["primary"]
    sync_tokens = calendar_sync_tokens or {}

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, calendar_sync_enabled,
                     calendar_selected_ids, calendar_sync_tokens, last_calendar_sync_error)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, %s, %s, %s, %s)
                """,
                (
                    connection_id,
                    org_id,
                    user_id,
                    "calendar-settings@example.com",
                    "Calendar Settings",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                    calendar_sync_enabled,
                    jsonb(selected_ids),
                    jsonb(sync_tokens),
                    last_calendar_sync_error,
                ),
            )
        conn.commit()

    return connection_id, org_id, user_id


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

    def test_default_scope_set_includes_calendar_and_gmail(self, auth_client, monkeypatch):
        _patch_settings(
            monkeypatch,
            gmail_client_id="test-client-id",
            gmail_client_secret="test-secret",
            gmail_state_secret="test-state-secret-32chars-minimum!",
        )
        response = auth_client.get("/email/oauth/gmail/authorize")
        assert response.status_code == 200
        oauth_url = response.json()["url"]
        scope = parse_qs(urlparse(oauth_url).query).get("scope", [""])[0]
        assert "https://www.googleapis.com/auth/gmail.readonly" in scope
        assert "https://www.googleapis.com/auth/gmail.send" in scope
        assert "https://www.googleapis.com/auth/calendar.events" in scope
        assert "https://www.googleapis.com/auth/calendar.calendarlist.readonly" in scope

    def test_redirect_mode_returns_google_consent_redirect(self, auth_client, monkeypatch):
        _patch_settings(
            monkeypatch,
            gmail_client_id="test-client-id",
            gmail_client_secret="test-secret",
            gmail_state_secret="test-state-secret-32chars-minimum!",
        )

        response = auth_client.get(
            "/email/oauth/gmail/authorize",
            params={"redirect": "true"},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert response.headers["location"].startswith("https://accounts.google.com/")


class TestGmailCallback:
    def test_invalid_state_returns_400(self, client):
        response = client.get(
            "/email/oauth/gmail/callback",
            params={"code": "fake-code", "state": "invalid-jwt"},
            follow_redirects=False,
        )
        assert response.status_code == 400

    def test_success_redirects_and_creates_connection(self, auth_client, monkeypatch):
        _patch_settings(
            monkeypatch,
            gmail_client_id="test-client-id",
            gmail_client_secret="test-secret",
            gmail_state_secret="test-state-secret-32chars-minimum!",
            frontend_base_url="https://frontend.test",
        )

        monkeypatch.setattr(
            "app.email.routes.exchange_gmail_code",
            lambda _code: {
                "access_token": "access-token",
                "refresh_token": "refresh-token",
                "expires_in": 3600,
            },
        )
        monkeypatch.setattr(
            "app.email.routes.get_gmail_user_email",
            lambda _access_token: "multi-account@example.com",
        )
        monkeypatch.setattr("app.email.routes.register_watch", lambda *_args: None)

        class DummyCrypto:
            active_version = 7

            def encrypt(self, value: str) -> str:
                return f"enc:{value}"

        monkeypatch.setattr("app.email.routes.CryptoService", DummyCrypto)

        auth_url_res = auth_client.get(
            "/email/oauth/gmail/authorize",
            params={"return_url": "https://frontend.test/settings/email"},
        )
        assert auth_url_res.status_code == 200
        oauth_url = auth_url_res.json()["url"]
        state = parse_qs(urlparse(oauth_url).query)["state"][0]

        callback_res = auth_client.get(
            "/email/oauth/gmail/callback",
            params={"code": "fake-code", "state": state},
            follow_redirects=False,
        )
        assert callback_res.status_code == 303
        assert (
            callback_res.headers["location"]
            == "https://frontend.test/settings/email?gmail=connected"
        )

        list_res = auth_client.get("/email/connections")
        assert list_res.status_code == 200
        emails = [c["email_address"] for c in list_res.json()]
        assert "multi-account@example.com" in emails

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT encrypted_access_token, encrypted_refresh_token, encryption_key_version
                    FROM email_connections
                    WHERE org_id = %s AND email_address = %s AND is_active = true
                    """,
                    (auth_client.headers["X-Org-Id"], "multi-account@example.com"),
                )
                row = cur.fetchone()
        assert row is not None
        assert row["encrypted_access_token"] == "enc:access-token"
        assert row["encrypted_refresh_token"] == "enc:refresh-token"
        assert row["encryption_key_version"] == 7


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


class TestCalendarSettings:
    def test_lists_calendars_with_selection_state(self, auth_client, monkeypatch):
        connection_id, _org_id, _user_id = _seed_active_connection(
            auth_client,
            calendar_selected_ids=["primary", "team@group.calendar.google.com"],
        )

        monkeypatch.setattr("app.email.routes.get_valid_gmail_token", lambda *_args: "token")
        monkeypatch.setattr(
            "app.email.routes.google_calendar_api.calendar_list",
            lambda _token: {
                "items": [
                    {
                        "id": "primary",
                        "summary": "Primary",
                        "primary": True,
                        "accessRole": "owner",
                    },
                    {
                        "id": "team@group.calendar.google.com",
                        "summary": "Team",
                        "accessRole": "writer",
                    },
                    {
                        "id": "holidays@group.calendar.google.com",
                        "summary": "Holidays",
                        "accessRole": "reader",
                    },
                ]
            },
        )

        response = auth_client.get(f"/email/connections/{connection_id}/calendars")
        assert response.status_code == 200
        payload = response.json()
        by_id = {row["calendar_id"]: row for row in payload}

        assert by_id["primary"]["selected"] is True
        assert by_id["team@group.calendar.google.com"]["selected"] is True
        assert by_id["holidays@group.calendar.google.com"]["selected"] is False

    def test_update_selection_archives_deselected_calendar_items(self, auth_client):
        connection_id, org_id, user_id = _seed_active_connection(
            auth_client,
            calendar_selected_ids=["primary", "team@group.calendar.google.com"],
            calendar_sync_tokens={
                "primary": "tok-primary",
                "team@group.calendar.google.com": "tok-team",
            },
        )

        schema = {
            "@context": "https://schema.org",
            "@id": "urn:app:event:gcal:team@group.calendar.google.com:evt-team-1",
            "@type": "Event",
            "name": "Team Standup",
            "sourceMetadata": {
                "provider": "google_calendar",
                "raw": {
                    "eventId": "evt-team-1",
                    "calendarId": "team@group.calendar.google.com",
                },
            },
        }
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO items
                        (item_id, org_id, created_by_user_id, canonical_id, schema_jsonld,
                         source, content_hash, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, now(), now())
                    """,
                    (
                        str(uuid.uuid4()),
                        org_id,
                        user_id,
                        schema["@id"],
                        jsonb(schema),
                        "google_calendar",
                        "hash-team-1",
                    ),
                )
            conn.commit()

        response = auth_client.patch(
            f"/email/connections/{connection_id}",
            json={"calendar_selected_ids": ["primary"]},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["calendar_selected_ids"] == ["primary"]

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT archived_at
                    FROM items
                    WHERE org_id = %s
                      AND source = 'google_calendar'
                      AND schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'eventId' = 'evt-team-1'
                    """,
                    (org_id,),
                )
                item_row = cur.fetchone()
                assert item_row is not None
                assert item_row["archived_at"] is not None

                cur.execute(
                    """
                    SELECT calendar_selected_ids, calendar_sync_tokens
                    FROM email_connections
                    WHERE connection_id = %s
                    """,
                    (connection_id,),
                )
                conn_row = cur.fetchone()
                assert conn_row["calendar_selected_ids"] == ["primary"]
                assert conn_row["calendar_sync_tokens"] == {"primary": "tok-primary"}

    def test_update_selection_rejects_empty_calendar_list(self, auth_client):
        connection_id, _org_id, _user_id = _seed_active_connection(auth_client)
        response = auth_client.patch(
            f"/email/connections/{connection_id}",
            json={"calendar_selected_ids": []},
        )
        assert response.status_code == 400

    def test_listing_calendars_clears_stale_api_not_enabled_error(self, auth_client, monkeypatch):
        connection_id, _org_id, _user_id = _seed_active_connection(
            auth_client,
            last_calendar_sync_error=(
                "Google Calendar API is not enabled in this Google Cloud project. "
                "Enable the Calendar API and reconnect."
            ),
        )

        monkeypatch.setattr("app.email.routes.get_valid_gmail_token", lambda *_args: "token")
        monkeypatch.setattr(
            "app.email.routes.google_calendar_api.calendar_list",
            lambda _token: {
                "items": [
                    {
                        "id": "primary",
                        "summary": "Primary",
                        "primary": True,
                        "accessRole": "owner",
                    }
                ]
            },
        )

        response = auth_client.get(f"/email/connections/{connection_id}/calendars")
        assert response.status_code == 200

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_calendar_sync_error
                    FROM email_connections
                    WHERE connection_id = %s
                    """,
                    (connection_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["last_calendar_sync_error"] is None


class TestDisconnect:
    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.delete(f"/email/connections/{fake_id}")
        assert response.status_code == 404

    def test_disconnect_revokes_google_token(self, auth_client, monkeypatch):
        """Disconnecting should call Google's revocation endpoint."""
        connection_id, _org_id, _user_id = _seed_active_connection(auth_client)

        class DummyCrypto:
            def decrypt(self, value: str) -> str:
                return f"dec:{value}"

        monkeypatch.setattr("app.email.routes.CryptoService", DummyCrypto)
        monkeypatch.setattr("app.email.routes.stop_watch_for_connection", lambda *a: None)

        revoked_tokens: list[str] = []
        monkeypatch.setattr(
            "app.email.routes.revoke_google_token",
            lambda token: revoked_tokens.append(token),
        )

        response = auth_client.delete(f"/email/connections/{connection_id}")
        assert response.status_code == 200

        # Should revoke the refresh token (preferred) — only one call needed.
        assert len(revoked_tokens) == 1
        assert revoked_tokens[0] == "dec:enc-refresh"

    def test_disconnect_succeeds_when_revocation_fails(self, auth_client, monkeypatch):
        """Disconnect must succeed even if token revocation raises."""
        connection_id, _org_id, _user_id = _seed_active_connection(auth_client)

        class DummyCrypto:
            def decrypt(self, _value: str) -> str:
                raise ValueError("bad key")

        monkeypatch.setattr("app.email.routes.CryptoService", DummyCrypto)
        monkeypatch.setattr("app.email.routes.stop_watch_for_connection", lambda *a: None)

        response = auth_client.delete(f"/email/connections/{connection_id}")
        assert response.status_code == 200

    def test_disconnect_succeeds_when_revocation_times_out(self, auth_client, monkeypatch):
        """Disconnect must succeed even if the revocation HTTP call times out."""
        connection_id, _org_id, _user_id = _seed_active_connection(auth_client)

        class DummyCrypto:
            def decrypt(self, value: str) -> str:
                return f"dec:{value}"

        monkeypatch.setattr("app.email.routes.CryptoService", DummyCrypto)
        monkeypatch.setattr("app.email.routes.stop_watch_for_connection", lambda *a: None)

        def revoke_timeout(token: str) -> None:
            import httpx as _httpx

            raise _httpx.TimeoutException("timed out")

        monkeypatch.setattr("app.email.routes.revoke_google_token", revoke_timeout)

        response = auth_client.delete(f"/email/connections/{connection_id}")
        assert response.status_code == 200


class TestTriggerSync:
    def test_returns_401_without_auth(self, client):
        fake_id = str(uuid.uuid4())
        response = client.post(f"/email/connections/{fake_id}/sync")
        assert response.status_code == 401

    def test_returns_404_for_nonexistent(self, auth_client):
        fake_id = str(uuid.uuid4())
        response = auth_client.post(f"/email/connections/{fake_id}/sync")
        assert response.status_code == 404
