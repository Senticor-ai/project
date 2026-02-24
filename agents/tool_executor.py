"""Tool executor for approved Copilot CLI tool calls."""

from __future__ import annotations

import asyncio
import json
import os
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend_client import AuthContext, CreatedItemRef
from intent_contract import compile_intent_to_argv

REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_DIR = REPO_ROOT / "packages" / "core"


@dataclass
class ToolCallInput:
    """Input from the frontend's accepted tool call."""

    name: str
    arguments: dict


def _resolve_cli_command() -> tuple[list[str], str]:
    """Resolve the CLI command and working directory.

    Priority:
    1. COPILOT_CLI_COMMAND (explicit override)
    2. local tsx runner inside packages/core
    3. built dist CLI entry
    4. npm script fallback
    """
    override = os.getenv("COPILOT_CLI_COMMAND", "").strip()
    if override:
        return shlex.split(override), str(REPO_ROOT)

    tsx_bin = CORE_DIR / "node_modules" / ".bin" / "tsx"
    if tsx_bin.exists():
        return [str(tsx_bin), "cli/index.ts"], str(CORE_DIR)

    dist_entry = CORE_DIR / "dist" / "cli" / "index.js"
    if dist_entry.exists():
        return ["node", str(dist_entry)], str(REPO_ROOT)

    return ["npm", "--prefix", str(CORE_DIR), "run", "copilot", "--silent", "--"], str(
        REPO_ROOT
    )


def _with_required_cli_flags(argv: list[str], conversation_id: str) -> list[str]:
    normalized = list(argv)

    # Ensure JSON/non-interactive behavior for deterministic tool execution.
    if "--json" not in normalized:
        normalized.append("--json")
    if "--non-interactive" not in normalized:
        normalized.append("--non-interactive")
    if "--yes" not in normalized:
        normalized.append("--yes")

    # Carry chat context for write capture metadata when supported.
    if (
        len(normalized) >= 2
        and normalized[0] in {"items", "projects"}
        and normalized[1] == "create"
    ):
        if "--conversation-id" not in normalized:
            normalized.extend(["--conversation-id", conversation_id])

    return normalized


def _normalize_commands(tool_call: ToolCallInput, conversation_id: str) -> list[list[str]]:
    if tool_call.name != "copilot_cli":
        raise ValueError(f"Unknown tool: {tool_call.name}")

    raw_argv = tool_call.arguments.get("argv")
    raw_intent = tool_call.arguments.get("intent")

    has_argv = raw_argv is not None
    has_intent = raw_intent is not None

    if has_argv == has_intent:
        raise ValueError("copilot_cli requires exactly one of argv or intent")

    commands: list[list[str]]
    if has_argv:
        if (
            not isinstance(raw_argv, list)
            or not raw_argv
            or not all(isinstance(v, str) and v for v in raw_argv)
        ):
            raise ValueError("copilot_cli requires non-empty argv: string[]")
        commands = [list(raw_argv)]
    else:
        if not isinstance(raw_intent, dict):
            raise ValueError("copilot_cli intent must be an object")
        commands = compile_intent_to_argv(raw_intent)
        if not commands:
            raise ValueError("copilot_cli intent expanded to zero commands")

    return [_with_required_cli_flags(command, conversation_id) for command in commands]


def _parse_json_from_stdout(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    if not text:
        raise RuntimeError("copilot_cli produced no stdout")

    # Preferred case: pure JSON payload
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Fallback for wrapper noise: parse the last JSON-looking line.
    for line in reversed([ln.strip() for ln in text.splitlines() if ln.strip()]):
        if not line.startswith("{"):
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue

    raise RuntimeError(f"Unable to parse copilot_cli JSON output: {text[:300]}")


def _extract_item_records(payload: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    if isinstance(payload, dict):
        if {
            "item_id",
            "canonical_id",
            "item",
        }.issubset(payload.keys()):
            records.append(payload)

        for value in payload.values():
            records.extend(_extract_item_records(value))

    elif isinstance(payload, list):
        for value in payload:
            records.extend(_extract_item_records(value))

    return records


def _item_type_from_jsonld(item_jsonld: dict[str, Any]) -> str:
    t = item_jsonld.get("@type")
    if isinstance(t, list):
        t = t[0] if t else None
    if not isinstance(t, str):
        return "reference"

    local = t.split(":")[-1]
    if local in {"Action", "ReadAction", "PlanAction"}:
        return "action"
    if local == "Project":
        return "project"
    return "reference"


def _item_name(record: dict[str, Any]) -> str:
    item_jsonld = record.get("item")
    if isinstance(item_jsonld, dict):
        if isinstance(item_jsonld.get("name"), str) and item_jsonld["name"].strip():
            return item_jsonld["name"].strip()
        # Actions often use rawCapture rather than name.
        props = item_jsonld.get("additionalProperty")
        if isinstance(props, list):
            for entry in props:
                if (
                    isinstance(entry, dict)
                    and entry.get("propertyID") == "app:rawCapture"
                    and isinstance(entry.get("value"), str)
                    and entry["value"].strip()
                ):
                    return entry["value"].strip()

    canonical_id = record.get("canonical_id")
    return canonical_id if isinstance(canonical_id, str) else "(unnamed)"


def _created_items_from_cli_payload(payload: dict[str, Any]) -> list[CreatedItemRef]:
    if payload.get("ok") is False:
        raw_error = payload.get("error")
        error: dict[str, Any]
        if isinstance(raw_error, dict):
            error = raw_error
        else:
            error = {}

        raw_message = error.get("message")
        message = raw_message if isinstance(raw_message, str) else "CLI failed"
        raise RuntimeError(message)

    data = payload.get("data", {})
    records = _extract_item_records(data)

    seen: set[str] = set()
    out: list[CreatedItemRef] = []
    for record in records:
        canonical_id = record.get("canonical_id")
        if not isinstance(canonical_id, str) or canonical_id in seen:
            continue
        seen.add(canonical_id)
        item_jsonld = record.get("item")
        item_type = (
            _item_type_from_jsonld(item_jsonld)
            if isinstance(item_jsonld, dict)
            else "reference"
        )
        out.append(
            CreatedItemRef(
                canonical_id=canonical_id,
                name=_item_name(record),
                item_type=item_type,
            )
        )

    return out


def _merge_created_items(created_lists: list[list[CreatedItemRef]]) -> list[CreatedItemRef]:
    out: list[CreatedItemRef] = []
    seen: set[str] = set()

    for created in created_lists:
        for item in created:
            if item.canonical_id in seen:
                continue
            seen.add(item.canonical_id)
            out.append(item)

    return out


async def execute_tool(
    tool_call: ToolCallInput,
    conversation_id: str,
    auth: AuthContext,
    client: object | None = None,  # noqa: ARG001 - compatibility with existing call sites/tests
) -> list[CreatedItemRef]:
    """Execute a single approved copilot_cli tool call via subprocess."""
    del client
    commands = _normalize_commands(tool_call, conversation_id)
    cli_base, cwd = _resolve_cli_command()

    env = os.environ.copy()
    env["COPILOT_TOKEN"] = auth.token
    if auth.org_id:
        env["COPILOT_ORG_ID"] = auth.org_id
    env.setdefault("COPILOT_HOST", os.getenv("BACKEND_URL", "http://localhost:8000"))

    created_batches: list[list[CreatedItemRef]] = []

    for argv in commands:
        process = await asyncio.create_subprocess_exec(
            *cli_base,
            *argv,
            cwd=cwd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await process.communicate()

        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")

        if process.returncode != 0:
            detail = stderr.strip() or stdout.strip() or "unknown error"
            command = " ".join(argv[:4])
            raise RuntimeError(
                f"copilot_cli failed with exit code {process.returncode} "
                f"while running '{command}...': {detail}"
            )

        payload = _parse_json_from_stdout(stdout)
        created_batches.append(_created_items_from_cli_payload(payload))

    return _merge_created_items(created_batches)
