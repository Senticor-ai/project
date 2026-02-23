"""Backend API client for Senticor Copilot tool execution.

Calls the backend's POST /items endpoint on behalf of the user,
using a delegated JWT (Bearer token) for authentication.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


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

        for item in items:
            jsonld = item.get("item", {})
            item_type = jsonld.get("@type", "Unknown")

            # Collect projects
            if item_type == "Project":
                projects.append(
                    {
                        "id": jsonld.get("@id", ""),
                        "name": jsonld.get("name", ""),
                        "desiredOutcome": jsonld.get("app:desiredOutcome", ""),
                    }
                )
                continue

            # Group by bucket
            bucket = jsonld.get("app:bucket", "unknown")
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            if bucket not in items_by_bucket:
                items_by_bucket[bucket] = []
            # Cap 20 items per bucket to stay within LLM token budget
            if len(items_by_bucket[bucket]) < 20:
                items_by_bucket[bucket].append(
                    {
                        "id": jsonld.get("@id", ""),
                        "name": jsonld.get("name", ""),
                        "type": item_type,
                        "bucket": bucket,
                    }
                )

        return {
            "projects": projects,
            "items_by_bucket": items_by_bucket,
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
