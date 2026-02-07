import hashlib
import json
from typing import Any

from fastapi import HTTPException, status

from .db import db_conn, jsonb


def compute_request_hash(method: str, path: str, payload: Any | None) -> str:
    body = ""
    if payload is not None:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    raw = f"{method}:{path}:{body}".encode()
    return hashlib.sha256(raw).hexdigest()


def get_idempotent_response(org_id: str, key: str, request_hash: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_hash, response_json, status_code
                FROM idempotency_keys
                WHERE org_id = %s AND key = %s
                """,
                (org_id, key),
            )
            row = cur.fetchone()

    if row is None:
        return None

    if row["request_hash"] != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency key reuse with different payload",
        )

    return {"response": row["response_json"], "status_code": row["status_code"]}


def store_idempotent_response(
    org_id: str,
    key: str,
    request_hash: str,
    response_json: dict,
    status_code: int,
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO idempotency_keys (org_id, key, request_hash, response_json, status_code)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (org_id, key) DO NOTHING
                """,
                (org_id, key, request_hash, jsonb(response_json), status_code),
            )
        conn.commit()
