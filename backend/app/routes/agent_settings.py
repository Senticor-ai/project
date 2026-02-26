"""Agent settings — user preferences for AI backend (Haystack vs OpenClaw)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import settings
from ..container.manager import (
    ensure_running,
    get_identity_name,
    get_status,
    hard_refresh_container,
    stop_container,
)
from ..db import db_conn
from ..deps import get_current_user
from ..email.crypto import CryptoService
from ..llm_validation import ProviderStatus, ProviderValidationError, probe_provider_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AgentSettingsResponse(BaseModel):
    agentBackend: str  # "haystack" | "openclaw"
    agentName: str
    devToolsEnabled: bool = False
    provider: str  # "openrouter" | "openai" | "anthropic"
    hasApiKey: bool
    model: str
    containerStatus: str | None = None
    containerError: str | None = None
    validationStatus: str | None = None
    validationMessage: str | None = None
    modelAvailable: bool | None = None
    creditsRemainingUsd: float | None = None
    creditsUsedUsd: float | None = None
    creditsLimitUsd: float | None = None
    lastValidatedAt: str | None = None


class AgentSettingsUpdate(BaseModel):
    agentBackend: str | None = None
    provider: str | None = None
    apiKey: str | None = None  # plaintext, encrypted before storage
    model: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_BACKENDS = {"haystack", "openclaw"}
VALID_PROVIDERS = {"openrouter", "openai", "anthropic"}
DEFAULT_MODEL = "google/gemini-3-flash-preview"


def _get_crypto() -> CryptoService | None:
    """Return CryptoService if encryption key is configured, else None."""
    if not settings.encryption_key:
        return None
    return CryptoService()


def _decrypt_api_key(encrypted: bytes | str | None) -> str | None:
    if not encrypted:
        return None

    crypto = _get_crypto()
    if not crypto:
        return None

    raw = encrypted.decode() if isinstance(encrypted, bytes) else encrypted
    try:
        return crypto.decrypt(raw)
    except Exception:  # noqa: BLE001
        logger.warning("agent_settings.decrypt_failed", exc_info=True)
        return None


@dataclass(frozen=True)
class UserLlmConfig:
    provider: str
    model: str
    api_key: str


def get_user_llm_config(user_id: str) -> UserLlmConfig | None:
    """Return decrypted provider/model/api_key for a user, if configured."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT provider, model, api_key_encrypted
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if not row:
        return None

    api_key = _decrypt_api_key(row.get("api_key_encrypted"))
    if not api_key:
        return None

    return UserLlmConfig(
        provider=row["provider"],
        model=row["model"],
        api_key=api_key,
    )


def _apply_provider_status(
    response: AgentSettingsResponse,
    status: ProviderStatus | None,
) -> AgentSettingsResponse:
    if status is None:
        return response
    response.validationStatus = status.status
    response.validationMessage = status.message
    response.modelAvailable = status.model_available
    response.creditsRemainingUsd = status.credits_remaining_usd
    response.creditsUsedUsd = status.credits_used_usd
    response.creditsLimitUsd = status.credits_limit_usd
    response.lastValidatedAt = status.checked_at.isoformat()
    return response


def _resolve_agent_name(user_id: str, agent_backend: str) -> str:
    if agent_backend != "openclaw":
        return "Copilot"
    return get_identity_name(user_id) or "OpenClaw"


def _require_dev_tools_enabled() -> None:
    if settings.dev_tools_enabled:
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def get_user_agent_backend(user_id: str) -> str:
    """Get the user's configured agent backend.

    Returns the config-driven default (DEFAULT_AGENT_BACKEND) when the user
    has no row in user_agent_settings.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT agent_backend FROM user_agent_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return settings.default_agent_backend
    return row["agent_backend"]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=AgentSettingsResponse)
def get_agent_settings(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Get current user's agent settings."""
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT agent_backend, provider, api_key_encrypted, model,
                       container_status, container_error
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if not row:
        default_backend = settings.default_agent_backend
        return AgentSettingsResponse(
            agentBackend=default_backend,
            agentName=_resolve_agent_name(user_id, default_backend),
            devToolsEnabled=settings.dev_tools_enabled,
            provider="openrouter",
            hasApiKey=False,
            model=DEFAULT_MODEL,
        )

    validation: ProviderStatus | None = None
    api_key = _decrypt_api_key(row["api_key_encrypted"])
    if api_key:
        try:
            validation = probe_provider_status(
                provider=row["provider"],
                model=row["model"],
                api_key=api_key,
                strict=False,
            )
        except ProviderValidationError as exc:
            validation = ProviderStatus(
                provider=row["provider"],
                model=row["model"],
                status="error",
                message=str(exc),
                model_available=False,
            )

    return _apply_provider_status(
        AgentSettingsResponse(
            agentBackend=row["agent_backend"],
            agentName=_resolve_agent_name(user_id, row["agent_backend"]),
            devToolsEnabled=settings.dev_tools_enabled,
            provider=row["provider"],
            hasApiKey=row["api_key_encrypted"] is not None,
            model=row["model"],
            containerStatus=row["container_status"],
            containerError=row["container_error"],
        ),
        validation,
    )


@router.put("/settings", response_model=AgentSettingsResponse)
def update_agent_settings(
    req: AgentSettingsUpdate,
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Update user's agent settings."""
    user_id = str(current_user["id"])

    if req.agentBackend and req.agentBackend not in VALID_BACKENDS:
        raise HTTPException(status_code=422, detail=f"Invalid backend: {req.agentBackend}")
    if req.provider and req.provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=422, detail=f"Invalid provider: {req.provider}")

    requested_model = req.model.strip() if isinstance(req.model, str) else req.model
    if requested_model == "":
        raise HTTPException(status_code=422, detail="Model must not be empty.")
    requested_api_key = req.apiKey.strip() if isinstance(req.apiKey, str) else req.apiKey
    if requested_api_key == "":
        requested_api_key = None

    validation: ProviderStatus | None = None

    # Fetch current values first so we can validate merged settings.
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT agent_backend, provider, api_key_encrypted, model "
                "FROM user_agent_settings WHERE user_id = %s",
                (user_id,),
            )
            existing = cur.fetchone()

    if existing:
        new_backend = req.agentBackend or existing["agent_backend"]
        new_provider = req.provider or existing["provider"]
        new_model = requested_model or existing["model"]
        existing_encrypted = existing["api_key_encrypted"]
    else:
        new_backend = req.agentBackend or settings.default_agent_backend
        new_provider = req.provider or "openrouter"
        new_model = requested_model or DEFAULT_MODEL
        existing_encrypted = None

    if new_backend == "haystack" and new_provider == "anthropic":
        raise HTTPException(
            status_code=422,
            detail="Copilot supports OpenRouter or OpenAI providers only.",
        )

    needs_validation = any(
        (
            requested_api_key is not None,
            req.provider is not None,
            req.model is not None,
            req.agentBackend is not None,
        )
    )
    key_for_validation = requested_api_key or _decrypt_api_key(existing_encrypted)
    if needs_validation and key_for_validation:
        try:
            validation = probe_provider_status(
                provider=new_provider,
                model=new_model,
                api_key=key_for_validation,
                strict=True,
            )
        except ProviderValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Encrypt API key if provided
    encrypted_key: str | None = None
    if requested_api_key is not None:
        crypto = _get_crypto()
        if not crypto:
            raise HTTPException(
                status_code=503,
                detail="Encryption not configured (ENCRYPTION_KEY missing)",
            )
        encrypted_key = crypto.encrypt(requested_api_key)

    with db_conn() as conn:
        with conn.cursor() as cur:
            if existing:
                new_key = encrypted_key if encrypted_key else existing["api_key_encrypted"]
                cur.execute(
                    """
                    UPDATE user_agent_settings
                    SET agent_backend = %s, provider = %s, api_key_encrypted = %s,
                        model = %s, updated_at = now()
                    WHERE user_id = %s
                    """,
                    (new_backend, new_provider, new_key, new_model, user_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO user_agent_settings
                    (user_id, agent_backend, provider, api_key_encrypted, model)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, new_backend, new_provider, encrypted_key, new_model),
                )
            conn.commit()

    # Auto-stop running container if settings that affect it changed
    settings_changed = existing and (
        (req.agentBackend and req.agentBackend != existing["agent_backend"])
        or (req.provider and req.provider != existing["provider"])
        or (req.model and req.model != existing["model"])
        or req.apiKey
    )
    if settings_changed:
        try:
            stop_container(user_id)
        except Exception:
            logger.warning("container.auto_stop_failed", exc_info=True)

    return _apply_provider_status(
        AgentSettingsResponse(
            agentBackend=new_backend,
            agentName=_resolve_agent_name(user_id, new_backend),
            devToolsEnabled=settings.dev_tools_enabled,
            provider=new_provider,
            hasApiKey=encrypted_key is not None
            or (existing is not None and existing["api_key_encrypted"] is not None),
            model=new_model,
        ),
        validation,
    )


@router.delete("/settings/api-key")
def delete_api_key(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Remove the stored API key."""
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_agent_settings
                SET api_key_encrypted = NULL, updated_at = now()
                WHERE user_id = %s
                """,
                (user_id,),
            )
            conn.commit()

    return {"ok": True}


# ---------------------------------------------------------------------------
# Container control endpoints
# ---------------------------------------------------------------------------


@router.get("/status")
def get_container_status(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Get detailed container status for the UI."""
    user_id = str(current_user["id"])
    return get_status(user_id)


@router.post("/container/stop")
def stop_user_container(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Stop the user's OpenClaw container."""
    user_id = str(current_user["id"])
    stop_container(user_id)
    return {"ok": True}


@router.post("/container/restart")
def restart_user_container(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Restart the user's OpenClaw container."""
    user_id = str(current_user["id"])
    stop_container(user_id)
    url, _token = ensure_running(user_id)
    return {"ok": True, "url": url}


@router.post("/container/hard-refresh")
def hard_refresh_user_container(
    current_user: dict = Depends(get_current_user),  # noqa: B008
):
    """Stop container and delete persisted OpenClaw state (dev only)."""
    _require_dev_tools_enabled()
    user_id = str(current_user["id"])
    result = hard_refresh_container(user_id)
    return {"ok": True, **result}
