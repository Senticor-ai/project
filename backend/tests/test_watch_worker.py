"""Tests for email/watch_worker.py — Pub/Sub notification processing."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import httpx
from google.auth.exceptions import TransportError

from app.email.pubsub import PubSubMessage
from app.email.watch_worker import (
    _is_transient_pull_error,
    process_notifications,
    register_missing_watches,
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
            {
                "connection_id": "conn-1",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token",
                "encrypted_refresh_token": "gAAAAA-valid-refresh",
            },
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
            {
                "connection_id": "conn-1",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token",
                "encrypted_refresh_token": "gAAAAA-valid-refresh",
            },
            {
                "connection_id": "conn-2",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token-2",
                "encrypted_refresh_token": "gAAAAA-valid-refresh-2",
            },
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

    @patch("app.email.watch_worker.register_watch")
    @patch("app.email.watch_worker.db_conn")
    def test_skips_connections_with_invalid_token_format(self, mock_db_conn, mock_register):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {
                "connection_id": "conn-valid",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token",
                "encrypted_refresh_token": "gAAAAA-valid-refresh",
            },
            {
                "connection_id": "conn-invalid",
                "org_id": "org-1",
                "encrypted_access_token": "enc-access",
                "encrypted_refresh_token": "enc-refresh",
            },
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db_conn.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_db_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = renew_expiring_watches(buffer_hours=12)

        assert result == 1
        mock_register.assert_called_once_with("conn-valid", "org-1")


class TestRegisterMissingWatches:
    @patch("app.email.watch_worker.register_watch")
    @patch("app.email.watch_worker.db_conn")
    def test_skips_connections_with_invalid_token_format(self, mock_db_conn, mock_register):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {
                "connection_id": "conn-valid",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token",
                "encrypted_refresh_token": "gAAAAA-valid-refresh",
            },
            {
                "connection_id": "conn-empty-refresh",
                "org_id": "org-1",
                "encrypted_access_token": "gAAAAA-valid-token-2",
                "encrypted_refresh_token": "",
            },
            {
                "connection_id": "conn-invalid",
                "org_id": "org-1",
                "encrypted_access_token": "enc-access",
                "encrypted_refresh_token": "enc-refresh",
            },
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_db_conn.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_db_conn.return_value.__exit__ = MagicMock(return_value=False)

        result = register_missing_watches()

        assert result == 2
        assert mock_register.call_count == 2
        called_ids = {(args[0], args[1]) for args, _kwargs in mock_register.call_args_list}
        assert called_ids == {
            ("conn-valid", "org-1"),
            ("conn-empty-refresh", "org-1"),
        }


class TestTransientPullError:
    def _http_status_error(self, status_code: int) -> httpx.HTTPStatusError:
        request = httpx.Request("POST", "https://pubsub.googleapis.com/v1/pull")
        response = httpx.Response(status_code=status_code, request=request)
        return httpx.HTTPStatusError(
            message=f"error {status_code}",
            request=request,
            response=response,
        )

    def test_treats_connect_timeout_and_transport_as_transient(self):
        assert _is_transient_pull_error(httpx.ConnectError("dns failure"))
        assert _is_transient_pull_error(httpx.TimeoutException("timed out"))
        assert _is_transient_pull_error(TransportError("oauth token endpoint failed"))

    def test_treats_transient_http_statuses_as_transient(self):
        for status in (408, 429, 500, 502, 503, 504):
            assert _is_transient_pull_error(self._http_status_error(status))

    def test_does_not_treat_non_transient_errors_as_transient(self):
        assert not _is_transient_pull_error(self._http_status_error(400))
        assert not _is_transient_pull_error(RuntimeError("boom"))
