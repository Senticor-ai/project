"""File upload validation utilities for size checking."""

from __future__ import annotations

from fastapi import HTTPException, status

# Maximum file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


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
