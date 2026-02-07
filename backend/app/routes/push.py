import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pywebpush import WebPushException, webpush

from ..config import settings
from ..db import db_conn, jsonb
from ..deps import get_current_user
from ..models import (
    PushNotificationRequest,
    PushPublicKeyResponse,
    PushSubscriptionRequest,
)

router = APIRouter(prefix="/push", tags=["push"], dependencies=[Depends(get_current_user)])


def _require_vapid() -> None:
    if not settings.vapid_public_key or not settings.vapid_private_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID keys not configured",
        )


def _send_push(subscription: dict, payload: dict) -> None:
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_subject or "mailto:admin@example.com"},
    )


@router.get(
    "/vapid-public-key",
    response_model=PushPublicKeyResponse,
    summary="Get VAPID public key",
)
def get_public_key():
    _require_vapid()
    return PushPublicKeyResponse(public_key=settings.vapid_public_key)  # type: ignore[arg-type]


@router.post("/subscribe", summary="Store a push subscription")
def subscribe(payload: PushSubscriptionRequest, current_user=Depends(get_current_user)):
    _require_vapid()
    subscription = payload.subscription
    endpoint = subscription.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing endpoint")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO push_subscriptions (user_id, endpoint, payload, last_used_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (endpoint)
                DO UPDATE SET
                    payload = EXCLUDED.payload,
                    user_id = EXCLUDED.user_id,
                    last_used_at = EXCLUDED.last_used_at
                """,
                (current_user["id"], endpoint, jsonb(subscription), datetime.now(UTC)),
            )
        conn.commit()

    return {"ok": True}


@router.post("/unsubscribe", summary="Remove a push subscription")
def unsubscribe(payload: PushSubscriptionRequest, current_user=Depends(get_current_user)):
    subscription = payload.subscription
    endpoint = subscription.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing endpoint")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM push_subscriptions WHERE endpoint = %s AND user_id = %s",
                (endpoint, current_user["id"]),
            )
        conn.commit()

    return {"ok": True}


@router.post("/notify", summary="Enqueue a push notification")
def notify(payload: PushNotificationRequest, current_user=Depends(get_current_user)):
    _require_vapid()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO push_outbox (target_user_id, payload)
                VALUES (%s, %s)
                RETURNING push_id
                """,
                (
                    payload.target_user_id or current_user["id"],
                    jsonb(payload.model_dump()),
                ),
            )
            row = cur.fetchone()
        conn.commit()

    return {"push_id": row["push_id"]}


@router.post(
    "/test",
    summary="Send a test push immediately",
    description="Sends a push notification immediately to the current user's subscriptions.",
)
def test_push(payload: PushNotificationRequest, current_user=Depends(get_current_user)):
    _require_vapid()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subscription_id, payload
                FROM push_subscriptions
                WHERE user_id = %s
                """,
                (current_user["id"],),
            )
            subs = cur.fetchall()

    if not subs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscriptions for user",
        )

    sent = 0
    failures: list[str] = []
    for sub in subs:
        try:
            _send_push(sub["payload"], payload.model_dump())
            sent += 1
        except WebPushException as exc:
            failures.append(str(exc))

    if failures:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"sent": sent, "errors": failures},
        )

    return {"sent": sent}
