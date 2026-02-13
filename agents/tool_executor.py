"""Tool executor — dispatches tool calls and creates items via the backend API.

This is where approved tool calls from the chat UI get executed.
Each tool function builds JSON-LD and calls the backend's POST /items.
"""

from __future__ import annotations

from dataclasses import dataclass

from backend_client import AuthContext, BackendClient, CreatedItemRef
from jsonld_builders import (
    build_action_jsonld,
    build_file_reference_jsonld,
    build_project_jsonld,
    build_reference_jsonld,
)


@dataclass
class ToolCallInput:
    """Input from the frontend's accepted tool call."""

    name: str
    arguments: dict


async def execute_tool(
    tool_call: ToolCallInput,
    conversation_id: str,
    auth: AuthContext,
    client: BackendClient | None = None,
) -> list[CreatedItemRef]:
    """Execute a tool call by creating items via the backend API."""
    client = client or BackendClient()
    args = tool_call.arguments

    match tool_call.name:
        case "create_project_with_actions":
            return await _exec_create_project_with_actions(args, conversation_id, auth, client)
        case "create_action":
            return await _exec_create_action(args, conversation_id, auth, client)
        case "create_reference":
            return await _exec_create_reference(args, conversation_id, auth, client)
        case "render_cv":
            return await _exec_render_cv(args, conversation_id, auth, client)
        case _:
            raise ValueError(f"Unknown tool: {tool_call.name}")


async def _exec_create_project_with_actions(
    args: dict,
    conversation_id: str,
    auth: AuthContext,
    client: BackendClient,
) -> list[CreatedItemRef]:
    created: list[CreatedItemRef] = []

    # 1. Create project first
    project_args = args["project"]
    project_jsonld = build_project_jsonld(
        name=project_args["name"],
        desired_outcome=project_args["desiredOutcome"],
        conversation_id=conversation_id,
    )
    project_resp = await client.create_item(project_jsonld, auth)
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
        action_resp = await client.create_item(action_jsonld, auth)
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
        ref_resp = await client.create_item(ref_jsonld, auth)
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
    client: BackendClient,
) -> list[CreatedItemRef]:
    action_jsonld = build_action_jsonld(
        name=args["name"],
        bucket=args.get("bucket", "next"),
        conversation_id=conversation_id,
        project_id=args.get("projectId"),
    )
    resp = await client.create_item(action_jsonld, auth)
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
    client: BackendClient,
) -> list[CreatedItemRef]:
    ref_jsonld = build_reference_jsonld(
        name=args["name"],
        conversation_id=conversation_id,
        description=args.get("description"),
        url=args.get("url"),
        project_id=args.get("projectId"),
    )
    resp = await client.create_item(ref_jsonld, auth)
    return [
        CreatedItemRef(
            canonical_id=resp["canonical_id"],
            name=args["name"],
            item_type="reference",
        )
    ]


async def _exec_render_cv(
    args: dict,
    conversation_id: str,
    auth: AuthContext,
    client: BackendClient,
) -> list[CreatedItemRef]:
    """Render a markdown reference to PDF and create a file reference in the project."""
    # 1. Read the source markdown reference
    source_item = await client.get_item_content(args["sourceItemId"], auth)
    # Prefer inline description (from create_reference), fall back to
    # extracted file content (from uploaded .md/.txt files).
    markdown_text = source_item.get("description") or source_item.get("file_content") or ""
    if not markdown_text:
        raise ValueError(f"Source item {args['sourceItemId']} has no description or file content.")

    # 2. Render PDF via backend
    pdf_resp = await client.render_pdf(
        markdown=markdown_text,
        css=args["css"],
        filename=args["filename"],
        auth=auth,
    )
    file_id = pdf_resp["file_id"]

    # 3. Create file reference linked to the project
    source_name = source_item.get("name") or args["sourceItemId"]
    ref_jsonld = build_file_reference_jsonld(
        name=args["filename"],
        file_id=file_id,
        conversation_id=conversation_id,
        project_id=args.get("projectId"),
        description=f"PDF aus: {source_name}",
    )
    ref_resp = await client.create_item(ref_jsonld, auth)

    return [
        CreatedItemRef(
            canonical_id=ref_resp["canonical_id"],
            name=args["filename"],
            item_type="reference",
        )
    ]
