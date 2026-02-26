"""Deterministic black-box e2e test for Gmail + Calendar proposal flow."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db import db_conn, jsonb
from app.devtools.mock_google_workspace_harness import MockGoogleWorkspaceHarness


def _parse_iso_z(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@pytest.fixture()
def mock_google_workspace_harness():
    harness = MockGoogleWorkspaceHarness.start()
    try:
        yield harness
    finally:
        harness.stop()


def _seed_connection_with_history(*, org_id: str, user_id: str, last_history_id: int) -> str:
    connection_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, sync_mark_read, calendar_sync_enabled,
                     calendar_selected_ids, calendar_sync_tokens)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, false, true, %s, %s)
                """,
                (
                    connection_id,
                    org_id,
                    user_id,
                    "mock-user@example.com",
                    "Mock User",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                    jsonb(["primary"]),
                    jsonb({}),
                ),
            )
            cur.execute(
                """
                INSERT INTO email_sync_state (connection_id, folder_name, last_history_id)
                VALUES (%s, 'INBOX', %s)
                """,
                (connection_id, last_history_id),
            )
        conn.commit()
    return connection_id


def test_urgent_schedule_flow_black_box_with_mock_google_workspace(
    auth_client,
    monkeypatch,
    mock_google_workspace_harness,
):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    connection_id = _seed_connection_with_history(
        org_id=org_id,
        user_id=user_id,
        last_history_id=10_000,
    )

    message_id = "msg-urgent-schedule-1"
    mock_google_workspace_harness.seed_gmail_message(
        message_id=message_id,
        subject="Urgent: can we schedule a meeting ASAP?",
        body_text="Need a quick sync as soon as possible.",
        sender="Colleague <contact@example.com>",
        to="Me <me@example.com>",
        history_id="10001",
    )
    mock_google_workspace_harness.set_history_from_messages(
        message_ids=[message_id],
        history_id="10001",
    )

    busy_start = datetime.now(UTC) + timedelta(minutes=5)
    busy_end = busy_start + timedelta(minutes=30)
    mock_google_workspace_harness.seed_calendar_events(
        calendar_id="primary",
        next_sync_token="sync-primary-1",
        events=[
            {
                "id": "evt-busy-primary-1",
                "summary": "Already booked",
                "status": "confirmed",
                "start": {"dateTime": busy_start.isoformat().replace("+00:00", "Z")},
                "end": {"dateTime": busy_end.isoformat().replace("+00:00", "Z")},
                "attendees": [{"email": "contact@example.com"}],
                "organizer": {"email": "me@example.com"},
            }
        ],
    )

    monkeypatch.setattr(
        "app.email.gmail_api.GMAIL_API_BASE",
        mock_google_workspace_harness.gmail_api_base,
    )
    monkeypatch.setattr(
        "app.email.google_calendar_api.GCAL_API_BASE",
        mock_google_workspace_harness.calendar_api_base,
    )
    monkeypatch.setattr(
        "app.email.sync.get_valid_gmail_token",
        lambda *_args, **_kwargs: "mock-access-token",
    )
    monkeypatch.setattr(
        "app.email.routes.get_valid_gmail_token",
        lambda *_args, **_kwargs: "mock-access-token",
    )

    sync_res = auth_client.post(f"/email/connections/{connection_id}/sync")
    assert sync_res.status_code == 200
    sync_payload = sync_res.json()
    assert sync_payload["synced"] == 1
    assert sync_payload["created"] == 1
    assert sync_payload["errors"] == 0
    assert sync_payload["calendar_created"] >= 1
    assert sync_payload["calendar_errors"] == 0

    proposals_res = auth_client.get("/email/proposals")
    assert proposals_res.status_code == 200
    proposals = proposals_res.json()
    assert proposals
    proposal = proposals[0]
    assert proposal["proposal_type"] == "Proposal.PersonalRequest"
    assert proposal["status"] == "pending"
    assert proposal["requires_confirmation"] is True

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload
                FROM connector_action_proposals
                WHERE proposal_id = %s
                  AND org_id = %s
                """,
                (proposal["proposal_id"], org_id),
            )
            row = cur.fetchone()
            assert row is not None
            payload = row["payload"]

    event_start = _parse_iso_z(payload["event_start"])
    event_end = _parse_iso_z(payload["event_end"])
    assert event_end - event_start == timedelta(minutes=15)
    assert event_start >= busy_end
    assert payload["urgency"] == "urgent"

    confirm_res = auth_client.post(f"/email/proposals/{proposal['proposal_id']}/confirm")
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "confirmed"

    created_events = mock_google_workspace_harness.calendar_created_events
    assert len(created_events) == 1
    created_call = created_events[0]
    assert created_call["calendar_id"] == "primary"
    assert created_call["body"]["start"]["dateTime"] == payload["event_start"]
    assert created_call["body"]["end"]["dateTime"] == payload["event_end"]

    sent_messages = mock_google_workspace_harness.gmail_sent_messages
    assert len(sent_messages) == 1
    sent_reply = sent_messages[0]
    assert sent_reply["thread_id"] == f"thread-{message_id}"
    assert sent_reply["to"] == "contact@example.com"
    assert "next available 15-minute slot" in sent_reply["body"].lower()
