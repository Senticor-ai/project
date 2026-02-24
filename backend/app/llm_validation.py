"""LLM provider validation helpers for Agent Setup."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENAI_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
REQUEST_TIMEOUT_SECONDS = 15.0
ANTHROPIC_VERSION = "2023-06-01"


class ProviderValidationError(ValueError):
    """Raised when provider validation fails."""


@dataclass(frozen=True)
class ProviderStatus:
    provider: str
    model: str
    status: str
    message: str
    model_available: bool
    credits_remaining_usd: float | None = None
    credits_used_usd: float | None = None
    credits_limit_usd: float | None = None
    checked_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def probe_provider_status(
    provider: str,
    model: str,
    api_key: str,
    *,
    strict: bool = False,
) -> ProviderStatus:
    """Validate key + model for a provider.

    strict=True enables a low-cost completion probe where available.
    """
    normalized_provider = provider.strip().lower()
    normalized_model = _normalize_model(normalized_provider, model)
    if not normalized_model:
        raise ProviderValidationError("Model must not be empty.")

    if normalized_provider == "openrouter":
        return _probe_openrouter(normalized_model, api_key, strict=strict)
    if normalized_provider == "openai":
        return _probe_openai(normalized_model, api_key, strict=strict)
    if normalized_provider == "anthropic":
        return _probe_anthropic(normalized_model, api_key, strict=strict)

    raise ProviderValidationError(f"Unsupported provider: {provider}")


def _probe_openrouter(model: str, api_key: str, *, strict: bool) -> ProviderStatus:
    headers = {"Authorization": f"Bearer {api_key}"}
    key_payload = _request_json(
        "GET",
        f"{OPENROUTER_BASE_URL}/key",
        headers=headers,
        provider_name="OpenRouter",
    )
    key_data = key_payload.get("data")
    if not isinstance(key_data, dict):
        raise ProviderValidationError("OpenRouter returned an invalid key payload.")

    used = _to_float(key_data.get("usage"))
    limit = _to_float(key_data.get("limit"))
    remaining = (limit - used) if (limit is not None and used is not None) else None

    models_payload = _request_json(
        "GET",
        f"{OPENROUTER_BASE_URL}/models",
        headers=headers,
        provider_name="OpenRouter",
    )
    if not _openrouter_model_exists(models_payload, model):
        raise ProviderValidationError(f'OpenRouter model "{model}" is not available for this key.')

    if remaining is not None and remaining <= 0:
        raise ProviderValidationError("OpenRouter key has no remaining credits.")

    if strict:
        _request_json(
            "POST",
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json_body={
                "model": model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
                "temperature": 0,
            },
            provider_name="OpenRouter",
        )

    msg = "OpenRouter key is valid and model is available."
    if remaining is not None:
        msg = f"{msg} Remaining credit: ${remaining:.2f}."

    return ProviderStatus(
        provider="openrouter",
        model=model,
        status="ok",
        message=msg,
        model_available=True,
        credits_remaining_usd=remaining,
        credits_used_usd=used,
        credits_limit_usd=limit,
    )


def _probe_openai(model: str, api_key: str, *, strict: bool) -> ProviderStatus:
    headers = {"Authorization": f"Bearer {api_key}"}
    _request_json(
        "GET",
        f"{OPENAI_BASE_URL}/models/{model}",
        headers=headers,
        provider_name="OpenAI",
    )

    if strict:
        _request_json(
            "POST",
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json_body={
                "model": model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            },
            provider_name="OpenAI",
        )

    return ProviderStatus(
        provider="openai",
        model=model,
        status="ok",
        message=(
            "OpenAI key is valid and model is available. "
            "OpenAI does not expose remaining credit totals in this API."
        ),
        model_available=True,
    )


def _probe_anthropic(model: str, api_key: str, *, strict: bool) -> ProviderStatus:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
    }
    models_payload = _request_json(
        "GET",
        f"{ANTHROPIC_BASE_URL}/models",
        headers=headers,
        provider_name="Anthropic",
    )
    if not _anthropic_model_exists(models_payload, model):
        raise ProviderValidationError(f'Anthropic model "{model}" is not available for this key.')

    if strict:
        _request_json(
            "POST",
            f"{ANTHROPIC_BASE_URL}/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "Content-Type": "application/json",
            },
            json_body={
                "model": model,
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}],
            },
            provider_name="Anthropic",
        )

    return ProviderStatus(
        provider="anthropic",
        model=model,
        status="ok",
        message=(
            "Anthropic key is valid and model is available. "
            "Remaining credit totals are not available in this API."
        ),
        model_available=True,
    )


def _request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    provider_name: str,
) -> dict[str, Any]:
    try:
        response = httpx.request(
            method,
            url,
            headers=headers,
            json=json_body,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise ProviderValidationError(
            f"{provider_name} request failed: {exc.__class__.__name__}"
        ) from exc

    if response.status_code >= 400:
        detail = _extract_provider_error(response)
        raise ProviderValidationError(f"{provider_name} validation failed: {detail}")

    payload = response.json()
    if not isinstance(payload, dict):
        raise ProviderValidationError(f"{provider_name} returned a non-JSON response.")
    return payload


def _extract_provider_error(response: httpx.Response) -> str:
    base = f"HTTP {response.status_code}"
    try:
        payload = response.json()
    except ValueError:
        return base

    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
            code = err.get("code")
            if isinstance(code, str) and code.strip():
                return f"{base}: {code.strip()}"
        if isinstance(err, str) and err.strip():
            return err.strip()

        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
    return base


def _normalize_model(provider: str, model: str) -> str:
    raw = model.strip()
    if not raw:
        return ""

    if provider == "openrouter" and raw.startswith("openrouter/"):
        return raw.removeprefix("openrouter/")
    if provider == "openai" and raw.startswith("openai/"):
        return raw.removeprefix("openai/")
    if provider == "anthropic" and raw.startswith("anthropic/"):
        return raw.removeprefix("anthropic/")
    return raw


def _openrouter_model_exists(payload: dict[str, Any], model: str) -> bool:
    data = payload.get("data")
    if not isinstance(data, list):
        return False

    normalized_target = _normalize_model("openrouter", model)
    for entry in data:
        if not isinstance(entry, dict):
            continue
        model_id = entry.get("id")
        if isinstance(model_id, str):
            if _normalize_model("openrouter", model_id) == normalized_target:
                return True
    return False


def _anthropic_model_exists(payload: dict[str, Any], model: str) -> bool:
    data = payload.get("data")
    if not isinstance(data, list):
        return False

    normalized_target = _normalize_model("anthropic", model)
    for entry in data:
        if not isinstance(entry, dict):
            continue
        model_id = entry.get("id")
        if isinstance(model_id, str):
            if _normalize_model("anthropic", model_id) == normalized_target:
                return True
    return False


def _to_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
