"""Tests for tool_executor CLI subprocess dispatch."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from backend_client import AuthContext
from tool_executor import ToolCallInput, execute_tool


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
