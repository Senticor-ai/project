"""Backend API client for Tay tool execution.

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

    async def create_item(
        self,
        jsonld: dict,
        auth: AuthContext,
        source: str = "tay",
    ) -> dict:
        """POST /items with a delegated Bearer JWT and agent identification."""
        headers: dict[str, str] = {
            "Authorization": f"Bearer {auth.token}",
            "X-Agent": "tay",
        }
        if auth.org_id:
            headers["X-Org-Id"] = auth.org_id

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/items",
                json={"item": jsonld, "source": source},
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
