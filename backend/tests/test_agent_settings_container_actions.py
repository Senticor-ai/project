"""Tests for agent container control endpoints."""

from __future__ import annotations

import dataclasses

from app.config import settings


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
