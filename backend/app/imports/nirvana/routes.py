from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, status
from fastapi.responses import JSONResponse

from ...db import db_conn, jsonb
from ...deps import get_current_org, get_current_user
from ...models import (
    ImportJobResponse,
    NirvanaImportFromFileRequest,
    NirvanaImportInspectRequest,
    NirvanaImportRequest,
)
from ...observability import get_logger
from ...outbox import enqueue_event
from ..shared import (
    _IMPORT_JOB_EXAMPLE_RUNNING,
    _build_job_response,
    _fail_stale_queued_jobs,
    _get_file_row,
    _hash_payload,
    _load_items_from_file,
)
from .orchestrator import run_nirvana_import

nirvana_router = APIRouter()
logger = get_logger("imports.nirvana")


@nirvana_router.post(
    "/nirvana",
    response_model=ImportJobResponse,
    summary="Bulk import Nirvana export",
    description=(
        "Accepts a NirvanaHQ JSON export payload and upserts items into the item store. "
        "Use dry_run=true for validate-only imports and custom state-to-bucket mappings "
        "for client-side tuning. Imported items also include `item.sourceMetadata` "
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


@nirvana_router.post(
    "/nirvana/inspect",
    response_model=ImportJobResponse,
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


@nirvana_router.post(
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

            if enqueue_import:
                enqueue_event(
                    "nirvana_import_job",
                    {"job_id": str(row["job_id"]), "org_id": org_id},
                    cur=cur,
                )

        conn.commit()

    if enqueue_import:
        logger.info(
            "import_job.queued",
            job_id=str(row["job_id"]),
            org_id=org_id,
            file_id=str(row["file_id"]),
            source=row["source"],
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
