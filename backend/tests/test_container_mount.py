"""Tests for container project mount logic (Slice 2).

Verifies that _build_volume_args() correctly includes or omits the
/project:ro mount based on the openclaw_project_mount_path setting.
"""

from __future__ import annotations

import dataclasses

from app.config import settings
from app.container.manager import _build_volume_args


def _patch_settings(monkeypatch, **overrides):
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.container.manager.settings", patched)
    return patched


class TestBuildVolumeArgs:
    """_build_volume_args() assembles Docker -v flags with optional /project mount."""

    def test_always_includes_workspace_config_runtime(self, monkeypatch, tmp_path):
        """Core mounts are always present regardless of project mount setting."""
        _patch_settings(monkeypatch, openclaw_project_mount_path="")
        ws = tmp_path / "workspace"
        ws.mkdir()
        rt = tmp_path / "runtime"
        rt.mkdir()

        args = _build_volume_args(tmp_path, rt)

        joined = " ".join(args)
        assert ":/workspace" in joined
        assert ":/openclaw.json:ro" in joined
        assert ":/runtime" in joined
        assert ":/project" not in joined

    def test_project_mount_included_for_valid_dir(self, monkeypatch, tmp_path):
        """When openclaw_project_mount_path is a real directory, /project:ro is added."""
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        _patch_settings(monkeypatch, openclaw_project_mount_path=str(project_dir))

        ws = tmp_path / "workspace"
        ws.mkdir()
        rt = tmp_path / "runtime"
        rt.mkdir()

        args = _build_volume_args(tmp_path, rt)

        joined = " ".join(args)
        assert f"{project_dir}:/project:ro" in joined

    def test_project_mount_skipped_when_path_empty(self, monkeypatch, tmp_path):
        """When openclaw_project_mount_path is empty, no /project mount."""
        _patch_settings(monkeypatch, openclaw_project_mount_path="")

        ws = tmp_path / "workspace"
        ws.mkdir()
        rt = tmp_path / "runtime"
        rt.mkdir()

        args = _build_volume_args(tmp_path, rt)

        joined = " ".join(args)
        assert ":/project" not in joined

    def test_project_mount_skipped_for_nonexistent_path(self, monkeypatch, tmp_path):
        """When path doesn't exist, skip mount and log warning."""
        nonexistent = tmp_path / "does-not-exist"
        _patch_settings(monkeypatch, openclaw_project_mount_path=str(nonexistent))

        ws = tmp_path / "workspace"
        ws.mkdir()
        rt = tmp_path / "runtime"
        rt.mkdir()

        args = _build_volume_args(tmp_path, rt)

        joined = " ".join(args)
        assert ":/project" not in joined
