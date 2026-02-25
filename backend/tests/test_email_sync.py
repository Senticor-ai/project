"""Tests for email/sync.py — sync orchestrator with mocked Gmail API."""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import httpx
import pytest

from app.db import db_conn, jsonb
from app.email.sync import (
    SyncResult,
    _parse_address,
    _parse_recipients,
    gmail_api_to_email_message,
    run_email_sync,
)

# ---------------------------------------------------------------------------
# Gmail API message fixtures
# ---------------------------------------------------------------------------


def _make_gmail_message(
    msg_id: str = "msg_101",
    message_id_header: str = "<sync-test@example.com>",
    subject: str = "Testbetreff",
    sender: str = "Test Sender <sender@example.de>",
    to: str = "Recipient <to@example.de>",
    body_text: str = "Testinhalt der E-Mail.",
    internal_date: str = "1707559200000",  # 2024-02-10T10:00:00Z
    history_id: str = "12345",
    label_ids: list[str] | None = None,
) -> dict:
    """Build a Gmail API messages.get response."""
    return {
        "id": msg_id,
        "threadId": f"thread_{msg_id}",
        "labelIds": label_ids or ["INBOX", "UNREAD"],
        "historyId": history_id,
        "internalDate": internal_date,
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": sender},
                {"name": "To", "value": to},
                {"name": "Message-ID", "value": message_id_header},
            ],
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {
                        "data": base64.urlsafe_b64encode(body_text.encode()).decode(),
                    },
                },
            ],
        },
    }


def _make_history_response(
    message_ids: list[str],
    history_id: str = "12345",
) -> dict:
    """Build a Gmail API history.list response."""
    history = []
    for i, mid in enumerate(message_ids):
        history.append(
            {
                "id": str(10000 + i),
                "messagesAdded": [
                    {
                        "message": {
                            "id": mid,
                            "labelIds": ["INBOX", "UNREAD"],
                        },
                    },
                ],
            }
        )
    return {"history": history, "historyId": history_id}


# ---------------------------------------------------------------------------
# gmail_api_to_email_message unit tests
# ---------------------------------------------------------------------------


class TestGmailApiToEmailMessage:
    def test_parses_basic_message(self):
        gmail_msg = _make_gmail_message()
        result = gmail_api_to_email_message(gmail_msg)

        assert result.uid == "msg_101"
        assert result.message_id == "<sync-test@example.com>"
        assert result.subject == "Testbetreff"
        assert result.sender_email == "sender@example.de"
        assert result.sender_name == "Test Sender"
        assert result.body_text == "Testinhalt der E-Mail."
        assert result.received_at is not None
        assert len(result.recipients) == 1
        assert result.recipients[0]["email"] == "to@example.de"
        assert result.recipients[0]["type"] == "to"

    def test_parses_bare_email_sender(self):
        gmail_msg = _make_gmail_message(sender="bare@example.com")
        result = gmail_api_to_email_message(gmail_msg)
        assert result.sender_email == "bare@example.com"
        assert result.sender_name is None

    def test_parses_cc_recipients(self):
        gmail_msg = _make_gmail_message()
        gmail_msg["payload"]["headers"].append({"name": "Cc", "value": "CC User <cc@example.de>"})
        result = gmail_api_to_email_message(gmail_msg)
        cc = [r for r in result.recipients if r["type"] == "cc"]
        assert len(cc) == 1
        assert cc[0]["email"] == "cc@example.de"

    def test_handles_missing_body(self):
        gmail_msg = _make_gmail_message()
        gmail_msg["payload"]["parts"] = []
        result = gmail_api_to_email_message(gmail_msg)
        assert result.body_text is None
        assert result.body_html is None

    def test_handles_missing_internal_date(self):
        gmail_msg = _make_gmail_message()
        del gmail_msg["internalDate"]
        result = gmail_api_to_email_message(gmail_msg)
        assert result.received_at is None


class TestParseAddress:
    def test_name_and_email(self):
        name, email = _parse_address("John Doe <john@example.com>")
        assert name == "John Doe"
        assert email == "john@example.com"

    def test_bare_email(self):
        name, email = _parse_address("john@example.com")
        assert name is None
        assert email == "john@example.com"

    def test_quoted_name(self):
        name, email = _parse_address('"Doe, John" <john@example.com>')
        assert name == "Doe, John"
        assert email == "john@example.com"


class TestParseRecipients:
    def test_multiple_to(self):
        result = _parse_recipients("a@x.com, B <b@x.com>", None)
        assert len(result) == 2
        assert result[0]["email"] == "a@x.com"
        assert result[0]["type"] == "to"
        assert result[1]["email"] == "b@x.com"
        assert result[1]["name"] == "B"

    def test_cc_only(self):
        result = _parse_recipients(None, "cc@x.com")
        assert len(result) == 1
        assert result[0]["type"] == "cc"


# ---------------------------------------------------------------------------
# Integration tests (DB-backed)
# ---------------------------------------------------------------------------


@pytest.fixture()
def email_connection(auth_client):
    """Create a real email_connections row and return (connection_id, org_id, user_id)."""
    org_id = auth_client.headers["X-Org-Id"]
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
            # Create sync state row with a history ID
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', 10000)
                """,
                (conn_id,),
            )
        conn.commit()

    yield conn_id, org_id, user_id

    # Cleanup: deactivate to prevent enqueue_due_syncs() picking up fake tokens
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE email_connections SET is_active = false WHERE connection_id = %s",
                (conn_id,),
            )
        conn.commit()


class TestRunEmailSync:
    @patch("app.email.sync.process_proposal_candidates")
    @patch("app.email.sync.enqueue_candidates_for_email_items")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_creates_new_items(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue_candidates,
        mock_process_candidates,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_1", "msg_2"], history_id="10002"
        )
        mock_gmail_api.message_get.side_effect = [
            _make_gmail_message(msg_id="msg_1", message_id_header="<msg-1@example.com>"),
            _make_gmail_message(msg_id="msg_2", message_id_header="<msg-2@example.com>"),
        ]

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert isinstance(result, SyncResult)
        assert result.synced == 2
        assert result.created == 2
        assert result.skipped == 0
        assert result.errors == 0
        mock_enqueue_candidates.assert_called_once()
        enqueue_kwargs = mock_enqueue_candidates.call_args.kwargs
        assert enqueue_kwargs["org_id"] == org_id
        assert enqueue_kwargs["user_id"] == user_id
        assert enqueue_kwargs["connection_id"] == conn_id
        assert len(enqueue_kwargs["item_ids"]) == 2
        mock_process_candidates.assert_called_once_with(org_id=org_id, user_id=user_id, limit=10)

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

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_skips_messages_that_are_not_currently_in_inbox(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_not_inbox"], history_id="10002"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_not_inbox",
            message_id_header="<msg-not-inbox@example.com>",
            label_ids=["SENT"],
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)
        assert result.synced == 1
        assert result.created == 0
        assert result.skipped == 1

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) AS cnt FROM items WHERE org_id = %s AND source = 'gmail'",
                    (org_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["cnt"] == 0

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_deduplicates_existing_items(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        gmail_msg = _make_gmail_message(
            msg_id="msg_dedup",
            message_id_header="<dedup-test@example.com>",
            history_id="10001",
        )
        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_dedup"], history_id="10001"
        )
        mock_gmail_api.message_get.return_value = gmail_msg

        # First sync — should create
        result1 = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)
        assert result1.created == 1

        # Second sync with same message — should skip
        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_dedup"], history_id="10002"
        )
        result2 = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)
        assert result2.skipped == 1
        assert result2.created == 0

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_updates_sync_state(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_state"], history_id="50000"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_state",
            message_id_header="<state-test@example.com>",
        )

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_history_id FROM email_sync_state
                    WHERE connection_id = %s AND folder_name = 'INBOX'
                    """,
                    (conn_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["last_history_id"] == 50000

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_no_messages_returns_zero(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = {
            "history": [],
            "historyId": "10000",
        }

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.synced == 0
        assert result.created == 0

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_updates_connection_metadata(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_meta"], history_id="10001"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_meta",
            message_id_header="<meta-test@example.com>",
        )

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

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_records_error_on_failure(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.side_effect = RuntimeError("Gmail API error")

        with pytest.raises(RuntimeError, match="Gmail API error"):
            run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT last_sync_error FROM email_connections WHERE connection_id = %s",
                    (conn_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert "Gmail API error" in (row["last_sync_error"] or "")

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_marks_read_when_configured(
        self,
        mock_get_token,
        mock_gmail_api,
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

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_read"], history_id="10001"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_read",
            message_id_header="<mark-read@example.com>",
        )

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        mock_gmail_api.message_modify.assert_called_once_with(
            "fake-access-token",
            "msg_read",
            remove_label_ids=["UNREAD"],
        )

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_item_has_correct_jsonld_type(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_jsonld"], history_id="10001"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_jsonld",
            message_id_header="<jsonld-test@example.com>",
            subject="Prüfung des Antrags",
        )

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

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_history_expired_falls_back_to_messages_list(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # history_list returns 404 → fallback to messages_list
        mock_gmail_api.history_list.side_effect = httpx.HTTPStatusError(
            "Not Found",
            request=httpx.Request("GET", "https://example.com"),
            response=httpx.Response(404),
        )
        mock_gmail_api.messages_list.return_value = [
            {"id": "msg_fallback", "threadId": "thread_1"},
        ]
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_fallback",
            message_id_header="<fallback@example.com>",
            history_id="20000",
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.synced == 1
        assert result.created == 1
        mock_gmail_api.messages_list.assert_called_once_with(
            "fake-access-token",
            query="in:inbox newer_than:7d",
            max_results=100,
        )

    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_stores_gmail_message_id_in_source_metadata(
        self,
        mock_get_token,
        mock_gmail_api,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        mock_gmail_api.history_list.return_value = _make_history_response(
            ["msg_meta_id"], history_id="10001"
        )
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_meta_id",
            message_id_header="<meta-id@example.com>",
        )

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT schema_jsonld FROM items
                    WHERE org_id = %s AND source = 'gmail'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (org_id,),
                )
                row = cur.fetchone()
                assert row is not None
                raw = row["schema_jsonld"]["sourceMetadata"]["raw"]
                assert raw["gmailMessageId"] == "msg_meta_id"


# ---------------------------------------------------------------------------
# Reverse archive: Gmail → TAY
# ---------------------------------------------------------------------------


def _make_history_with_label_removed(
    message_ids: list[str],
    removed_labels: list[str],
    history_id: str = "12345",
) -> dict:
    """Build a history.list response with labelsRemoved entries."""
    history = []
    for i, mid in enumerate(message_ids):
        history.append(
            {
                "id": str(20000 + i),
                "labelsRemoved": [
                    {
                        "message": {"id": mid, "labelIds": []},
                        "labelIds": removed_labels,
                    },
                ],
            }
        )
    return {"history": history, "historyId": history_id}


def _seed_gmail_item(
    org_id: str,
    user_id: str,
    gmail_message_id: str,
    *,
    archived: bool = False,
) -> str:
    """Insert a gmail-sourced item with a gmailMessageId and return item_id."""
    item_id = str(uuid.uuid4())
    canonical_id = f"urn:app:email:{gmail_message_id}"
    entity = {
        "@type": "EmailMessage",
        "@id": canonical_id,
        "name": "Test Subject",
        "sourceMetadata": {"raw": {"gmailMessageId": gmail_message_id}},
    }
    now = datetime.now(UTC)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO items (
                    item_id, org_id, created_by_user_id, canonical_id,
                    schema_jsonld, source, content_hash,
                    created_at, updated_at, archived_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    item_id,
                    org_id,
                    user_id,
                    canonical_id,
                    jsonb(entity),
                    "gmail",
                    "hash-" + gmail_message_id,
                    now,
                    now,
                    now if archived else None,
                ),
            )
        conn.commit()
    return item_id


class TestSyncArchivesFromGmail:
    """Tests for reverse archive: INBOX label removed in Gmail → archive in TAY."""

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_archives_item_when_inbox_label_removed(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Seed an existing gmail item in TAY
        item_id = _seed_gmail_item(org_id, user_id, "msg_archive_me")

        # History shows INBOX label removed for that message
        mock_gmail_api.history_list.return_value = _make_history_with_label_removed(
            ["msg_archive_me"], ["INBOX"], history_id="10001"
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.archived == 1

        # Verify item is now archived in DB
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT archived_at FROM items WHERE item_id = %s",
                    (item_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["archived_at"] is not None

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_skips_already_archived_item(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Seed an already-archived item
        _seed_gmail_item(org_id, user_id, "msg_already_done", archived=True)

        mock_gmail_api.history_list.return_value = _make_history_with_label_removed(
            ["msg_already_done"], ["INBOX"], history_id="10001"
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.archived == 0
        # No item_archived event should be emitted
        for call in mock_enqueue.call_args_list:
            assert call[0][0] != "item_archived"

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_skips_label_removal_without_inbox(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Seed an item
        _seed_gmail_item(org_id, user_id, "msg_just_read")

        # Only UNREAD removed, not INBOX — should NOT archive
        mock_gmail_api.history_list.return_value = _make_history_with_label_removed(
            ["msg_just_read"], ["UNREAD"], history_id="10001"
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.archived == 0

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_sync_emits_item_archived_event(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        item_id = _seed_gmail_item(org_id, user_id, "msg_emit_event")

        mock_gmail_api.history_list.return_value = _make_history_with_label_removed(
            ["msg_emit_event"], ["INBOX"], history_id="10001"
        )

        run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        # Find the item_archived call
        archived_calls = [c for c in mock_enqueue.call_args_list if c[0][0] == "item_archived"]
        assert len(archived_calls) == 1
        assert archived_calls[0][0][1]["item_id"] == item_id
        assert archived_calls[0][0][1]["org_id"] == org_id


# ---------------------------------------------------------------------------
# Reconciliation during full-sync fallback
# ---------------------------------------------------------------------------


class TestReconciliation:
    """Tests for _reconcile_archived during full-sync fallback."""

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_full_sync_archives_stale_items(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        """Item exists in TAY but gmail message is no longer in inbox."""
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Seed a TAY item for a gmail message that's no longer in inbox
        item_id = _seed_gmail_item(org_id, user_id, "msg_stale")

        # Trigger full-sync fallback by returning 404 from history
        mock_gmail_api.history_list.side_effect = httpx.HTTPStatusError(
            "Not Found",
            request=httpx.Request("GET", "https://example.com"),
            response=httpx.Response(404),
        )
        # Gmail inbox now contains msg_current but NOT msg_stale
        mock_gmail_api.messages_list.return_value = [
            {"id": "msg_current", "threadId": "thread_1"},
        ]
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_current",
            message_id_header="<current@example.com>",
            history_id="20000",
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        # msg_stale should have been archived via reconciliation
        assert result.archived == 1

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT archived_at FROM items WHERE item_id = %s",
                    (item_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["archived_at"] is not None

    @patch("app.email.sync.enqueue_event")
    @patch("app.email.sync.gmail_api")
    @patch("app.email.sync.get_valid_gmail_token")
    def test_full_sync_keeps_items_still_in_inbox(
        self,
        mock_get_token,
        mock_gmail_api,
        mock_enqueue,
        email_connection,
    ):
        """Item exists in TAY and gmail message is still in inbox → keep it."""
        conn_id, org_id, user_id = email_connection
        mock_get_token.return_value = "fake-access-token"

        # Seed a TAY item whose gmail message IS still in inbox
        item_id = _seed_gmail_item(org_id, user_id, "msg_still_there")

        mock_gmail_api.history_list.side_effect = httpx.HTTPStatusError(
            "Not Found",
            request=httpx.Request("GET", "https://example.com"),
            response=httpx.Response(404),
        )
        # Gmail inbox contains the same message
        mock_gmail_api.messages_list.return_value = [
            {"id": "msg_still_there", "threadId": "thread_1"},
        ]
        mock_gmail_api.message_get.return_value = _make_gmail_message(
            msg_id="msg_still_there",
            message_id_header="<still-there@example.com>",
            history_id="20000",
        )

        result = run_email_sync(connection_id=conn_id, org_id=org_id, user_id=user_id)

        assert result.archived == 0

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT archived_at FROM items WHERE item_id = %s",
                    (item_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row["archived_at"] is None
