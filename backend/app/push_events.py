from __future__ import annotations

from datetime import UTC, datetime

from .db import db_conn, jsonb


def enqueue_push_payload(target_user_id: str | None, payload: dict) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO push_outbox (target_user_id, payload, created_at)
                VALUES (%s, %s, %s)
                """,
                (target_user_id, jsonb(payload), datetime.now(UTC)),
            )
        conn.commit()
