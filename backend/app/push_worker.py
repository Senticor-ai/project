import json
from datetime import UTC, datetime

from pywebpush import WebPushException, webpush

from .config import settings
from .db import db_conn
from .observability import configure_logging, get_logger

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
        logger.error("push_worker.missing_vapid_key")
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

        for entry in outbox:
            push_id = entry["push_id"]
            target_user_id = entry["target_user_id"]
            payload = entry["payload"]

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

        conn.commit()

    return processed


if __name__ == "__main__":
    count = process_batch()
    logger.info("push_worker.processed", count=count)
