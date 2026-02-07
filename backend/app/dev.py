"""Dev runner: spawns API + workers in one command.

Usage::

    cd backend
    uv run python -m app.dev

Ctrl-C stops all processes.
"""

import os
import signal
import subprocess
import time

PROCS = [
    [
        "uv",
        "run",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
    ],
    [
        "uv",
        "run",
        "python",
        "-m",
        "app.worker",
        "--loop",
        "--interval",
        "1",
        "--batch-size",
        "25",
    ],
    [
        "uv",
        "run",
        "python",
        "-m",
        "app.push_worker",
        "--loop",
        "--interval",
        "1",
        "--batch-size",
        "10",
    ],
]


def main() -> int:
    env = os.environ.copy()
    children: list[subprocess.Popen[bytes]] = []

    for cmd in PROCS:
        children.append(subprocess.Popen(cmd, env=env))  # noqa: S603

    def shutdown(_sig: object, _frame: object) -> None:
        for p in children:
            if p.poll() is None:
                p.terminate()
        for p in children:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # If any child exits, shut down the rest
    while True:
        for p in children:
            code = p.poll()
            if code is not None:
                shutdown(None, None)
                return code
        time.sleep(0.5)


if __name__ == "__main__":
    raise SystemExit(main())
