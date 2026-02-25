"""Google Calendar sync orchestration (backfill + incremental)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from ..db import db_conn, jsonb
from ..imports.shared import (
    _SOURCE_METADATA_SCHEMA_VERSION,
    _build_base_entity,
    _canonical_id,
    _hash_payload,
    _pv,
)
from . import google_calendar_api
from .gmail_oauth import get_valid_gmail_token

logger = logging.getLogger(__name__)


@dataclass
class CalendarSyncResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    archived: int = 0
    errors: int = 0
    next_sync_token: str | None = None


def _extract_google_error_detail(response: httpx.Response) -> tuple[str, set[str]]:
    detail = ""
    reasons: set[str] = set()
    try:
        data = response.json()
    except Exception:
        data = None
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            status = error.get("status")
            if isinstance(message, str) and message.strip():
                detail = message.strip()
            elif isinstance(status, str) and status.strip():
                detail = status.strip()
            raw_errors = error.get("errors")
            if isinstance(raw_errors, list):
                for raw_error in raw_errors:
                    if not isinstance(raw_error, dict):
                        continue
                    reason = raw_error.get("reason")
                    if isinstance(reason, str) and reason.strip():
                        reasons.add(reason.strip())
                    if not detail:
                        message = raw_error.get("message")
                        if isinstance(message, str) and message.strip():
                            detail = message.strip()
    if not detail:
        text = (response.text or "").strip()
        if text:
            detail = text[:500]
    if not detail:
        detail = f"HTTP {response.status_code}"
    return detail, reasons


def _format_calendar_http_error(exc: httpx.HTTPStatusError) -> str:
    response = exc.response
    detail, reasons = _extract_google_error_detail(response)
    if response.status_code == 403:
        if "insufficientPermissions" in reasons:
            return (
                "Google Calendar permission missing. Disconnect and reconnect Google "
                "to grant calendar access."
            )
        if "accessNotConfigured" in reasons:
            return (
                "Google Calendar API is not enabled in this Google Cloud project. "
                "Enable the Calendar API and reconnect."
            )
        return (
            "Google Calendar access denied (HTTP 403). Disconnect and reconnect Google "
            "to refresh permissions. "
            f"Detail: {detail}"
        )
    if response.status_code == 401:
        return (
            "Google Calendar authorization expired. Disconnect and reconnect Google "
            "to refresh credentials."
        )
    return detail


def _event_canonical_id(event_id: str, calendar_id: str) -> str:
    return _canonical_id("event", f"gcal:{calendar_id}:{event_id}")


def _selected_calendar_ids(connection: dict) -> list[str]:
    raw = connection.get("calendar_selected_ids")
    if not isinstance(raw, list):
        return ["primary"]
    selected: list[str] = []
    seen: set[str] = set()
    for value in raw:
        if not isinstance(value, str):
            continue
        calendar_id = value.strip()
        if not calendar_id or calendar_id in seen:
            continue
        seen.add(calendar_id)
        selected.append(calendar_id)
    return selected or ["primary"]


def _existing_sync_tokens(connection: dict) -> dict[str, str]:
    tokens: dict[str, str] = {}
    raw = connection.get("calendar_sync_tokens")
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(key, str) and isinstance(value, str) and value:
                tokens[key] = value
    legacy_primary_token = connection.get("calendar_sync_token")
    if "primary" not in tokens and isinstance(legacy_primary_token, str) and legacy_primary_token:
        tokens["primary"] = legacy_primary_token
    return tokens


def _coerce_event_time(raw: dict[str, Any]) -> str | None:
    if not raw:
        return None
    value = raw.get("dateTime") or raw.get("date")
    if not value:
        return None
    return str(value)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _build_calendar_item(event: dict[str, Any], *, calendar_id: str) -> tuple[str, dict[str, Any]]:
    event_id = str(event["id"])
    canonical_id = _event_canonical_id(event_id, calendar_id)
    summary = str(event.get("summary") or "(Ohne Titel)")
    description = event.get("description")
    if description is not None:
        description = str(description)

    start_value_raw = event.get("start")
    end_value_raw = event.get("end")
    start_raw: dict[str, Any] = start_value_raw if isinstance(start_value_raw, dict) else {}
    end_raw: dict[str, Any] = end_value_raw if isinstance(end_value_raw, dict) else {}
    start_value = _coerce_event_time(start_raw)
    end_value = _coerce_event_time(end_raw)

    now = datetime.now(UTC)
    created_at = _parse_iso(start_value) or now

    source_metadata = {
        "schemaVersion": _SOURCE_METADATA_SCHEMA_VERSION,
        "provider": "google_calendar",
        "rawId": event_id,
        "rawType": 0,
        "rawState": 0,
        "raw": {
            "eventId": event_id,
            "status": event.get("status"),
            "calendarId": calendar_id,
            "organizer": event.get("organizer"),
            "attendees": event.get("attendees", []),
        },
    }

    entity = _build_base_entity(
        canonical_id=canonical_id,
        name=summary,
        description=description,
        keywords=["calendar", "google"],
        created_at=created_at,
        updated_at=now,
        source="google_calendar",
        ports=[],
        source_metadata=source_metadata,
    )
    entity["@type"] = "Event"
    if start_value:
        entity["startDate"] = start_value
    if end_value:
        entity["endDate"] = end_value
    if event.get("location"):
        entity["location"] = str(event["location"])

    # Keep provenance-related properties from base entity and append event fields.
    keep_ids = {"app:provenanceHistory", "app:ports", "app:typedReferences"}
    base_props = [
        p for p in entity.get("additionalProperty", []) if p.get("propertyID") in keep_ids
    ]
    entity["additionalProperty"] = base_props + [
        _pv("app:bucket", "calendar"),
        _pv("app:rawCapture", summary),
        _pv("app:needsEnrichment", False),
        _pv("app:confidence", "high"),
        _pv("app:captureSource", {"kind": "google_calendar", "calendarId": calendar_id}),
    ]
    return canonical_id, entity


def _upsert_event_item(
    *,
    org_id: str,
    user_id: str,
    canonical_id: str,
    entity: dict[str, Any],
) -> bool:
    content_hash = _hash_payload(entity)
    now = datetime.now(UTC)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO items (
                    org_id, created_by_user_id, canonical_id, schema_jsonld, source, content_hash,
                    created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (org_id, canonical_id) DO NOTHING
                RETURNING item_id
                """,
                (
                    org_id,
                    user_id,
                    canonical_id,
                    jsonb(entity),
                    "google_calendar",
                    content_hash,
                    now,
                    now,
                ),
            )
            inserted = cur.fetchone()
            if inserted:
                conn.commit()
                return True

            cur.execute(
                """
                UPDATE items
                SET schema_jsonld = %s,
                    source = 'google_calendar',
                    content_hash = %s,
                    archived_at = NULL,
                    updated_at = %s
                WHERE org_id = %s AND canonical_id = %s
                """,
                (jsonb(entity), content_hash, now, org_id, canonical_id),
            )
        conn.commit()
    return False


def _archive_event_item(*, org_id: str, calendar_id: str, event_id: str) -> bool:
    now = datetime.now(UTC)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET archived_at = %s, updated_at = %s
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND archived_at IS NULL
                  AND COALESCE(
                        schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'calendarId',
                        'primary'
                      ) = %s
                  AND schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'eventId' = %s
                RETURNING item_id
                """,
                (now, now, org_id, calendar_id, event_id),
            )
            row = cur.fetchone()
        conn.commit()
    return bool(row)


def _update_calendar_success(
    *,
    connection_id: str,
    org_id: str,
    next_sync_tokens: dict[str, str],
    event_count: int,
) -> None:
    primary_token = next_sync_tokens.get("primary")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET calendar_sync_tokens = %s,
                    calendar_sync_token = %s,
                    last_calendar_sync_at = now(),
                    last_calendar_sync_event_count = %s,
                    last_calendar_sync_error = NULL,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (
                    jsonb(next_sync_tokens),
                    primary_token,
                    event_count,
                    connection_id,
                    org_id,
                ),
            )
        conn.commit()


def _update_calendar_error(
    *,
    connection_id: str,
    org_id: str,
    message: str,
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET last_calendar_sync_error = %s,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (message[:500], connection_id, org_id),
            )
        conn.commit()


def run_calendar_sync(
    *,
    connection_id: str,
    org_id: str,
    user_id: str,
    access_token: str | None = None,
) -> CalendarSyncResult:
    """Sync calendar events for the given connection.

    Uses sync token when available, otherwise performs a bounded backfill window.
    """
    result = CalendarSyncResult()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM email_connections
                WHERE connection_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, org_id),
            )
            connection = cur.fetchone()

    if not connection:
        raise ValueError(f"Active connection {connection_id} not found")

    if not connection.get("calendar_sync_enabled"):
        return result

    token = access_token or get_valid_gmail_token(connection, org_id)
    selected_calendar_ids = _selected_calendar_ids(connection)
    existing_sync_tokens = _existing_sync_tokens(connection)
    next_sync_tokens = {
        calendar_id: existing_sync_tokens[calendar_id]
        for calendar_id in selected_calendar_ids
        if calendar_id in existing_sync_tokens
    }
    now = datetime.now(UTC)
    time_min = (now - timedelta(days=7)).isoformat().replace("+00:00", "Z")
    time_max = (now + timedelta(days=30)).isoformat().replace("+00:00", "Z")

    try:
        for calendar_id in selected_calendar_ids:
            existing_sync_token = existing_sync_tokens.get(calendar_id)
            try:
                if existing_sync_token:
                    payload = google_calendar_api.events_list(
                        token,
                        calendar_id=calendar_id,
                        sync_token=str(existing_sync_token),
                    )
                else:
                    payload = google_calendar_api.events_list(
                        token,
                        calendar_id=calendar_id,
                        time_min=time_min,
                        time_max=time_max,
                    )
            except httpx.HTTPStatusError as exc:
                if existing_sync_token and exc.response.status_code == 410:
                    logger.warning(
                        "Calendar sync token expired for connection %s and calendar %s; "
                        "performing backfill",
                        connection_id,
                        calendar_id,
                    )
                    payload = google_calendar_api.events_list(
                        token,
                        calendar_id=calendar_id,
                        time_min=time_min,
                        time_max=time_max,
                    )
                else:
                    raise

            events = payload.get("items", [])
            result.fetched += len(events)
            next_sync_token = payload.get("nextSyncToken")
            if isinstance(next_sync_token, str) and next_sync_token:
                next_sync_tokens[calendar_id] = next_sync_token

            for event in events:
                try:
                    event_id = str(event.get("id") or "")
                    if not event_id:
                        result.errors += 1
                        continue
                    if event.get("status") == "cancelled":
                        if _archive_event_item(
                            org_id=org_id,
                            calendar_id=calendar_id,
                            event_id=event_id,
                        ):
                            result.archived += 1
                        continue
                    canonical_id, entity = _build_calendar_item(
                        event,
                        calendar_id=calendar_id,
                    )
                    created = _upsert_event_item(
                        org_id=org_id,
                        user_id=user_id,
                        canonical_id=canonical_id,
                        entity=entity,
                    )
                    if created:
                        result.created += 1
                    else:
                        result.updated += 1
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to process Google Calendar event for connection %s and calendar %s",
                        connection_id,
                        calendar_id,
                        exc_info=True,
                    )
                    result.errors += 1

        if isinstance(next_sync_tokens.get("primary"), str):
            result.next_sync_token = next_sync_tokens["primary"]
        elif selected_calendar_ids:
            result.next_sync_token = next_sync_tokens.get(selected_calendar_ids[0])

        _update_calendar_success(
            connection_id=connection_id,
            org_id=org_id,
            next_sync_tokens=next_sync_tokens,
            event_count=result.fetched,
        )
        return result
    except httpx.HTTPStatusError as exc:
        _update_calendar_error(
            connection_id=connection_id,
            org_id=org_id,
            message=_format_calendar_http_error(exc),
        )
        raise
    except Exception as exc:
        _update_calendar_error(
            connection_id=connection_id,
            org_id=org_id,
            message=str(exc),
        )
        raise
