from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.search.indexer import build_file_document
from app.storage import get_storage

_pdf_settings = replace(
    settings,
    meili_index_files_enabled=True,
    meili_file_text_max_bytes=20_000_000,
    meili_file_text_max_chars=20_000,
    meili_document_max_chars=20_000,
)


def _build_row(storage_key: str, original_name: str, size_bytes: int) -> dict:
    return {
        "file_id": "test",
        "org_id": "org",
        "owner_id": "owner",
        "original_name": original_name,
        "content_type": None,
        "size_bytes": size_bytes,
        "sha256": "test",
        "storage_path": storage_key,
        "created_at": "2024-01-01T00:00:00Z",
    }


def test_pypdf_extracts_text_from_sample_pdf() -> None:
    tmp_dir = Path(__file__).resolve().parents[2] / "tmp"
    source_path = tmp_dir / "Profile.pdf"
    if not source_path.exists():
        pytest.skip(f"Sample file missing: {source_path}")

    storage = get_storage()
    storage_key = "files/Profile.pdf"
    storage.write(storage_key, source_path.read_bytes())

    with patch("app.search.indexer.settings", _pdf_settings):
        doc = build_file_document(
            _build_row(storage_key, "Profile.pdf", source_path.stat().st_size)
        )
    search_text = doc.get("search_text") or ""

    assert "Profile.pdf" in search_text
    assert len(search_text) > len("Profile.pdf") + 200
