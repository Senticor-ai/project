"""Unit tests for the storage abstraction layer."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.responses import FileResponse

from app.storage import LocalStorage, StorageBackend


@pytest.fixture()
def storage(tmp_path: Path) -> LocalStorage:
    return LocalStorage(tmp_path)


# --- Protocol conformance ---------------------------------------------------


def test_local_storage_is_storage_backend(storage: LocalStorage) -> None:
    assert isinstance(storage, StorageBackend)


# --- write / read roundtrip -------------------------------------------------


def test_write_read_roundtrip(storage: LocalStorage) -> None:
    storage.write("files/abc", b"hello world")
    assert storage.read("files/abc") == b"hello world"


def test_read_text(storage: LocalStorage) -> None:
    storage.write("files/abc", b"hallo welt")
    assert storage.read_text("files/abc") == "hallo welt"


def test_write_creates_parent_dirs(storage: LocalStorage) -> None:
    storage.write("a/b/c/deep", b"data")
    assert storage.read("a/b/c/deep") == b"data"


# --- exists ------------------------------------------------------------------


def test_exists_true(storage: LocalStorage) -> None:
    storage.write("files/x", b"data")
    assert storage.exists("files/x") is True


def test_exists_false(storage: LocalStorage) -> None:
    assert storage.exists("files/nonexistent") is False


# --- delete ------------------------------------------------------------------


def test_delete(storage: LocalStorage) -> None:
    storage.write("files/rm", b"gone")
    storage.delete("files/rm")
    assert storage.exists("files/rm") is False


def test_delete_missing_is_noop(storage: LocalStorage) -> None:
    storage.delete("files/nope")  # should not raise


# --- delete_prefix -----------------------------------------------------------


def test_delete_prefix(storage: LocalStorage) -> None:
    storage.write("uploads/u1/part-0", b"a")
    storage.write("uploads/u1/part-1", b"b")
    storage.delete_prefix("uploads/u1")
    assert storage.exists("uploads/u1/part-0") is False
    assert storage.exists("uploads/u1/part-1") is False


# --- resolve_path ------------------------------------------------------------


def test_resolve_path_existing(storage: LocalStorage) -> None:
    storage.write("files/f1", b"content")
    path = storage.resolve_path("files/f1")
    assert path is not None
    assert path.is_file()


def test_resolve_path_missing(storage: LocalStorage) -> None:
    assert storage.resolve_path("files/nope") is None


# --- concatenate -------------------------------------------------------------


def test_concatenate(storage: LocalStorage) -> None:
    storage.write("uploads/u2/part-0", b"hello ")
    storage.write("uploads/u2/part-1", b"world")

    size, digest = storage.concatenate(
        ["uploads/u2/part-0", "uploads/u2/part-1"],
        "files/u2",
    )

    assert size == 11
    assert digest == hashlib.sha256(b"hello world").hexdigest()
    assert storage.read("files/u2") == b"hello world"


# --- get_file_response -------------------------------------------------------


def test_get_file_response(storage: LocalStorage) -> None:
    storage.write("files/dl", b"pdf-bytes")
    resp = storage.get_file_response(
        "files/dl",
        media_type="application/pdf",
        filename="report.pdf",
        headers={"ETag": '"abc"'},
    )
    assert isinstance(resp, FileResponse)


# --- ensure_dir --------------------------------------------------------------


def test_ensure_dir(storage: LocalStorage, tmp_path: Path) -> None:
    storage.ensure_dir("uploads/new-upload")
    assert (tmp_path / "uploads" / "new-upload").is_dir()


# --- traversal guard ---------------------------------------------------------


def test_rejects_absolute_key(storage: LocalStorage) -> None:
    with pytest.raises(ValueError, match="Invalid storage key"):
        storage.write("/etc/passwd", b"nope")


def test_rejects_traversal_key(storage: LocalStorage) -> None:
    with pytest.raises(ValueError, match="Invalid storage key"):
        storage.write("../etc/passwd", b"nope")


def test_rejects_mid_traversal_key(storage: LocalStorage) -> None:
    with pytest.raises(ValueError, match="Invalid storage key"):
        storage.write("files/../../etc/passwd", b"nope")
