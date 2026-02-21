"""Delegated JWT token creation and verification for agent On-Behalf-Of flows.

Follows RFC 8693 (OAuth 2.0 Token Exchange) semantics with an internal
issuer — the backend acts as its own token authority.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from pydantic import BaseModel

from .config import settings

_ALGORITHM = "HS256"
_ISSUER = "project-backend"
_AUDIENCE = "project-backend"


class DelegatedTokenClaims(BaseModel):
    """Parsed claims from a verified delegated JWT."""

    sub: str  # User UUID
    org: str  # Org UUID
    scope: str  # e.g. "items:write"
    actor_sub: str  # e.g. "tay"
    jti: str  # Token ID


def create_delegated_token(
    user_id: str,
    org_id: str,
    actor: str = "tay",
    scope: str = "items:write",
    ttl_seconds: int | None = None,
) -> str:
    """Create a short-lived delegated JWT for agent-to-backend calls."""
    if ttl_seconds is None:
        ttl_seconds = settings.delegation_jwt_ttl_seconds

    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "iss": _ISSUER,
        "sub": str(user_id),
        "aud": _AUDIENCE,
        "exp": now + timedelta(seconds=ttl_seconds),
        "iat": now,
        "jti": str(uuid.uuid4()),
        "act": {"sub": actor},
        "org": str(org_id),
        "scope": scope,
        "token_type": "delegated",
    }

    return jwt.encode(payload, settings.delegation_jwt_secret, algorithm=_ALGORITHM)


def verify_delegated_token(token: str) -> DelegatedTokenClaims:
    """Verify and decode a delegated JWT. Raises jwt.PyJWTError on failure."""
    payload = jwt.decode(
        token,
        settings.delegation_jwt_secret,
        algorithms=[_ALGORITHM],
        issuer=_ISSUER,
        audience=_AUDIENCE,
        options={"require": ["exp", "iat", "jti", "sub", "act", "org", "scope"]},
    )

    if payload.get("token_type") != "delegated":
        raise jwt.InvalidTokenError("Not a delegated token")

    act = payload.get("act", {})
    if not isinstance(act, dict) or "sub" not in act:
        raise jwt.InvalidTokenError("Missing act.sub claim")

    return DelegatedTokenClaims(
        sub=payload["sub"],
        org=payload["org"],
        scope=payload["scope"],
        actor_sub=act["sub"],
        jti=payload["jti"],
    )
