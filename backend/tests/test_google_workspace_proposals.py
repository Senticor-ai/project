"""Integration tests for Google Workspace proposal workflow."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from app.db import db_conn, jsonb


def _seed_connection(*, org_id: str, user_id: str) -> str:
    connection_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, calendar_sync_enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, true)
                """,
                (
                    connection_id,
                    org_id,
                    user_id,
                    "proposal-user@example.com",
                    "Proposal User",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                ),
            )
        conn.commit()
    return connection_id


def _seed_gmail_item(*, org_id: str, user_id: str, message_id: str = "msg-proposal") -> str:
    item_id = str(uuid.uuid4())
    schema = {
        "@context": "https://schema.org",
        "@id": f"urn:app:email:{message_id}",
        "@type": "EmailMessage",
        "name": "Can we reschedule tomorrow's meeting?",
        "description": "Please move the appointment by 30 minutes.",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
        ],
        "sourceMetadata": {
            "provider": "gmail",
            "raw": {
                "gmailMessageId": message_id,
                "threadId": "thread-proposal",
                "from": "contact@example.com",
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
                    item_id,
                    org_id,
                    user_id,
                    schema["@id"],
                    jsonb(schema),
                    "gmail",
                    f"hash-{message_id}",
                ),
            )
        conn.commit()
    return item_id


def _seed_calendar_item(*, org_id: str, user_id: str, event_id: str = "evt-proposal") -> str:
    item_id = str(uuid.uuid4())
    schema = {
        "@context": "https://schema.org",
        "@id": f"urn:app:event:gcal:{event_id}",
        "@type": "Event",
        "name": "Team Sync",
        "startDate": "2026-03-01T10:00:00Z",
        "endDate": "2026-03-01T10:30:00Z",
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "calendar"},
        ],
        "sourceMetadata": {"provider": "google_calendar", "raw": {"eventId": event_id}},
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
                    item_id,
                    org_id,
                    user_id,
                    schema["@id"],
                    jsonb(schema),
                    "google_calendar",
                    f"hash-{event_id}",
                ),
            )
        conn.commit()
    return item_id


@patch("app.email.routes.gmail_api.send_reply")
@patch("app.email.routes.google_calendar_api.update_event")
@patch("app.email.routes.get_valid_gmail_token")
def test_generate_then_confirm_executes_writes_and_persists_audit_log(
    mock_get_token,
    mock_update_event,
    mock_send_reply,
    auth_client,
):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]
    _seed_connection(org_id=org_id, user_id=user_id)
    _seed_gmail_item(org_id=org_id, user_id=user_id)
    _seed_calendar_item(org_id=org_id, user_id=user_id)

    mock_get_token.return_value = "test-access-token"
    mock_update_event.return_value = {"id": "evt-proposal"}
    mock_send_reply.return_value = {"id": "sent-message-id"}

    generate_res = auth_client.post("/email/proposals/generate")
    assert generate_res.status_code == 200
    proposals = generate_res.json()
    assert proposals
    proposal = proposals[0]
    assert proposal["proposal_type"] == "Proposal.RescheduleMeeting"
    assert proposal["requires_confirmation"] is True

    # Generation is read-only: no write API must be called.
    mock_update_event.assert_not_called()
    mock_send_reply.assert_not_called()

    confirm_res = auth_client.post(
        f"/email/proposals/{proposal['proposal_id']}/confirm",
    )
    assert confirm_res.status_code == 200
    payload = confirm_res.json()
    assert payload["status"] == "confirmed"

    mock_update_event.assert_called_once()
    mock_send_reply.assert_called_once()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM connector_action_audit_log
                WHERE org_id = %s
                  AND proposal_id = %s
                """,
                (org_id, proposal["proposal_id"]),
            )
            row = cur.fetchone()
            assert row["cnt"] >= 1
