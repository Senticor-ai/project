"""Tests for the worker health/metrics sidecar module."""

import json
import socket
import time
import urllib.error
import urllib.request

import pytest

from app.worker_health import (
    WORKER_BATCHES_TOTAL,
    WORKER_EVENTS_TOTAL,
    WorkerHealthState,
    start_health_server,
)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TestWorkerHealthState:
    def test_initial_state_is_healthy(self):
        state = WorkerHealthState("test", poll_interval=1.0)
        assert state.is_healthy() is True

    def test_becomes_unhealthy_after_staleness(self):
        state = WorkerHealthState("test", poll_interval=0.05, staleness_multiplier=2.0)
        # threshold = 0.05 * 2.0 = 0.1s
        time.sleep(0.15)
        assert state.is_healthy() is False

    def test_touch_resets_health(self):
        state = WorkerHealthState("test", poll_interval=0.05, staleness_multiplier=2.0)
        time.sleep(0.15)
        assert state.is_healthy() is False
        state.touch()
        assert state.is_healthy() is True

    def test_seconds_since_last_poll(self):
        state = WorkerHealthState("test", poll_interval=1.0)
        time.sleep(0.1)
        assert state.seconds_since_last_poll() > 0.05

    def test_uptime_seconds(self):
        state = WorkerHealthState("test", poll_interval=1.0)
        time.sleep(0.1)
        assert state.uptime_seconds() > 0.05

    def test_worker_name(self):
        state = WorkerHealthState("my-worker", poll_interval=1.0)
        assert state.worker_name == "my-worker"


class TestHealthServer:
    @pytest.fixture()
    def healthy_server(self):
        port = _free_port()
        state = WorkerHealthState("test-worker", poll_interval=10.0)
        start_health_server(state, port)
        time.sleep(0.1)
        return state, port

    @pytest.fixture()
    def stuck_server(self):
        port = _free_port()
        state = WorkerHealthState("stuck-worker", poll_interval=0.05, staleness_multiplier=2.0)
        start_health_server(state, port)
        time.sleep(0.15)  # exceed threshold
        return state, port

    def test_health_returns_200_when_healthy(self, healthy_server):
        state, port = healthy_server
        state.touch()
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health") as resp:
            assert resp.status == 200
            body = json.loads(resp.read())
            assert body["status"] == "ok"
            assert body["worker"] == "test-worker"
            assert "seconds_since_last_poll" in body
            assert "uptime_seconds" in body

    def test_health_returns_503_when_stuck(self, stuck_server):
        _, port = stuck_server
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/health")
        assert exc_info.value.code == 503
        body = json.loads(exc_info.value.read())
        assert body["status"] == "stuck"

    def test_metrics_returns_prometheus_format(self, healthy_server):
        _, port = healthy_server
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics") as resp:
            assert resp.status == 200
            body = resp.read().decode("utf-8")
            assert "worker_up" in body

    def test_404_for_unknown_path(self, healthy_server):
        _, port = healthy_server
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/unknown")
        assert exc_info.value.code == 404

    def test_metrics_counters_registered(self, healthy_server):
        """Verify that worker-specific metrics exist in the output."""
        _, port = healthy_server
        # Increment a counter so it appears in output
        WORKER_BATCHES_TOTAL.labels(worker="test-worker").inc()
        WORKER_EVENTS_TOTAL.labels(worker="test-worker").inc(5)

        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics") as resp:
            body = resp.read().decode("utf-8")
            assert "worker_batches_total" in body
            assert "worker_events_total" in body
