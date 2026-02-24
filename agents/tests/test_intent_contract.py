"""Tests for draft Copilot intent contract and argv compiler."""

from __future__ import annotations

import pytest

from intent_contract import INTENT_SCHEMA_VERSION, compile_intent_to_argv


def test_compile_job_search_create_reference():
    commands = compile_intent_to_argv(
        {
            "schemaVersion": INTENT_SCHEMA_VERSION,
            "kind": "job_search_create_reference",
            "projectId": "urn:app:project:job-1",
            "name": "CV Tailored for Anthropic",
            "markdown": "# CV\n\nTailored content",
        }
    )

    assert commands == [
        [
            "items",
            "create",
            "--type",
            "CreativeWork",
            "--name",
            "CV Tailored for Anthropic",
            "--description",
            "# CV\n\nTailored content",
            "--project",
            "urn:app:project:job-1",
            "--bucket",
            "reference",
            "--apply",
        ]
    ]


def test_compile_weekly_review_plan_mixed_directives():
    commands = compile_intent_to_argv(
        {
            "schemaVersion": INTENT_SCHEMA_VERSION,
            "kind": "weekly_review_plan",
            "focusOn": ["urn:app:action:a1"],
            "focusOff": ["urn:app:action:a2"],
            "triage": [
                {
                    "itemId": "urn:app:action:a3",
                    "bucket": "someday",
                }
            ],
            "schedule": [
                {
                    "name": "Midweek review",
                    "date": "2026-02-25",
                    "time": "10:00",
                }
            ],
            "notes": [
                {
                    "title": "Weekly review notes",
                    "markdown": "Top priorities for next week",
                }
            ],
        }
    )

    assert commands[0] == ["items", "focus", "urn:app:action:a1", "--on", "--apply"]
    assert commands[1] == ["items", "focus", "urn:app:action:a2", "--off", "--apply"]
    assert commands[2] == [
        "items",
        "triage",
        "urn:app:action:a3",
        "--bucket",
        "someday",
        "--apply",
    ]
    assert commands[3][:8] == [
        "items",
        "create",
        "--type",
        "Action",
        "--name",
        "Midweek review",
        "--bucket",
        "calendar",
    ]
    assert commands[4] == [
        "items",
        "create",
        "--type",
        "CreativeWork",
        "--name",
        "Weekly review notes",
        "--bucket",
        "reference",
        "--description",
        "Top priorities for next week",
        "--apply",
    ]


def test_invalid_schema_version_raises():
    with pytest.raises(ValueError, match="schemaVersion"):
        compile_intent_to_argv(
            {
                "schemaVersion": "copilot.intent.v999",
                "kind": "job_search_create_reference",
                "projectId": "urn:app:project:job-1",
                "name": "x",
                "markdown": "y",
            }
        )
