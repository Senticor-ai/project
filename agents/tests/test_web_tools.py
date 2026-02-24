"""Tests for read-only external web tools."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch


def _tool_fn(name: str):
    from web_tools import build_web_read_tools

    for tool in build_web_read_tools():
        if tool.name == name:
            return tool.function
    raise AssertionError(f"Tool not found: {name}")


def test_build_web_read_tools_names():
    from web_tools import build_web_read_tools

    names = [tool.name for tool in build_web_read_tools()]
    assert names == ["web_search", "web_fetch"]


def test_web_search_requires_api_key():
    with patch.dict("os.environ", {"SEARCHAPI_API_KEY": ""}, clear=False):
        output = _tool_fn("web_search")(query="Haystack 2.24.0")

    payload = json.loads(output)
    assert payload["error"]["code"] == "SEARCH_DISABLED"


def test_web_fetch_rejects_url_not_in_allowlist():
    with patch.dict(
        "os.environ",
        {"COPILOT_WEBFETCH_ALLOWLIST": "project.localhost,docs.example.com"},
        clear=False,
    ):
        output = _tool_fn("web_fetch")(url="https://evil.example.net/page")

    payload = json.loads(output)
    assert payload["error"]["code"] == "WEBFETCH_NOT_ALLOWLISTED"


def test_url_allowed_supports_global_wildcard():
    from web_tools import _url_allowed

    assert _url_allowed("https://anything.example.net/page", ["*"]) is True


def test_url_allowed_supports_subdomain_wildcard():
    from web_tools import _url_allowed

    assert _url_allowed("https://service.bund.de/page", ["*.bund.de"]) is True
    assert _url_allowed("https://bund.de/page", ["*.bund.de"]) is True


def test_web_fetch_returns_extracted_text_for_allowlisted_url():
    mock_response = MagicMock()
    mock_response.url = "https://docs.example.com/page"
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "text/html; charset=utf-8"}
    mock_response.text = (
        "<html><head><title>Shared Doc</title></head>"
        "<body><h1>Welcome</h1><p>Useful content.</p></body></html>"
    )

    mock_client = MagicMock()
    mock_client.get.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with (
        patch.dict("os.environ", {"COPILOT_WEBFETCH_ALLOWLIST": "docs.example.com"}, clear=False),
        patch("web_tools.httpx.Client", return_value=mock_client),
    ):
        output = _tool_fn("web_fetch")(url="https://docs.example.com/page")

    payload = json.loads(output)
    assert payload["statusCode"] == 200
    assert payload["title"] == "Shared Doc"
    assert "Welcome Useful content." in payload["content"]
