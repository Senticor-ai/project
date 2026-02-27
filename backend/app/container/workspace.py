"""Per-user OpenClaw workspace provisioning.

Copies the openclaw/ template directory and customizes openclaw.json
with the user's port, model, and gateway token. The user's LLM API key
is NEVER written to disk — it's injected as an env var at container start.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from ..config import ROOT_DIR

TEMPLATE_DIR = ROOT_DIR / "openclaw"
WORKSPACE_TEMPLATE_DIR = TEMPLATE_DIR / "workspace"
BOOTSTRAP_FILENAME = "BOOTSTRAP.md"
IDENTITY_FILENAME = "IDENTITY.md"
LEGACY_IDENTITY_SENTINEL = "name: Copilot"


def _read_text_if_exists(path: Path) -> str | None:
    """Read text file content when it exists, else None."""
    try:
        return path.read_text()
    except FileNotFoundError:
        return None


def _sync_workspace_templates(workspace_dir: Path) -> None:
    """Sync bootstrap templates into existing user workspaces safely.

    We only add missing files, and only migrate IDENTITY.md from the legacy
    one-line placeholder to the template. User-customized identity files are
    preserved.
    """
    if not WORKSPACE_TEMPLATE_DIR.is_dir():
        return

    user_workspace_dir = workspace_dir / "workspace"
    if not user_workspace_dir.is_dir():
        return

    template_bootstrap = WORKSPACE_TEMPLATE_DIR / BOOTSTRAP_FILENAME
    user_bootstrap = user_workspace_dir / BOOTSTRAP_FILENAME
    if template_bootstrap.is_file() and not user_bootstrap.exists():
        user_bootstrap.write_text(template_bootstrap.read_text())

    template_identity = WORKSPACE_TEMPLATE_DIR / IDENTITY_FILENAME
    if not template_identity.is_file():
        return

    template_identity_text = template_identity.read_text()
    user_identity = user_workspace_dir / IDENTITY_FILENAME
    user_identity_text = _read_text_if_exists(user_identity)
    if user_identity_text is None:
        user_identity.write_text(template_identity_text)
        return

    if user_identity_text.strip() == LEGACY_IDENTITY_SENTINEL:
        user_identity.write_text(template_identity_text)


def provision_workspace(
    user_id: str,
    storage_base: Path,
    port: int,
    model: str,
    token: str,
) -> tuple[Path, Path]:
    """Copy the openclaw template, customize openclaw.json, create runtime dir.

    Returns (workspace_dir, runtime_dir).
    """
    # Docker volume mounts require absolute paths
    abs_base = storage_base.resolve()
    workspace_dir = abs_base / "openclaw" / user_id
    runtime_dir = abs_base / "openclaw-runtime" / user_id

    if not workspace_dir.exists():
        shutil.copytree(TEMPLATE_DIR, workspace_dir)

    _sync_workspace_templates(workspace_dir)

    runtime_dir.mkdir(parents=True, exist_ok=True)

    # Always re-read the template config so tool/agent settings stay current,
    # then apply per-user overrides on top.
    template_config_path = TEMPLATE_DIR / "openclaw.json"
    config = json.loads(template_config_path.read_text())

    config["gateway"]["port"] = port
    config["gateway"]["auth"]["token"] = token
    config["agents"]["defaults"]["model"]["primary"] = model
    image_model = config["agents"]["defaults"].get("imageModel")
    if isinstance(image_model, dict):
        image_model["primary"] = model
    else:
        config["agents"]["defaults"]["imageModel"] = {"primary": model}

    user_config_path = workspace_dir / "openclaw.json"
    user_config_path.write_text(json.dumps(config, indent=2))

    return workspace_dir, runtime_dir
