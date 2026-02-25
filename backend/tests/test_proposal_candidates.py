"""Integration tests for proposal candidate queue + urgent proposal creation."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.email.proposals import enqueue_proposal_candidate, process_proposal_candidates

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
                    "proposal-queue@example.com",
                    "Proposal Queue User",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                ),
            )
        conn.commit()
    return connection_id


def _seed_email_item(*, org_id: str, user_id: str, subject: str, description: str) -> str:
    item_id = str(uuid.uuid4())
    schema = {
        "@context": "https://schema.org",
        "@id": f"urn:app:email:{item_id}",
        "@type": "EmailMessage",
        "name": subject,
        "description": description,
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "inbox"},
        ],
        "sourceMetadata": {
            "provider": "gmail",
            "raw": {
                "gmailMessageId": f"msg-{item_id}",
                "threadId": f"thread-{item_id}",
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
                    f"hash-{item_id}",
                ),
            )
        conn.commit()
    return item_id


def _seed_calendar_item(*, org_id: str, user_id: str, start_at: datetime) -> str:
    item_id = str(uuid.uuid4())
    event_id = f"evt-{item_id}"
    end_at = start_at + timedelta(minutes=30)
    schema = {
        "@context": "https://schema.org",
        "@id": f"urn:app:event:gcal:{event_id}",
        "@type": "Event",
        "name": "4pm Sync",
        "startDate": start_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "endDate": end_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "sourceMetadata": {
            "provider": "google_calendar",
            "raw": {
                "eventId": event_id,
                "calendarId": "primary",
                "attendees": [{"email": "contact@example.com"}],
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
                    "google_calendar",
                    f"hash-{event_id}",
                ),
            )
        conn.commit()
    return item_id


def test_process_candidates_creates_urgent_reschedule_proposal_and_notification(auth_client):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    connection_id = _seed_connection(org_id=org_id, user_id=user_id)
    email_item_id = _seed_email_item(
        org_id=org_id,
        user_id=user_id,
        subject="Can we reschedule today?",
        description="Please move our 4pm meeting by 30 minutes.",
    )
    _seed_calendar_item(
        org_id=org_id,
        user_id=user_id,
        start_at=datetime.now(UTC) + timedelta(hours=1),
    )

    candidate_id = enqueue_proposal_candidate(
        org_id=org_id,
        user_id=user_id,
        connection_id=connection_id,
        source_item_id=email_item_id,
        trigger_kind="email_new",
    )
    assert candidate_id is not None

    result = process_proposal_candidates(org_id=org_id, user_id=user_id, limit=10)
    assert result.processed == 1
    assert result.created >= 1

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT proposal_id, proposal_type, status, payload
                FROM connector_action_proposals
                WHERE org_id = %s
                  AND user_id = %s
                  AND source_item_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (org_id, user_id, email_item_id),
            )
            proposal = cur.fetchone()
            assert proposal is not None
            assert proposal["proposal_type"] == "Proposal.RescheduleMeeting"
            assert proposal["status"] == "pending"
            assert proposal["payload"]["urgency"] == "urgent"

            cur.execute(
                """
                SELECT kind, payload
                FROM notification_events
                WHERE org_id = %s AND user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (org_id, user_id),
            )
            notification = cur.fetchone()
            assert notification is not None
            assert notification["kind"] == "proposal_urgent_created"
            assert notification["payload"]["proposal_id"] == str(proposal["proposal_id"])

            cur.execute(
                """
                SELECT status, processed_at
                FROM proposal_candidates
                WHERE candidate_id = %s
                """,
                (candidate_id,),
            )
            candidate = cur.fetchone()
            assert candidate is not None
            assert candidate["status"] == "completed"
            assert candidate["processed_at"] is not None


def test_process_candidates_reuses_existing_pending_proposal(auth_client):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    connection_id = _seed_connection(org_id=org_id, user_id=user_id)
    email_item_id = _seed_email_item(
        org_id=org_id,
        user_id=user_id,
        subject="Please reschedule our meeting",
        description="Can we move by 30 mins?",
    )
    _seed_calendar_item(
        org_id=org_id,
        user_id=user_id,
        start_at=datetime.now(UTC) + timedelta(hours=2),
    )

    existing_payload = {
        "why": "Existing pending proposal",
        "confidence": "medium",
        "requires_confirmation": True,
        "suggested_actions": ["gcal_update_event", "gmail_send_reply"],
        "urgency": "urgent",
    }
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO connector_action_proposals
                    (org_id, user_id, connection_id, proposal_type, status, source_item_id, payload)
                VALUES (%s, %s, %s, %s, 'pending', %s, %s)
                """,
                (
                    org_id,
                    user_id,
                    connection_id,
                    "Proposal.RescheduleMeeting",
                    email_item_id,
                    jsonb(existing_payload),
                ),
            )
        conn.commit()

    enqueue_proposal_candidate(
        org_id=org_id,
        user_id=user_id,
        connection_id=connection_id,
        source_item_id=email_item_id,
        trigger_kind="email_new",
    )

    result = process_proposal_candidates(org_id=org_id, user_id=user_id, limit=10)
    assert result.processed == 1
    assert result.created == 0
    assert result.existing >= 1

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM connector_action_proposals
                WHERE org_id = %s
                  AND user_id = %s
                  AND source_item_id = %s
                  AND proposal_type = 'Proposal.RescheduleMeeting'
                """,
                (org_id, user_id, email_item_id),
            )
            row = cur.fetchone()
            assert row is not None
            assert row["cnt"] == 1


def test_process_candidates_dead_letters_after_max_attempts(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    connection_id = _seed_connection(org_id=org_id, user_id=user_id)
    email_item_id = _seed_email_item(
        org_id=org_id,
        user_id=user_id,
        subject="Can we reschedule?",
        description="Move by 30 mins.",
    )
    _seed_calendar_item(
        org_id=org_id,
        user_id=user_id,
        start_at=datetime.now(UTC) + timedelta(hours=1),
    )

    candidate_id = enqueue_proposal_candidate(
        org_id=org_id,
        user_id=user_id,
        connection_id=connection_id,
        source_item_id=email_item_id,
        trigger_kind="email_new",
    )
    assert candidate_id is not None

    def _boom(*_args, **_kwargs):
        raise RuntimeError("proposal engine busy")

    monkeypatch.setattr("app.email.proposals.generate_proposals_for_items", _boom)

    first = process_proposal_candidates(org_id=org_id, user_id=user_id, limit=10, max_attempts=2)
    assert first.failed == 1
    assert first.dead_lettered == 0

    second = process_proposal_candidates(org_id=org_id, user_id=user_id, limit=10, max_attempts=2)
    assert second.failed == 1
    assert second.dead_lettered == 1

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status, attempts, dead_lettered_at, last_error
                FROM proposal_candidates
                WHERE candidate_id = %s
                """,
                (candidate_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row["status"] == "dead_letter"
            assert row["attempts"] == 2
            assert row["dead_lettered_at"] is not None
            assert "proposal engine busy" in (row["last_error"] or "")
