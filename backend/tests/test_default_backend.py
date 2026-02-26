"""Tests for config-driven default agent backend (Slice 3).

Verifies that DEFAULT_AGENT_BACKEND controls the default for new users,
while existing users with explicit settings keep their choice.
"""

from __future__ import annotations

import dataclasses

from app.config import settings


def _patch_settings(monkeypatch, **overrides):
    """Replace module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.routes.agent_settings.settings", patched)
    return patched


class TestDefaultBackend:
    """get_user_agent_backend() and GET /agent/settings honour the config default."""

    def test_new_user_gets_openclaw_default(self, auth_client, monkeypatch):
        """When DEFAULT_AGENT_BACKEND=openclaw, a fresh user sees openclaw."""
        _patch_settings(monkeypatch, default_agent_backend="openclaw")
        monkeypatch.setattr("app.routes.agent_settings.get_identity_name", lambda _user_id: None)
        response = auth_client.get("/agent/settings")
        assert response.status_code == 200
        assert response.json()["agentBackend"] == "openclaw"
        assert response.json()["agentName"] == "OpenClaw"

    def test_new_user_gets_haystack_when_rollback(self, auth_client, monkeypatch):
        """When DEFAULT_AGENT_BACKEND=haystack (rollback), a fresh user sees haystack."""
        _patch_settings(monkeypatch, default_agent_backend="haystack")
        response = auth_client.get("/agent/settings")
        assert response.status_code == 200
        assert response.json()["agentBackend"] == "haystack"
        assert response.json()["agentName"] == "Copilot"

    def test_openclaw_name_from_identity_is_returned(self, auth_client, monkeypatch):
        _patch_settings(monkeypatch, default_agent_backend="openclaw")
        monkeypatch.setattr("app.routes.agent_settings.get_identity_name", lambda _user_id: "Nora")

        response = auth_client.get("/agent/settings")
        assert response.status_code == 200
        assert response.json()["agentName"] == "Nora"

    def test_explicit_haystack_user_keeps_haystack(self, auth_client, monkeypatch):
        """A user who explicitly chose haystack keeps it even when default is openclaw."""
        _patch_settings(monkeypatch, default_agent_backend="openclaw")

        # Explicitly set to haystack
        auth_client.put("/agent/settings", json={"agentBackend": "haystack"})

        response = auth_client.get("/agent/settings")
        assert response.status_code == 200
        assert response.json()["agentBackend"] == "haystack"

    def test_explicit_openclaw_user_keeps_openclaw(self, auth_client, monkeypatch):
        """A user who explicitly chose openclaw keeps it even when default is haystack."""
        _patch_settings(monkeypatch, default_agent_backend="haystack")

        # Explicitly set to openclaw
        auth_client.put("/agent/settings", json={"agentBackend": "openclaw"})

        response = auth_client.get("/agent/settings")
        assert response.status_code == 200
        assert response.json()["agentBackend"] == "openclaw"
