"""Tool executor for approved Copilot CLI tool calls."""

from __future__ import annotations

import asyncio
import json
import os
import shlex
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from backend_client import AuthContext, CreatedItemRef
from intent_contract import compile_intent_to_argv

REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_DIR = REPO_ROOT / "packages" / "core"


class ToolCallInput(BaseModel):
    """Input from the frontend's accepted tool call."""

    name: str
    arguments: dict


class CopilotCliError(RuntimeError):
    """Structured failure for copilot_cli subprocess calls."""

    def __init__(
        self,
        *,
        return_code: int,
        command: str,
        detail: str,
        error_code: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        self.return_code = return_code
        self.command = command
        self.detail = detail
        self.error_code = error_code
        self.retryable = retryable

        display_detail = detail
        if error_code:
            display_detail = f"{display_detail} (code={error_code})"

        super().__init__(
            f"copilot_cli failed with exit code {return_code} "
            f"while running '{command}...': {display_detail}"
        )


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

    return ["npm", "--prefix", str(CORE_DIR), "run", "copilot", "--silent", "--"], str(REPO_ROOT)


def _has_option(argv: list[str], option: str) -> bool:
    prefix = f"{option}="
    return any(arg == option or arg.startswith(prefix) for arg in argv)


def _split_option_token(token: str) -> tuple[str, str | None]:
    if "=" not in token:
        return token, None
    option, inline_value = token.split("=", 1)
    return option, inline_value


def _normalize_option_aliases(argv: list[str]) -> list[str]:
    alias_map = {
        "--project-id": "--project",
        "--action-id": "--action",
    }
    normalized: list[str] = []
    for arg in argv:
        replacement = None
        for alias, canonical in alias_map.items():
            if arg == alias:
                replacement = canonical
                break
            alias_prefix = f"{alias}="
            if arg.startswith(alias_prefix):
                replacement = f"{canonical}={arg[len(alias_prefix):]}"
                break
        normalized.append(replacement if replacement is not None else arg)
    return normalized


def _option_value(argv: list[str], option: str) -> str | None:
    prefix = f"{option}="
    for idx, arg in enumerate(argv):
        if arg == option:
            if idx + 1 < len(argv):
                return argv[idx + 1]
            return None
        if arg.startswith(prefix):
            return arg[len(prefix) :]
    return None


def _promote_project_action_positionals(argv: list[str], args_start_idx: int) -> list[str]:
    """Promote legacy positional ids to --project/--action flags."""
    if _has_option(argv, "--project") and _has_option(argv, "--action"):
        return argv

    prefix = argv[:args_start_idx]
    tail = argv[args_start_idx:]

    positional: list[str] = []
    while tail and not tail[0].startswith("-"):
        positional.append(tail.pop(0))

    has_project = _has_option(argv, "--project")
    has_action = _has_option(argv, "--action")
    injected: list[str] = []

    # Legacy forms:
    # - projects actions update <action-id> ...
    # - projects actions update <project-id> <action-id> ...
    if not has_project and positional and (has_action or len(positional) >= 2):
        injected.extend(["--project", positional.pop(0)])
        has_project = True
    if not has_action and positional:
        injected.extend(["--action", positional.pop(0)])

    return prefix + injected + positional + tail


def _normalize_projects_actions_argv(argv: list[str]) -> list[str]:
    if len(argv) < 3 or argv[0] != "projects" or argv[1] != "actions":
        return argv

    sub = argv[2]
    if sub in {"get", "history", "update", "transition"}:
        return _promote_project_action_positionals(argv, args_start_idx=3)

    if sub == "comments" and len(argv) >= 4 and argv[3] in {"add", "reply"}:
        return _promote_project_action_positionals(argv, args_start_idx=4)

    return argv


def _normalize_items_subcommand_argv(
    argv: list[str],
    subcommand: str,
    *,
    value_option_order: tuple[str, ...],
    flag_option_order: tuple[str, ...],
) -> list[str]:
    if len(argv) < 2 or argv[0] != "items" or argv[1] != subcommand:
        return argv

    value_options = set(value_option_order)
    flag_options = set(flag_option_order)

    positional_id: str | None = None
    id_from_option: str | None = None
    option_values: dict[str, str] = {}
    seen_flags: set[str] = set()

    i = 2
    while i < len(argv):
        token = argv[i]
        if token.startswith("--"):
            option, inline_value = _split_option_token(token)

            if option == "--id":
                option_value = inline_value
                if option_value is None and i + 1 < len(argv):
                    option_value = argv[i + 1]
                    i += 1
                if option_value:
                    id_from_option = option_value
            elif option in value_options:
                option_value = inline_value
                if option_value is None and i + 1 < len(argv):
                    option_value = argv[i + 1]
                    i += 1
                if option_value is not None:
                    option_values[option] = option_value
            elif option in flag_options:
                seen_flags.add(option)
            else:
                # Drop unknown options (and likely option values) to avoid CLI parser errors.
                if inline_value is None and i + 1 < len(argv) and not argv[i + 1].startswith("-"):
                    i += 1
        elif positional_id is None:
            positional_id = token
        i += 1

    normalized = ["items", subcommand]
    item_id = id_from_option or positional_id
    if item_id:
        normalized.append(item_id)

    for option in value_option_order:
        value = option_values.get(option)
        if value is not None:
            normalized.extend([option, value])

    for option in flag_option_order:
        if option in seen_flags:
            normalized.append(option)

    return normalized


def _normalize_items_argv(argv: list[str]) -> list[str]:
    if len(argv) < 2 or argv[0] != "items":
        return argv

    if argv[1] == "triage":
        return _normalize_items_subcommand_argv(
            argv,
            "triage",
            value_option_order=("--bucket",),
            flag_option_order=("--propose", "--apply"),
        )
    if argv[1] == "focus":
        return _normalize_items_subcommand_argv(
            argv,
            "focus",
            value_option_order=(),
            flag_option_order=("--on", "--off", "--propose", "--apply"),
        )

    return argv


def _requires_project_and_action(argv: list[str]) -> bool:
    if len(argv) < 3 or argv[0] != "projects" or argv[1] != "actions":
        return False

    sub = argv[2]
    if sub in {"get", "history", "update", "transition"}:
        return True

    return sub == "comments" and len(argv) >= 4 and argv[3] in {"add", "reply"}


def _with_required_cli_flags(argv: list[str], conversation_id: str) -> list[str]:
    normalized = _normalize_option_aliases(list(argv))
    normalized = _normalize_projects_actions_argv(normalized)
    normalized = _normalize_items_argv(normalized)
    normalized = [arg for arg in normalized if arg != "--approve"]

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


def _extract_cli_error(stdout: str, stderr: str) -> tuple[str, str | None, bool | None]:
    """Prefer structured copilot.v1 error envelope details when available."""

    fallback_detail = stderr.strip() or stdout.strip() or "unknown error"
    for raw_text in (stderr.strip(), stdout.strip()):
        if not raw_text:
            continue
        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError:
            continue

        if not isinstance(payload, dict) or payload.get("ok") is not False:
            continue

        error = payload.get("error")
        if not isinstance(error, dict):
            continue

        message = error.get("message")
        detail = (
            message.strip()
            if isinstance(message, str) and message.strip()
            else fallback_detail
        )

        details = error.get("details")
        detail_text = details.get("detail") if isinstance(details, dict) else None
        if isinstance(detail_text, str):
            detail_text = detail_text.strip()
            if detail_text and detail_text != detail:
                detail = f"{detail} ({detail_text})"

        error_code = error.get("code")
        retryable = error.get("retryable")
        return (
            detail,
            error_code if isinstance(error_code, str) and error_code else None,
            retryable if isinstance(retryable, bool) else None,
        )

    return fallback_detail, None, None


async def _run_cli_process(
    cli_base: list[str],
    argv: list[str],
    cwd: str,
    env: dict[str, str],
) -> tuple[int, str, str]:
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
    if process.returncode is None:
        raise RuntimeError("copilot_cli subprocess terminated without a return code")
    return process.returncode, stdout, stderr


async def _run_cli_json(
    cli_base: list[str],
    argv: list[str],
    cwd: str,
    env: dict[str, str],
) -> dict[str, Any]:
    normalized = list(argv)
    if "--json" not in normalized:
        normalized.append("--json")
    if "--non-interactive" not in normalized:
        normalized.append("--non-interactive")
    if "--yes" not in normalized:
        normalized.append("--yes")

    return_code, stdout, stderr = await _run_cli_process(cli_base, normalized, cwd, env)
    if return_code != 0:
        detail, error_code, retryable = _extract_cli_error(stdout, stderr)
        command = " ".join(normalized[:6])
        raise CopilotCliError(
            return_code=return_code,
            command=command,
            detail=detail,
            error_code=error_code,
            retryable=retryable,
        )

    return _parse_json_from_stdout(stdout)


async def _resolve_project_id_for_action(
    action_id: str,
    cli_base: list[str],
    cwd: str,
    env: dict[str, str],
    action_project_cache: dict[str, str],
) -> str | None:
    if action_id in action_project_cache:
        return action_project_cache[action_id]

    try:
        projects_payload = await _run_cli_json(
            cli_base,
            ["projects", "list"],
            cwd,
            env,
        )
    except RuntimeError:
        return None

    data = projects_payload.get("data")
    if not isinstance(data, dict):
        return None
    projects = data.get("projects")
    if not isinstance(projects, list):
        return None

    seen_projects: set[str] = set()
    for project in projects:
        if not isinstance(project, dict):
            continue

        candidate_ids: list[str] = []
        for key in ("canonical_id", "item_id"):
            value = project.get(key)
            if isinstance(value, str) and value and value not in candidate_ids:
                candidate_ids.append(value)

        for project_id in candidate_ids:
            if project_id in seen_projects:
                continue
            seen_projects.add(project_id)

            try:
                actions_payload = await _run_cli_json(
                    cli_base,
                    ["projects", "actions", "list", "--project", project_id],
                    cwd,
                    env,
                )
            except RuntimeError:
                continue

            actions_data = actions_payload.get("data")
            if not isinstance(actions_data, dict):
                continue
            actions = actions_data.get("actions")
            if not isinstance(actions, list):
                continue

            for action in actions:
                if not isinstance(action, dict):
                    continue
                resolved_project_id = action.get("project_id")
                if not isinstance(resolved_project_id, str) or not resolved_project_id:
                    resolved_project_id = project_id

                action_pk = action.get("id")
                if isinstance(action_pk, str) and action_pk:
                    action_project_cache[action_pk] = resolved_project_id

                action_canonical = action.get("canonical_id")
                if isinstance(action_canonical, str) and action_canonical:
                    action_project_cache[action_canonical] = resolved_project_id

            if action_id in action_project_cache:
                return action_project_cache[action_id]

    return action_project_cache.get(action_id)


async def _maybe_fill_missing_project_id(
    argv: list[str],
    cli_base: list[str],
    cwd: str,
    env: dict[str, str],
    action_project_cache: dict[str, str],
) -> list[str]:
    if not _requires_project_and_action(argv):
        return argv
    if _has_option(argv, "--project"):
        return argv

    action_id = _option_value(argv, "--action")
    if not action_id:
        return argv

    project_id = await _resolve_project_id_for_action(
        action_id=action_id,
        cli_base=cli_base,
        cwd=cwd,
        env=env,
        action_project_cache=action_project_cache,
    )
    if not project_id:
        return argv

    return [*argv, "--project", project_id]


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


def _action_ref_from_projection(payload: dict[str, Any]) -> CreatedItemRef | None:
    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    candidate = data.get("projection")
    if not isinstance(candidate, dict):
        candidate = data.get("action")
    if not isinstance(candidate, dict):
        return None

    canonical_id = candidate.get("canonical_id")
    if not isinstance(canonical_id, str) or not canonical_id.strip():
        return None

    raw_name = candidate.get("name")
    name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else canonical_id

    return CreatedItemRef(canonical_id=canonical_id, name=name, item_type="action")


def _is_projects_actions_create(argv: list[str] | None) -> bool:
    if not argv or len(argv) < 3:
        return False
    return argv[0] == "projects" and argv[1] == "actions" and argv[2] == "create"


def _created_items_from_cli_payload(
    payload: dict[str, Any],
    argv: list[str] | None = None,
) -> list[CreatedItemRef]:
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

    if not records and _is_projects_actions_create(argv):
        action_ref = _action_ref_from_projection(payload)
        if action_ref:
            return [action_ref]

    seen: set[str] = set()
    out: list[CreatedItemRef] = []
    for record in records:
        canonical_id = record.get("canonical_id")
        if not isinstance(canonical_id, str) or canonical_id in seen:
            continue
        seen.add(canonical_id)
        item_jsonld = record.get("item")
        item_type = (
            _item_type_from_jsonld(item_jsonld) if isinstance(item_jsonld, dict) else "reference"
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
    action_project_cache: dict[str, str] = {}

    for argv in commands:
        final_argv = await _maybe_fill_missing_project_id(
            argv=argv,
            cli_base=cli_base,
            cwd=cwd,
            env=env,
            action_project_cache=action_project_cache,
        )

        return_code, stdout, stderr = await _run_cli_process(
            cli_base=cli_base,
            argv=final_argv,
            cwd=cwd,
            env=env,
        )

        if return_code != 0:
            detail, error_code, retryable = _extract_cli_error(stdout, stderr)
            command = " ".join(final_argv[:6])
            raise CopilotCliError(
                return_code=return_code,
                command=command,
                detail=detail,
                error_code=error_code,
                retryable=retryable,
            )

        payload = _parse_json_from_stdout(stdout)
        created_batches.append(_created_items_from_cli_payload(payload, final_argv))

    return _merge_created_items(created_batches)
