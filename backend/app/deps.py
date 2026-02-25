from datetime import UTC, datetime

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from .config import settings
from .db import db_conn
from .delegation import verify_delegated_token
from .http import get_client_ip
from .observability import bind_user_context, get_logger

ORG_ID_HEADER = "X-Org-Id"

logger = get_logger("deps")


def _extract_bearer_token(authorization: str | None) -> str | None:
    """Extract Bearer token from Authorization header, or None."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _set_request_user_state(
    request: Request,
    *,
    user_id: str,
    session_id: str | None = None,
) -> None:
    request.state.user_id = user_id
    request.state.session_id = session_id


def _authenticate_via_delegated_jwt(token: str, request: Request) -> dict:
    """Verify a delegated JWT and return a user dict with delegation metadata."""
    try:
        claims = verify_delegated_token(token)
    except jwt.PyJWTError as exc:
        logger.warning("delegated_jwt.invalid", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid delegated token",
        ) from exc

    # Look up the user to confirm they still exist
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, username, created_at, default_org_id, disclaimer_acknowledged_at
                FROM users
                WHERE id = %s
                """,
                (claims.sub,),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Delegated token user not found",
        )

    user_id = str(row["id"])
    _set_request_user_state(
        request,
        user_id=user_id,
    )
    bind_user_context(user_id)

    return {
        **row,
        "_delegated": True,
        "_actor": claims.actor_sub,
        "_scope": claims.scope,
        "_jti": claims.jti,
        "_org_from_token": claims.org,
    }


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    session_token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
):
    # Path 1: Delegated JWT (agent-to-backend calls)
    bearer_token = _extract_bearer_token(authorization)
    if bearer_token:
        return _authenticate_via_delegated_jwt(bearer_token, request)

    # Path 2: Session cookie (browser requests)
    if session_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.id,
                    u.email,
                    u.username,
                    u.created_at,
                    u.default_org_id,
                    u.disclaimer_acknowledged_at,
                    s.id AS session_id,
                    s.expires_at,
                    s.ip_address,
                    s.user_agent
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = %s AND s.revoked_at IS NULL
                """,
                (session_token,),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    expires_at = row["expires_at"]
    if isinstance(expires_at, datetime) and expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    if settings.session_bind_ip and row.get("ip_address") and client_ip:
        if row["ip_address"] != client_ip:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session context changed",
            )
    if settings.session_bind_user_agent and row.get("user_agent") and user_agent:
        if row["user_agent"] != user_agent:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session context changed",
            )

    user_id = str(row["id"])
    session_id = str(row["session_id"])
    _set_request_user_state(
        request,
        user_id=user_id,
        session_id=session_id,
    )
    bind_user_context(
        user_id,
        session_id=session_id,
    )

    updates: dict[str, object] = {"last_seen_at": datetime.now(UTC)}
    if not row.get("ip_address") and client_ip:
        updates["ip_address"] = client_ip
    if not row.get("user_agent") and user_agent:
        updates["user_agent"] = user_agent

    if updates:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sessions
                    SET last_seen_at = %s,
                        ip_address = COALESCE(%s, ip_address),
                        user_agent = COALESCE(%s, user_agent)
                    WHERE id = %s
                    """,
                    (
                        updates["last_seen_at"],
                        updates.get("ip_address"),
                        updates.get("user_agent"),
                        row["session_id"],
                    ),
                )
            conn.commit()

    return row


def get_current_org(
    current_user=Depends(get_current_user),  # noqa: B008
    org_header: str | None = Header(default=None, alias=ORG_ID_HEADER),  # noqa: B008
):
    # For delegated tokens, use the org from the token claims directly
    if current_user.get("_delegated"):
        resolved_org_id = current_user["_org_from_token"]
    else:
        resolved_org_id = org_header or current_user.get("default_org_id")

    if not resolved_org_id:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT org_id
                    FROM org_memberships
                    WHERE user_id = %s AND status = 'active'
                    ORDER BY created_at ASC
                    LIMIT 2
                    """,
                    (current_user["id"],),
                )
                rows = cur.fetchall()
        if not rows:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No org membership")
        if len(rows) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Org-Id required for users with multiple orgs",
            )
        resolved_org_id = rows[0]["org_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT org_id, role, status
                FROM org_memberships
                WHERE org_id = %s AND user_id = %s
                """,
                (resolved_org_id, current_user["id"]),
            )
            membership = cur.fetchone()

    if membership is None or membership.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org access denied")

    return {
        "org_id": str(membership["org_id"]),
        "role": membership["role"],
    }
