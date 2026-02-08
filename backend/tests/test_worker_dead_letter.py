"""Tests for outbox worker dead-letter handling."""

import uuid

import pytest

from app.config import settings
from app.db import db_conn, jsonb
from app.worker import process_batch


@pytest.fixture(autouse=True)
def _clean_outbox(app):
    """Remove all unprocessed outbox events so tests start from a clean state."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM outbox_events WHERE processed_at IS NULL")
        conn.commit()
    yield
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM outbox_events WHERE processed_at IS NULL")
        conn.commit()


def _insert_outbox_event(
    event_type: str = "thing_upserted",
    payload: dict | None = None,
    attempts: int = 0,
) -> str:
    """Insert an outbox event that will always fail (missing org_id)."""
    event_id = str(uuid.uuid4())
    if payload is None:
        # Omit org_id so the worker raises ValueError("missing org_id")
        # before hitting any FK-constrained tables.
        payload = {"thing_id": str(uuid.uuid4())}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO outbox_events (event_id, event_type, payload, attempts)
                VALUES (%s, %s, %s, %s)
                """,
                (event_id, event_type, jsonb(payload), attempts),
            )
        conn.commit()
    return event_id


def _get_event(event_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM outbox_events WHERE event_id = %s",
                (event_id,),
            )
            return cur.fetchone()


class TestDeadLetterHandling:
    """Events that fail repeatedly are moved to the dead letter queue."""

    def test_event_below_max_attempts_stays_retryable(self, app):
        """A single failure increments attempts but does not dead-letter."""
        event_id = _insert_outbox_event()

        process_batch(limit=10)

        row = _get_event(event_id)
        assert row is not None
        assert row["attempts"] == 1
        assert row["dead_lettered_at"] is None
        assert row["processed_at"] is None
        assert row["last_error"] is not None

    def test_event_dead_lettered_after_max_attempts(self, app):
        """After reaching max attempts, the event is dead-lettered."""
        event_id = _insert_outbox_event(
            attempts=settings.outbox_max_attempts - 1,
        )

        process_batch(limit=10)

        row = _get_event(event_id)
        assert row is not None
        assert row["attempts"] == settings.outbox_max_attempts
        assert row["dead_lettered_at"] is not None
        assert row["processed_at"] is None

    def test_dead_lettered_events_are_skipped(self, app):
        """Dead-lettered events are not picked up by subsequent batches."""
        event_id = _insert_outbox_event(
            attempts=settings.outbox_max_attempts - 1,
        )

        # First batch: should dead-letter the event
        process_batch(limit=10)
        row = _get_event(event_id)
        assert row["dead_lettered_at"] is not None
        old_attempts = row["attempts"]

        # Second batch: should NOT pick up the dead-lettered event
        process_batch(limit=10)
        row = _get_event(event_id)
        assert row["attempts"] == old_attempts  # unchanged

    def test_normal_failure_is_retried(self, app):
        """Events below the threshold are retried on subsequent batches."""
        event_id = _insert_outbox_event()

        # First failure
        process_batch(limit=10)
        row = _get_event(event_id)
        assert row["attempts"] == 1
        assert row["dead_lettered_at"] is None

        # Second failure — still retryable
        process_batch(limit=10)
        row = _get_event(event_id)
        assert row["attempts"] == 2
        assert row["dead_lettered_at"] is None
