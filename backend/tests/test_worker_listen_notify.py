"""Unit tests for LISTEN/NOTIFY worker helpers."""

from __future__ import annotations

from app import worker


class _FakeNotification:
    def __init__(self, channel: str, payload: str) -> None:
        self.channel = channel
        self.payload = payload


class _FakeListenerConn:
    def __init__(
        self,
        notifications: list[_FakeNotification] | None = None,
        error: Exception | None = None,
    ) -> None:
        self._notifications = notifications or []
        self._error = error

    def notifies(self, *, timeout: float | None = None, stop_after: int | None = None):
        if self._error is not None:
            raise self._error
        yield from self._notifications[: stop_after or len(self._notifications)]


def test_wait_for_outbox_signal_returns_true_on_notification() -> None:
    conn = _FakeListenerConn([_FakeNotification("outbox_events", "item_upserted")])
    assert worker._wait_for_outbox_signal(conn, timeout=1.0) is True


def test_wait_for_outbox_signal_returns_false_on_timeout() -> None:
    conn = _FakeListenerConn([])
    assert worker._wait_for_outbox_signal(conn, timeout=1.0) is False


def test_wait_for_outbox_signal_returns_none_on_listener_error() -> None:
    conn = _FakeListenerConn(error=RuntimeError("listener broken"))
    assert worker._wait_for_outbox_signal(conn, timeout=1.0) is None
