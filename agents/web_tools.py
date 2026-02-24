"""Read-only web tools for Copilot (SearchAPI + allowlisted web fetch)."""

from __future__ import annotations

import json
import os
import re
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

import httpx
from haystack.tools import Tool


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:  # noqa: ARG002
        if tag.lower() in {"script", "style"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return _collapse_whitespace(" ".join(self._parts))


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _parse_positive_int(
    raw: Any,
    *,
    default: int,
    min_value: int,
    max_value: int,
    field: str,
) -> int:
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be an integer") from exc
    if value < min_value or value > max_value:
        raise ValueError(f"{field} must be between {min_value} and {max_value}")
    return value


def _extract_html_title(html: str) -> str | None:
    match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return _collapse_whitespace(unescape(match.group(1)))


def _extract_html_text(html: str) -> str:
    parser = _HtmlTextExtractor()
    parser.feed(html)
    parser.close()
    return parser.text()


def _read_allowlist() -> list[str]:
    raw = os.getenv("COPILOT_WEBFETCH_ALLOWLIST", "")
    entries = [entry.strip().rstrip("/") for entry in raw.split(",")]
    return [entry for entry in entries if entry]


def _url_allowed(url: str, allowlist: list[str]) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower().strip()
    if not host:
        return False

    normalized_url = url.strip().lower().rstrip("/")
    for rule in allowlist:
        normalized_rule = rule.lower().strip()
        if not normalized_rule:
            continue
        if normalized_rule == "*":
            return True
        if normalized_rule.startswith("http://") or normalized_rule.startswith("https://"):
            if normalized_url.startswith(normalized_rule.rstrip("/")):
                return True
            continue

        if normalized_rule.startswith("*."):
            wildcard_domain = normalized_rule[2:].lstrip(".")
            if wildcard_domain and (
                host == wildcard_domain or host.endswith(f".{wildcard_domain}")
            ):
                return True
            continue

        normalized_rule = normalized_rule.lstrip(".")
        if host == normalized_rule or host.endswith(f".{normalized_rule}"):
            return True

    return False


def _safe_json_error(message: str, *, code: str, details: dict[str, Any] | None = None) -> str:
    payload: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details:
        payload["error"]["details"] = details
    return json.dumps(payload, ensure_ascii=False)


def _search_web(**kwargs: Any) -> str:
    query_raw = kwargs.get("query")
    query = query_raw.strip() if isinstance(query_raw, str) else ""
    if not query:
        return _safe_json_error(
            "query is required",
            code="SEARCH_QUERY_REQUIRED",
        )

    api_key = os.getenv("SEARCHAPI_API_KEY", "").strip()
    if not api_key:
        return _safe_json_error(
            "SEARCHAPI_API_KEY is not configured",
            code="SEARCH_DISABLED",
        )

    try:
        num_results = _parse_positive_int(
            kwargs.get("numResults"),
            default=5,
            min_value=1,
            max_value=10,
            field="numResults",
        )
    except ValueError as exc:
        return _safe_json_error(str(exc), code="SEARCH_BAD_REQUEST")

    timeout_seconds = float(os.getenv("SEARCHAPI_TIMEOUT_SECONDS", "12"))
    endpoint = os.getenv("SEARCHAPI_ENDPOINT", "https://www.searchapi.io/api/v1/search").strip()
    engine = kwargs.get("engine", "google")
    if not isinstance(engine, str) or not engine.strip():
        return _safe_json_error("engine must be a non-empty string", code="SEARCH_BAD_REQUEST")
    engine = engine.strip()

    params: dict[str, Any] = {
        "engine": engine,
        "q": query,
        "num": num_results,
        "api_key": api_key,
    }

    for optional_key in ("location", "hl", "gl"):
        value = kwargs.get(optional_key)
        if isinstance(value, str) and value.strip():
            params[optional_key] = value.strip()

    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
            response = client.get(endpoint, params=params)
    except Exception as exc:
        return _safe_json_error(
            "Search request failed",
            code="SEARCH_REQUEST_FAILED",
            details={"reason": str(exc)},
        )

    if response.status_code >= 400:
        return _safe_json_error(
            "Search API returned an error response",
            code="SEARCH_UPSTREAM_ERROR",
            details={"statusCode": response.status_code, "body": response.text[:500]},
        )

    try:
        payload = response.json()
    except ValueError as exc:
        return _safe_json_error(
            "Search API returned non-JSON response",
            code="SEARCH_BAD_RESPONSE",
            details={"reason": str(exc)},
        )

    raw_results = payload.get("organic_results")
    if not isinstance(raw_results, list):
        raw_results = []

    results: list[dict[str, Any]] = []
    for raw in raw_results[:num_results]:
        if not isinstance(raw, dict):
            continue
        title = raw.get("title")
        link = raw.get("link")
        snippet = raw.get("snippet")
        source = raw.get("source")
        if not isinstance(link, str) or not link.strip():
            continue
        results.append(
            {
                "title": title.strip() if isinstance(title, str) else None,
                "url": link.strip(),
                "snippet": snippet.strip() if isinstance(snippet, str) else None,
                "source": source.strip() if isinstance(source, str) else None,
            }
        )

    return json.dumps(
        {
            "query": query,
            "engine": engine,
            "results": results,
            "resultCount": len(results),
        },
        ensure_ascii=False,
    )


def _web_fetch(**kwargs: Any) -> str:
    url_raw = kwargs.get("url")
    url = url_raw.strip() if isinstance(url_raw, str) else ""
    if not url:
        return _safe_json_error("url is required", code="WEBFETCH_URL_REQUIRED")

    allowlist = _read_allowlist()
    if not allowlist:
        return _safe_json_error(
            "COPILOT_WEBFETCH_ALLOWLIST is not configured",
            code="WEBFETCH_DISABLED",
        )
    if not _url_allowed(url, allowlist):
        return _safe_json_error(
            "URL is not allowlisted",
            code="WEBFETCH_NOT_ALLOWLISTED",
            details={"url": url},
        )

    try:
        max_chars = _parse_positive_int(
            kwargs.get("maxChars"),
            default=int(os.getenv("COPILOT_WEBFETCH_MAX_CHARS", "12000")),
            min_value=500,
            max_value=50000,
            field="maxChars",
        )
    except ValueError as exc:
        return _safe_json_error(str(exc), code="WEBFETCH_BAD_REQUEST")

    timeout_seconds = float(os.getenv("COPILOT_WEBFETCH_TIMEOUT_SECONDS", "12"))

    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
            response = client.get(
                url,
                headers={
                    "User-Agent": "senticor-copilot-webfetch/1.0",
                    "Accept": "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
                },
            )
    except Exception as exc:
        return _safe_json_error(
            "Web fetch request failed",
            code="WEBFETCH_REQUEST_FAILED",
            details={"reason": str(exc)},
        )

    content_type = response.headers.get("content-type", "")
    text = response.text
    title: str | None = None

    if "text/html" in content_type.lower():
        title = _extract_html_title(text)
        text = _extract_html_text(text)
    else:
        text = _collapse_whitespace(text)

    truncated = len(text) > max_chars
    if truncated:
        text = text[:max_chars]

    return json.dumps(
        {
            "url": str(response.url),
            "statusCode": response.status_code,
            "contentType": content_type or None,
            "title": title,
            "content": text,
            "truncated": truncated,
        },
        ensure_ascii=False,
    )


def build_web_read_tools() -> list[Tool]:
    """Build read-only external web tools for Copilot."""
    return [
        Tool(
            name="web_search",
            description=(
                "Führe eine Websuche über SearchAPI aus und gib kompakte Treffer "
                "(Titel, URL, Snippet) zurück."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Suchanfrage"},
                    "numResults": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10,
                        "description": "Anzahl Treffer (1-10, Default 5)",
                    },
                    "engine": {
                        "type": "string",
                        "description": "SearchAPI Engine (Default: google)",
                    },
                    "location": {
                        "type": "string",
                        "description": "Optionaler Ortskontext (z.B. Germany)",
                    },
                    "hl": {
                        "type": "string",
                        "description": "Optionales Sprachkürzel (z.B. de)",
                    },
                    "gl": {
                        "type": "string",
                        "description": "Optionales Länderkürzel (z.B. de)",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            function=_search_web,
        ),
        Tool(
            name="web_fetch",
            description=(
                "Lese den Inhalt einer spezifischen, allowlist-konfigurierten URL "
                "und gib extrahierten Text zurück."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "HTTP(S)-URL, die in COPILOT_WEBFETCH_ALLOWLIST erlaubt ist",
                    },
                    "maxChars": {
                        "type": "integer",
                        "minimum": 500,
                        "maximum": 50000,
                        "description": "Maximale Zeichen im Inhalt (Default via Env)",
                    },
                },
                "required": ["url"],
                "additionalProperties": False,
            },
            function=_web_fetch,
        ),
    ]
