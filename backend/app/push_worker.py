import argparse
import json
import time
from datetime import UTC, datetime

from pywebpush import WebPushException, webpush

from .config import settings
from .db import db_conn
from .observability import configure_logging, get_logger
from .worker_health import (
    WORKER_BATCH_DURATION_SECONDS,
    WORKER_BATCHES_TOTAL,
    WORKER_EVENTS_TOTAL,
    WorkerHealthState,
    start_health_server,
)

configure_logging()
logger = get_logger("push-worker")


def _send(subscription: dict, payload: dict) -> None:
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_subject or "mailto:admin@example.com"},
    )


def process_batch(limit: int = 10) -> int:
    if not settings.vapid_private_key:
        return 0

    processed = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT push_id, target_user_id, payload
                FROM push_outbox
                WHERE processed_at IS NULL
                ORDER BY created_at ASC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
                """,
                (limit,),
            )
            outbox = cur.fetchall()
        if not outbox:
            logger.debug("push_worker.idle")
            return 0
        logger.info("push_worker.batch_fetched", fetched=len(outbox), limit=limit)

        for entry in outbox:
            push_id = entry["push_id"]
            target_user_id = entry["target_user_id"]
            payload = entry["payload"]
            started_at = time.monotonic()
            logger.info(
                "push_worker.event_start",
                push_id=str(push_id),
                target_user_id=str(target_user_id) if target_user_id else None,
            )

            try:
                with conn.cursor() as cur:
                    if target_user_id:
                        cur.execute(
                            """
                            SELECT subscription_id, endpoint, payload
                            FROM push_subscriptions
                            WHERE user_id = %s
                            """,
                            (target_user_id,),
                        )
                    else:
                        cur.execute(
                            """
                            SELECT subscription_id, endpoint, payload
                            FROM push_subscriptions
                            """,
                        )
                    subs = cur.fetchall()

                for sub in subs:
                    try:
                        _send(sub["payload"], payload)
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                UPDATE push_subscriptions
                                SET last_used_at = %s
                                WHERE subscription_id = %s
                                """,
                                (datetime.now(UTC), sub["subscription_id"]),
                            )
                    except WebPushException as exc:
                        status_code = getattr(exc.response, "status_code", None)
                        logger.warning(
                            "push_worker.send_failed",
                            error=str(exc),
                            status_code=status_code,
                        )
                        if status_code in {404, 410}:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "DELETE FROM push_subscriptions WHERE subscription_id = %s",
                                    (sub["subscription_id"],),
                                )
                        else:
                            raise

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE push_outbox
                        SET processed_at = %s
                        WHERE push_id = %s
                        """,
                        (datetime.now(UTC), push_id),
                    )
                processed += 1
                logger.info(
                    "push_worker.event_processed",
                    push_id=str(push_id),
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "push_worker.process_failed",
                    push_id=str(push_id),
                )
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE push_outbox
                        SET attempts = attempts + 1, last_error = %s
                        WHERE push_id = %s
                        """,
                        (str(exc)[:500], push_id),
                    )
                logger.error(
                    "push_worker.event_failed",
                    push_id=str(push_id),
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    error=str(exc)[:500],
                )

        conn.commit()

    logger.info("push_worker.batch_done", fetched=len(outbox), processed=processed, limit=limit)
    return processed


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process push notification outbox events")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Run continuously and poll for new push events.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of push outbox events to process per batch.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=settings.push_worker_poll_seconds,
        help="Poll interval in seconds when looping.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    batch_size = max(1, args.batch_size)
    interval = max(0.1, float(args.interval))

    if not args.loop:
        count = process_batch(limit=batch_size)
        logger.info("push_worker.processed", count=count, batch_size=batch_size)
        return

    _name = "push-worker"
    health_state = WorkerHealthState(
        _name,
        poll_interval=interval,
        staleness_multiplier=settings.worker_health_staleness_multiplier,
    )
    start_health_server(health_state, settings.push_worker_health_port)

    if not settings.vapid_private_key:
        logger.warning("push_worker.vapid_not_configured, sleeping until restart")
    logger.info("push_worker.loop_started", batch_size=batch_size, interval_seconds=interval)
    try:
        while True:
            batch_start = time.monotonic()
            count = process_batch(limit=batch_size)
            batch_duration = time.monotonic() - batch_start

            WORKER_BATCHES_TOTAL.labels(worker=_name).inc()
            WORKER_EVENTS_TOTAL.labels(worker=_name).inc(count)
            WORKER_BATCH_DURATION_SECONDS.labels(worker=_name).observe(batch_duration)
            health_state.touch()

            if count:
                logger.info("push_worker.processed", count=count, batch_size=batch_size)
            if count < batch_size:
                time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("push_worker.loop_stopped")


if __name__ == "__main__":
    main()
