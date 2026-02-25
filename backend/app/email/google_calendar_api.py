"""Google Calendar REST API v3 client — thin httpx wrappers."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

GCAL_API_BASE = "https://www.googleapis.com/calendar/v3"
_TIMEOUT = 30


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def calendar_list(
    access_token: str,
    *,
    max_results: int = 250,
) -> dict[str, Any]:
    """List calendars visible to the authenticated user."""
    calendars: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        params: dict[str, Any] = {"maxResults": max_results}
        if page_token:
            params["pageToken"] = page_token

        response = httpx.get(
            f"{GCAL_API_BASE}/users/me/calendarList",
            headers=_headers(access_token),
            params=params,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        calendars.extend(payload.get("items", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return {"items": calendars}


def events_list(
    access_token: str,
    *,
    calendar_id: str = "primary",
    sync_token: str | None = None,
    time_min: str | None = None,
    time_max: str | None = None,
    max_results: int = 250,
) -> dict[str, Any]:
    """List calendar events and return all pages + next sync token.

    When `sync_token` is present, the request is incremental and `time_*`
    filters are omitted as required by Google Calendar API semantics.
    """
    events: list[dict[str, Any]] = []
    next_sync_token: str | None = None
    page_token: str | None = None
    encoded_calendar_id = quote(calendar_id, safe="")

    while True:
        params: dict[str, Any] = {
            "maxResults": max_results,
            "singleEvents": "true",
            "showDeleted": "true",
        }
        if sync_token:
            params["syncToken"] = sync_token
        else:
            if time_min:
                params["timeMin"] = time_min
            if time_max:
                params["timeMax"] = time_max
            params["orderBy"] = "startTime"
        if page_token:
            params["pageToken"] = page_token

        response = httpx.get(
            f"{GCAL_API_BASE}/calendars/{encoded_calendar_id}/events",
            headers=_headers(access_token),
            params=params,
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        events.extend(payload.get("items", []))
        next_sync_token = payload.get("nextSyncToken", next_sync_token)
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return {"items": events, "nextSyncToken": next_sync_token}


def update_event(
    access_token: str,
    event_id: str,
    *,
    body: dict[str, Any],
    calendar_id: str = "primary",
) -> dict[str, Any]:
    encoded_calendar_id = quote(calendar_id, safe="")
    encoded_event_id = quote(event_id, safe="")
    response = httpx.patch(
        f"{GCAL_API_BASE}/calendars/{encoded_calendar_id}/events/{encoded_event_id}",
        headers=_headers(access_token),
        json=body,
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result


def create_event(
    access_token: str,
    *,
    body: dict[str, Any],
    calendar_id: str = "primary",
) -> dict[str, Any]:
    encoded_calendar_id = quote(calendar_id, safe="")
    response = httpx.post(
        f"{GCAL_API_BASE}/calendars/{encoded_calendar_id}/events",
        headers=_headers(access_token),
        json=body,
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result
