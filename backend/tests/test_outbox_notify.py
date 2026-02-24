"""Tests for outbox LISTEN/NOTIFY wakeups."""

from __future__ import annotations

import time
import uuid

import psycopg
from psycopg import sql

from app.config import settings
from app.db import db_conn
from app.outbox import enqueue_event


def _wait_for_payload(
    listener_conn: psycopg.Connection, payload: str, timeout: float = 2.0
) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        for notification in listener_conn.notifies(timeout=remaining, stop_after=1):
            if (
                notification.channel == settings.outbox_notify_channel
                and notification.payload == payload
            ):
                return True
    return False


def _cleanup_test_events() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM outbox_events
                WHERE event_type LIKE 'notify_test_%'
                """
            )
        conn.commit()


def test_enqueue_event_notifies_with_internal_connection(app):
    _cleanup_test_events()
    event_type = f"notify_test_{uuid.uuid4().hex[:12]}"

    with psycopg.connect(settings.database_url, autocommit=True) as listener_conn:
        with listener_conn.cursor() as cur:
            cur.execute(sql.SQL("LISTEN {}").format(sql.Identifier(settings.outbox_notify_channel)))

        enqueue_event(event_type, {"org_id": str(uuid.uuid4())})

        assert _wait_for_payload(listener_conn, event_type)

    _cleanup_test_events()


def test_enqueue_event_notifies_with_existing_cursor(app):
    _cleanup_test_events()
    event_type = f"notify_test_{uuid.uuid4().hex[:12]}"

    with psycopg.connect(settings.database_url, autocommit=True) as listener_conn:
        with listener_conn.cursor() as cur:
            cur.execute(sql.SQL("LISTEN {}").format(sql.Identifier(settings.outbox_notify_channel)))

        with db_conn() as conn:
            with conn.cursor() as cur:
                enqueue_event(event_type, {"org_id": str(uuid.uuid4())}, cur=cur)
            conn.commit()

        assert _wait_for_payload(listener_conn, event_type)

    _cleanup_test_events()
