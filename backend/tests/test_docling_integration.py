import os
from pathlib import Path

import pytest

os.environ.setdefault("DOCLING_ENABLED", "true")
os.environ.setdefault("MEILI_INDEX_FILES_ENABLED", "true")
os.environ.setdefault("MEILI_FILE_TEXT_MAX_BYTES", "20000000")
os.environ.setdefault("MEILI_FILE_TEXT_MAX_CHARS", "20000")
os.environ.setdefault("MEILI_DOCUMENT_MAX_CHARS", "20000")

from app.search.indexer import build_file_document  # noqa: E402


def _build_row(path: Path) -> dict:
    return {
        "file_id": path.stem,
        "org_id": "org",
        "owner_id": "owner",
        "original_name": path.name,
        "content_type": None,
        "size_bytes": path.stat().st_size,
        "sha256": "test",
        "storage_path": str(path),
        "created_at": "2024-01-01T00:00:00Z",
    }


@pytest.mark.parametrize(
    "filename",
    [
        "Profile.pdf",
        "Wolfgang_Ihloff_CV_GitLab_ATS_Formatted.docx",
    ],
)
def test_docling_extracts_text_from_sample_files(filename: str) -> None:
    tmp_dir = Path(__file__).resolve().parents[2] / "tmp"
    path = tmp_dir / filename
    if not path.exists():
        pytest.skip(f"Sample file missing: {path}")

    doc = build_file_document(_build_row(path))
    search_text = doc.get("search_text") or ""

    assert path.name in search_text
    assert len(search_text) > len(path.name) + 200
