"""Backend API client for Tay tool execution.

Calls the backend's POST /items endpoint on behalf of the user,
forwarding session cookies and agent identification headers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


@dataclass
class AuthContext:
    """Auth context forwarded from the backend proxy."""

    session_token: str
    session_cookie_name: str
    org_id: str | None = None
    client_ip: str | None = None


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
        """POST /items with the user's session cookie and agent header."""
        cookies = {auth.session_cookie_name: auth.session_token}

        headers: dict[str, str] = {"X-Agent": "tay"}
        if auth.org_id:
            headers["X-Org-Id"] = auth.org_id
        if auth.client_ip:
            headers["X-Forwarded-For"] = auth.client_ip

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/items",
                json={"item": jsonld, "source": source},
                cookies=cookies,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
