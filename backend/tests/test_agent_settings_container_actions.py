"""Tests for agent container control endpoints."""

from __future__ import annotations

import dataclasses

from app.config import settings
from app.db import db_conn


def _patch_settings(monkeypatch, **overrides):
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.routes.agent_settings.settings", patched)
    monkeypatch.setattr("app.container.manager.settings", patched)
    return patched


def test_hard_refresh_returns_404_when_dev_tools_disabled(auth_client, monkeypatch):
    _patch_settings(monkeypatch, dev_tools_enabled=False)

    response = auth_client.post("/agent/container/hard-refresh")
    assert response.status_code == 404


def test_hard_refresh_calls_container_manager_when_enabled(auth_client, monkeypatch):
    _patch_settings(monkeypatch, dev_tools_enabled=True)
    called: dict[str, str] = {}

    def _fake_hard_refresh(user_id: str):
        called["user_id"] = user_id
        return {"removedWorkspace": True, "removedRuntime": False}

    monkeypatch.setattr("app.routes.agent_settings.hard_refresh_container", _fake_hard_refresh)

    response = auth_client.post("/agent/container/hard-refresh")
    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "removedWorkspace": True,
        "removedRuntime": False,
    }
    assert called["user_id"]


def test_hard_refresh_preserves_agent_settings_for_upgrade_resilience(
    auth_client, monkeypatch, tmp_path
):
    _patch_settings(monkeypatch, dev_tools_enabled=True, file_storage_path=tmp_path)

    update = auth_client.put(
        "/agent/settings",
        json={
            "agentBackend": "openclaw",
            "provider": "openrouter",
            "model": "google/gemini-3-flash-preview",
        },
    )
    assert update.status_code == 200

    me = auth_client.get("/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]

    workspace_dir = tmp_path / "openclaw" / user_id / "workspace"
    runtime_dir = tmp_path / "openclaw-runtime" / user_id
    workspace_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (workspace_dir / "SOUL.md").write_text("Initialized soul")
    (runtime_dir / "token").write_text("token")

    refresh = auth_client.post("/agent/container/hard-refresh")
    assert refresh.status_code == 200
    assert refresh.json()["ok"] is True

    # Agent config must survive workspace/runtime cleanup.
    response = auth_client.get("/agent/settings")
    assert response.status_code == 200
    payload = response.json()
    assert payload["agentBackend"] == "openclaw"
    assert payload["provider"] == "openrouter"
    assert payload["model"] == "google/gemini-3-flash-preview"

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT agent_backend, provider, model
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    assert row is not None
    assert row["agent_backend"] == "openclaw"
    assert row["provider"] == "openrouter"
    assert row["model"] == "google/gemini-3-flash-preview"
