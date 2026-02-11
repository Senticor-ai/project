from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status

from ..config import settings
from ..db import db_conn, jsonb
from ..models import ImportJobResponse
from ..observability import get_logger
from ..storage import get_storage

logger = get_logger("imports")

_SCHEMA_VERSION = 2
_SOURCE_METADATA_SCHEMA_VERSION = 1

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


def _load_items_from_file(file_row: dict) -> list[dict]:
    storage = get_storage()
    storage_key = file_row.get("storage_path") or ""
    if not storage.exists(storage_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    try:
        raw = storage.read_text(storage_key, encoding="utf-8")
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
        file_sha256=row.get("file_sha256"),
        source=row["source"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row.get("started_at"),
        finished_at=row.get("finished_at"),
        summary=row.get("summary"),
        progress=row.get("progress"),
        error=row.get("error"),
        archived_at=row.get("archived_at"),
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
        WHERE {" AND ".join(clauses)}
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
