from __future__ import annotations

from typing import Any

import httpx

from ..config import settings
from ..observability import get_logger, request_context_headers

logger = get_logger("meilisearch")

_INDEX_READY: set[str] = set()
_INDEX_CONFIGURED: set[str] = set()

THINGS_SETTINGS = {
    "filterableAttributes": ["org_id", "types", "source", "bucket"],
    "sortableAttributes": ["created_at", "updated_at"],
    "searchableAttributes": [
        "search_text",
        "canonical_id",
        "name",
        "description",
        "bucket",
        "types",
    ],
}

FILES_SETTINGS = {
    "filterableAttributes": ["org_id", "content_type", "owner_id"],
    "sortableAttributes": ["created_at", "size_bytes"],
    "searchableAttributes": ["search_text", "original_name", "content_type", "sha256"],
}


def is_enabled() -> bool:
    return bool(settings.meili_url)


def _headers() -> dict[str, str]:
    headers = request_context_headers()
    if settings.meili_api_key:
        headers["Authorization"] = f"Bearer {settings.meili_api_key}"
    return headers


def _client() -> httpx.Client:
    return httpx.Client(base_url=settings.meili_url, timeout=settings.meili_timeout_seconds)


def _request(method: str, path: str, *, json: Any | None = None, params: dict | None = None):
    if not settings.meili_url:
        raise RuntimeError("Meilisearch is not configured")
    with _client() as client:
        response = client.request(method, path, headers=_headers(), json=json, params=params)
    if response.status_code >= 400:
        raise RuntimeError(
            f"Meilisearch error {response.status_code} on {path}: {response.text[:500]}"
        )
    if not response.text:
        return {}
    try:
        return response.json()
    except ValueError:
        return {}


def _update_settings(index_uid: str, payload: dict[str, Any]) -> None:
    if not payload:
        return
    if index_uid in _INDEX_CONFIGURED:
        return

    try:
        _request("PATCH", f"/indexes/{index_uid}/settings", json=payload)
    except RuntimeError as exc:
        if "405" not in str(exc):
            raise
        _request("PUT", f"/indexes/{index_uid}/settings", json=payload)

    _INDEX_CONFIGURED.add(index_uid)


def ensure_index(index_uid: str, primary_key: str, settings_payload: dict[str, Any] | None = None) -> None:
    if not is_enabled():
        return

    if index_uid not in _INDEX_READY:
        with _client() as client:
            response = client.get(f"/indexes/{index_uid}", headers=_headers())
            if response.status_code == 404:
                create = client.post(
                    "/indexes",
                    headers=_headers(),
                    json={"uid": index_uid, "primaryKey": primary_key},
                )
                if create.status_code >= 400:
                    raise RuntimeError(
                        f"Meilisearch index create failed {create.status_code}: {create.text[:500]}"
                    )
            elif response.status_code >= 400:
                raise RuntimeError(
                    f"Meilisearch index fetch failed {response.status_code}: {response.text[:500]}"
                )

        _INDEX_READY.add(index_uid)

    if settings_payload:
        _update_settings(index_uid, settings_payload)


def ensure_things_index() -> None:
    ensure_index(settings.meili_index_things, "thing_id", THINGS_SETTINGS)


def ensure_files_index() -> None:
    ensure_index(settings.meili_index_files, "file_id", FILES_SETTINGS)


def add_documents(index_uid: str, documents: list[dict[str, Any]]) -> dict[str, Any]:
    if not documents:
        return {}
    return _request("POST", f"/indexes/{index_uid}/documents", json=documents)


def delete_document(index_uid: str, doc_id: str) -> None:
    if not doc_id:
        return
    if not is_enabled():
        return
    with _client() as client:
        response = client.delete(f"/indexes/{index_uid}/documents/{doc_id}", headers=_headers())
        if response.status_code in {200, 202, 204, 404}:
            return
        if response.status_code >= 400:
            raise RuntimeError(
                f"Meilisearch delete failed {response.status_code}: {response.text[:500]}"
            )


def search(index_uid: str, query: str, *, org_id: str, limit: int, offset: int):
    payload = {
        "q": query,
        "limit": limit,
        "offset": offset,
        "filter": f'org_id = "{org_id}"',
    }
    return _request("POST", f"/indexes/{index_uid}/search", json=payload)
