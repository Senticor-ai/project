"""Email integration REST endpoints.

Handles Gmail OAuth flow and email connection management.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import settings
from app.db import db_conn
from app.deps import get_current_org, get_current_user
from app.email.crypto import CryptoService
from app.email.gmail_oauth import (
    build_gmail_auth_url,
    exchange_gmail_code,
    get_gmail_user_email,
)
from app.email.sync import run_email_sync

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
    last_sync_at: str | None = None
    last_sync_error: str | None = None
    last_sync_message_count: int | None = None
    is_active: bool
    created_at: str


class EmailConnectionUpdateRequest(BaseModel):
    sync_interval_minutes: int | None = None
    sync_mark_read: bool | None = None


class EmailSyncResponse(BaseModel):
    synced: int
    created: int
    skipped: int
    errors: int


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
    try:
        data = response.json()
    except Exception:
        data = None
    if isinstance(data, dict):
        if isinstance(data.get("error"), dict):
            err = data["error"]
            detail = err.get("message") or err.get("status") or ""
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
    return detail


def _row_to_response(row: dict) -> EmailConnectionResponse:
    return EmailConnectionResponse(
        connection_id=str(row["connection_id"]),
        email_address=row["email_address"],
        display_name=row.get("display_name"),
        auth_method=row["auth_method"],
        oauth_provider=row.get("oauth_provider"),
        sync_interval_minutes=row["sync_interval_minutes"],
        sync_mark_read=row["sync_mark_read"],
        last_sync_at=row["last_sync_at"].isoformat() if row.get("last_sync_at") else None,
        last_sync_error=row.get("last_sync_error"),
        last_sync_message_count=row.get("last_sync_message_count"),
        is_active=row["is_active"],
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
):
    if not settings.gmail_client_id or not settings.gmail_client_secret:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured")
    sanitized = _sanitize_return_url(return_url)
    state = _build_state(str(current_user["id"]), str(org["org_id"]), sanitized)
    url = build_gmail_auth_url(state)
    return {"url": url}


@router.get(
    "/oauth/gmail/callback",
    summary="Gmail OAuth callback",
    response_class=RedirectResponse,
    responses={302: {"description": "Redirect to frontend after successful authorization"}},
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
                        is_active = true,
                        archived_at = NULL,
                        last_sync_error = NULL,
                        updated_at = now()
                    WHERE connection_id = %s
                    """,
                    (
                        crypto.encrypt(access_token),
                        crypto.encrypt(refresh_token) if refresh_token else None,
                        expires_at,
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
                         token_expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
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

    # Redirect back to frontend
    parsed = urlparse(return_url)
    query = dict(parse_qsl(parsed.query))
    query["gmail"] = "connected"
    redirect_url = urlunparse(parsed._replace(query=urlencode(query)))
    return RedirectResponse(redirect_url)


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
    updates: list[str] = []
    values: list[Any] = []
    if body.sync_interval_minutes is not None:
        updates.append("sync_interval_minutes = %s")
        values.append(body.sync_interval_minutes)
    if body.sync_mark_read is not None:
        updates.append("sync_mark_read = %s")
        values.append(body.sync_mark_read)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

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
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET is_active = false,
                    encrypted_access_token = NULL,
                    encrypted_refresh_token = NULL,
                    token_expires_at = NULL,
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
    )
