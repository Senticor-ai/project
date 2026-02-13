"""Per-user OpenClaw container lifecycle management.

Manages Docker/nerdctl/podman containers — one per user who opts into OpenClaw.
Containers are started lazily on first chat request, tracked in the DB, and
reaped after idle timeout.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from dataclasses import dataclass

import httpx

from ..config import settings
from ..db import db_conn
from ..email.crypto import CryptoService
from .runtime import run_cmd
from .workspace import provision_workspace

logger = logging.getLogger(__name__)

API_KEY_ENV_MAP = {
    "openrouter": "OPENROUTER_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


@dataclass
class ContainerInfo:
    """Result of starting a container."""

    name: str
    url: str
    port: int
    token: str


# ---------------------------------------------------------------------------
# Port allocation
# ---------------------------------------------------------------------------


def _allocate_port(cur) -> int:  # noqa: ANN001
    """Find next available port in the pool. Must be called inside a transaction."""
    cur.execute(
        """
        SELECT port FROM generate_series(%s, %s) AS port
        WHERE port NOT IN (
            SELECT container_port FROM user_agent_settings
            WHERE container_port IS NOT NULL
        )
        LIMIT 1
        """,
        (settings.openclaw_port_range_start, settings.openclaw_port_range_end),
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError("No available ports in container pool")
    return row["port"]


# ---------------------------------------------------------------------------
# Decrypt helper
# ---------------------------------------------------------------------------


def _decrypt_api_key(encrypted: bytes | str) -> str:
    crypto = CryptoService()
    raw = encrypted.decode() if isinstance(encrypted, bytes) else encrypted
    return crypto.decrypt(raw)


# ---------------------------------------------------------------------------
# Model string for openclaw.json
# ---------------------------------------------------------------------------


def _build_model_string(provider: str, model: str) -> str:
    """Build the openclaw.json model identifier from provider + model."""
    if provider == "openrouter" and not model.startswith("openrouter/"):
        return f"openrouter/{model}"
    if provider == "openai" and not model.startswith("openai/"):
        return f"openai/{model}"
    if provider == "anthropic" and not model.startswith("anthropic/"):
        return f"anthropic/{model}"
    return model


# ---------------------------------------------------------------------------
# Start / Stop
# ---------------------------------------------------------------------------


def start_container(user_id: str) -> ContainerInfo:
    """Start an OpenClaw container for the given user.

    Provisions the workspace, starts the container via CLI, and waits for
    the health check to pass.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            # Lock the row to prevent concurrent starts
            cur.execute(
                """
                SELECT provider, api_key_encrypted, model
                FROM user_agent_settings
                WHERE user_id = %s
                FOR UPDATE
                """,
                (user_id,),
            )
            row = cur.fetchone()

            if not row or not row["api_key_encrypted"]:
                raise ValueError("No API key configured for user")

            port = _allocate_port(cur)
            gateway_token = secrets.token_urlsafe(32)
            container_name = f"tay-openclaw-{user_id[:8]}"

            # Mark as starting + reserve port
            cur.execute(
                """
                UPDATE user_agent_settings SET
                    container_name = %s,
                    container_status = 'starting',
                    container_url = %s,
                    container_port = %s,
                    container_error = NULL,
                    container_started_at = now(),
                    last_activity_at = now(),
                    updated_at = now()
                WHERE user_id = %s
                """,
                (
                    container_name,
                    f"http://localhost:{port}",
                    port,
                    user_id,
                ),
            )
            conn.commit()

    provider = row["provider"]
    model = row["model"]
    openclaw_model = _build_model_string(provider, model)

    # Provision workspace + runtime directory on disk
    workspace_dir, runtime_dir = provision_workspace(
        user_id=user_id,
        storage_base=settings.file_storage_path,
        port=port,
        model=openclaw_model,
        token=gateway_token,
    )

    # Decrypt API key (for env var injection only — never on disk)
    api_key = _decrypt_api_key(row["api_key_encrypted"])
    api_key_env = API_KEY_ENV_MAP.get(provider, "OPENROUTER_API_KEY")

    # Remove any old container with the same name
    run_cmd(["rm", "-f", container_name])

    # Start container
    result = run_cmd(
        [
            "run",
            "-d",
            "--name",
            container_name,
            "-p",
            f"{port}:{port}",
            "-v",
            f"{workspace_dir / 'workspace'}:/workspace:ro",
            "-v",
            f"{workspace_dir / 'openclaw.json'}:/openclaw.json:ro",
            "-v",
            f"{runtime_dir}:/runtime",
            "-e",
            f"{api_key_env}={api_key}",
            "-e",
            f"OPENCLAW_GATEWAY_TOKEN={gateway_token}",
            "-e",
            "TAY_BACKEND_URL=http://host.docker.internal:8000",
            "-e",
            "OPENCLAW_CONFIG_PATH=/openclaw.json",
            "--label",
            f"tay.user_id={user_id}",
            "--label",
            "tay.managed=true",
            settings.openclaw_image,
        ]
    )

    if result.returncode != 0:
        _mark_error(user_id, result.stderr[:300])
        raise RuntimeError(f"Container start failed: {result.stderr[:200]}")

    container_url = f"http://localhost:{port}"

    # Wait for health check
    _wait_for_healthy(user_id, container_url)

    return ContainerInfo(
        name=container_name,
        url=container_url,
        port=port,
        token=gateway_token,
    )


def _wait_for_healthy(user_id: str, url: str) -> None:
    """Poll the container health endpoint until ready or timeout."""
    deadline = time.monotonic() + settings.openclaw_health_check_timeout
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(f"{url}/health", timeout=2.0)
            if resp.status_code == 200:
                with db_conn() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            UPDATE user_agent_settings SET
                                container_status = 'running', updated_at = now()
                            WHERE user_id = %s
                            """,
                            (user_id,),
                        )
                    conn.commit()
                return
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(1.0)

    _mark_error(user_id, f"Health check timeout after {settings.openclaw_health_check_timeout}s")
    raise RuntimeError(f"Container health check timeout for user {user_id}")


def _mark_error(user_id: str, error: str) -> None:
    """Mark a container as errored in the DB."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_agent_settings SET
                    container_status = 'error',
                    container_error = %s,
                    updated_at = now()
                WHERE user_id = %s
                """,
                (error, user_id),
            )
        conn.commit()


def stop_container(user_id: str) -> None:
    """Stop and remove a user's container, releasing the port."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT container_name FROM user_agent_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()

    if not row or not row["container_name"]:
        return

    run_cmd(["rm", "-f", row["container_name"]])

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_agent_settings SET
                    container_status = 'stopped',
                    container_url = NULL,
                    container_port = NULL,
                    container_error = NULL,
                    updated_at = now()
                WHERE user_id = %s
                """,
                (user_id,),
            )
        conn.commit()

    logger.info("container.stopped", extra={"user_id": user_id})


# ---------------------------------------------------------------------------
# Token file for OpenClaw skills
# ---------------------------------------------------------------------------


def write_token_file(user_id: str, token: str) -> None:
    """Write a fresh delegated JWT to the user's runtime directory.

    The token file is read by the OpenClaw agent's backend-api skill
    via ``$(cat /runtime/token)`` in curl commands.
    """
    runtime_dir = settings.file_storage_path / "openclaw-runtime" / user_id
    token_path = runtime_dir / "token"
    token_path.write_text(token)


# ---------------------------------------------------------------------------
# Ensure running (main entry point for chat routes)
# ---------------------------------------------------------------------------


def ensure_running(user_id: str) -> tuple[str, str]:
    """Return (container_url, gateway_token), starting the container if needed.

    This is the main entry point called from chat routes.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT container_url, container_status, container_name
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if row and row["container_status"] == "running" and row["container_url"]:
        # Quick health check on existing container
        try:
            resp = httpx.get(f"{row['container_url']}/health", timeout=2.0)
            if resp.status_code == 200:
                touch_activity(user_id)
                token = _read_gateway_token(user_id)
                return row["container_url"], token
        except (httpx.ConnectError, httpx.TimeoutException):
            logger.warning(
                "container.health_failed",
                extra={"user_id": user_id},
            )
            stop_container(user_id)
    elif row and row["container_status"] in ("starting", "error"):
        # Stale state — clean up before restart
        stop_container(user_id)

    # Start fresh
    info = start_container(user_id)
    return info.url, info.token


def _read_gateway_token(user_id: str) -> str:
    """Read the gateway token from the user's provisioned openclaw.json."""
    config_path = settings.file_storage_path / "openclaw" / user_id / "openclaw.json"
    config = json.loads(config_path.read_text())
    return config["gateway"]["auth"]["token"]


# ---------------------------------------------------------------------------
# Activity tracking + idle reaper
# ---------------------------------------------------------------------------


def touch_activity(user_id: str) -> None:
    """Update last activity timestamp for idle timeout tracking."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_agent_settings SET last_activity_at = now()
                WHERE user_id = %s
                """,
                (user_id,),
            )
        conn.commit()


def reap_idle(timeout_seconds: int | None = None) -> int:
    """Stop containers that have been idle for longer than the timeout.

    Returns the number of containers stopped.
    """
    if timeout_seconds is None:
        timeout_seconds = settings.openclaw_idle_timeout_seconds

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id::text, container_name
                FROM user_agent_settings
                WHERE container_status = 'running'
                  AND last_activity_at < now() - make_interval(secs => %s)
                """,
                (timeout_seconds,),
            )
            idle_rows = cur.fetchall()

    stopped = 0
    for row in idle_rows:
        try:
            stop_container(row["user_id"])
            stopped += 1
            logger.info(
                "container.idle_reaped",
                extra={
                    "user_id": row["user_id"],
                    "container_name": row["container_name"],
                },
            )
        except Exception:
            logger.exception(
                "container.reap_failed",
                extra={"user_id": row["user_id"]},
            )

    return stopped


# ---------------------------------------------------------------------------
# Status (for API endpoint)
# ---------------------------------------------------------------------------


def get_status(user_id: str) -> dict:
    """Get container status for the API endpoint."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT container_status, container_url, container_error,
                       container_started_at, last_activity_at, container_port
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if not row:
        return {"status": None}

    return {
        "status": row["container_status"],
        "url": row["container_url"],
        "error": row["container_error"],
        "startedAt": (
            row["container_started_at"].isoformat() if row["container_started_at"] else None
        ),
        "lastActivityAt": (
            row["last_activity_at"].isoformat() if row["last_activity_at"] else None
        ),
        "port": row["container_port"],
    }
