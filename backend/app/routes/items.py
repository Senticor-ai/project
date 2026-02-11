import base64
import hashlib
import json
from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse, StreamingResponse

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..idempotency import (
    compute_request_hash,
    get_idempotent_response,
    store_idempotent_response,
)
from ..metrics import APP_ITEMS_ARCHIVED_TOTAL, APP_ITEMS_CREATED_TOTAL, APP_ITEMS_UPDATED_TOTAL
from ..models import (
    ItemCreateRequest,
    ItemPatchRequest,
    ItemResponse,
    SearchIndexStatusResponse,
    SyncResponse,
)
from ..outbox import enqueue_event
from ..search.jobs import enqueue_job, get_job, serialize_job

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(get_current_user)],
)


def _hash_payload(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _build_etag(parts: list[str]) -> str:
    raw = "|".join(parts).encode("utf-8")
    return f'"{hashlib.sha256(raw).hexdigest()}"'


def _parse_since(since: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(since.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid since",
        ) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        created_raw, item_id = decoded.split("|", 1)
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        ) from exc
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return created_at, item_id


def _encode_cursor(created_at: datetime, item_id: str) -> str:
    payload = f"{created_at.isoformat()}|{item_id}"
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("utf-8")


def _build_item_response(row) -> ItemResponse:
    return ItemResponse(
        item_id=str(row["item_id"]),
        canonical_id=row["canonical_id"],
        source=row["source"],
        item=row["schema_jsonld"],
        content_hash=row["content_hash"],
        created_at=row["created_at"].isoformat(),
        updated_at=row["updated_at"].isoformat(),
    )


def _dump_response_model(payload) -> dict:
    return payload.model_dump(mode="json", by_alias=True)


def _merge_additional_property(base: list, patch: list) -> list:
    """Merge additionalProperty arrays by propertyID."""
    by_id: dict[str, dict] = {}
    for pv in base:
        if isinstance(pv, dict) and "propertyID" in pv:
            by_id[pv["propertyID"]] = pv
    for pv in patch:
        if isinstance(pv, dict) and "propertyID" in pv:
            by_id[pv["propertyID"]] = pv
    return list(by_id.values())


def _deep_merge(base: dict, patch: dict) -> dict:
    merged = dict(base)
    for key, value in patch.items():
        if key == "additionalProperty" and isinstance(value, list):
            merged[key] = _merge_additional_property(
                merged.get(key, []),
                value,
            )
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _detect_name_change(existing_jsonld: dict, patch_payload: dict) -> bool:
    """Return True if the patch changes the name field."""
    if "name" not in patch_payload:
        return False
    return patch_payload["name"] != existing_jsonld.get("name")


def _derive_name_set_by(source: str | None) -> str:
    if source is None or source == "manual":
        return "user"
    if "ai" in source.lower():
        return "ai"
    return "system"


def _derive_name_source(source: str | None, name_source_hint: str | None) -> str:
    if name_source_hint:
        return name_source_hint
    if source is None or source == "manual":
        return "user edited"
    if source == "ai-clarify":
        return "AI suggested from rawCapture"
    if source == "ai-enrich":
        return "AI enrichment"
    return source


def _apply_rename_provenance(
    merged: dict,
    old_name: str | None,
    new_name: str | None,
    source: str | None,
    name_source_hint: str | None,
) -> dict:
    """Inject app:nameProvenance and append to app:provenanceHistory."""
    now = datetime.now(UTC).isoformat()

    name_prov_entry = {
        "@type": "PropertyValue",
        "propertyID": "app:nameProvenance",
        "value": {
            "setBy": _derive_name_set_by(source),
            "setAt": now,
            "source": _derive_name_source(source, name_source_hint),
        },
    }

    additional = merged.get("additionalProperty", [])
    additional = _merge_additional_property(additional, [name_prov_entry])

    history_entry = {
        "timestamp": now,
        "action": "renamed",
        "from": old_name or "",
        "to": new_name or "",
        "note": f"via {source or 'manual'}",
    }

    history_pv = None
    for pv_item in additional:
        if isinstance(pv_item, dict) and pv_item.get("propertyID") == "app:provenanceHistory":
            history_pv = pv_item
            break

    if history_pv is not None:
        existing_history = history_pv.get("value", [])
        if not isinstance(existing_history, list):
            existing_history = []
        history_pv["value"] = existing_history + [history_entry]
    else:
        additional.append(
            {
                "@type": "PropertyValue",
                "propertyID": "app:provenanceHistory",
                "value": [history_entry],
            }
        )

    merged["additionalProperty"] = additional
    return merged


def _normalize_types(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _is_action_type(type_value: str) -> bool:
    return type_value.split(":")[-1] in {"Action", "PlanAction"}


def _get_additional_property(item: dict, property_id: str):
    """Extract a value from additionalProperty by propertyID."""
    for pv in item.get("additionalProperty", []):
        if isinstance(pv, dict) and pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def _stream_export_json(rows) -> Iterator[bytes]:
    yield b"["
    for index, row in enumerate(rows):
        if index:
            yield b",\n"
        payload = _dump_response_model(_build_item_response(row))
        yield json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    yield b"]"


def _validate_action_bucket(item: dict) -> None:
    types = _normalize_types(item.get("@type"))
    if not any(_is_action_type(t) for t in types):
        return
    bucket = _get_additional_property(item, "app:bucket")
    if not isinstance(bucket, str) or not bucket.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="app:bucket is required in additionalProperty for Action types",
        )


@router.get("/export", summary="Export all items")
def export_items(
    include_archived: bool = False,
    include_completed: bool = False,
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]

    conditions = ["org_id = %s"]
    params: list = [org_id]

    if not include_archived:
        conditions.append("archived_at IS NULL")

    if not include_completed:
        conditions.append("(schema_jsonld->>'endTime') IS NULL")

    where_clause = " AND ".join(conditions)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    item_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    content_hash,
                    created_at,
                    updated_at
                FROM items
                WHERE {where_clause}
                ORDER BY created_at ASC, item_id ASC
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    filename = f"items-export-{timestamp}.json"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(
        _stream_export_json(rows),
        media_type="application/json",
        headers=headers,
    )


@router.get(
    "",
    response_model=list[ItemResponse],
    summary="List catalog items",
    description="Supports `since` for incremental reads and ETags for caching.",
)
def list_items(
    limit: int = 50,
    offset: int = 0,
    since: str | None = None,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
        description="Use ETag from a previous response to revalidate.",
    ),
    current_org=Depends(get_current_org),
):
    since_filter = _parse_since(since) if since else None
    org_id = current_org["org_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            if since_filter:
                cur.execute(
                    """
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE archived_at IS NULL AND org_id = %s AND updated_at > %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (org_id, since_filter, limit, offset),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE archived_at IS NULL AND org_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (org_id, limit, offset),
                )
            rows = cur.fetchall()

    last_modified = (
        max(row["updated_at"] for row in rows).isoformat()
        if rows
        else datetime.now(UTC).isoformat()
    )

    etag = _build_etag(
        [str(row["content_hash"] or row["updated_at"].isoformat()) for row in rows]
        + [str(limit), str(offset), str(since_filter) if since_filter else "", str(org_id)]
    )

    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Last-Modified": last_modified},
        )

    response = [_build_item_response(row) for row in rows]
    return JSONResponse(
        content=[_dump_response_model(item) for item in response],
        headers={"ETag": etag, "Last-Modified": last_modified},
    )


@router.get(
    "/sync",
    response_model=SyncResponse,
    summary="Sync catalog items",
    description="Use `since` for time-based sync or `cursor` for pagination. ETags supported.",
)
def sync_items(
    limit: int = 50,
    since: str | None = None,
    cursor: str | None = None,
    completed: str | None = Query(
        default=None,
        description=(
            "Filter by completion status. "
            "'false' (default) = active only, "
            "'true' = completed only, "
            "'all' = both."
        ),
    ),
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
        description="Use ETag from a previous response to revalidate.",
    ),
    current_org=Depends(get_current_org),
):
    if since and cursor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use either since or cursor, not both",
        )

    # Validate and build completed filter clause
    completed_value = (completed or "false").lower()
    if completed_value == "false":
        endtime_clause = "AND (schema_jsonld->>'endTime') IS NULL"
    elif completed_value == "true":
        endtime_clause = "AND (schema_jsonld->>'endTime') IS NOT NULL"
    elif completed_value == "all":
        endtime_clause = ""
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid completed value: '{completed}'. Use 'false', 'true', or 'all'.",
        )

    since_filter = _parse_since(since) if since else None
    cursor_filter = _decode_cursor(cursor) if cursor else None
    org_id = current_org["org_id"]

    with db_conn() as conn:
        with conn.cursor() as cur:
            if cursor_filter:
                cur.execute(
                    f"""
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE archived_at IS NULL AND org_id = %s
                      {endtime_clause}
                      AND (created_at, item_id) > (%s, %s)
                    ORDER BY created_at ASC, item_id ASC
                    LIMIT %s
                    """,
                    (org_id, cursor_filter[0], cursor_filter[1], limit),
                )
            elif since_filter:
                cur.execute(
                    f"""
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE archived_at IS NULL AND org_id = %s AND updated_at > %s
                      {endtime_clause}
                    ORDER BY created_at ASC, item_id ASC
                    LIMIT %s
                    """,
                    (org_id, since_filter, limit),
                )
            else:
                cur.execute(
                    f"""
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE archived_at IS NULL AND org_id = %s
                      {endtime_clause}
                    ORDER BY created_at ASC, item_id ASC
                    LIMIT %s
                    """,
                    (org_id, limit),
                )
            rows = cur.fetchall()

    items = [_build_item_response(row) for row in rows]

    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = _encode_cursor(last["created_at"], str(last["item_id"]))

    has_more = len(rows) == limit
    server_time = datetime.now(UTC).isoformat()

    last_modified = (
        max(row["updated_at"] for row in rows).isoformat()
        if rows
        else datetime.now(UTC).isoformat()
    )

    etag = _build_etag(
        [str(row["content_hash"] or row["updated_at"].isoformat()) for row in rows]
        + [
            str(limit),
            str(since_filter) if since_filter else "",
            cursor or "",
            str(org_id),
            completed_value,
        ]
    )

    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Last-Modified": last_modified},
        )

    response = SyncResponse(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        server_time=server_time,
    )

    return JSONResponse(
        content=_dump_response_model(response),
        headers={"ETag": etag, "Last-Modified": last_modified},
    )


@router.get("/{item_id}", response_model=ItemResponse, summary="Get an item by id")
def get_item(
    item_id: str,
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
                    item_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    content_hash,
                    created_at,
                    updated_at
                FROM items
                WHERE item_id = %s AND org_id = %s AND archived_at IS NULL
                """,
                (item_id, org_id),
            )
            row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    etag = _build_etag([row["content_hash"] or row["updated_at"].isoformat()])
    last_modified = row["updated_at"].isoformat()
    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Last-Modified": last_modified},
        )

    payload = _build_item_response(row)
    return JSONResponse(
        content=_dump_response_model(payload),
        headers={"ETag": etag, "Last-Modified": last_modified},
    )


@router.get(
    "/{item_id}/index-status",
    response_model=SearchIndexStatusResponse,
    summary="Get item search indexing status",
)
def get_item_index_status(
    item_id: str,
    current_org=Depends(get_current_org),
):
    org_id = current_org["org_id"]
    job = get_job(org_id, "item", item_id)
    payload = serialize_job(job, "item", item_id, org_id)
    return JSONResponse(content=payload)


@router.patch(
    "/{item_id}",
    response_model=ItemResponse,
    summary="Update an item with deep-merge semantics",
)
def update_item(
    item_id: str,
    payload: ItemPatchRequest,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        description="Idempotency key for safe retries.",
    ),
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    if idempotency_key:
        request_payload = payload.model_dump(mode="json", by_alias=True, exclude_unset=True)
        request_hash = compute_request_hash(
            "PATCH",
            f"/items/{item_id}",
            request_payload,
        )
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached:
            return JSONResponse(
                content=cached["response"],
                status_code=cached["status_code"],
            )

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    item_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    content_hash,
                    created_at,
                    updated_at
                FROM items
                WHERE item_id = %s AND org_id = %s AND archived_at IS NULL
                """,
                (item_id, org_id),
            )
            existing = cur.fetchone()

    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    patch_payload = payload.item.model_dump(mode="json", by_alias=True, exclude_unset=True)

    if "@id" in patch_payload and patch_payload["@id"] != existing["canonical_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="@id cannot be changed")

    merged = _deep_merge(existing["schema_jsonld"], patch_payload)

    if _detect_name_change(existing["schema_jsonld"], patch_payload):
        merged = _apply_rename_provenance(
            merged,
            existing["schema_jsonld"].get("name"),
            patch_payload.get("name"),
            payload.source,
            payload.name_source,
        )

    merged_id = merged.get("@id")
    if merged_id is None:
        merged["@id"] = existing["canonical_id"]
    elif merged_id != existing["canonical_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="@id cannot be changed")

    if not merged.get("@type"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="@type is required")
    _validate_action_bucket(merged)

    content_hash = _hash_payload(merged)
    source = payload.source or existing["source"]
    updated_at = datetime.now(UTC)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET schema_jsonld = %s,
                    source = %s,
                    content_hash = %s,
                    updated_at = %s
                WHERE item_id = %s AND org_id = %s AND archived_at IS NULL
                RETURNING
                    item_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    content_hash,
                    created_at,
                    updated_at
                """,
                (jsonb(merged), source, content_hash, updated_at, item_id, org_id),
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    APP_ITEMS_UPDATED_TOTAL.inc()
    enqueue_event("item_upserted", {"item_id": str(row["item_id"]), "org_id": org_id})
    enqueue_job(
        org_id=org_id,
        entity_type="item",
        entity_id=str(row["item_id"]),
        action="upsert",
        requested_by_user_id=str(current_user["id"]),
    )

    response = _build_item_response(row)
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            _dump_response_model(response),
            status.HTTP_200_OK,
        )

    return JSONResponse(
        content=_dump_response_model(response),
        status_code=status.HTTP_200_OK,
        headers={
            "ETag": _build_etag([row["content_hash"]]),
            "Last-Modified": row["updated_at"].isoformat(),
        },
    )


@router.delete(
    "/{item_id}",
    summary="Archive an item",
)
def archive_item(
    item_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    archived_at = datetime.now(UTC)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE items
                SET archived_at = %s,
                    updated_at = %s
                WHERE item_id = %s AND org_id = %s AND archived_at IS NULL
                RETURNING item_id, archived_at
                """,
                (archived_at, archived_at, item_id, org_id),
            )
            row = cur.fetchone()

            if row is None:
                cur.execute(
                    """
                    SELECT item_id, archived_at
                    FROM items
                    WHERE item_id = %s AND org_id = %s
                    """,
                    (item_id, org_id),
                )
                existing = cur.fetchone()
            else:
                existing = None
        conn.commit()

    if row is None:
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        return {
            "item_id": str(existing["item_id"]),
            "archived_at": existing["archived_at"].isoformat(),
            "ok": True,
        }

    APP_ITEMS_ARCHIVED_TOTAL.inc()
    enqueue_event("item_archived", {"item_id": str(row["item_id"]), "org_id": org_id})
    enqueue_job(
        org_id=org_id,
        entity_type="item",
        entity_id=str(row["item_id"]),
        action="delete",
        requested_by_user_id=str(current_user["id"]),
    )

    return {
        "item_id": str(row["item_id"]),
        "archived_at": row["archived_at"].isoformat(),
        "ok": True,
    }


@router.post("", response_model=ItemResponse, summary="Create an item (idempotent)")
def create_item(
    payload: ItemCreateRequest,
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
        request_hash = compute_request_hash(
            "POST",
            "/items",
            payload.model_dump(mode="json", by_alias=True),
        )
        cached = get_idempotent_response(org_id, idempotency_key, request_hash)
        if cached:
            return JSONResponse(
                content=cached["response"],
                status_code=cached["status_code"],
            )

    item_data = payload.item.model_dump(mode="json", by_alias=True)
    canonical_id = item_data.get("@id")
    if not canonical_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="@id is required")
    if not item_data.get("@type"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="@type is required")
    _validate_action_bucket(item_data)

    content_hash = _hash_payload(item_data)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO items (
                    org_id,
                    created_by_user_id,
                    canonical_id,
                    schema_jsonld,
                    source,
                    content_hash
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (org_id, canonical_id) DO NOTHING
                RETURNING
                    item_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    content_hash,
                    created_at,
                    updated_at
                """,
                (
                    org_id,
                    current_user["id"],
                    canonical_id,
                    jsonb(item_data),
                    payload.source,
                    content_hash,
                ),
            )
            row = cur.fetchone()

            if row is None:
                cur.execute(
                    """
                    SELECT
                        item_id,
                        canonical_id,
                        source,
                        schema_jsonld,
                        content_hash,
                        created_at,
                        updated_at
                    FROM items
                    WHERE canonical_id = %s AND org_id = %s
                    """,
                    (canonical_id, org_id),
                )
                existing = cur.fetchone()
                if existing is None:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create item",
                    )

                if existing["content_hash"] == content_hash:
                    response = _build_item_response(existing)
                    if idempotency_key:
                        store_idempotent_response(
                            org_id,
                            idempotency_key,
                            request_hash,
                            _dump_response_model(response),
                            status.HTTP_200_OK,
                        )
                    return JSONResponse(
                        content=_dump_response_model(response),
                        status_code=status.HTTP_200_OK,
                        headers={
                            "ETag": _build_etag([existing["content_hash"]]),
                            "Last-Modified": existing["updated_at"].isoformat(),
                        },
                    )

                conflict_payload = {
                    "detail": "Conflict: canonical_id already exists",
                    "existing": _dump_response_model(_build_item_response(existing)),
                }
                if idempotency_key:
                    store_idempotent_response(
                        org_id,
                        idempotency_key,
                        request_hash,
                        conflict_payload,
                        status.HTTP_409_CONFLICT,
                    )
                return JSONResponse(
                    content=conflict_payload,
                    status_code=status.HTTP_409_CONFLICT,
                    headers={
                        "ETag": _build_etag([existing["content_hash"]]),
                        "Last-Modified": existing["updated_at"].isoformat(),
                    },
                )

        conn.commit()

    bucket = _get_additional_property(item_data, "app:bucket") or "unknown"
    APP_ITEMS_CREATED_TOTAL.labels(bucket=bucket).inc()
    enqueue_event("item_upserted", {"item_id": str(row["item_id"]), "org_id": org_id})

    response = _build_item_response(row)
    if idempotency_key:
        store_idempotent_response(
            org_id,
            idempotency_key,
            request_hash,
            _dump_response_model(response),
            status.HTTP_201_CREATED,
        )

    return JSONResponse(
        content=_dump_response_model(response),
        status_code=status.HTTP_201_CREATED,
        headers={
            "ETag": _build_etag([row["content_hash"]]),
            "Last-Modified": row["updated_at"].isoformat(),
        },
    )
