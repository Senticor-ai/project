"""Tests for email/watch_worker.py — Pub/Sub notification processing."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from app.email.pubsub import PubSubMessage
from app.email.watch_worker import (
    process_notifications,
    renew_expiring_watches,
)


def _make_pubsub_message(
    email: str = "user@gmail.com",
    history_id: int = 12345,
    ack_id: str = "ack_1",
) -> PubSubMessage:
    return PubSubMessage(
        ack_id=ack_id,
        email_address=email,
        history_id=history_id,
        publish_time=datetime.now(UTC).isoformat(),
    )


class TestProcessNotifications:
    @patch("app.email.watch_worker.enqueue_event")
    @patch("app.email.watch_worker._find_connection_by_email")
    def test_enqueues_sync_for_known_email(self, mock_find, mock_enqueue):
        mock_find.return_value = {
            "connection_id": "conn-1",
            "org_id": "org-1",
            "user_id": "user-1",
        }

        client = MagicMock()
        client.pull.return_value = [
            _make_pubsub_message(email="test@gmail.com", ack_id="ack_1"),
        ]

        result = process_notifications(client)

        assert result == 1
        mock_enqueue.assert_called_once_with(
            "email_sync_job",
            {
                "connection_id": "conn-1",
                "org_id": "org-1",
                "user_id": "user-1",
            },
        )
        client.acknowledge.assert_called_once_with(["ack_1"])

    @patch("app.email.watch_worker.enqueue_event")
    @patch("app.email.watch_worker._find_connection_by_email")
    def test_skips_unknown_email_but_acks(self, mock_find, mock_enqueue):
        mock_find.return_value = None

        client = MagicMock()
        client.pull.return_value = [
            _make_pubsub_message(email="unknown@gmail.com", ack_id="ack_2"),
        ]

        result = process_notifications(client)

        assert result == 0
        mock_enqueue.assert_not_called()
        client.acknowledge.assert_called_once_with(["ack_2"])

    @patch("app.email.watch_worker.enqueue_event")
    @patch("app.email.watch_worker._find_connection_by_email")
    def test_deduplicates_same_email(self, mock_find, mock_enqueue):
        """Multiple notifications for same email → single sync job."""
        mock_find.return_value = {
            "connection_id": "conn-1",
            "org_id": "org-1",
            "user_id": "user-1",
        }

        client = MagicMock()
        client.pull.return_value = [
            _make_pubsub_message(email="test@gmail.com", ack_id="ack_1"),
            _make_pubsub_message(email="test@gmail.com", ack_id="ack_2"),
            _make_pubsub_message(email="test@gmail.com", ack_id="ack_3"),
        ]

        result = process_notifications(client)

        assert result == 1  # Only one sync job for same email
        mock_enqueue.assert_called_once()
        # All messages should be acknowledged
        client.acknowledge.assert_called_once_with(["ack_1", "ack_2", "ack_3"])

    @patch("app.email.watch_worker.enqueue_event")
    @patch("app.email.watch_worker._find_connection_by_email")
    def test_multiple_emails_multiple_jobs(self, mock_find, mock_enqueue):
        mock_find.side_effect = [
            {"connection_id": "conn-1", "org_id": "org-1", "user_id": "user-1"},
            {"connection_id": "conn-2", "org_id": "org-1", "user_id": "user-2"},
        ]

        client = MagicMock()
        client.pull.return_value = [
            _make_pubsub_message(email="a@gmail.com", ack_id="ack_a"),
            _make_pubsub_message(email="b@gmail.com", ack_id="ack_b"),
        ]

        result = process_notifications(client)

        assert result == 2
        assert mock_enqueue.call_count == 2

    def test_empty_pull_returns_zero(self):
        client = MagicMock()
        client.pull.return_value = []

        result = process_notifications(client)

        assert result == 0
        client.acknowledge.assert_not_called()


class TestRenewExpiringWatches:
    @patch("app.email.watch_worker.register_watch")
    @patch("app.email.watch_worker.db_conn")
    def test_renews_expiring_watches(self, mock_db_conn, mock_register):
        # Mock a connection with watch expiring in 6 hours (within 12h buffer)
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {"connection_id": "conn-1", "org_id": "org-1"},
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db_conn.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_db_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = renew_expiring_watches(buffer_hours=12)

        assert result == 1
        mock_register.assert_called_once_with("conn-1", "org-1")

    @patch("app.email.watch_worker.register_watch")
    @patch("app.email.watch_worker.db_conn")
    def test_handles_renewal_failure_gracefully(self, mock_db_conn, mock_register):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {"connection_id": "conn-1", "org_id": "org-1"},
            {"connection_id": "conn-2", "org_id": "org-1"},
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db_conn.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_db_conn.return_value.__exit__ = MagicMock(return_value=False)

        # First renewal succeeds, second fails
        mock_register.side_effect = [None, RuntimeError("token expired")]

        result = renew_expiring_watches(buffer_hours=12)

        # Only 1 succeeded, the other failed gracefully
        assert result == 1
        assert mock_register.call_count == 2
