"""Email integration REST endpoints.

Handles Gmail OAuth flow and email connection management.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.db import db_conn, jsonb
from app.deps import get_current_org, get_current_user
from app.email.crypto import CryptoService
from app.email.gmail_oauth import (
    build_gmail_auth_url,
    exchange_gmail_code,
    get_gmail_user_email,
    get_valid_gmail_token,
    revoke_google_token,
)
from app.email.sync import register_watch, run_email_sync, stop_watch_for_connection

from . import gmail_api, google_calendar_api
from .proposals import generate_proposals_for_items

router = APIRouter(prefix="/email", tags=["email"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Response / request models
# ---------------------------------------------------------------------------


class EmailConnectionResponse(BaseModel):
    connection_id: str
    email_address: str
    display_name: str | None = None
    auth_method: str
    oauth_provider: str | None = None
    sync_interval_minutes: int
    sync_mark_read: bool
    calendar_sync_enabled: bool = False
    calendar_selected_ids: list[str] = Field(default_factory=lambda: ["primary"])
    calendar_sync_token: str | None = None
    last_calendar_sync_at: str | None = None
    last_calendar_sync_error: str | None = None
    last_calendar_sync_event_count: int | None = None
    last_sync_at: str | None = None
    last_sync_error: str | None = None
    last_sync_message_count: int | None = None
    is_active: bool
    watch_active: bool
    watch_expires_at: str | None = None
    created_at: str


class EmailConnectionUpdateRequest(BaseModel):
    sync_interval_minutes: int | None = None
    sync_mark_read: bool | None = None
    calendar_sync_enabled: bool | None = None
    calendar_selected_ids: list[str] | None = None


class EmailSyncResponse(BaseModel):
    synced: int
    created: int
    skipped: int
    errors: int
    calendar_synced: int = 0
    calendar_created: int = 0
    calendar_updated: int = 0
    calendar_archived: int = 0
    calendar_errors: int = 0


class ProposalResponse(BaseModel):
    proposal_id: str
    proposal_type: str
    why: str
    confidence: str
    requires_confirmation: bool = True
    suggested_actions: list[str]
    status: str
    created_at: str


class ProposalDecisionResponse(BaseModel):
    proposal_id: str
    status: str


class ConnectionCalendarResponse(BaseModel):
    calendar_id: str
    summary: str
    primary: bool = False
    selected: bool = False
    access_role: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_state(user_id: str, org_id: str, return_url: str) -> str:
    """Build JWT state parameter for OAuth flow."""
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "org": org_id,
        "type": "gmail_oauth_state",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=10)).timestamp()),
        "return_url": return_url,
    }
    return jwt.encode(payload, settings.gmail_state_secret, algorithm="HS256")


def _decode_state(state: str) -> dict[Any, Any]:
    """Decode and validate JWT state parameter."""
    try:
        payload: dict[Any, Any] = jwt.decode(
            state,
            settings.gmail_state_secret,
            algorithms=["HS256"],
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid state") from exc
    if payload.get("type") != "gmail_oauth_state":
        raise HTTPException(status_code=400, detail="Invalid state")
    return payload


def _sanitize_return_url(return_url: str) -> str:
    """Ensure return URL is within allowed frontend domain."""
    if not return_url:
        return settings.frontend_base_url
    if not return_url.startswith(settings.frontend_base_url):
        return settings.frontend_base_url
    return return_url


def _format_google_error(exc: httpx.HTTPStatusError) -> str:
    response = exc.response
    detail = ""
    reasons: set[str] = set()
    try:
        data = response.json()
    except Exception:
        data = None
    if isinstance(data, dict):
        if isinstance(data.get("error"), dict):
            err = data["error"]
            detail = err.get("message") or err.get("status") or ""
            raw_errors = err.get("errors")
            if isinstance(raw_errors, list):
                for raw_error in raw_errors:
                    if not isinstance(raw_error, dict):
                        continue
                    reason = raw_error.get("reason")
                    if isinstance(reason, str) and reason.strip():
                        reasons.add(reason.strip())
        if not detail and "error_description" in data:
            err_str = data.get("error")
            desc = data.get("error_description")
            if err_str and desc:
                detail = f"{err_str}: {desc}"
            elif desc:
                detail = str(desc)
        if not detail and data.get("error"):
            detail = str(data.get("error"))
    if not detail:
        text = (response.text or "").strip()
        if text:
            detail = text[:500]
    if not detail:
        detail = f"HTTP {response.status_code}"
    detail_lower = detail.lower()
    if response.status_code == 403:
        if "insufficientPermissions" in reasons or "insufficient" in detail_lower:
            return (
                "Google Calendar permission missing. Disconnect and reconnect Google "
                "to grant calendar access."
            )
        if "accessNotConfigured" in reasons or "api has not been used" in detail_lower:
            return (
                "Google Calendar API is not enabled in this Google Cloud project. "
                "Enable the Calendar API and reconnect."
            )
    return detail


def _find_active_connection(org_id: str, user_id: str) -> dict | None:
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


def _is_stale_calendar_sync_error_for_calendar_list(error_message: str | None) -> bool:
    if not isinstance(error_message, str):
        return False
    normalized = error_message.strip().lower()
    if not normalized:
        return False
    return "google calendar api is not enabled in this google cloud project" in normalized


def _normalize_calendar_ids(values: list[str] | None) -> list[str]:
    if values is None:
        return []
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in values:
        if not isinstance(raw, str):
            continue
        value = raw.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _selected_calendar_ids_from_row(row: dict) -> list[str]:
    raw = row.get("calendar_selected_ids")
    if isinstance(raw, list):
        selected = _normalize_calendar_ids(raw)
        if selected:
            return selected
    return ["primary"]


def _filtered_calendar_sync_tokens(row: dict, selected_calendar_ids: list[str]) -> dict[str, str]:
    raw = row.get("calendar_sync_tokens")
    tokens: dict[str, str] = {}
    if isinstance(raw, dict):
        for calendar_id in selected_calendar_ids:
            value = raw.get(calendar_id)
            if isinstance(value, str) and value:
                tokens[calendar_id] = value
    legacy_primary_token = row.get("calendar_sync_token")
    if (
        "primary" in selected_calendar_ids
        and "primary" not in tokens
        and isinstance(legacy_primary_token, str)
        and legacy_primary_token
    ):
        tokens["primary"] = legacy_primary_token
    return tokens


def _archive_deselected_calendar_items(*, org_id: str, deselected_calendar_ids: list[str]) -> None:
    if not deselected_calendar_ids:
        return
    now = datetime.now(UTC)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET archived_at = %s,
                    updated_at = %s
                WHERE org_id = %s
                  AND source = 'google_calendar'
                  AND archived_at IS NULL
                  AND COALESCE(
                        schema_jsonld -> 'sourceMetadata' -> 'raw' ->> 'calendarId',
                        'primary'
                      ) = ANY(%s)
                """,
                (now, now, org_id, deselected_calendar_ids),
            )
        conn.commit()


def _insert_audit_log(
    *,
    org_id: str,
    user_id: str,
    connection_id: str | None,
    proposal_id: str | None,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO connector_action_audit_log
                    (org_id, user_id, connection_id, proposal_id, event_type, payload)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    org_id,
                    user_id,
                    connection_id,
                    proposal_id,
                    event_type,
                    jsonb(payload),
                ),
            )
        conn.commit()


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


def _iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _proposal_keywords() -> tuple[tuple[str, ...], tuple[str, ...]]:
    reschedule = ("reschedule", "verschieb", "verschieben", "move", "verlegen")
    pickup = ("pick up", "pickup", "abholen", "kinder", "kids")
    return reschedule, pickup


def _row_to_proposal_response(row: dict) -> ProposalResponse:
    payload = row.get("payload") or {}
    return ProposalResponse(
        proposal_id=str(row["proposal_id"]),
        proposal_type=row["proposal_type"],
        why=str(payload.get("why") or ""),
        confidence=str(payload.get("confidence") or "medium"),
        requires_confirmation=bool(payload.get("requires_confirmation", True)),
        suggested_actions=[
            str(x) for x in (payload.get("suggested_actions") or []) if isinstance(x, str)
        ],
        status=row["status"],
        created_at=row["created_at"].isoformat() if row.get("created_at") else "",
    )


def _build_reschedule_payload(email_item: dict, calendar_item: dict) -> dict[str, Any]:
    email_schema = email_item.get("schema_jsonld") or {}
    cal_schema = calendar_item.get("schema_jsonld") or {}
    email_raw = (email_schema.get("sourceMetadata") or {}).get("raw") or {}
    cal_raw = (cal_schema.get("sourceMetadata") or {}).get("raw") or {}

    start_dt = _parse_iso(cal_schema.get("startDate")) or datetime.now(UTC) + timedelta(hours=1)
    end_dt = _parse_iso(cal_schema.get("endDate")) or start_dt + timedelta(minutes=30)
    new_start = start_dt + timedelta(minutes=30)
    new_end = end_dt + timedelta(minutes=30)

    return {
        "why": "Inbound email suggests a scheduling change close to an upcoming event.",
        "confidence": "medium",
        "requires_confirmation": True,
        "suggested_actions": ["gcal_update_event", "gmail_send_reply"],
        "gmail_message_id": email_raw.get("gmailMessageId"),
        "thread_id": email_raw.get("threadId"),
        "to": email_raw.get("from") or "",
        "reply_subject": f"Re: {email_schema.get('name') or 'Update'}",
        "reply_body": "Thanks for the note. I can move the meeting by 30 minutes. Does that work?",
        "event_id": cal_raw.get("eventId"),
        "new_start": _iso_z(new_start),
        "new_end": _iso_z(new_end),
    }


def _build_personal_payload(email_item: dict) -> dict[str, Any]:
    email_schema = email_item.get("schema_jsonld") or {}
    email_raw = (email_schema.get("sourceMetadata") or {}).get("raw") or {}
    start_dt = datetime.now(UTC) + timedelta(hours=2)
    end_dt = start_dt + timedelta(hours=1)
    return {
        "why": "Inbound email looks like a personal pickup request.",
        "confidence": "medium",
        "requires_confirmation": True,
        "suggested_actions": ["gcal_create_event", "gmail_send_reply"],
        "gmail_message_id": email_raw.get("gmailMessageId"),
        "thread_id": email_raw.get("threadId"),
        "to": email_raw.get("from") or "",
        "reply_subject": f"Re: {email_schema.get('name') or 'Update'}",
        "reply_body": "Understood. I added a calendar block and can take care of this.",
        "event_summary": "Personal request",
        "event_start": _iso_z(start_dt),
        "event_end": _iso_z(end_dt),
    }


def _row_to_response(row: dict) -> EmailConnectionResponse:
    watch_exp = row.get("watch_expiration")
    watch_active = watch_exp is not None and watch_exp > datetime.now(UTC)
    return EmailConnectionResponse(
        connection_id=str(row["connection_id"]),
        email_address=row["email_address"],
        display_name=row.get("display_name"),
        auth_method=row["auth_method"],
        oauth_provider=row.get("oauth_provider"),
        sync_interval_minutes=row["sync_interval_minutes"],
        sync_mark_read=row["sync_mark_read"],
        calendar_sync_enabled=bool(row.get("calendar_sync_enabled")),
        calendar_selected_ids=_selected_calendar_ids_from_row(row),
        calendar_sync_token=row.get("calendar_sync_token"),
        last_calendar_sync_at=(
            row["last_calendar_sync_at"].isoformat() if row.get("last_calendar_sync_at") else None
        ),
        last_calendar_sync_error=row.get("last_calendar_sync_error"),
        last_calendar_sync_event_count=row.get("last_calendar_sync_event_count"),
        last_sync_at=row["last_sync_at"].isoformat() if row.get("last_sync_at") else None,
        last_sync_error=row.get("last_sync_error"),
        last_sync_message_count=row.get("last_sync_message_count"),
        is_active=row["is_active"],
        watch_active=watch_active,
        watch_expires_at=watch_exp.isoformat() if watch_exp else None,
        created_at=row["created_at"].isoformat() if row.get("created_at") else "",
    )


# ---------------------------------------------------------------------------
# OAuth endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/oauth/gmail/authorize",
    summary="Get Gmail OAuth authorization URL",
)
def gmail_authorize(
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
    return_url: Annotated[str, Query()] = "",
    redirect: Annotated[bool, Query()] = False,
):
    if not settings.gmail_client_id or not settings.gmail_client_secret:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured")
    sanitized = _sanitize_return_url(return_url)
    state = _build_state(str(current_user["id"]), str(org["org_id"]), sanitized)
    url = build_gmail_auth_url(state)
    if redirect:
        return RedirectResponse(url=url, status_code=303)
    return {"url": url}


@router.get(
    "/oauth/gmail/callback",
    summary="Gmail OAuth callback",
    response_class=RedirectResponse,
    responses={303: {"description": "Redirect back to frontend after successful authorization"}},
)
def gmail_callback(
    code: str,
    state: str,
):
    """Handle the OAuth callback from Google (no session auth — called by Google redirect)."""
    payload = _decode_state(state)
    user_id_str = payload.get("sub")
    org_id_str = payload.get("org")
    if not user_id_str or not org_id_str:
        raise HTTPException(status_code=400, detail="Invalid state")
    try:
        user_id = uuid.UUID(user_id_str)
        org_id = uuid.UUID(org_id_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid IDs in state") from exc
    return_url = payload.get("return_url") or settings.frontend_base_url

    # Exchange code for tokens
    try:
        tokens = exchange_gmail_code(code)
    except httpx.HTTPStatusError as exc:
        detail = _format_google_error(exc)
        logger.exception("Gmail token exchange failed: %s", detail)
        raise HTTPException(
            status_code=502, detail=f"Gmail token exchange failed: {detail}"
        ) from exc
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access token from Google")

    expires_in = int(tokens.get("expires_in", 0)) if tokens.get("expires_in") else None
    expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None

    # Get user's email address from Google
    try:
        email = get_gmail_user_email(access_token)
    except httpx.HTTPStatusError as exc:
        detail = _format_google_error(exc)
        logger.exception("Gmail profile fetch failed: %s", detail)
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch Gmail profile: {detail}"
        ) from exc
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Google")

    try:
        crypto = CryptoService()
    except ValueError as exc:
        logger.exception("Encryption key not configured: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Upsert connection
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id FROM email_connections
                WHERE user_id = %s AND org_id = %s AND email_address = %s
                """,
                (str(user_id), str(org_id), email),
            )
            existing = cur.fetchone()

            if existing:
                cur.execute(
                    """
                    UPDATE email_connections
                    SET encrypted_access_token = %s,
                        encrypted_refresh_token = COALESCE(%s, encrypted_refresh_token),
                        token_expires_at = %s,
                        encryption_key_version = %s,
                        calendar_sync_enabled = true,
                        calendar_selected_ids = COALESCE(calendar_selected_ids, %s),
                        calendar_sync_tokens = COALESCE(
                            calendar_sync_tokens,
                            '{}'::jsonb
                        ),
                        is_active = true,
                        archived_at = NULL,
                        last_sync_error = NULL,
                        last_calendar_sync_error = NULL,
                        updated_at = now()
                    WHERE connection_id = %s
                    """,
                    (
                        crypto.encrypt(access_token),
                        crypto.encrypt(refresh_token) if refresh_token else None,
                        expires_at,
                        crypto.active_version,
                        jsonb(["primary"]),
                        existing["connection_id"],
                    ),
                )
            else:
                if not refresh_token:
                    raise HTTPException(status_code=400, detail="Missing refresh token from Google")
                cur.execute(
                    """
                    INSERT INTO email_connections
                        (org_id, user_id, email_address, display_name,
                         encrypted_access_token, encrypted_refresh_token,
                         token_expires_at, encryption_key_version, calendar_sync_enabled,
                         calendar_selected_ids, calendar_sync_tokens)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, %s, %s)
                    RETURNING connection_id
                    """,
                    (
                        str(org_id),
                        str(user_id),
                        email,
                        f"Gmail ({email})",
                        crypto.encrypt(access_token),
                        crypto.encrypt(refresh_token),
                        expires_at,
                        crypto.active_version,
                        jsonb(["primary"]),
                        jsonb({}),
                    ),
                )
                new_row = cur.fetchone()
                if new_row:
                    # Create initial sync state
                    cur.execute(
                        """
                        INSERT INTO email_sync_state (connection_id)
                        VALUES (%s)
                        ON CONFLICT DO NOTHING
                        """,
                        (new_row["connection_id"],),
                    )
        conn.commit()

    # Register Gmail Watch for push notifications (best-effort)
    connection_id = str(existing["connection_id"]) if existing else str(new_row["connection_id"])
    try:
        register_watch(connection_id, str(org_id))
    except Exception:
        logger.warning("Failed to register watch for %s", connection_id, exc_info=True)

    # Redirect to frontend; the app handles popup close + parent refresh signal.
    fallback_url = return_url + ("&" if "?" in return_url else "?") + "gmail=connected"
    return RedirectResponse(url=fallback_url, status_code=303)


# ---------------------------------------------------------------------------
# Connection CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/connections",
    response_model=list[EmailConnectionResponse],
    summary="List active email connections",
)
def list_connections(
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE user_id = %s AND org_id = %s AND is_active = true
                ORDER BY created_at DESC
                """,
                (str(current_user["id"]), org["org_id"]),
            )
            rows = cur.fetchall()
    return [_row_to_response(r) for r in rows]


@router.get(
    "/connections/{connection_id}",
    response_model=EmailConnectionResponse,
    summary="Get email connection details",
)
def get_connection(
    connection_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM email_connections
                WHERE connection_id = %s AND user_id = %s AND org_id = %s
                """,
                (connection_id, str(current_user["id"]), org["org_id"]),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return _row_to_response(row)


@router.get(
    "/connections/{connection_id}/calendars",
    response_model=list[ConnectionCalendarResponse],
    summary="List available Google calendars for this connection",
)
def list_connection_calendars(
    connection_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM email_connections
                WHERE connection_id = %s
                  AND user_id = %s
                  AND org_id = %s
                  AND is_active = true
                """,
                (connection_id, str(current_user["id"]), org["org_id"]),
            )
            connection = cur.fetchone()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    access_token = get_valid_gmail_token(connection, org["org_id"])
    try:
        payload = google_calendar_api.calendar_list(access_token)
    except httpx.HTTPStatusError as exc:
        detail = _format_google_error(exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to list Google calendars: {detail}",
        ) from exc
    if _is_stale_calendar_sync_error_for_calendar_list(connection.get("last_calendar_sync_error")):
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE email_connections
                    SET last_calendar_sync_error = NULL,
                        updated_at = now()
                    WHERE connection_id = %s
                      AND user_id = %s
                      AND org_id = %s
                    """,
                    (connection_id, str(current_user["id"]), org["org_id"]),
                )
            conn.commit()
    selected_ids = set(_selected_calendar_ids_from_row(connection))

    calendars: list[ConnectionCalendarResponse] = []
    for raw in payload.get("items", []):
        calendar_id = str(raw.get("id") or "").strip()
        if not calendar_id:
            continue
        summary = str(raw.get("summaryOverride") or raw.get("summary") or calendar_id)
        calendars.append(
            ConnectionCalendarResponse(
                calendar_id=calendar_id,
                summary=summary,
                primary=bool(raw.get("primary")),
                selected=calendar_id in selected_ids,
                access_role=(
                    str(raw.get("accessRole")) if raw.get("accessRole") is not None else None
                ),
            )
        )

    if not any(c.calendar_id == "primary" for c in calendars):
        calendars.append(
            ConnectionCalendarResponse(
                calendar_id="primary",
                summary="Primary",
                primary=True,
                selected="primary" in selected_ids,
                access_role=None,
            )
        )

    calendars.sort(
        key=lambda c: (
            0 if c.primary else 1,
            c.summary.lower(),
            c.calendar_id.lower(),
        )
    )
    return calendars


@router.patch(
    "/connections/{connection_id}",
    response_model=EmailConnectionResponse,
    summary="Update email connection settings",
)
def update_connection(
    connection_id: str,
    body: EmailConnectionUpdateRequest,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    if (
        body.sync_interval_minutes is None
        and body.sync_mark_read is None
        and body.calendar_sync_enabled is None
        and body.calendar_selected_ids is None
    ):
        raise HTTPException(status_code=400, detail="No fields to update")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM email_connections
                WHERE connection_id = %s AND user_id = %s AND org_id = %s
                """,
                (connection_id, str(current_user["id"]), org["org_id"]),
            )
            existing = cur.fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")

    updates: list[str] = []
    values: list[Any] = []
    deselected_calendar_ids: list[str] = []

    if body.sync_interval_minutes is not None:
        updates.append("sync_interval_minutes = %s")
        values.append(body.sync_interval_minutes)
    if body.sync_mark_read is not None:
        updates.append("sync_mark_read = %s")
        values.append(body.sync_mark_read)
    if body.calendar_sync_enabled is not None:
        updates.append("calendar_sync_enabled = %s")
        values.append(body.calendar_sync_enabled)
    if body.calendar_selected_ids is not None:
        selected_calendar_ids = _normalize_calendar_ids(body.calendar_selected_ids)
        if not selected_calendar_ids:
            raise HTTPException(
                status_code=400,
                detail="At least one calendar must be selected",
            )
        previous_ids = _selected_calendar_ids_from_row(existing)
        deselected_calendar_ids = [cid for cid in previous_ids if cid not in selected_calendar_ids]
        filtered_sync_tokens = _filtered_calendar_sync_tokens(existing, selected_calendar_ids)
        updates.extend(
            [
                "calendar_selected_ids = %s",
                "calendar_sync_tokens = %s",
                "calendar_sync_token = %s",
            ]
        )
        values.extend(
            [
                jsonb(selected_calendar_ids),
                jsonb(filtered_sync_tokens),
                filtered_sync_tokens.get("primary"),
            ]
        )
    updates.append("updated_at = now()")
    values.extend([connection_id, str(current_user["id"]), org["org_id"]])

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE email_connections
                SET {", ".join(updates)}
                WHERE connection_id = %s AND user_id = %s AND org_id = %s
                RETURNING *
                """,
                values,
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    _archive_deselected_calendar_items(
        org_id=org["org_id"],
        deselected_calendar_ids=deselected_calendar_ids,
    )
    return _row_to_response(row)


@router.delete(
    "/connections/{connection_id}",
    response_model=EmailConnectionResponse,
    summary="Disconnect email (soft delete)",
)
def disconnect(
    connection_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    # Stop Gmail Watch before deactivating (best-effort)
    try:
        stop_watch_for_connection(connection_id, org["org_id"])
    except Exception:
        logger.warning("Failed to stop watch for %s", connection_id, exc_info=True)

    # Revoke Google OAuth tokens before clearing them (best-effort).
    # We read the encrypted tokens, decrypt, and call the revocation endpoint.
    # Failures are logged but do not block the disconnect.
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT encrypted_access_token, encrypted_refresh_token
                    FROM email_connections
                    WHERE connection_id = %s AND user_id = %s AND org_id = %s AND is_active = true
                    """,
                    (connection_id, str(current_user["id"]), org["org_id"]),
                )
                token_row = cur.fetchone()
        if token_row:
            crypto = CryptoService()
            # Prefer revoking the refresh token (revokes both); fall back to access token.
            for field in ("encrypted_refresh_token", "encrypted_access_token"):
                encrypted = token_row.get(field)
                if encrypted:
                    try:
                        plaintext = crypto.decrypt(encrypted)
                        revoke_google_token(plaintext)
                        break  # one successful revocation is sufficient
                    except Exception:
                        logger.warning(
                            "Failed to decrypt/revoke %s for connection %s",
                            field,
                            connection_id,
                            exc_info=True,
                        )
    except Exception:
        logger.warning("Token revocation step failed for %s", connection_id, exc_info=True)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET is_active = false,
                    encrypted_access_token = NULL,
                    encrypted_refresh_token = NULL,
                    encryption_key_version = NULL,
                    token_expires_at = NULL,
                    watch_expiration = NULL,
                    watch_history_id = NULL,
                    calendar_sync_token = NULL,
                    calendar_sync_tokens = '{}'::jsonb,
                    last_calendar_sync_at = NULL,
                    last_calendar_sync_error = NULL,
                    last_calendar_sync_event_count = NULL,
                    archived_at = now(),
                    updated_at = now()
                WHERE connection_id = %s AND user_id = %s AND org_id = %s AND is_active = true
                RETURNING *
                """,
                (connection_id, str(current_user["id"]), org["org_id"]),
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return _row_to_response(row)


@router.post(
    "/connections/{connection_id}/sync",
    response_model=EmailSyncResponse,
    summary="Trigger manual email sync",
)
def trigger_sync(
    connection_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id FROM email_connections
                WHERE connection_id = %s AND user_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, str(current_user["id"]), org["org_id"]),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    result = run_email_sync(
        connection_id=connection_id,
        org_id=org["org_id"],
        user_id=str(current_user["id"]),
    )
    return EmailSyncResponse(
        synced=result.synced,
        created=result.created,
        skipped=result.skipped,
        errors=result.errors,
        calendar_synced=result.calendar_synced,
        calendar_created=result.calendar_created,
        calendar_updated=result.calendar_updated,
        calendar_archived=result.calendar_archived,
        calendar_errors=result.calendar_errors,
    )


@router.get(
    "/proposals",
    response_model=list[ProposalResponse],
    summary="List pending Google Workspace proposals",
)
def list_proposals(
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM connector_action_proposals
                WHERE org_id = %s AND user_id = %s
                ORDER BY created_at DESC
                """,
                (org["org_id"], str(current_user["id"])),
            )
            rows = cur.fetchall()
    return [_row_to_proposal_response(r) for r in rows]


@router.post(
    "/proposals/generate",
    response_model=list[ProposalResponse],
    summary="Generate proposal candidates from Gmail + Calendar context",
)
def generate_proposals(
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    user_id = str(current_user["id"])
    org_id = org["org_id"]
    connection = _find_active_connection(org_id, user_id)
    if not connection:
        raise HTTPException(status_code=400, detail="No active Google connection")

    rows = generate_proposals_for_items(
        org_id=org_id,
        user_id=user_id,
        connection_id=str(connection["connection_id"]),
        source_item_ids=None,
        limit=20,
    )
    return [_row_to_proposal_response(r) for r in rows]


@router.post(
    "/proposals/{proposal_id}/confirm",
    response_model=ProposalDecisionResponse,
    summary="Confirm and execute a proposal",
)
def confirm_proposal(
    proposal_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    user_id = str(current_user["id"])
    org_id = org["org_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM connector_action_proposals
                WHERE proposal_id = %s AND org_id = %s AND user_id = %s
                """,
                (proposal_id, org_id, user_id),
            )
            proposal = cur.fetchone()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal["status"] != "pending":
        raise HTTPException(status_code=409, detail="Proposal already decided")

    connection = _find_active_connection(org_id, user_id)
    if not connection:
        raise HTTPException(status_code=400, detail="No active Google connection")

    payload = proposal.get("payload") or {}
    access_token = get_valid_gmail_token(connection, org_id)
    executed_actions: list[str] = []

    if proposal["proposal_type"] == "Proposal.RescheduleMeeting":
        event_id = payload.get("event_id")
        if not event_id:
            raise HTTPException(status_code=400, detail="Proposal missing event_id")
        google_calendar_api.update_event(
            access_token,
            str(event_id),
            body={
                "start": {"dateTime": payload.get("new_start")},
                "end": {"dateTime": payload.get("new_end")},
            },
        )
        executed_actions.append("gcal_update_event")
        gmail_api.send_reply(
            access_token,
            thread_id=str(payload.get("thread_id") or ""),
            to=str(payload.get("to") or ""),
            subject=str(payload.get("reply_subject") or "Re: Update"),
            body=str(payload.get("reply_body") or ""),
            in_reply_to_message_id=(
                str(payload.get("gmail_message_id")) if payload.get("gmail_message_id") else None
            ),
        )
        executed_actions.append("gmail_send_reply")
    elif proposal["proposal_type"] == "Proposal.PersonalRequest":
        google_calendar_api.create_event(
            access_token,
            body={
                "summary": str(payload.get("event_summary") or "Personal request"),
                "start": {"dateTime": payload.get("event_start")},
                "end": {"dateTime": payload.get("event_end")},
            },
        )
        executed_actions.append("gcal_create_event")
        gmail_api.send_reply(
            access_token,
            thread_id=str(payload.get("thread_id") or ""),
            to=str(payload.get("to") or ""),
            subject=str(payload.get("reply_subject") or "Re: Update"),
            body=str(payload.get("reply_body") or ""),
            in_reply_to_message_id=(
                str(payload.get("gmail_message_id")) if payload.get("gmail_message_id") else None
            ),
        )
        executed_actions.append("gmail_send_reply")
    else:
        raise HTTPException(status_code=400, detail="Unsupported proposal type")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE connector_action_proposals
                SET status = 'confirmed',
                    decided_at = now()
                WHERE proposal_id = %s
                """,
                (proposal_id,),
            )
        conn.commit()

    _insert_audit_log(
        org_id=org_id,
        user_id=user_id,
        connection_id=str(connection["connection_id"]),
        proposal_id=proposal_id,
        event_type="proposal_confirmed",
        payload={"executed_actions": executed_actions},
    )
    return ProposalDecisionResponse(proposal_id=proposal_id, status="confirmed")


@router.post(
    "/proposals/{proposal_id}/dismiss",
    response_model=ProposalDecisionResponse,
    summary="Dismiss a proposal without executing writes",
)
def dismiss_proposal(
    proposal_id: str,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    user_id = str(current_user["id"])
    org_id = org["org_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE connector_action_proposals
                SET status = 'dismissed',
                    decided_at = now()
                WHERE proposal_id = %s
                  AND org_id = %s
                  AND user_id = %s
                  AND status = 'pending'
                RETURNING proposal_id, connection_id
                """,
                (proposal_id, org_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Pending proposal not found")

    _insert_audit_log(
        org_id=org_id,
        user_id=user_id,
        connection_id=str(row["connection_id"]) if row.get("connection_id") else None,
        proposal_id=proposal_id,
        event_type="proposal_dismissed",
        payload={},
    )
    return ProposalDecisionResponse(proposal_id=proposal_id, status="dismissed")
