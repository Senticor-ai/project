"""Backend API client for Senticor Copilot tool execution.

Calls the backend's POST /items endpoint on behalf of the user,
using a delegated JWT (Bearer token) for authentication.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

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
        """GET /items — fetch workspace overview for agent browsing."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/items",
                params={"limit": 100},
                headers=self._headers(auth),
            )
            response.raise_for_status()
            items = response.json()

        # Structure the overview for the LLM
        projects: list[dict] = []
        items_by_bucket: dict[str, list[dict]] = {}
        bucket_counts: dict[str, int] = {}
        focused_items: list[dict] = []

        for item in items:
            jsonld = item.get("item", {})
            if not isinstance(jsonld, dict):
                continue

            item_type = _item_type(jsonld)

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
            bucket_value = _additional_property_value(jsonld, "app:bucket")
            bucket = bucket_value if isinstance(bucket_value, str) and bucket_value else "unknown"
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            if bucket not in items_by_bucket:
                items_by_bucket[bucket] = []

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
            entry = {
                "id": jsonld.get("@id", ""),
                "name": _item_name(jsonld),
                "type": item_type,
                "bucket": bucket,
                "is_focused": is_focused,
                "is_completed": bool(jsonld.get("endTime")),
                "project_refs": project_refs[:5],
            }
            # Cap 20 items per bucket to scopilot within LLM token budget
            if len(items_by_bucket[bucket]) < 20:
                items_by_bucket[bucket].append(entry)
            if is_focused and len(focused_items) < 50:
                focused_items.append(entry)

        return {
            "projects": projects,
            "items_by_bucket": items_by_bucket,
            "focused_items": focused_items,
            "total_items": len(items),
            "bucket_counts": bucket_counts,
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
