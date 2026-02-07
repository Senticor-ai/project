import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _get_env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is not None and value != "":
        return value
    return default


def _get_bool_env(name: str, default: bool = False) -> bool:
    value = _get_env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


CookieSameSite = Literal["lax", "strict", "none"]


def _get_samesite_env(name: str, default: CookieSameSite) -> CookieSameSite:
    value = (_get_env(name, default) or default).strip().lower()
    if value not in {"lax", "strict", "none"}:
        return default
    return cast(CookieSameSite, value)


@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: list[str]
    session_cookie_name: str
    session_ttl_days: int
    session_ttl_seconds: int
    session_refresh_ttl_days: int
    session_refresh_cookie_name: str
    session_cookie_secure: bool
    session_cookie_samesite: CookieSameSite
    session_cookie_domain: str | None
    session_cookie_path: str
    session_cookie_http_only: bool
    session_bind_ip: bool
    session_bind_user_agent: bool
    session_roll_ip_on_refresh: bool
    session_roll_user_agent_on_refresh: bool
    trust_proxy_headers: bool
    csrf_enabled: bool
    csrf_cookie_name: str
    csrf_header_name: str
    csrf_cookie_secure: bool
    csrf_cookie_samesite: CookieSameSite
    csrf_cookie_domain: str | None
    csrf_cookie_path: str
    fuseki_url: str
    fuseki_dataset: str
    fuseki_graph: str
    fuseki_username: str | None
    fuseki_password: str | None
    meili_url: str | None
    meili_api_key: str | None
    meili_index_things: str
    meili_index_files: str
    meili_index_files_enabled: bool
    meili_timeout_seconds: float
    meili_batch_size: int
    meili_document_max_chars: int
    meili_file_text_max_bytes: int
    meili_file_text_max_chars: int
    docling_enabled: bool
    file_storage_path: Path
    upload_chunk_size: int
    vapid_public_key: str | None
    vapid_private_key: str | None
    vapid_subject: str | None


def _build_database_url() -> str:
    database_url = _get_env("DATABASE_URL")
    if database_url:
        return database_url

    user = _get_env("POSTGRES_USER", "terminandoyo")
    password = _get_env("POSTGRES_PASSWORD", "")
    host = _get_env("POSTGRES_HOST", "localhost")
    port = _get_env("POSTGRES_PORT", "5432")
    database = _get_env("POSTGRES_DB", "terminandoyo")

    if not password:
        raise RuntimeError("POSTGRES_PASSWORD or DATABASE_URL must be set")

    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def load_settings() -> Settings:
    cors_raw = (
        _get_env(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:6006",
        )
        or ""
    )
    cors_origins = [origin.strip() for origin in cors_raw.split(",") if origin.strip()]

    session_ttl_days = int(_get_env("SESSION_TTL_DAYS", "30") or "30")
    session_ttl_seconds_env = _get_env("SESSION_TTL_SECONDS")
    session_ttl_minutes_env = _get_env("SESSION_TTL_MINUTES")
    if session_ttl_seconds_env:
        session_ttl_seconds = int(session_ttl_seconds_env)
    elif session_ttl_minutes_env:
        session_ttl_seconds = int(session_ttl_minutes_env) * 60
    else:
        session_ttl_seconds = session_ttl_days * 86400

    return Settings(
        database_url=_build_database_url(),
        cors_origins=cors_origins,
        session_cookie_name=_get_env("SESSION_COOKIE_NAME", "terminandoyo_session")
        or "terminandoyo_session",
        session_ttl_days=session_ttl_days,
        session_ttl_seconds=session_ttl_seconds,
        session_refresh_ttl_days=int(_get_env("SESSION_REFRESH_TTL_DAYS", "30") or "30"),
        session_refresh_cookie_name=_get_env(
            "SESSION_REFRESH_COOKIE_NAME",
            "terminandoyo_refresh",
        )
        or "terminandoyo_refresh",
        session_cookie_secure=_get_bool_env("SESSION_COOKIE_SECURE", False),
        session_cookie_samesite=_get_samesite_env("SESSION_COOKIE_SAMESITE", "lax"),
        session_cookie_domain=_get_env("SESSION_COOKIE_DOMAIN"),
        session_cookie_path=_get_env("SESSION_COOKIE_PATH", "/") or "/",
        session_cookie_http_only=_get_bool_env("SESSION_COOKIE_HTTP_ONLY", True),
        session_bind_ip=_get_bool_env("SESSION_BIND_IP", True),
        session_bind_user_agent=_get_bool_env("SESSION_BIND_USER_AGENT", True),
        session_roll_ip_on_refresh=_get_bool_env("SESSION_ROLL_IP_ON_REFRESH", True),
        session_roll_user_agent_on_refresh=_get_bool_env(
            "SESSION_ROLL_UA_ON_REFRESH",
            True,
        ),
        trust_proxy_headers=_get_bool_env("TRUST_PROXY_HEADERS", False),
        csrf_enabled=_get_bool_env("CSRF_ENABLED", False),
        csrf_cookie_name=_get_env("CSRF_COOKIE_NAME", "terminandoyo_csrf") or "terminandoyo_csrf",
        csrf_header_name=_get_env("CSRF_HEADER_NAME", "X-CSRF-Token") or "X-CSRF-Token",
        csrf_cookie_secure=_get_bool_env("CSRF_COOKIE_SECURE", False),
        csrf_cookie_samesite=_get_samesite_env("CSRF_COOKIE_SAMESITE", "lax"),
        csrf_cookie_domain=_get_env("CSRF_COOKIE_DOMAIN"),
        csrf_cookie_path=_get_env("CSRF_COOKIE_PATH", "/") or "/",
        fuseki_url=_get_env("FUSEKI_URL", "http://localhost:3030") or "http://localhost:3030",
        fuseki_dataset=_get_env("FUSEKI_DATASET", "todo") or "todo",
        fuseki_graph=_get_env("FUSEKI_GRAPH", "urn:graph:default") or "urn:graph:default",
        fuseki_username=_get_env("FUSEKI_USERNAME"),
        fuseki_password=_get_env("FUSEKI_PASSWORD"),
        meili_url=_get_env("MEILI_URL"),
        meili_api_key=_get_env("MEILI_API_KEY"),
        meili_index_things=_get_env("MEILI_INDEX_THINGS", "things") or "things",
        meili_index_files=_get_env("MEILI_INDEX_FILES", "files") or "files",
        meili_index_files_enabled=_get_bool_env("MEILI_INDEX_FILES_ENABLED", False),
        meili_timeout_seconds=float(_get_env("MEILI_TIMEOUT_SECONDS", "5") or "5"),
        meili_batch_size=int(_get_env("MEILI_BATCH_SIZE", "500") or "500"),
        meili_document_max_chars=int(_get_env("MEILI_DOCUMENT_MAX_CHARS", "100000") or "100000"),
        meili_file_text_max_bytes=int(_get_env("MEILI_FILE_TEXT_MAX_BYTES", "5000000") or "5000000"),
        meili_file_text_max_chars=int(_get_env("MEILI_FILE_TEXT_MAX_CHARS", "100000") or "100000"),
        docling_enabled=_get_bool_env("DOCLING_ENABLED", True),
        file_storage_path=Path(
            _get_env("FILE_STORAGE_PATH", str(ROOT_DIR / "storage")) or str(ROOT_DIR / "storage")
        ),
        upload_chunk_size=int(_get_env("UPLOAD_CHUNK_SIZE", "5242880") or "5242880"),
        vapid_public_key=_get_env("VAPID_PUBLIC_KEY"),
        vapid_private_key=_get_env("VAPID_PRIVATE_KEY"),
        vapid_subject=_get_env("VAPID_SUBJECT", "mailto:admin@example.com"),
    )


settings = load_settings()
