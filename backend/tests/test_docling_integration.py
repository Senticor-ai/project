import os
from pathlib import Path

import pytest

os.environ.setdefault("DOCLING_ENABLED", "true")
os.environ.setdefault("MEILI_INDEX_FILES_ENABLED", "true")
os.environ.setdefault("MEILI_FILE_TEXT_MAX_BYTES", "20000000")
os.environ.setdefault("MEILI_FILE_TEXT_MAX_CHARS", "20000")
os.environ.setdefault("MEILI_DOCUMENT_MAX_CHARS", "20000")

from app.search.indexer import build_file_document  # noqa: E402
from app.storage import get_storage  # noqa: E402


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


@pytest.mark.parametrize(
    "filename",
    [
        "Profile.pdf",
        "Wolfgang_Ihloff_CV_GitLab_ATS_Formatted.docx",
    ],
)
def test_docling_extracts_text_from_sample_files(
    filename: str, tmp_path: Path
) -> None:
    tmp_dir = Path(__file__).resolve().parents[2] / "tmp"
    source_path = tmp_dir / filename
    if not source_path.exists():
        pytest.skip(f"Sample file missing: {source_path}")

    storage = get_storage()
    storage_key = f"files/{filename}"
    storage.write(storage_key, source_path.read_bytes())

    doc = build_file_document(
        _build_row(storage_key, filename, source_path.stat().st_size)
    )
    search_text = doc.get("search_text") or ""

    assert filename in search_text
    assert len(search_text) > len(filename) + 200
