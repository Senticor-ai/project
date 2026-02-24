"""Unit tests for LLM provider validation helpers."""

from __future__ import annotations

import httpx
import pytest

from app.llm_validation import ProviderValidationError, probe_provider_status


def _json_response(method: str, url: str, status: int, payload: dict) -> httpx.Response:
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request(method, url),
    )


@pytest.mark.unit
def test_probe_openrouter_success(monkeypatch):
    def _mock_request(method, url, **kwargs):
        if url.endswith("/key"):
            return _json_response(
                method,
                url,
                200,
                {"data": {"usage": 5.0, "limit": 20.0}},
            )
        if url.endswith("/models"):
            return _json_response(
                method,
                url,
                200,
                {
                    "data": [
                        {"id": "google/gemini-3-flash-preview"},
                        {"id": "openai/gpt-4o-mini"},
                    ]
                },
            )
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("app.llm_validation.httpx.request", _mock_request)

    status = probe_provider_status(
        provider="openrouter",
        model="google/gemini-3-flash-preview",
        api_key="or-key",
        strict=False,
    )

    assert status.status == "ok"
    assert status.model_available is True
    assert status.credits_remaining_usd == 15.0
    assert status.credits_limit_usd == 20.0
    assert status.credits_used_usd == 5.0


@pytest.mark.unit
def test_probe_openrouter_raises_when_model_missing(monkeypatch):
    def _mock_request(method, url, **kwargs):
        if url.endswith("/key"):
            return _json_response(
                method,
                url,
                200,
                {"data": {"usage": 1.0, "limit": 20.0}},
            )
        if url.endswith("/models"):
            return _json_response(method, url, 200, {"data": [{"id": "openai/gpt-4o"}]})
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("app.llm_validation.httpx.request", _mock_request)

    with pytest.raises(ProviderValidationError, match="not available"):
        probe_provider_status(
            provider="openrouter",
            model="google/gemini-3-flash-preview",
            api_key="or-key",
            strict=False,
        )


@pytest.mark.unit
def test_probe_openai_strict_hits_model_and_completion(monkeypatch):
    calls: list[tuple[str, str]] = []

    def _mock_request(method, url, **kwargs):
        calls.append((method, url))
        if "/models/" in url:
            return _json_response(method, url, 200, {"id": "gpt-4o-mini"})
        if url.endswith("/chat/completions"):
            return _json_response(
                method,
                url,
                200,
                {"id": "cmpl_1", "choices": [{"message": {"content": "pong"}}]},
            )
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("app.llm_validation.httpx.request", _mock_request)

    status = probe_provider_status(
        provider="openai",
        model="openai/gpt-4o-mini",
        api_key="oa-key",
        strict=True,
    )

    assert status.status == "ok"
    assert status.model == "gpt-4o-mini"
    assert ("GET", "https://api.openai.com/v1/models/gpt-4o-mini") in calls
    assert ("POST", "https://api.openai.com/v1/chat/completions") in calls
