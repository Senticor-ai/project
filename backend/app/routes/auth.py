import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status

from ..config import settings
from ..csrf import clear_csrf_cookie, issue_csrf_token
from ..db import db_conn
from ..deps import get_current_user
from ..http import get_client_ip
from ..models import AuthCredentials, RegistrationRequest, SessionRefreshResponse, UserResponse
from ..security import (
    generate_refresh_token,
    generate_session_token,
    hash_password,
    hash_token,
    refresh_expiry,
    utc_now,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_session(user_id, request: Request, response: Response) -> None:
    """Create a session and set session + refresh + CSRF cookies."""
    token = generate_session_token()
    refresh_token = generate_refresh_token()
    refresh_token_hash = hash_token(refresh_token)
    expires_at = utc_now() + timedelta(seconds=settings.session_ttl_seconds)
    refresh_expires_at = refresh_expiry(settings.session_refresh_ttl_days)
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sessions (
                    user_id, token, refresh_token_hash,
                    expires_at, refresh_expires_at,
                    ip_address, user_agent, last_seen_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    token,
                    refresh_token_hash,
                    expires_at,
                    refresh_expires_at,
                    client_ip,
                    user_agent,
                    utc_now(),
                ),
            )
            cur.execute(
                "UPDATE users SET last_login_at = %s WHERE id = %s",
                (utc_now(), user_id),
            )
        conn.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=settings.session_cookie_http_only,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
        expires=int(expires_at.timestamp()),
        max_age=settings.session_ttl_seconds,
    )
    response.set_cookie(
        key=settings.session_refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
        expires=int(refresh_expires_at.timestamp()),
        max_age=settings.session_refresh_ttl_days * 86400,
    )
    issue_csrf_token(response)


DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,63}$",
    re.IGNORECASE,
)


def _normalize_username(username: str) -> str:
    value = username.strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username is required",
        )
    return value


def _validate_email(email: str) -> str:
    value = email.strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email is required",
        )
    if "@" not in value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email must include a domain",
        )
    local, domain = value.rsplit("@", 1)
    if not local or not domain:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email must include a domain",
        )
    if DOMAIN_RE.match(domain) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email domain must be valid (e.g. example.com)",
        )
    return value


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )
    has_letter = any(ch.isalpha() for ch in password)
    has_digit = any(ch.isdigit() for ch in password)
    has_symbol = any(not ch.isalnum() for ch in password)
    if not has_letter:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must include at least one letter",
        )
    if not (has_digit or has_symbol):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must include at least one digit or symbol",
        )


@router.post("/register", response_model=UserResponse)
def register(payload: RegistrationRequest, request: Request, response: Response):
    email = _validate_email(payload.email)
    username = _normalize_username(payload.username)
    _validate_password(payload.password)
    password_hash = hash_password(payload.password)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already registered",
                )
            cur.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(%s)",
                (username,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username already registered",
                )

            cur.execute(
                """
                INSERT INTO users (email, username, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, email, username, created_at
                """,
                (email, username, password_hash),
            )
            user = cur.fetchone()

            org_name = f"{username}'s Workspace"
            cur.execute(
                """
                INSERT INTO organizations (name, owner_user_id)
                VALUES (%s, %s)
                RETURNING id, created_at
                """,
                (org_name, user["id"]),
            )
            org = cur.fetchone()

            cur.execute(
                """
                INSERT INTO org_memberships (org_id, user_id, role, status)
                VALUES (%s, %s, 'owner', 'active')
                """,
                (org["id"], user["id"]),
            )

            cur.execute(
                "UPDATE users SET default_org_id = %s WHERE id = %s",
                (org["id"], user["id"]),
            )
        conn.commit()

    _create_session(user["id"], request, response)

    return UserResponse(
        id=str(user["id"]),
        email=user["email"],
        username=user.get("username"),
        default_org_id=str(org["id"]),
        created_at=user["created_at"].isoformat(),
    )


@router.post("/login", response_model=UserResponse)
def login(payload: AuthCredentials, request: Request, response: Response):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, username, password_hash, created_at, default_org_id "
                "FROM users WHERE email = %s",
                (payload.email,),
            )
            user = cur.fetchone()

    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _create_session(user["id"], request, response)

    return UserResponse(
        id=str(user["id"]),
        email=user["email"],
        username=user.get("username"),
        default_org_id=str(user["default_org_id"]) if user.get("default_org_id") else None,
        created_at=user["created_at"].isoformat(),
    )


@router.post("/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
):
    if session_token:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sessions SET revoked_at = %s WHERE token = %s",
                    (utc_now(), session_token),
                )
            conn.commit()

    response.delete_cookie(
        settings.session_cookie_name,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
    )
    response.delete_cookie(
        settings.session_refresh_cookie_name,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
    )
    clear_csrf_cookie(response)
    return {"ok": True}


@router.post(
    "/refresh",
    response_model=SessionRefreshResponse,
    summary="Refresh a session",
    description="Rotates the session and refresh tokens and returns updated session metadata.",
)
def refresh_session(request: Request, response: Response):
    refresh_token = request.cookies.get(settings.session_refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    refresh_hash = hash_token(refresh_token)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.id AS session_id,
                    s.user_id,
                    s.refresh_expires_at,
                    s.ip_address,
                    s.user_agent,
                    u.email,
                    u.username,
                    u.default_org_id,
                    u.created_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.refresh_token_hash = %s AND s.revoked_at IS NULL
                """,
                (refresh_hash,),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    refresh_expires_at = row["refresh_expires_at"]
    if isinstance(refresh_expires_at, datetime) and refresh_expires_at < utc_now():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )

    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    if settings.session_bind_ip and row.get("ip_address") and client_ip:
        if row["ip_address"] != client_ip and not settings.session_roll_ip_on_refresh:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session context changed",
            )
    if settings.session_bind_user_agent and row.get("user_agent") and user_agent:
        if row["user_agent"] != user_agent and not settings.session_roll_user_agent_on_refresh:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session context changed",
            )

    new_token = generate_session_token()
    new_refresh_token = generate_refresh_token()
    new_refresh_hash = hash_token(new_refresh_token)
    new_expires_at = utc_now() + timedelta(seconds=settings.session_ttl_seconds)
    new_refresh_expires_at = refresh_expiry(settings.session_refresh_ttl_days)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE sessions
                SET token = %s,
                    refresh_token_hash = %s,
                    expires_at = %s,
                    refresh_expires_at = %s,
                    ip_address = %s,
                    user_agent = %s,
                    last_seen_at = %s
                WHERE id = %s
                """,
                (
                    new_token,
                    new_refresh_hash,
                    new_expires_at,
                    new_refresh_expires_at,
                    client_ip or row.get("ip_address"),
                    user_agent or row.get("user_agent"),
                    utc_now(),
                    row["session_id"],
                ),
            )
        conn.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=new_token,
        httponly=settings.session_cookie_http_only,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
        expires=int(new_expires_at.timestamp()),
        max_age=settings.session_ttl_seconds,
    )
    response.set_cookie(
        key=settings.session_refresh_cookie_name,
        value=new_refresh_token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        domain=settings.session_cookie_domain,
        path=settings.session_cookie_path,
        expires=int(new_refresh_expires_at.timestamp()),
        max_age=settings.session_refresh_ttl_days * 86400,
    )
    issue_csrf_token(response)

    return {
        "user": {
            "id": str(row["user_id"]),
            "email": row["email"],
            "username": row.get("username"),
            "default_org_id": str(row["default_org_id"]) if row.get("default_org_id") else None,
            "created_at": row["created_at"].isoformat(),
        },
        "expires_at": new_expires_at.isoformat(),
        "refresh_expires_at": new_refresh_expires_at.isoformat(),
    }


@router.get(
    "/csrf",
    summary="Issue a CSRF token",
    description="Returns a CSRF token and sets the CSRF cookie for BFF flows.",
)
def csrf_token(response: Response):
    token = issue_csrf_token(response)
    return {"csrf_token": token}


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    return UserResponse(
        id=str(current_user["id"]),
        email=current_user["email"],
        username=current_user.get("username"),
        default_org_id=str(current_user["default_org_id"])
        if current_user.get("default_org_id")
        else None,
        created_at=current_user["created_at"].isoformat(),
    )
