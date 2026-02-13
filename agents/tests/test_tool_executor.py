"""Tests for tool_executor — dispatches tool calls and creates items via backend API."""

from unittest.mock import AsyncMock

import pytest

from backend_client import AuthContext, BackendClient
from tool_executor import ToolCallInput, execute_tool


@pytest.fixture
def auth_ctx():
    return AuthContext(
        token="jwt-delegated-token",
        org_id="org-1",
    )


@pytest.fixture
def mock_client():
    return AsyncMock(spec=BackendClient)


def _make_item_response(canonical_id: str) -> dict:
    return {
        "item_id": f"id-{canonical_id}",
        "canonical_id": canonical_id,
        "source": "tay",
        "item": {"@id": canonical_id},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# create_project_with_actions
# ---------------------------------------------------------------------------


class TestCreateProjectWithActions:
    @pytest.mark.anyio
    async def test_creates_project_then_actions_then_docs(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            side_effect=[
                _make_item_response("urn:app:project:p1"),
                _make_item_response("urn:app:action:a1"),
                _make_item_response("urn:app:action:a2"),
                _make_item_response("urn:app:reference:r1"),
            ]
        )

        result = await execute_tool(
            ToolCallInput(
                name="create_project_with_actions",
                arguments={
                    "project": {"name": "Umzug", "desiredOutcome": "Neue Wohnung"},
                    "actions": [
                        {"name": "Kartons besorgen", "bucket": "next"},
                        {"name": "Strom ummelden", "bucket": "waiting"},
                    ],
                    "documents": [{"name": "Checkliste"}],
                },
            ),
            conversation_id="conv-42",
            auth=auth_ctx,
            client=mock_client,
        )

        # 4 items created total
        assert len(result) == 4
        assert result[0].item_type == "project"
        assert result[0].canonical_id == "urn:app:project:p1"
        assert result[0].name == "Umzug"
        assert result[1].item_type == "action"
        assert result[1].name == "Kartons besorgen"
        assert result[2].item_type == "action"
        assert result[2].name == "Strom ummelden"
        assert result[3].item_type == "reference"
        assert result[3].name == "Checkliste"

        # Verify 4 create_item calls
        assert mock_client.create_item.call_count == 4

    @pytest.mark.anyio
    async def test_actions_have_project_refs(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            side_effect=[
                _make_item_response("urn:app:project:p1"),
                _make_item_response("urn:app:action:a1"),
            ]
        )

        await execute_tool(
            ToolCallInput(
                name="create_project_with_actions",
                arguments={
                    "project": {"name": "P", "desiredOutcome": "D"},
                    "actions": [{"name": "A1", "bucket": "next"}],
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        # Second call is the action — verify its JSON-LD has projectRefs
        action_jsonld = mock_client.create_item.call_args_list[1].args[0]
        props = {p["propertyID"]: p["value"] for p in action_jsonld["additionalProperty"]}
        assert props["app:projectRefs"] == ["urn:app:project:p1"]

    @pytest.mark.anyio
    async def test_without_documents(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            side_effect=[
                _make_item_response("urn:app:project:p1"),
                _make_item_response("urn:app:action:a1"),
            ]
        )

        result = await execute_tool(
            ToolCallInput(
                name="create_project_with_actions",
                arguments={
                    "project": {"name": "P", "desiredOutcome": "D"},
                    "actions": [{"name": "A1", "bucket": "next"}],
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        assert len(result) == 2
        assert mock_client.create_item.call_count == 2


# ---------------------------------------------------------------------------
# create_action
# ---------------------------------------------------------------------------


class TestCreateAction:
    @pytest.mark.anyio
    async def test_basic(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(return_value=_make_item_response("urn:app:action:a1"))

        result = await execute_tool(
            ToolCallInput(
                name="create_action",
                arguments={"name": "Einkaufen", "bucket": "next"},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        assert len(result) == 1
        assert result[0].item_type == "action"
        assert result[0].name == "Einkaufen"
        assert result[0].canonical_id == "urn:app:action:a1"

    @pytest.mark.anyio
    async def test_with_project_id(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(return_value=_make_item_response("urn:app:action:a1"))

        await execute_tool(
            ToolCallInput(
                name="create_action",
                arguments={
                    "name": "Task",
                    "bucket": "next",
                    "projectId": "urn:app:project:p1",
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        action_jsonld = mock_client.create_item.call_args.args[0]
        props = {p["propertyID"]: p["value"] for p in action_jsonld["additionalProperty"]}
        assert props["app:projectRefs"] == ["urn:app:project:p1"]

    @pytest.mark.anyio
    async def test_defaults_bucket_to_next(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(return_value=_make_item_response("urn:app:action:a1"))

        await execute_tool(
            ToolCallInput(
                name="create_action",
                arguments={"name": "Task"},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        action_jsonld = mock_client.create_item.call_args.args[0]
        props = {p["propertyID"]: p["value"] for p in action_jsonld["additionalProperty"]}
        assert props["app:bucket"] == "next"


# ---------------------------------------------------------------------------
# create_reference
# ---------------------------------------------------------------------------


class TestCreateReference:
    @pytest.mark.anyio
    async def test_basic(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:r1")
        )

        result = await execute_tool(
            ToolCallInput(
                name="create_reference",
                arguments={"name": "Styleguide"},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        assert len(result) == 1
        assert result[0].item_type == "reference"
        assert result[0].name == "Styleguide"

    @pytest.mark.anyio
    async def test_with_url(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:r1")
        )

        await execute_tool(
            ToolCallInput(
                name="create_reference",
                arguments={"name": "Link", "url": "https://example.com"},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        ref_jsonld = mock_client.create_item.call_args.args[0]
        assert ref_jsonld["url"] == "https://example.com"

    @pytest.mark.anyio
    async def test_with_description(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:r1")
        )

        await execute_tool(
            ToolCallInput(
                name="create_reference",
                arguments={"name": "Doc", "description": "A useful doc"},
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        ref_jsonld = mock_client.create_item.call_args.args[0]
        assert ref_jsonld["description"] == "A useful doc"

    @pytest.mark.anyio
    async def test_with_project_id(self, auth_ctx, mock_client):
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:r1")
        )

        await execute_tool(
            ToolCallInput(
                name="create_reference",
                arguments={
                    "name": "Tailored CV",
                    "description": "# Wolfgang Ihloff\n\nProduct Leader...",
                    "projectId": "urn:app:project:p1",
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        ref_jsonld = mock_client.create_item.call_args.args[0]
        props = {p["propertyID"]: p["value"] for p in ref_jsonld["additionalProperty"]}
        assert props["app:projectRefs"] == ["urn:app:project:p1"]
        assert ref_jsonld["description"] == "# Wolfgang Ihloff\n\nProduct Leader..."


# ---------------------------------------------------------------------------
# render_cv
# ---------------------------------------------------------------------------


class TestRenderCv:
    @pytest.mark.anyio
    async def test_reads_source_then_renders_pdf(self, auth_ctx, mock_client):
        """render_cv reads markdown from source item, renders PDF, creates reference."""
        mock_client.get_item_content = AsyncMock(
            return_value={
                "name": "Tailored CV",
                "description": "# Wolfgang Ihloff\n\n## Experience\n\n- Adobe",
            }
        )
        mock_client.render_pdf = AsyncMock(return_value={"file_id": "file-abc123"})
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:pdf1")
        )

        result = await execute_tool(
            ToolCallInput(
                name="render_cv",
                arguments={
                    "sourceItemId": "urn:app:reference:md1",
                    "css": "body { font-family: Inter; }",
                    "filename": "lebenslauf-anthropic.pdf",
                    "projectId": "urn:app:project:p1",
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        # 1. Read source item
        mock_client.get_item_content.assert_called_once_with("urn:app:reference:md1", auth_ctx)

        # 2. Render PDF with markdown content
        mock_client.render_pdf.assert_called_once_with(
            markdown="# Wolfgang Ihloff\n\n## Experience\n\n- Adobe",
            css="body { font-family: Inter; }",
            filename="lebenslauf-anthropic.pdf",
            auth=auth_ctx,
        )

        # 3. Create file reference
        assert mock_client.create_item.call_count == 1
        ref_jsonld = mock_client.create_item.call_args.args[0]
        props = {p["propertyID"]: p["value"] for p in ref_jsonld["additionalProperty"]}
        assert props["app:fileId"] == "file-abc123"
        assert props["app:downloadUrl"] == "/files/file-abc123"
        assert props["app:projectRefs"] == ["urn:app:project:p1"]

        # Return value
        assert len(result) == 1
        assert result[0].item_type == "reference"
        assert result[0].name == "lebenslauf-anthropic.pdf"

    @pytest.mark.anyio
    async def test_falls_back_to_file_content(self, auth_ctx, mock_client):
        """render_cv uses file_content when description is empty (uploaded file)."""
        mock_client.get_item_content = AsyncMock(
            return_value={
                "name": "CV.md",
                "description": None,
                "file_content": "# CV from file\n\n## Skills\n\n- Python",
            }
        )
        mock_client.render_pdf = AsyncMock(return_value={"file_id": "file-xyz"})
        mock_client.create_item = AsyncMock(
            return_value=_make_item_response("urn:app:reference:pdf2")
        )

        result = await execute_tool(
            ToolCallInput(
                name="render_cv",
                arguments={
                    "sourceItemId": "urn:app:reference:uploaded-cv",
                    "css": "body { font-family: Inter; }",
                    "filename": "cv-rendered.pdf",
                    "projectId": "urn:app:project:p1",
                },
            ),
            conversation_id="conv-1",
            auth=auth_ctx,
            client=mock_client,
        )

        # Should use file_content since description is None
        mock_client.render_pdf.assert_called_once_with(
            markdown="# CV from file\n\n## Skills\n\n- Python",
            css="body { font-family: Inter; }",
            filename="cv-rendered.pdf",
            auth=auth_ctx,
        )
        assert len(result) == 1
        assert result[0].name == "cv-rendered.pdf"

    @pytest.mark.anyio
    async def test_raises_when_source_has_no_content(self, auth_ctx, mock_client):
        """render_cv raises ValueError when source has neither description nor file_content."""
        mock_client.get_item_content = AsyncMock(
            return_value={"name": "Empty", "description": None, "file_content": None}
        )

        with pytest.raises(ValueError, match="no description or file content"):
            await execute_tool(
                ToolCallInput(
                    name="render_cv",
                    arguments={
                        "sourceItemId": "urn:app:reference:empty",
                        "css": "",
                        "filename": "test.pdf",
                        "projectId": "urn:app:project:p1",
                    },
                ),
                conversation_id="conv-1",
                auth=auth_ctx,
                client=mock_client,
            )


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    @pytest.mark.anyio
    async def test_unknown_tool_raises_error(self, auth_ctx, mock_client):
        with pytest.raises(ValueError, match="Unknown tool"):
            await execute_tool(
                ToolCallInput(name="unknown_tool", arguments={}),
                conversation_id="conv-1",
                auth=auth_ctx,
                client=mock_client,
            )
