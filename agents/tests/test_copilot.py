"""Tests for copilot.py — prompt loading, model parsing, agent factory."""

from __future__ import annotations

from unittest.mock import patch


def test_system_prompt_rendered_from_template():
    """build_system_prompt renders template with bucket definitions."""
    from copilot import build_system_prompt

    prompt = build_system_prompt()
    assert "Copilot" in prompt
    assert "project" in prompt
    # Buckets are rendered from the template
    assert "**inbox**" in prompt
    assert "**next**" in prompt
    assert "**someday**" in prompt
    assert "**reference**" in prompt
    # Rules are present
    assert "copilot_cli" in prompt
    assert "items create" in prompt
    assert "items list" in prompt
    assert "projects actions create" in prompt
    assert "Wochenplanung, Scheduling und Review" in prompt
    assert "Senticor als einzige Quelle" in prompt
    # System time is injected
    assert "Systemzeit (UTC)" in prompt


def test_system_prompt_includes_user_context():
    """build_system_prompt renders user context when provided."""
    from copilot import build_system_prompt

    prompt = build_system_prompt(
        user_context={
            "username": "Wolfgang",
            "email": "wolf@example.com",
            "timezone": "Europe/Berlin",
            "locale": "de-DE",
            "localTime": "2026-02-13T15:30:00+01:00",
        }
    )
    assert "Wolfgang" in prompt
    assert "Europe/Berlin" in prompt
    assert "de-DE" in prompt
    assert "2026-02-13T15:30:00+01:00" in prompt


def test_system_prompt_without_user_context():
    """build_system_prompt works without user context (graceful degradation)."""
    from copilot import build_system_prompt

    prompt = build_system_prompt()
    # Should not contain user-specific sections
    assert "Name:" not in prompt
    # Should still have core content
    assert "Copilot" in prompt
    assert "**inbox**" in prompt


def test_load_prompt_with_custom_vars():
    """load_prompt renders template variables correctly."""
    from copilot import load_prompt

    result = load_prompt(
        "de/copilot_system.j2",
        buckets=[{"id": "test", "label": "Testbucket"}],
        system_time="2026-01-01 00:00 UTC",
        user_context={},
    )
    assert "**test**" in result
    assert "Testbucket" in result
    # Should not contain other buckets
    assert "**inbox**" not in result


def test_parse_models_from_agent_model():
    """AGENT_MODEL env var is parsed into a list."""
    with patch.dict("os.environ", {"AGENT_MODEL": "model-a, model-b , model-c"}, clear=False):
        from copilot import _parse_models

        models = _parse_models()
    assert models == ["model-a", "model-b", "model-c"]


def test_parse_models_falls_back_to_openrouter_model():
    """Falls back to OPENROUTER_MODEL if AGENT_MODEL is not set."""
    env = {"OPENROUTER_MODEL": "fallback-model"}
    with patch.dict("os.environ", env, clear=False):
        # Remove AGENT_MODEL if present
        import os

        os.environ.pop("AGENT_MODEL", None)
        from copilot import _parse_models

        models = _parse_models()
    assert models == ["fallback-model"]


def test_parse_models_default():
    """Defaults to openai/gpt-4o-mini if neither env var is set."""
    import os

    with patch.dict("os.environ", {}, clear=False):
        os.environ.pop("AGENT_MODEL", None)
        os.environ.pop("OPENROUTER_MODEL", None)
        from copilot import _parse_models

        models = _parse_models()
    assert models == ["openai/gpt-4o-mini"]


def test_system_prompt_includes_workspace_overview_tool():
    """System prompt mentions list_workspace_overview tool."""
    from copilot import build_system_prompt

    prompt = build_system_prompt()
    assert "list_workspace_overview" in prompt


def test_tools_defined():
    """Single CLI exit-condition tool is defined."""
    from copilot import TOOLS

    names = [t.name for t in TOOLS]
    assert names == ["copilot_cli"]


def test_run_async_from_sync_context():
    """_run_async can call an async function from sync code."""
    from copilot import _run_async

    async def add(a, b):
        return a + b

    result = _run_async(add(3, 4))
    assert result == 7


def test_run_async_from_within_running_loop():
    """_run_async works even when called from within an existing event loop.

    This is the exact scenario that broke before — Haystack Agent.run_async()
    already owns the event loop, and the sync tool function needs to call
    an async backend method.
    """
    import asyncio

    from copilot import _run_async

    async def outer():
        async def inner():
            return "ok"

        return _run_async(inner())

    result = asyncio.run(outer())
    assert result == "ok"
