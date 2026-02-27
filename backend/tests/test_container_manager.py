"""Unit tests for OpenClaw container start configuration."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import pytest

from app.config import settings
from app.container.manager import (
    _build_container_name,
    _is_container_ready,
    get_identity_name,
    hard_refresh_container,
    reap_orphaned_k8s_resources,
    start_container,
    stop_container,
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
def test_start_container_uses_k8s_runtime_when_enabled(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
    )
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
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

    k8s_calls: list[dict[str, object]] = []

    def _fake_k8s_apply_resources(**kwargs):
        k8s_calls.append(kwargs)

    monkeypatch.setattr("app.container.manager._k8s_apply_resources", _fake_k8s_apply_resources)

    def _fail_run_cmd(*_args, **_kwargs):
        raise AssertionError("run_cmd must not be called in k8s runtime mode")

    monkeypatch.setattr("app.container.manager.run_cmd", _fail_run_cmd)

    info = start_container(user_id)

    assert info.name == f"openclaw-{user_id}"
    assert info.port == 18789
    assert info.url == f"http://openclaw-{user_id}.project.svc.cluster.local:18789"
    assert captured["model"] == "openrouter/google/gemini-3-flash-preview"

    assert len(k8s_calls) == 1
    assert k8s_calls[0]["container_name"] == info.name
    assert k8s_calls[0]["port"] == 18789


@pytest.mark.unit
def test_stop_container_uses_k8s_cleanup_when_runtime_is_k8s(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "container_name": f"openclaw-{user_id}",
    }

    _patch_settings(monkeypatch, openclaw_runtime="k8s")
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))

    deleted: list[tuple[str, str]] = []

    def _fake_delete(kind: str, name: str) -> None:
        deleted.append((kind, name))

    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", _fake_delete)
    monkeypatch.setattr("app.container.manager.run_cmd", lambda *_args, **_kwargs: None)

    stop_container(user_id)

    assert deleted == [
        ("pod", f"openclaw-{user_id}"),
        ("service", f"openclaw-{user_id}"),
    ]


@pytest.mark.unit
def test_start_container_rejects_when_k8s_capacity_is_reached(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
        "active": 1,
    }

    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_max_concurrent_pods=1,
    )
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._decrypt_api_key", lambda _enc: "decrypted-key")
    monkeypatch.setattr("app.container.manager._wait_for_healthy", lambda _user, _url: None)
    monkeypatch.setattr(
        "app.container.manager.provision_workspace",
        lambda **_kwargs: (_kwargs["storage_base"], _kwargs["storage_base"]),
    )

    with pytest.raises(RuntimeError, match="tenant capacity reached"):
        start_container(user_id)


@pytest.mark.unit
def test_reap_orphaned_k8s_resources_deletes_untracked_objects(monkeypatch):
    _patch_settings(monkeypatch, openclaw_runtime="k8s")

    class _RowsCursor:
        def __init__(self):
            self._rows = [{"container_name": "openclaw-user-a"}]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, _query, _params=None):
            return None

        def fetchall(self):
            return self._rows

    class _RowsConn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return _RowsCursor()

    deleted: list[tuple[str, str]] = []
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _RowsConn())
    monkeypatch.setattr(
        "app.container.manager._k8s_list_resource_names",
        lambda kind: (
            {"openclaw-user-a", "openclaw-user-b"}
            if kind == "pod"
            else {"openclaw-user-a", "openclaw-user-c"}
        ),
    )
    monkeypatch.setattr(
        "app.container.manager._k8s_delete_if_exists",
        lambda kind, name: deleted.append((kind, name)),
    )

    result = reap_orphaned_k8s_resources()

    assert result == {"pods": 1, "services": 1}
    assert ("pod", "openclaw-user-b") in deleted
    assert ("service", "openclaw-user-c") in deleted


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


@pytest.mark.unit
def test_is_container_ready_accepts_health_endpoint(monkeypatch):
    class _Resp:
        def __init__(self, status_code: int):
            self.status_code = status_code

    def _fake_get(url: str, timeout: float = 2.0):  # noqa: ARG001
        if url.endswith("/health"):
            return _Resp(200)
        raise AssertionError("Unexpected URL")

    monkeypatch.setattr("app.container.manager.httpx.get", _fake_get)
    assert _is_container_ready("http://localhost:18800") is True


@pytest.mark.unit
def test_is_container_ready_accepts_chat_endpoint_when_health_missing(monkeypatch):
    class _Resp:
        def __init__(self, status_code: int):
            self.status_code = status_code

    def _fake_get(url: str, timeout: float = 2.0):  # noqa: ARG001
        if url.endswith("/health"):
            return _Resp(404)
        if url.endswith("/v1/chat/completions"):
            return _Resp(405)
        raise AssertionError("Unexpected URL")

    monkeypatch.setattr("app.container.manager.httpx.get", _fake_get)
    assert _is_container_ready("http://localhost:18800") is True
