"""Dogfooding E2E tests for weekly planning/scheduling/review scenarios.

These tests verify that the agent can execute real-world productivity
workflows using only the copilot_cli tool (Senticor tracker integration).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from haystack.dataclasses import ChatMessage, ToolCall


@pytest.fixture()
def client():
    from app import app

    return TestClient(app)


def _msgs(text: str) -> list[dict]:
    """Build a single-user-message payload for the API."""
    return [{"role": "user", "content": text}]


# ---------------------------------------------------------------------------
# Weekly Planning Scenario
# ---------------------------------------------------------------------------


def test_weekly_planning_scenario(client: TestClient):
    """Test weekly planning flow: user requests review, agent uses copilot_cli.

    Simulates:
    1. User asks for weekly review
    2. Agent calls list_workspace_overview (inline read tool)
    3. Agent responds with copilot_cli tool calls for next actions
    4. Verify only copilot_cli is used (no external trackers)
    """
    # Mock agent to return a planning response with copilot_cli tool calls
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "list",
                    "--bucket",
                    "next",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Hier ist deine Wochenübersicht. Ich liste jetzt deine nächsten Schritte auf.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Zeig mir meine Wochenplanung"),
                "conversationId": "dogfood-weekly-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify response structure
    assert (
        body["text"]
        == "Hier ist deine Wochenübersicht. Ich liste jetzt deine nächsten Schritte auf."
    )
    assert len(body["toolCalls"]) == 1

    # Verify tool call is copilot_cli (not external tracker)
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    assert tc["arguments"]["argv"] == [
        "items",
        "list",
        "--bucket",
        "next",
        "--apply",
    ]


def test_weekly_planning_with_multiple_actions(client: TestClient):
    """Test weekly planning with multiple suggested actions."""
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "create",
                    "--type",
                    "Action",
                    "--name",
                    "Steuerberater anrufen",
                    "--bucket",
                    "next",
                    "--apply",
                ]
            },
        ),
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "create",
                    "--type",
                    "Action",
                    "--name",
                    "Wochenbericht schreiben",
                    "--bucket",
                    "next",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Basierend auf deiner Wochenplanung schlage ich folgende Aktionen vor:",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Was steht diese Woche an?"),
                "conversationId": "dogfood-weekly-2",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify multiple tool calls
    assert len(body["toolCalls"]) == 2

    # Verify all tool calls are copilot_cli (no external trackers)
    for tc in body["toolCalls"]:
        assert tc["name"] == "copilot_cli"
        assert "items" in tc["arguments"]["argv"]
        assert "create" in tc["arguments"]["argv"]
        assert "--apply" in tc["arguments"]["argv"]


# ---------------------------------------------------------------------------
# Inbox Triage Scenario
# ---------------------------------------------------------------------------


def test_inbox_triage_scenario(client: TestClient):
    """Test inbox triage: agent suggests moving items to appropriate buckets."""
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "triage",
                    "--from",
                    "inbox",
                    "--to",
                    "next",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich sortiere deine Inbox-Einträge in die richtigen Buckets.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Hilf mir, meine Inbox zu sortieren"),
                "conversationId": "dogfood-triage-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify triage tool call
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    assert "triage" in tc["arguments"]["argv"]


def test_review_triage_scenario(client: TestClient):
    """Test review/triage flow: user reviews items, agent suggests actions.

    Simulates:
    1. User asks to review what needs attention
    2. Agent responds with copilot_cli tool calls to list and triage items
    3. Verify only copilot_cli is used (no external trackers)
    """
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "list",
                    "--bucket",
                    "next",
                    "--apply",
                ]
            },
        ),
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "update",
                    "--id",
                    "item-123",
                    "--bucket",
                    "someday",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich zeige dir deine aktuellen Aufgaben und verschiebe niedrig-priorisierte Items.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Zeig mir, was ich reviewen muss"),
                "conversationId": "dogfood-review-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify response structure
    assert (
        body["text"]
        == "Ich zeige dir deine aktuellen Aufgaben und verschiebe niedrig-priorisierte Items."
    )
    assert len(body["toolCalls"]) == 2

    # Verify all tool calls are copilot_cli (no external trackers)
    for tc in body["toolCalls"]:
        assert tc["name"] == "copilot_cli"
        assert "items" in tc["arguments"]["argv"]
        assert "--apply" in tc["arguments"]["argv"]

    # Verify first call is list
    assert body["toolCalls"][0]["arguments"]["argv"][1] == "list"

    # Verify second call is update/triage
    assert body["toolCalls"][1]["arguments"]["argv"][1] == "update"
    assert "--bucket" in body["toolCalls"][1]["arguments"]["argv"]


# ---------------------------------------------------------------------------
# Scheduling Scenario
# ---------------------------------------------------------------------------


def test_scheduling_scenario(client: TestClient):
    """Test scheduling flow: agent schedules tasks with due dates using copilot_cli.

    Simulates:
    1. User asks to schedule a task
    2. Agent creates scheduled item with due date using copilot_cli
    3. Verify only copilot_cli is used (no external trackers)
    """
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "create",
                    "--type",
                    "Action",
                    "--name",
                    "Team-Meeting vorbereiten",
                    "--bucket",
                    "next",
                    "--due",
                    "2026-02-28",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich habe das Team-Meeting für Ende der Woche eingeplant.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Plane das Team-Meeting für Ende der Woche"),
                "conversationId": "dogfood-schedule-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify response structure
    assert body["text"] == "Ich habe das Team-Meeting für Ende der Woche eingeplant."
    assert len(body["toolCalls"]) == 1

    # Verify tool call is copilot_cli with scheduling
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    assert "create" in tc["arguments"]["argv"]
    assert "--due" in tc["arguments"]["argv"]
    assert "2026-02-28" in tc["arguments"]["argv"]


# ---------------------------------------------------------------------------
# Workspace Overview (Read-Only)
# ---------------------------------------------------------------------------


def test_workspace_overview_text_response(client: TestClient):
    """Test workspace overview with text-only response (no tool calls).

    This verifies the agent can respond with pure analysis without
    requiring tool execution.
    """
    reply = ChatMessage.from_assistant(
        "Du hast 3 Projekte und 12 Aktionen in deinem Workspace. "
        "5 Aktionen sind in 'next', 4 in 'inbox', 3 in 'someday'."
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Wie sieht mein Workspace aus?"),
                "conversationId": "dogfood-overview-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()

    # Verify text response
    assert body["text"].startswith("Du hast 3 Projekte")
    assert body.get("toolCalls") is None


# ---------------------------------------------------------------------------
# Org-Awareness Scenarios
# ---------------------------------------------------------------------------


def test_org_context_read_scenario(client: TestClient):
    """Agent reads org documents when user asks about an org.

    Simulates the agent responding with org context after reading
    documents via inline read tools (no write tool calls needed).
    """
    reply = ChatMessage.from_assistant(
        "Nueva Tierra ist als GmbH eingetragen. "
        "Hier sind die Details aus deinen Org-Dokumenten."
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs("Was weißt du über Nueva Tierra?"),
                "conversationId": "dogfood-org-read-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "Nueva Tierra" in body["text"]
    assert body.get("toolCalls") is None


def test_org_agent_notes_update_scenario(client: TestClient):
    """Agent updates AGENT.md after learning about an org."""
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "orgs",
                    "docs",
                    "update",
                    "nueva-tierra",
                    "--doc",
                    "agent",
                    "--text",
                    "# Agent-Notizen\n\nSteuerberater: Herr Schmidt",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich habe mir notiert, dass Herr Schmidt der Steuerberater ist.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs(
                    "Mein Steuerberater für Nueva Tierra ist Herr Schmidt"
                ),
                "conversationId": "dogfood-org-notes-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    argv = tc["arguments"]["argv"]
    assert "orgs" in argv
    assert "docs" in argv
    assert "update" in argv
    assert "--doc" in argv
    assert "agent" in argv
    assert "--apply" in argv


def test_org_log_append_scenario(client: TestClient):
    """Agent appends to LOG.md to record an important event."""
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "orgs",
                    "docs",
                    "append",
                    "nueva-tierra",
                    "--doc",
                    "log",
                    "--text",
                    "Steuererklärung 2025 eingereicht",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich habe den Eintrag im Protokoll festgehalten.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs(
                    "Die Steuererklärung 2025 für Nueva Tierra wurde eingereicht"
                ),
                "conversationId": "dogfood-org-log-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    argv = tc["arguments"]["argv"]
    assert "append" in argv
    assert "--doc" in argv
    assert "log" in argv
    assert "--apply" in argv


def test_org_create_person_scenario(client: TestClient):
    """Agent creates a Person item linked to an org."""
    tool_calls = [
        ToolCall(
            tool_name="copilot_cli",
            arguments={
                "argv": [
                    "items",
                    "create",
                    "--type",
                    "Person",
                    "--name",
                    "Steuerberater Schmidt",
                    "--org",
                    "nueva-tierra",
                    "--role",
                    "accountant",
                    "--email",
                    "schmidt@steuer.de",
                    "--apply",
                ]
            },
        ),
    ]
    reply = ChatMessage.from_assistant(
        "Ich lege Herrn Schmidt als Kontakt für Nueva Tierra an.",
        tool_calls=tool_calls,
    )

    with patch("app.run_agent", new_callable=AsyncMock, return_value=reply):
        resp = client.post(
            "/chat/completions",
            json={
                "messages": _msgs(
                    "Lege bitte Steuerberater Schmidt als Kontakt für Nueva Tierra an"
                ),
                "conversationId": "dogfood-org-person-1",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["toolCalls"]) == 1
    tc = body["toolCalls"][0]
    assert tc["name"] == "copilot_cli"
    argv = tc["arguments"]["argv"]
    assert "Person" in argv
    assert "--org" in argv
    assert "--role" in argv
    assert "--apply" in argv
