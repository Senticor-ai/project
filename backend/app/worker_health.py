"""Lightweight HTTP health/metrics sidecar for background workers.

Each worker starts a daemon thread serving ``/health`` and ``/metrics``
on a configurable port. This lets k8s run liveness probes and Alloy
scrape Prometheus metrics from workers that otherwise have no HTTP server.

Usage in a worker's ``main()``::

    state = WorkerHealthState("projection-worker", poll_interval=1.0)
    start_health_server(state, port=9090)

    while True:
        count = process_batch(...)
        WORKER_BATCHES_TOTAL.labels(worker="projection-worker").inc()
        WORKER_EVENTS_TOTAL.labels(worker="projection-worker").inc(count)
        state.touch()
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from .observability import get_logger

logger = get_logger("worker-health")

# ---------------------------------------------------------------------------
# Prometheus metrics (shared across all workers via labels)
# ---------------------------------------------------------------------------

WORKER_BATCHES_TOTAL = Counter(
    "worker_batches_total",
    "Total batches processed by worker.",
    ["worker"],
)

WORKER_EVENTS_TOTAL = Counter(
    "worker_events_total",
    "Total events/items processed by worker.",
    ["worker"],
)

WORKER_ERRORS_TOTAL = Counter(
    "worker_errors_total",
    "Total errors encountered by worker.",
    ["worker"],
)

WORKER_LAST_POLL_TIMESTAMP = Gauge(
    "worker_last_poll_timestamp_seconds",
    "Unix timestamp of worker's last poll completion.",
    ["worker"],
)

WORKER_BATCH_DURATION_SECONDS = Histogram(
    "worker_batch_duration_seconds",
    "Duration of a single batch processing cycle.",
    ["worker"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)

WORKER_UP = Gauge(
    "worker_up",
    "Whether the worker is healthy (1) or stuck (0).",
    ["worker"],
)

# ---------------------------------------------------------------------------
# Health state tracker
# ---------------------------------------------------------------------------


class WorkerHealthState:
    """Thread-safe heartbeat tracker for a polling worker."""

    def __init__(
        self,
        worker_name: str,
        poll_interval: float,
        staleness_multiplier: float = 3.0,
    ) -> None:
        self._lock = threading.Lock()
        self._worker_name = worker_name
        self._staleness_threshold = poll_interval * staleness_multiplier
        self._last_poll: float = time.monotonic()
        self._started_at: float = time.monotonic()

    def touch(self) -> None:
        """Called by the polling loop after each iteration."""
        with self._lock:
            self._last_poll = time.monotonic()

    def is_healthy(self) -> bool:
        with self._lock:
            return (time.monotonic() - self._last_poll) < self._staleness_threshold

    @property
    def worker_name(self) -> str:
        return self._worker_name

    def seconds_since_last_poll(self) -> float:
        with self._lock:
            return time.monotonic() - self._last_poll

    def uptime_seconds(self) -> float:
        return time.monotonic() - self._started_at


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class _HealthRequestHandler(BaseHTTPRequestHandler):
    """Handles ``/health`` and ``/metrics`` for a worker."""

    _state: WorkerHealthState | None = None

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._handle_health()
        elif self.path == "/metrics":
            self._handle_metrics()
        else:
            self.send_error(404)

    def _handle_health(self) -> None:
        state = self._state
        if state is None:
            self.send_error(500, "State not initialised")
            return

        healthy = state.is_healthy()
        body = json.dumps(
            {
                "status": "ok" if healthy else "stuck",
                "worker": state.worker_name,
                "seconds_since_last_poll": round(state.seconds_since_last_poll(), 2),
                "uptime_seconds": round(state.uptime_seconds(), 2),
            }
        ).encode("utf-8")

        self.send_response(200 if healthy else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_metrics(self) -> None:
        state = self._state
        if state is not None:
            WORKER_UP.labels(worker=state.worker_name).set(
                1.0 if state.is_healthy() else 0.0,
            )
            WORKER_LAST_POLL_TIMESTAMP.labels(worker=state.worker_name).set(time.time())

        payload = generate_latest()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPE_LATEST)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass  # silence default stderr logging


# ---------------------------------------------------------------------------
# Server startup
# ---------------------------------------------------------------------------


def start_health_server(state: WorkerHealthState, port: int) -> threading.Thread:
    """Start a daemon-thread HTTP server for health/metrics."""
    handler_class = type(
        "_BoundHealthHandler",
        (_HealthRequestHandler,),
        {"_state": state},
    )

    server = HTTPServer(("0.0.0.0", port), handler_class)  # noqa: S104
    thread = threading.Thread(
        target=server.serve_forever,
        name=f"{state.worker_name}-health",
        daemon=True,
    )
    thread.start()
    logger.info("worker_health.started", worker=state.worker_name, port=port)
    return thread
