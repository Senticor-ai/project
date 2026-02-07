from __future__ import annotations

import argparse

from ..config import settings
from ..db import db_conn
from ..observability import configure_logging, get_logger
from .indexer import build_file_document, build_thing_document
from .meili import add_documents, ensure_files_index, ensure_things_index, is_enabled
from .ocr_settings import OcrConfig, get_ocr_config

configure_logging()
logger = get_logger("meili-reindex")


def _reindex_things(batch_size: int) -> None:
    ensure_things_index()
    total = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    thing_id,
                    org_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    created_at,
                    updated_at
                FROM things
                WHERE archived_at IS NULL
                """
            )
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                documents = [build_thing_document(row) for row in rows]
                add_documents(settings.meili_index_things, documents)
                total += len(documents)
                logger.info("meili.reindex_things_batch", count=len(documents), total=total)


def _reindex_files(batch_size: int) -> None:
    if not settings.meili_index_files_enabled:
        logger.info("meili.reindex_files_skipped", reason="MEILI_INDEX_FILES_ENABLED=false")
        return

    ensure_files_index()
    total = 0
    ocr_cache: dict[str, OcrConfig] = {}
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
                """
            )
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                documents = []
                for row in rows:
                    org_id = str(row.get("org_id") or "")
                    if org_id not in ocr_cache:
                        ocr_cache[org_id] = get_ocr_config(org_id)
                    documents.append(
                        build_file_document(row, ocr_config=ocr_cache[org_id])
                    )
                add_documents(settings.meili_index_files, documents)
                total += len(documents)
                logger.info("meili.reindex_files_batch", count=len(documents), total=total)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex Meilisearch documents.")
    parser.add_argument("--files", action="store_true", help="Also reindex file metadata.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=settings.meili_batch_size,
        help="Documents per batch.",
    )
    args = parser.parse_args()

    if not is_enabled():
        raise SystemExit("MEILI_URL is not configured")

    _reindex_things(args.batch_size)
    if args.files:
        _reindex_files(args.batch_size)


if __name__ == "__main__":
    main()
