"""Senticor Copilot agent built with Haystack."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional  # noqa: UP035 — Haystack needs typing.Optional

from haystack.components.agents import Agent
from haystack.tools import Tool
from haystack.utils.auth import Secret
from jinja2 import Environment, FileSystemLoader

from backend_client import AuthContext, BackendClient
from llm_cache import CachedTracedChatGenerator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt loading (Jinja2)
# ---------------------------------------------------------------------------

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    keep_trailing_newline=False,
    trim_blocks=True,
    lstrip_blocks=True,
)

# Bucket definitions — passed to the system prompt template
BUCKETS = [
    {"id": "inbox", "label": "Noch nicht verarbeitet"},
    {"id": "next", "label": "Nächste konkrete Schritte"},
    {"id": "waiting", "label": "Wartet auf jemand anderen"},
    {"id": "calendar", "label": "Hat einen festen Termin"},
    {"id": "someday", "label": "Vielleicht/Irgendwann"},
    {"id": "reference", "label": "Referenzmaterial (kein To-do)"},
]


def load_prompt(template_path: str, **kwargs) -> str:
    """Load and render a Jinja2 prompt template.

    Args:
        template_path: Relative path from prompts/ dir (e.g. "de/tay_system.j2").
        **kwargs: Template variables.
    """
    template = _jinja_env.get_template(template_path)
    return template.render(**kwargs)


def build_system_prompt(user_context: dict | None = None) -> str:
    """Render the system prompt with current timestamp and user context."""
    return load_prompt(
        "de/tay_system.j2",
        buckets=BUCKETS,
        system_time=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        user_context=user_context or {},
    )


# ---------------------------------------------------------------------------
# Model list — parsed from AGENT_MODEL (falls back to OPENROUTER_MODEL)
# ---------------------------------------------------------------------------


def _parse_models() -> list[str]:
    """Parse comma-separated model list from env."""
    raw = os.getenv("AGENT_MODEL") or os.getenv("OPENROUTER_MODEL") or "openai/gpt-4o-mini"
    return [m.strip() for m in raw.split(",") if m.strip()]


MODELS = _parse_models()


@dataclass(frozen=True)
class RuntimeLlmConfig:
    provider: str
    api_key: str
    model: str | None = None

# ---------------------------------------------------------------------------
# Tool definitions — no-op function that returns arguments
# ---------------------------------------------------------------------------


def _noop_copilot_cli(**kwargs) -> str:
    """No-op: returns arguments as JSON. Frontend handles item creation."""
    return json.dumps(kwargs, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Exit-condition tools (no-op, user approves before execution)
# ---------------------------------------------------------------------------

TOOLS = [
    Tool(
        name="copilot_cli",
        description=(
            "Fuehre Senticor-Copilot-CLI-Befehle aus. "
            "Uebergib nur argv: string[] ohne Shell-Quoting."
        ),
        parameters={
            "type": "object",
            "properties": {
                "argv": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "description": (
                        'CLI argv ohne Shell-String, z.B. ["items","create","--type","Action",'
                        '"--name","Steuerberater anrufen","--bucket","next","--apply"]'
                    ),
                },
            },
            "required": ["argv"],
        },
        function=_noop_copilot_cli,
    ),
]

# Exit conditions: these tools require user approval
EXIT_TOOL_NAMES = [
    "copilot_cli",
]

# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def _run_async(coro) -> object:
    """Run an async coroutine from a sync Haystack tool function.

    Haystack Agent.run_async() already owns the event loop, so we can't
    call run_until_complete() on it.  Instead, run the coroutine in a
    separate thread with its own event loop via asyncio.run().
    """
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(asyncio.run, coro)
        return future.result(timeout=30)


def _normalize_model_for_provider(provider: str, model: str) -> str:
    normalized = model.strip()
    if provider == "openrouter" and normalized.startswith("openrouter/"):
        return normalized.removeprefix("openrouter/")
    if provider == "openai" and normalized.startswith("openai/"):
        return normalized.removeprefix("openai/")
    return normalized


def _build_chat_generator(model: str, llm_config: RuntimeLlmConfig | None):
    if llm_config is None:
        return CachedTracedChatGenerator(
            api_key=Secret.from_env_var("OPENROUTER_API_KEY"),
            model=model,
            api_base_url="https://openrouter.ai/api/v1",
            generation_kwargs={
                "extra_headers": {
                    "HTTP-Referer": os.getenv("OPENROUTER_APP_URL", ""),
                    "X-Title": os.getenv("OPENROUTER_APP_TITLE", "project"),
                },
            },
        )

    provider = llm_config.provider.strip().lower()
    selected_model = _normalize_model_for_provider(
        "openai" if provider == "openai" else "openrouter",
        (llm_config.model or model),
    )

    # OpenAI uses native API endpoint, everything else routes via OpenRouter.
    if provider == "openai":
        return CachedTracedChatGenerator(
            api_key=Secret.from_token(llm_config.api_key),
            model=selected_model,
        )

    return CachedTracedChatGenerator(
        api_key=Secret.from_token(llm_config.api_key),
        model=selected_model,
        api_base_url="https://openrouter.ai/api/v1",
        generation_kwargs={
            "extra_headers": {
                "HTTP-Referer": os.getenv("OPENROUTER_APP_URL", ""),
                "X-Title": os.getenv("OPENROUTER_APP_TITLE", "project"),
            },
        },
    )


def _build_read_tools(auth: AuthContext) -> list[Tool]:
    """Build read-only tools that call the backend with the given auth.

    These are NOT exit conditions — the agent calls them inline
    and continues reasoning with the returned content.
    """
    client = BackendClient()

    def _read_item_content(**kwargs) -> str:
        item_id = kwargs.get("itemId", "")
        try:
            result = _run_async(client.get_item_content(item_id, auth))
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            logger.warning("read_item_content failed: %s", exc)
            return json.dumps({"error": str(exc)})

    def _list_project_items(**kwargs) -> str:
        project_id = kwargs.get("projectId", "")
        try:
            result = _run_async(client.list_project_items(project_id, auth))
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            logger.warning("list_project_items failed: %s", exc)
            return json.dumps({"error": str(exc)})

    def _list_workspace_overview(**kwargs: object) -> str:
        try:
            result = _run_async(client.list_workspace_overview(auth))
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            logger.warning("list_workspace_overview failed: %s", exc)
            return json.dumps({"error": str(exc)})

    return [
        Tool(
            name="list_workspace_overview",
            description=(
                "Zeige eine Übersicht aller Projekte und Elemente im Workspace. "
                "Nutze dies, um herauszufinden, was der Nutzer hat, bevor du "
                "auf spezifische Elemente zugreifst."
            ),
            parameters={
                "type": "object",
                "properties": {},
            },
            function=_list_workspace_overview,
        ),
        Tool(
            name="read_item_content",
            description=(
                "Lese den Inhalt eines Elements (Dokument, Referenz, Aktion) "
                "inklusive Dateiinhalt. Gibt Metadaten und extrahierten Text zurueck."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "itemId": {
                        "type": "string",
                        "description": "Item-ID oder kanonische ID",
                    },
                },
                "required": ["itemId"],
            },
            function=_read_item_content,
        ),
        Tool(
            name="list_project_items",
            description=(
                "Liste alle Elemente eines Projekts auf (Aktionen, Referenzen, Dokumente)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "projectId": {
                        "type": "string",
                        "description": "Kanonische ID des Projekts",
                    },
                },
                "required": ["projectId"],
            },
            function=_list_project_items,
        ),
    ]


def create_agent(
    model: Optional[str] = None,  # noqa: UP007, UP045
    auth: Optional[AuthContext] = None,  # noqa: UP007, UP045
    user_context: Optional[dict] = None,  # noqa: UP007, UP045
    llm_config: Optional[RuntimeLlmConfig] = None,  # noqa: UP007, UP045
) -> Agent:
    """Build a Tay Haystack Agent for the given model.

    Args:
        model: OpenRouter model ID (e.g. "openai/gpt-4o-mini").
               Defaults to the first model in MODELS.
        auth: Delegated auth context. When provided, enables read tools
              (read_item_content, list_project_items) that call the backend.
        user_context: User context dict (username, email, timezone, locale,
                      localTime) for prompt personalization.
    """
    model = model or MODELS[0]

    generator = _build_chat_generator(model, llm_config)

    tools = list(TOOLS)
    if auth:
        tools.extend(_build_read_tools(auth))

    system_prompt = build_system_prompt(user_context)

    return Agent(
        chat_generator=generator,
        tools=tools,
        system_prompt=system_prompt,
        exit_conditions=["text"] + EXIT_TOOL_NAMES,
    )
