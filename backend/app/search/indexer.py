from __future__ import annotations

import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from ..config import settings
from ..observability import get_logger
from .meili import (
    add_documents,
    delete_document,
    ensure_files_index,
    ensure_things_index,
    is_enabled,
)
from .ocr_settings import OcrConfig, default_ocr_config

logger = get_logger("search-indexer")
_DOCLING_CONVERTERS: dict[tuple, object] = {}


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


def _get_additional_property_value(thing: dict, property_id: str) -> Any:
    """Extract a value from additionalProperty by propertyID."""
    for pv in thing.get("additionalProperty", []):
        if isinstance(pv, dict) and pv.get("propertyID") == property_id:
            return pv.get("value")
    return None


def build_thing_document(row: dict[str, Any]) -> dict[str, Any]:
    thing = row.get("schema_jsonld") or {}
    types = _normalize_types(thing.get("@type"))
    name = thing.get("name") if isinstance(thing.get("name"), str) else None
    description = (
        thing.get("description") if isinstance(thing.get("description"), str) else None
    )
    bucket_value = _get_additional_property_value(thing, "app:bucket")
    bucket = bucket_value if isinstance(bucket_value, str) else None
    return {
        "thing_id": str(row.get("thing_id")),
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
            thing,
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


def _build_ocr_options(ocr_config: OcrConfig):
    from docling.models.factories import get_ocr_factory

    factory = get_ocr_factory()
    try:
        options = factory.create_options(ocr_config.engine)
    except RuntimeError:
        logger.warning("meili.ocr_unknown_engine", engine=ocr_config.engine)
        options = factory.create_options("auto")

    if ocr_config.languages and ocr_config.engine != "auto":
        options.lang = list(ocr_config.languages)  # type: ignore[attr-defined]
    options.force_full_page_ocr = ocr_config.force_full_page_ocr  # type: ignore[attr-defined]
    options.bitmap_area_threshold = ocr_config.bitmap_area_threshold  # type: ignore[attr-defined]
    return options


def _build_pdf_pipeline_options(ocr_config: OcrConfig):
    from docling.datamodel.pipeline_options import PdfPipelineOptions

    return PdfPipelineOptions(
        do_ocr=True,
        ocr_options=_build_ocr_options(ocr_config),
    )


def _docling_converter(ocr_config: OcrConfig):
    key = (
        ocr_config.engine,
        ocr_config.languages,
        ocr_config.force_full_page_ocr,
        ocr_config.bitmap_area_threshold,
    )
    if key in _DOCLING_CONVERTERS:
        return _DOCLING_CONVERTERS[key]

    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import (
        DocumentConverter,
        ImageFormatOption,
        PdfFormatOption,
    )

    pdf_options = _build_pdf_pipeline_options(ocr_config)
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pdf_options),
        },
    )
    _DOCLING_CONVERTERS[key] = converter
    return converter


def _extract_docling_text(path: Path, max_chars: int, ocr_config: OcrConfig) -> str:
    if not settings.docling_enabled or max_chars <= 0:
        return ""
    try:
        converter = _docling_converter(ocr_config)
    except Exception as exc:  # noqa: BLE001
        logger.warning("meili.docling_unavailable", error=str(exc))
        return ""
    try:
        result = converter.convert(str(path))
        document = getattr(result, "document", None)
        if not document:
            return ""
        text = document.export_to_markdown() or ""
        return _truncate(text, max_chars)
    except Exception as exc:  # noqa: BLE001
        logger.warning("meili.docling_extract_failed", path=str(path), error=str(exc))
        return ""


def _extract_file_text(
    path: Path,
    content_type: str | None,
    size_bytes: int | None,
    ocr_config: OcrConfig,
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
        if settings.docling_enabled:
            docling_text = _extract_docling_text(
                path,
                settings.meili_file_text_max_chars,
                ocr_config,
            )
            if docling_text:
                return docling_text
        return _extract_pdf_text(path, settings.meili_file_text_max_chars)

    return _extract_docling_text(path, settings.meili_file_text_max_chars, ocr_config)


def build_file_document(
    row: dict[str, Any], ocr_config: OcrConfig | None = None
) -> dict[str, Any]:
    original_name = row.get("original_name") or ""
    content_type = _guess_content_type(original_name, row.get("content_type"))
    storage_path = Path(row.get("storage_path") or "")
    extracted_text = ""
    if settings.meili_index_files_enabled and storage_path.is_file():
        extracted_text = _extract_file_text(
            storage_path,
            content_type,
            row.get("size_bytes"),
            ocr_config or default_ocr_config(),
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


def index_thing(row: dict[str, Any]) -> None:
    if not is_enabled():
        return
    ensure_things_index()
    doc = build_thing_document(row)
    add_documents(settings.meili_index_things, [doc])


def delete_thing(thing_id: str) -> None:
    if not is_enabled():
        return
    ensure_things_index()
    delete_document(settings.meili_index_things, thing_id)


def index_file(row: dict[str, Any], ocr_config: OcrConfig | None = None) -> None:
    if not is_enabled() or not settings.meili_index_files_enabled:
        return
    ensure_files_index()
    doc = build_file_document(row, ocr_config=ocr_config)
    add_documents(settings.meili_index_files, [doc])
