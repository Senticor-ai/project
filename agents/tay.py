"""Tay — the productivity copilot agent built with Haystack.

Uses OpenRouter (OpenAI-compatible) via Haystack's OpenAIChatGenerator
with tool calling for creating projects, actions, and references.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
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

# ---------------------------------------------------------------------------
# Tool definitions — no-op functions that return their arguments
# ---------------------------------------------------------------------------


def _noop_create_project_with_actions(**kwargs) -> str:
    """No-op: returns arguments as JSON. Frontend handles item creation."""
    return json.dumps(kwargs, ensure_ascii=False)


def _noop_create_action(**kwargs) -> str:
    """No-op: returns arguments as JSON. Frontend handles item creation."""
    return json.dumps(kwargs, ensure_ascii=False)


def _noop_create_reference(**kwargs) -> str:
    """No-op: returns arguments as JSON. Frontend handles item creation."""
    return json.dumps(kwargs, ensure_ascii=False)


def _noop_render_cv(**kwargs) -> str:
    """No-op: returns arguments as JSON. Frontend handles rendering."""
    return json.dumps(kwargs, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Exit-condition tools (no-op, user approves before execution)
# ---------------------------------------------------------------------------

TOOLS = [
    Tool(
        name="create_project_with_actions",
        description=(
            "Erstelle ein Projekt mit zugehörigen Aktionen und optionalen Dokumenten. "
            "Verwende dies für komplexe Ziele mit mehreren Schritten."
        ),
        parameters={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "const": "create_project_with_actions",
                },
                "project": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name des Projekts"},
                        "desiredOutcome": {
                            "type": "string",
                            "description": "Gewünschtes Ergebnis des Projekts",
                        },
                    },
                    "required": ["name", "desiredOutcome"],
                },
                "actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Name der Aktion"},
                            "bucket": {
                                "type": "string",
                                "enum": ["inbox", "next", "waiting", "calendar", "someday"],
                                "description": "Bucket für die Aktion",
                            },
                        },
                        "required": ["name", "bucket"],
                    },
                    "description": "Liste der Aktionen für das Projekt",
                },
                "documents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["name"],
                    },
                    "description": "Optionale Dokumente/Referenzen für das Projekt",
                },
            },
            "required": ["type", "project", "actions"],
        },
        function=_noop_create_project_with_actions,
    ),
    Tool(
        name="create_action",
        description="Erstelle eine einzelne Aktion/Aufgabe.",
        parameters={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "const": "create_action",
                },
                "name": {"type": "string", "description": "Name der Aktion"},
                "bucket": {
                    "type": "string",
                    "enum": ["inbox", "next", "waiting", "calendar", "someday"],
                    "description": "Bucket für die Aktion",
                },
                "projectId": {
                    "type": "string",
                    "description": "Optionale ID eines bestehenden Projekts",
                },
            },
            "required": ["type", "name", "bucket"],
        },
        function=_noop_create_action,
    ),
    Tool(
        name="create_reference",
        description="Erstelle ein Referenzmaterial (Link, Dokument, Notiz).",
        parameters={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "const": "create_reference",
                },
                "name": {"type": "string", "description": "Name der Referenz"},
                "description": {
                    "type": "string",
                    "description": "Beschreibung der Referenz",
                },
                "url": {"type": "string", "description": "URL der Referenz"},
            },
            "required": ["type", "name"],
        },
        function=_noop_create_reference,
    ),
    Tool(
        name="render_cv",
        description=(
            "Rendere einen Lebenslauf als professionelle PDF-Datei und speichere "
            "ihn als Referenz im Projekt. Generiere CSS basierend auf den "
            "Gestaltungswünschen des Nutzers."
        ),
        parameters={
            "type": "object",
            "properties": {
                "type": {"type": "string", "const": "render_cv"},
                "cv": {
                    "type": "object",
                    "description": "Strukturierte Lebenslauf-Daten",
                    "properties": {
                        "name": {"type": "string"},
                        "contact": {
                            "type": "object",
                            "properties": {
                                "location": {"type": "string"},
                                "phone": {"type": "string"},
                                "email": {"type": "string"},
                                "linkedin": {"type": "string"},
                            },
                        },
                        "headline": {"type": "string"},
                        "summary": {"type": "string"},
                        "skills": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "experience": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "company": {"type": "string"},
                                    "title": {"type": "string"},
                                    "period": {"type": "string"},
                                    "location": {"type": "string"},
                                    "summary": {"type": "string"},
                                    "bullets": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                },
                            },
                        },
                        "education": {
                            "type": "array",
                            "items": {"type": "object"},
                        },
                        "certifications": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["name", "headline", "experience"],
                },
                "css": {
                    "type": "string",
                    "description": (
                        "Benutzerdefiniertes CSS fuer Layout, Typografie, Farben. "
                        "Verfuegbare Schriftarten: Inter, Source Sans Pro."
                    ),
                },
                "filename": {
                    "type": "string",
                    "description": "Dateiname (z.B. 'lebenslauf-angepasst.pdf')",
                },
                "projectId": {
                    "type": "string",
                    "description": "Projekt-ID, in das die PDF als Referenz gespeichert wird",
                },
            },
            "required": ["type", "cv", "css", "filename", "projectId"],
        },
        function=_noop_render_cv,
    ),
]

# Exit conditions: these tools require user approval
EXIT_TOOL_NAMES = [
    "create_project_with_actions",
    "create_action",
    "create_reference",
    "render_cv",
]

# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def _build_read_tools(auth: AuthContext) -> list[Tool]:
    """Build read-only tools that call the backend with the given auth.

    These are NOT exit conditions — the agent calls them inline
    and continues reasoning with the returned content.
    """
    client = BackendClient()

    def _read_item_content(**kwargs) -> str:
        item_id = kwargs.get("itemId", "")
        try:
            result = asyncio.get_event_loop().run_until_complete(
                client.get_item_content(item_id, auth)
            )
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            logger.warning("read_item_content failed: %s", exc)
            return json.dumps({"error": str(exc)})

    def _list_project_items(**kwargs) -> str:
        project_id = kwargs.get("projectId", "")
        try:
            result = asyncio.get_event_loop().run_until_complete(
                client.list_project_items(project_id, auth)
            )
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            logger.warning("list_project_items failed: %s", exc)
            return json.dumps({"error": str(exc)})

    def _list_workspace_overview(**kwargs: object) -> str:
        try:
            result = asyncio.get_event_loop().run_until_complete(
                client.list_workspace_overview(auth)
            )
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

    generator = CachedTracedChatGenerator(
        api_key=Secret.from_env_var("OPENROUTER_API_KEY"),
        model=model,
        api_base_url="https://openrouter.ai/api/v1",
        generation_kwargs={
            "extra_headers": {
                "HTTP-Referer": os.getenv("OPENROUTER_APP_URL", ""),
                "X-Title": os.getenv("OPENROUTER_APP_TITLE", "TerminAndoYo"),
            },
        },
    )

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
