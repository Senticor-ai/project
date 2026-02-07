from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from psycopg import errors as psycopg_errors

from ..db import db_conn


def _now() -> datetime:
    return datetime.now(UTC)


def _normalize_entity(entity_type: str) -> str:
    lowered = entity_type.strip().lower()
    if lowered not in {"thing", "file"}:
        raise ValueError(f"Invalid entity_type: {entity_type}")
    return lowered


def _fallback_job(
    org_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    status: str = "not_configured",
) -> dict[str, Any]:
    return {
        "job_id": None,
        "org_id": org_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "status": status,
        "attempts": 0,
        "last_error": "search_index_jobs table missing",
        "queued_at": None,
        "started_at": None,
        "finished_at": None,
        "updated_at": None,
        "requested_by_user_id": None,
    }


def enqueue_job(
    org_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    requested_by_user_id: str | None = None,
) -> dict[str, Any]:
    entity_type = _normalize_entity(entity_type)
    now = _now()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO search_index_jobs (
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        queued_at,
                        updated_at,
                        requested_by_user_id
                    )
                    VALUES (%s, %s, %s, %s, %s, 0, %s, %s, %s)
                    ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE
                    SET action = EXCLUDED.action,
                        status = EXCLUDED.status,
                        attempts = 0,
                        last_error = NULL,
                        queued_at = EXCLUDED.queued_at,
                        started_at = NULL,
                        finished_at = NULL,
                        updated_at = EXCLUDED.updated_at,
                        requested_by_user_id = EXCLUDED.requested_by_user_id
                    RETURNING
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    """,
                    (
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        "queued",
                        now,
                        now,
                        requested_by_user_id,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg_errors.UndefinedTable:
        return _fallback_job(org_id, entity_type, entity_id, action)

    return row


def mark_processing(
    org_id: str,
    entity_type: str,
    entity_id: str,
    action: str = "upsert",
) -> dict[str, Any]:
    entity_type = _normalize_entity(entity_type)
    now = _now()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO search_index_jobs (
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        queued_at,
                        started_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, 0, %s, %s, %s)
                    ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE
                    SET action = EXCLUDED.action,
                        status = EXCLUDED.status,
                        started_at = EXCLUDED.started_at,
                        updated_at = EXCLUDED.updated_at
                    RETURNING
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    """,
                    (
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        "processing",
                        now,
                        now,
                        now,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg_errors.UndefinedTable:
        return _fallback_job(org_id, entity_type, entity_id, action)

    return row


def mark_succeeded(
    org_id: str,
    entity_type: str,
    entity_id: str,
    action: str | None = None,
) -> dict[str, Any]:
    entity_type = _normalize_entity(entity_type)
    now = _now()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_index_jobs
                    SET status = %s,
                        last_error = NULL,
                        finished_at = %s,
                        updated_at = %s
                    WHERE org_id = %s AND entity_type = %s AND entity_id = %s
                    RETURNING
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    """,
                    ("succeeded", now, now, org_id, entity_type, entity_id),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg_errors.UndefinedTable:
        return _fallback_job(org_id, entity_type, entity_id, action or "upsert")

    if row is None:
        return enqueue_job(
            org_id, entity_type, entity_id, action=action or "upsert"
        )
    return row


def mark_failed(
    org_id: str,
    entity_type: str,
    entity_id: str,
    error: str,
    action: str | None = None,
) -> dict[str, Any]:
    entity_type = _normalize_entity(entity_type)
    now = _now()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_index_jobs
                    SET status = %s,
                        attempts = attempts + 1,
                        last_error = %s,
                        finished_at = %s,
                        updated_at = %s
                    WHERE org_id = %s AND entity_type = %s AND entity_id = %s
                    RETURNING
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    """,
                    ("failed", error[:500], now, now, org_id, entity_type, entity_id),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg_errors.UndefinedTable:
        return _fallback_job(org_id, entity_type, entity_id, action or "upsert")

    if row is None:
        return enqueue_job(
            org_id, entity_type, entity_id, action=action or "upsert"
        )
    return row


def mark_skipped(
    org_id: str,
    entity_type: str,
    entity_id: str,
    reason: str,
    action: str | None = None,
) -> dict[str, Any]:
    entity_type = _normalize_entity(entity_type)
    now = _now()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE search_index_jobs
                    SET status = %s,
                        last_error = %s,
                        finished_at = %s,
                        updated_at = %s
                    WHERE org_id = %s AND entity_type = %s AND entity_id = %s
                    RETURNING
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    """,
                    ("skipped", reason[:500], now, now, org_id, entity_type, entity_id),
                )
                row = cur.fetchone()
            conn.commit()
    except psycopg_errors.UndefinedTable:
        return _fallback_job(org_id, entity_type, entity_id, action or "upsert")

    if row is None:
        return enqueue_job(
            org_id, entity_type, entity_id, action=action or "upsert"
        )
    return row


def get_job(org_id: str, entity_type: str, entity_id: str) -> dict[str, Any] | None:
    entity_type = _normalize_entity(entity_type)
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        job_id,
                        org_id,
                        entity_type,
                        entity_id,
                        action,
                        status,
                        attempts,
                        last_error,
                        queued_at,
                        started_at,
                        finished_at,
                        updated_at,
                        requested_by_user_id
                    FROM search_index_jobs
                    WHERE org_id = %s AND entity_type = %s AND entity_id = %s
                    """,
                    (org_id, entity_type, entity_id),
                )
                row = cur.fetchone()
    except psycopg_errors.UndefinedTable:
        return None

    return row


def serialize_job(
    row: dict[str, Any] | None,
    entity_type: str,
    entity_id: str,
    org_id: str,
) -> dict[str, Any]:
    if row is None:
        return {
            "org_id": org_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": "unknown",
            "status": "not_indexed",
            "attempts": 0,
            "last_error": None,
            "queued_at": None,
            "started_at": None,
            "finished_at": None,
            "updated_at": None,
        }

    def _iso(value):
        return value.isoformat() if value is not None else None

    return {
        "org_id": str(row.get("org_id") or org_id),
        "entity_type": row.get("entity_type") or entity_type,
        "entity_id": str(row.get("entity_id") or entity_id),
        "action": row.get("action") or "unknown",
        "status": row.get("status") or "unknown",
        "attempts": int(row.get("attempts") or 0),
        "last_error": row.get("last_error"),
        "queued_at": _iso(row.get("queued_at")),
        "started_at": _iso(row.get("started_at")),
        "finished_at": _iso(row.get("finished_at")),
        "updated_at": _iso(row.get("updated_at")),
    }
