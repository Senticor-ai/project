"""Unit tests for OpenClaw container start configuration."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import pytest

from app.config import settings
from app.container.manager import (
    _build_container_name,
    _build_volume_args,
    _is_container_ready,
    _k8s_apply_resources,
    _k8s_labels,
    ensure_running,
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

    _patch_settings(monkeypatch, openclaw_project_mount_path="", openclaw_pull_policy="always")
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

    _patch_settings(monkeypatch, openclaw_project_mount_path="", openclaw_pull_policy="always")
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
def test_start_container_fails_fast_when_template_assets_are_missing(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(monkeypatch, openclaw_project_mount_path="", openclaw_pull_policy="never")
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._allocate_port", lambda _cur: 18800)
    monkeypatch.setattr("app.container.manager._decrypt_api_key", lambda _enc: "decrypted-key")
    monkeypatch.setattr(
        "app.container.manager.provision_workspace",
        lambda **_kwargs: (_ for _ in ()).throw(
            FileNotFoundError(2, "No such file or directory", "/app/openclaw")
        ),
    )

    marked: dict[str, str] = {}

    def _fake_mark_error(target_user_id: str, message: str) -> None:
        marked["user_id"] = target_user_id
        marked["message"] = message

    monkeypatch.setattr("app.container.manager._mark_error", _fake_mark_error)
    monkeypatch.setattr(
        "app.container.manager.run_cmd",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("run_cmd must not execute when template assets are missing")
        ),
    )

    with pytest.raises(RuntimeError, match="template files are missing"):
        start_container(user_id)

    assert marked["user_id"] == user_id
    assert "/app/openclaw" in marked["message"]


@pytest.mark.unit
def test_start_container_skips_pull_when_image_exists_locally(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(
        monkeypatch,
        openclaw_project_mount_path="",
        openclaw_pull_policy="if-not-present",
    )
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

    run_calls: list[list[str]] = []

    def _fake_run_cmd(args, timeout=30):
        run_calls.append(args)
        if args[:2] == ["image", "inspect"]:
            return SimpleNamespace(returncode=0, stderr="", stdout="exists")
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr("app.container.manager.run_cmd", _fake_run_cmd)

    start_container(user_id)

    assert any(call[:2] == ["image", "inspect"] for call in run_calls)
    assert not any(call and call[0] == "pull" for call in run_calls)


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
def test_start_container_does_not_persist_shared_k8s_gateway_port(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    class _RecordingCursor:
        def __init__(self, row):
            self._row = row
            self._last_query = ""
            self.update_params = None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params=None):
            self._last_query = query
            if "UPDATE user_agent_settings SET" in query:
                self.update_params = params

        def fetchone(self):
            if "COUNT(*)::int AS active" in self._last_query:
                return {"active": 0}
            return self._row

    class _RecordingConn:
        def __init__(self, row):
            self.cursor_obj = _RecordingCursor(row)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            return None

    conn = _RecordingConn(row)
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
    )
    monkeypatch.setattr("app.container.manager.db_conn", lambda: conn)
    monkeypatch.setattr("app.container.manager._decrypt_api_key", lambda _enc: "decrypted-key")
    monkeypatch.setattr("app.container.manager._wait_for_healthy", lambda _user, _url: None)
    monkeypatch.setattr(
        "app.container.manager.provision_workspace",
        lambda **_kwargs: (
            (tmp_path / "openclaw" / user_id),
            (tmp_path / "openclaw-runtime" / user_id),
        ),
    )
    monkeypatch.setattr("app.container.manager._k8s_apply_resources", lambda **_kwargs: None)
    monkeypatch.setattr(
        "app.container.manager.run_cmd",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("run_cmd must not be called in k8s runtime mode")
        ),
    )

    start_container(user_id)

    assert conn.cursor_obj.update_params is not None
    # (container_name, container_url, container_port, user_id)
    assert conn.cursor_obj.update_params[2] is None


@pytest.mark.unit
def test_start_container_reconciles_workspace_memory_before_run(monkeypatch, tmp_path):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(monkeypatch, openclaw_project_mount_path="", openclaw_pull_policy="never")
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

    reconcile_calls: list[str] = []

    def _fake_reconcile(*, user_id: str):
        reconcile_calls.append(user_id)
        return {"restored": 1, "seeded": 0}

    monkeypatch.setattr("app.container.manager.reconcile_workspace_memory", _fake_reconcile)

    def _fake_run_cmd(args, timeout=30):  # noqa: ARG001
        if args and args[0] == "run":
            assert reconcile_calls == [user_id]
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr("app.container.manager.run_cmd", _fake_run_cmd)

    start_container(user_id)

    assert reconcile_calls == [user_id]


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
def test_ensure_running_promotes_starting_container_when_ready(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "container_url": "http://localhost:18800",
        "container_status": "starting",
        "container_name": f"openclaw-{user_id}",
        "container_error": None,
    }

    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: True)
    monkeypatch.setattr("app.container.manager._read_gateway_token", lambda _uid: "gateway-token")
    monkeypatch.setattr(
        "app.container.manager.start_container",
        lambda _uid: (_ for _ in ()).throw(AssertionError("start_container must not be called")),
    )

    marked_running: list[str] = []
    touched: list[str] = []
    monkeypatch.setattr(
        "app.container.manager._mark_running", lambda uid: marked_running.append(uid)
    )
    monkeypatch.setattr("app.container.manager.touch_activity", lambda uid: touched.append(uid))

    url, token = ensure_running(user_id)

    assert url == "http://localhost:18800"
    assert token == "gateway-token"
    assert marked_running == [user_id]
    assert touched == [user_id]


@pytest.mark.unit
def test_ensure_running_reports_starting_state_without_forced_restart(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "container_url": "http://localhost:18800",
        "container_status": "starting",
        "container_name": f"openclaw-{user_id}",
        "container_error": None,
    }

    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: False)

    stop_calls: list[str] = []
    start_calls: list[str] = []
    monkeypatch.setattr("app.container.manager.stop_container", lambda uid: stop_calls.append(uid))
    monkeypatch.setattr(
        "app.container.manager.start_container",
        lambda uid: start_calls.append(uid),
    )

    with pytest.raises(RuntimeError, match="still starting"):
        ensure_running(user_id)

    assert stop_calls == []
    assert start_calls == []


@pytest.mark.unit
def test_ensure_running_recovers_stale_k8s_starting_row_when_resources_are_missing(monkeypatch):
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "container_url": "http://openclaw-user.project.svc.cluster.local:18789",
        "container_status": "starting",
        "container_name": "openclaw-user",
        "container_error": None,
    }

    _patch_settings(monkeypatch, openclaw_runtime="k8s")
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _FakeConn(row))
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: False)
    monkeypatch.setattr(
        "app.container.manager._k8s_runtime_resources_exist",
        lambda _name: False,
    )

    stop_calls: list[str] = []
    monkeypatch.setattr("app.container.manager.stop_container", lambda uid: stop_calls.append(uid))
    monkeypatch.setattr(
        "app.container.manager.start_container",
        lambda _uid: SimpleNamespace(url="http://fresh-runtime", token="fresh-token"),
    )

    url, token = ensure_running(user_id)

    assert url == "http://fresh-runtime"
    assert token == "fresh-token"
    assert stop_calls == [user_id]


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


@pytest.mark.unit
def test_k8s_labels_include_part_of_project():
    """OpenClaw pods must carry app.kubernetes.io/part-of=project so Alloy discovers them."""
    labels = _k8s_labels("user-123", "openclaw-user-123")
    assert labels.get("app.kubernetes.io/part-of") == "project"


# ---------------------------------------------------------------------------
# OpenClaw K8s stability fixes (OOM, timeout, config EACCES)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_start_container_injects_node_options_in_docker_env(monkeypatch, tmp_path):
    """Docker run command must pass NODE_OPTIONS to cap V8 heap."""
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    row = {
        "provider": "openrouter",
        "api_key_encrypted": "encrypted-key",
        "model": "google/gemini-3-flash-preview",
    }

    _patch_settings(monkeypatch, openclaw_project_mount_path="", openclaw_pull_policy="never")
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

    run_calls: list[list[str]] = []

    def _fake_run_cmd(args, timeout=30):
        run_calls.append(args)
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr("app.container.manager.run_cmd", _fake_run_cmd)

    start_container(user_id)

    run_args = run_calls[-1]  # last call is the `run` command
    assert "NODE_OPTIONS=--max-old-space-size=1536" in run_args


@pytest.mark.unit
def test_start_container_passes_node_options_to_k8s(monkeypatch, tmp_path):
    """K8s env_vars must include NODE_OPTIONS to cap V8 heap."""
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
    monkeypatch.setattr(
        "app.container.manager.provision_workspace",
        lambda **_kwargs: (
            (tmp_path / "openclaw" / user_id),
            (tmp_path / "openclaw-runtime" / user_id),
        ),
    )

    k8s_calls: list[dict[str, object]] = []

    def _fake_k8s_apply_resources(**kwargs):
        k8s_calls.append(kwargs)

    monkeypatch.setattr("app.container.manager._k8s_apply_resources", _fake_k8s_apply_resources)
    monkeypatch.setattr(
        "app.container.manager.run_cmd",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("run_cmd must not be called in k8s runtime mode")
        ),
    )

    start_container(user_id)

    assert len(k8s_calls) == 1
    env_vars = k8s_calls[0]["env_vars"]
    assert env_vars["NODE_OPTIONS"] == "--max-old-space-size=1536"


@pytest.mark.unit
def test_k8s_pod_spec_includes_startup_probe(monkeypatch):
    """K8s pod spec must include a startupProbe for slow cold starts."""
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_image="test-image:latest",
        openclaw_k8s_image_pull_secret="",
    )

    captured_manifests: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured_manifests.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    # Pod manifest is the second POST (after Service)
    pod_manifest = captured_manifests[1]
    container_spec = pod_manifest["spec"]["containers"][0]
    assert "startupProbe" in container_spec
    probe = container_spec["startupProbe"]
    assert "tcpSocket" in probe
    assert probe["tcpSocket"]["port"] == 18789


@pytest.mark.unit
def test_config_volume_mount_is_writable_docker(tmp_path):
    """Docker volume args must NOT mount openclaw.json as read-only."""
    workspace_dir = tmp_path / "openclaw" / "user-123"
    runtime_dir = tmp_path / "openclaw-runtime" / "user-123"
    workspace_dir.mkdir(parents=True)
    runtime_dir.mkdir(parents=True)

    args = _build_volume_args(workspace_dir, runtime_dir)
    config_mount = [a for a in args if "openclaw.json" in a]
    assert len(config_mount) == 1
    assert ":ro" not in config_mount[0]


@pytest.mark.unit
def test_config_volume_mount_is_writable_k8s(monkeypatch):
    """K8s volumeMount for openclaw.json must NOT be readOnly."""
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_image="test-image:latest",
        openclaw_k8s_image_pull_secret="",
    )

    captured_manifests: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured_manifests.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    pod_manifest = captured_manifests[1]
    volume_mounts = pod_manifest["spec"]["containers"][0]["volumeMounts"]
    config_mount = [vm for vm in volume_mounts if vm["mountPath"] == "/openclaw.json"]
    assert len(config_mount) == 1
    assert config_mount[0].get("readOnly") is not True
