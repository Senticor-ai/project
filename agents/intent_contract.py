"""Draft Copilot intent contract and CLI argv compiler.

This module defines a high-level intent schema (v0 draft) and compiles
validated intent payloads into deterministic senticor-copilot argv arrays.
"""

from __future__ import annotations

from typing import Any

INTENT_SCHEMA_VERSION = "copilot.intent.v0"

INTENT_KIND_WEEKLY_REVIEW = "weekly_review_plan"
INTENT_KIND_JOB_SEARCH = "job_search_create_reference"
INTENT_KIND_TAX_MISSING_DOCS = "tax_missing_documents_plan"

INTENT_KINDS = [
    INTENT_KIND_WEEKLY_REVIEW,
    INTENT_KIND_JOB_SEARCH,
    INTENT_KIND_TAX_MISSING_DOCS,
]

BUCKETS_ALL = ["inbox", "next", "waiting", "calendar", "someday", "reference"]
BUCKETS_TAX_MISSING_DOCS = ["next", "waiting"]


def _intent_ref(kind: str) -> dict[str, str]:
    return {"$ref": f"#/$defs/{kind}"}


COPILOT_INTENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "schemaVersion": {
            "type": "string",
            "enum": [INTENT_SCHEMA_VERSION],
        },
        "kind": {
            "type": "string",
            "enum": INTENT_KINDS,
        },
    },
    "required": ["schemaVersion", "kind"],
    "allOf": [
        {
            "if": {"properties": {"kind": {"const": INTENT_KIND_WEEKLY_REVIEW}}},
            "then": _intent_ref(INTENT_KIND_WEEKLY_REVIEW),
        },
        {
            "if": {"properties": {"kind": {"const": INTENT_KIND_JOB_SEARCH}}},
            "then": _intent_ref(INTENT_KIND_JOB_SEARCH),
        },
        {
            "if": {"properties": {"kind": {"const": INTENT_KIND_TAX_MISSING_DOCS}}},
            "then": _intent_ref(INTENT_KIND_TAX_MISSING_DOCS),
        },
    ],
    "$defs": {
        INTENT_KIND_WEEKLY_REVIEW: {
            "type": "object",
            "properties": {
                "focusOn": {"type": "array", "items": {"type": "string"}},
                "focusOff": {"type": "array", "items": {"type": "string"}},
                "triage": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "itemId": {"type": "string"},
                            "bucket": {"type": "string", "enum": BUCKETS_ALL},
                        },
                        "required": ["itemId", "bucket"],
                        "additionalProperties": False,
                    },
                },
                "schedule": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "date": {"type": "string"},
                            "time": {"type": "string"},
                        },
                        "required": ["name"],
                        "additionalProperties": False,
                    },
                },
                "notes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "markdown": {"type": "string"},
                        },
                        "required": ["title", "markdown"],
                        "additionalProperties": False,
                    },
                },
            },
            "additionalProperties": False,
        },
        INTENT_KIND_JOB_SEARCH: {
            "type": "object",
            "properties": {
                "projectId": {"type": "string"},
                "name": {"type": "string"},
                "markdown": {"type": "string"},
            },
            "required": ["projectId", "name", "markdown"],
            "additionalProperties": False,
        },
        INTENT_KIND_TAX_MISSING_DOCS: {
            "type": "object",
            "properties": {
                "projectId": {"type": "string"},
                "entries": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "bucket": {
                                "type": "string",
                                "enum": BUCKETS_TAX_MISSING_DOCS,
                            },
                            "description": {"type": "string"},
                        },
                        "required": ["name", "bucket"],
                        "additionalProperties": False,
                    },
                    "minItems": 1,
                },
            },
            "required": ["entries"],
            "additionalProperties": False,
        },
    },
    "additionalProperties": False,
}


COPILOT_CLI_TOOL_PARAMETERS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "argv": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "description": (
                'CLI argv ohne Shell-String, z.B. ["items","create","--type","Action",'
                '"--name","Steuerberater anrufen","--bucket","next","--apply"]'
            ),
        },
        "intent": COPILOT_INTENT_SCHEMA,
    },
    "anyOf": [
        {"required": ["argv"]},
        {"required": ["intent"]},
    ],
    "additionalProperties": False,
}


def _as_non_empty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _as_optional_non_empty_string(value: Any, field: str) -> str | None:
    if value is None:
        return None
    return _as_non_empty_string(value, field)


def _as_string_list(value: Any, field: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field} must be an array")

    out: list[str] = []
    for idx, raw in enumerate(value):
        out.append(_as_non_empty_string(raw, f"{field}[{idx}]"))
    return out


def _as_object_list(value: Any, field: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field} must be an array")

    out: list[dict[str, Any]] = []
    for idx, raw in enumerate(value):
        if not isinstance(raw, dict):
            raise ValueError(f"{field}[{idx}] must be an object")
        out.append(raw)
    return out


def _require_bucket(value: Any, field: str, allowed: set[str]) -> str:
    bucket = _as_non_empty_string(value, field)
    if bucket not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(sorted(allowed))}")
    return bucket


def _compile_weekly_review_intent(intent: dict[str, Any]) -> list[list[str]]:
    commands: list[list[str]] = []

    focus_on = _as_string_list(intent.get("focusOn"), "focusOn")
    for item_id in focus_on:
        commands.append(["items", "focus", item_id, "--on", "--apply"])

    focus_off = _as_string_list(intent.get("focusOff"), "focusOff")
    for item_id in focus_off:
        commands.append(["items", "focus", item_id, "--off", "--apply"])

    triage_entries = _as_object_list(intent.get("triage"), "triage")
    for idx, entry in enumerate(triage_entries):
        item_id = _as_non_empty_string(entry.get("itemId"), f"triage[{idx}].itemId")
        bucket = _require_bucket(
            entry.get("bucket"),
            f"triage[{idx}].bucket",
            set(BUCKETS_ALL),
        )
        commands.append(["items", "triage", item_id, "--bucket", bucket, "--apply"])

    schedule_entries = _as_object_list(intent.get("schedule"), "schedule")
    for idx, entry in enumerate(schedule_entries):
        name = _as_non_empty_string(entry.get("name"), f"schedule[{idx}].name")
        description = _as_optional_non_empty_string(
            entry.get("description"),
            f"schedule[{idx}].description",
        )
        date = _as_optional_non_empty_string(entry.get("date"), f"schedule[{idx}].date")
        time = _as_optional_non_empty_string(entry.get("time"), f"schedule[{idx}].time")

        lines: list[str] = []
        if description:
            lines.append(description)
        if date:
            lines.append(f"Date: {date}")
        if time:
            lines.append(f"Time: {time}")
        merged_description = "\n".join(lines)

        command = [
            "items",
            "create",
            "--type",
            "Action",
            "--name",
            name,
            "--bucket",
            "calendar",
        ]
        if merged_description:
            command.extend(["--description", merged_description])
        command.append("--apply")
        commands.append(command)

    notes = _as_object_list(intent.get("notes"), "notes")
    for idx, note in enumerate(notes):
        title = _as_non_empty_string(note.get("title"), f"notes[{idx}].title")
        markdown = _as_non_empty_string(note.get("markdown"), f"notes[{idx}].markdown")
        commands.append(
            [
                "items",
                "create",
                "--type",
                "CreativeWork",
                "--name",
                title,
                "--bucket",
                "reference",
                "--description",
                markdown,
                "--apply",
            ]
        )

    if not commands:
        raise ValueError(
            "weekly_review_plan intent must include at least one of "
            "focusOn, focusOff, triage, schedule, or notes"
        )

    return commands


def _compile_job_search_intent(intent: dict[str, Any]) -> list[list[str]]:
    project_id = _as_non_empty_string(intent.get("projectId"), "projectId")
    name = _as_non_empty_string(intent.get("name"), "name")
    markdown = _as_non_empty_string(intent.get("markdown"), "markdown")

    return [
        [
            "items",
            "create",
            "--type",
            "CreativeWork",
            "--name",
            name,
            "--description",
            markdown,
            "--project",
            project_id,
            "--bucket",
            "reference",
            "--apply",
        ]
    ]


def _compile_tax_missing_docs_intent(intent: dict[str, Any]) -> list[list[str]]:
    entries = _as_object_list(intent.get("entries"), "entries")
    if not entries:
        raise ValueError("tax_missing_documents_plan.entries must include at least one item")

    project_id = _as_optional_non_empty_string(intent.get("projectId"), "projectId")
    commands: list[list[str]] = []

    for idx, entry in enumerate(entries):
        name = _as_non_empty_string(entry.get("name"), f"entries[{idx}].name")
        bucket = _require_bucket(
            entry.get("bucket"),
            f"entries[{idx}].bucket",
            set(BUCKETS_TAX_MISSING_DOCS),
        )
        description = _as_optional_non_empty_string(
            entry.get("description"),
            f"entries[{idx}].description",
        )

        command = [
            "items",
            "create",
            "--type",
            "Action",
            "--name",
            name,
            "--bucket",
            bucket,
        ]
        if description:
            command.extend(["--description", description])
        if project_id:
            command.extend(["--project", project_id])
        command.append("--apply")
        commands.append(command)

    return commands


def compile_intent_to_argv(intent: dict[str, Any]) -> list[list[str]]:
    """Compile a draft v0 intent payload into one or more CLI argv commands."""
    if not isinstance(intent, dict):
        raise ValueError("intent must be an object")

    schema_version = intent.get("schemaVersion")
    if schema_version != INTENT_SCHEMA_VERSION:
        raise ValueError(
            f"intent.schemaVersion must be {INTENT_SCHEMA_VERSION!r}; got {schema_version!r}"
        )

    kind = _as_non_empty_string(intent.get("kind"), "kind")
    if kind not in INTENT_KINDS:
        raise ValueError(f"Unsupported intent kind: {kind}")

    if kind == INTENT_KIND_WEEKLY_REVIEW:
        commands = _compile_weekly_review_intent(intent)
    elif kind == INTENT_KIND_JOB_SEARCH:
        commands = _compile_job_search_intent(intent)
    elif kind == INTENT_KIND_TAX_MISSING_DOCS:
        commands = _compile_tax_missing_docs_intent(intent)
    else:
        raise ValueError(f"Unsupported intent kind: {kind}")

    if len(commands) > 25:
        raise ValueError("intent expands to too many commands (max 25)")

    return commands
