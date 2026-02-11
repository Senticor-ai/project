from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..models import ImportJobResponse, ImportJobStatus
from ..observability import get_logger
from ..outbox import enqueue_event
from .native.routes import native_router
from .nirvana.routes import nirvana_router
from .shared import (
    _IMPORT_JOB_EXAMPLE_COMPLETED,
    _IMPORT_JOB_EXAMPLE_RUNNING,
    _build_job_response,
    _fail_stale_queued_jobs,
    _get_file_row,
    _hash_payload,
)

router = APIRouter(
    prefix="/imports",
    tags=["imports"],
    dependencies=[Depends(get_current_user)],
)
router.include_router(nirvana_router)
router.include_router(native_router)

logger = get_logger("imports")

_JOB_SELECT_COLS = """
    j.job_id,
    j.file_id,
    f.sha256 AS file_sha256,
    j.source,
    j.status,
    j.created_at,
    j.updated_at,
    j.started_at,
    j.finished_at,
    j.summary,
    j.progress,
    j.error,
    j.archived_at
"""


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
    status_filter = (
        [value.value for value in statuses]
        if statuses
        else [
            ImportJobStatus.QUEUED.value,
            ImportJobStatus.RUNNING.value,
            ImportJobStatus.COMPLETED.value,
            ImportJobStatus.FAILED.value,
        ]
    )

    with db_conn() as conn:
        _fail_stale_queued_jobs(org_id=org_id, conn=conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_JOB_SELECT_COLS}
                FROM import_jobs j
                LEFT JOIN files f ON f.file_id = j.file_id
                WHERE j.org_id = %s
                  AND j.owner_id = %s
                  AND j.status = ANY(%s)
                  AND j.archived_at IS NULL
                ORDER BY j.created_at DESC
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
                f"""
                SELECT {_JOB_SELECT_COLS}
                FROM import_jobs j
                LEFT JOIN files f ON f.file_id = j.file_id
                WHERE j.job_id = %s
                  AND j.org_id = %s
                  AND j.owner_id = %s
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


@router.post(
    "/jobs/{job_id}/retry",
    response_model=ImportJobResponse,
    summary="Retry a failed import job",
    description=(
        "Creates a new import job with the same file, source, and options "
        "as the failed job. Returns 409 if the job is not in 'failed' status."
    ),
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        202: {"description": "New job queued (or existing active job reused)."},
        404: {"description": "Job or original file not found."},
        409: {"description": "Job is not in 'failed' status."},
    },
)
def retry_import_job(
    job_id: str,
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    user_id = current_user["id"]

    # 1. Fetch the failed job
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT job_id, file_id, source, status, options
                FROM import_jobs
                WHERE job_id = %s AND org_id = %s AND owner_id = %s
                """,
                (job_id, org_id, user_id),
            )
            failed_job = cur.fetchone()

    if failed_job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if failed_job["status"] != "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only failed jobs can be retried (current status: {failed_job['status']})",
        )

    # 2. Verify file still exists
    file_id = str(failed_job["file_id"])
    source = failed_job["source"]
    options = failed_job["options"] or {}

    _get_file_row(file_id, org_id)  # raises 404 if gone

    # 3. Idempotent job creation (same pattern as from-file routes)
    lock_token = f"{source}-import:{org_id}:{file_id}:{source}:{_hash_payload(options)}"
    enqueue_import = False

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (lock_token,))
            _fail_stale_queued_jobs(
                org_id=org_id,
                conn=conn,
                file_id=file_id,
                source=source,
                options=options,
            )

            cur.execute(
                """
                SELECT
                    job_id, file_id, source, status,
                    created_at, updated_at, started_at, finished_at,
                    summary, progress, error, archived_at
                FROM import_jobs
                WHERE org_id = %s
                  AND file_id = %s
                  AND source = %s
                  AND options = %s
                  AND status IN ('queued', 'running')
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (org_id, file_id, source, jsonb(options)),
            )
            row = cur.fetchone()

            if row is None:
                now = datetime.now(UTC)
                cur.execute(
                    """
                    INSERT INTO import_jobs (
                        org_id, owner_id, file_id, source,
                        status, options, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING
                        job_id, file_id, source, status,
                        created_at, updated_at, started_at, finished_at,
                        summary, progress, error, archived_at
                    """,
                    (org_id, user_id, file_id, source, "queued", jsonb(options), now, now),
                )
                row = cur.fetchone()
                enqueue_import = True

            if enqueue_import:
                enqueue_event(
                    f"{source}_import_job",
                    {"job_id": str(row["job_id"]), "org_id": org_id},
                    cur=cur,
                )

        conn.commit()

    if enqueue_import:
        logger.info(
            "import_job.retried",
            original_job_id=job_id,
            new_job_id=str(row["job_id"]),
            org_id=org_id,
            file_id=file_id,
            source=source,
        )
    else:
        logger.info(
            "import_job.retry_reused_active",
            original_job_id=job_id,
            reused_job_id=str(row["job_id"]),
            org_id=org_id,
        )

    response = _build_job_response(row)
    return JSONResponse(
        content=response.model_dump(mode="json"),
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.post(
    "/jobs/{job_id}/archive",
    response_model=ImportJobResponse,
    summary="Archive an import job",
    description=(
        "Soft-deletes an import job by setting archived_at. "
        "Only completed or failed jobs can be archived."
    ),
    responses={
        200: {"description": "Job archived."},
        404: {"description": "Job not found."},
        409: {"description": "Active jobs (queued/running) cannot be archived."},
    },
)
def archive_import_job(
    job_id: str,
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    user_id = current_user["id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT job_id, status
                FROM import_jobs
                WHERE job_id = %s AND org_id = %s AND owner_id = %s
                """,
                (job_id, org_id, user_id),
            )
            job = cur.fetchone()

            if job is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
                )

            if job["status"] in ("queued", "running"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Active jobs cannot be archived",
                )

            now = datetime.now(UTC)
            cur.execute(
                """
                UPDATE import_jobs
                SET archived_at = %s, updated_at = %s
                WHERE job_id = %s
                """,
                (now, now, job_id),
            )
            cur.execute(
                f"""
                SELECT {_JOB_SELECT_COLS}
                FROM import_jobs j
                LEFT JOIN files f ON f.file_id = j.file_id
                WHERE j.job_id = %s
                """,
                (job_id,),
            )
            row = cur.fetchone()
        conn.commit()

    logger.info(
        "import_job.archived",
        job_id=job_id,
        org_id=org_id,
    )
    response = _build_job_response(row)
    return JSONResponse(content=response.model_dump(mode="json"))
