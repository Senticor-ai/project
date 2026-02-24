"""Gmail Watch Worker — pulls Pub/Sub notifications and enqueues email sync jobs.

Runs as a separate process: ``python -m app.email.watch_worker --loop``

Architecture:
  Gmail mailbox change
    → Google publishes to Pub/Sub topic
    → This worker pulls from subscription (every N seconds)
    → Groups notifications by email_address
    → Enqueues email_sync_job outbox events
    → Acknowledges Pub/Sub messages
    → Checks for watches expiring soon → enqueues watch_renew events
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import UTC, datetime, timedelta

import httpx
from google.auth.exceptions import TransportError

from ..config import settings
from ..db import db_conn
from ..outbox import enqueue_event
from ..worker_health import (
    WORKER_BATCH_DURATION_SECONDS,
    WORKER_BATCHES_TOTAL,
    WORKER_ERRORS_TOTAL,
    WORKER_EVENTS_TOTAL,
    WorkerHealthState,
    start_health_server,
)
from .pubsub import PubSubClient, PubSubMessage
from .sync import register_watch

logger = logging.getLogger(__name__)


def _is_transient_pull_error(exc: Exception) -> bool:
    """Whether pull/ack failures should be treated as temporary outages."""
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException, TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code if exc.response else None
        return status in {408, 429, 500, 502, 503, 504}
    return False


def _find_connection_by_email(email_address: str) -> dict | None:
    """Look up an active email connection by email address."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id, org_id, user_id
                FROM email_connections
                WHERE email_address = %s AND is_active = true
                LIMIT 1
                """,
                (email_address,),
            )
            return cur.fetchone()


def process_notifications(client: PubSubClient) -> int:
    """Pull notifications, enqueue sync jobs, acknowledge.

    Returns the number of sync jobs enqueued.
    """
    messages = client.pull(max_messages=50)
    if not messages:
        return 0

    # Group by email address to deduplicate
    by_email: dict[str, list[PubSubMessage]] = {}
    for msg in messages:
        if msg.email_address:
            by_email.setdefault(msg.email_address, []).append(msg)

    enqueued = 0
    ack_ids: list[str] = []

    for email_address, msgs in by_email.items():
        connection = _find_connection_by_email(email_address)
        if connection:
            enqueue_event(
                "email_sync_job",
                {
                    "connection_id": str(connection["connection_id"]),
                    "org_id": str(connection["org_id"]),
                    "user_id": str(connection["user_id"]),
                },
            )
            enqueued += 1
            logger.info(
                "watch_worker.enqueued_sync email=%s connection=%s",
                email_address,
                connection["connection_id"],
            )
        else:
            logger.debug("watch_worker.no_connection email=%s", email_address)

        ack_ids.extend(m.ack_id for m in msgs)

    # Acknowledge all messages (even ones without connections)
    if ack_ids:
        client.acknowledge(ack_ids)

    return enqueued


def renew_expiring_watches(buffer_hours: int = 12) -> int:
    """Find watches expiring within buffer_hours and renew them.

    Returns the number of watches renewed.
    """
    threshold = datetime.now(UTC) + timedelta(hours=buffer_hours)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id, org_id
                FROM email_connections
                WHERE is_active = true
                  AND watch_expiration IS NOT NULL
                  AND watch_expiration < %s
                """,
                (threshold,),
            )
            rows = cur.fetchall()

    renewed = 0
    for row in rows:
        try:
            register_watch(str(row["connection_id"]), str(row["org_id"]))
            renewed += 1
            logger.info("watch_worker.watch_renewed connection=%s", row["connection_id"])
        except Exception:
            logger.warning(
                "watch_worker.watch_renew_failed connection=%s",
                row["connection_id"],
                exc_info=True,
            )

    return renewed


def register_missing_watches() -> int:
    """Register watches for active connections that don't have one yet.

    Called once on startup so connections created before Pub/Sub was
    configured get watches automatically (no need to re-connect Gmail).
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT connection_id, org_id
                FROM email_connections
                WHERE is_active = true
                  AND watch_expiration IS NULL
                """,
            )
            rows = cur.fetchall()

    registered = 0
    for row in rows:
        try:
            register_watch(str(row["connection_id"]), str(row["org_id"]))
            registered += 1
            logger.info(
                "watch_worker.registered_missing connection=%s",
                row["connection_id"],
            )
        except Exception:
            logger.warning(
                "watch_worker.register_missing_failed connection=%s",
                row["connection_id"],
                exc_info=True,
            )

    return registered


def run_loop(
    poll_seconds: float = 5.0,
    renew_buffer_hours: int = 12,
) -> None:
    """Main worker loop — pull notifications and renew watches."""
    _name = "watch-worker"
    interval = max(0.1, float(poll_seconds))
    health_state = WorkerHealthState(
        _name,
        poll_interval=interval,
        staleness_multiplier=settings.worker_health_staleness_multiplier,
    )
    start_health_server(health_state, settings.gmail_watch_worker_health_port)

    if not settings.gmail_watch_configured:
        logger.info(
            "watch_worker.not_configured — set GMAIL_PUBSUB_PROJECT_ID, "
            "GMAIL_PUBSUB_SUBSCRIPTION, and GMAIL_PUBSUB_CREDENTIALS_FILE to enable"
        )
        return

    creds_file = settings.gmail_pubsub_credentials_file
    project_id = settings.gmail_pubsub_project_id
    subscription_id = settings.gmail_pubsub_subscription
    if not creds_file or not subscription_id or not project_id:
        logger.error(
            "watch_worker.misconfigured — "
            "GMAIL_PUBSUB_PROJECT_ID, GMAIL_PUBSUB_SUBSCRIPTION, "
            "and GMAIL_PUBSUB_CREDENTIALS_FILE required"
        )
        return

    client = PubSubClient(
        project_id=project_id,
        subscription_id=subscription_id,
        credentials_file=creds_file,
    )

    # Register watches for connections that never had one
    try:
        registered = register_missing_watches()
        if registered:
            logger.info("watch_worker.startup_registrations count=%d", registered)
    except Exception:
        logger.exception("watch_worker.startup_registration_failed")

    # Check for watch renewals every 10 minutes.
    # last_renew_check=0.0 with time.monotonic() ensures the first check
    # runs immediately on the first loop iteration (intentional).
    renew_interval = 600.0
    last_renew_check = 0.0

    logger.info(
        "watch_worker.started poll_seconds=%.1f subscription=%s",
        interval,
        subscription_id,
    )
    pull_unavailable = False

    try:
        while True:
            batch_start = time.monotonic()
            enqueued = 0
            try:
                enqueued = process_notifications(client)
                if pull_unavailable:
                    logger.info("watch_worker.pull_recovered")
                    pull_unavailable = False
                if enqueued:
                    logger.info("watch_worker.batch enqueued=%d", enqueued)
            except Exception as exc:
                WORKER_ERRORS_TOTAL.labels(worker=_name).inc()
                if _is_transient_pull_error(exc):
                    if not pull_unavailable:
                        logger.warning(
                            "watch_worker.pull_unavailable error=%s; retrying",
                            str(exc),
                        )
                    pull_unavailable = True
                else:
                    pull_unavailable = False
                    logger.exception("watch_worker.pull_failed")

            # Periodic watch renewal check
            now = time.monotonic()
            if now - last_renew_check >= renew_interval:
                try:
                    renewed = renew_expiring_watches(renew_buffer_hours)
                    if renewed:
                        logger.info("watch_worker.renewals count=%d", renewed)
                except Exception:
                    WORKER_ERRORS_TOTAL.labels(worker=_name).inc()
                    logger.exception("watch_worker.renew_check_failed")
                last_renew_check = now

            batch_duration = time.monotonic() - batch_start
            WORKER_BATCHES_TOTAL.labels(worker=_name).inc()
            WORKER_EVENTS_TOTAL.labels(worker=_name).inc(enqueued)
            WORKER_BATCH_DURATION_SECONDS.labels(worker=_name).observe(batch_duration)
            health_state.touch()

            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("watch_worker.stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gmail Watch Pub/Sub Worker")
    parser.add_argument("--loop", action="store_true", help="Run in continuous loop")
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=settings.gmail_watch_worker_poll_seconds,
    )
    args = parser.parse_args()

    if args.loop:
        run_loop(
            poll_seconds=args.poll_seconds,
            renew_buffer_hours=settings.gmail_watch_renew_buffer_hours,
        )
    else:
        logger.info("watch_worker.single_run — use --loop for continuous mode")


if __name__ == "__main__":
    main()
