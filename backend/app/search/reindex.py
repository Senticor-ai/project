from __future__ import annotations

import argparse

from ..config import settings
from ..db import db_conn
from ..observability import configure_logging, get_logger
from .indexer import build_file_document, build_item_document
from .meili import add_documents, ensure_files_index, ensure_items_index, is_enabled

configure_logging()
logger = get_logger("meili-reindex")


def _reindex_items(batch_size: int) -> None:
    ensure_items_index()
    total = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    item_id,
                    org_id,
                    canonical_id,
                    source,
                    schema_jsonld,
                    created_at,
                    updated_at
                FROM items
                WHERE archived_at IS NULL
                """
            )
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                documents = [build_item_document(row) for row in rows]
                add_documents(settings.meili_index_items, documents)
                total += len(documents)
                logger.info("meili.reindex_items_batch", count=len(documents), total=total)


def _reindex_files(batch_size: int) -> None:
    if not settings.meili_index_files_enabled:
        logger.info("meili.reindex_files_skipped", reason="MEILI_INDEX_FILES_ENABLED=false")
        return

    ensure_files_index()
    total = 0
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
                documents = [build_file_document(row) for row in rows]
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

    _reindex_items(args.batch_size)
    if args.files:
        _reindex_files(args.batch_size)


if __name__ == "__main__":
    main()
