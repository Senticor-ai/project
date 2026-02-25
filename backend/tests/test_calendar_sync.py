"""Tests for Google Calendar incremental sync."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import httpx
import pytest

from app.db import db_conn, jsonb
from app.email.calendar_sync import CalendarSyncResult, run_calendar_sync


def _make_event(
    event_id: str,
    *,
    summary: str = "Team Sync",
    start: str = "2026-03-01T10:00:00Z",
    end: str = "2026-03-01T10:30:00Z",
    status: str = "confirmed",
) -> dict:
    return {
        "id": event_id,
        "summary": summary,
        "status": status,
        "start": {"dateTime": start},
        "end": {"dateTime": end},
        "attendees": [{"email": "alice@example.com"}],
        "organizer": {"email": "owner@example.com"},
    }


@pytest.fixture()
def calendar_connection(auth_client):
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
                     encrypted_access_token, encrypted_refresh_token, token_expires_at,
                     is_active, sync_interval_minutes, calendar_sync_enabled,
                     calendar_selected_ids, calendar_sync_tokens)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, 0, true, %s, %s)
                """,
                (
                    conn_id,
                    org_id,
                    user_id,
                    "calendar-sync@example.com",
                    "Calendar Sync",
                    "enc-access",
                    "enc-refresh",
                    datetime(2027, 1, 1, tzinfo=UTC),
                    jsonb(["primary"]),
                    jsonb({}),
                ),
            )
        conn.commit()

    return conn_id, org_id, user_id


@patch("app.email.calendar_sync.google_calendar_api.events_list")
def test_backfill_creates_calendar_items_and_persists_sync_token(
    mock_events_list,
    calendar_connection,
):
    conn_id, org_id, user_id = calendar_connection
    mock_events_list.return_value = {
        "items": [
            _make_event("evt_1", summary="Baubesprechung"),
            _make_event("evt_2", summary="Abstimmung"),
        ],
        "nextSyncToken": "sync-token-1",
    }

    result = run_calendar_sync(
        connection_id=conn_id,
        org_id=org_id,
        user_id=user_id,
        access_token="test-access-token",
    )

    assert isinstance(result, CalendarSyncResult)
    assert result.fetched == 2
    assert result.created == 2
    assert result.updated == 0
    assert result.archived == 0
    assert result.errors == 0
    assert result.next_sync_token == "sync-token-1"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM items
                WHERE org_id = %s AND source = 'google_calendar'
                """,
                (org_id,),
            )
            count_row = cur.fetchone()
            assert count_row["cnt"] == 2

            cur.execute(
                """
                SELECT calendar_sync_token, last_calendar_sync_event_count, last_calendar_sync_error
                FROM email_connections
                WHERE connection_id = %s
                """,
                (conn_id,),
            )
            state_row = cur.fetchone()
            assert state_row["calendar_sync_token"] == "sync-token-1"
            assert state_row["last_calendar_sync_event_count"] == 2
            assert state_row["last_calendar_sync_error"] is None


@patch("app.email.calendar_sync.google_calendar_api.events_list")
def test_incremental_updates_and_archives_cancelled_events(
    mock_events_list,
    calendar_connection,
):
    conn_id, org_id, user_id = calendar_connection
    mock_events_list.side_effect = [
        {
            "items": [
                _make_event("evt_1", summary="Alt"),
                _make_event("evt_2", summary="Wird abgesagt"),
            ],
            "nextSyncToken": "sync-token-1",
        },
        {
            "items": [
                _make_event("evt_1", summary="Neu"),
                _make_event("evt_2", status="cancelled"),
            ],
            "nextSyncToken": "sync-token-2",
        },
    ]

    first = run_calendar_sync(
        connection_id=conn_id,
        org_id=org_id,
        user_id=user_id,
        access_token="test-access-token",
    )
    assert first.created == 2

    second = run_calendar_sync(
        connection_id=conn_id,
        org_id=org_id,
        user_id=user_id,
        access_token="test-access-token",
    )
    assert second.updated == 1
    assert second.archived == 1
    assert second.next_sync_token == "sync-token-2"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema_jsonld->>'name' AS name, archived_at
                FROM items
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'eventId' = 'evt_1'
                """,
                (org_id,),
            )
            evt1 = cur.fetchone()
            assert evt1["name"] == "Neu"
            assert evt1["archived_at"] is None

            cur.execute(
                """
                SELECT archived_at
                FROM items
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'eventId' = 'evt_2'
                """,
                (org_id,),
            )
            evt2 = cur.fetchone()
            assert evt2["archived_at"] is not None


@patch("app.email.calendar_sync.google_calendar_api.events_list")
def test_invalid_sync_token_falls_back_to_backfill(mock_events_list, calendar_connection):
    conn_id, org_id, user_id = calendar_connection

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET calendar_sync_token = %s
                WHERE connection_id = %s
                """,
                ("stale-sync-token", conn_id),
            )
        conn.commit()

    request = httpx.Request(
        "GET", "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    )
    response = httpx.Response(
        status_code=410,
        request=request,
        json={"error": {"code": 410, "message": "Sync token is no longer valid"}},
    )
    expired = httpx.HTTPStatusError("Sync token expired", request=request, response=response)

    mock_events_list.side_effect = [
        expired,
        {
            "items": [_make_event("evt_after_reset", summary="Neu nach Reset")],
            "nextSyncToken": "fresh-sync-token",
        },
    ]

    result = run_calendar_sync(
        connection_id=conn_id,
        org_id=org_id,
        user_id=user_id,
        access_token="test-access-token",
    )
    assert result.created == 1
    assert result.next_sync_token == "fresh-sync-token"
    assert mock_events_list.call_count == 2


@patch("app.email.calendar_sync.google_calendar_api.events_list")
def test_syncs_only_opted_in_calendars_and_persists_per_calendar_tokens(
    mock_events_list,
    calendar_connection,
):
    conn_id, org_id, user_id = calendar_connection

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET calendar_selected_ids = %s
                WHERE connection_id = %s
                """,
                (jsonb(["primary", "team@group.calendar.google.com"]), conn_id),
            )
        conn.commit()

    def _events_side_effect(_access_token, **kwargs):
        calendar_id = kwargs.get("calendar_id")
        if calendar_id == "primary":
            return {
                "items": [_make_event("evt_primary_1", summary="Primary Meeting")],
                "nextSyncToken": "tok-primary",
            }
        if calendar_id == "team@group.calendar.google.com":
            return {
                "items": [_make_event("evt_team_1", summary="Team Planning")],
                "nextSyncToken": "tok-team",
            }
        raise AssertionError(f"Unexpected calendar_id: {calendar_id}")

    mock_events_list.side_effect = _events_side_effect

    result = run_calendar_sync(
        connection_id=conn_id,
        org_id=org_id,
        user_id=user_id,
        access_token="test-access-token",
    )

    assert result.fetched == 2
    assert result.created == 2
    assert result.errors == 0
    called_calendar_ids = {
        call.kwargs.get("calendar_id") for call in mock_events_list.call_args_list
    }
    assert called_calendar_ids == {"primary", "team@group.calendar.google.com"}

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM items
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'calendarId'
                    IN ('primary', 'team@group.calendar.google.com')
                """,
                (org_id,),
            )
            row = cur.fetchone()
            assert row["cnt"] == 2

            cur.execute(
                """
                SELECT calendar_sync_tokens
                FROM email_connections
                WHERE connection_id = %s
                """,
                (conn_id,),
            )
            state = cur.fetchone()
            assert state["calendar_sync_tokens"] == {
                "primary": "tok-primary",
                "team@group.calendar.google.com": "tok-team",
            }


@patch("app.email.calendar_sync.google_calendar_api.events_list")
def test_records_actionable_error_for_missing_calendar_permissions(
    mock_events_list,
    calendar_connection,
):
    conn_id, org_id, user_id = calendar_connection

    request = httpx.Request(
        "GET", "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    )
    response = httpx.Response(
        status_code=403,
        request=request,
        json={
            "error": {
                "code": 403,
                "message": "Request had insufficient authentication scopes.",
                "errors": [{"reason": "insufficientPermissions"}],
            }
        },
    )
    mock_events_list.side_effect = httpx.HTTPStatusError(
        "forbidden",
        request=request,
        response=response,
    )

    with pytest.raises(httpx.HTTPStatusError):
        run_calendar_sync(
            connection_id=conn_id,
            org_id=org_id,
            user_id=user_id,
            access_token="test-access-token",
        )

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT last_calendar_sync_error
                FROM email_connections
                WHERE connection_id = %s
                """,
                (conn_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert "Disconnect and reconnect Google" in (row["last_calendar_sync_error"] or "")
