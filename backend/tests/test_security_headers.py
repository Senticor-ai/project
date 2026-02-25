"""Tests for security headers middleware and CORS configuration."""

import dataclasses

from app.config import settings


def _patch_settings(monkeypatch, **overrides):
    """Replace the module-level settings with a copy that has overrides applied."""
    patched = dataclasses.replace(settings, **overrides)
    monkeypatch.setattr("app.main.settings", patched)
    return patched


class TestSecurityHeaders:
    """Verify security headers are applied to responses."""

    def test_x_content_type_options(self, client):
        response = client.get("/health")
        assert response.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        response = client.get("/health")
        assert response.headers.get("X-Frame-Options") == "DENY"

    def test_referrer_policy(self, client):
        response = client.get("/health")
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        response = client.get("/health")
        assert (
            response.headers.get("Permissions-Policy") == "camera=(), microphone=(), geolocation=()"
        )

    def test_csp_header_present(self, client):
        response = client.get("/health")
        csp = response.headers.get("Content-Security-Policy")
        assert csp is not None
        assert "default-src" in csp
        assert "frame-ancestors 'none'" in csp


class TestHstsHeader:
    """HSTS is off by default (dev) and on in production."""

    def test_hsts_absent_by_default(self, client):
        response = client.get("/health")
        assert "Strict-Transport-Security" not in response.headers

    def test_hsts_present_when_enabled(self, client, monkeypatch):
        _patch_settings(monkeypatch, hsts_enabled=True, hsts_max_age=31536000)
        response = client.get("/health")
        hsts = response.headers.get("Strict-Transport-Security")
        assert hsts is not None
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts
        assert "preload" in hsts

    def test_hsts_custom_max_age(self, client, monkeypatch):
        _patch_settings(monkeypatch, hsts_enabled=True, hsts_max_age=86400)
        response = client.get("/health")
        hsts = response.headers.get("Strict-Transport-Security")
        assert hsts is not None
        assert "max-age=86400" in hsts

    def test_hsts_disabled_explicitly(self, client, monkeypatch):
        _patch_settings(monkeypatch, hsts_enabled=False)
        response = client.get("/health")
        assert "Strict-Transport-Security" not in response.headers


class TestCorsConfiguration:
    """CORS allows only explicit methods and headers, not wildcards."""

    def test_cors_allows_configured_origin(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"

    def test_cors_rejects_unknown_origin(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "Access-Control-Allow-Origin" not in response.headers

    def test_cors_methods_are_explicit(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        allowed_methods = response.headers.get("Access-Control-Allow-Methods", "")
        # Should list explicit methods, not wildcard "*"
        assert "*" not in allowed_methods
        assert "GET" in allowed_methods
        assert "POST" in allowed_methods
        assert "PATCH" in allowed_methods
        assert "DELETE" in allowed_methods

    def test_cors_headers_are_explicit(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        allowed_headers = response.headers.get("Access-Control-Allow-Headers", "")
        # Should list explicit headers, not wildcard "*"
        assert "*" not in allowed_headers
        assert "content-type" in allowed_headers.lower()
