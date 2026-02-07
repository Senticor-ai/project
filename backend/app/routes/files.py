from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..db import db_conn
from ..deps import get_current_org, get_current_user
from ..idempotency import (
    compute_request_hash,
    get_idempotent_response,
    store_idempotent_response,
)
from ..models import (
    FileCompleteRequest,
    FileInitiateRequest,
    FileInitiateResponse,
    FileMetaResponse,
    FileRecord,
    SearchIndexStatusResponse,
)
from ..outbox import enqueue_event
from ..search.jobs import enqueue_job, get_job, serialize_job
from ..storage import get_storage

router = APIRouter(prefix="/files", tags=["files"], dependencies=[Depends(get_current_user)])


@router.post(
    "/initiate",
    response_model=FileInitiateResponse,
    summary="Initiate a chunked upload",
    description="Returns an upload URL and chunk sizing for resumable uploads.",
    status_code=status.HTTP_201_CREATED,
)
def initiate_upload(
    payload: FileInitiateRequest,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        description="Idempotency key for safe retries.",
    ),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    if idempotency_key:
        request_hash = compute_request_hash("POST", "/files/initiate", payload.model_dump())
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached:
            return JSONResponse(
                content=cached["response"],
                status_code=cached["status_code"],
            )

    storage = get_storage()
    chunk_size = settings.upload_chunk_size
    chunk_total = max(1, (payload.total_size + chunk_size - 1) // chunk_size)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO file_uploads (
                    org_id,
                    owner_id,
                    filename,
                    content_type,
                    total_size,
                    chunk_size,
                    chunk_total
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING upload_id, created_at
                """,
                (
                    org_id,
                    current_user["id"],
                    payload.filename,
                    payload.content_type,
                    payload.total_size,
                    chunk_size,
                    chunk_total,
                ),
            )
            row = cur.fetchone()
        conn.commit()

    upload_id = str(row["upload_id"])
    storage.ensure_dir(f"uploads/{upload_id}")

    expires_at = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    response = FileInitiateResponse(
        upload_id=upload_id,
        upload_url=f"/files/upload/{upload_id}",
        chunk_size=chunk_size,
        chunk_total=chunk_total,
        expires_at=expires_at,
    )
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response.model_dump(),
            status.HTTP_201_CREATED,
        )
    return response


@router.put(
    "/upload/{upload_id}",
    summary="Upload a chunk",
    description="Send raw bytes with `X-Chunk-Index` and `X-Chunk-Total` headers.",
)
async def upload_chunk(
    upload_id: str,
    request: Request,
    chunk_index: int = Header(..., alias="X-Chunk-Index", description="Zero-based chunk index."),
    chunk_total: int = Header(..., alias="X-Chunk-Total", description="Total number of chunks."),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    storage = get_storage()

    if not storage.exists(f"uploads/{upload_id}"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty chunk")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT chunk_total, owner_id
                FROM file_uploads
                WHERE upload_id = %s AND org_id = %s
                """,
                (upload_id, org_id),
            )
            row = cur.fetchone()

        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

        if str(row["owner_id"]) != str(current_user["id"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

        if int(row["chunk_total"]) != int(chunk_total):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Chunk total mismatch",
            )

        if chunk_index < 0 or chunk_index >= chunk_total:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid chunk index",
            )

        storage.write(f"uploads/{upload_id}/part-{chunk_index}", body)

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE file_uploads
                SET status = 'uploading', updated_at = %s
                WHERE upload_id = %s
                """,
                (datetime.now(UTC), upload_id),
            )
        conn.commit()

    return {"received": len(body), "chunk_index": chunk_index}


@router.post(
    "/complete",
    response_model=FileRecord,
    summary="Complete a chunked upload",
    status_code=status.HTTP_201_CREATED,
)
def complete_upload(
    payload: FileCompleteRequest,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        description="Idempotency key for safe retries.",
    ),
    current_user=Depends(get_current_user),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    if idempotency_key:
        request_hash = compute_request_hash("POST", "/files/complete", payload.model_dump())
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached:
            return JSONResponse(
                content=cached["response"],
                status_code=cached["status_code"],
            )

    storage = get_storage()

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    upload_id,
                    org_id,
                    owner_id,
                    filename,
                    content_type,
                    total_size,
                    chunk_total,
                    status,
                    file_id
                FROM file_uploads
                WHERE upload_id = %s AND org_id = %s
                FOR UPDATE
                """,
                (payload.upload_id, org_id),
            )
            upload = cur.fetchone()

        if upload is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

        if str(upload["owner_id"]) != str(current_user["id"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

        if upload["status"] == "completed" and upload["file_id"]:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT file_id, original_name, content_type, size_bytes, sha256, created_at
                    FROM files
                    WHERE file_id = %s AND org_id = %s
                    """,
                    (upload["file_id"], org_id),
                )
                file_row = cur.fetchone()

            if file_row:
                response = FileRecord(
                    file_id=str(file_row["file_id"]),
                    original_name=file_row["original_name"],
                    content_type=file_row["content_type"],
                    size_bytes=file_row["size_bytes"],
                    sha256=file_row["sha256"],
                    created_at=file_row["created_at"].isoformat(),
                    download_url=f"/files/{file_row['file_id']}",
                )
                if idempotency_key:
                    store_idempotent_response(
                        org_id,
                        idempotency_key,
                        request_hash,
                        response.model_dump(),
                        status.HTTP_200_OK,
                    )
                return JSONResponse(
                    content=response.model_dump(),
                    status_code=status.HTTP_200_OK,
                )

        upload_prefix = f"uploads/{upload['upload_id']}"
        if not storage.exists(upload_prefix):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Upload parts missing",
            )

        chunk_total = int(upload["chunk_total"])
        missing = [
            i for i in range(chunk_total)
            if not storage.exists(f"{upload_prefix}/part-{i}")
        ]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Missing chunks: {missing}",
            )

        part_keys = [f"{upload_prefix}/part-{i}" for i in range(chunk_total)]
        target_key = f"files/{payload.upload_id}"
        size_bytes, digest = storage.concatenate(part_keys, target_key)

        if size_bytes != int(upload["total_size"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Uploaded size mismatch",
            )

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO files (
                    org_id,
                    owner_id,
                    original_name,
                    content_type,
                    size_bytes,
                    sha256,
                    storage_path
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING file_id, created_at
                """,
                (
                    org_id,
                    current_user["id"],
                    upload["filename"],
                    upload["content_type"],
                    size_bytes,
                    digest,
                    target_key,
                ),
            )
            file_row = cur.fetchone()

            cur.execute(
                """
                UPDATE file_uploads
                SET status = 'completed', updated_at = %s, file_id = %s
                WHERE upload_id = %s
                """,
                (datetime.now(UTC), file_row["file_id"], payload.upload_id),
            )

        conn.commit()

    enqueue_job(
        org_id=org_id,
        entity_type="file",
        entity_id=str(file_row["file_id"]),
        action="upsert",
        requested_by_user_id=str(current_user["id"]),
    )
    enqueue_event("file_uploaded", {"file_id": str(file_row["file_id"]), "org_id": org_id})

    storage.delete_prefix(upload_prefix)

    response = FileRecord(
        file_id=str(file_row["file_id"]),
        original_name=upload["filename"],
        content_type=upload["content_type"],
        size_bytes=size_bytes,
        sha256=digest,
        created_at=file_row["created_at"].isoformat(),
        download_url=f"/files/{file_row['file_id']}",
    )
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            response.model_dump(),
            status.HTTP_200_OK,
        )

    return response


@router.get("/{file_id}", summary="Download a file")
def get_file(
    file_id: str,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
        description="Use ETag from a previous response to revalidate.",
    ),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
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

    etag = f'"{row["sha256"]}"'
    last_modified = row["created_at"].isoformat()
    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Last-Modified": last_modified},
        )

    storage = get_storage()
    return storage.get_file_response(
        row["storage_path"],
        media_type=row["content_type"] or "application/octet-stream",
        filename=row["original_name"],
        headers={
            "ETag": etag,
            "Last-Modified": last_modified,
            "Content-Length": str(row["size_bytes"]),
        },
    )


@router.get(
    "/{file_id}/meta",
    response_model=FileMetaResponse,
    summary="Get file metadata",
    description="Lightweight metadata response for sync without downloading file content.",
)
def get_file_meta(
    file_id: str,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
        description="Use ETag from a previous response to revalidate.",
    ),
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT org_id, owner_id, original_name, content_type, size_bytes, sha256, created_at
                FROM files
                WHERE file_id = %s AND org_id = %s
                """,
                (file_id, org_id),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    etag = f'"{row["sha256"]}"'
    last_modified = row["created_at"].isoformat()
    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Last-Modified": last_modified},
        )

    response = FileMetaResponse(
        file_id=file_id,
        original_name=row["original_name"],
        content_type=row["content_type"],
        size_bytes=row["size_bytes"],
        sha256=row["sha256"],
        created_at=row["created_at"].isoformat(),
        download_url=f"/files/{file_id}",
    )

    return JSONResponse(
        content=response.model_dump(),
        headers={"ETag": etag, "Last-Modified": last_modified},
    )


@router.get(
    "/{file_id}/index-status",
    response_model=SearchIndexStatusResponse,
    summary="Get file search indexing status",
)
def get_file_index_status(
    file_id: str,
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    job = get_job(org_id, "file", file_id)
    payload = serialize_job(job, "file", file_id, org_id)
    return JSONResponse(content=payload)
