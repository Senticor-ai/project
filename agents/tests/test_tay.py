"""Tests for tay.py — prompt loading, model parsing, agent factory."""

from __future__ import annotations

from unittest.mock import patch


def test_system_prompt_rendered_from_template():
    """SYSTEM_PROMPT is loaded from Jinja2 template with bucket definitions."""
    from tay import SYSTEM_PROMPT

    assert "Tay" in SYSTEM_PROMPT
    assert "GTD" in SYSTEM_PROMPT
    # Buckets are rendered from the template
    assert "**inbox**" in SYSTEM_PROMPT
    assert "**next**" in SYSTEM_PROMPT
    assert "**someday**" in SYSTEM_PROMPT
    assert "**reference**" in SYSTEM_PROMPT
    # Rules are present
    assert "create_project_with_actions" in SYSTEM_PROMPT
    assert "create_action" in SYSTEM_PROMPT
    assert "create_reference" in SYSTEM_PROMPT


def test_load_prompt_with_custom_vars():
    """load_prompt renders template variables correctly."""
    from tay import load_prompt

    result = load_prompt("de/tay_system.j2", buckets=[{"id": "test", "label": "Testbucket"}])
    assert "**test**" in result
    assert "Testbucket" in result
    # Should not contain other buckets
    assert "**inbox**" not in result


def test_parse_models_from_agent_model():
    """AGENT_MODEL env var is parsed into a list."""
    with patch.dict("os.environ", {"AGENT_MODEL": "model-a, model-b , model-c"}, clear=False):
        from tay import _parse_models

        models = _parse_models()
    assert models == ["model-a", "model-b", "model-c"]


def test_parse_models_falls_back_to_openrouter_model():
    """Falls back to OPENROUTER_MODEL if AGENT_MODEL is not set."""
    env = {"OPENROUTER_MODEL": "fallback-model"}
    with patch.dict("os.environ", env, clear=False):
        # Remove AGENT_MODEL if present
        import os

        os.environ.pop("AGENT_MODEL", None)
        from tay import _parse_models

        models = _parse_models()
    assert models == ["fallback-model"]


def test_parse_models_default():
    """Defaults to openai/gpt-4o-mini if neither env var is set."""
    import os

    with patch.dict("os.environ", {}, clear=False):
        os.environ.pop("AGENT_MODEL", None)
        os.environ.pop("OPENROUTER_MODEL", None)
        from tay import _parse_models

        models = _parse_models()
    assert models == ["openai/gpt-4o-mini"]


def test_tools_defined():
    """Three tools are defined with correct names."""
    from tay import TOOLS

    names = [t.name for t in TOOLS]
    assert names == ["create_project_with_actions", "create_action", "create_reference"]
