"""OpenAI function-calling tool definitions for the OpenClaw path.

These are the same 3 tools from agents/tay.py (create_project_with_actions,
create_action, create_reference) expressed in OpenAI function-calling format.
They are sent in the /v1/chat/completions request body so the LLM generates
structured tool_calls, which the backend then auto-executes.
"""

from __future__ import annotations

OPENCLAW_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "create_project_with_actions",
            "description": (
                "Erstelle ein Projekt mit zugehörigen Aktionen und optionalen Dokumenten. "
                "Verwende dies für komplexe Ziele mit mehreren Schritten."
            ),
            "parameters": {
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
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_action",
            "description": "Erstelle eine einzelne Aktion/Aufgabe.",
            "parameters": {
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
                        "description": "Bucket",
                    },
                    "projectId": {
                        "type": "string",
                        "description": "Optionale ID eines bestehenden Projekts",
                    },
                },
                "required": ["type", "name", "bucket"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_reference",
            "description": "Erstelle ein Referenzmaterial (Link, Dokument, Notiz).",
            "parameters": {
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
        },
    },
]
