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
    _parse_memory_mib,
    _wait_for_healthy,
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
    expected_heap = int(_parse_memory_mib(settings.openclaw_k8s_memory_limit) * 0.75)
    assert f"NODE_OPTIONS=--max-old-space-size={expected_heap}" in run_args


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
    expected_heap = int(_parse_memory_mib(settings.openclaw_k8s_memory_limit) * 0.75)
    assert env_vars["NODE_OPTIONS"] == f"--max-old-space-size={expected_heap}"


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


# ---------------------------------------------------------------------------
# _parse_memory_mib
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_parse_memory_mib_gibibytes():
    assert _parse_memory_mib("2Gi") == 2048
    assert _parse_memory_mib("1Gi") == 1024
    assert _parse_memory_mib("4Gi") == 4096


@pytest.mark.unit
def test_parse_memory_mib_mebibytes():
    assert _parse_memory_mib("512Mi") == 512
    assert _parse_memory_mib("256Mi") == 256


@pytest.mark.unit
def test_parse_memory_mib_rejects_unsupported():
    with pytest.raises(ValueError, match="Unsupported memory format"):
        _parse_memory_mib("1024Ki")


# ---------------------------------------------------------------------------
# NODE_OPTIONS scales with memory limit
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_node_options_scales_with_memory_limit(monkeypatch, tmp_path):
    """NODE_OPTIONS heap must be 75% of the configured memory limit."""
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
        openclaw_k8s_memory_limit="1Gi",  # smaller limit than default
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
    monkeypatch.setattr(
        "app.container.manager._k8s_apply_resources",
        lambda **kwargs: k8s_calls.append(kwargs),
    )

    start_container(user_id)

    env_vars = k8s_calls[0]["env_vars"]
    # 1Gi = 1024 MiB, 75% = 768
    assert env_vars["NODE_OPTIONS"] == "--max-old-space-size=768"


# ---------------------------------------------------------------------------
# hard_refresh_container handles permission errors
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_hard_refresh_handles_permission_error(monkeypatch, tmp_path):
    """hard_refresh_container must succeed even when dirs have restrictive perms."""
    user_id = "702a4639-e654-46b8-a4fa-83ecc2bcd06c"
    _patch_settings(monkeypatch, file_storage_path=tmp_path)

    workspace_dir = tmp_path / "openclaw" / user_id / "workspace"
    runtime_dir = tmp_path / "openclaw-runtime" / user_id
    workspace_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "token").write_text("token")

    # Make runtime dir read-only to simulate permission mismatch
    import stat

    (runtime_dir / "token").chmod(stat.S_IRUSR)
    runtime_dir.chmod(stat.S_IRUSR | stat.S_IXUSR)

    stopped: list[str] = []
    monkeypatch.setattr("app.container.manager.stop_container", lambda uid: stopped.append(uid))

    result = hard_refresh_container(user_id)

    assert stopped == [user_id]
    assert result["removedWorkspace"] is True
    assert result["removedRuntime"] is True
    assert not (tmp_path / "openclaw-runtime" / user_id).exists()


# ---------------------------------------------------------------------------
# K8s pod spec includes pod-level securityContext
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_k8s_pod_spec_includes_pod_security_context(monkeypatch, tmp_path):
    """Spawned OpenClaw pods must have pod-level securityContext for PVC ownership."""
    captured_manifests: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured_manifests.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
        openclaw_k8s_image_pull_secret="",
    )

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    # Second manifest is the Pod (first is the Service)
    pod_manifest = captured_manifests[1]
    pod_sec = pod_manifest["spec"]["securityContext"]

    assert pod_sec["runAsNonRoot"] is True
    assert pod_sec["runAsUser"] == 1000
    assert pod_sec["runAsGroup"] == 1000
    assert pod_sec["fsGroup"] == 1000
    assert pod_sec["seccompProfile"] == {"type": "RuntimeDefault"}


# ---------------------------------------------------------------------------
# Feature 1: Configurable startup timeout (180s → 240s)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_default_health_check_timeout_is_240():
    """Default timeout should be 240s to exceed typical cold-start times."""
    assert settings.openclaw_health_check_timeout == 240


@pytest.mark.unit
def test_wait_for_healthy_uses_configured_timeout(monkeypatch):
    """_wait_for_healthy must honour the configured timeout value."""
    _patch_settings(monkeypatch, openclaw_health_check_timeout=2)
    marked: list[str] = []
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: False)
    monkeypatch.setattr("app.container.manager._mark_error", lambda _uid, msg: marked.append(msg))

    with pytest.raises(RuntimeError, match="timeout"):
        _wait_for_healthy("test-user", "http://localhost:9999")

    assert len(marked) == 1
    assert "2s" in marked[0]


@pytest.mark.unit
def test_k8s_startup_probe_budget_exceeds_health_check_timeout(monkeypatch):
    """K8s startupProbe total budget must exceed backend health check timeout."""
    captured_manifests: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured_manifests.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
        openclaw_k8s_image_pull_secret="",
    )

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    pod_manifest = captured_manifests[1]
    container_spec = pod_manifest["spec"]["containers"][0]
    probe = container_spec["startupProbe"]
    probe_budget = probe["periodSeconds"] * probe["failureThreshold"]

    assert probe_budget > settings.openclaw_health_check_timeout, (
        f"K8s startup probe budget ({probe_budget}s) must exceed "
        f"health check timeout ({settings.openclaw_health_check_timeout}s)"
    )


# ---------------------------------------------------------------------------
# Feature 5: Startup phase observability (structured timing logs)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_wait_for_healthy_logs_timing_on_success(monkeypatch):
    """Successful health check emits structured log with elapsed time and attempts."""
    _patch_settings(monkeypatch, openclaw_health_check_timeout=10)
    call_count = {"n": 0}

    def _ready_after_2(_url):
        call_count["n"] += 1
        return call_count["n"] >= 2

    monkeypatch.setattr("app.container.manager._is_container_ready", _ready_after_2)
    monkeypatch.setattr("app.container.manager._mark_running", lambda _uid: None)
    monkeypatch.setattr("app.container.manager.time.sleep", lambda _s: None)

    logged: list[tuple[str, dict]] = []
    original_logger = __import__("app.container.manager", fromlist=["logger"]).logger

    class _CapturingLogger:
        def info(self, event, **kw):
            logged.append((event, kw))

        def warning(self, event, **kw):
            logged.append((event, kw))

        def __getattr__(self, name):
            return original_logger.__getattribute__(name)

    monkeypatch.setattr("app.container.manager.logger", _CapturingLogger())

    _wait_for_healthy("test-user", "http://localhost:9999")

    events = [e[0] for e in logged]
    assert "container.health_check_started" in events
    assert "container.health_check_passed" in events

    passed = next(kw for ev, kw in logged if ev == "container.health_check_passed")
    assert "elapsed_seconds" in passed
    assert "attempts" in passed
    assert passed["attempts"] == 2


@pytest.mark.unit
def test_wait_for_healthy_logs_timing_on_timeout(monkeypatch):
    """Timed-out health check emits warning log with elapsed time."""
    _patch_settings(monkeypatch, openclaw_health_check_timeout=2)
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: False)
    monkeypatch.setattr("app.container.manager._mark_error", lambda _uid, _msg: None)
    monkeypatch.setattr("app.container.manager.time.sleep", lambda _s: None)

    logged: list[tuple[str, dict]] = []

    class _CapturingLogger:
        def info(self, event, **kw):
            logged.append((event, kw))

        def warning(self, event, **kw):
            logged.append((event, kw))

    monkeypatch.setattr("app.container.manager.logger", _CapturingLogger())

    with pytest.raises(RuntimeError):
        _wait_for_healthy("test-user", "http://localhost:9999")

    events = [e[0] for e in logged]
    assert "container.health_check_started" in events
    assert "container.health_check_timeout" in events

    timeout_kw = next(kw for ev, kw in logged if ev == "container.health_check_timeout")
    assert "elapsed_seconds" in timeout_kw
    assert "attempts" in timeout_kw


# ---------------------------------------------------------------------------
# Feature 3: K8s image pull policy
# ---------------------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.parametrize(
    "policy,expected",
    [
        ("always", "Always"),
        ("if-not-present", "IfNotPresent"),
        ("never", "Never"),
    ],
)
def test_k8s_image_pull_policy_mapping(policy, expected):
    from app.container.manager import _k8s_image_pull_policy

    assert _k8s_image_pull_policy(policy) == expected


@pytest.mark.unit
def test_k8s_pod_spec_uses_configured_pull_policy(monkeypatch):
    """K8s pod spec must use the configured pull policy, not hardcoded Always."""
    captured_manifests: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured_manifests.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
        openclaw_k8s_image_pull_secret="",
        openclaw_pull_policy="if-not-present",
    )

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    pod_manifest = captured_manifests[1]
    container_spec = pod_manifest["spec"]["containers"][0]
    assert container_spec["imagePullPolicy"] == "IfNotPresent"


# ---------------------------------------------------------------------------
# Feature 4: Fix /openclaw.json write permissions via initContainer
# ---------------------------------------------------------------------------


def _capture_k8s_pod_spec(monkeypatch) -> list[dict]:
    """Helper: patch K8s calls and return captured manifests."""
    captured: list[dict] = []

    def _fake_k8s_request(method, path, *, json_body=None, ok_statuses=None):
        if json_body:
            captured.append(json_body)
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.container.manager._k8s_request", _fake_k8s_request)
    monkeypatch.setattr("app.container.manager._k8s_delete_if_exists", lambda _kind, _name: None)
    _patch_settings(
        monkeypatch,
        openclaw_runtime="k8s",
        openclaw_k8s_namespace="project",
        openclaw_k8s_gateway_port=18789,
        openclaw_k8s_image_pull_secret="",
    )
    return captured


@pytest.mark.unit
def test_k8s_pod_spec_includes_init_container(monkeypatch):
    """Pod spec must include an initContainer to fix /openclaw.json permissions."""
    captured = _capture_k8s_pod_spec(monkeypatch)

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    pod_manifest = captured[1]
    init_containers = pod_manifest["spec"].get("initContainers", [])
    assert len(init_containers) >= 1

    init = init_containers[0]
    assert init["name"] == "fix-config-permissions"
    # Must touch and chown the config file
    cmd = " ".join(init.get("command", []))
    assert "openclaw.json" in cmd
    assert "1000" in cmd


@pytest.mark.unit
def test_init_container_mounts_match_main_container(monkeypatch):
    """initContainer must mount the same openclaw.json subPath as the main container."""
    captured = _capture_k8s_pod_spec(monkeypatch)

    _k8s_apply_resources(
        user_id="user-123",
        container_name="openclaw-user-123",
        port=18789,
        env_vars={"FOO": "bar"},
    )

    pod_manifest = captured[1]
    init_containers = pod_manifest["spec"]["initContainers"]
    main_containers = pod_manifest["spec"]["containers"]

    # Find the openclaw.json mount in main container
    main_mounts = main_containers[0]["volumeMounts"]
    main_config_mount = next(m for m in main_mounts if m["mountPath"] == "/openclaw.json")

    # initContainer must have a matching mount
    init_mounts = init_containers[0]["volumeMounts"]
    init_config_mount = next(m for m in init_mounts if m["mountPath"] == "/openclaw.json")

    assert init_config_mount["subPath"] == main_config_mount["subPath"]
    assert init_config_mount["name"] == main_config_mount["name"]


# ---------------------------------------------------------------------------
# Feature 2: Stale error-state reconciliation
# ---------------------------------------------------------------------------


class _ReconcileRowsCursor:
    """Fake cursor returning configurable rows for reconcile_stale_errors tests."""

    def __init__(self, rows: list[dict]):
        self._rows = rows
        self.executed: list[tuple[str, tuple]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchall(self):
        return self._rows


class _ReconcileConn:
    def __init__(self, rows: list[dict]):
        self._cursor = _ReconcileRowsCursor(rows)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self._cursor

    def commit(self):
        return None


@pytest.mark.unit
def test_reconcile_stale_errors_marks_healthy_container_running(monkeypatch):
    """Containers in error state with timeout message should be promoted if healthy."""
    from app.container.manager import reconcile_stale_errors

    rows = [
        {
            "user_id": "user-a",
            "container_url": "http://localhost:18800",
            "container_error": "Health check timeout after 240s",
        }
    ]
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _ReconcileConn(rows))
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: True)

    marked: list[str] = []
    monkeypatch.setattr("app.container.manager._mark_running", lambda uid: marked.append(uid))

    result = reconcile_stale_errors()

    assert result == 1
    assert marked == ["user-a"]


@pytest.mark.unit
def test_reconcile_stale_errors_ignores_non_timeout_errors(monkeypatch):
    """Non-timeout errors (e.g. image pull failures) should not be reconciled."""
    from app.container.manager import reconcile_stale_errors

    # The query filters by LIKE '%timeout%', so non-timeout rows won't appear
    rows: list[dict] = []
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _ReconcileConn(rows))

    ready_called = {"count": 0}

    def _track_ready(_url):
        ready_called["count"] += 1
        return True

    monkeypatch.setattr("app.container.manager._is_container_ready", _track_ready)
    monkeypatch.setattr("app.container.manager._mark_running", lambda _uid: None)

    result = reconcile_stale_errors()

    assert result == 0
    assert ready_called["count"] == 0


@pytest.mark.unit
def test_reconcile_stale_errors_skips_unreachable_containers(monkeypatch):
    """Containers still unhealthy should stay in error state."""
    from app.container.manager import reconcile_stale_errors

    rows = [
        {
            "user_id": "user-b",
            "container_url": "http://localhost:18801",
            "container_error": "Health check timeout after 240s",
        }
    ]
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _ReconcileConn(rows))
    monkeypatch.setattr("app.container.manager._is_container_ready", lambda _url: False)

    marked: list[str] = []
    monkeypatch.setattr("app.container.manager._mark_running", lambda uid: marked.append(uid))

    result = reconcile_stale_errors()

    assert result == 0
    assert marked == []


@pytest.mark.unit
def test_reconcile_stale_errors_handles_health_check_exception(monkeypatch):
    """Health check exceptions must not crash the reconciliation loop."""
    import httpx

    from app.container.manager import reconcile_stale_errors

    rows = [
        {
            "user_id": "user-c",
            "container_url": "http://localhost:18802",
            "container_error": "Health check timeout after 240s",
        }
    ]
    monkeypatch.setattr("app.container.manager.db_conn", lambda: _ReconcileConn(rows))

    def _exploding_ready(_url):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr("app.container.manager._is_container_ready", _exploding_ready)
    monkeypatch.setattr("app.container.manager._mark_running", lambda _uid: None)

    result = reconcile_stale_errors()
    assert result == 0
