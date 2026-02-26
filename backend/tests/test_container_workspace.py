"""Unit tests for OpenClaw workspace provisioning and template sync."""

from __future__ import annotations

import json

import pytest

from app.container import workspace as workspace_mod


def _write_template(tmp_path):
    template_dir = tmp_path / "openclaw-template"
    workspace_template_dir = template_dir / "workspace"
    workspace_template_dir.mkdir(parents=True)

    template_config = {
        "gateway": {"port": 18789, "auth": {"token": "template-token"}},
        "agents": {"defaults": {"model": {"primary": "openrouter/google/gemini-2.5-flash"}}},
    }
    (template_dir / "openclaw.json").write_text(json.dumps(template_config))
    (workspace_template_dir / "BOOTSTRAP.md").write_text("template bootstrap")
    (workspace_template_dir / "IDENTITY.md").write_text("template identity")
    return template_dir, workspace_template_dir


def _patch_template_dirs(monkeypatch, template_dir, workspace_template_dir):
    monkeypatch.setattr(workspace_mod, "TEMPLATE_DIR", template_dir)
    monkeypatch.setattr(workspace_mod, "WORKSPACE_TEMPLATE_DIR", workspace_template_dir)


@pytest.mark.unit
def test_provision_workspace_populates_bootstrap_for_new_workspace(monkeypatch, tmp_path):
    template_dir, workspace_template_dir = _write_template(tmp_path)
    _patch_template_dirs(monkeypatch, template_dir, workspace_template_dir)

    storage_base = tmp_path / "storage"
    workspace_dir, runtime_dir = workspace_mod.provision_workspace(
        user_id="user-1",
        storage_base=storage_base,
        port=18800,
        model="openrouter/google/gemini-3-flash-preview",
        token="gateway-token",
    )

    assert runtime_dir.exists()
    assert (workspace_dir / "workspace" / "BOOTSTRAP.md").read_text() == "template bootstrap"
    assert (workspace_dir / "workspace" / "IDENTITY.md").read_text() == "template identity"

    config = json.loads((workspace_dir / "openclaw.json").read_text())
    assert config["gateway"]["port"] == 18800
    assert config["gateway"]["auth"]["token"] == "gateway-token"
    assert config["agents"]["defaults"]["model"]["primary"] == "openrouter/google/gemini-3-flash-preview"


@pytest.mark.unit
def test_provision_workspace_migrates_legacy_identity_and_adds_bootstrap(monkeypatch, tmp_path):
    template_dir, workspace_template_dir = _write_template(tmp_path)
    _patch_template_dirs(monkeypatch, template_dir, workspace_template_dir)

    storage_base = tmp_path / "storage"
    workspace_dir = storage_base / "openclaw" / "user-legacy"
    user_workspace_dir = workspace_dir / "workspace"
    user_workspace_dir.mkdir(parents=True)
    (workspace_dir / "openclaw.json").write_text("{}")
    (user_workspace_dir / "IDENTITY.md").write_text("name: Copilot\n")

    workspace_mod.provision_workspace(
        user_id="user-legacy",
        storage_base=storage_base,
        port=18801,
        model="openrouter/google/gemini-3-flash-preview",
        token="gateway-token",
    )

    assert (user_workspace_dir / "BOOTSTRAP.md").read_text() == "template bootstrap"
    assert (user_workspace_dir / "IDENTITY.md").read_text() == "template identity"


@pytest.mark.unit
def test_provision_workspace_keeps_custom_identity(monkeypatch, tmp_path):
    template_dir, workspace_template_dir = _write_template(tmp_path)
    _patch_template_dirs(monkeypatch, template_dir, workspace_template_dir)

    storage_base = tmp_path / "storage"
    workspace_dir = storage_base / "openclaw" / "user-custom"
    user_workspace_dir = workspace_dir / "workspace"
    user_workspace_dir.mkdir(parents=True)
    (workspace_dir / "openclaw.json").write_text("{}")
    (user_workspace_dir / "IDENTITY.md").write_text("Name: OpenClaw Prime\n")

    workspace_mod.provision_workspace(
        user_id="user-custom",
        storage_base=storage_base,
        port=18802,
        model="openrouter/google/gemini-3-flash-preview",
        token="gateway-token",
    )

    assert (user_workspace_dir / "BOOTSTRAP.md").read_text() == "template bootstrap"
    assert (user_workspace_dir / "IDENTITY.md").read_text() == "Name: OpenClaw Prime\n"


@pytest.mark.unit
def test_provision_workspace_disables_control_ui_for_embedded_container(tmp_path):
    storage_base = tmp_path / "storage"
    workspace_dir, _runtime_dir = workspace_mod.provision_workspace(
        user_id="user-control-ui",
        storage_base=storage_base,
        port=18803,
        model="openrouter/google/gemini-3-flash-preview",
        token="gateway-token",
    )

    config = json.loads((workspace_dir / "openclaw.json").read_text())
    assert config["gateway"]["controlUi"]["enabled"] is False
