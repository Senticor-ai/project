"""Tool executor for the OpenClaw path.

Dispatches tool calls and creates items via the backend's own Items API.
This is the backend-inline version of agents/tool_executor.py — used when
OpenClaw is the agent backend and tool_calls are auto-executed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from .jsonld_builders import build_action_jsonld, build_project_jsonld, build_reference_jsonld

logger = logging.getLogger(__name__)


@dataclass
class AuthContext:
    """Auth context for delegated item creation."""

    token: str  # Delegated JWT
    org_id: str | None = None


@dataclass
class CreatedItemRef:
    """Reference to a created item, returned to the frontend."""

    canonical_id: str
    name: str
    item_type: str  # "project" | "action" | "reference"

    def to_dict(self) -> dict:
        return {
            "canonicalId": self.canonical_id,
            "name": self.name,
            "type": self.item_type,
        }


async def _create_item(jsonld: dict, auth: AuthContext) -> dict:
    """POST /items using the backend's own URL (self-call via HTTP)."""
    # Use localhost since we're inside the same backend process/container
    base_url = "http://localhost:8000"

    headers: dict[str, str] = {
        "Authorization": f"Bearer {auth.token}",
        "X-Agent": "tay",
    }
    if auth.org_id:
        headers["X-Org-Id"] = auth.org_id

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{base_url}/items",
            json={"item": jsonld, "source": "tay"},
            headers=headers,
        )
        response.raise_for_status()
        return response.json()


async def execute_tool(
    tool_name: str,
    arguments: dict,
    conversation_id: str,
    auth: AuthContext,
) -> list[CreatedItemRef]:
    """Execute a tool call by creating items via the backend API."""
    match tool_name:
        case "create_project_with_actions":
            return await _exec_create_project_with_actions(arguments, conversation_id, auth)
        case "create_action":
            return await _exec_create_action(arguments, conversation_id, auth)
        case "create_reference":
            return await _exec_create_reference(arguments, conversation_id, auth)
        case _:
            raise ValueError(f"Unknown tool: {tool_name}")


async def _exec_create_project_with_actions(
    args: dict,
    conversation_id: str,
    auth: AuthContext,
) -> list[CreatedItemRef]:
    created: list[CreatedItemRef] = []

    # 1. Create project first
    project_args = args["project"]
    project_jsonld = build_project_jsonld(
        name=project_args["name"],
        desired_outcome=project_args["desiredOutcome"],
        conversation_id=conversation_id,
    )
    project_resp = await _create_item(project_jsonld, auth)
    project_id = project_resp["canonical_id"]
    created.append(
        CreatedItemRef(
            canonical_id=project_id,
            name=project_args["name"],
            item_type="project",
        )
    )

    # 2. Create actions linked to project
    for action in args.get("actions", []):
        action_jsonld = build_action_jsonld(
            name=action["name"],
            bucket=action.get("bucket", "next"),
            conversation_id=conversation_id,
            project_id=project_id,
        )
        action_resp = await _create_item(action_jsonld, auth)
        created.append(
            CreatedItemRef(
                canonical_id=action_resp["canonical_id"],
                name=action["name"],
                item_type="action",
            )
        )

    # 3. Create documents (as references)
    for doc in args.get("documents", []):
        ref_jsonld = build_reference_jsonld(
            name=doc["name"],
            conversation_id=conversation_id,
            description=doc.get("description"),
        )
        ref_resp = await _create_item(ref_jsonld, auth)
        created.append(
            CreatedItemRef(
                canonical_id=ref_resp["canonical_id"],
                name=doc["name"],
                item_type="reference",
            )
        )

    return created


async def _exec_create_action(
    args: dict,
    conversation_id: str,
    auth: AuthContext,
) -> list[CreatedItemRef]:
    action_jsonld = build_action_jsonld(
        name=args["name"],
        bucket=args.get("bucket", "next"),
        conversation_id=conversation_id,
        project_id=args.get("projectId"),
    )
    resp = await _create_item(action_jsonld, auth)
    return [
        CreatedItemRef(
            canonical_id=resp["canonical_id"],
            name=args["name"],
            item_type="action",
        )
    ]


async def _exec_create_reference(
    args: dict,
    conversation_id: str,
    auth: AuthContext,
) -> list[CreatedItemRef]:
    ref_jsonld = build_reference_jsonld(
        name=args["name"],
        conversation_id=conversation_id,
        description=args.get("description"),
        url=args.get("url"),
    )
    resp = await _create_item(ref_jsonld, auth)
    return [
        CreatedItemRef(
            canonical_id=resp["canonical_id"],
            name=args["name"],
            item_type="reference",
        )
    ]
