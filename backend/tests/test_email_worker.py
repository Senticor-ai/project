"""Tests for email worker integration — periodic sync + mark-read on archive."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from app.db import db_conn, jsonb
from app.email.sync import enqueue_due_syncs, sync_email_archive


@pytest.fixture(autouse=True)
def _cleanup_test_connections():
    """Deactivate test email connections after each test to prevent worker pickup."""
    yield
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE email_connections SET is_active = false "
                "WHERE email_address LIKE 'test%@gmail.com'"
            )
        conn.commit()


def _create_email_connection(
    org_id: str,
    user_id: str,
    *,
    email_address: str = "test@gmail.com",
    sync_interval_minutes: int = 15,
    last_sync_at: datetime | None = None,
    is_active: bool = True,
) -> str:
    """Insert a test email connection and return its connection_id."""
    conn_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token,
                     token_expires_at, sync_interval_minutes, last_sync_at,
                     is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    conn_id,
                    org_id,
                    user_id,
                    email_address,
                    f"Gmail ({email_address})",
                    "fake-encrypted-access",
                    "fake-encrypted-refresh",
                    datetime(2026, 12, 31, tzinfo=UTC),
                    sync_interval_minutes,
                    last_sync_at,
                    is_active,
                ),
            )
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', 10000)
                """,
                (conn_id,),
            )
        conn.commit()
    return conn_id


def _create_gmail_item(
    org_id: str,
    user_id: str,
    *,
    gmail_message_id: str = "msg_101",
    sender_email: str = "sender@example.de",
) -> str:
    """Insert a gmail-sourced item and return its item_id."""
    item_id = str(uuid.uuid4())
    canonical_id = f"urn:app:email:{uuid.uuid4().hex[:16]}"
    now = datetime.now(UTC)
    entity = {
        "@id": canonical_id,
        "@type": "EmailMessage",
        "_schemaVersion": 2,
        "name": "Test email subject",
        "sourceMetadata": {
            "schemaVersion": 1,
            "provider": "gmail",
            "rawId": "<test@example.com>",
            "rawType": 0,
            "rawState": 0,
            "raw": {
                "messageId": "<test@example.com>",
                "gmailMessageId": gmail_message_id,
                "from": sender_email,
            },
        },
        "additionalProperty": [
            {"propertyID": "app:bucket", "value": "inbox"},
        ],
    }
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO items
                    (item_id, org_id, created_by_user_id, canonical_id,
                     schema_jsonld, source, content_hash,
                     created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    item_id,
                    org_id,
                    user_id,
                    canonical_id,
                    jsonb(entity),
                    "gmail",
                    "fakehash",
                    now,
                    now,
                ),
            )
        conn.commit()
    return item_id


def _deactivate_all_connections():
    """Deactivate all email connections to isolate enqueue tests."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE email_connections SET is_active = false")
        conn.commit()


def _drain_outbox():
    """Mark all unprocessed outbox events as processed to isolate worker tests."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE outbox_events
                SET processed_at = NOW()
                WHERE processed_at IS NULL
                """
            )
        conn.commit()


class TestEnqueueDueSyncs:
    def test_enqueues_due_connections(self, auth_client):
        """Connections past their sync interval get enqueued."""
        _deactivate_all_connections()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        # Connection due 20 minutes ago (interval=15, last sync 20 min ago)
        _create_email_connection(
            org_id,
            user_id,
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(minutes=20),
        )

        count = enqueue_due_syncs()
        assert count == 1

        # Verify an outbox event was created
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT event_type, payload FROM outbox_events
                    WHERE event_type = 'email_sync_job'
                    AND processed_at IS NULL
                    ORDER BY created_at DESC LIMIT 1
                    """,
                )
                row = cur.fetchone()
        assert row is not None
        assert row["event_type"] == "email_sync_job"
        assert row["payload"]["org_id"] == org_id
        assert row["payload"]["user_id"] == user_id

    def test_enqueues_multiple_due_connections(self, auth_client):
        """All due active connections are enqueued, each with its own connection_id."""
        _deactivate_all_connections()
        _drain_outbox()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        due_one = _create_email_connection(
            org_id,
            user_id,
            email_address="test+one@gmail.com",
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(minutes=20),
        )
        due_two = _create_email_connection(
            org_id,
            user_id,
            email_address="test+two@gmail.com",
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(minutes=90),
        )
        _create_email_connection(
            org_id,
            user_id,
            email_address="test+fresh@gmail.com",
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(minutes=5),
        )

        count = enqueue_due_syncs()
        assert count == 2

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT payload
                    FROM outbox_events
                    WHERE event_type = 'email_sync_job'
                      AND processed_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT 3
                    """
                )
                rows = cur.fetchall()

        connection_ids = {row["payload"]["connection_id"] for row in rows}
        assert due_one in connection_ids
        assert due_two in connection_ids

    def test_skips_not_due_connections(self, auth_client):
        """Connections synced recently are not enqueued."""
        _deactivate_all_connections()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        # Synced just 5 minutes ago with 15-minute interval — not due
        _create_email_connection(
            org_id,
            user_id,
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(minutes=5),
        )

        count = enqueue_due_syncs()
        assert count == 0

    def test_skips_manual_only_connections(self, auth_client):
        """Connections with sync_interval_minutes=0 are never enqueued."""
        _deactivate_all_connections()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(
            org_id,
            user_id,
            sync_interval_minutes=0,
            last_sync_at=datetime.now(UTC) - timedelta(hours=1),
        )

        count = enqueue_due_syncs()
        assert count == 0

    def test_skips_inactive_connections(self, auth_client):
        """Inactive connections are never enqueued."""
        _deactivate_all_connections()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(
            org_id,
            user_id,
            sync_interval_minutes=15,
            last_sync_at=datetime.now(UTC) - timedelta(hours=1),
            is_active=False,
        )

        count = enqueue_due_syncs()
        assert count == 0

    def test_enqueues_never_synced_connection(self, auth_client):
        """Connections with null last_sync_at are always due."""
        _deactivate_all_connections()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(
            org_id,
            user_id,
            sync_interval_minutes=15,
            last_sync_at=None,
        )

        count = enqueue_due_syncs()
        assert count == 1


class TestSyncEmailArchive:
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_archives_email_via_gmail_api(
        self,
        mock_get_token,
        mock_gmail_api,
        auth_client,
    ):
        """sync_email_archive removes UNREAD + INBOX labels in Gmail."""
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(org_id, user_id)
        item_id = _create_gmail_item(org_id, user_id, gmail_message_id="msg_501")

        mock_get_token.return_value = "fake-access-token"

        # Load the item row
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM items WHERE item_id = %s",
                    (item_id,),
                )
                item_row = cur.fetchone()

        sync_email_archive(item_row, org_id)

        mock_gmail_api.message_modify.assert_called_once_with(
            "fake-access-token",
            "msg_501",
            remove_label_ids=["UNREAD", "INBOX"],
        )

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_skips_when_no_gmail_message_id(
        self,
        mock_get_token,
        mock_gmail_api,
        auth_client,
    ):
        """sync_email_archive does nothing when gmailMessageId is missing."""
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(org_id, user_id)

        # Item with no gmailMessageId in sourceMetadata
        item_row = {
            "item_id": str(uuid.uuid4()),
            "org_id": org_id,
            "source": "gmail",
            "schema_jsonld": {
                "sourceMetadata": {"raw": {"messageId": "<test@example.com>"}},
            },
            "created_by_user_id": user_id,
        }

        # Should not raise, just silently skip
        sync_email_archive(item_row, org_id)
        mock_gmail_api.message_modify.assert_not_called()

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_skips_when_no_active_connection(
        self,
        mock_get_token,
        mock_gmail_api,
        auth_client,
    ):
        """sync_email_archive does nothing when no active connection exists."""
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        # No connection created — just an item
        item_row = {
            "item_id": str(uuid.uuid4()),
            "org_id": org_id,
            "source": "gmail",
            "schema_jsonld": {
                "sourceMetadata": {"raw": {"gmailMessageId": "msg_501"}},
            },
            "created_by_user_id": user_id,
        }

        # Should not raise
        sync_email_archive(item_row, org_id)
        mock_gmail_api.message_modify.assert_not_called()

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_handles_api_error_gracefully(
        self,
        mock_get_token,
        mock_gmail_api,
        auth_client,
    ):
        """sync_email_archive logs but doesn't raise on Gmail API errors."""
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(org_id, user_id)
        item_id = _create_gmail_item(org_id, user_id, gmail_message_id="msg_502")

        mock_get_token.return_value = "fake-access-token"
        mock_gmail_api.message_modify.side_effect = RuntimeError("API error")

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM items WHERE item_id = %s",
                    (item_id,),
                )
                item_row = cur.fetchone()

        # Should not raise — just log the error
        sync_email_archive(item_row, org_id)


class TestWorkerEmailSyncJob:
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_process_batch_handles_email_sync_job(
        self,
        mock_get_token,
        mock_gmail_api,
        auth_client,
    ):
        """process_batch processes email_sync_job events."""
        from app.worker import process_batch

        _drain_outbox()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        conn_id = _create_email_connection(org_id, user_id)

        mock_get_token.return_value = "fake-access-token"
        mock_gmail_api.history_list.return_value = {
            "history": [],
            "historyId": "10000",
        }

        # Manually enqueue an email_sync_job event
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO outbox_events (event_type, payload, created_at)
                    VALUES ('email_sync_job', %s, %s)
                    """,
                    (
                        jsonb(
                            {
                                "connection_id": conn_id,
                                "org_id": org_id,
                                "user_id": user_id,
                            }
                        ),
                        datetime.now(UTC),
                    ),
                )
            conn.commit()

        count = process_batch(limit=10)
        assert count >= 1

        # Verify the event was processed
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT processed_at FROM outbox_events
                    WHERE event_type = 'email_sync_job'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                )
                row = cur.fetchone()
        assert row is not None
        assert row["processed_at"] is not None

    @patch("app.worker.sync_email_archive")
    def test_process_batch_marks_read_on_archive(
        self,
        mock_mark_read,
        auth_client,
    ):
        """item_archived events for gmail items trigger sync_email_archive."""
        from app.worker import process_batch

        _drain_outbox()
        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        _create_email_connection(org_id, user_id)
        item_id = _create_gmail_item(org_id, user_id, gmail_message_id="msg_601")

        # Enqueue item_archived event
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO outbox_events (event_type, payload, created_at)
                    VALUES ('item_archived', %s, %s)
                    """,
                    (
                        jsonb({"item_id": item_id, "org_id": org_id}),
                        datetime.now(UTC),
                    ),
                )
            conn.commit()

        process_batch(limit=10)

        # sync_email_archive should have been called with the item row
        mock_mark_read.assert_called_once()
        call_args = mock_mark_read.call_args
        assert str(call_args[0][0]["item_id"]) == item_id  # first positional arg = item_row
        assert str(call_args[0][1]) == org_id  # second positional arg = org_id

    @patch("app.worker.sync_email_archive")
    def test_process_batch_skips_mark_read_for_non_gmail(
        self,
        mock_mark_read,
        auth_client,
    ):
        """item_archived events for non-gmail items skip sync_email_archive."""
        from app.worker import process_batch

        _drain_outbox()

        org_id = auth_client.headers["X-Org-Id"]
        me = auth_client.get("/auth/me")
        user_id = me.json()["id"]

        # Create a manual item (not gmail)
        item_id = str(uuid.uuid4())
        now = datetime.now(UTC)
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO items
                        (item_id, org_id, created_by_user_id, canonical_id,
                         schema_jsonld, source, content_hash,
                         created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item_id,
                        org_id,
                        user_id,
                        f"urn:app:action:{uuid.uuid4().hex[:16]}",
                        jsonb({"@type": "Action", "name": "Manual item"}),
                        "manual",
                        "fakehash",
                        now,
                        now,
                    ),
                )
            conn.commit()

        # Enqueue item_archived event
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO outbox_events (event_type, payload, created_at)
                    VALUES ('item_archived', %s, %s)
                    """,
                    (
                        jsonb({"item_id": item_id, "org_id": org_id}),
                        datetime.now(UTC),
                    ),
                )
            conn.commit()

        process_batch(limit=10)

        # sync_email_archive should NOT have been called
        mock_mark_read.assert_not_called()
