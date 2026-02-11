"""Gmail OAuth 2.0 helpers for IMAP access via XOAUTH2.

Ported from Procedere's gmail_service.py, adapted to TAY's db_conn() pattern.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.db import db_conn
from app.email.crypto import CryptoService

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"

GMAIL_IMAP_HOST = "imap.gmail.com"
GMAIL_IMAP_PORT = 993


def build_gmail_auth_url(state: str) -> str:
    """Build Google OAuth authorization URL for Gmail IMAP access."""
    params = {
        "client_id": settings.gmail_client_id,
        "redirect_uri": settings.gmail_redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": settings.gmail_scopes,
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_gmail_code(code: str) -> dict[str, Any]:
    """Exchange authorization code for access and refresh tokens."""
    payload = {
        "code": code,
        "client_id": settings.gmail_client_id,
        "client_secret": settings.gmail_client_secret,
        "redirect_uri": settings.gmail_redirect_uri,
        "grant_type": "authorization_code",
    }
    response = httpx.post(GOOGLE_TOKEN_URL, data=payload, timeout=30)
    if response.status_code != 200:
        logger.error(
            "Google token exchange returned %d: %s",
            response.status_code,
            response.text[:1000],
        )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    return result


def get_gmail_user_email(access_token: str) -> str:
    """Get the email address associated with the Gmail account."""
    response = httpx.get(
        GOOGLE_GMAIL_PROFILE_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    response.raise_for_status()
    data: dict[str, Any] = response.json()
    email: str = data.get("emailAddress") or data.get("email") or ""
    return email


def refresh_gmail_token(connection_id: str, org_id: str) -> str:
    """Refresh Gmail access token using refresh token.

    Updates the connection row in DB with new access token and expiry.
    Returns the new (decrypted) access token.
    """
    crypto = CryptoService()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT encrypted_refresh_token
                FROM email_connections
                WHERE connection_id = %s AND org_id = %s AND is_active = true
                """,
                (connection_id, org_id),
            )
            row = cur.fetchone()

    if not row or not row["encrypted_refresh_token"]:
        raise ValueError("Connection has no refresh token")

    refresh_token = crypto.decrypt(row["encrypted_refresh_token"])

    payload = {
        "client_id": settings.gmail_client_id,
        "client_secret": settings.gmail_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    response = httpx.post(GOOGLE_TOKEN_URL, data=payload, timeout=30)
    response.raise_for_status()

    data: dict[str, Any] = response.json()
    access_token: str | None = data.get("access_token")
    if not access_token:
        raise RuntimeError("No access token returned from Google")

    expires_in = int(data.get("expires_in", 0)) if data.get("expires_in") else None
    expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE email_connections
                SET encrypted_access_token = %s,
                    token_expires_at = %s,
                    updated_at = now()
                WHERE connection_id = %s AND org_id = %s
                """,
                (crypto.encrypt(access_token), expires_at, connection_id, org_id),
            )
        conn.commit()

    logger.info("Refreshed Gmail token for connection %s", connection_id)
    return access_token


def get_valid_gmail_token(connection_row: dict, org_id: str) -> str:
    """Get a valid access token, refreshing if within 5-min expiry buffer."""
    crypto = CryptoService()

    encrypted = connection_row.get("encrypted_access_token")
    if not encrypted:
        raise ValueError("Connection has no access token")

    now = datetime.now(UTC)
    buffer = timedelta(minutes=5)
    expires_at = connection_row.get("token_expires_at")

    if expires_at and expires_at > now + buffer:
        return crypto.decrypt(encrypted)

    return refresh_gmail_token(
        str(connection_row["connection_id"]),
        org_id,
    )
