from __future__ import annotations

import hashlib
import json
import shutil

from app.config import settings
from app.container.memory_store import (
    OPENCLAW_CONFIG_SNAPSHOT_FILENAME,
    reconcile_workspace_memory,
    sync_workspace_memory_to_db,
)
from app.db import db_conn


def _workspace_dir(user_id: str):
    workspace = settings.file_storage_path.resolve() / "openclaw" / user_id / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def _user_root_dir(user_id: str):
    user_root = settings.file_storage_path.resolve() / "openclaw" / user_id
    user_root.mkdir(parents=True, exist_ok=True)
    return user_root


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def test_reconcile_workspace_memory_restores_missing_file_from_db(auth_context):
    org_id, user_id = auth_context
    content = "I am Vesper.\nMy memory must survive resets.\n"
    content_sha = _sha256(content)

    workspace = _workspace_dir(user_id)
    soul_path = workspace / "SOUL.md"
    if soul_path.exists():
        soul_path.unlink()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO openclaw_memory_versions (
                  user_id, org_id, filename, version, content, content_sha256, source
                )
                VALUES (%s, %s, 'SOUL.md', 1, %s, %s, 'bootstrap')
                """,
                (user_id, org_id, content, content_sha),
            )
            cur.execute(
                """
                INSERT INTO openclaw_memory_heads (
                  user_id, filename, current_version, current_sha256
                )
                VALUES (%s, 'SOUL.md', 1, %s)
                """,
                (user_id, content_sha),
            )
        conn.commit()

    result = reconcile_workspace_memory(user_id)

    assert result == {"restored": 1, "seeded": 0}
    assert soul_path.read_text() == content


def test_reconcile_workspace_memory_seeds_db_from_workspace(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    soul_path = workspace / "SOUL.md"
    content = "Soul seed from workspace.\n"
    soul_path.write_text(content)

    result = reconcile_workspace_memory(user_id, org_id=org_id)

    assert result == {"restored": 0, "seeded": 1}

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT current_version, current_sha256
                FROM openclaw_memory_heads
                WHERE user_id = %s AND filename = 'SOUL.md'
                """,
                (user_id,),
            )
            head = cur.fetchone()
            cur.execute(
                """
                SELECT version, content, content_sha256, source
                FROM openclaw_memory_versions
                WHERE user_id = %s AND filename = 'SOUL.md'
                ORDER BY version ASC
                """,
                (user_id,),
            )
            versions = cur.fetchall()

    assert head is not None
    assert head["current_version"] == 1
    assert head["current_sha256"] == _sha256(content)
    assert len(versions) == 1
    assert versions[0]["version"] == 1
    assert versions[0]["content"] == content
    assert versions[0]["content_sha256"] == _sha256(content)
    assert versions[0]["source"] == "bootstrap"


def test_sync_workspace_memory_to_db_versions_only_on_change(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    soul_path = workspace / "SOUL.md"

    first = "Version one.\n"
    second = "Version two.\n"
    soul_path.write_text(first)

    first_sync = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    no_change_sync = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    soul_path.write_text(second)
    second_sync = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")

    assert first_sync == {"backed_up": 1}
    assert no_change_sync == {"backed_up": 0}
    assert second_sync == {"backed_up": 1}

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version, content, source
                FROM openclaw_memory_versions
                WHERE user_id = %s AND filename = 'SOUL.md'
                ORDER BY version ASC
                """,
                (user_id,),
            )
            versions = cur.fetchall()
            cur.execute(
                """
                SELECT current_version, current_sha256
                FROM openclaw_memory_heads
                WHERE user_id = %s AND filename = 'SOUL.md'
                """,
                (user_id,),
            )
            head = cur.fetchone()

    assert [row["version"] for row in versions] == [1, 2]
    assert [row["content"] for row in versions] == [first, second]
    assert all(row["source"] == "runtime-sync" for row in versions)
    assert head is not None
    assert head["current_version"] == 2
    assert head["current_sha256"] == _sha256(second)


def test_memory_roundtrip_survives_workspace_recreation(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    soul_path = workspace / "SOUL.md"
    content = "Vesper remains initialized across deploys.\n"
    soul_path.write_text(content)

    backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert backup == {"backed_up": 1}

    # Simulate k3s pod/workspace recreation during deploy or Flux upgrade.
    shutil.rmtree(workspace)
    assert not soul_path.exists()

    restored = reconcile_workspace_memory(user_id, org_id=org_id)

    assert restored == {"restored": 1, "seeded": 0}
    assert soul_path.read_text() == content


def test_workspace_state_roundtrip_survives_workspace_recreation(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    state_path = workspace / ".openclaw" / "workspace-state.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_payload = {
        "version": 1,
        "bootstrapSeededAt": "2026-02-28T14:30:23.678Z",
        "onboardingCompletedAt": "2026-02-28T15:46:39.642Z",
    }
    state_path.write_text(json.dumps(state_payload, indent=2))

    backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert backup == {"backed_up": 1}

    state_path.unlink()
    restored = reconcile_workspace_memory(user_id, org_id=org_id)

    assert restored == {"restored": 1, "seeded": 0}
    restored_payload = json.loads(state_path.read_text())
    assert restored_payload == state_payload


def test_runtime_conversation_assets_roundtrip_survives_workspace_recreation(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    conversation_path = workspace / ".openclaw" / "conversations" / "session-1.jsonl"
    conversation_path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        '{"role":"user","content":"hello"}\n'
        '{"role":"assistant","content":"hi there"}\n'
    )
    conversation_path.write_text(content)

    backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert backup == {"backed_up": 1}

    shutil.rmtree(workspace / ".openclaw")
    restored = reconcile_workspace_memory(user_id, org_id=org_id)

    assert restored == {"restored": 1, "seeded": 0}
    assert conversation_path.read_text() == content


def test_items_json_roundtrip_survives_workspace_recreation(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    items_path = workspace / "items.json"
    items_payload = [
        {"id": "conv-1", "role": "user", "content": "remember this"},
        {"id": "conv-2", "role": "assistant", "content": "I remember"},
    ]
    items_path.write_text(json.dumps(items_payload, indent=2))

    backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert backup == {"backed_up": 1}

    items_path.unlink()
    restored = reconcile_workspace_memory(user_id, org_id=org_id)

    assert restored == {"restored": 1, "seeded": 0}
    restored_payload = json.loads(items_path.read_text())
    assert restored_payload == items_payload


def test_reconcile_restores_unknown_runtime_asset_from_db_head(auth_context):
    org_id, user_id = auth_context
    workspace = _workspace_dir(user_id)
    runtime_rel = ".openclaw/runtime-v2/session-index.bin"
    runtime_path = workspace / runtime_rel
    content = "session-index-v2"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO openclaw_memory_versions (
                  user_id, org_id, filename, version, content, content_sha256, source
                )
                VALUES (%s, %s, %s, 1, %s, %s, 'runtime-sync')
                """,
                (user_id, org_id, runtime_rel, content, _sha256(content)),
            )
            cur.execute(
                """
                INSERT INTO openclaw_memory_heads (
                  user_id, filename, current_version, current_sha256
                )
                VALUES (%s, %s, 1, %s)
                """,
                (user_id, runtime_rel, _sha256(content)),
            )
        conn.commit()

    assert not runtime_path.exists()
    restored = reconcile_workspace_memory(user_id, org_id=org_id)

    assert restored == {"restored": 1, "seeded": 0}
    assert runtime_path.read_text() == content


def test_sync_workspace_memory_normalizes_openclaw_config_snapshot(auth_context):
    org_id, user_id = auth_context
    user_root = _user_root_dir(user_id)
    config_path = user_root / "openclaw.json"

    first_config = {
        "gateway": {
            "port": 18789,
            "auth": {"token": "token-initial"},
            "controlUi": {"enabled": False},
        },
        "agents": {
            "defaults": {
                "model": {"primary": "openrouter/model-a"},
                "imageModel": {"primary": "openrouter/model-a"},
            }
        },
        "tools": {
            "profile": "coding",
            "exec": {"security": "full", "allowlist": ["project-cli"]},
        },
    }
    config_path.write_text(json.dumps(first_config, indent=2))

    first_backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert first_backup == {"backed_up": 1}

    second_config = {
        "gateway": {
            "port": 18888,
            "auth": {"token": "token-rotated"},
            "controlUi": {"enabled": False},
        },
        "agents": {
            "defaults": {
                "model": {"primary": "openrouter/model-b"},
                "imageModel": {"primary": "openrouter/model-b"},
            }
        },
        "tools": {
            "profile": "coding",
            "exec": {"security": "full", "allowlist": ["project-cli"]},
        },
    }
    config_path.write_text(json.dumps(second_config, indent=2))
    second_backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert second_backup == {"backed_up": 0}

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version, content
                FROM openclaw_memory_versions
                WHERE user_id = %s
                  AND filename = %s
                ORDER BY version ASC
                """,
                (user_id, OPENCLAW_CONFIG_SNAPSHOT_FILENAME),
            )
            versions = cur.fetchall()

    assert [row["version"] for row in versions] == [1]
    snapshot_payload = json.loads(versions[0]["content"])
    assert "port" not in snapshot_payload["gateway"]
    auth_payload = snapshot_payload["gateway"].get("auth", {})
    assert "token" not in auth_payload
    assert "primary" not in snapshot_payload["agents"]["defaults"]["model"]
    assert "primary" not in snapshot_payload["agents"]["defaults"]["imageModel"]
    assert snapshot_payload["tools"]["exec"]["allowlist"] == ["project-cli"]


def test_reconcile_workspace_memory_applies_openclaw_config_overlay(auth_context):
    org_id, user_id = auth_context
    user_root = _user_root_dir(user_id)
    config_path = user_root / "openclaw.json"

    persisted_config = {
        "gateway": {
            "port": 18789,
            "auth": {"token": "token-old"},
            "http": {"endpoints": {"chatCompletions": {"enabled": False}}},
        },
        "agents": {
            "defaults": {
                "model": {"primary": "openrouter/model-a"},
                "imageModel": {"primary": "openrouter/model-a"},
            }
        },
        "tools": {
            "profile": "coding",
            "exec": {"security": "full", "allowlist": ["project-cli"]},
        },
    }
    config_path.write_text(json.dumps(persisted_config, indent=2))
    backup = sync_workspace_memory_to_db(user_id, org_id=org_id, source="runtime-sync")
    assert backup == {"backed_up": 1}

    regenerated_runtime_config = {
        "gateway": {
            "port": 19999,
            "auth": {"token": "token-new"},
            "http": {"endpoints": {"chatCompletions": {"enabled": True}}},
        },
        "agents": {
            "defaults": {
                "model": {"primary": "openrouter/model-new"},
                "imageModel": {"primary": "openrouter/model-new"},
            }
        },
        "tools": {
            "profile": "coding",
            "exec": {"security": "full"},
        },
    }
    config_path.write_text(json.dumps(regenerated_runtime_config, indent=2))

    restored = reconcile_workspace_memory(user_id, org_id=org_id)
    assert restored == {"restored": 1, "seeded": 0}

    reconciled = json.loads(config_path.read_text())
    assert reconciled["gateway"]["port"] == 19999
    assert reconciled["gateway"]["auth"]["token"] == "token-new"
    assert reconciled["agents"]["defaults"]["model"]["primary"] == "openrouter/model-new"
    assert reconciled["agents"]["defaults"]["imageModel"]["primary"] == "openrouter/model-new"
    assert reconciled["tools"]["exec"]["allowlist"] == ["project-cli"]
    assert reconciled["gateway"]["http"]["endpoints"]["chatCompletions"]["enabled"] is False
