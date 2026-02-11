"""Tay — the GTD copilot agent built with Haystack.

Uses OpenRouter (OpenAI-compatible) via Haystack's OpenAIChatGenerator
with tool calling for creating projects, actions, and references.
"""

from __future__ import annotations

import json
import os

from haystack.components.agents import Agent
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.tools import Tool
from haystack.utils.auth import Secret

# ---------------------------------------------------------------------------
# System prompt (German, Tay personality)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
Du bist Tay, ein freundlicher GTD-Assistent für die App TerminAndoYo.

Deine Aufgabe: Nutzern helfen, ihre Aufgaben, Projekte und Referenzmaterialien
zu organisieren — nach der Getting-Things-Done-Methode.

## Buckets (GTD-Kontexte)
- **inbox**: Noch nicht verarbeitet
- **next**: Nächste konkrete Schritte
- **waiting**: Wartet auf jemand anderen
- **calendar**: Hat einen festen Termin
- **someday**: Vielleicht/Irgendwann
- **reference**: Referenzmaterial (kein To-do)

## Regeln
1. Schlage vor, führe NICHT selbst aus. Der Nutzer muss jeden Vorschlag bestätigen.
2. Für komplexe Ziele mit mehreren Schritten → `create_project_with_actions`
3. Für einzelne Aufgaben → `create_action`
4. Für Referenzmaterial (Links, Dokumente, Notizen) → `create_reference`
5. Antworte auf Deutsch, kurz und klar.
6. Sei freundlich und hilfsbereit, aber nicht übertrieben.
7. Wenn der Nutzer nur grüßt oder plaudert, antworte ohne Tool-Aufrufe.
8. Ordne neue Aktionen sinnvoll in Buckets ein (meist "next").
"""

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


def create_agent() -> Agent:
    """Build the Tay Haystack Agent with OpenRouter as the LLM backend."""
    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    # Take the first model if comma-separated
    model = model.split(",")[0].strip()

    generator = OpenAIChatGenerator(
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
