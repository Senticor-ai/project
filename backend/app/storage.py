"""Storage abstraction layer.

Provides a ``StorageBackend`` protocol with a ``LocalStorage`` implementation.
A future ``S3Storage`` can be added without touching call-sites.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Protocol, runtime_checkable

from fastapi import Response
from fastapi.responses import FileResponse


@runtime_checkable
class StorageBackend(Protocol):
    """Minimal file storage abstraction.

    Keys are backend-agnostic relative paths like ``files/{uuid}`` or
    ``uploads/{uuid}/part-0``.  They must never start with ``/`` or
    contain ``..``.
    """

    def write(self, key: str, data: bytes) -> None: ...

    def read(self, key: str) -> bytes: ...

    def read_text(self, key: str, encoding: str = "utf-8") -> str: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> None: ...

    def resolve_path(self, key: str) -> Path | None:
        """Return a local ``Path`` if available, else ``None``.

        Callers that need a real filesystem path (e.g. PdfReader) use this.
        S3 backends return ``None`` and callers must download to a temp file.
        """
        ...

    def get_file_response(
        self,
        key: str,
        *,
        media_type: str = "application/octet-stream",
        filename: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> Response: ...

    def concatenate(
        self,
        part_keys: list[str],
        target_key: str,
    ) -> tuple[int, str]:
        """Concatenate *part_keys* into *target_key*.

        Returns ``(size_bytes, sha256_hex)``.
        """
        ...

    def ensure_dir(self, key_prefix: str) -> None: ...


class LocalStorage:
    """Filesystem storage backend.

    All keys are resolved relative to *base_path*.
    """

    def __init__(self, base_path: Path) -> None:
        self._base = base_path

    def _resolve(self, key: str) -> Path:
        if key.startswith("/") or ".." in key.split("/"):
            raise ValueError(f"Invalid storage key: {key}")
        return self._base / key

    def write(self, key: str, data: bytes) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def read_text(self, key: str, encoding: str = "utf-8") -> str:
        return self._resolve(key).read_text(encoding=encoding)

    def exists(self, key: str) -> bool:
        return self._resolve(key).exists()

    def delete(self, key: str) -> None:
        path = self._resolve(key)
        if path.is_file():
            path.unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        path = self._resolve(prefix)
        if path.is_dir():
            for child in path.iterdir():
                if child.is_file():
                    child.unlink(missing_ok=True)
            path.rmdir()

    def resolve_path(self, key: str) -> Path | None:
        path = self._resolve(key)
        return path if path.is_file() else None

    def get_file_response(
        self,
        key: str,
        *,
        media_type: str = "application/octet-stream",
        filename: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> Response:
        path = self._resolve(key)
        return FileResponse(
            path=str(path),
            media_type=media_type,
            filename=filename,
            headers=headers or {},
        )

    def concatenate(
        self,
        part_keys: list[str],
        target_key: str,
    ) -> tuple[int, str]:
        target_path = self._resolve(target_key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        sha256 = hashlib.sha256()
        with open(target_path, "wb") as target:
            for part_key in part_keys:
                part_path = self._resolve(part_key)
                with open(part_path, "rb") as part_file:
                    while True:
                        chunk = part_file.read(8192)
                        if not chunk:
                            break
                        target.write(chunk)
                        sha256.update(chunk)
        size_bytes = os.path.getsize(target_path)
        return size_bytes, sha256.hexdigest()

    def ensure_dir(self, key_prefix: str) -> None:
        self._resolve(key_prefix).mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Return the configured :class:`StorageBackend` singleton."""
    global _storage  # noqa: PLW0603
    if _storage is not None:
        return _storage

    from .config import settings

    if settings.storage_backend == "local":
        _storage = LocalStorage(settings.file_storage_path)
    else:
        raise ValueError(f"Unknown storage backend: {settings.storage_backend!r}")
    return _storage
