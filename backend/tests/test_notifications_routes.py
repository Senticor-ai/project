"""Integration tests for notification APIs."""

from __future__ import annotations

import json

from app.db import db_conn


def test_send_notification_persists_event_and_push_outbox(auth_client):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    response = auth_client.post(
        "/notifications/send",
        json={
            "kind": "proposal_urgent_created",
            "title": "Urgent reschedule",
            "body": "Meeting starts soon. Review proposal.",
            "url": "/settings/email?proposal=abc",
            "payload": {"proposal_id": "abc"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["kind"] == "proposal_urgent_created"
    assert payload["title"] == "Urgent reschedule"
    assert payload["payload"]["proposal_id"] == "abc"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT kind, title, body, url, payload
                FROM notification_events
                WHERE org_id = %s AND user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (org_id, user_id),
            )
            event = cur.fetchone()
            assert event is not None
            assert event["kind"] == "proposal_urgent_created"
            assert event["title"] == "Urgent reschedule"
            assert event["payload"]["proposal_id"] == "abc"

            cur.execute(
                """
                SELECT target_user_id, payload
                FROM push_outbox
                WHERE target_user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            push_row = cur.fetchone()
            assert push_row is not None
            assert str(push_row["target_user_id"]) == user_id
            assert push_row["payload"]["title"] == "Urgent reschedule"


def test_notification_stream_emits_sse_event(auth_client):
    send_response = auth_client.post(
        "/notifications/send",
        json={
            "kind": "proposal_urgent_created",
            "title": "Urgent proposal",
            "body": "Please confirm the reschedule request.",
            "url": "/settings/email?proposal=xyz",
            "payload": {"proposal_id": "xyz"},
        },
    )
    assert send_response.status_code == 200

    response = auth_client.get(
        "/notifications/stream",
        params={"max_events": 1, "poll_seconds": 0.01},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "event: notification" in response.text

    data_lines = [line for line in response.text.splitlines() if line.startswith("data: ")]
    assert data_lines
    first_payload = json.loads(data_lines[0][len("data: ") :])
    assert first_payload["kind"] == "proposal_urgent_created"
    assert first_payload["payload"]["proposal_id"] == "xyz"
