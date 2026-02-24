"""Tests for BackendClient — httpx-based client for backend Items API."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from backend_client import AuthContext, BackendClient


@pytest.fixture
def auth_ctx():
    return AuthContext(
        token="jwt-tok-abc123",
        org_id="org-1",
    )


@pytest.fixture
def mock_response():
    resp = MagicMock(spec=httpx.Response)
    resp.json.return_value = {
        "item_id": "id-1",
        "canonical_id": "urn:app:action:uuid-1",
        "source": "senticor-copilot",
        "item": {"@id": "urn:app:action:uuid-1"},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    resp.raise_for_status = MagicMock()
    return resp


def _make_mock_client(mock_response):
    """Create a mock httpx.AsyncClient context manager."""
    instance = AsyncMock()
    instance.post.return_value = mock_response
    instance.__aenter__ = AsyncMock(return_value=instance)
    instance.__aexit__ = AsyncMock(return_value=False)
    return instance


class TestBackendClient:
    @pytest.mark.anyio
    async def test_create_item_sends_correct_request(self, auth_ctx, mock_response):
        mock_client = _make_mock_client(mock_response)
        jsonld = {"@id": "urn:app:action:x", "@type": "Action"}

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            result = await client.create_item(jsonld, auth_ctx)

        mock_client.post.assert_called_once()
        call_kwargs = mock_client.post.call_args
        assert call_kwargs.args[0] == "http://test:8000/items"
        assert call_kwargs.kwargs["json"] == {"item": jsonld, "source": "senticor-copilot"}
        assert result["canonical_id"] == "urn:app:action:uuid-1"

    @pytest.mark.anyio
    async def test_create_item_sends_bearer_token(self, auth_ctx, mock_response):
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth_ctx)

        headers = mock_client.post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer jwt-tok-abc123"

    @pytest.mark.anyio
    async def test_create_item_sets_agent_header(self, auth_ctx, mock_response):
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth_ctx)

        headers = mock_client.post.call_args.kwargs["headers"]
        assert headers["X-Agent"] == "senticor-copilot"

    @pytest.mark.anyio
    async def test_create_item_forwards_org_id(self, auth_ctx, mock_response):
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth_ctx)

        headers = mock_client.post.call_args.kwargs["headers"]
        assert headers["X-Org-Id"] == "org-1"

    @pytest.mark.anyio
    async def test_create_item_without_org_id(self, mock_response):
        auth = AuthContext(token="jwt-tok-1", org_id=None)
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth)

        headers = mock_client.post.call_args.kwargs["headers"]
        assert "X-Org-Id" not in headers
        # Bearer token should still be present
        assert headers["Authorization"] == "Bearer jwt-tok-1"

    @pytest.mark.anyio
    async def test_create_item_does_not_send_cookies(self, auth_ctx, mock_response):
        """Bearer tokens replace cookie-based auth — no cookies should be sent."""
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth_ctx)

        call_kwargs = mock_client.post.call_args.kwargs
        assert "cookies" not in call_kwargs

    @pytest.mark.anyio
    async def test_create_item_raises_on_http_error(self, auth_ctx):
        mock_client = AsyncMock()
        error_resp = MagicMock(spec=httpx.Response)
        error_resp.status_code = 401
        error_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=error_resp
        )
        mock_client.post.return_value = error_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            with pytest.raises(httpx.HTTPStatusError):
                await client.create_item({"@id": "x"}, auth_ctx)

    @pytest.mark.anyio
    async def test_create_item_custom_source(self, auth_ctx, mock_response):
        mock_client = _make_mock_client(mock_response)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            await client.create_item({"@id": "x"}, auth_ctx, source="ai-copilot")

        body = mock_client.post.call_args.kwargs["json"]
        assert body["source"] == "ai-copilot"


class TestListWorkspaceOverview:
    @pytest.mark.anyio
    async def test_parses_items_into_overview(self, auth_ctx):
        """list_workspace_overview groups items by bucket and extracts projects."""
        items_response = [
            {
                "item": {
                    "@id": "urn:app:project:p1",
                    "@type": "Project",
                    "name": "Tax 2024",
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:desiredOutcome",
                            "value": "File taxes",
                        }
                    ],
                },
            },
            {
                "item": {
                    "@id": "urn:app:action:a1",
                    "@type": "Action",
                    "name": "",
                    "endTime": None,
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:bucket",
                            "value": "next",
                        },
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:rawCapture",
                            "value": "Buy milk",
                        },
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:isFocused",
                            "value": True,
                        },
                    ],
                },
            },
            {
                "item": {
                    "@id": "urn:app:reference:r1",
                    "@type": "DigitalDocument",
                    "name": "CV.pdf",
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:bucket",
                            "value": "reference",
                        }
                    ],
                },
            },
        ]
        resp = MagicMock(spec=httpx.Response)
        resp.json.return_value = items_response
        resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get.return_value = resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            result = await client.list_workspace_overview(auth_ctx)

        assert len(result["projects"]) == 1
        assert result["projects"][0]["name"] == "Tax 2024"
        assert result["total_items"] == 3
        assert "next" in result["items_by_bucket"]
        assert "reference" in result["items_by_bucket"]
        assert result["bucket_counts"]["next"] == 1
        assert result["bucket_counts"]["reference"] == 1
        assert len(result["focused_items"]) == 1
        assert result["focused_items"][0]["name"] == "Buy milk"
        assert result["focused_items"][0]["is_focused"] is True

    @pytest.mark.anyio
    async def test_caps_items_per_bucket(self, auth_ctx):
        """list_workspace_overview caps at 20 items per bucket."""
        items_response = [
            {
                "item": {
                    "@id": f"urn:app:action:a{i}",
                    "@type": "Action",
                    "name": f"Action {i}",
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "propertyID": "app:bucket",
                            "value": "next",
                        }
                    ],
                },
            }
            for i in range(30)
        ]
        resp = MagicMock(spec=httpx.Response)
        resp.json.return_value = items_response
        resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get.return_value = resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend_client.httpx.AsyncClient", return_value=mock_client):
            client = BackendClient(base_url="http://test:8000")
            result = await client.list_workspace_overview(auth_ctx)

        assert len(result["items_by_bucket"]["next"]) == 20
        assert result["bucket_counts"]["next"] == 30
        assert result["total_items"] == 30
