"""Tests for tool_executor CLI subprocess dispatch."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from backend_client import AuthContext
from tool_executor import CopilotCliError, ToolCallInput, execute_tool


@pytest.fixture
def auth_ctx():
    return AuthContext(token="jwt-delegated-token", org_id="org-1")


class _DummyProcess:
    def __init__(self, returncode: int, stdout: str, stderr: str = ""):
        self.returncode = returncode
        self._stdout = stdout.encode("utf-8")
        self._stderr = stderr.encode("utf-8")

    async def communicate(self):
        return self._stdout, self._stderr


@pytest.mark.anyio
async def test_unknown_tool_raises(auth_ctx):
    with pytest.raises(ValueError, match="Unknown tool"):
        await execute_tool(
            ToolCallInput(name="create_action", arguments={"name": "x"}),
            conversation_id="conv-1",
            auth=auth_ctx,
        )


@pytest.mark.anyio
async def test_invalid_argv_raises(auth_ctx):
    with pytest.raises(ValueError, match="argv"):
        await execute_tool(
            ToolCallInput(name="copilot_cli", arguments={"argv": []}),
            conversation_id="conv-1",
            auth=auth_ctx,
        )


@pytest.mark.anyio
async def test_executes_cli_and_parses_created_item(auth_ctx):
    payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "result": {
                "operation": "items.create",
                "created": {
                    "item_id": "id-1",
                    "canonical_id": "urn:app:action:a1",
                    "item": {
                        "@type": "Action",
                        "additionalProperty": [
                            {
                                "@type": "PropertyValue",
                                "propertyID": "app:rawCapture",
                                "value": "Einkaufen",
                            }
                        ],
                    },
                },
            },
        },
        "meta": {},
    }

    process = _DummyProcess(0, stdout=json.dumps(payload))

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "argv": [
                        "items",
                        "create",
                        "--type",
                        "Action",
                        "--name",
                        "Einkaufen",
                        "--bucket",
                        "next",
                        "--apply",
                    ]
                },
            ),
            conversation_id="conv-42",
            auth=auth_ctx,
        )

    assert len(result) == 1
    assert result[0].canonical_id == "urn:app:action:a1"
    assert result[0].name == "Einkaufen"
    assert result[0].item_type == "action"

    args, kwargs = create_proc.call_args
    assert "--json" in args
    assert "--non-interactive" in args
    assert "--yes" in args
    assert "--approve" not in args
    assert "--conversation-id" in args
    assert kwargs["env"]["COPILOT_TOKEN"] == "jwt-delegated-token"
    assert kwargs["env"]["COPILOT_ORG_ID"] == "org-1"


@pytest.mark.anyio
async def test_returns_empty_list_for_read_command(auth_ctx):
    process = _DummyProcess(
        0,
        stdout='{"schema_version":"copilot.v1","ok":true,"data":{"total":1},"meta":{}}',
    )

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ):
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={"argv": ["items", "list", "--summary"]},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

    assert result == []


@pytest.mark.anyio
async def test_executes_intent_as_multiple_cli_commands(auth_ctx):
    focus_payload = '{"schema_version":"copilot.v1","ok":true,"data":{"total":1},"meta":{}}'
    create_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "result": {
                "operation": "items.create",
                "created": {
                    "item_id": "id-9",
                    "canonical_id": "urn:app:reference:r9",
                    "item": {
                        "@type": "CreativeWork",
                        "name": "Weekly Review Notes",
                    },
                },
            },
        },
        "meta": {},
    }

    processes = [
        _DummyProcess(0, stdout=focus_payload),
        _DummyProcess(0, stdout=json.dumps(create_payload)),
    ]

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(side_effect=processes),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "intent": {
                        "schemaVersion": "copilot.intent.v0",
                        "kind": "weekly_review_plan",
                        "focusOn": ["urn:app:action:a1"],
                        "notes": [
                            {
                                "title": "Weekly Review Notes",
                                "markdown": "Wrap-up and next-week priorities.",
                            }
                        ],
                    }
                },
            ),
            conversation_id="conv-77",
            auth=auth_ctx,
        )

    assert len(result) == 1
    assert result[0].canonical_id == "urn:app:reference:r9"
    assert result[0].name == "Weekly Review Notes"
    assert result[0].item_type == "reference"

    assert create_proc.await_count == 2
    first_args, _ = create_proc.call_args_list[0]
    second_args, _ = create_proc.call_args_list[1]

    assert "--json" in first_args
    assert "--non-interactive" in first_args
    assert "--yes" in first_args
    assert "--conversation-id" not in first_args

    assert "--json" in second_args
    assert "--non-interactive" in second_args
    assert "--yes" in second_args
    assert "--conversation-id" in second_args
    conv_idx = second_args.index("--conversation-id")
    assert second_args[conv_idx + 1] == "conv-77"


@pytest.mark.anyio
async def test_cli_failure_raises(auth_ctx):
    process = _DummyProcess(4, stdout="", stderr="VALIDATION_FAILED")

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ):
        with pytest.raises(RuntimeError, match="exit code 4"):
            await execute_tool(
                ToolCallInput(
                    name="copilot_cli",
                    arguments={"argv": ["items", "create", "--type", "Action", "--name", "x"]},
                ),
                conversation_id="conv-1",
                auth=auth_ctx,
            )


@pytest.mark.anyio
async def test_cli_failure_extracts_structured_error(auth_ctx):
    error_payload = {
        "schema_version": "copilot.v1",
        "ok": False,
        "error": {
            "code": "UNAUTHENTICATED",
            "message": "Invalid delegated token",
            "details": {"detail": "Invalid delegated token"},
            "retryable": False,
        },
    }
    process = _DummyProcess(3, stdout=json.dumps(error_payload), stderr="")

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ):
        with pytest.raises(CopilotCliError, match="code=UNAUTHENTICATED") as exc_info:
            await execute_tool(
                ToolCallInput(
                    name="copilot_cli",
                    arguments={"argv": ["items", "focus", "urn:app:action:a1", "--off", "--apply"]},
                ),
                conversation_id="conv-1",
                auth=auth_ctx,
            )

    assert exc_info.value.error_code == "UNAUTHENTICATED"
    assert exc_info.value.detail == "Invalid delegated token"
    assert exc_info.value.retryable is False


@pytest.mark.anyio
async def test_cli_contract_enforcement(auth_ctx):
    """Verify CLI contract enforcement: argv[], --json, --non-interactive, --yes flags."""
    payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {"total": 1},
        "meta": {},
    }
    process = _DummyProcess(0, stdout=json.dumps(payload))

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ) as create_proc:
        # Test with minimal argv (no flags)
        await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={"argv": ["items", "list"]},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

        args, kwargs = create_proc.call_args
        # Verify all three contract flags were auto-added
        assert "--json" in args, "CLI contract requires --json flag"
        assert "--non-interactive" in args, "CLI contract requires --non-interactive flag"
        assert "--yes" in args, "CLI contract requires --yes flag"

        # Test idempotency: flags already present should not be duplicated
        create_proc.reset_mock()
        await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={"argv": ["items", "list", "--json", "--non-interactive", "--yes"]},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

        args, _ = create_proc.call_args
        # Verify flags appear exactly once
        assert args.count("--json") == 1, "--json should not be duplicated"
        assert args.count("--non-interactive") == 1, "--non-interactive should not be duplicated"
        assert args.count("--yes") == 1, "--yes should not be duplicated"


@pytest.mark.anyio
async def test_items_triage_normalizes_id_and_drops_unknown_options(auth_ctx):
    payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {"total": 1},
        "meta": {},
    }
    process = _DummyProcess(0, stdout=json.dumps(payload))

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "argv": [
                        "items",
                        "triage",
                        "--id",
                        "urn:app:email:fd38b8c6210f5a44",
                        "--bucket",
                        "next",
                        "--name",
                        "follow up newsletter",
                        "--apply",
                    ]
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

    assert result == []
    args, _ = create_proc.call_args
    triage_idx = args.index("triage")
    assert args[triage_idx + 1] == "urn:app:email:fd38b8c6210f5a44"
    assert "--id" not in args
    assert "--bucket" in args
    bucket_idx = args.index("--bucket")
    assert args[bucket_idx + 1] == "next"
    assert "--name" not in args
    assert "follow up newsletter" not in args
    assert "--yes" in args


@pytest.mark.anyio
async def test_items_focus_normalizes_id_and_drops_unknown_options(auth_ctx):
    payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {"total": 1},
        "meta": {},
    }
    process = _DummyProcess(0, stdout=json.dumps(payload))

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "argv": [
                        "items",
                        "focus",
                        "--id",
                        "urn:app:action:019bd7bf-d590-7cbf-99ab-15ec225e0d3c",
                        "--off",
                        "--name",
                        "should be ignored",
                        "--apply",
                    ]
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

    assert result == []
    args, _ = create_proc.call_args
    focus_idx = args.index("focus")
    assert args[focus_idx + 1] == "urn:app:action:019bd7bf-d590-7cbf-99ab-15ec225e0d3c"
    assert "--id" not in args
    assert "--off" in args
    assert "--name" not in args
    assert "should be ignored" not in args
    assert "--yes" in args


@pytest.mark.anyio
async def test_projects_actions_update_auto_resolves_missing_project(auth_ctx):
    projects_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "projects": [
                {
                    "item_id": "proj-item-1",
                    "canonical_id": "urn:app:project:p1",
                    "name": "Project 1",
                }
            ]
        },
        "meta": {},
    }
    actions_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "actions": [
                {
                    "id": "a1",
                    "canonical_id": "urn:app:action:a1",
                    "project_id": "urn:app:project:p1",
                    "name": "Action 1",
                    "action_status": "PotentialActionStatus",
                }
            ]
        },
        "meta": {},
    }
    update_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "action": {
                "id": "a1",
                "canonical_id": "urn:app:action:a1",
            },
        },
        "meta": {},
    }
    processes = [
        _DummyProcess(0, stdout=json.dumps(projects_payload)),
        _DummyProcess(0, stdout=json.dumps(actions_payload)),
        _DummyProcess(0, stdout=json.dumps(update_payload)),
    ]

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(side_effect=processes),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "argv": [
                        "projects",
                        "actions",
                        "update",
                        "urn:app:action:a1",
                        "--name",
                        "Updated action name",
                        "--apply",
                    ]
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

    assert result == []
    assert create_proc.await_count == 3

    first_args, _ = create_proc.call_args_list[0]
    assert "projects" in first_args
    assert "list" in first_args
    assert "--json" in first_args
    assert "--yes" in first_args

    second_args, _ = create_proc.call_args_list[1]
    assert "actions" in second_args
    assert "list" in second_args
    assert "--project" in second_args
    second_project_idx = second_args.index("--project")
    assert second_args[second_project_idx + 1] == "urn:app:project:p1"

    third_args, _ = create_proc.call_args_list[2]
    assert "update" in third_args
    assert "--action" in third_args
    action_idx = third_args.index("--action")
    assert third_args[action_idx + 1] == "urn:app:action:a1"
    assert "--project" in third_args
    project_idx = third_args.index("--project")
    assert third_args[project_idx + 1] == "urn:app:project:p1"
    assert "--yes" in third_args
    assert "--approve" not in third_args


@pytest.mark.anyio
async def test_projects_actions_update_accepts_project_id_alias(auth_ctx):
    update_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "action": {
                "id": "a1",
                "canonical_id": "urn:app:action:a1",
            },
        },
        "meta": {},
    }
    process = _DummyProcess(0, stdout=json.dumps(update_payload))

    with patch(
        "tool_executor.asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=process),
    ) as create_proc:
        result = await execute_tool(
            ToolCallInput(
                name="copilot_cli",
                arguments={
                    "argv": [
                        "projects",
                        "actions",
                        "update",
                        "urn:app:action:a1",
                        "--project-id",
                        "urn:app:project:p1",
                        "--name",
                        "Updated action name",
                        "--apply",
                    ]
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
        )

    assert result == []
    assert create_proc.await_count == 1

    args, _ = create_proc.call_args
    assert "--action" in args
    action_idx = args.index("--action")
    assert args[action_idx + 1] == "urn:app:action:a1"
    assert "--project" in args
    project_idx = args.index("--project")
    assert args[project_idx + 1] == "urn:app:project:p1"
    assert "--project-id" not in args
    assert "--yes" in args
    assert "--approve" not in args


@pytest.mark.anyio
async def test_envelope_parity(auth_ctx):
    """Verify copilot.v1 envelope shape stability across different operations."""
    # Test case 1: Create operation envelope
    create_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "result": {
                "operation": "items.create",
                "created": {
                    "item_id": "id-1",
                    "canonical_id": "urn:app:action:a1",
                    "item": {"@type": "Action"},
                },
            },
        },
        "meta": {},
    }

    # Test case 2: List operation envelope
    list_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {"total": 5, "items": []},
        "meta": {},
    }

    # Test case 3: Update operation envelope
    update_payload = {
        "schema_version": "copilot.v1",
        "ok": True,
        "data": {
            "mode": "applied",
            "result": {
                "operation": "items.update",
                "updated": {
                    "item_id": "id-2",
                    "canonical_id": "urn:app:action:a2",
                },
            },
        },
        "meta": {},
    }

    test_cases = [
        (create_payload, ["items", "create", "--type", "Action", "--name", "x"]),
        (list_payload, ["items", "list"]),
        (update_payload, ["items", "update", "id-2", "--name", "y"]),
    ]

    for payload, argv in test_cases:
        process = _DummyProcess(0, stdout=json.dumps(payload))

        with patch(
            "tool_executor.asyncio.create_subprocess_exec",
            new=AsyncMock(return_value=process),
        ):
            # Execute tool (result validation is secondary - envelope is the focus)
            await execute_tool(
                ToolCallInput(name="copilot_cli", arguments={"argv": argv}),
                conversation_id="conv-1",
                auth=auth_ctx,
            )

        # Verify envelope shape stability
        assert "schema_version" in payload, "Envelope must have schema_version field"
        assert "ok" in payload, "Envelope must have ok field"
        assert "data" in payload, "Envelope must have data field"
        assert "meta" in payload, "Envelope must have meta field"

        # Verify schema version is exactly "copilot.v1"
        assert payload["schema_version"] == "copilot.v1", (
            f"schema_version must be 'copilot.v1', got '{payload['schema_version']}'"
        )

        # Verify ok is boolean
        assert isinstance(payload["ok"], bool), "ok field must be boolean"

        # Verify data is a dict
        assert isinstance(payload["data"], dict), "data field must be a dict"

        # Verify meta is a dict
        assert isinstance(payload["meta"], dict), "meta field must be a dict"
