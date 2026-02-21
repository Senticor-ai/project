from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, status
from fastapi.responses import JSONResponse

from ...db import db_conn, jsonb
from ...deps import get_current_org, get_current_user
from ...models import (
    ImportJobResponse,
    NativeImportFromFileRequest,
    NativeImportInspectRequest,
)
from ...observability import get_logger
from ...outbox import enqueue_event
from ..shared import (
    _build_job_response,
    _fail_stale_queued_jobs,
    _get_file_row,
    _hash_payload,
    _load_items_from_file,
)
from .orchestrator import run_native_import

native_router = APIRouter()
logger = get_logger("imports.native")


@native_router.post(
    "/native/inspect",
    response_model=ImportJobResponse,
    summary="Validate native TAY import file",
    description="Parses an uploaded project JSON export and returns a dry-run import summary.",
)
def inspect_native(
    payload: NativeImportInspectRequest = Body(...),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    file_row = _get_file_row(payload.file_id, current_org["org_id"])
    items = _load_items_from_file(file_row)
    summary = run_native_import(
        items,
        org_id=current_org["org_id"],
        user_id=current_user["id"],
        source=payload.source,
        dry_run=True,
        update_existing=payload.update_existing,
        include_completed=payload.include_completed,
        emit_events=False,
    )
    return JSONResponse(content=summary.model_dump())


@native_router.post(
    "/native/from-file",
    response_model=ImportJobResponse,
    summary="Queue native TAY import job from file",
    description="Queues an async import job for a previously uploaded project JSON export.",
    status_code=status.HTTP_202_ACCEPTED,
)
def import_native_from_file(
    payload: NativeImportFromFileRequest = Body(...),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    file_row = _get_file_row(payload.file_id, org_id)

    options = {
        "update_existing": payload.update_existing,
        "include_completed": payload.include_completed,
        "emit_events": payload.emit_events,
    }

    lock_token = (
        f"native-import:{org_id}:{file_row['file_id']}:{payload.source}:{_hash_payload(options)}"
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
                    "native_import_job",
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
