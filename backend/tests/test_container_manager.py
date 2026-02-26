"""Unit tests for OpenClaw container start configuration."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import pytest

from app.config import settings
from app.container.manager import (
    _build_container_name,
    get_identity_name,
    hard_refresh_container,
    start_container,
)


def _patch_settings(monkeypatch, **overrides):
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.container.manager.settings", patched)
    return patched


class _FakeCursor:
    def __init__(self, row: dict[str, object]):
        self._row = row

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, _query, _params=None):
        return None

    def fetchone(self):
        return self._row


class _FakeConn:
    def __init__(self, row: dict[str, object]):
        self._cursor = _FakeCursor(row)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self._cursor

    def commit(self):
        return None


@pytest.mark.unit
def test_build_container_name_uses_full_user_id():
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    assert _build_container_name(user_id) == f"openclaw-{user_id}"


@pytest.mark.unit
def test_start_container_injects_user_model_and_compose_labels(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3.1-pro-preview-customtools",
    }

    _patch_settings(monkeypatch, openclaw_project_mount_path="")
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._allocate_port", lambda _cur: 18800)
    monkeypatch.setattr("app.container.manager._decrypt_api_key", lambda _enc: "decrypted-key")
    monkeypatch.setattr("app.container.manager._wait_for_healthy", lambda _user, _url: None)

    captured: dict[str, object] = {}

    def _fake_provision_workspace(*, user_id, storage_base, port, model, token):
        captured["user_id"] = user_id
        captured["storage_base"] = storage_base
        captured["port"] = port
        captured["model"] = model
        captured["token"] = token
        workspace_dir = tmp_path / "openclaw" / user_id
        runtime_dir = tmp_path / "openclaw-runtime" / user_id
        workspace_dir.mkdir(parents=True, exist_ok=True)
        runtime_dir.mkdir(parents=True, exist_ok=True)
        return workspace_dir, runtime_dir

    monkeypatch.setattr("app.container.manager.provision_workspace", _fake_provision_workspace)

    run_calls: list[list[str]] = []

    def _fake_run_cmd(args, timeout=30):
        run_calls.append(args)
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr("app.container.manager.run_cmd", _fake_run_cmd)

    info = start_container(user_id)

    assert info.name == f"openclaw-{user_id}"
    assert captured["model"] == "openrouter/google/gemini-3.1-pro-preview-customtools"

    assert len(run_calls) == 3
    assert run_calls[0] == ["pull", settings.openclaw_image]
    run_args = run_calls[2]

    assert "--name" in run_args
    assert run_args[run_args.index("--name") + 1] == info.name

    assert f"copilot.user_id={user_id}" in run_args
    assert "copilot.managed=true" in run_args
    assert "com.docker.compose.project=project" in run_args
    assert "com.docker.compose.service=openclaw" in run_args


@pytest.mark.unit
def test_start_container_fails_when_image_pull_fails(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(monkeypatch, openclaw_project_mount_path="")
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._allocate_port", lambda _cur: 18800)
    monkeypatch.setattr("app.container.manager._decrypt_api_key", lambda _enc: "decrypted-key")
    monkeypatch.setattr("app.container.manager._wait_for_healthy", lambda _user, _url: None)
    monkeypatch.setattr(
        "app.container.manager.provision_workspace",
        lambda **_kwargs: (
            (tmp_path / "openclaw" / user_id),
            (tmp_path / "openclaw-runtime" / user_id),
        ),
    )

    marked: dict[str, str] = {}

    def _fake_mark_error(target_user_id: str, message: str) -> None:
        marked["user_id"] = target_user_id
        marked["message"] = message

    def _fake_run_cmd(args, timeout=30):
        if args and args[0] == "pull":
            return SimpleNamespace(returncode=1, stderr="network down", stdout="")
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr("app.container.manager._mark_error", _fake_mark_error)
    monkeypatch.setattr("app.container.manager.run_cmd", _fake_run_cmd)

    with pytest.raises(RuntimeError, match="Image pull failed"):
        start_container(user_id)

    assert marked["user_id"] == user_id
    assert "Image pull failed" in marked["message"]


@pytest.mark.unit
def test_get_identity_name_reads_markdown_name(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    _patch_settings(monkeypatch, file_storage_path=tmp_path)

    identity_path = tmp_path / "openclaw" / user_id / "workspace" / "IDENTITY.md"
    identity_path.parent.mkdir(parents=True, exist_ok=True)
    identity_path.write_text("- Name: Aurora\n- Vibe: calm\n")

    assert get_identity_name(user_id) == "Aurora"


@pytest.mark.unit
def test_get_identity_name_ignores_empty_placeholder(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    _patch_settings(monkeypatch, file_storage_path=tmp_path)

    identity_path = tmp_path / "openclaw" / user_id / "workspace" / "IDENTITY.md"
    identity_path.parent.mkdir(parents=True, exist_ok=True)
    identity_path.write_text("- Name:\n- Vibe:\n")

    assert get_identity_name(user_id) is None


@pytest.mark.unit
def test_hard_refresh_container_stops_and_deletes_state(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    _patch_settings(monkeypatch, file_storage_path=tmp_path)

    workspace_dir = tmp_path / "openclaw" / user_id / "workspace"
    runtime_dir = tmp_path / "openclaw-runtime" / user_id
    workspace_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (workspace_dir / "AGENTS.md").write_text("test")
    (runtime_dir / "token").write_text("token")

    stopped: list[str] = []
    monkeypatch.setattr("app.container.manager.stop_container", lambda uid: stopped.append(uid))

    result = hard_refresh_container(user_id)

    assert stopped == [user_id]
    assert result == {"removedWorkspace": True, "removedRuntime": True}
    assert not (tmp_path / "openclaw" / user_id).exists()
    assert not (tmp_path / "openclaw-runtime" / user_id).exists()


@pytest.mark.unit
def test_hard_refresh_container_reports_missing_state(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    _patch_settings(monkeypatch, file_storage_path=tmp_path)
    monkeypatch.setattr("app.container.manager.stop_container", lambda _uid: None)

    result = hard_refresh_container(user_id)

    assert result == {"removedWorkspace": False, "removedRuntime": False}
