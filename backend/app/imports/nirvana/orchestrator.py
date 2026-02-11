from __future__ import annotations

from collections import Counter
from collections.abc import Callable

from fastapi import HTTPException, status

from ...db import db_conn, jsonb
from ...models import ImportSummary
from ...outbox import enqueue_event
from ..shared import _hash_payload
from .transform import (
    _DEFAULT_STATE_BUCKET_MAP,
    _SKIP_STATES,
    _build_nirvana_item,
    _normalize_state_bucket_map,
    _parse_epoch,
)


def run_nirvana_import(
    items: list[dict],
    *,
    org_id: str,
    user_id: str,
    source: str,
    dry_run: bool,
    update_existing: bool,
    include_completed: bool,
    emit_events: bool,
    state_bucket_map: dict[int, str] | None,
    default_bucket: str,
    on_progress: Callable[[int, dict[str, int]], None] | None = None,
) -> ImportSummary:
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="items must be a list",
        )

    state_map = dict(_DEFAULT_STATE_BUCKET_MAP)
    state_map.update(_normalize_state_bucket_map(state_bucket_map))

    project_children: dict[str, list[str]] = {}
    for item in items:
        parent_id = str(item.get("parentid") or "").strip()
        if not parent_id:
            continue
        child_id = str(item.get("id") or "").strip()
        if not child_id:
            continue
        if not include_completed and (
            _parse_epoch(item.get("completed")) or item.get("deleted") or item.get("cancelled")
        ):
            continue
        try:
            child_state = int(item.get("state", 0))
        except (TypeError, ValueError):
            child_state = 0
        if child_state in _SKIP_STATES:
            continue
        project_children.setdefault(parent_id, []).append(child_id)

    totals: Counter[str] = Counter()
    bucket_counts: Counter[str] = Counter()
    completed_counts: Counter[str] = Counter()
    sample_errors: list[str] = []

    with db_conn() as conn:
        if not dry_run:
            conn.autocommit = True
        with conn.cursor() as cur:
            for index, item in enumerate(items):
                # Skip trashed items early (before building the item).
                try:
                    raw_state = int(item.get("state", 0))
                except (TypeError, ValueError):
                    raw_state = 0
                if raw_state in _SKIP_STATES:
                    totals["skipped"] += 1
                    if on_progress:
                        on_progress(index + 1, dict(totals))
                    continue

                try:
                    canonical_id, item_data, bucket, created_dt, updated_dt, completed_dt = (
                        _build_nirvana_item(
                            item,
                            state_map=state_map,
                            default_bucket=default_bucket,
                            source=source,
                            project_children=project_children,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    totals["errors"] += 1
                    if len(sample_errors) < 5:
                        sample_errors.append(f"item[{index}] {exc}")
                    if on_progress:
                        on_progress(index + 1, dict(totals))
                    continue

                if completed_dt and not include_completed:
                    totals["skipped"] += 1
                    if on_progress:
                        on_progress(index + 1, dict(totals))
                    continue

                content_hash = _hash_payload(item_data)

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
                    if completed_dt:
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
                            jsonb(item_data),
                            source,
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
                    if completed_dt:
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
                            jsonb(item_data),
                            source,
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
                    if completed_dt:
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
