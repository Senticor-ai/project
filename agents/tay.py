"""Tay — the GTD copilot agent built with Haystack.

Uses OpenRouter (OpenAI-compatible) via Haystack's OpenAIChatGenerator
with tool calling for creating projects, actions, and references.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from haystack.components.agents import Agent
from haystack.tools import Tool
from haystack.utils.auth import Secret
from jinja2 import Environment, FileSystemLoader

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

# GTD bucket definitions — passed to the system prompt template
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


SYSTEM_PROMPT = load_prompt("de/tay_system.j2", buckets=BUCKETS)

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
                                "description": "GTD-Bucket für die Aktion",
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
                    "description": "GTD-Bucket",
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
]

# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def create_agent(model: str | None = None) -> Agent:
    """Build a Tay Haystack Agent for the given model.

    Args:
        model: OpenRouter model ID (e.g. "openai/gpt-4o-mini").
               Defaults to the first model in MODELS.
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

    return Agent(
        chat_generator=generator,
        tools=TOOLS,
        system_prompt=SYSTEM_PROMPT,
        exit_conditions=[
            "text",
            "create_project_with_actions",
            "create_action",
            "create_reference",
        ],
    )
