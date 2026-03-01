"""OpenClaw memory persistence helpers.

Keeps durable versions of key workspace markdown files in Postgres and
restores missing files when a workspace is re-created.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import NamedTuple

from ..config import settings
from ..db import db_conn

logger = logging.getLogger(__name__)

SOURCE_BOOTSTRAP = "bootstrap"
SOURCE_RUNTIME_SYNC = "runtime-sync"
SOURCE_MANUAL_RESTORE = "manual-restore"
_ALLOWED_SOURCES = {SOURCE_BOOTSTRAP, SOURCE_RUNTIME_SYNC, SOURCE_MANUAL_RESTORE}

SCOPE_WORKSPACE = "workspace"
SCOPE_ROOT = "root"
RESTORE_MISSING = "missing"
RESTORE_OVERLAY = "overlay"
TRANSFORM_NONE = "none"
TRANSFORM_JSON_CANONICAL = "json-canonical"
TRANSFORM_OPENCLAW_CONFIG_SNAPSHOT = "openclaw-config-snapshot"
OPENCLAW_CONFIG_SNAPSHOT_FILENAME = "openclaw.config.snapshot.json"
RUNTIME_STATE_DIR = ".openclaw"
RUNTIME_DB_FILENAME_PREFIX = ".openclaw/"


class ManagedStateFile(NamedTuple):
    db_filename: str
    disk_relative_path: str
    scope: str = SCOPE_WORKSPACE
    restore_mode: str = RESTORE_MISSING
    transform_mode: str = TRANSFORM_NONE


MANAGED_STATE_FILES: tuple[ManagedStateFile, ...] = (
    ManagedStateFile("IDENTITY.md", "IDENTITY.md"),
    ManagedStateFile("USER.md", "USER.md"),
    ManagedStateFile("SOUL.md", "SOUL.md"),
    ManagedStateFile("HEARTBEAT.md", "HEARTBEAT.md"),
    ManagedStateFile("MEMORY.md", "MEMORY.md"),
    ManagedStateFile("memory.md", "memory.md"),
    ManagedStateFile("items.json", "items.json", transform_mode=TRANSFORM_JSON_CANONICAL),
    ManagedStateFile(
        OPENCLAW_CONFIG_SNAPSHOT_FILENAME,
        "openclaw.json",
        scope=SCOPE_ROOT,
        restore_mode=RESTORE_OVERLAY,
        transform_mode=TRANSFORM_OPENCLAW_CONFIG_SNAPSHOT,
    ),
)


def _workspace_dir(user_id: str) -> Path:
    return _user_root_dir(user_id) / "workspace"


def _user_root_dir(user_id: str) -> Path:
    return settings.file_storage_path.resolve() / "openclaw" / user_id


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _resolve_org_id(cur, user_id: str, explicit_org_id: str | None) -> str | None:  # noqa: ANN001
    if explicit_org_id:
        return explicit_org_id

    cur.execute("SELECT default_org_id FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if row and row.get("default_org_id"):
        return str(row["default_org_id"])

    cur.execute(
        """
        SELECT org_id
        FROM org_memberships
        WHERE user_id = %s
          AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (user_id,),
    )
    row = cur.fetchone()
    if row and row.get("org_id"):
        return str(row["org_id"])
    return None


def _current_head(cur, user_id: str, filename: str):  # noqa: ANN001
    cur.execute(
        """
        SELECT h.current_version, h.current_sha256, v.content
        FROM openclaw_memory_heads h
        JOIN openclaw_memory_versions v
          ON v.user_id = h.user_id
         AND v.filename = h.filename
         AND v.version = h.current_version
        WHERE h.user_id = %s
          AND h.filename = %s
        """,
        (user_id, filename),
    )
    return cur.fetchone()


def _append_version(  # noqa: PLR0913
    cur,  # noqa: ANN001
    *,
    user_id: str,
    org_id: str,
    filename: str,
    content: str,
    source: str,
) -> bool:
    content_sha = _sha256(content)

    cur.execute(
        """
        SELECT current_sha256
        FROM openclaw_memory_heads
        WHERE user_id = %s
          AND filename = %s
        """,
        (user_id, filename),
    )
    head = cur.fetchone()
    if head and head.get("current_sha256") == content_sha:
        return False

    cur.execute(
        """
        SELECT COALESCE(MAX(version), 0) AS max_version
        FROM openclaw_memory_versions
        WHERE user_id = %s
          AND filename = %s
        """,
        (user_id, filename),
    )
    row = cur.fetchone()
    next_version = int(row["max_version"]) + 1

    cur.execute(
        """
        INSERT INTO openclaw_memory_versions (
          user_id, org_id, filename, version, content, content_sha256, source
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (user_id, org_id, filename, next_version, content, content_sha, source),
    )
    cur.execute(
        """
        INSERT INTO openclaw_memory_heads (
          user_id, filename, current_version, current_sha256
        )
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, filename)
        DO UPDATE SET
          current_version = EXCLUDED.current_version,
          current_sha256 = EXCLUDED.current_sha256,
          updated_at = now()
        """,
        (user_id, filename, next_version, content_sha),
    )
    return True


def _resolve_disk_path(user_id: str, state_file: ManagedStateFile) -> Path:
    if state_file.scope == SCOPE_WORKSPACE:
        return _workspace_dir(user_id) / state_file.disk_relative_path
    return _user_root_dir(user_id) / state_file.disk_relative_path


def _canonicalize_json_text(content: str) -> str:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return content
    return json.dumps(payload, indent=2, sort_keys=True)


def _build_openclaw_config_snapshot(content: str) -> str:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return content
    if not isinstance(payload, dict):
        return _canonicalize_json_text(content)

    gateway = payload.get("gateway")
    if isinstance(gateway, dict):
        gateway.pop("port", None)
        auth = gateway.get("auth")
        if isinstance(auth, dict):
            auth.pop("token", None)
            if not auth:
                gateway.pop("auth", None)

    defaults = (payload.get("agents") or {}).get("defaults")
    if isinstance(defaults, dict):
        model = defaults.get("model")
        if isinstance(model, dict):
            model.pop("primary", None)
        image_model = defaults.get("imageModel")
        if isinstance(image_model, dict):
            image_model.pop("primary", None)

    return json.dumps(payload, indent=2, sort_keys=True)


def _content_for_db(content: str, state_file: ManagedStateFile) -> str:
    if state_file.transform_mode == TRANSFORM_JSON_CANONICAL:
        return _canonicalize_json_text(content)
    if state_file.transform_mode == TRANSFORM_OPENCLAW_CONFIG_SNAPSHOT:
        return _build_openclaw_config_snapshot(content)
    return content


def _read_for_db(path: Path, state_file: ManagedStateFile) -> str | None:
    try:
        return _content_for_db(path.read_text(), state_file)
    except OSError:
        return None


def _transform_mode_for_runtime_asset(db_filename: str) -> str:
    if db_filename.endswith(".json"):
        return TRANSFORM_JSON_CANONICAL
    return TRANSFORM_NONE


def _discover_runtime_state_files(user_id: str) -> tuple[ManagedStateFile, ...]:
    workspace_dir = _workspace_dir(user_id)
    runtime_dir = workspace_dir / RUNTIME_STATE_DIR
    if not runtime_dir.is_dir():
        return ()

    discovered: list[ManagedStateFile] = []
    for path in sorted(runtime_dir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(workspace_dir).as_posix()
        discovered.append(
            ManagedStateFile(
                relative,
                relative,
                scope=SCOPE_WORKSPACE,
                restore_mode=RESTORE_MISSING,
                transform_mode=_transform_mode_for_runtime_asset(relative),
            )
        )
    return tuple(discovered)


def _list_runtime_state_heads(cur, user_id: str):  # noqa: ANN001
    cur.execute(
        """
        SELECT h.filename, v.content
        FROM openclaw_memory_heads h
        JOIN openclaw_memory_versions v
          ON v.user_id = h.user_id
         AND v.filename = h.filename
         AND v.version = h.current_version
        WHERE h.user_id = %s
          AND h.filename LIKE %s
        ORDER BY h.filename ASC
        """,
        (user_id, f"{RUNTIME_DB_FILENAME_PREFIX}%"),
    )
    return cur.fetchall()


def _deep_merge(base: object, overlay: object) -> object:
    if not isinstance(base, dict) or not isinstance(overlay, dict):
        return overlay
    merged = dict(base)
    for key, overlay_value in overlay.items():
        if key in merged:
            merged[key] = _deep_merge(merged[key], overlay_value)
        else:
            merged[key] = overlay_value
    return merged


def _restore_openclaw_config_overlay(path: Path, overlay_content: str) -> bool:
    try:
        overlay = json.loads(overlay_content)
    except json.JSONDecodeError:
        return False
    if not isinstance(overlay, dict):
        return False
    if not path.is_file():
        return False

    try:
        current_content = path.read_text()
    except OSError:
        return False

    try:
        current_payload = json.loads(current_content)
    except json.JSONDecodeError:
        current_payload = {}
    if not isinstance(current_payload, dict):
        current_payload = {}

    merged_payload = _deep_merge(current_payload, overlay)
    merged_content = json.dumps(merged_payload, indent=2, sort_keys=True)
    if merged_content == current_content:
        return False

    try:
        path.write_text(merged_content)
    except OSError:
        return False
    return True


def reconcile_workspace_memory(user_id: str, *, org_id: str | None = None) -> dict[str, int]:
    """Restore missing state files from DB and seed DB when head is missing.

    Existing workspace files are not overwritten for markdown/state files.
    For OpenClaw config snapshots we apply a non-destructive overlay to
    preserve user custom config while keeping runtime-managed values current.
    """
    _workspace_dir(user_id).mkdir(parents=True, exist_ok=True)

    restored = 0
    seeded = 0

    with db_conn() as conn:
        with conn.cursor() as cur:
            resolved_org_id = _resolve_org_id(cur, user_id, org_id)
            state_files = (*MANAGED_STATE_FILES, *_discover_runtime_state_files(user_id))

            for state_file in state_files:
                path = _resolve_disk_path(user_id, state_file)
                head = _current_head(cur, user_id, state_file.db_filename)

                if path.is_file():
                    if (
                        state_file.restore_mode == RESTORE_OVERLAY
                        and head
                        and _restore_openclaw_config_overlay(path, str(head["content"]))
                    ):
                        restored += 1

                    if head or not resolved_org_id:
                        continue

                    content = _read_for_db(path, state_file)
                    if content is None:
                        logger.warning(
                            "memory.reconcile.read_failed",
                            extra={
                                "user_id": user_id,
                                "db_filename": state_file.db_filename,
                                "path": str(path),
                            },
                        )
                        continue
                    if _append_version(
                        cur,
                        user_id=user_id,
                        org_id=resolved_org_id,
                        filename=state_file.db_filename,
                        content=content,
                        source=SOURCE_BOOTSTRAP,
                    ):
                        seeded += 1
                    continue

                if not head or state_file.restore_mode != RESTORE_MISSING:
                    continue

                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(str(head["content"]))
                except OSError:
                    logger.warning(
                        "memory.reconcile.write_failed",
                        extra={
                            "user_id": user_id,
                            "db_filename": state_file.db_filename,
                            "path": str(path),
                        },
                        exc_info=True,
                    )
                    continue
                restored += 1

            # Runtime assets under .openclaw may be fully missing after
            # workspace recreation, so restore them by scanning DB heads.
            for head_row in _list_runtime_state_heads(cur, user_id):
                db_filename = str(head_row["filename"])
                path = _workspace_dir(user_id) / db_filename
                if path.is_file():
                    continue
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(str(head_row["content"]))
                except OSError:
                    logger.warning(
                        "memory.reconcile.write_failed",
                        extra={
                            "user_id": user_id,
                            "db_filename": db_filename,
                            "path": str(path),
                        },
                        exc_info=True,
                    )
                    continue
                restored += 1
        conn.commit()

    return {"restored": restored, "seeded": seeded}


def sync_workspace_memory_to_db(
    user_id: str,
    *,
    org_id: str | None = None,
    source: str = SOURCE_RUNTIME_SYNC,
) -> dict[str, int]:
    """Persist changed managed state files to versioned DB storage."""
    if source not in _ALLOWED_SOURCES:
        raise ValueError(f"Unsupported OpenClaw memory source: {source}")

    user_root_dir = _user_root_dir(user_id)
    if not user_root_dir.is_dir():
        return {"backed_up": 0}

    backed_up = 0

    with db_conn() as conn:
        with conn.cursor() as cur:
            resolved_org_id = _resolve_org_id(cur, user_id, org_id)
            if not resolved_org_id:
                return {"backed_up": 0}
            state_files = (*MANAGED_STATE_FILES, *_discover_runtime_state_files(user_id))

            for state_file in state_files:
                path = _resolve_disk_path(user_id, state_file)
                if not path.is_file():
                    continue
                content = _read_for_db(path, state_file)
                if content is None:
                    logger.warning(
                        "memory.sync.read_failed",
                        extra={
                            "user_id": user_id,
                            "db_filename": state_file.db_filename,
                            "path": str(path),
                        },
                    )
                    continue

                if _append_version(
                    cur,
                    user_id=user_id,
                    org_id=resolved_org_id,
                    filename=state_file.db_filename,
                    content=content,
                    source=source,
                ):
                    backed_up += 1
        conn.commit()

    return {"backed_up": backed_up}
