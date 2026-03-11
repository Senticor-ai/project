"""Tests for the OpenClaw tool executor (backend-inline item creation)."""

from __future__ import annotations

import asyncio
from functools import wraps
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.chat.tool_executor import (
    AuthContext,
    CreatedItemRef,
    _create_item,
    execute_tool,
)

# Note: not marked @pytest.mark.unit because importing app.rate_limit
# (via conftest autouse) requires module-level setup that conflicts with
# the unit-test socket blocker.  The respx-based _block_external_http
# fixture still prevents real HTTP.
#
# We use asyncio.run() via the @_sync decorator instead of @pytest.mark.anyio
# because the session-scoped uvicorn server in test_flow_playwright.py leaves
# a running event loop that makes anyio's get_runner() fail with
# "Cannot run the event loop while another loop is running".


def _sync(fn: Any) -> Any:
    """Convert async test to sync by running on a fresh thread.

    Playwright's sync API (test_flow_playwright.py) uses greenlets that
    leave an asyncio event loop visible to _get_running_loop() on the
    main thread.  Neither asyncio.run() nor loop.run_until_complete()
    work once that loop is set.  Running on a separate thread sidesteps
    the issue entirely.
    """

    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, fn(*args, **kwargs))
            return future.result()

    return wrapper


CONV_ID = "conv-test-123"
AUTH = AuthContext(token="jwt-tok-abc", org_id="org-1")
AUTH_NO_ORG = AuthContext(token="jwt-tok-abc", org_id=None)


def _mock_response(canonical_id: str) -> MagicMock:
    """Build a mock httpx.Response returning a canonical_id."""
    resp = MagicMock(spec=httpx.Response)
    resp.json.return_value = {"canonical_id": canonical_id}
    resp.raise_for_status = MagicMock()
    return resp


def _build_mock_client(responses: list[MagicMock]) -> AsyncMock:
    """Build a mock httpx.AsyncClient that returns responses in order."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=responses)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


# ---------------------------------------------------------------------------
# CreatedItemRef
# ---------------------------------------------------------------------------


class TestCreatedItemRef:
    def test_to_dict_serialization(self):
        ref = CreatedItemRef(
            canonical_id="urn:app:action:abc",
            name="My Task",
            item_type="action",
        )
        assert ref.to_dict() == {
            "canonicalId": "urn:app:action:abc",
            "name": "My Task",
            "type": "action",
        }

    def test_to_dict_uses_camel_case_keys(self):
        ref = CreatedItemRef(canonical_id="id", name="n", item_type="t")
        d = ref.to_dict()
        assert "canonicalId" in d
        assert "canonical_id" not in d


# ---------------------------------------------------------------------------
# _create_item
# ---------------------------------------------------------------------------


class TestCreateItem:
    @_sync
    async def test_posts_to_items_endpoint(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await _create_item({"@id": "test"}, AUTH)

        assert result == {"canonical_id": "urn:app:action:1"}
        call_kwargs = mock_client.post.call_args
        assert call_kwargs[0][0] == "http://localhost:8000/items"
        assert call_kwargs[1]["json"] == {"item": {"@id": "test"}, "source": "copilot"}

    @_sync
    async def test_sends_bearer_token(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            await _create_item({"@id": "test"}, AUTH)

        headers = mock_client.post.call_args[1]["headers"]
        assert headers["Authorization"] == "Bearer jwt-tok-abc"

    @_sync
    async def test_sends_x_agent_header(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            await _create_item({"@id": "test"}, AUTH)

        headers = mock_client.post.call_args[1]["headers"]
        assert headers["X-Agent"] == "copilot"

    @_sync
    async def test_forwards_org_id(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            await _create_item({"@id": "test"}, AUTH)

        headers = mock_client.post.call_args[1]["headers"]
        assert headers["X-Org-Id"] == "org-1"

    @_sync
    async def test_omits_org_id_when_none(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            await _create_item({"@id": "test"}, AUTH_NO_ORG)

        headers = mock_client.post.call_args[1]["headers"]
        assert "X-Org-Id" not in headers

    @_sync
    async def test_uses_port_from_env(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:1")])

        with (
            patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client),
            patch.dict("os.environ", {"PORT": "9999"}),
        ):
            await _create_item({"@id": "test"}, AUTH)

        url = mock_client.post.call_args[0][0]
        assert url == "http://localhost:9999/items"

    @_sync
    async def test_raises_on_http_error(self):
        error_resp = _mock_response("urn:app:action:1")
        error_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500 Server Error",
            request=MagicMock(),
            response=MagicMock(status_code=500),
        )
        mock_client = _build_mock_client([error_resp])

        with (
            patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client),
            pytest.raises(httpx.HTTPStatusError),
        ):
            await _create_item({"@id": "test"}, AUTH)


# ---------------------------------------------------------------------------
# execute_tool dispatch
# ---------------------------------------------------------------------------


class TestExecuteToolDispatch:
    @_sync
    async def test_unknown_tool_raises(self):
        with pytest.raises(ValueError, match="Unknown tool: bogus"):
            await execute_tool("bogus", {}, CONV_ID, AUTH)

    @_sync
    async def test_dispatches_create_action(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:a1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_action",
                {"name": "Task A", "bucket": "next"},
                CONV_ID,
                AUTH,
            )

        assert len(result) == 1
        assert result[0].item_type == "action"

    @_sync
    async def test_dispatches_create_reference(self):
        mock_client = _build_mock_client([_mock_response("urn:app:reference:r1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_reference",
                {"name": "My Ref"},
                CONV_ID,
                AUTH,
            )

        assert len(result) == 1
        assert result[0].item_type == "reference"

    @_sync
    async def test_dispatches_create_project_with_actions(self):
        mock_client = _build_mock_client(
            [
                _mock_response("urn:app:project:p1"),
                _mock_response("urn:app:action:a1"),
            ]
        )

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "P", "desiredOutcome": "Ship"},
                    "actions": [{"name": "Step 1", "bucket": "next"}],
                },
                CONV_ID,
                AUTH,
            )

        assert len(result) == 2
        assert result[0].item_type == "project"
        assert result[1].item_type == "action"


# ---------------------------------------------------------------------------
# create_action
# ---------------------------------------------------------------------------


class TestExecCreateAction:
    @_sync
    async def test_bucket_defaults_to_next(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:a1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_action",
                {"name": "No bucket specified"},
                CONV_ID,
                AUTH,
            )

        assert result[0].item_type == "action"
        body = mock_client.post.call_args[1]["json"]
        # Check the built JSON-LD has bucket "next"
        props = body["item"]["additionalProperty"]
        bucket_prop = next(p for p in props if p["propertyID"] == "app:bucket")
        assert bucket_prop["value"] == "next"

    @_sync
    async def test_with_explicit_project_id(self):
        mock_client = _build_mock_client([_mock_response("urn:app:action:a1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_action",
                {"name": "Task", "bucket": "inbox", "projectId": "urn:app:project:p1"},
                CONV_ID,
                AUTH,
            )

        assert result[0].canonical_id == "urn:app:action:a1"
        assert result[0].name == "Task"
        body = mock_client.post.call_args[1]["json"]
        props = body["item"]["additionalProperty"]
        proj_refs = next(p for p in props if p["propertyID"] == "app:projectRefs")
        assert proj_refs["value"] == ["urn:app:project:p1"]


# ---------------------------------------------------------------------------
# create_reference
# ---------------------------------------------------------------------------


class TestExecCreateReference:
    @_sync
    async def test_name_only(self):
        mock_client = _build_mock_client([_mock_response("urn:app:reference:r1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_reference",
                {"name": "My Note"},
                CONV_ID,
                AUTH,
            )

        assert result[0].name == "My Note"
        assert result[0].item_type == "reference"

    @_sync
    async def test_with_url_and_description(self):
        mock_client = _build_mock_client([_mock_response("urn:app:reference:r1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_reference",
                {"name": "Link", "url": "https://example.com", "description": "A site"},
                CONV_ID,
                AUTH,
            )

        assert result[0].canonical_id == "urn:app:reference:r1"
        body = mock_client.post.call_args[1]["json"]
        assert body["item"]["url"] == "https://example.com"
        assert body["item"]["description"] == "A site"


# ---------------------------------------------------------------------------
# create_project_with_actions
# ---------------------------------------------------------------------------


class TestExecCreateProjectWithActions:
    @_sync
    async def test_creates_project_then_actions_in_order(self):
        mock_client = _build_mock_client(
            [
                _mock_response("urn:app:project:p1"),
                _mock_response("urn:app:action:a1"),
                _mock_response("urn:app:action:a2"),
            ]
        )

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "Big Project", "desiredOutcome": "Done"},
                    "actions": [
                        {"name": "Step 1", "bucket": "next"},
                        {"name": "Step 2", "bucket": "someday"},
                    ],
                },
                CONV_ID,
                AUTH,
            )

        assert len(result) == 3
        assert result[0].item_type == "project"
        assert result[0].name == "Big Project"
        assert result[1].item_type == "action"
        assert result[1].name == "Step 1"
        assert result[2].item_type == "action"
        assert result[2].name == "Step 2"

    @_sync
    async def test_actions_linked_to_project_id(self):
        mock_client = _build_mock_client(
            [
                _mock_response("urn:app:project:p1"),
                _mock_response("urn:app:action:a1"),
            ]
        )

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "P", "desiredOutcome": "O"},
                    "actions": [{"name": "A", "bucket": "next"}],
                },
                CONV_ID,
                AUTH,
            )

        # Second call is the action — check it references the project
        action_call = mock_client.post.call_args_list[1]
        action_body = action_call[1]["json"]
        props = action_body["item"]["additionalProperty"]
        proj_refs = next(p for p in props if p["propertyID"] == "app:projectRefs")
        assert proj_refs["value"] == ["urn:app:project:p1"]

    @_sync
    async def test_includes_documents_as_references(self):
        mock_client = _build_mock_client(
            [
                _mock_response("urn:app:project:p1"),
                _mock_response("urn:app:reference:d1"),
            ]
        )

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "P", "desiredOutcome": "O"},
                    "actions": [],
                    "documents": [{"name": "Design Doc", "description": "Draft"}],
                },
                CONV_ID,
                AUTH,
            )

        assert len(result) == 2
        assert result[0].item_type == "project"
        assert result[1].item_type == "reference"
        assert result[1].name == "Design Doc"

    @_sync
    async def test_empty_actions_and_documents(self):
        mock_client = _build_mock_client([_mock_response("urn:app:project:p1")])

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "P", "desiredOutcome": "O"},
                    "actions": [],
                },
                CONV_ID,
                AUTH,
            )

        assert len(result) == 1
        assert result[0].item_type == "project"
        assert mock_client.post.call_count == 1

    @_sync
    async def test_full_workflow_project_actions_documents(self):
        mock_client = _build_mock_client(
            [
                _mock_response("urn:app:project:p1"),
                _mock_response("urn:app:action:a1"),
                _mock_response("urn:app:reference:d1"),
                _mock_response("urn:app:reference:d2"),
            ]
        )

        with patch("app.chat.tool_executor.httpx.AsyncClient", return_value=mock_client):
            result = await execute_tool(
                "create_project_with_actions",
                {
                    "project": {"name": "Launch", "desiredOutcome": "Shipped"},
                    "actions": [{"name": "Build it"}],
                    "documents": [
                        {"name": "Spec"},
                        {"name": "Checklist", "description": "QA steps"},
                    ],
                },
                CONV_ID,
                AUTH,
            )

        assert len(result) == 4
        types = [r.item_type for r in result]
        assert types == ["project", "action", "reference", "reference"]
        assert mock_client.post.call_count == 4
