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

    runtime_dir.mkdir(parents=True, exist_ok=True)

    # Customize openclaw.json
    config_path = workspace_dir / "openclaw.json"
    config = json.loads(config_path.read_text())

    config["gateway"]["port"] = port
    config["gateway"]["auth"]["token"] = token
    config["agents"]["defaults"]["model"]["primary"] = model

    config_path.write_text(json.dumps(config, indent=2))

    return workspace_dir, runtime_dir
