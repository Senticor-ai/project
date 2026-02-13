"""Shared text extraction utilities.

Extracts text from files (PDF via pypdf, plain text passthrough).
Used by search indexing and agent document-reading tools.
"""

from __future__ import annotations

import logging
from pathlib import Path

from pypdf import PdfReader

logger = logging.getLogger(__name__)


def extract_pdf_text(path: Path, max_chars: int) -> str:
    """Extract text from a PDF file using pypdf.

    Args:
        path: Path to the PDF file.
        max_chars: Maximum number of characters to extract.

    Returns:
        Extracted text, truncated to max_chars.
    """
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
        logger.warning("pdf_extract_failed", extra={"path": str(path), "error": str(exc)})
        return ""


def extract_text_file(path: Path, max_chars: int) -> str:
    """Read a plain text or markdown file.

    Args:
        path: Path to the text file.
        max_chars: Maximum number of characters to read.

    Returns:
        File content, truncated to max_chars.
    """
    if max_chars <= 0:
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return _truncate(text, max_chars)
    except Exception as exc:  # noqa: BLE001
        logger.warning("text_extract_failed", extra={"path": str(path), "error": str(exc)})
        return ""


# Recognized plain text MIME types
_TEXT_TYPES = frozenset(
    {
        "text/plain",
        "text/markdown",
        "text/csv",
        "text/html",
        "text/xml",
        "application/json",
        "application/xml",
    }
)

# Recognized PDF MIME types
_PDF_TYPES = frozenset(
    {
        "application/pdf",
        "application/x-pdf",
    }
)


def extract_file_text(
    path: Path,
    content_type: str | None,
    max_chars: int,
) -> str:
    """Extract text from a file based on its content type.

    Supports PDF (via pypdf) and plain text formats.

    Args:
        path: Path to the file.
        content_type: MIME type of the file.
        max_chars: Maximum characters to extract.

    Returns:
        Extracted text content.
    """
    normalized = content_type.lower() if content_type else None

    is_pdf = normalized in _PDF_TYPES or (normalized is None and path.suffix.lower() == ".pdf")
    if is_pdf:
        return extract_pdf_text(path, max_chars)

    is_text = normalized in _TEXT_TYPES or (
        normalized is None and path.suffix.lower() in {".txt", ".md", ".csv", ".json", ".xml"}
    )
    if is_text:
        return extract_text_file(path, max_chars)

    return ""


def _truncate(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars]
