import secrets
from collections.abc import Iterable

from fastapi import HTTPException, Request, Response, status

from .config import settings

SAFE_METHODS: set[str] = {"GET", "HEAD", "OPTIONS", "TRACE"}
EXEMPT_PATHS: set[str] = {"/auth/login", "/auth/register", "/auth/refresh", "/auth/csrf"}


def issue_csrf_token(response: Response) -> str:
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=token,
        httponly=False,
        secure=settings.csrf_cookie_secure,
        samesite=settings.csrf_cookie_samesite,
        domain=settings.csrf_cookie_domain,
        path=settings.csrf_cookie_path,
        max_age=settings.session_refresh_ttl_days * 86400,
    )
    return token


def clear_csrf_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.csrf_cookie_name,
        domain=settings.csrf_cookie_domain,
        path=settings.csrf_cookie_path,
    )


def should_validate_csrf(request: Request) -> bool:
    if request.method in SAFE_METHODS:
        return False
    if request.url.path in EXEMPT_PATHS:
        return False
    return True


def validate_csrf_request(request: Request) -> None:
    cookie_value = request.cookies.get(settings.csrf_cookie_name)
    header_value = request.headers.get(settings.csrf_header_name)
    if not cookie_value or not header_value or cookie_value != header_value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )


def with_csrf_exempt(paths: Iterable[str]) -> None:
    EXEMPT_PATHS.update(paths)
