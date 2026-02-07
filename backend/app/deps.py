from datetime import UTC, datetime

from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from .config import settings
from .db import db_conn
from .http import get_client_ip
from .observability import bind_user_context

ORG_ID_HEADER = "X-Org-Id"

def get_current_user(
    request: Request,
    session_token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
):
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

    bind_user_context(str(row["id"]), row.get("email"))
    return row


def get_current_org(
    current_user=Depends(get_current_user),  # noqa: B008
    org_header: str | None = Header(default=None, alias=ORG_ID_HEADER),  # noqa: B008
):
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
