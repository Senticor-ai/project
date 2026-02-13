"""Agent settings — user preferences for AI backend (Haystack vs OpenClaw)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..container.manager import ensure_running, get_status, stop_container
from ..db import db_conn
from ..deps import get_current_user
from ..email.crypto import CryptoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AgentSettingsResponse(BaseModel):
    agentBackend: str  # "haystack" | "openclaw"
    provider: str  # "openrouter" | "openai" | "anthropic"
    hasApiKey: bool
    model: str
    containerStatus: str | None = None
    containerError: str | None = None


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


def _get_crypto() -> CryptoService | None:
    """Return CryptoService if encryption key is configured, else None."""
    if not settings.encryption_key:
        return None
    return CryptoService()


def get_user_agent_backend(user_id: str) -> str:
    """Get the user's configured agent backend. Returns 'haystack' if not set."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT agent_backend FROM user_agent_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return "haystack"
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
        return AgentSettingsResponse(
            agentBackend="haystack",
            provider="openrouter",
            hasApiKey=False,
            model="google/gemini-3-flash-preview",
        )

    return AgentSettingsResponse(
        agentBackend=row["agent_backend"],
        provider=row["provider"],
        hasApiKey=row["api_key_encrypted"] is not None,
        model=row["model"],
        containerStatus=row["container_status"],
        containerError=row["container_error"],
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

    # Encrypt API key if provided
    encrypted_key: str | None = None
    if req.apiKey:
        crypto = _get_crypto()
        if not crypto:
            raise HTTPException(
                status_code=503,
                detail="Encryption not configured (ENCRYPTION_KEY missing)",
            )
        encrypted_key = crypto.encrypt(req.apiKey)

    with db_conn() as conn:
        with conn.cursor() as cur:
            # Fetch current values for merge
            cur.execute(
                "SELECT agent_backend, provider, api_key_encrypted, model "
                "FROM user_agent_settings WHERE user_id = %s",
                (user_id,),
            )
            existing = cur.fetchone()

            if existing:
                new_backend = req.agentBackend or existing["agent_backend"]
                new_provider = req.provider or existing["provider"]
                new_model = req.model or existing["model"]
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
                new_backend = req.agentBackend or "haystack"
                new_provider = req.provider or "openrouter"
                new_model = req.model or "google/gemini-3-flash-preview"

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

    return AgentSettingsResponse(
        agentBackend=new_backend,
        provider=new_provider,
        hasApiKey=encrypted_key is not None
        or (existing is not None and existing["api_key_encrypted"] is not None),
        model=new_model,
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
