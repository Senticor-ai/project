from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..idempotency import (
    compute_request_hash,
    get_idempotent_response,
    store_idempotent_response,
)
from ..models import AssertionCreateRequest
from ..outbox import enqueue_event

router = APIRouter(
    prefix="/assertions",
    tags=["assertions"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", summary="Create an assertion (idempotent)")
def create_assertion(
    payload: AssertionCreateRequest,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        description="Idempotency key for safe retries.",
    ),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    if idempotency_key:
        request_hash = compute_request_hash("POST", "/assertions", payload.model_dump())
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached:
            return JSONResponse(
                content=cached["response"],
                status_code=cached["status_code"],
            )

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO assertions (
                    org_id,
                    item_id,
                    assertion_type,
                    payload_json,
                    actor_type,
                    actor_id,
                    otel_trace_id,
                    supersedes_assertion_id
                )
                SELECT %s, t.item_id, %s, %s, %s, %s, %s, %s
                FROM items t
                WHERE t.item_id = %s AND t.org_id = %s
                RETURNING assertion_id
                """,
                (
                    org_id,
                    payload.assertion_type,
                    jsonb(payload.payload),
                    payload.actor_type,
                    payload.actor_id,
                    payload.otel_trace_id,
                    payload.supersedes_assertion_id,
                    payload.item_id,
                    org_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Item not found",
                )
        conn.commit()

    enqueue_event(
        "assertion_created",
        {
            "assertion_id": str(row["assertion_id"]),
            "item_id": payload.item_id,
            "org_id": org_id,
        },
    )

    response = {"assertion_id": str(row["assertion_id"])}
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response,
            status_code=200,
        )

    return response
