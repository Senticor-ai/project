"""Per-user OpenClaw container lifecycle management.

Manages Docker/nerdctl/podman containers — one per user who opts into OpenClaw.
Containers are started lazily on first chat request, tracked in the DB, and
reaped after idle timeout.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import httpx

from ..config import settings
from ..db import db_conn
from ..email.crypto import CryptoService
from .memory_store import (
    SOURCE_RUNTIME_SYNC,
    reconcile_workspace_memory,
    sync_workspace_memory_to_db,
)
from .runtime import run_cmd
from .workspace import provision_workspace

logger = logging.getLogger(__name__)

API_KEY_ENV_MAP = {
    "openrouter": "OPENROUTER_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}

COMPOSE_PROJECT_LABEL = "project"
OPENCLAW_SERVICE_LABEL = "openclaw"
IDENTITY_NAME_PATTERN = re.compile(
    r"^\s*(?:-\s*)?(?:\*\*)?name(?:\*\*)?\s*:\s*(.+?)\s*$",
    re.IGNORECASE,
)


@dataclass
class ContainerInfo:
    """Result of starting a container."""

    name: str
    url: str
    port: int
    token: str


# ---------------------------------------------------------------------------
# URL rewriting for container access
# ---------------------------------------------------------------------------

_LOCALHOST_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}  # noqa: S104
_READY_CHAT_STATUS_CODES = {200, 400, 401, 403, 405}
_DNS_LABEL_SANITIZE_RE = re.compile(r"[^a-z0-9-]")
_MAX_DNS_LABEL_LEN = 63

OPENCLAW_RUNTIME_LOCAL = "local"
OPENCLAW_RUNTIME_K8S = "k8s"
OPENCLAW_K8S_LABEL_SELECTOR = "app=openclaw,copilot.managed=true"
OPENCLAW_PULL_ALWAYS = "always"
OPENCLAW_PULL_IF_NOT_PRESENT = "if-not-present"
OPENCLAW_PULL_NEVER = "never"


def _to_container_url(url: str) -> str:
    """Rewrite a host URL so it's reachable from inside a Docker container.

    Replaces localhost-style hosts (including *.localhost subdomains)
    with ``host.docker.internal`` so the container can reach host services.
    """
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if hostname in _LOCALHOST_HOSTS or hostname.endswith(".localhost"):
        host = "host.docker.internal"
        new_netloc = f"{host}:{parsed.port}" if parsed.port else host
        return urlunparse(parsed._replace(netloc=new_netloc))
    return url


def _runtime_mode() -> str:
    mode = (settings.openclaw_runtime or OPENCLAW_RUNTIME_LOCAL).strip().lower()
    if mode in {OPENCLAW_RUNTIME_LOCAL, OPENCLAW_RUNTIME_K8S}:
        return mode
    logger.warning("container.runtime_unknown", extra={"mode": mode})
    return OPENCLAW_RUNTIME_LOCAL


def _use_k8s_runtime() -> bool:
    return _runtime_mode() == OPENCLAW_RUNTIME_K8S


def _pull_policy() -> str:
    policy = (settings.openclaw_pull_policy or OPENCLAW_PULL_NEVER).strip().lower()
    if policy in {OPENCLAW_PULL_ALWAYS, OPENCLAW_PULL_IF_NOT_PRESENT, OPENCLAW_PULL_NEVER}:
        return policy
    logger.warning("container.pull_policy_unknown", extra={"policy": policy})
    return OPENCLAW_PULL_NEVER


def _image_present_locally(image: str) -> bool:
    try:
        result = run_cmd(["image", "inspect", image], timeout=20)
    except Exception:  # noqa: BLE001
        return False
    return result.returncode == 0


def _should_pull_image(image: str) -> bool:
    policy = _pull_policy()
    if policy == OPENCLAW_PULL_NEVER:
        return False
    if policy == OPENCLAW_PULL_ALWAYS:
        return True
    return not _image_present_locally(image)


def _resolve_k8s_namespace() -> str:
    if settings.openclaw_k8s_namespace:
        return settings.openclaw_k8s_namespace

    env_namespace = (os.getenv("POD_NAMESPACE") or "").strip()
    if env_namespace:
        return env_namespace

    try:
        value = Path(settings.openclaw_k8s_namespace_path).read_text().strip()
    except OSError:
        value = ""
    return value or "default"


def _runtime_url(url: str, *, k8s_fallback: str) -> str:
    if _use_k8s_runtime():
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        if hostname in _LOCALHOST_HOSTS or hostname.endswith(".localhost"):
            return k8s_fallback
        return url
    return _to_container_url(url)


def _build_container_url(container_name: str, port: int) -> str:
    if _use_k8s_runtime():
        namespace = _resolve_k8s_namespace()
        return f"http://{container_name}.{namespace}.svc.cluster.local:{port}"
    return f"http://localhost:{port}"


# ---------------------------------------------------------------------------
# Port allocation
# ---------------------------------------------------------------------------


def _allocate_port(cur) -> int:  # noqa: ANN001
    """Find next available port in the pool. Must be called inside a transaction."""
    cur.execute(
        """
        SELECT port FROM generate_series(%s::int, %s::int) AS port
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


def _build_volume_args(workspace_dir: Path, runtime_dir: Path) -> list[str]:
    """Build the -v flags for the container run command."""
    args: list[str] = [
        "-v", f"{workspace_dir / 'workspace'}:/workspace",
        "-v", f"{workspace_dir / 'openclaw.json'}:/openclaw.json:ro",
        "-v", f"{runtime_dir}:/runtime",
    ]
    if settings.openclaw_project_mount_path:
        project_path = Path(settings.openclaw_project_mount_path).resolve()
        if project_path.is_dir():
            args.extend(["-v", f"{project_path}:/project:ro"])
        else:
            logger.warning("container.project_mount_skipped", extra={"path": str(project_path)})
    return args


def _build_container_name(user_id: str) -> str:
    """Build a stable per-user container/pod name."""
    raw = f"openclaw-{user_id}".lower()
    normalized = _DNS_LABEL_SANITIZE_RE.sub("-", raw).strip("-")

    if not normalized:
        digest = hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:12]
        return f"openclaw-{digest}"

    if len(normalized) <= _MAX_DNS_LABEL_LEN:
        return normalized

    digest = hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:12]
    keep = _MAX_DNS_LABEL_LEN - len(digest) - 1
    prefix = normalized[:keep].rstrip("-")
    if not prefix:
        prefix = "openclaw"
    return f"{prefix}-{digest}"


def _select_gateway_port(cur) -> int:  # noqa: ANN001
    if _use_k8s_runtime():
        return settings.openclaw_k8s_gateway_port
    return _allocate_port(cur)


def _enforce_k8s_tenant_capacity(cur) -> None:  # noqa: ANN001
    """Fail fast when the tenant-wide OpenClaw pod cap is reached."""
    if not _use_k8s_runtime():
        return
    limit = settings.openclaw_k8s_max_concurrent_pods
    if limit <= 0:
        return
    cur.execute(
        """
        SELECT COUNT(*)::int AS active
        FROM user_agent_settings
        WHERE agent_backend = 'openclaw'
          AND container_name IS NOT NULL
          AND container_status IN ('starting', 'running')
        """
    )
    row = cur.fetchone() or {}
    active = int(row.get("active", 0) or 0)
    if active >= limit:
        raise RuntimeError(
            f"OpenClaw tenant capacity reached ({active}/{limit} active pods). "
            "Try again after idle containers are reaped."
        )


def _build_label_args(user_id: str) -> list[str]:
    """Build --label args for managed container metadata and Rancher grouping."""
    labels = [
        f"copilot.user_id={user_id}",
        "copilot.managed=true",
        f"com.docker.compose.project={COMPOSE_PROJECT_LABEL}",
        f"com.docker.compose.service={OPENCLAW_SERVICE_LABEL}",
    ]
    args: list[str] = []
    for label in labels:
        args.extend(["--label", label])
    return args


# ---------------------------------------------------------------------------
# Kubernetes runtime helpers
# ---------------------------------------------------------------------------


def _k8s_api_base() -> str:
    return settings.openclaw_k8s_api_url.rstrip("/")


def _k8s_token() -> str:
    try:
        token = Path(settings.openclaw_k8s_service_account_token_path).read_text().strip()
    except OSError as exc:
        raise RuntimeError("Kubernetes service account token is unavailable") from exc
    if not token:
        raise RuntimeError("Kubernetes service account token is empty")
    return token


def _k8s_verify_option() -> str | bool:
    ca_path = Path(settings.openclaw_k8s_service_account_ca_path)
    if ca_path.is_file():
        return str(ca_path)
    return True


def _k8s_request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    ok_statuses: set[int] | None = None,
) -> httpx.Response:
    if ok_statuses is None:
        ok_statuses = {200, 201, 202, 204}

    url = f"{_k8s_api_base()}{path}"
    headers = {
        "Authorization": f"Bearer {_k8s_token()}",
        "Accept": "application/json",
    }

    with httpx.Client(
        timeout=settings.openclaw_k8s_http_timeout,
        verify=_k8s_verify_option(),
    ) as client:
        resp = client.request(method, url, headers=headers, json=json_body)

    if resp.status_code not in ok_statuses:
        detail = (resp.text or "").strip().replace("\n", " ")
        raise RuntimeError(
            f"Kubernetes API {method} {path} failed with {resp.status_code}: {detail[:240]}"
        )
    return resp


def _k8s_resource_path(kind: str, name: str | None = None) -> str:
    namespace = _resolve_k8s_namespace()
    base = "/pods" if kind == "pod" else "/services"
    path = f"/api/v1/namespaces/{namespace}{base}"
    if name:
        path = f"{path}/{name}"
    return path


def _k8s_delete_if_exists(kind: str, name: str) -> None:
    _k8s_request(
        "DELETE",
        _k8s_resource_path(kind, name),
        json_body={"gracePeriodSeconds": 0},
        ok_statuses={200, 202, 404},
    )
    deadline = time.monotonic() + settings.openclaw_k8s_delete_timeout_seconds
    while time.monotonic() < deadline:
        resp = _k8s_request(
            "GET",
            _k8s_resource_path(kind, name),
            ok_statuses={200, 404},
        )
        if resp.status_code == 404:
            return
        time.sleep(0.25)
    raise RuntimeError(f"Timed out deleting Kubernetes {kind}: {name}")


def _k8s_labels(user_id: str, container_name: str) -> dict[str, str]:
    return {
        "app": "openclaw",
        "app.kubernetes.io/name": "openclaw",
        "app.kubernetes.io/component": "runtime",
        "app.kubernetes.io/managed-by": "project-backend",
        "openclaw.instance": container_name,
        "copilot.user_id": user_id,
        "copilot.managed": "true",
    }


def _k8s_annotations(user_id: str, container_name: str) -> dict[str, str]:
    return {
        "project.senticor.ai/runtime": "openclaw-k8s",
        "project.senticor.ai/owner-user-id": user_id,
        "project.senticor.ai/instance": container_name,
    }


def _k8s_apply_resources(
    *,
    user_id: str,
    container_name: str,
    port: int,
    env_vars: dict[str, str],
) -> None:
    labels = _k8s_labels(user_id, container_name)
    annotations = _k8s_annotations(user_id, container_name)

    _k8s_delete_if_exists("pod", container_name)
    _k8s_delete_if_exists("service", container_name)

    service_manifest = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": container_name,
            "labels": labels,
            "annotations": annotations,
        },
        "spec": {
            "selector": {
                "app": "openclaw",
                "openclaw.instance": container_name,
            },
            "ports": [
                {
                    "name": "http",
                    "port": port,
                    "targetPort": port,
                    "protocol": "TCP",
                }
            ],
        },
    }
    _k8s_request(
        "POST",
        _k8s_resource_path("service"),
        json_body=service_manifest,
    )

    image_pull_secrets: list[dict[str, str]] = []
    if settings.openclaw_k8s_image_pull_secret:
        image_pull_secrets.append({"name": settings.openclaw_k8s_image_pull_secret})

    env_list = [{"name": name, "value": value} for name, value in env_vars.items()]
    user_subpath = user_id.replace("/", "-")
    pod_spec: dict[str, object] = {
        "restartPolicy": "Always",
        "containers": [
            {
                "name": "openclaw",
                "image": settings.openclaw_image,
                "imagePullPolicy": "Always",
                "ports": [{"containerPort": port, "name": "http"}],
                "env": env_list,
                "volumeMounts": [
                    {
                        "name": "backend-files",
                        "mountPath": "/workspace",
                        "subPath": f"openclaw/{user_subpath}/workspace",
                    },
                    {
                        "name": "backend-files",
                        "mountPath": "/openclaw.json",
                        "subPath": f"openclaw/{user_subpath}/openclaw.json",
                        "readOnly": True,
                    },
                    {
                        "name": "backend-files",
                        "mountPath": "/runtime",
                        "subPath": f"openclaw-runtime/{user_subpath}",
                    },
                ],
                "securityContext": {
                    "allowPrivilegeEscalation": False,
                    "capabilities": {"drop": ["ALL"]},
                },
                "resources": {
                    "requests": {
                        "cpu": settings.openclaw_k8s_cpu_request,
                        "memory": settings.openclaw_k8s_memory_request,
                    },
                    "limits": {
                        "cpu": settings.openclaw_k8s_cpu_limit,
                        "memory": settings.openclaw_k8s_memory_limit,
                    },
                },
            }
        ],
        "volumes": [
            {
                "name": "backend-files",
                "persistentVolumeClaim": {"claimName": settings.openclaw_k8s_pvc_name},
            }
        ],
    }
    if image_pull_secrets:
        pod_spec["imagePullSecrets"] = image_pull_secrets

    pod_manifest = {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {
            "name": container_name,
            "labels": labels,
            "annotations": annotations,
        },
        "spec": pod_spec,
    }
    _k8s_request(
        "POST",
        _k8s_resource_path("pod"),
        json_body=pod_manifest,
    )


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

            _enforce_k8s_tenant_capacity(cur)
            port = _select_gateway_port(cur)
            gateway_token = secrets.token_urlsafe(32)
            container_name = _build_container_name(user_id)
            container_url = _build_container_url(container_name, port)

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
                    container_url,
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
    try:
        memory_sync = reconcile_workspace_memory(user_id=user_id)
        if memory_sync["restored"] or memory_sync["seeded"]:
            logger.info(
                "container.memory_reconciled",
                extra={
                    "user_id": user_id,
                    "restored": memory_sync["restored"],
                    "seeded": memory_sync["seeded"],
                },
            )
    except Exception:
        logger.warning(
            "container.memory_reconcile_failed",
            extra={"user_id": user_id},
            exc_info=True,
        )

    # Decrypt API key (for env var injection only — never on disk)
    api_key = _decrypt_api_key(row["api_key_encrypted"])
    api_key_env = API_KEY_ENV_MAP.get(provider, "OPENROUTER_API_KEY")

    env_vars = {
        api_key_env: api_key,
        "OPENCLAW_GATEWAY_TOKEN": gateway_token,
        "COPILOT_BACKEND_URL": _runtime_url(
            settings.backend_base_url,
            k8s_fallback="http://backend:8000",
        ),
        "COPILOT_FRONTEND_URL": _runtime_url(
            settings.frontend_base_url,
            k8s_fallback="http://frontend",
        ),
        "COPILOT_STORYBOOK_URL": _runtime_url(
            settings.storybook_url,
            k8s_fallback="http://storybook",
        ),
        "OPENCLAW_CONFIG_PATH": "/openclaw.json",
    }

    if _use_k8s_runtime():
        try:
            _k8s_apply_resources(
                user_id=user_id,
                container_name=container_name,
                port=port,
                env_vars=env_vars,
            )
        except Exception as exc:
            _mark_error(user_id, f"Kubernetes start failed: {str(exc)[:220]}")
            raise RuntimeError(f"Kubernetes start failed: {exc!s}") from exc
    else:
        # Pull policy defaults to "never" so local dev can use a custom image
        # built from openclaw/Dockerfile.alpha without any upstream registry.
        if _should_pull_image(settings.openclaw_image):
            pull_result = run_cmd(["pull", settings.openclaw_image], timeout=120)
            if pull_result.returncode != 0:
                detail = (pull_result.stderr or pull_result.stdout or "image pull failed").strip()
                _mark_error(user_id, f"Image pull failed: {detail[:240]}")
                raise RuntimeError(f"Image pull failed: {detail[:200]}")

        # Remove any old container with the same name
        run_cmd(["rm", "-f", container_name])

        # Build volume mounts
        volume_args = _build_volume_args(workspace_dir, runtime_dir)
        label_args = _build_label_args(user_id)

        # Start container
        result = run_cmd(
            [
                "run",
                "-d",
                "--name",
                container_name,
                "-p",
                f"{port}:{port}",
                *volume_args,
                "-e",
                f"{api_key_env}={api_key}",
                "-e",
                f"OPENCLAW_GATEWAY_TOKEN={gateway_token}",
                "-e",
                f"COPILOT_BACKEND_URL={env_vars['COPILOT_BACKEND_URL']}",
                "-e",
                f"COPILOT_FRONTEND_URL={env_vars['COPILOT_FRONTEND_URL']}",
                "-e",
                f"COPILOT_STORYBOOK_URL={env_vars['COPILOT_STORYBOOK_URL']}",
                "-e",
                "OPENCLAW_CONFIG_PATH=/openclaw.json",
                *label_args,
                settings.openclaw_image,
            ]
        )

        if result.returncode != 0:
            _mark_error(user_id, result.stderr[:300])
            raise RuntimeError(f"Container start failed: {result.stderr[:200]}")

    # Wait for health check
    _wait_for_healthy(user_id, container_url)

    return ContainerInfo(
        name=container_name,
        url=container_url,
        port=port,
        token=gateway_token,
    )


def _wait_for_healthy(user_id: str, url: str) -> None:
    """Poll OpenClaw readiness endpoints until ready or timeout."""
    deadline = time.monotonic() + settings.openclaw_health_check_timeout
    while time.monotonic() < deadline:
        if _is_container_ready(url):
            _mark_running(user_id)
            return
        time.sleep(1.0)

    _mark_error(user_id, f"Health check timeout after {settings.openclaw_health_check_timeout}s")
    raise RuntimeError(f"Container health check timeout for user {user_id}")


def _is_container_ready(url: str) -> bool:
    """Return True when OpenClaw is reachable and ready to accept chat requests."""
    try:
        resp = httpx.get(f"{url}/health", timeout=2.0)
        if resp.status_code == 200:
            return True
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError):
        pass

    # OpenClaw images may not expose /health; /v1/chat/completions typically
    # returns 405 to GET once the gateway is ready.
    try:
        resp = httpx.get(f"{url}/v1/chat/completions", timeout=2.0)
        return resp.status_code in _READY_CHAT_STATUS_CODES
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError):
        return False


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


def _mark_running(user_id: str) -> None:
    """Mark a container as running and clear previous error details."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_agent_settings SET
                    container_status = 'running',
                    container_error = NULL,
                    updated_at = now()
                WHERE user_id = %s
                """,
                (user_id,),
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

    try:
        backup_stats = sync_workspace_memory_to_db(user_id=user_id, source=SOURCE_RUNTIME_SYNC)
        if backup_stats["backed_up"]:
            logger.info(
                "container.memory_backed_up",
                extra={"user_id": user_id, "backed_up": backup_stats["backed_up"]},
            )
    except Exception:
        logger.warning("container.memory_backup_failed", extra={"user_id": user_id}, exc_info=True)

    if not row or not row["container_name"]:
        return

    container_name = row["container_name"]
    if _use_k8s_runtime():
        try:
            _k8s_delete_if_exists("pod", container_name)
            _k8s_delete_if_exists("service", container_name)
        except Exception:
            logger.warning(
                "container.k8s_stop_failed",
                extra={"user_id": user_id, "container_name": container_name},
                exc_info=True,
            )
    else:
        run_cmd(["rm", "-f", container_name])

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


def hard_refresh_container(user_id: str) -> dict[str, bool]:
    """Stop the container and delete persisted per-user OpenClaw state."""
    stop_container(user_id)

    storage_root = settings.file_storage_path.resolve()
    workspace_dir = storage_root / "openclaw" / user_id
    runtime_dir = storage_root / "openclaw-runtime" / user_id

    removed_workspace = False
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir)
        removed_workspace = True

    removed_runtime = False
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
        removed_runtime = True

    logger.info(
        "container.hard_refreshed",
        extra={
            "user_id": user_id,
            "removed_workspace": removed_workspace,
            "removed_runtime": removed_runtime,
        },
    )
    return {
        "removedWorkspace": removed_workspace,
        "removedRuntime": removed_runtime,
    }


# ---------------------------------------------------------------------------
# Token file for OpenClaw skills
# ---------------------------------------------------------------------------


def write_token_file(user_id: str, token: str) -> None:
    """Write a fresh delegated JWT to the user's runtime directory.

    The token file is read by the OpenClaw agent's backend-api skill
    via ``$(cat /runtime/token)`` in curl commands.
    """
    runtime_dir = settings.file_storage_path.resolve() / "openclaw-runtime" / user_id
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
                SELECT container_url, container_status, container_name, container_error
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if row and row["container_status"] == "running" and row["container_url"]:
        # Quick health check on existing container
        try:
            if _is_container_ready(row["container_url"]):
                touch_activity(user_id)
                token = _read_gateway_token(user_id)
                return row["container_url"], token
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError):
            logger.warning(
                "container.health_failed",
                extra={"user_id": user_id},
            )
            stop_container(user_id)
    elif row and row["container_status"] in ("starting", "error"):
        current_url = row["container_url"]
        if current_url:
            try:
                if _is_container_ready(current_url):
                    _mark_running(user_id)
                    touch_activity(user_id)
                    token = _read_gateway_token(user_id)
                    return current_url, token
            except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError):
                logger.warning(
                    "container.health_failed",
                    extra={"user_id": user_id, "status": row["container_status"]},
                    exc_info=True,
                )

        if row["container_status"] == "starting":
            raise RuntimeError("OpenClaw container is still starting")

        if row["container_error"]:
            raise RuntimeError(str(row["container_error"]))

        # Fallback for inconsistent state without error details.
        stop_container(user_id)

    # Start fresh
    info = start_container(user_id)
    return info.url, info.token


def _read_gateway_token(user_id: str) -> str:
    """Read the gateway token from the user's provisioned openclaw.json."""
    config_path = settings.file_storage_path.resolve() / "openclaw" / user_id / "openclaw.json"
    config = json.loads(config_path.read_text())
    return config["gateway"]["auth"]["token"]


def get_identity_name(user_id: str) -> str | None:
    """Read the agent display name from workspace/IDENTITY.md when available."""
    identity_path = (
        settings.file_storage_path.resolve() / "openclaw" / user_id / "workspace" / "IDENTITY.md"
    )
    try:
        content = identity_path.read_text()
    except FileNotFoundError:
        return None
    except OSError:
        logger.warning("container.identity_read_failed", extra={"user_id": user_id}, exc_info=True)
        return None

    for line in content.splitlines():
        match = IDENTITY_NAME_PATTERN.match(line)
        if not match:
            continue
        value = match.group(1).strip()
        if not value:
            continue
        if value.startswith("_("):
            # Template placeholder; not a real user-selected name.
            return None
        return value
    return None


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


def _active_openclaw_container_names() -> set[str]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT container_name
                FROM user_agent_settings
                WHERE agent_backend = 'openclaw'
                  AND container_name IS NOT NULL
                  AND container_status IN ('starting', 'running')
                """
            )
            rows = cur.fetchall()
    return {str(row["container_name"]) for row in rows if row.get("container_name")}


def _k8s_list_resource_names(kind: str) -> set[str]:
    selector = OPENCLAW_K8S_LABEL_SELECTOR.replace("=", "%3D").replace(",", "%2C")
    resp = _k8s_request(
        "GET",
        f"{_k8s_resource_path(kind)}?labelSelector={selector}",
        ok_statuses={200},
    )
    payload = resp.json() if resp.content else {}
    items = payload.get("items") or []
    names: set[str] = set()
    for item in items:
        metadata = item.get("metadata") or {}
        name = metadata.get("name")
        if name:
            names.add(str(name))
    return names


def reap_orphaned_k8s_resources() -> dict[str, int]:
    """Delete openclaw-labeled pods/services that are no longer tracked in DB."""
    if not _use_k8s_runtime():
        return {"pods": 0, "services": 0}

    active_names = _active_openclaw_container_names()
    orphan_pods = sorted(_k8s_list_resource_names("pod") - active_names)
    orphan_services = sorted(_k8s_list_resource_names("service") - active_names)

    deleted_pods = 0
    for name in orphan_pods:
        _k8s_delete_if_exists("pod", name)
        deleted_pods += 1

    deleted_services = 0
    for name in orphan_services:
        _k8s_delete_if_exists("service", name)
        deleted_services += 1

    if deleted_pods or deleted_services:
        logger.info(
            "container.k8s_orphans_reaped",
            extra={
                "deleted_pods": deleted_pods,
                "deleted_services": deleted_services,
            },
        )

    return {"pods": deleted_pods, "services": deleted_services}


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
