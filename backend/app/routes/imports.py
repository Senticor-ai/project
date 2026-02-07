from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..models import (
    ImportJobResponse,
    ImportJobStatus,
    NirvanaImportFromFileRequest,
    NirvanaImportInspectRequest,
    NirvanaImportRequest,
    NirvanaImportSummary,
)
from ..observability import get_logger
from ..outbox import enqueue_event

router = APIRouter(
    prefix="/imports",
    tags=["imports"],
    dependencies=[Depends(get_current_user)],
)
logger = get_logger("imports")

_SCHEMA_VERSION = 2
_SOURCE_METADATA_SCHEMA_VERSION = 1
_TYPE_MAP = {
    "inbox": "Thing",
    "action": "Action",
    "project": "Project",
    "reference": "CreativeWork",
}

_DEFAULT_STATE_BUCKET_MAP = {
    0: "inbox",
    1: "next",
    2: "waiting",
    3: "calendar",
    4: "someday",
    7: "next",
    9: "calendar",
}

_IMPORT_JOB_STALE_ERROR = "Import job timed out in queue; worker appears unavailable"

_IMPORT_JOB_EXAMPLE_RUNNING = {
    "job_id": "2851209e-3a01-4684-8fae-dd27db05e0aa",
    "status": "running",
    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
    "source": "nirvana",
    "created_at": "2026-02-07T11:14:42.778617Z",
    "updated_at": "2026-02-07T11:14:43.101903Z",
    "started_at": "2026-02-07T11:14:43.101820Z",
    "finished_at": None,
    "summary": None,
    "error": None,
}
_IMPORT_JOB_EXAMPLE_COMPLETED = {
    "job_id": "2851209e-3a01-4684-8fae-dd27db05e0aa",
    "status": "completed",
    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
    "source": "nirvana",
    "created_at": "2026-02-07T11:14:42.778617Z",
    "updated_at": "2026-02-07T11:14:44.190500Z",
    "started_at": "2026-02-07T11:14:43.101820Z",
    "finished_at": "2026-02-07T11:14:44.190499Z",
    "summary": {
        "total": 7,
        "created": 7,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "bucket_counts": {
            "project": 1,
            "next": 1,
            "waiting": 1,
            "calendar": 2,
            "someday": 1,
            "inbox": 1,
        },
        "sample_errors": [],
    },
    "error": None,
}


def _hash_payload(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _canonical_id(entity_type: str, raw_id: str) -> str:
    return f"urn:app:{entity_type}:{raw_id}"


def _parse_epoch(value) -> datetime | None:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except Exception:  # noqa: BLE001
        return None


def _parse_yyyymmdd(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if len(raw) != 8 or not raw.isdigit():
        return None
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"


def _parse_tags(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _energy_level(value) -> str | None:
    mapping = {1: "low", 2: "medium", 3: "high"}
    try:
        return mapping.get(int(value))
    except Exception:  # noqa: BLE001
        return None


def _time_estimate(minutes) -> str | None:
    try:
        minutes = int(minutes)
    except Exception:  # noqa: BLE001
        return None
    mapping = {
        5: "5min",
        10: "15min",
        15: "15min",
        30: "30min",
        60: "1hr",
        120: "2hr",
        240: "half-day",
        480: "full-day",
    }
    return mapping.get(minutes)


def _parse_recurrence(raw: str | dict | None) -> dict | None:
    if not raw:
        return None
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception:  # noqa: BLE001
            return None
    if not isinstance(data, dict):
        return None

    freq = data.get("freq")
    try:
        interval = int(data.get("interval", 1))
    except Exception:  # noqa: BLE001
        interval = 1

    if freq == "daily":
        return {"kind": "daily", "interval": interval}

    if freq == "weekly":
        on = data.get("on") or {}
        day_map = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
        days: list[int] = []
        if isinstance(on, dict):
            for value in on.values():
                if isinstance(value, str):
                    day = day_map.get(value.lower())
                    if day is not None:
                        days.append(day)
        return {"kind": "weekly", "interval": interval, "daysOfWeek": sorted(set(days))}

    if freq == "monthly":
        on = data.get("on") or {}
        day_of_month = None
        if isinstance(on, dict):
            for value in on.values():
                if isinstance(value, dict):
                    nth = value.get("nth")
                    if nth is not None:
                        try:
                            day_of_month = int(nth)
                        except Exception:  # noqa: BLE001
                            day_of_month = None
                if day_of_month:
                    break
        if not day_of_month:
            day_of_month = 1
        return {"kind": "monthly", "interval": interval, "dayOfMonth": day_of_month}

    if freq == "yearly":
        try:
            month = int(data.get("month", 1))
            day = int(data.get("day", 1))
        except Exception:  # noqa: BLE001
            month, day = 1, 1
        return {"kind": "yearly", "interval": interval, "month": month, "day": day}

    return None


def _pv(property_id: str, value: object) -> dict:
    return {
        "@type": "PropertyValue",
        "propertyID": property_id,
        "value": value,
    }


def _build_base_entity(
    *,
    canonical_id: str,
    name: str,
    description: str | None,
    keywords: list[str],
    created_at: datetime,
    updated_at: datetime,
    source: str,
    ports: list[dict],
    source_metadata: dict | None = None,
) -> dict:
    entity: dict = {
        "@id": canonical_id,
        "_schemaVersion": _SCHEMA_VERSION,
        "name": name,
        "description": description or None,
        "keywords": keywords,
        "dateCreated": created_at.isoformat(),
        "dateModified": updated_at.isoformat(),
        "additionalProperty": [
            _pv("app:captureSource", {"kind": "import", "source": source}),
            _pv("app:provenanceHistory", []),
            _pv("app:needsEnrichment", False),
            _pv("app:confidence", "medium"),
            _pv("app:ports", ports),
            _pv("app:typedReferences", []),
        ],
    }
    if source_metadata:
        entity["sourceMetadata"] = source_metadata
    return entity


def _build_nirvana_source_metadata(
    *,
    source: str,
    raw_id: str,
    type_value: int,
    state_value: int,
    raw_item: dict,
) -> dict:
    # Keep complete source payload for high-fidelity imports and future remapping.
    return {
        "schemaVersion": _SOURCE_METADATA_SCHEMA_VERSION,
        "provider": source,
        "rawId": raw_id,
        "rawType": type_value,
        "rawState": state_value,
        "raw": raw_item,
    }


def _build_ports(energy, etime) -> list[dict]:
    energy_level = _energy_level(energy)
    time_estimate = _time_estimate(etime)
    if not energy_level and not time_estimate:
        return []
    port = {"kind": "computation"}
    if energy_level:
        port["energyLevel"] = energy_level
    if time_estimate:
        port["timeEstimate"] = time_estimate
    return [port]


def _derive_bucket(state: int | None, state_map: dict[int, str], default_bucket: str) -> str:
    if state is None:
        return default_bucket
    return state_map.get(state, default_bucket)


def _normalize_state_bucket_map(state_bucket_map: dict | None) -> dict[int, str]:
    if not state_bucket_map:
        return {}
    normalized: dict[int, str] = {}
    for raw_key, raw_bucket in state_bucket_map.items():
        try:
            key = int(raw_key)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(raw_bucket, str):
            continue
        bucket = raw_bucket.strip()
        if bucket:
            normalized[key] = bucket
    return normalized


def _build_nirvana_thing(
    item: dict,
    *,
    state_map: dict[int, str],
    default_bucket: str,
    source: str,
    project_children: dict[str, list[str]],
) -> tuple[str, dict, str, datetime, datetime, datetime | None]:
    raw_id = str(item.get("id") or "").strip()
    if not raw_id:
        raise ValueError("missing id")

    title = str(item.get("name") or "").strip()
    if not title:
        raise ValueError("missing name")

    try:
        type_value = int(item.get("type", 0))
    except Exception:  # noqa: BLE001
        type_value = 0

    try:
        state_value = int(item.get("state", 0))
    except Exception:  # noqa: BLE001
        state_value = 0

    created_dt = _parse_epoch(item.get("created")) or datetime.now(UTC)
    updated_dt = _parse_epoch(item.get("updated")) or created_dt
    completed_dt = _parse_epoch(item.get("completed"))

    tags = _parse_tags(item.get("tags"))
    notes = item.get("note") or None
    ports = _build_ports(item.get("energy"), item.get("etime"))
    bucket = _derive_bucket(state_value, state_map, default_bucket)
    source_metadata = _build_nirvana_source_metadata(
        source=source,
        raw_id=raw_id,
        type_value=type_value,
        state_value=state_value,
        raw_item=item,
    )

    focus_order_raw = item.get("seqt")
    try:
        focus_order = int(focus_order_raw) if focus_order_raw is not None else 0
    except Exception:  # noqa: BLE001
        focus_order = 0

    is_focused = focus_order > 0
    if bucket == "focus":
        bucket = "next"
        is_focused = True

    if type_value == 1:
        canonical_id = _canonical_id("project", raw_id)
        action_ids = [
            _canonical_id("action", child_id)
            for child_id in project_children.get(raw_id, [])
            if child_id
        ]
        project_status = "active"
        if completed_dt:
            project_status = "completed"
        elif item.get("deleted") or item.get("cancelled"):
            project_status = "archived"
        desired_outcome = notes or ""
        thing = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        thing["@type"] = _TYPE_MAP["project"]
        thing["endDate"] = (
            completed_dt.isoformat() if completed_dt else None
        )
        thing["hasPart"] = [{"@id": aid} for aid in action_ids]
        thing["additionalProperty"].extend([
            _pv("app:bucket", "project"),
            _pv("app:desiredOutcome", desired_outcome),
            _pv("app:projectStatus", project_status),
            _pv("app:isFocused", is_focused),
            _pv("app:reviewDate", None),
        ])
        return canonical_id, thing, "project", created_dt, updated_dt, completed_dt

    if bucket == "inbox":
        canonical_id = _canonical_id("inbox", raw_id)
        thing = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        thing["@type"] = _TYPE_MAP["inbox"]
        thing["additionalProperty"].extend([
            _pv("app:bucket", "inbox"),
            _pv("app:rawCapture", notes or title),
            _pv("app:contexts", []),
            _pv("app:isFocused", False),
        ])
        return canonical_id, thing, "inbox", created_dt, updated_dt, completed_dt

    if bucket == "reference":
        canonical_id = _canonical_id("reference", raw_id)
        thing = _build_base_entity(
            canonical_id=canonical_id,
            name=title,
            description=notes,
            keywords=tags,
            created_at=created_dt,
            updated_at=updated_dt,
            source=source,
            ports=ports,
            source_metadata=source_metadata,
        )
        thing["@type"] = _TYPE_MAP["reference"]
        thing["url"] = None
        thing["encodingFormat"] = None
        thing["additionalProperty"].extend([
            _pv("app:bucket", "reference"),
            _pv("app:origin", "captured"),
        ])
        return canonical_id, thing, "reference", created_dt, updated_dt, completed_dt

    canonical_id = _canonical_id("action", raw_id)
    project_id = str(item.get("parentid") or "").strip() or None
    if project_id:
        project_id = _canonical_id("project", project_id)

    due_date = _parse_yyyymmdd(item.get("duedate"))
    start_date = _parse_yyyymmdd(item.get("startdate"))
    recurrence = _parse_recurrence(item.get("recurring"))
    if not start_date and recurrence:
        next_date = None
        if isinstance(item.get("recurring"), str):
            try:
                next_date = json.loads(item.get("recurring", "")).get("nextdate")
            except Exception:  # noqa: BLE001
                next_date = None
        start_date = _parse_yyyymmdd(next_date) or start_date

    if bucket == "calendar":
        if not start_date and due_date:
            start_date = due_date
        if not due_date and start_date:
            # Calendar items should always carry a date visible to date-centric UI lists.
            due_date = start_date

    seq_raw = item.get("seq")
    try:
        sequence_order = int(seq_raw) if seq_raw is not None else None
    except Exception:  # noqa: BLE001
        sequence_order = None
    if sequence_order == 0:
        sequence_order = None

    delegated_to = str(item.get("waitingfor") or "").strip() or None

    thing = _build_base_entity(
        canonical_id=canonical_id,
        name=title,
        description=notes,
        keywords=tags,
        created_at=created_dt,
        updated_at=updated_dt,
        source=source,
        ports=ports,
        source_metadata=source_metadata,
    )
    thing["@type"] = _TYPE_MAP["action"]
    thing["startDate"] = start_date
    thing["endDate"] = (
        completed_dt.isoformat() if completed_dt else None
    )
    if project_id:
        thing["isPartOf"] = {"@id": project_id}
    thing["additionalProperty"].extend([
        _pv("app:bucket", bucket),
        _pv("app:contexts", []),
        _pv("app:delegatedTo", delegated_to),
        _pv("app:dueDate", due_date),
        _pv("app:startDate", start_date),
        _pv("app:scheduledTime", None),
        _pv("app:isFocused", is_focused),
        _pv("app:recurrence", recurrence),
        _pv("app:sequenceOrder", sequence_order),
    ])

    return canonical_id, thing, bucket, created_dt, updated_dt, completed_dt


def _load_items_from_file(file_row: dict) -> list[dict]:
    storage_path = Path(file_row.get("storage_path") or "")
    if not storage_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    try:
        raw = storage_path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read file",
        ) from exc
    try:
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON file",
        ) from exc
    if isinstance(data, dict):
        data = data.get("items") or data.get("data") or data.get("export")
    if not isinstance(data, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JSON export must be a list of items",
        )
    return data


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
) -> NirvanaImportSummary:
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
        if not include_completed and _parse_epoch(item.get("completed")):
            continue
        project_children.setdefault(parent_id, []).append(child_id)

    totals: Counter[str] = Counter()
    bucket_counts: Counter[str] = Counter()
    sample_errors: list[str] = []

    with db_conn() as conn:
        if not dry_run:
            conn.autocommit = True
        with conn.cursor() as cur:
            for index, item in enumerate(items):
                try:
                    canonical_id, thing, bucket, created_dt, updated_dt, completed_dt = (
                        _build_nirvana_thing(
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
                    continue

                if completed_dt and not include_completed:
                    totals["skipped"] += 1
                    continue

                content_hash = _hash_payload(thing)

                if dry_run:
                    cur.execute(
                        """
                        SELECT 1
                        FROM things
                        WHERE org_id = %s AND canonical_id = %s
                        """,
                        (org_id, canonical_id),
                    )
                    exists = cur.fetchone() is not None
                    if exists and not update_existing:
                        totals["skipped"] += 1
                        continue
                    if exists:
                        totals["updated"] += 1
                    else:
                        totals["created"] += 1
                    bucket_counts[bucket] += 1
                    continue

                if update_existing:
                    cur.execute(
                        """
                        INSERT INTO things (
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
                        RETURNING thing_id, (xmax = 0) AS inserted
                        """,
                        (
                            org_id,
                            user_id,
                            canonical_id,
                            jsonb(thing),
                            source,
                            content_hash,
                            created_dt,
                            updated_dt,
                        ),
                    )
                    row = cur.fetchone()
                    inserted = bool(row and row.get("inserted"))
                    if inserted:
                        totals["created"] += 1
                    else:
                        totals["updated"] += 1
                    bucket_counts[bucket] += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO things (
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
                        RETURNING thing_id
                        """,
                        (
                            org_id,
                            user_id,
                            canonical_id,
                            jsonb(thing),
                            source,
                            content_hash,
                            created_dt,
                            updated_dt,
                        ),
                    )
                    row = cur.fetchone()
                    if row is None:
                        totals["skipped"] += 1
                        continue
                    totals["created"] += 1
                    bucket_counts[bucket] += 1

                if emit_events and row:
                    enqueue_event(
                        "thing_upserted",
                        {"thing_id": str(row["thing_id"]), "org_id": org_id},
                    )

    return NirvanaImportSummary(
        total=len(items),
        created=totals["created"],
        updated=totals["updated"],
        skipped=totals["skipped"],
        errors=totals["errors"],
        bucket_counts=dict(bucket_counts),
        sample_errors=sample_errors,
    )


def _get_file_row(file_id: str, org_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    file_id,
                    org_id,
                    owner_id,
                    original_name,
                    content_type,
                    size_bytes,
                    sha256,
                    storage_path,
                    created_at
                FROM files
                WHERE file_id = %s AND org_id = %s
                """,
                (file_id, org_id),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return row


def _build_job_response(row: dict) -> ImportJobResponse:
    return ImportJobResponse(
        job_id=str(row["job_id"]),
        status=row["status"],
        file_id=str(row["file_id"]),
        source=row["source"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row.get("started_at"),
        finished_at=row.get("finished_at"),
        summary=row.get("summary"),
        error=row.get("error"),
    )


def _queue_timeout_cutoff() -> datetime:
    timeout_seconds = max(0, settings.import_job_queue_timeout_seconds)
    return datetime.now(UTC) - timedelta(seconds=timeout_seconds)


def _fail_stale_queued_jobs(
    *,
    org_id: str,
    conn=None,
    file_id: str | None = None,
    source: str | None = None,
    options: dict | None = None,
) -> int:
    if settings.import_job_queue_timeout_seconds <= 0:
        return 0

    clauses = [
        "org_id = %s",
        "status = 'queued'",
        "created_at <= %s",
    ]
    params: list = [org_id, _queue_timeout_cutoff()]
    if file_id:
        clauses.append("file_id = %s")
        params.append(file_id)
    if source:
        clauses.append("source = %s")
        params.append(source)
    if options is not None:
        clauses.append("options = %s")
        params.append(jsonb(options))

    sql = f"""
        UPDATE import_jobs
        SET status = 'failed',
            error = %s,
            finished_at = %s,
            updated_at = %s
        WHERE {' AND '.join(clauses)}
    """
    now = datetime.now(UTC)
    final_params = [_IMPORT_JOB_STALE_ERROR, now, now, *params]

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(sql, final_params)
            updated = cur.rowcount
        if updated:
            logger.warning(
                "import_jobs.marked_stale_failed",
                count=updated,
                org_id=org_id,
                file_id=file_id,
                source=source,
            )
        return updated

    with db_conn() as local_conn:
        with local_conn.cursor() as cur:
            cur.execute(sql, final_params)
            updated = cur.rowcount
        local_conn.commit()
    if updated:
        logger.warning(
            "import_jobs.marked_stale_failed",
            count=updated,
            org_id=org_id,
            file_id=file_id,
            source=source,
        )
    return updated


@router.post(
    "/nirvana",
    response_model=NirvanaImportSummary,
    summary="Bulk import Nirvana export",
    description=(
        "Accepts a NirvanaHQ JSON export payload and upserts items into the GTD store. "
        "Use dry_run=true for validate-only imports and custom state-to-bucket mappings "
        "for client-side tuning. Imported things also include `thing.sourceMetadata` "
        "with raw Nirvana payload fields for high-fidelity round-tripping."
    ),
)
def import_nirvana(
    payload: NirvanaImportRequest = Body(
        ...,
        openapi_examples={
            "validate_only": {
                "summary": "Validate-only (dry run)",
                "value": {
                    "items": [
                        {
                            "id": "PROJ-123",
                            "type": 1,
                            "state": 1,
                            "name": "Website Relaunch",
                            "note": "Launch new marketing site",
                            "tags": ",Work,",
                            "created": 1738600000,
                            "updated": 1738603600,
                            "completed": 0,
                            "parentid": "",
                            "duedate": "",
                            "startdate": "",
                            "waitingfor": "",
                            "energy": 0,
                            "etime": 0,
                            "recurring": "",
                            "reminder": "",
                            "seq": 0,
                            "seqp": 0,
                            "seqt": 0,
                            "ps": 0,
                            "cancelled": 0,
                            "deleted": 0,
                        },
                        {
                            "id": "TASK-001",
                            "type": 0,
                            "state": 1,
                            "name": "Draft homepage copy",
                            "note": "",
                            "tags": ",Work,Copy,",
                            "created": 1738601000,
                            "updated": 1738604600,
                            "completed": 0,
                            "parentid": "PROJ-123",
                            "duedate": "20260215",
                            "startdate": "",
                            "waitingfor": "",
                            "energy": 2,
                            "etime": 60,
                            "recurring": "",
                            "reminder": "",
                            "seq": 1,
                            "seqp": 0,
                            "seqt": 0,
                            "ps": 0,
                            "cancelled": 0,
                            "deleted": 0,
                        },
                    ],
                    "source": "nirvana",
                    "dry_run": True,
                    "update_existing": True,
                    "include_completed": False,
                    "emit_events": False,
                    "state_bucket_map": {
                        "0": "inbox",
                        "1": "next",
                        "2": "waiting",
                        "3": "calendar",
                        "4": "someday",
                        "7": "next",
                        "9": "calendar",
                    },
                    "default_bucket": "inbox",
                },
            },
            "import_full": {
                "summary": "Full import",
                "value": {
                    "items": [
                        {
                            "id": "TASK-002",
                            "type": 0,
                            "state": 2,
                            "name": "Receive final design",
                            "note": "",
                            "tags": ",Work,",
                            "created": 1738602000,
                            "updated": 1738605600,
                            "completed": 0,
                            "parentid": "PROJ-123",
                            "duedate": "",
                            "startdate": "",
                            "waitingfor": "Design team",
                            "energy": 1,
                            "etime": 15,
                            "recurring": "",
                            "reminder": "",
                            "seq": 0,
                            "seqp": 0,
                            "seqt": 0,
                            "ps": 0,
                            "cancelled": 0,
                            "deleted": 0,
                        }
                    ],
                    "source": "nirvana",
                    "dry_run": False,
                    "update_existing": True,
                    "include_completed": True,
                    "emit_events": True,
                },
            },
        },
    ),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    summary = run_nirvana_import(
        payload.items,
        org_id=current_org["org_id"],
        user_id=current_user["id"],
        source=payload.source,
        dry_run=payload.dry_run,
        update_existing=payload.update_existing,
        include_completed=payload.include_completed,
        emit_events=payload.emit_events,
        state_bucket_map=payload.state_bucket_map,
        default_bucket=payload.default_bucket,
    )

    return JSONResponse(content=summary.model_dump())


@router.post(
    "/nirvana/inspect",
    response_model=NirvanaImportSummary,
    summary="Validate Nirvana import file",
    description="Parses the uploaded JSON file and returns a dry-run import summary.",
)
def inspect_nirvana(
    payload: NirvanaImportInspectRequest = Body(
        ...,
        openapi_examples={
            "inspect": {
                "summary": "Validate-only via file_id",
                "value": {
                    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
                    "include_completed": False,
                    "update_existing": True,
                    "state_bucket_map": {
                        "0": "inbox",
                        "1": "next",
                        "2": "waiting",
                        "3": "calendar",
                        "4": "someday",
                        "7": "next",
                        "9": "calendar",
                    },
                    "default_bucket": "inbox",
                },
            }
        },
    ),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    file_row = _get_file_row(payload.file_id, current_org["org_id"])
    items = _load_items_from_file(file_row)
    summary = run_nirvana_import(
        items,
        org_id=current_org["org_id"],
        user_id=current_user["id"],
        source=payload.source,
        dry_run=True,
        update_existing=payload.update_existing,
        include_completed=payload.include_completed,
        emit_events=False,
        state_bucket_map=payload.state_bucket_map,
        default_bucket=payload.default_bucket,
    )
    return JSONResponse(content=summary.model_dump())


@router.post(
    "/nirvana/from-file",
    response_model=ImportJobResponse,
    summary="Queue Nirvana import job from file",
    description="Queues an async import job for a previously uploaded Nirvana JSON export.",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        202: {
            "description": "Import job queued or existing active job reused.",
            "content": {
                "application/json": {
                    "examples": {
                        "queued": {
                            "summary": "New queued job",
                            "value": {
                                "job_id": "2851209e-3a01-4684-8fae-dd27db05e0aa",
                                "status": "queued",
                                "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
                                "source": "nirvana",
                                "created_at": "2026-02-07T11:14:42.778617Z",
                                "updated_at": "2026-02-07T11:14:42.778617Z",
                                "started_at": None,
                                "finished_at": None,
                                "summary": None,
                                "error": None,
                            },
                        },
                        "reused": {
                            "summary": "Existing running job reused",
                            "value": _IMPORT_JOB_EXAMPLE_RUNNING,
                        },
                    }
                }
            },
        },
        404: {
            "description": "File not found in active org",
            "content": {"application/json": {"example": {"detail": "File not found"}}},
        },
    },
)
def import_nirvana_from_file(
    payload: NirvanaImportFromFileRequest = Body(
        ...,
        openapi_examples={
            "queue": {
                "summary": "Queue async import",
                "value": {
                    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
                    "include_completed": True,
                    "update_existing": True,
                    "emit_events": True,
                },
            }
        },
    ),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    file_row = _get_file_row(payload.file_id, org_id)

    options = {
        "update_existing": payload.update_existing,
        "include_completed": payload.include_completed,
        "emit_events": payload.emit_events,
        "state_bucket_map": payload.state_bucket_map,
        "default_bucket": payload.default_bucket,
    }

    lock_token = (
        f"nirvana-import:{org_id}:{file_row['file_id']}:{payload.source}:{_hash_payload(options)}"
    )
    enqueue_import = False

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (lock_token,))
            _fail_stale_queued_jobs(
                org_id=org_id,
                conn=conn,
                file_id=str(file_row["file_id"]),
                source=payload.source,
                options=options,
            )

            cur.execute(
                """
                SELECT
                    job_id,
                    file_id,
                    source,
                    status,
                    created_at,
                    updated_at,
                    started_at,
                    finished_at,
                    summary,
                    error
                FROM import_jobs
                WHERE org_id = %s
                  AND file_id = %s
                  AND source = %s
                  AND options = %s
                  AND status IN ('queued', 'running')
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (
                    org_id,
                    file_row["file_id"],
                    payload.source,
                    jsonb(options),
                ),
            )
            row = cur.fetchone()

            if row is None:
                cur.execute(
                    """
                    INSERT INTO import_jobs (
                        org_id,
                        owner_id,
                        file_id,
                        source,
                        status,
                        options,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING
                        job_id,
                        file_id,
                        source,
                        status,
                        created_at,
                        updated_at,
                        started_at,
                        finished_at,
                        summary,
                        error
                    """,
                    (
                        org_id,
                        current_user["id"],
                        file_row["file_id"],
                        payload.source,
                        "queued",
                        jsonb(options),
                        datetime.now(UTC),
                        datetime.now(UTC),
                    ),
                )
                row = cur.fetchone()
                enqueue_import = True

        conn.commit()

    if enqueue_import:
        logger.info(
            "import_job.queued",
            job_id=str(row["job_id"]),
            org_id=org_id,
            file_id=str(row["file_id"]),
            source=row["source"],
        )
        enqueue_event(
            "nirvana_import_job",
            {"job_id": str(row["job_id"]), "org_id": org_id},
        )
    else:
        logger.info(
            "import_job.reused_active",
            job_id=str(row["job_id"]),
            org_id=org_id,
            file_id=str(row["file_id"]),
            source=row["source"],
            status=row["status"],
        )

    response = _build_job_response(row)
    return JSONResponse(
        content=response.model_dump(mode="json"),
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.get(
    "/jobs",
    response_model=list[ImportJobResponse],
    summary="List import jobs for current user",
    description=(
        "Returns recent import jobs for the authenticated user in the active org. "
        "Use repeated `status` query parameters to filter "
        "(e.g. `?status=queued&status=running`)."
    ),
    responses={
        200: {
            "description": "Recent jobs owned by current user.",
            "content": {
                "application/json": {
                    "examples": {
                        "active_and_done": {
                            "summary": "Mixed job states",
                            "value": [
                                _IMPORT_JOB_EXAMPLE_RUNNING,
                                _IMPORT_JOB_EXAMPLE_COMPLETED,
                            ],
                        }
                    }
                }
            },
        }
    },
)
def list_import_jobs(
    statuses: list[ImportJobStatus] | None = Query(
        default=None,
        alias="status",
        description="Optional status filters. Repeat the query param to provide multiple values.",
        examples=["queued", "running"],
    ),
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    user_id = current_user["id"]
    status_filter = [value.value for value in statuses] if statuses else [
        ImportJobStatus.QUEUED.value,
        ImportJobStatus.RUNNING.value,
        ImportJobStatus.COMPLETED.value,
        ImportJobStatus.FAILED.value,
    ]

    with db_conn() as conn:
        _fail_stale_queued_jobs(org_id=org_id, conn=conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    job_id,
                    file_id,
                    source,
                    status,
                    created_at,
                    updated_at,
                    started_at,
                    finished_at,
                    summary,
                    error
                FROM import_jobs
                WHERE org_id = %s
                  AND owner_id = %s
                  AND status = ANY(%s)
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (org_id, user_id, status_filter, limit),
            )
            rows = cur.fetchall()
        conn.commit()

    logger.info(
        "import_jobs.listed",
        org_id=org_id,
        user_id=user_id,
        requested_status=status_filter,
        count=len(rows),
        limit=limit,
    )
    return [_build_job_response(row) for row in rows]


@router.get(
    "/jobs/{job_id}",
    response_model=ImportJobResponse,
    summary="Get import job status",
    description="Returns a single import job owned by the authenticated user in the active org.",
    responses={
        200: {
            "description": "Job status snapshot.",
            "content": {
                "application/json": {
                    "examples": {
                        "running": {
                            "summary": "Job in progress",
                            "value": _IMPORT_JOB_EXAMPLE_RUNNING,
                        },
                        "completed": {
                            "summary": "Job completed",
                            "value": _IMPORT_JOB_EXAMPLE_COMPLETED,
                        },
                    }
                }
            },
        },
        404: {
            "description": "Job not found (wrong id, org, or owner).",
            "content": {"application/json": {"example": {"detail": "Job not found"}}},
        },
    },
)
def get_import_job(
    job_id: str,
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    user_id = current_user["id"]
    with db_conn() as conn:
        _fail_stale_queued_jobs(org_id=org_id, conn=conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    job_id,
                    file_id,
                    source,
                    status,
                    created_at,
                    updated_at,
                    started_at,
                    finished_at,
                    summary,
                    error
                FROM import_jobs
                WHERE job_id = %s
                  AND org_id = %s
                  AND owner_id = %s
                """,
                (job_id, org_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    logger.info(
        "import_job.polled",
        job_id=str(row["job_id"]),
        org_id=org_id,
        status=row["status"],
        started_at=row["started_at"].isoformat() if row.get("started_at") else None,
        finished_at=row["finished_at"].isoformat() if row.get("finished_at") else None,
    )
    response = _build_job_response(row)
    return JSONResponse(content=response.model_dump(mode="json"))
