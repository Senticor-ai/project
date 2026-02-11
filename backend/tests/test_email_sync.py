"""Tests for email/sync.py — sync orchestrator with mocked IMAP."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

from app.db import db_conn
from app.email.imap_client import EmailMessage
from app.email.sync import SyncResult, run_email_sync


def _make_email_msg(
    uid: str = "101",
    message_id: str = "<sync-test@example.com>",
    subject: str = "Testbetreff",
    sender_email: str = "sender@example.de",
) -> EmailMessage:
    return EmailMessage(
        uid=uid,
        message_id=message_id,
        subject=subject,
        sender_email=sender_email,
        sender_name="Test Sender",
        recipients=[{"email": "to@example.de", "name": "Recipient", "type": "to"}],
        received_at=datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC),
        body_text="Testinhalt der E-Mail.",
        body_html=None,
        attachments=[],
    )


@pytest.fixture()
def email_connection(auth_client):
    """Create a real email_connections row and return (connection_id, org_id, user_id)."""
    # Extract org_id from auth_client headers
    org_id = auth_client.headers["X-Org-Id"]

    # Get user_id from /auth/me
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    conn_id = str(uuid.uuid4())

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token,
                     token_expires_at, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true)
                """,
                (
                    conn_id,
                    org_id,
                    user_id,
                    "test@gmail.com",
                    "Gmail (test@gmail.com)",
                    "fake-encrypted-access",
                    "fake-encrypted-refresh",
                    datetime(2026, 12, 31, tzinfo=UTC),
                ),
            )
            # Create sync state row
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_seen_uid)
                VALUES (%s, 'INBOX', 0)
                """,
                (conn_id,),
            )
        conn.commit()

    return conn_id, org_id, user_id


class TestRunEmailSync:
    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_creates_new_items(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [
            _make_email_msg(uid="101", message_id="<msg-1@example.com>"),
            _make_email_msg(uid="102", message_id="<msg-2@example.com>"),
        ]
        mock_imap_cls.return_value = mock_imap

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert isinstance(result, SyncResult)
        assert result.synced == 2
        assert result.created == 2
        assert result.skipped == 0
        assert result.errors == 0

        # Verify items were created in DB
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) AS cnt FROM items WHERE org_id = %s AND source = 'gmail'",
                    (org_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["cnt"] == 2

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_deduplicates_existing_items(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        msg = _make_email_msg(uid="201", message_id="<dedup-test@example.com>")
        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [msg]
        mock_imap_cls.return_value = mock_imap

        # First sync — should create
        result1 = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)
        assert result1.created == 1

        # Second sync with same message — should skip
        result2 = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)
        assert result2.skipped == 1
        assert result2.created == 0

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_updates_sync_state(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [
            _make_email_msg(uid="500", message_id="<state-test@example.com>"),
        ]
        mock_imap_cls.return_value = mock_imap

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_seen_uid FROM email_sync_state
                    WHERE connection_id = %s AND folder_name = 'INBOX'
                    """,
                    (conn_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["last_seen_uid"] == 500

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_no_messages_returns_zero(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = []
        mock_imap_cls.return_value = mock_imap

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.synced == 0
        assert result.created == 0

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_updates_connection_metadata(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [
            _make_email_msg(uid="301", message_id="<meta-test@example.com>"),
        ]
        mock_imap_cls.return_value = mock_imap

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT last_sync_at, last_sync_message_count, last_sync_error FROM email_connections WHERE connection_id = %s",
                    (conn_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["last_sync_at"] is not None
                assert row["last_sync_message_count"] == 1
                assert row["last_sync_error"] is None

    def test_sync_raises_for_nonexistent_connection(self, app):
        fake_id = str(uuid.uuid4())
        with pytest.raises(ValueError, match="not found"):
            run_email_sync(
                connection_id=fake_id,
                org_id=str(uuid.uuid4()),
                user_id=str(uuid.uuid4()),
            )

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_records_error_on_failure(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.side_effect = RuntimeError("IMAP connect failed")
        mock_imap_cls.return_value = mock_imap

        with pytest.raises(RuntimeError, match="IMAP connect failed"):
            run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT last_sync_error FROM email_connections WHERE connection_id = %s",
                    (conn_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert "IMAP connect failed" in (row["last_sync_error"] or "")

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_marks_read_when_configured(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Enable sync_mark_read on the connection
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE email_connections SET sync_mark_read = true WHERE connection_id = %s",
                    (conn_id,),
                )
            conn.commit()

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [
            _make_email_msg(uid="401", message_id="<mark-read@example.com>"),
        ]
        mock_imap_cls.return_value = mock_imap

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        mock_imap.mark_read.assert_called_once_with("INBOX", [401])

    @patch("app.email.sync.ImapClient")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_item_has_correct_jsonld_type(
        self,
        mock_get_token,
        mock_imap_cls,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_imap = MagicMock()
        mock_imap.fetch_since_uid.return_value = [
            _make_email_msg(
                uid="601",
                message_id="<jsonld-test@example.com>",
                subject="Prüfung des Antrags",
            ),
        ]
        mock_imap_cls.return_value = mock_imap

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT schema_jsonld FROM items
                    WHERE org_id = %s AND source = 'gmail'
                    AND schema_jsonld->>'name' = 'Prüfung des Antrags'
                    """,
                    (org_id,),
                )
                row = cur.fetchone()
                assert row is not None
                entity = row["schema_jsonld"]
                assert entity["@type"] == "EmailMessage"
                assert entity["name"] == "Prüfung des Antrags"
                assert entity["@id"].startswith("urn:app:email:")
