from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import HTTPException, status

from ...db import db_conn, jsonb
from ...models import ImportSummary
from ...outbox import enqueue_event
from ..shared import _hash_payload


def _extract_bucket(jsonld: dict) -> str:
    """Extract ``app:bucket`` from additionalProperty."""
    for pv in jsonld.get("additionalProperty", []):
        if isinstance(pv, dict) and pv.get("propertyID") == "app:bucket":
            return pv.get("value", "inbox")
    return "inbox"


def _is_completed(jsonld: dict) -> bool:
    """Check if item has endTime (completed)."""
    return bool(jsonld.get("endTime"))


def _parse_iso(value: str | None) -> datetime | None:
    """Parse ISO-8601 string to datetime, returning None on failure."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except (TypeError, ValueError):
        return None


def run_native_import(
    items: list[dict],
    *,
    org_id: str,
    user_id: str,
    source: str,
    dry_run: bool,
    update_existing: bool,
    include_completed: bool,
    emit_events: bool,
    on_progress: Callable[[int, dict[str, int]], None] | None = None,
) -> ImportSummary:
    """Import items from a project JSON export (``/items/export``).

    Each element is an ``ItemResponse`` dict with ``item`` (or legacy
    ``thing``) containing fully-formed JSON-LD.  No transformation is
    needed -- the payload is upserted directly.
    """
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="items must be a list",
        )

    totals: Counter[str] = Counter()
    bucket_counts: Counter[str] = Counter()
    completed_counts: Counter[str] = Counter()
    sample_errors: list[str] = []

    with db_conn() as conn:
        if not dry_run:
            conn.autocommit = True
        with conn.cursor() as cur:
            for index, record in enumerate(items):
                try:
                    canonical_id = record.get("canonical_id")
                    if not canonical_id:
                        raise ValueError("missing canonical_id")  # noqa: TRY301

                    # Backward compat: new exports use "item", old exports use "thing"
                    jsonld = record.get("item") or record.get("thing")
                    if not jsonld or not isinstance(jsonld, dict):
                        raise ValueError("missing item/thing JSON-LD payload")  # noqa: TRY301

                    bucket = _extract_bucket(jsonld)
                    completed = _is_completed(jsonld)

                    if completed and not include_completed:
                        totals["skipped"] += 1
                        if on_progress:
                            on_progress(index + 1, dict(totals))
                        continue

                    content_hash = _hash_payload(jsonld)
                    item_source = record.get("source", source)
                    created_dt = _parse_iso(record.get("created_at")) or datetime.now(UTC)
                    updated_dt = _parse_iso(record.get("updated_at")) or datetime.now(UTC)

                except Exception as exc:  # noqa: BLE001
                    totals["errors"] += 1
                    if len(sample_errors) < 5:
                        sample_errors.append(f"item[{index}] {exc}")
                    if on_progress:
                        on_progress(index + 1, dict(totals))
                    continue

                if dry_run:
                    cur.execute(
                        """
                        SELECT 1
                        FROM items
                        WHERE org_id = %s AND canonical_id = %s
                        """,
                        (org_id, canonical_id),
                    )
                    exists = cur.fetchone() is not None
                    if exists and not update_existing:
                        totals["skipped"] += 1
                        if on_progress:
                            on_progress(index + 1, dict(totals))
                        continue
                    if exists:
                        totals["updated"] += 1
                    else:
                        totals["created"] += 1
                    bucket_counts[bucket] += 1
                    if completed:
                        completed_counts[bucket] += 1
                    if on_progress:
                        on_progress(index + 1, dict(totals))
                    continue

                if update_existing:
                    cur.execute(
                        """
                        INSERT INTO items (
                            org_id,
                            created_by_user_id,
                            canonical_id,
                            schema_jsonld,
                            source,
                            content_hash,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (org_id, canonical_id) DO UPDATE
                        SET schema_jsonld = EXCLUDED.schema_jsonld,
                            source = EXCLUDED.source,
                            content_hash = EXCLUDED.content_hash,
                            updated_at = EXCLUDED.updated_at
                        WHERE items.content_hash IS DISTINCT FROM EXCLUDED.content_hash
                        RETURNING item_id, (xmax = 0) AS inserted
                        """,
                        (
                            org_id,
                            user_id,
                            canonical_id,
                            jsonb(jsonld),
                            item_source,
                            content_hash,
                            created_dt,
                            updated_dt,
                        ),
                    )
                    row = cur.fetchone()
                    if row is None:
                        totals["unchanged"] += 1
                        if on_progress:
                            on_progress(index + 1, dict(totals))
                        continue
                    inserted = bool(row.get("inserted"))
                    if inserted:
                        totals["created"] += 1
                    else:
                        totals["updated"] += 1
                    bucket_counts[bucket] += 1
                    if completed:
                        completed_counts[bucket] += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO items (
                            org_id,
                            created_by_user_id,
                            canonical_id,
                            schema_jsonld,
                            source,
                            content_hash,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (org_id, canonical_id) DO NOTHING
                        RETURNING item_id
                        """,
                        (
                            org_id,
                            user_id,
                            canonical_id,
                            jsonb(jsonld),
                            item_source,
                            content_hash,
                            created_dt,
                            updated_dt,
                        ),
                    )
                    row = cur.fetchone()
                    if row is None:
                        totals["skipped"] += 1
                        if on_progress:
                            on_progress(index + 1, dict(totals))
                        continue
                    totals["created"] += 1
                    bucket_counts[bucket] += 1
                    if completed:
                        completed_counts[bucket] += 1

                if emit_events and row:
                    enqueue_event(
                        "item_upserted",
                        {"item_id": str(row["item_id"]), "org_id": org_id},
                    )

                if on_progress:
                    on_progress(index + 1, dict(totals))

    return ImportSummary(
        total=len(items),
        created=totals["created"],
        updated=totals["updated"],
        unchanged=totals["unchanged"],
        skipped=totals["skipped"],
        errors=totals["errors"],
        bucket_counts=dict(bucket_counts),
        completed_counts=dict(completed_counts),
        sample_errors=sample_errors,
    )
