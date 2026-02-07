from datetime import UTC, datetime

from .db import db_conn, jsonb
from .observability import get_request_context


def enqueue_event(event_type: str, payload: dict) -> None:
    context = get_request_context()
    enriched = dict(payload)
    if context.get("request_id") or context.get("user_id"):
        enriched["_context"] = {key: value for key, value in context.items() if value is not None}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO outbox_events (event_type, payload, created_at)
                VALUES (%s, %s, %s)
                """,
                (event_type, jsonb(enriched), datetime.now(UTC)),
            )
        conn.commit()
