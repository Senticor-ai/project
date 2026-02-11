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

from ..config import settings
from ..db import db_conn
from ..outbox import enqueue_event
from .pubsub import PubSubClient, PubSubMessage
from .sync import register_watch

logger = logging.getLogger(__name__)


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


def run_loop(
    poll_seconds: float = 5.0,
    renew_buffer_hours: int = 12,
) -> None:
    """Main worker loop — pull notifications and renew watches."""
    if not settings.gmail_watch_enabled:
        logger.info("watch_worker.disabled (GMAIL_WATCH_ENABLED=false)")
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

    # Check for watch renewals every 10 minutes
    renew_interval = 600.0
    last_renew_check = 0.0

    logger.info(
        "watch_worker.started poll_seconds=%.1f subscription=%s",
        poll_seconds,
        subscription_id,
    )

    try:
        while True:
            try:
                enqueued = process_notifications(client)
                if enqueued:
                    logger.info("watch_worker.batch enqueued=%d", enqueued)
            except Exception:
                logger.exception("watch_worker.pull_failed")

            # Periodic watch renewal check
            now = time.monotonic()
            if now - last_renew_check >= renew_interval:
                try:
                    renewed = renew_expiring_watches(renew_buffer_hours)
                    if renewed:
                        logger.info("watch_worker.renewals count=%d", renewed)
                except Exception:
                    logger.exception("watch_worker.renew_check_failed")
                last_renew_check = now

            time.sleep(poll_seconds)
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
