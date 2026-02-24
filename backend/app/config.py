import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast
from urllib.parse import quote

from dotenv import load_dotenv

from app.secrets import get_secrets_manager

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Initialize secrets manager (env fallback for dev, Vault/AWS for production)
try:
    secrets_manager = get_secrets_manager()
except Exception as e:
    # Fail fast in production if secrets manager is unreachable
    backend = os.environ.get("SECRETS_BACKEND", "env").lower()
    if backend != "env":
        logger.error(f"Failed to initialize secrets manager ({backend}): {e}")
        raise
    # For env backend, log warning and continue (dev environment)
    logger.warning(f"Secrets manager initialization issue (using env fallback): {e}")
    secrets_manager = None


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


def _get_secret(name: str, default: str | None = None) -> str | None:
    """Get secret from secrets manager (with env fallback)."""
    # If secrets manager is available, try it first
    if secrets_manager is not None:
        try:
            return secrets_manager.get_secret(name)
        except Exception as e:
            logger.debug(f"Failed to get secret {name} from secrets manager: {e}")
            # Fall through to env var fallback

    # Fallback to environment variable
    return _get_env(name, default)


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
    meili_url: str | None
    meili_api_key: str | None
    meili_index_items: str
    meili_index_files: str
    meili_index_files_enabled: bool
    meili_timeout_seconds: float
    meili_batch_size: int
    meili_document_max_chars: int
    meili_file_text_max_bytes: int
    meili_file_text_max_chars: int
    storage_backend: str
    file_storage_path: Path
    upload_chunk_size: int
    import_job_queue_timeout_seconds: int
    outbox_worker_poll_seconds: float
    outbox_worker_listen_notify: bool
    outbox_worker_notify_fallback_seconds: float
    outbox_notify_channel: str
    outbox_max_attempts: int
    push_worker_poll_seconds: float
    worker_health_port: int
    push_worker_health_port: int
    worker_health_staleness_multiplier: float
    vapid_public_key: str | None
    vapid_private_key: str | None
    vapid_subject: str | None
    dev_tools_enabled: bool
    security_headers_enabled: bool
    hsts_enabled: bool
    hsts_max_age: int
    csp_policy: str | None
    cors_methods: list[str]
    cors_headers: list[str]
    # Agents service (Copilot agent)
    agents_url: str | None
    agent_require_user_api_key: bool
    # OpenClaw (alternative agent backend)
    openclaw_url: str | None
    openclaw_token: str | None
    # OpenClaw container management (Phase 2 — per-user containers)
    openclaw_image: str
    openclaw_port_range_start: int
    openclaw_port_range_end: int
    openclaw_idle_timeout_seconds: int
    openclaw_health_check_timeout: int
    # Email integration (Gmail OAuth)
    encryption_key: str | None
    gmail_client_id: str
    gmail_client_secret: str
    gmail_redirect_uri: str
    gmail_scopes: str
    gmail_state_secret: str
    backend_base_url: str
    frontend_base_url: str
    storybook_url: str
    # Delegated JWT (agent On-Behalf-Of flows)
    delegation_jwt_secret: str
    delegation_jwt_ttl_seconds: int
    # Gmail Watch + Pub/Sub (auto-detected from config presence)
    gmail_pubsub_project_id: str
    gmail_pubsub_topic: str
    gmail_pubsub_subscription: str
    gmail_pubsub_credentials_file: str
    gmail_watch_renew_buffer_hours: int
    gmail_watch_worker_poll_seconds: float
    gmail_watch_worker_health_port: int

    @property
    def gmail_watch_configured(self) -> bool:
        """Auto-detect: watch is enabled when all required Pub/Sub vars are set."""
        return bool(
            self.gmail_pubsub_project_id
            and self.gmail_pubsub_subscription
            and self.gmail_pubsub_credentials_file
        )


def _build_database_url() -> str:
    database_url = _get_env("DATABASE_URL")
    if database_url:
        return database_url

    user = _get_env("POSTGRES_USER", "project") or "project"
    password = _get_secret("POSTGRES_PASSWORD", "")
    host = _get_env("POSTGRES_HOST", "localhost") or "localhost"
    port = _get_env("POSTGRES_PORT", "5432") or "5432"
    database = _get_env("POSTGRES_DB", "project") or "project"

    if not password:
        # Return a placeholder — actual connection only happens lazily in db_conn().
        # This allows importing app modules without a database configured (e.g. unit tests).
        return "postgresql://unconfigured@localhost/unconfigured"

    encoded_user = quote(user, safe="")
    encoded_password = quote(password, safe="")
    return f"postgresql://{encoded_user}:{encoded_password}@{host}:{port}/{database}"


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
        session_cookie_name=_get_env("SESSION_COOKIE_NAME", "project_session") or "project_session",
        session_ttl_days=session_ttl_days,
        session_ttl_seconds=session_ttl_seconds,
        session_refresh_ttl_days=int(_get_env("SESSION_REFRESH_TTL_DAYS", "30") or "30"),
        session_refresh_cookie_name=_get_env(
            "SESSION_REFRESH_COOKIE_NAME",
            "project_refresh",
        )
        or "project_refresh",
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
        csrf_cookie_name=_get_env("CSRF_COOKIE_NAME", "project_csrf") or "project_csrf",
        csrf_header_name=_get_env("CSRF_HEADER_NAME", "X-CSRF-Token") or "X-CSRF-Token",
        csrf_cookie_secure=_get_bool_env("CSRF_COOKIE_SECURE", False),
        csrf_cookie_samesite=_get_samesite_env("CSRF_COOKIE_SAMESITE", "lax"),
        csrf_cookie_domain=_get_env("CSRF_COOKIE_DOMAIN"),
        csrf_cookie_path=_get_env("CSRF_COOKIE_PATH", "/") or "/",
        meili_url=_get_env("MEILI_URL"),
        meili_api_key=_get_secret("MEILI_API_KEY"),
        meili_index_items=_get_env("MEILI_INDEX_ITEMS", "items") or "items",
        meili_index_files=_get_env("MEILI_INDEX_FILES", "files") or "files",
        meili_index_files_enabled=_get_bool_env("MEILI_INDEX_FILES_ENABLED", False),
        meili_timeout_seconds=float(_get_env("MEILI_TIMEOUT_SECONDS", "5") or "5"),
        meili_batch_size=int(_get_env("MEILI_BATCH_SIZE", "500") or "500"),
        meili_document_max_chars=int(_get_env("MEILI_DOCUMENT_MAX_CHARS", "100000") or "100000"),
        meili_file_text_max_bytes=int(
            _get_env("MEILI_FILE_TEXT_MAX_BYTES", "5000000") or "5000000"
        ),
        meili_file_text_max_chars=int(_get_env("MEILI_FILE_TEXT_MAX_CHARS", "100000") or "100000"),
        storage_backend=_get_env("STORAGE_BACKEND", "local") or "local",
        file_storage_path=Path(
            _get_env("FILE_STORAGE_PATH", str(ROOT_DIR / "storage")) or str(ROOT_DIR / "storage")
        ),
        upload_chunk_size=int(_get_env("UPLOAD_CHUNK_SIZE", "5242880") or "5242880"),
        import_job_queue_timeout_seconds=int(
            _get_env("IMPORT_JOB_QUEUE_TIMEOUT_SECONDS", "300") or "300"
        ),
        outbox_worker_poll_seconds=float(_get_env("OUTBOX_WORKER_POLL_SECONDS", "1.0") or "1.0"),
        outbox_worker_listen_notify=_get_bool_env("OUTBOX_WORKER_LISTEN_NOTIFY", True),
        outbox_worker_notify_fallback_seconds=float(
            _get_env("OUTBOX_WORKER_NOTIFY_FALLBACK_SECONDS", "30.0") or "30.0"
        ),
        outbox_notify_channel=_get_env("OUTBOX_NOTIFY_CHANNEL", "outbox_events") or "outbox_events",
        outbox_max_attempts=int(_get_env("OUTBOX_MAX_ATTEMPTS", "5") or "5"),
        push_worker_poll_seconds=float(_get_env("PUSH_WORKER_POLL_SECONDS", "1.0") or "1.0"),
        worker_health_port=int(_get_env("WORKER_HEALTH_PORT", "9090") or "9090"),
        push_worker_health_port=int(_get_env("PUSH_WORKER_HEALTH_PORT", "9091") or "9091"),
        worker_health_staleness_multiplier=float(
            _get_env("WORKER_HEALTH_STALENESS_MULTIPLIER", "3.0") or "3.0"
        ),
        vapid_public_key=_get_env("VAPID_PUBLIC_KEY"),
        vapid_private_key=_get_secret("VAPID_PRIVATE_KEY"),
        vapid_subject=_get_env("VAPID_SUBJECT", "mailto:admin@example.com"),
        dev_tools_enabled=_get_bool_env("DEV_TOOLS_ENABLED", False),
        security_headers_enabled=_get_bool_env("SECURITY_HEADERS_ENABLED", True),
        hsts_enabled=_get_bool_env("HSTS_ENABLED", False),
        hsts_max_age=int(_get_env("HSTS_MAX_AGE", "31536000") or "31536000"),
        csp_policy=_get_env(
            "CSP_POLICY",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
        ),
        cors_methods=[
            m.strip()
            for m in (_get_env("CORS_METHODS", "GET,POST,PUT,PATCH,DELETE,OPTIONS") or "").split(
                ","
            )
            if m.strip()
        ],
        cors_headers=[
            h.strip()
            for h in (
                _get_env(
                    "CORS_HEADERS",
                    "Content-Type,Authorization,X-Request-ID,X-User-ID,X-Org-Id,"
                    "X-CSRF-Token,Idempotency-Key,If-None-Match,"
                    "X-Chunk-Index,X-Chunk-Total",
                )
                or ""
            ).split(",")
            if h.strip()
        ],
        agents_url=_get_env("AGENTS_URL"),
        agent_require_user_api_key=_get_bool_env("AGENT_REQUIRE_USER_API_KEY", False),
        openclaw_url=_get_env("OPENCLAW_URL"),
        openclaw_token=_get_secret("OPENCLAW_GATEWAY_TOKEN"),
        openclaw_image=_get_env("OPENCLAW_IMAGE", "ghcr.io/openclaw/openclaw:latest")
        or "ghcr.io/openclaw/openclaw:latest",
        openclaw_port_range_start=int(_get_env("OPENCLAW_PORT_RANGE_START", "18800") or "18800"),
        openclaw_port_range_end=int(_get_env("OPENCLAW_PORT_RANGE_END", "18899") or "18899"),
        openclaw_idle_timeout_seconds=int(
            _get_env("OPENCLAW_IDLE_TIMEOUT_SECONDS", "1800") or "1800"
        ),
        openclaw_health_check_timeout=int(_get_env("OPENCLAW_HEALTH_CHECK_TIMEOUT", "30") or "30"),
        delegation_jwt_secret=_get_secret("DELEGATION_JWT_SECRET") or _get_secret("JWT_SECRET") or "",
        delegation_jwt_ttl_seconds=int(_get_env("DELEGATION_JWT_TTL_SECONDS", "60") or "60"),
        encryption_key=_get_secret("ENCRYPTION_KEY"),
        gmail_client_id=_get_env("GMAIL_CLIENT_ID", "") or "",
        gmail_client_secret=_get_secret("GMAIL_CLIENT_SECRET", "") or "",
        gmail_redirect_uri=_get_env(
            "GMAIL_REDIRECT_URI",
            "http://localhost:8000/email/oauth/gmail/callback",
        )
        or "http://localhost:8000/email/oauth/gmail/callback",
        gmail_scopes=_get_env("GMAIL_SCOPES", "https://mail.google.com/")
        or "https://mail.google.com/",
        gmail_state_secret=_get_secret("GMAIL_STATE_SECRET", "") or "",
        backend_base_url=_get_env("BACKEND_BASE_URL", "http://localhost:8000")
        or "http://localhost:8000",
        frontend_base_url=_get_env("FRONTEND_BASE_URL", "http://localhost:5173")
        or "http://localhost:5173",
        storybook_url=_get_env("STORYBOOK_URL", "http://localhost:6006") or "http://localhost:6006",
        # Gmail Watch + Pub/Sub (auto-detected from config presence)
        gmail_pubsub_project_id=_get_env("GMAIL_PUBSUB_PROJECT_ID", "") or "",
        gmail_pubsub_topic=_get_env("GMAIL_PUBSUB_TOPIC", "") or "",
        gmail_pubsub_subscription=_get_env("GMAIL_PUBSUB_SUBSCRIPTION", "") or "",
        gmail_pubsub_credentials_file=_get_env("GMAIL_PUBSUB_CREDENTIALS_FILE", "") or "",
        gmail_watch_renew_buffer_hours=int(
            _get_env("GMAIL_WATCH_RENEW_BUFFER_HOURS", "12") or "12"
        ),
        gmail_watch_worker_poll_seconds=float(
            _get_env("GMAIL_WATCH_WORKER_POLL_SECONDS", "5.0") or "5.0"
        ),
        gmail_watch_worker_health_port=int(
            _get_env("GMAIL_WATCH_WORKER_HEALTH_PORT", "9092") or "9092"
        ),
    )


settings = load_settings()
