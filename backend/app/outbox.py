from datetime import UTC, datetime

from .db import db_conn, jsonb
from .observability import get_request_context

_INSERT_SQL = """
INSERT INTO outbox_events (event_type, payload, created_at)
VALUES (%s, %s, %s)
"""


def enqueue_event(event_type: str, payload: dict, *, cur=None) -> None:
    context = get_request_context()
    enriched = dict(payload)
    if context.get("request_id") or context.get("user_id"):
        enriched["_context"] = {key: value for key, value in context.items() if value is not None}
    params = (event_type, jsonb(enriched), datetime.now(UTC))
    if cur is not None:
        cur.execute(_INSERT_SQL, params)
    else:
        with db_conn() as conn:
            with conn.cursor() as c:
                c.execute(_INSERT_SQL, params)
            conn.commit()
