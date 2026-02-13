from __future__ import annotations

import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from ..config import settings
from ..observability import get_logger
from ..storage import get_storage
from .meili import (
    add_documents,
    delete_document,
    ensure_files_index,
    ensure_items_index,
    is_enabled,
)

logger = get_logger("search-indexer")


def _normalize_types(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _collect_text(value: Any, out: list[str]) -> None:
    if isinstance(value, str):
        text = value.strip()
        if text:
            out.append(text)
        return
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "@context":
                continue
            if key == "@type":
                out.extend(_normalize_types(nested))
                continue
            _collect_text(nested, out)
        return
    if isinstance(value, list):
        for item in value:
            _collect_text(item, out)


def _truncate(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


def _build_search_text(value: Any, *, max_chars: int) -> str:
    parts: list[str] = []
    _collect_text(value, parts)
    if not parts:
        return ""
    seen: set[str] = set()
    unique: list[str] = []
    for part in parts:
        if part in seen:
            continue
        seen.add(part)
        unique.append(part)
    return _truncate("\n".join(unique), max_chars)


def _isoformat(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _get_additional_property_value(jsonld: dict, property_id: str) -> Any:
    """Extract a value from additionalProperty by propertyID."""
    for pv in jsonld.get("additionalProperty", []):
        if isinstance(pv, dict) and pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def build_item_document(row: dict[str, Any]) -> dict[str, Any]:
    jsonld = row.get("schema_jsonld") or {}
    types = _normalize_types(jsonld.get("@type"))
    name = jsonld.get("name") if isinstance(jsonld.get("name"), str) else None
    description = jsonld.get("description") if isinstance(jsonld.get("description"), str) else None
    bucket_value = _get_additional_property_value(jsonld, "app:bucket")
    bucket = bucket_value if isinstance(bucket_value, str) else None
    return {
        "item_id": str(row.get("item_id")),
        "org_id": str(row.get("org_id")),
        "canonical_id": row.get("canonical_id"),
        "source": row.get("source"),
        "types": types,
        "name": name,
        "description": description,
        "bucket": bucket,
        "created_at": _isoformat(row.get("created_at")),
        "updated_at": _isoformat(row.get("updated_at")),
        "search_text": _build_search_text(
            jsonld,
            max_chars=settings.meili_document_max_chars,
        ),
    }


def _guess_content_type(original_name: str, content_type: str | None) -> str | None:
    if content_type:
        return content_type.split(";")[0].strip().lower()
    guessed, _ = mimetypes.guess_type(original_name)
    return guessed.lower() if guessed else None


def _extract_pdf_text(path: Path, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                return ""
        parts: list[str] = []
        total = 0
        for page in reader.pages:
            text = page.extract_text() or ""
            if not text:
                continue
            remaining = max_chars - total
            if remaining <= 0:
                break
            if len(text) > remaining:
                text = text[:remaining]
            parts.append(text)
            total += len(text)
            if total >= max_chars:
                break
        return _truncate("\n".join(parts), max_chars)
    except Exception as exc:  # noqa: BLE001
        logger.warning("meili.pdf_extract_failed", path=str(path), error=str(exc))
        return ""


def _extract_file_text(
    path: Path,
    content_type: str | None,
    size_bytes: int | None,
) -> str:
    if settings.meili_file_text_max_bytes <= 0:
        return ""
    if size_bytes is not None and size_bytes > settings.meili_file_text_max_bytes:
        logger.info(
            "meili.file_skip_large",
            path=str(path),
            size_bytes=size_bytes,
            max_bytes=settings.meili_file_text_max_bytes,
        )
        return ""

    normalized_type = content_type.lower() if content_type else None
    is_pdf = normalized_type in {"application/pdf", "application/x-pdf"} or (
        normalized_type is None and path.suffix.lower() == ".pdf"
    )
    if is_pdf:
        return _extract_pdf_text(path, settings.meili_file_text_max_chars)

    return ""


def build_file_document(row: dict[str, Any]) -> dict[str, Any]:
    original_name = row.get("original_name") or ""
    content_type = _guess_content_type(original_name, row.get("content_type"))
    storage_key = row.get("storage_path") or ""
    storage = get_storage()
    extracted_text = ""
    if settings.meili_index_files_enabled and storage.exists(storage_key):
        local_path = storage.resolve_path(storage_key)
        if local_path:
            extracted_text = _extract_file_text(
                local_path,
                content_type,
                row.get("size_bytes"),
            )
    search_text = "\n".join(part for part in [original_name, extracted_text] if part)
    return {
        "file_id": str(row.get("file_id")),
        "org_id": str(row.get("org_id")),
        "owner_id": str(row.get("owner_id")) if row.get("owner_id") else None,
        "original_name": original_name,
        "content_type": content_type,
        "size_bytes": row.get("size_bytes"),
        "sha256": row.get("sha256"),
        "created_at": _isoformat(row.get("created_at")),
        "search_text": _truncate(
            search_text,
            settings.meili_document_max_chars,
        ),
    }


def index_item(row: dict[str, Any]) -> None:
    if not is_enabled():
        return
    ensure_items_index()
    doc = build_item_document(row)
    add_documents(settings.meili_index_items, [doc])


def delete_item(item_id: str) -> None:
    if not is_enabled():
        return
    ensure_items_index()
    delete_document(settings.meili_index_items, item_id)


def index_file(row: dict[str, Any]) -> None:
    if not is_enabled() or not settings.meili_index_files_enabled:
        return
    ensure_files_index()
    doc = build_file_document(row)
    add_documents(settings.meili_index_files, [doc])
