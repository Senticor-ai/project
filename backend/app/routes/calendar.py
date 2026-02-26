"""Calendar event APIs for Project calendar surface."""

from __future__ import annotations

import copy
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..email import google_calendar_api
from ..email.gmail_oauth import get_valid_gmail_token
from ..idempotency import (
    compute_request_hash,
    get_idempotent_response,
    store_idempotent_response,
)
from ..imports.shared import _hash_payload

router = APIRouter(prefix="/calendar", tags=["calendar"])

_WRITABLE_ROLES = {"owner", "writer"}


class CalendarEventResponse(BaseModel):
    item_id: str
    canonical_id: str
    name: str
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    source: str
    provider: str | None = None
    calendar_id: str | None = None
    event_id: str | None = None
    access_role: str | None = None
    writable: bool
    rsvp_status: str | None = None
    sync_state: Literal["Synced", "Saving", "Sync failed", "Local only"]
    updated_at: str


class CalendarEventCreateRequest(BaseModel):
    name: str
    start_date: str
    end_date: str | None = None
    description: str | None = None
    project_ids: list[str] | None = None


class CalendarEventPatchRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    project_ids: list[str] | None = None


class CalendarEventRsvpRequest(BaseModel):
    status: Literal["accepted", "tentative", "declined"]


class CalendarEventDeleteResponse(BaseModel):
    canonical_id: str
    status: Literal["deleted"] = "deleted"
    provider_action: Literal["deleted", "declined_fallback", "local_only"]


def _find_active_connection(org_id: str, user_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM email_connections
                WHERE org_id = %s AND user_id = %s AND is_active = true
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (org_id, user_id),
            )
            row = cur.fetchone()
    return row


def _get_additional_property(item: dict[str, Any], property_id: str) -> Any:
    props = item.get("additionalProperty")
    if not isinstance(props, list):
        return None
    for prop in props:
        if not isinstance(prop, dict):
            continue
        if prop.get("propertyID") == property_id:
            return prop.get("value")
    return None


def _set_additional_property(item: dict[str, Any], property_id: str, value: Any) -> None:
    props = item.get("additionalProperty")
    if not isinstance(props, list):
        props = []
        item["additionalProperty"] = props
    for prop in props:
        if isinstance(prop, dict) and prop.get("propertyID") == property_id:
            prop["value"] = value
            return
    props.append(
        {
            "@type": "PropertyValue",
            "propertyID": property_id,
            "value": value,
        }
    )


def _is_calendar_bucket(item: dict[str, Any]) -> bool:
    return _get_additional_property(item, "app:bucket") == "calendar"


def _extract_provider_fields(item: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    source_metadata = item.get("sourceMetadata")
    if not isinstance(source_metadata, dict):
        return None, None, None
    provider = source_metadata.get("provider")
    raw = source_metadata.get("raw")
    if not isinstance(raw, dict):
        return str(provider) if isinstance(provider, str) else None, None, None
    calendar_id = raw.get("calendarId")
    event_id = raw.get("eventId")
    return (
        str(provider) if isinstance(provider, str) else None,
        str(calendar_id) if isinstance(calendar_id, str) else None,
        str(event_id) if isinstance(event_id, str) else None,
    )


def _event_sync_state(
    item: dict[str, Any], source: str
) -> Literal["Synced", "Saving", "Sync failed", "Local only"]:
    explicit = _get_additional_property(item, "app:syncState")
    if explicit in {"Synced", "Saving", "Sync failed", "Local only"}:
        return explicit
    if source == "google_calendar":
        return "Synced"
    return "Local only"


def _to_event_response(
    row: dict[str, Any],
    *,
    access_roles: dict[str, str],
) -> CalendarEventResponse:
    item = row["schema_jsonld"] or {}
    provider, calendar_id, event_id = _extract_provider_fields(item)

    source = str(row.get("source") or "")
    if not provider and source == "google_calendar":
        provider = "google_calendar"

    role = access_roles.get(calendar_id or "") if provider == "google_calendar" else None
    writable = True
    if provider == "google_calendar":
        writable = (role or "") in _WRITABLE_ROLES

    name = str(item.get("name") or "(Untitled)")
    description_raw = item.get("description")
    description = str(description_raw) if isinstance(description_raw, str) else None

    start_date = item.get("startDate") or item.get("startTime")
    end_date = item.get("endDate")
    rsvp_status = _get_additional_property(item, "app:rsvpStatus")

    updated_at = row["updated_at"].astimezone(UTC).isoformat().replace("+00:00", "Z")

    return CalendarEventResponse(
        item_id=str(row["item_id"]),
        canonical_id=str(row["canonical_id"]),
        name=name,
        description=description,
        start_date=str(start_date) if isinstance(start_date, str) else None,
        end_date=str(end_date) if isinstance(end_date, str) else None,
        source=source,
        provider=provider,
        calendar_id=calendar_id,
        event_id=event_id,
        access_role=role,
        writable=writable,
        rsvp_status=str(rsvp_status) if isinstance(rsvp_status, str) else None,
        sync_state=_event_sync_state(item, source),
        updated_at=updated_at,
    )


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


def _normalize_event_time_value(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if "T" not in normalized:
        return normalized
    parsed = _parse_iso(normalized)
    if parsed is None:
        return normalized
    return parsed.isoformat().replace("+00:00", "Z")


def _load_access_roles(
    *,
    org_id: str,
    user_id: str,
) -> tuple[dict[str, str], dict[str, Any] | None]:
    connection = _find_active_connection(org_id, user_id)
    if connection is None:
        return {}, None
    try:
        token = get_valid_gmail_token(connection, org_id)
        payload = google_calendar_api.calendar_list(token)
    except Exception:
        return {}, connection

    roles: dict[str, str] = {}
    for raw in payload.get("items", []):
        if not isinstance(raw, dict):
            continue
        calendar_id = raw.get("id")
        access_role = raw.get("accessRole")
        if isinstance(calendar_id, str) and isinstance(access_role, str):
            roles[calendar_id] = access_role
    return roles, connection


def _load_calendar_item_row(
    *,
    org_id: str,
    canonical_id: str,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT item_id, canonical_id, source, schema_jsonld, content_hash, updated_at
                FROM items
                WHERE org_id = %s
                  AND canonical_id = %s
                  AND archived_at IS NULL
                LIMIT 1
                """,
                (org_id, canonical_id),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    item = row.get("schema_jsonld") or {}
    if not _is_calendar_bucket(item):
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return row


def _update_item_schema(
    *,
    org_id: str,
    canonical_id: str,
    schema_jsonld: dict[str, Any],
) -> dict[str, Any]:
    content_hash = _hash_payload(schema_jsonld)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET schema_jsonld = %s,
                    content_hash = %s,
                    updated_at = now()
                WHERE org_id = %s
                  AND canonical_id = %s
                  AND archived_at IS NULL
                RETURNING item_id, canonical_id, source, schema_jsonld, content_hash, updated_at
                """,
                (jsonb(schema_jsonld), content_hash, org_id, canonical_id),
            )
            row = cur.fetchone()
        conn.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return row


def _archive_item(
    *,
    org_id: str,
    canonical_id: str,
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET archived_at = now(),
                    updated_at = now()
                WHERE org_id = %s
                  AND canonical_id = %s
                  AND archived_at IS NULL
                """,
                (org_id, canonical_id),
            )
        conn.commit()


def _insert_audit_log(
    *,
    org_id: str,
    user_id: str,
    connection_id: str | None,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO connector_action_audit_log
                    (org_id, user_id, connection_id, proposal_id, event_type, payload)
                VALUES (%s, %s, %s, NULL, %s, %s)
                """,
                (org_id, user_id, connection_id, event_type, jsonb(payload)),
            )
        conn.commit()


def _coerce_google_event_time(value: str | None) -> dict[str, str] | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if "T" in normalized:
        return {"dateTime": normalized}
    return {"date": normalized}


def _apply_google_rsvp(
    *,
    token: str,
    calendar_id: str,
    event_id: str,
    user_email: str,
    status: Literal["accepted", "tentative", "declined"],
) -> None:
    try:
        current = google_calendar_api.get_event(
            token,
            event_id,
            calendar_id=calendar_id,
        )
        attendees = current.get("attendees")
    except Exception:
        attendees = None

    if not isinstance(attendees, list):
        attendees = []

    target = user_email.strip().lower()
    updated = False
    normalized_attendees: list[dict[str, Any]] = []
    for attendee in attendees:
        if not isinstance(attendee, dict):
            continue
        copy_attendee = dict(attendee)
        email = copy_attendee.get("email")
        if isinstance(email, str) and email.strip().lower() == target:
            copy_attendee["responseStatus"] = status
            updated = True
        normalized_attendees.append(copy_attendee)

    if not updated:
        normalized_attendees.append({"email": user_email, "responseStatus": status})

    google_calendar_api.update_event(
        token,
        event_id,
        calendar_id=calendar_id,
        body={"attendees": normalized_attendees},
    )


@router.get(
    "/events",
    response_model=list[CalendarEventResponse],
    summary="List calendar events for Project calendar view",
)
def list_calendar_events(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=2000),
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    org_id = org["org_id"]
    user_id = str(current_user["id"])

    start_filter = _parse_iso(date_from)
    end_filter = _parse_iso(date_to)

    roles, _connection = _load_access_roles(org_id=org_id, user_id=user_id)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT item_id, canonical_id, source, schema_jsonld, content_hash, updated_at
                FROM items
                WHERE org_id = %s
                  AND archived_at IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        COALESCE(schema_jsonld -> 'additionalProperty', '[]'::jsonb)
                    ) AS prop
                    WHERE prop ->> 'propertyID' = 'app:bucket'
                      AND prop ->> 'value' = 'calendar'
                  )
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (org_id, limit),
            )
            rows = cur.fetchall()

    events: list[CalendarEventResponse] = []
    for row in rows:
        event = _to_event_response(row, access_roles=roles)
        start_dt = _parse_iso(event.start_date)
        if start_filter and (start_dt is None or start_dt < start_filter):
            continue
        if end_filter and (start_dt is None or start_dt > end_filter):
            continue
        events.append(event)

    events.sort(key=lambda ev: (ev.start_date or "", ev.updated_at, ev.canonical_id))
    return events


@router.post(
    "/events",
    response_model=CalendarEventResponse,
    status_code=201,
    summary="Create a local calendar event",
)
def create_calendar_event(
    payload: CalendarEventCreateRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    org_id = org["org_id"]
    user_id = str(current_user["id"])

    request_payload = payload.model_dump(mode="json")
    path = "/calendar/events"
    if idempotency_key:
        request_hash = compute_request_hash("POST", path, request_payload)
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached is not None:
            return JSONResponse(status_code=cached["status_code"], content=cached["response"])

    canonical_id = f"urn:app:event:local:{uuid.uuid4()}"

    normalized_start = _normalize_event_time_value(payload.start_date)
    if normalized_start is None:
        raise HTTPException(status_code=400, detail="Invalid start_date value")
    normalized_end = _normalize_event_time_value(payload.end_date) if payload.end_date else None

    additional_props: list[dict[str, Any]] = [
        {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "calendar"},
        {"@type": "PropertyValue", "propertyID": "app:calendarSyncState", "value": "local_only"},
    ]
    if payload.project_ids:
        additional_props.append(
            {
                "@type": "PropertyValue",
                "propertyID": "app:projectRefs",
                "value": payload.project_ids,
            }
        )

    schema_jsonld: dict[str, Any] = {
        "@context": "https://schema.org",
        "@id": canonical_id,
        "@type": "Event",
        "name": payload.name,
        "startDate": normalized_start,
        "additionalProperty": additional_props,
    }
    if normalized_end:
        schema_jsonld["endDate"] = normalized_end
    if payload.description:
        schema_jsonld["description"] = payload.description

    content_hash = _hash_payload(schema_jsonld)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO items
                    (item_id, org_id, created_by_user_id, canonical_id,
                     schema_jsonld, source, content_hash, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, now(), now())
                RETURNING item_id, canonical_id, source, schema_jsonld, content_hash, updated_at
                """,
                (
                    str(uuid.uuid4()),
                    org_id,
                    user_id,
                    canonical_id,
                    jsonb(schema_jsonld),
                    "manual",
                    content_hash,
                ),
            )
            row = cur.fetchone()
        conn.commit()

    response = _to_event_response(row, access_roles={})
    response_payload = response.model_dump(mode="json")

    if idempotency_key:
        request_hash = compute_request_hash("POST", path, request_payload)
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response_payload,
            201,
        )

    return JSONResponse(status_code=201, content=response_payload)


@router.patch(
    "/events/{canonical_id}",
    response_model=CalendarEventResponse,
    summary="Update calendar event fields and propagate to Google when bound",
)
def patch_calendar_event(
    payload: CalendarEventPatchRequest,
    canonical_id: str = Path(...),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    if (
        payload.name is None
        and payload.description is None
        and payload.start_date is None
        and payload.end_date is None
        and payload.project_ids is None
    ):
        raise HTTPException(status_code=400, detail="No update fields provided")

    org_id = org["org_id"]
    user_id = str(current_user["id"])

    request_payload = payload.model_dump(mode="json")
    path = f"/calendar/events/{canonical_id}"
    if idempotency_key:
        request_hash = compute_request_hash("PATCH", path, request_payload)
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached is not None:
            return JSONResponse(status_code=cached["status_code"], content=cached["response"])

    row = _load_calendar_item_row(org_id=org_id, canonical_id=canonical_id)
    item = copy.deepcopy(row["schema_jsonld"] or {})
    provider, calendar_id, event_id = _extract_provider_fields(item)
    normalized_start_date = (
        _normalize_event_time_value(payload.start_date) if payload.start_date is not None else None
    )
    normalized_end_date = (
        _normalize_event_time_value(payload.end_date) if payload.end_date is not None else None
    )
    if payload.start_date is not None and normalized_start_date is None:
        raise HTTPException(status_code=400, detail="Invalid start_date value")
    if payload.end_date is not None and normalized_end_date is None:
        raise HTTPException(status_code=400, detail="Invalid end_date value")

    roles, connection = _load_access_roles(org_id=org_id, user_id=user_id)
    role = roles.get(calendar_id or "") if provider == "google_calendar" else None
    writable = role in _WRITABLE_ROLES if provider == "google_calendar" else True

    if provider == "google_calendar" and event_id and calendar_id:
        if connection is None:
            raise HTTPException(status_code=400, detail="No active Google connection")

        token = get_valid_gmail_token(connection, org_id)
        google_body: dict[str, Any] = {}

        if payload.name is not None:
            google_body["summary"] = payload.name
        if payload.description is not None:
            google_body["description"] = payload.description

        if payload.start_date is not None or payload.end_date is not None:
            if not writable:
                raise HTTPException(
                    status_code=403,
                    detail="Event is not writable on Google Calendar",
                )
            start_value = (
                normalized_start_date
                if payload.start_date is not None
                else str(item.get("startDate") or "")
            )
            end_value = (
                normalized_end_date
                if payload.end_date is not None
                else str(item.get("endDate") or "")
            )
            start_payload = _coerce_google_event_time(start_value)
            end_payload = _coerce_google_event_time(end_value)
            if start_payload:
                google_body["start"] = start_payload
            if end_payload:
                google_body["end"] = end_payload

        if google_body:
            try:
                google_calendar_api.update_event(
                    token,
                    event_id,
                    calendar_id=calendar_id,
                    body=google_body,
                )
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=exc.response.status_code,
                    detail="Failed to update Google Calendar event",
                ) from exc

            _insert_audit_log(
                org_id=org_id,
                user_id=user_id,
                connection_id=str(connection.get("connection_id")) if connection else None,
                event_type="calendar_event_updated",
                payload={
                    "canonical_id": canonical_id,
                    "calendar_id": calendar_id,
                    "event_id": event_id,
                    "fields": request_payload,
                },
            )

    if payload.name is not None:
        item["name"] = payload.name
    if payload.description is not None:
        item["description"] = payload.description
    if payload.start_date is not None:
        item["startDate"] = normalized_start_date
        item["startTime"] = normalized_start_date
    if payload.end_date is not None:
        item["endDate"] = normalized_end_date
    if payload.project_ids is not None:
        _set_additional_property(item, "app:projectRefs", payload.project_ids)

    updated = _update_item_schema(org_id=org_id, canonical_id=canonical_id, schema_jsonld=item)
    response = _to_event_response(updated, access_roles=roles)

    response_payload = response.model_dump(mode="json")
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response_payload,
            200,
        )
    return response


@router.post(
    "/events/{canonical_id}/rsvp",
    response_model=CalendarEventResponse,
    summary="Set RSVP status for a calendar event",
)
def set_calendar_event_rsvp(
    payload: CalendarEventRsvpRequest,
    canonical_id: str = Path(...),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    org_id = org["org_id"]
    user_id = str(current_user["id"])

    request_payload = payload.model_dump(mode="json")
    path = f"/calendar/events/{canonical_id}/rsvp"
    if idempotency_key:
        request_hash = compute_request_hash("POST", path, request_payload)
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached is not None:
            return JSONResponse(status_code=cached["status_code"], content=cached["response"])

    row = _load_calendar_item_row(org_id=org_id, canonical_id=canonical_id)
    item = copy.deepcopy(row["schema_jsonld"] or {})
    provider, calendar_id, event_id = _extract_provider_fields(item)

    roles, connection = _load_access_roles(org_id=org_id, user_id=user_id)

    if provider == "google_calendar" and event_id and calendar_id:
        if connection is None:
            raise HTTPException(status_code=400, detail="No active Google connection")

        user_email = str(connection.get("email_address") or "").strip()
        if not user_email:
            raise HTTPException(status_code=400, detail="Connected Google email missing")

        token = get_valid_gmail_token(connection, org_id)
        try:
            _apply_google_rsvp(
                token=token,
                calendar_id=calendar_id,
                event_id=event_id,
                user_email=user_email,
                status=payload.status,
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail="Failed to update RSVP on Google Calendar",
            ) from exc

        _insert_audit_log(
            org_id=org_id,
            user_id=user_id,
            connection_id=str(connection.get("connection_id")) if connection else None,
            event_type="calendar_event_rsvp",
            payload={
                "canonical_id": canonical_id,
                "calendar_id": calendar_id,
                "event_id": event_id,
                "status": payload.status,
            },
        )

    _set_additional_property(item, "app:rsvpStatus", payload.status)
    updated = _update_item_schema(org_id=org_id, canonical_id=canonical_id, schema_jsonld=item)
    response = _to_event_response(updated, access_roles=roles)

    response_payload = response.model_dump(mode="json")
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response_payload,
            200,
        )
    return response


@router.delete(
    "/events/{canonical_id}",
    response_model=CalendarEventDeleteResponse,
    summary="Delete/archive calendar event and propagate to Google when bound",
)
def delete_calendar_event(
    canonical_id: str = Path(...),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    org_id = org["org_id"]
    user_id = str(current_user["id"])

    path = f"/calendar/events/{canonical_id}"
    if idempotency_key:
        request_hash = compute_request_hash("DELETE", path, None)
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached is not None:
            return JSONResponse(status_code=cached["status_code"], content=cached["response"])

    row = _load_calendar_item_row(org_id=org_id, canonical_id=canonical_id)
    item = row["schema_jsonld"] or {}
    provider, calendar_id, event_id = _extract_provider_fields(item)

    roles, connection = _load_access_roles(org_id=org_id, user_id=user_id)

    provider_action: Literal["deleted", "declined_fallback", "local_only"] = "local_only"

    if provider == "google_calendar" and event_id and calendar_id:
        if connection is None:
            raise HTTPException(status_code=400, detail="No active Google connection")

        token = get_valid_gmail_token(connection, org_id)
        role = roles.get(calendar_id or "")
        writable = role in _WRITABLE_ROLES
        try:
            if writable:
                google_calendar_api.delete_event(
                    token,
                    event_id,
                    calendar_id=calendar_id,
                )
                provider_action = "deleted"
            else:
                user_email = str(connection.get("email_address") or "").strip()
                if not user_email:
                    raise HTTPException(status_code=400, detail="Connected Google email missing")
                _apply_google_rsvp(
                    token=token,
                    calendar_id=calendar_id,
                    event_id=event_id,
                    user_email=user_email,
                    status="declined",
                )
                provider_action = "declined_fallback"
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail="Failed to delete on Google Calendar",
            ) from exc

        _insert_audit_log(
            org_id=org_id,
            user_id=user_id,
            connection_id=str(connection.get("connection_id")) if connection else None,
            event_type="calendar_event_deleted",
            payload={
                "canonical_id": canonical_id,
                "calendar_id": calendar_id,
                "event_id": event_id,
                "provider_action": provider_action,
            },
        )

    _archive_item(org_id=org_id, canonical_id=canonical_id)
    response = CalendarEventDeleteResponse(
        canonical_id=canonical_id,
        provider_action=provider_action,
    )

    response_payload = response.model_dump(mode="json")
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response_payload,
            200,
        )
    return response
