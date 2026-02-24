"""Backend API client for Senticor Copilot tool execution.

Calls the backend's POST /items endpoint on behalf of the user,
using a delegated JWT (Bearer token) for authentication.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def _additional_property_value(item_jsonld: dict, property_id: str):
    """Read app:* values from either top-level alias or additionalProperty."""
    direct = item_jsonld.get(property_id)
    if direct is not None:
        return direct

    props = item_jsonld.get("additionalProperty")
    if not isinstance(props, list):
        return None

    for entry in props:
        if (
            isinstance(entry, dict)
            and entry.get("propertyID") == property_id
            and "value" in entry
        ):
            return entry.get("value")
    return None


def _item_name(item_jsonld: dict) -> str:
    name = item_jsonld.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()

    raw_capture = _additional_property_value(item_jsonld, "app:rawCapture")
    if isinstance(raw_capture, str) and raw_capture.strip():
        return raw_capture.strip()

    return ""


def _item_type(item_jsonld: dict) -> str:
    raw_type = item_jsonld.get("@type", "Unknown")
    if isinstance(raw_type, str):
        return raw_type
    if isinstance(raw_type, list) and raw_type and isinstance(raw_type[0], str):
        return raw_type[0]
    return "Unknown"


@dataclass
class AuthContext:
    """Auth context forwarded from the backend proxy (delegated JWT)."""

    token: str  # Delegated JWT
    org_id: str | None = None


@dataclass
class CreatedItemRef:
    """Reference to a created item, returned to the frontend."""

    canonical_id: str
    name: str
    item_type: str  # "project" | "action" | "reference"


class BackendClient:
    """httpx-based client for the backend's Items API."""

    def __init__(self, base_url: str | None = None, timeout: float = 30.0):
        self._base_url = base_url or BACKEND_URL
        self._timeout = timeout

    def _headers(self, auth: AuthContext) -> dict[str, str]:
        headers: dict[str, str] = {
            "Authorization": f"Bearer {auth.token}",
            "X-Agent": "senticor-copilot",
        }
        if auth.org_id:
            headers["X-Org-Id"] = auth.org_id
        return headers

    async def _sync_all_items(
        self,
        auth: AuthContext,
        *,
        completed: str = "false",
        page_size: int = 200,
        max_pages: int = 50,
    ) -> list[dict]:
        """Fetch all items via /items/sync pagination (same data path as CLI)."""
        out: list[dict] = []
        cursor: str | None = None

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            for _ in range(max_pages):
                params: dict[str, str | int] = {
                    "limit": page_size,
                    "completed": completed,
                }
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self._base_url}/items/sync",
                    params=params,
                    headers=self._headers(auth),
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    break

                raw_items = payload.get("items")
                batch = raw_items if isinstance(raw_items, list) else []
                out.extend([item for item in batch if isinstance(item, dict)])

                has_more = payload.get("has_more") is True
                next_cursor = payload.get("next_cursor")
                if not has_more or not isinstance(next_cursor, str) or not next_cursor:
                    break
                cursor = next_cursor

        return out

    @staticmethod
    def _entry_from_record(record: dict) -> dict | None:
        jsonld = record.get("item")
        if not isinstance(jsonld, dict):
            return None

        bucket_value = _additional_property_value(jsonld, "app:bucket")
        bucket = bucket_value if isinstance(bucket_value, str) and bucket_value else "unknown"

        focus_value = _additional_property_value(jsonld, "app:isFocused")
        is_focused = focus_value is True or (
            isinstance(focus_value, str) and focus_value.strip().lower() == "true"
        )

        project_refs_raw = _additional_property_value(jsonld, "app:projectRefs")
        project_refs = (
            [ref for ref in project_refs_raw if isinstance(ref, str)]
            if isinstance(project_refs_raw, list)
            else []
        )

        return {
            "id": jsonld.get("@id", ""),
            "name": _item_name(jsonld),
            "type": _item_type(jsonld),
            "bucket": bucket,
            "is_focused": is_focused,
            "is_completed": bool(jsonld.get("endTime")),
            "project_refs": project_refs[:8],
            "created_at": record.get("created_at"),
            "updated_at": record.get("updated_at"),
        }

    @staticmethod
    def _sort_entries(entries: list[dict], sort: str) -> list[dict]:
        def _as_dt(value: object) -> datetime:
            if not isinstance(value, str):
                return datetime.min.replace(tzinfo=UTC)
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=UTC)
                return parsed
            except ValueError:
                return datetime.min.replace(tzinfo=UTC)

        if sort == "oldest":
            return sorted(entries, key=lambda e: (_as_dt(e.get("created_at")), e.get("id", "")))
        if sort == "updated":
            return sorted(
                entries,
                key=lambda e: (_as_dt(e.get("updated_at")), e.get("id", "")),
                reverse=True,
            )
        # default: latest by created_at DESC
        return sorted(
            entries,
            key=lambda e: (_as_dt(e.get("created_at")), e.get("id", "")),
            reverse=True,
        )

    async def create_item(
        self,
        jsonld: dict,
        auth: AuthContext,
        source: str = "senticor-copilot",
    ) -> dict:
        """POST /items with a delegated Bearer JWT."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/items",
                json={"item": jsonld, "source": source},
                headers=self._headers(auth),
            )
            response.raise_for_status()
            return response.json()

    async def get_item_content(
        self,
        item_id: str,
        auth: AuthContext,
        max_chars: int = 50000,
    ) -> dict:
        """GET /items/{item_id}/content — read item data + file text."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/items/{item_id}/content",
                params={"max_chars": max_chars},
                headers=self._headers(auth),
            )
            response.raise_for_status()
            return response.json()

    async def list_project_items(
        self,
        project_id: str,
        auth: AuthContext,
    ) -> list[dict]:
        """GET /items/by-project/{project_id}."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/items/by-project/{project_id}",
                headers=self._headers(auth),
            )
            response.raise_for_status()
            return response.json()

    async def list_workspace_overview(
        self,
        auth: AuthContext,
    ) -> dict:
        """Workspace overview via paginated /items/sync (CLI-equivalent)."""
        items = await self._sync_all_items(
            auth,
            completed="false",
            page_size=200,
            max_pages=50,
        )

        # Structure the overview for the LLM
        projects: list[dict] = []
        items_by_bucket: dict[str, list[dict]] = {}
        bucket_counts: dict[str, int] = {}
        focused_items: list[dict] = []

        for item in items:
            entry = self._entry_from_record(item)
            if entry is None:
                continue
            item_type = entry["type"]
            jsonld = item.get("item", {})
            assert isinstance(jsonld, dict)

            # Collect projects
            if item_type == "Project":
                desired_outcome = _additional_property_value(jsonld, "app:desiredOutcome")
                projects.append(
                    {
                        "id": jsonld.get("@id", ""),
                        "name": _item_name(jsonld),
                        "desiredOutcome": (
                            desired_outcome if isinstance(desired_outcome, str) else ""
                        ),
                    }
                )
                continue

            # Group by bucket
            bucket = entry["bucket"]
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            if bucket not in items_by_bucket:
                items_by_bucket[bucket] = []

            # Cap 20 items per bucket to scopilot within LLM token budget
            if len(items_by_bucket[bucket]) < 20:
                items_by_bucket[bucket].append(entry)
            if entry["is_focused"] and len(focused_items) < 50:
                focused_items.append(entry)

        return {
            "projects": projects,
            "items_by_bucket": items_by_bucket,
            "focused_items": focused_items,
            "total_items": len(items),
            "bucket_counts": bucket_counts,
            "source": "items/sync (paginated)",
            "completed_filter": "false",
        }

    async def list_bucket_items(
        self,
        auth: AuthContext,
        *,
        bucket: str | None = None,
        project_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort: str = "latest",
        completed: str = "false",
    ) -> dict:
        """List items for a bucket or project with pagination metadata."""
        if not bucket and not project_id:
            raise ValueError("list_bucket_items requires bucket or project_id")

        all_items = await self._sync_all_items(
            auth,
            completed=completed,
            page_size=200,
            max_pages=50,
        )

        entries = [entry for item in all_items if (entry := self._entry_from_record(item))]

        filtered = entries
        if bucket:
            normalized_bucket = bucket.strip().lower()
            if normalized_bucket == "focus":
                filtered = [entry for entry in filtered if entry["is_focused"]]
            else:
                filtered = [
                    entry
                    for entry in filtered
                    if isinstance(entry.get("bucket"), str)
                    and str(entry["bucket"]).lower() == normalized_bucket
                ]

        if project_id:
            filtered = [
                entry
                for entry in filtered
                if str(entry.get("id")) == project_id
                or (
                    isinstance(entry.get("project_refs"), list)
                    and project_id in entry["project_refs"]
                )
            ]

        normalized_sort = sort if sort in {"latest", "oldest", "updated"} else "latest"
        sorted_items = self._sort_entries(filtered, normalized_sort)

        safe_limit = max(1, min(limit, 200))
        safe_offset = max(0, offset)
        total = len(sorted_items)
        page = sorted_items[safe_offset : safe_offset + safe_limit]
        returned = len(page)
        has_more = (safe_offset + returned) < total

        return {
            "items": page,
            "total": total,
            "limit": safe_limit,
            "offset": safe_offset,
            "returned": returned,
            "has_more": has_more,
            "next_offset": (safe_offset + returned) if has_more else None,
            "sort": normalized_sort,
            "scope": {
                "bucket": bucket,
                "project_id": project_id,
                "completed": completed,
            },
            "source": "items/sync (paginated)",
        }

    async def render_pdf(
        self,
        markdown: str,
        css: str,
        filename: str,
        auth: AuthContext,
    ) -> dict:
        """POST /files/render-pdf — render markdown content to PDF."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self._base_url}/files/render-pdf",
                json={"markdown": markdown, "css": css, "filename": filename},
                headers=self._headers(auth),
            )
            response.raise_for_status()
            return response.json()
