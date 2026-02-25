"""Notification APIs (send, list, SSE stream)."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from psycopg import sql
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import get_current_org, get_current_user
from ..notifications import (
    NOTIFICATION_NOTIFY_CHANNEL,
    create_notification_event,
    list_notification_events,
    parse_notification_cursor,
)
from ..observability import get_logger

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = get_logger("routes.notifications")

_NOTIFICATION_WAIT_STOP_AFTER = 100


class NotificationSendRequest(BaseModel):
    kind: str = "manual"
    title: str
    body: str
    url: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    target_user_id: str | None = None


class NotificationResponse(BaseModel):
    event_id: str
    kind: str
    title: str
    body: str
    url: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    read_at: str | None = None


def _notification_matches_scope(payload: str | None, *, org_id: str, user_id: str) -> bool:
    if not payload:
        return True
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return True
    if not isinstance(parsed, dict):
        return True
    return str(parsed.get("org_id")) == org_id and str(parsed.get("user_id")) == user_id


async def _open_notification_listener() -> psycopg.AsyncConnection | None:
    channel = NOTIFICATION_NOTIFY_CHANNEL
    try:
        listener_conn = await psycopg.AsyncConnection.connect(
            settings.database_url,
            autocommit=True,
        )
        async with listener_conn.cursor() as cur:
            await cur.execute(sql.SQL("LISTEN {}").format(sql.Identifier(channel)))
        logger.info("notifications.listen_ready", channel=channel)
        return listener_conn
    except Exception:  # noqa: BLE001
        logger.warning("notifications.listen_start_failed", channel=channel, exc_info=True)
        return None


async def _close_notification_listener(listener_conn: psycopg.AsyncConnection | None) -> None:
    if listener_conn is None:
        return
    try:
        await listener_conn.close()
    except Exception:  # noqa: BLE001
        logger.debug("notifications.listen_close_failed", exc_info=True)


async def _wait_for_notification_signal(
    listener_conn: psycopg.AsyncConnection,
    *,
    timeout: float,
    org_id: str,
    user_id: str,
) -> bool | None:
    timeout_seconds = max(0.1, float(timeout))
    try:
        async for notification in listener_conn.notifies(
            timeout=timeout_seconds,
            stop_after=_NOTIFICATION_WAIT_STOP_AFTER,
        ):
            if _notification_matches_scope(notification.payload, org_id=org_id, user_id=user_id):
                logger.debug(
                    "notifications.notified",
                    channel=notification.channel,
                    payload=notification.payload,
                )
                return True
        return False
    except Exception:  # noqa: BLE001
        logger.warning("notifications.listen_wait_failed", exc_info=True)
        return None


@router.post("/send", response_model=NotificationResponse, summary="Create a notification event")
def send_notification(
    payload: NotificationSendRequest,
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    target_user_id = payload.target_user_id or str(current_user["id"])
    event = create_notification_event(
        org_id=org["org_id"],
        user_id=target_user_id,
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
        url=payload.url,
        payload=payload.payload,
    )
    return NotificationResponse(**event)


@router.get("", response_model=list[NotificationResponse], summary="List notification events")
def list_notifications(
    cursor: str | None = Query(
        default=None,
        description="ISO timestamp cursor (created_at > cursor)",
    ),
    limit: int = Query(default=50, ge=1, le=500),
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    since = parse_notification_cursor(cursor)
    if cursor and since is None:
        raise HTTPException(status_code=400, detail="Invalid cursor")
    rows = list_notification_events(
        org_id=org["org_id"],
        user_id=str(current_user["id"]),
        since=since,
        limit=limit,
    )
    return [NotificationResponse(**row) for row in rows]


@router.get("/stream", summary="Stream notification events (SSE)")
async def stream_notifications(
    cursor: str | None = Query(default=None, description="ISO timestamp cursor"),
    poll_seconds: float = Query(
        default=1.0,
        ge=0.01,
        le=10.0,
        description="Fallback poll interval when LISTEN/NOTIFY is unavailable.",
    ),
    idle_wait_seconds: float = Query(
        default=30.0,
        ge=0.1,
        le=120.0,
        description="Maximum LISTEN/NOTIFY wait before running a fallback poll.",
    ),
    max_events: int | None = Query(default=None, ge=1, le=1000),
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    since = parse_notification_cursor(cursor)
    if cursor and since is None:
        raise HTTPException(status_code=400, detail="Invalid cursor")
    if since is None:
        since = datetime.now(UTC) - timedelta(minutes=10)

    org_id = org["org_id"]
    user_id = str(current_user["id"])

    async def event_stream():
        emitted = 0
        last_seen = since
        heartbeat_deadline = time.monotonic() + 15.0
        listener_conn = await _open_notification_listener()
        try:
            while True:
                events = list_notification_events(
                    org_id=org_id,
                    user_id=user_id,
                    since=last_seen,
                    limit=200,
                )
                if events:
                    for event in events:
                        created_at = parse_notification_cursor(event.get("created_at"))
                        if created_at:
                            last_seen = created_at
                        payload = json.dumps(event, separators=(",", ":"))
                        yield f"event: notification\ndata: {payload}\n\n"
                        emitted += 1
                        if max_events is not None and emitted >= max_events:
                            return
                    heartbeat_deadline = time.monotonic() + 15.0
                    continue

                if time.monotonic() >= heartbeat_deadline:
                    yield ": keepalive\n\n"
                    heartbeat_deadline = time.monotonic() + 15.0

                if listener_conn is None:
                    await asyncio.sleep(poll_seconds)
                    continue

                wait_result = await _wait_for_notification_signal(
                    listener_conn,
                    timeout=idle_wait_seconds,
                    org_id=org_id,
                    user_id=user_id,
                )
                if wait_result is None:
                    await _close_notification_listener(listener_conn)
                    listener_conn = None
                    await asyncio.sleep(poll_seconds)
        finally:
            await _close_notification_listener(listener_conn)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
