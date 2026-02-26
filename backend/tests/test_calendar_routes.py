"""Integration tests for calendar event APIs."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.db import db_conn, jsonb


def _seed_connection(*, org_id: str, user_id: str, email_address: str = "me@example.com") -> str:
    connection_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO email_connections
                    (connection_id, org_id, user_id, email_address, display_name,
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, sync_mark_read,
                     calendar_sync_enabled, calendar_selected_ids, calendar_sync_tokens)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, false, true, %s, %s)
                """,
                (
                    connection_id,
                    org_id,
                    user_id,
                    email_address,
                    "Calendar Tester",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                    jsonb(["primary"]),
                    jsonb({}),
                ),
            )
        conn.commit()
    return connection_id


def _seed_google_calendar_item(*, org_id: str, user_id: str, canonical_id: str) -> str:
    item_id = str(uuid.uuid4())
    schema = {
        "@context": "https://schema.org",
        "@id": canonical_id,
        "@type": "Event",
        "name": "Team Sync",
        "startDate": "2026-03-01T10:00:00Z",
        "endDate": "2026-03-01T10:30:00Z",
        "additionalProperty": [
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": "calendar",
            }
        ],
        "sourceMetadata": {
            "provider": "google_calendar",
            "raw": {
                "calendarId": "primary",
                "eventId": "evt-route-1",
                "attendees": [
                    {"email": "me@example.com"},
                    {"email": "colleague@example.com"},
                ],
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
                    canonical_id,
                    jsonb(schema),
                    "google_calendar",
                    f"hash-{item_id}",
                ),
            )
        conn.commit()
    return item_id


def _get_property(item: dict, property_id: str):
    props = item.get("additionalProperty") or []
    for prop in props:
        if prop.get("propertyID") == property_id:
            return prop.get("value")
    return None


def test_list_calendar_events_includes_access_role_and_writable(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-list-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "reader"}]},
    )

    response = auth_client.get("/calendar/events")
    assert response.status_code == 200
    payload = response.json()
    event = next((row for row in payload if row["canonical_id"] == canonical_id), None)
    assert event is not None
    assert event["provider"] == "google_calendar"
    assert event["access_role"] == "reader"
    assert event["writable"] is False
    assert event["sync_state"] == "Synced"


def test_patch_calendar_event_propagates_reschedule_to_google(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-patch-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    update_calls: list[dict] = []

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "owner"}]},
    )

    def _fake_update_event(_token, event_id, *, body, calendar_id="primary"):
        update_calls.append({"event_id": event_id, "body": body, "calendar_id": calendar_id})
        return {"id": event_id}

    monkeypatch.setattr("app.routes.calendar.google_calendar_api.update_event", _fake_update_event)

    response = auth_client.patch(
        f"/calendar/events/{canonical_id}",
        json={
            "start_date": "2026-03-01T11:00:00Z",
            "end_date": "2026-03-01T11:30:00Z",
        },
        headers={"Idempotency-Key": f"cal-patch-{uuid.uuid4()}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["start_date"] == "2026-03-01T11:00:00Z"
    assert payload["end_date"] == "2026-03-01T11:30:00Z"

    assert len(update_calls) == 1
    call = update_calls[0]
    assert call["event_id"] == "evt-route-1"
    assert call["calendar_id"] == "primary"
    assert call["body"]["start"]["dateTime"] == "2026-03-01T11:00:00Z"
    assert call["body"]["end"]["dateTime"] == "2026-03-01T11:30:00Z"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema_jsonld
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
            assert row is not None
            item = row["schema_jsonld"]
            assert item["startDate"] == "2026-03-01T11:00:00Z"
            assert item["endDate"] == "2026-03-01T11:30:00Z"


def test_patch_calendar_event_normalizes_offset_timestamps_to_utc(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-patch-tz-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    update_calls: list[dict] = []

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "owner"}]},
    )

    def _fake_update_event(_token, event_id, *, body, calendar_id="primary"):
        update_calls.append({"event_id": event_id, "body": body, "calendar_id": calendar_id})
        return {"id": event_id}

    monkeypatch.setattr("app.routes.calendar.google_calendar_api.update_event", _fake_update_event)

    response = auth_client.patch(
        f"/calendar/events/{canonical_id}",
        json={
            "start_date": "2026-03-01T11:00:00+01:00",
            "end_date": "2026-03-01T11:30:00+01:00",
        },
        headers={"Idempotency-Key": f"cal-patch-tz-{uuid.uuid4()}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["start_date"] == "2026-03-01T10:00:00Z"
    assert payload["end_date"] == "2026-03-01T10:30:00Z"

    assert len(update_calls) == 1
    assert update_calls[0]["body"]["start"]["dateTime"] == "2026-03-01T10:00:00Z"
    assert update_calls[0]["body"]["end"]["dateTime"] == "2026-03-01T10:30:00Z"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema_jsonld
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
            assert row is not None
            item = row["schema_jsonld"]
            assert item["startDate"] == "2026-03-01T10:00:00Z"
            assert item["endDate"] == "2026-03-01T10:30:00Z"


def test_patch_calendar_event_rejects_invalid_start_date(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-patch-invalid-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "owner"}]},
    )

    response = auth_client.patch(
        f"/calendar/events/{canonical_id}",
        json={"start_date": ""},
        headers={"Idempotency-Key": f"cal-patch-invalid-{uuid.uuid4()}"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid start_date value"


def test_rsvp_updates_google_attendees_and_local_property(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-rsvp-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    update_calls: list[dict] = []

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "reader"}]},
    )
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.get_event",
        lambda *_a, **_k: {
            "id": "evt-route-1",
            "attendees": [
                {"email": "me@example.com", "responseStatus": "needsAction"},
                {"email": "colleague@example.com", "responseStatus": "accepted"},
            ],
        },
    )

    def _fake_update_event(_token, event_id, *, body, calendar_id="primary"):
        update_calls.append({"event_id": event_id, "body": body, "calendar_id": calendar_id})
        return {"id": event_id}

    monkeypatch.setattr("app.routes.calendar.google_calendar_api.update_event", _fake_update_event)

    response = auth_client.post(
        f"/calendar/events/{canonical_id}/rsvp",
        json={"status": "tentative"},
        headers={"Idempotency-Key": f"cal-rsvp-{uuid.uuid4()}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["rsvp_status"] == "tentative"

    assert len(update_calls) == 1
    attendees = update_calls[0]["body"]["attendees"]
    me_attendee = next((att for att in attendees if att.get("email") == "me@example.com"), None)
    assert me_attendee is not None
    assert me_attendee["responseStatus"] == "tentative"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema_jsonld
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
            assert row is not None
            assert _get_property(row["schema_jsonld"], "app:rsvpStatus") == "tentative"


def test_delete_non_writable_event_falls_back_to_decline(auth_client, monkeypatch):
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-delete-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    update_calls: list[dict] = []

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "reader"}]},
    )
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.get_event",
        lambda *_a, **_k: {
            "id": "evt-route-1",
            "attendees": [{"email": "me@example.com", "responseStatus": "needsAction"}],
        },
    )

    def _fake_update_event(_token, event_id, *, body, calendar_id="primary"):
        update_calls.append({"event_id": event_id, "body": body, "calendar_id": calendar_id})
        return {"id": event_id}

    def _delete_should_not_be_called(*_a, **_k):
        raise AssertionError("delete_event should not be used for non-writable calendar")

    monkeypatch.setattr("app.routes.calendar.google_calendar_api.update_event", _fake_update_event)
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.delete_event", _delete_should_not_be_called
    )

    response = auth_client.delete(
        f"/calendar/events/{canonical_id}",
        headers={"Idempotency-Key": f"cal-del-{uuid.uuid4()}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "deleted"
    assert payload["provider_action"] == "declined_fallback"

    assert len(update_calls) == 1
    attendees = update_calls[0]["body"]["attendees"]
    me_attendee = next((att for att in attendees if att.get("email") == "me@example.com"), None)
    assert me_attendee is not None
    assert me_attendee["responseStatus"] == "declined"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT archived_at
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
            assert row is not None
            assert row["archived_at"] is not None


# ---------------------------------------------------------------------------
# POST /calendar/events — create local-only calendar events
# ---------------------------------------------------------------------------


def test_create_calendar_event_returns_201_with_local_only(auth_client):
    """POST /calendar/events creates a local-only event with required fields."""
    response = auth_client.post(
        "/calendar/events",
        json={"name": "Standup", "start_date": "2026-03-10T09:00:00Z"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Standup"
    assert body["start_date"] == "2026-03-10T09:00:00Z"
    assert body["sync_state"] == "Local only"
    assert body["canonical_id"].startswith("urn:app:event:local:")
    assert body["writable"] is True
    assert body["source"] == "manual"
    assert body["provider"] is None


def test_create_calendar_event_requires_name(auth_client):
    """POST /calendar/events without name returns 422."""
    response = auth_client.post(
        "/calendar/events",
        json={"start_date": "2026-03-10T09:00:00Z"},
    )
    assert response.status_code == 422


def test_create_calendar_event_requires_start_date(auth_client):
    """POST /calendar/events without start_date returns 422."""
    response = auth_client.post(
        "/calendar/events",
        json={"name": "Missing date"},
    )
    assert response.status_code == 422


def test_create_calendar_event_with_all_fields(auth_client):
    """POST /calendar/events accepts optional description, end_date, project_ids."""
    response = auth_client.post(
        "/calendar/events",
        json={
            "name": "Lunch",
            "start_date": "2026-03-10T12:00:00Z",
            "end_date": "2026-03-10T13:00:00Z",
            "description": "With colleagues",
            "project_ids": ["urn:app:project:1"],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Lunch"
    assert body["end_date"] == "2026-03-10T13:00:00Z"
    assert body["description"] == "With colleagues"
    assert body["sync_state"] == "Local only"

    # Verify project_ids persisted in additionalProperty
    org_id = auth_client.headers["X-Org-Id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT schema_jsonld FROM items WHERE org_id = %s AND canonical_id = %s",
                (org_id, body["canonical_id"]),
            )
            row = cur.fetchone()
    assert row is not None
    assert _get_property(row["schema_jsonld"], "app:projectRefs") == ["urn:app:project:1"]


def test_create_calendar_event_normalizes_offset_to_utc(auth_client):
    """POST /calendar/events normalizes offset timestamps to UTC."""
    response = auth_client.post(
        "/calendar/events",
        json={
            "name": "Berlin meeting",
            "start_date": "2026-03-10T11:00:00+01:00",
            "end_date": "2026-03-10T12:00:00+01:00",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["start_date"] == "2026-03-10T10:00:00Z"
    assert body["end_date"] == "2026-03-10T11:00:00Z"


def test_create_calendar_event_supports_allday(auth_client):
    """POST /calendar/events accepts date-only start_date for all-day events."""
    response = auth_client.post(
        "/calendar/events",
        json={"name": "Holiday", "start_date": "2026-03-10"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["start_date"] == "2026-03-10"
    assert body["sync_state"] == "Local only"


# ---------------------------------------------------------------------------
# PATCH /calendar/events/{id} — project_ids extension
# ---------------------------------------------------------------------------


def test_patch_calendar_event_sets_project_refs(auth_client):
    """PATCH with project_ids sets app:projectRefs on the event."""
    # Create a local event first
    create_resp = auth_client.post(
        "/calendar/events",
        json={"name": "Linkable event", "start_date": "2026-03-15T10:00:00Z"},
    )
    assert create_resp.status_code == 201
    canonical_id = create_resp.json()["canonical_id"]

    # Patch with project_ids
    response = auth_client.patch(
        f"/calendar/events/{canonical_id}",
        json={"project_ids": ["urn:app:project:tax-2026"]},
    )
    assert response.status_code == 200

    # Verify persisted
    org_id = auth_client.headers["X-Org-Id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT schema_jsonld FROM items WHERE org_id = %s AND canonical_id = %s",
                (org_id, canonical_id),
            )
            row = cur.fetchone()
    assert row is not None
    assert _get_property(row["schema_jsonld"], "app:projectRefs") == ["urn:app:project:tax-2026"]


def test_patch_calendar_event_removes_project_refs(auth_client):
    """PATCH with empty project_ids clears app:projectRefs."""
    create_resp = auth_client.post(
        "/calendar/events",
        json={
            "name": "Has project",
            "start_date": "2026-03-16T10:00:00Z",
            "project_ids": ["urn:app:project:x"],
        },
    )
    assert create_resp.status_code == 201
    canonical_id = create_resp.json()["canonical_id"]

    response = auth_client.patch(
        f"/calendar/events/{canonical_id}",
        json={"project_ids": []},
    )
    assert response.status_code == 200

    org_id = auth_client.headers["X-Org-Id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT schema_jsonld FROM items WHERE org_id = %s AND canonical_id = %s",
                (org_id, canonical_id),
            )
            row = cur.fetchone()
    assert row is not None
    assert _get_property(row["schema_jsonld"], "app:projectRefs") == []


# ---------------------------------------------------------------------------
# DELETE /calendar/events/{id} — writable (owner) path
# ---------------------------------------------------------------------------


def test_delete_writable_event_calls_google_delete(auth_client, monkeypatch):
    """DELETE on an owner-writable event calls google delete_event (not decline)."""
    org_id = auth_client.headers["X-Org-Id"]
    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    _seed_connection(org_id=org_id, user_id=user_id)
    canonical_id = f"urn:app:event:gcal:primary:evt-route-delown-{uuid.uuid4().hex}"
    _seed_google_calendar_item(org_id=org_id, user_id=user_id, canonical_id=canonical_id)

    delete_calls: list[dict] = []

    monkeypatch.setattr("app.routes.calendar.get_valid_gmail_token", lambda *_a, **_k: "token")
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.calendar_list",
        lambda *_a, **_k: {"items": [{"id": "primary", "accessRole": "owner"}]},
    )

    def _fake_delete_event(_token, event_id, *, calendar_id="primary"):
        delete_calls.append({"event_id": event_id, "calendar_id": calendar_id})

    def _update_should_not_be_called(*_a, **_k):
        raise AssertionError("update_event should not be used for writable delete")

    monkeypatch.setattr("app.routes.calendar.google_calendar_api.delete_event", _fake_delete_event)
    monkeypatch.setattr(
        "app.routes.calendar.google_calendar_api.update_event", _update_should_not_be_called
    )

    response = auth_client.delete(
        f"/calendar/events/{canonical_id}",
        headers={"Idempotency-Key": f"cal-del-own-{uuid.uuid4()}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "deleted"
    assert payload["provider_action"] == "deleted"

    assert len(delete_calls) == 1
    assert delete_calls[0]["event_id"] == "evt-route-1"
    assert delete_calls[0]["calendar_id"] == "primary"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT archived_at
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
            assert row is not None
            assert row["archived_at"] is not None


# ---------------------------------------------------------------------------
# Idempotency key behavior
# ---------------------------------------------------------------------------


def test_idempotency_key_conflict_returns_409(auth_client):
    """Same idempotency key with different payload returns 409."""
    idem_key = f"idem-conflict-{uuid.uuid4()}"
    first = auth_client.post(
        "/calendar/events",
        json={"name": "First event", "start_date": "2026-04-01T09:00:00Z"},
        headers={"Idempotency-Key": idem_key},
    )
    assert first.status_code == 201

    second = auth_client.post(
        "/calendar/events",
        json={"name": "Different event", "start_date": "2026-04-02T10:00:00Z"},
        headers={"Idempotency-Key": idem_key},
    )
    assert second.status_code == 409
    assert "different payload" in second.json()["detail"].lower()


def test_idempotency_key_duplicate_returns_cached_response(auth_client):
    """Same idempotency key with identical payload returns cached 201."""
    idem_key = f"idem-dup-{uuid.uuid4()}"
    payload = {"name": "Repeated event", "start_date": "2026-04-05T14:00:00Z"}

    first = auth_client.post(
        "/calendar/events",
        json=payload,
        headers={"Idempotency-Key": idem_key},
    )
    assert first.status_code == 201
    first_id = first.json()["canonical_id"]

    second = auth_client.post(
        "/calendar/events",
        json=payload,
        headers={"Idempotency-Key": idem_key},
    )
    assert second.status_code == 201
    assert second.json()["canonical_id"] == first_id

    # Only one item should exist in DB
    org_id = auth_client.headers["X-Org-Id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM items
                WHERE org_id = %s AND canonical_id = %s
                """,
                (org_id, first_id),
            )
            row = cur.fetchone()
            assert row["cnt"] == 1
