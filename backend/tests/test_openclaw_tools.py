"""Tests for OpenClaw tool definitions (OpenAI function-calling schemas)."""

from __future__ import annotations

import pytest

from app.chat.openclaw_tools import OPENCLAW_TOOLS

pytestmark = pytest.mark.unit

EXPECTED_TOOL_NAMES = {"create_project_with_actions", "create_action", "create_reference"}
EXPECTED_BUCKETS = {"inbox", "next", "waiting", "calendar", "someday"}


def _tool_by_name(name: str) -> dict:
    """Look up a tool definition by function name."""
    for tool in OPENCLAW_TOOLS:
        if tool["function"]["name"] == name:
            return tool
    raise KeyError(f"Tool {name!r} not found")


def _params(name: str) -> dict:
    """Shortcut to get parameters schema for a tool."""
    return _tool_by_name(name)["function"]["parameters"]


class TestToolListStructure:
    def test_exactly_three_tools(self):
        assert len(OPENCLAW_TOOLS) == 3

    def test_all_tools_are_function_type(self):
        for tool in OPENCLAW_TOOLS:
            assert tool["type"] == "function"

    def test_tool_names_match_expected(self):
        names = {tool["function"]["name"] for tool in OPENCLAW_TOOLS}
        assert names == EXPECTED_TOOL_NAMES

    def test_all_tools_have_description(self):
        for tool in OPENCLAW_TOOLS:
            assert tool["function"]["description"]

    def test_all_tools_have_type_const_matching_name(self):
        for tool in OPENCLAW_TOOLS:
            name = tool["function"]["name"]
            props = _params(name)["properties"]
            assert props["type"]["const"] == name


class TestCreateProjectWithActions:
    def test_required_fields(self):
        required = _params("create_project_with_actions")["required"]
        assert "type" in required
        assert "project" in required
        assert "actions" in required

    def test_project_requires_name_and_desired_outcome(self):
        project_schema = _params("create_project_with_actions")["properties"]["project"]
        assert "name" in project_schema["properties"]
        assert "desiredOutcome" in project_schema["properties"]
        assert set(project_schema["required"]) == {"name", "desiredOutcome"}

    def test_actions_is_array_with_name_and_bucket(self):
        actions_schema = _params("create_project_with_actions")["properties"]["actions"]
        assert actions_schema["type"] == "array"
        item_props = actions_schema["items"]["properties"]
        assert "name" in item_props
        assert "bucket" in item_props
        assert set(actions_schema["items"]["required"]) == {"name", "bucket"}

    def test_documents_is_optional_array(self):
        params = _params("create_project_with_actions")
        assert "documents" not in params.get("required", [])
        docs_schema = params["properties"]["documents"]
        assert docs_schema["type"] == "array"
        assert "name" in docs_schema["items"]["required"]


class TestCreateAction:
    def test_required_fields(self):
        required = _params("create_action")["required"]
        assert set(required) == {"type", "name", "bucket"}

    def test_bucket_enum_matches_domain(self):
        bucket_schema = _params("create_action")["properties"]["bucket"]
        assert set(bucket_schema["enum"]) == EXPECTED_BUCKETS

    def test_project_id_is_optional(self):
        params = _params("create_action")
        assert "projectId" in params["properties"]
        assert "projectId" not in params["required"]


class TestCreateReference:
    def test_required_fields(self):
        required = _params("create_reference")["required"]
        assert set(required) == {"type", "name"}

    def test_url_is_optional(self):
        params = _params("create_reference")
        assert "url" in params["properties"]
        assert "url" not in params["required"]

    def test_description_is_optional(self):
        params = _params("create_reference")
        assert "description" in params["properties"]
        assert "description" not in params["required"]
