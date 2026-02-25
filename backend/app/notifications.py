"""Notification event storage helpers.

Notification events are the canonical envelope used by:
- in-app notification feed
- SSE stream consumers
- push transport fanout
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from .db import db_conn, jsonb
from .push_events import enqueue_push_payload

NOTIFICATION_NOTIFY_CHANNEL = "notification_events"
_NOTIFICATION_NOTIFY_SQL = "SELECT pg_notify(%s, %s)"


def _serialize_event_row(row: dict[str, Any]) -> dict[str, Any]:
    created_at = row.get("created_at")
    if isinstance(created_at, datetime):
        created = created_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
    else:
        created = ""
    return {
        "event_id": str(row["event_id"]),
        "org_id": str(row["org_id"]),
        "user_id": str(row["user_id"]),
        "kind": str(row["kind"]),
        "title": str(row["title"]),
        "body": str(row["body"]),
        "url": row.get("url"),
        "payload": row.get("payload") or {},
        "created_at": created,
        "read_at": (
            row["read_at"].astimezone(UTC).isoformat().replace("+00:00", "Z")
            if row.get("read_at")
            else None
        ),
    }


def create_notification_event(
    *,
    org_id: str,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    url: str | None = None,
    payload: dict[str, Any] | None = None,
    enqueue_push: bool = True,
) -> dict[str, Any]:
    event_payload = payload or {}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO notification_events
                    (org_id, user_id, kind, title, body, url, payload)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    org_id,
                    user_id,
                    kind,
                    title,
                    body,
                    url,
                    jsonb(event_payload),
                ),
            )
            row = cur.fetchone()
            if row is not None:
                notify_payload = json.dumps(
                    {
                        "org_id": org_id,
                        "user_id": user_id,
                        "event_id": str(row["event_id"]),
                    },
                    separators=(",", ":"),
                )
                cur.execute(
                    _NOTIFICATION_NOTIFY_SQL,
                    (NOTIFICATION_NOTIFY_CHANNEL, notify_payload),
                )
        conn.commit()

    if row is None:
        raise RuntimeError("Failed to persist notification event")

    event = _serialize_event_row(row)
    if enqueue_push:
        push_payload = {
            "title": title,
            "body": body,
            "url": url,
            "target_user_id": user_id,
            "kind": kind,
            "event_id": event["event_id"],
            "payload": event_payload,
        }
        enqueue_push_payload(user_id, push_payload)
    return event


def list_notification_events(
    *,
    org_id: str,
    user_id: str,
    since: datetime | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 500)

    with db_conn() as conn:
        with conn.cursor() as cur:
            if since is None:
                cur.execute(
                    """
                    SELECT *
                    FROM notification_events
                    WHERE org_id = %s AND user_id = %s
                    ORDER BY created_at ASC
                    LIMIT %s
                    """,
                    (org_id, user_id, safe_limit),
                )
            else:
                cur.execute(
                    """
                    SELECT *
                    FROM notification_events
                    WHERE org_id = %s
                      AND user_id = %s
                      AND created_at > %s
                    ORDER BY created_at ASC
                    LIMIT %s
                    """,
                    (org_id, user_id, since, safe_limit),
                )
            rows = cur.fetchall()
    return [_serialize_event_row(row) for row in rows]


def parse_notification_cursor(cursor: str | None) -> datetime | None:
    if not cursor:
        return None
    normalized = cursor.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def new_notification_event_id() -> str:
    return str(uuid.uuid4())
