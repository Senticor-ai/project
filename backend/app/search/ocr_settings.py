from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from ..config import settings
from ..db import db_conn, jsonb
from ..observability import get_logger

logger = get_logger("search-ocr")


@dataclass(frozen=True)
class OcrConfig:
    engine: str
    languages: tuple[str, ...]
    force_full_page_ocr: bool
    bitmap_area_threshold: float

    @staticmethod
    def from_values(
        engine: str | None,
        languages: Iterable[str] | None,
        force_full_page_ocr: bool | None,
        bitmap_area_threshold: float | None,
    ) -> OcrConfig:
        resolved_engine = (engine or "auto").strip().lower()
        resolved_languages = tuple(
            lang.strip() for lang in (languages or []) if isinstance(lang, str) and lang.strip()
        )
        resolved_force = bool(force_full_page_ocr) if force_full_page_ocr is not None else False
        resolved_threshold = (
            float(bitmap_area_threshold)
            if bitmap_area_threshold is not None
            else 0.05
        )
        return OcrConfig(
            engine=resolved_engine,
            languages=resolved_languages,
            force_full_page_ocr=resolved_force,
            bitmap_area_threshold=resolved_threshold,
        )


def default_ocr_config() -> OcrConfig:
    return OcrConfig.from_values(
        engine="auto",
        languages=[],
        force_full_page_ocr=False,
        bitmap_area_threshold=0.05,
    )


def available_ocr_engines() -> list[str]:
    try:
        from docling.models.factories import get_ocr_factory

        return get_ocr_factory().registered_kind
    except Exception as exc:  # noqa: BLE001
        logger.warning("docling.ocr_engines_failed", error=str(exc))
        return ["auto"]


def get_ocr_config(org_id: str) -> OcrConfig:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ocr_engine, ocr_langs, force_full_page_ocr, bitmap_area_threshold
                FROM search_ocr_settings
                WHERE org_id = %s
                """,
                (org_id,),
            )
            row = cur.fetchone()

    if not row:
        return default_ocr_config()

    languages = row.get("ocr_langs") or []
    return OcrConfig.from_values(
        engine=row.get("ocr_engine") or "auto",
        languages=languages,
        force_full_page_ocr=row.get("force_full_page_ocr") or False,
        bitmap_area_threshold=(
            row.get("bitmap_area_threshold")
            if row.get("bitmap_area_threshold") is not None
            else 0.05
        ),
    )


def upsert_ocr_config(
    org_id: str,
    engine: str,
    languages: Iterable[str],
    force_full_page_ocr: bool,
    bitmap_area_threshold: float,
) -> OcrConfig:
    updated_at = datetime.now(UTC)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO search_ocr_settings (
                    org_id,
                    ocr_engine,
                    ocr_langs,
                    force_full_page_ocr,
                    bitmap_area_threshold,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (org_id) DO UPDATE
                SET ocr_engine = EXCLUDED.ocr_engine,
                    ocr_langs = EXCLUDED.ocr_langs,
                    force_full_page_ocr = EXCLUDED.force_full_page_ocr,
                    bitmap_area_threshold = EXCLUDED.bitmap_area_threshold,
                    updated_at = EXCLUDED.updated_at
                RETURNING ocr_engine, ocr_langs, force_full_page_ocr, bitmap_area_threshold
                """,
                (
                    org_id,
                    engine,
                    jsonb(list(languages)),
                    force_full_page_ocr,
                    bitmap_area_threshold,
                    updated_at,
                    updated_at,
                ),
            )
            row = cur.fetchone()
        conn.commit()

    return OcrConfig.from_values(
        engine=row.get("ocr_engine") if row else engine,
        languages=row.get("ocr_langs") if row else list(languages),
        force_full_page_ocr=row.get("force_full_page_ocr") if row else force_full_page_ocr,
        bitmap_area_threshold=row.get("bitmap_area_threshold") if row else bitmap_area_threshold,
    )


def is_docling_enabled() -> bool:
    return settings.docling_enabled
