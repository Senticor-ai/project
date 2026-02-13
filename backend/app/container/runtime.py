"""Auto-detect container runtime (docker, nerdctl, podman).

Works with Docker Desktop, Rancher Desktop (nerdctl), and Podman.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from functools import lru_cache

logger = logging.getLogger(__name__)

_RUNTIMES = ["docker", "nerdctl", "podman"]


class NoRuntimeError(RuntimeError):
    """No container runtime found on this system."""


@lru_cache(maxsize=1)
def detect_runtime() -> str:
    """Return the path to the first available container runtime CLI.

    Tries docker → nerdctl → podman. Result is cached for the process lifetime.
    Raises NoRuntimeError if none are available.
    """
    for rt in _RUNTIMES:
        path = shutil.which(rt)
        if not path:
            continue
        try:
            result = subprocess.run(  # noqa: S603
                [path, "version"],
                capture_output=True,
                timeout=5,
                check=False,
            )
            if result.returncode == 0:
                logger.info("container.runtime_detected", extra={"runtime": rt})
                return path
        except subprocess.TimeoutExpired:
            continue
    raise NoRuntimeError("No container runtime found. Install docker, nerdctl, or podman.")


def run_cmd(
    args: list[str],
    *,
    timeout: int = 30,
) -> subprocess.CompletedProcess[str]:
    """Run a container CLI command with the detected runtime.

    Prepends the detected runtime binary to the args list.
    Returns CompletedProcess with stdout/stderr as text.
    """
    runtime = detect_runtime()
    return subprocess.run(  # noqa: S603
        [runtime, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
