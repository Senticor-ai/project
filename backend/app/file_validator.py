"""File upload validation utilities for type and size checking.

Requires the ``python-magic`` Python package AND the ``libmagic`` system library:
  - Debian/Ubuntu: apt-get install libmagic1
  - macOS (Homebrew): brew install libmagic
  - Docker: see backend/Dockerfile (libmagic1 is already included)
"""

from __future__ import annotations

try:
    import magic
except ImportError as exc:
    raise ImportError(
        "python-magic requires the libmagic system library.\n"
        "  Debian/Ubuntu: sudo apt-get install libmagic1\n"
        "  macOS (Homebrew): brew install libmagic\n"
        "  Docker: already installed — see backend/Dockerfile"
    ) from exc
from fastapi import HTTPException, status

# Allowed MIME types whitelist
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/json",
    "image/jpeg",
    "image/png",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Maximum file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


def validate_file_type(content: bytes, filename: str) -> str:
    """
    Validate file type by content (magic bytes), not extension.

    Args:
        content: File content bytes (at least first 2048 bytes for magic detection)
        filename: Original filename (for error messages)

    Returns:
        Detected MIME type string

    Raises:
        HTTPException: HTTP 415 if file type is not allowed
    """
    # Use python-magic to detect MIME type from content
    mime = magic.from_buffer(content[:2048], mime=True)

    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {mime} not allowed",
        )

    return mime


def validate_file_size(size: int) -> None:
    """
    Validate file size does not exceed limit.

    Args:
        size: File size in bytes

    Raises:
        HTTPException: HTTP 413 if file size exceeds MAX_FILE_SIZE
    """
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds {MAX_FILE_SIZE} bytes",
        )


# Placeholder for future malware scanning integration
def scan_for_malware(content: bytes, filename: str) -> dict[str, str]:
    """
    Placeholder for malware scanning integration (ClamAV/VirusTotal).

    Args:
        content: Full file content bytes
        filename: Original filename

    Returns:
        Dict with scan status: {"status": "pending"|"clean"|"malware", "details": "..."}

    Note:
        This is a placeholder. In production, integrate with:
        - ClamAV for on-premise scanning
        - VirusTotal API for cloud-based scanning
        Files should be quarantined during scanning and results stored in files.scan_status column.
    """
    return {"status": "pending", "details": "Malware scanning not yet implemented"}
