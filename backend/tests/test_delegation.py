"""Tests for delegated JWT token creation and verification (RFC 8693 semantics)."""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.config import settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_SECRET = "test-secret-for-delegation-jwt-32bytes!"


def _patch_secret(monkeypatch, **overrides):
    """Patch the delegation JWT secret in settings."""
    patched = dataclasses.replace(
        settings,
        delegation_jwt_secret=_TEST_SECRET,
        delegation_jwt_ttl_seconds=60,
        **overrides,
    )
    monkeypatch.setattr("app.delegation.settings", patched)
    return patched


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------


class TestCreateDelegatedToken:
    def test_produces_valid_jwt(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import create_delegated_token

        token = create_delegated_token(user_id="user-1", org_id="org-1")
        assert isinstance(token, str)

        # Decode without verification to inspect claims
        claims = jwt.decode(token, _TEST_SECRET, algorithms=["HS256"], audience="terminandoyo-backend")
        assert claims["sub"] == "user-1"
        assert claims["org"] == "org-1"
        assert claims["act"] == {"sub": "tay"}
        assert claims["scope"] == "items:write"
        assert claims["token_type"] == "delegated"
        assert claims["iss"] == "terminandoyo-backend"
        assert claims["aud"] == "terminandoyo-backend"
        assert "jti" in claims
        assert "exp" in claims
        assert "iat" in claims

    def test_custom_actor_and_scope(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import create_delegated_token

        token = create_delegated_token(
            user_id="user-2",
            org_id="org-2",
            actor="assistant",
            scope="items:read",
        )
        claims = jwt.decode(token, _TEST_SECRET, algorithms=["HS256"], audience="terminandoyo-backend")
        assert claims["act"] == {"sub": "assistant"}
        assert claims["scope"] == "items:read"

    def test_custom_ttl(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import create_delegated_token

        token = create_delegated_token(user_id="u", org_id="o", ttl_seconds=10)
        claims = jwt.decode(token, _TEST_SECRET, algorithms=["HS256"], audience="terminandoyo-backend")
        # exp should be within ~10s of iat
        assert claims["exp"] - claims["iat"] == 10

    def test_uses_settings_ttl_by_default(self, monkeypatch):
        patched = dataclasses.replace(
            settings,
            delegation_jwt_secret=_TEST_SECRET,
            delegation_jwt_ttl_seconds=120,
        )
        monkeypatch.setattr("app.delegation.settings", patched)
        from app.delegation import create_delegated_token

        token = create_delegated_token(user_id="u", org_id="o")
        claims = jwt.decode(token, _TEST_SECRET, algorithms=["HS256"], audience="terminandoyo-backend")
        assert claims["exp"] - claims["iat"] == 120


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------


class TestVerifyDelegatedToken:
    def test_valid_token_round_trip(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import create_delegated_token, verify_delegated_token

        token = create_delegated_token(user_id="user-1", org_id="org-1")
        claims = verify_delegated_token(token)

        assert claims.sub == "user-1"
        assert claims.org == "org-1"
        assert claims.actor_sub == "tay"
        assert claims.scope == "items:write"
        assert claims.jti  # non-empty

    def test_rejects_expired_token(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        # Create token with exp in the past
        payload = {
            "iss": "terminandoyo-backend",
            "sub": "user-1",
            "aud": "terminandoyo-backend",
            "exp": datetime.now(UTC) - timedelta(seconds=10),
            "iat": datetime.now(UTC) - timedelta(seconds=70),
            "jti": "expired-jti",
            "act": {"sub": "tay"},
            "org": "org-1",
            "scope": "items:write",
            "token_type": "delegated",
        }
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")

        with pytest.raises(jwt.PyJWTError):
            verify_delegated_token(token)

    def test_rejects_wrong_issuer(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        payload = {
            "iss": "wrong-issuer",
            "sub": "user-1",
            "aud": "terminandoyo-backend",
            "exp": datetime.now(UTC) + timedelta(seconds=60),
            "iat": datetime.now(UTC),
            "jti": "jti-1",
            "act": {"sub": "tay"},
            "org": "org-1",
            "scope": "items:write",
            "token_type": "delegated",
        }
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")

        with pytest.raises(jwt.PyJWTError):
            verify_delegated_token(token)

    def test_rejects_wrong_audience(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        payload = {
            "iss": "terminandoyo-backend",
            "sub": "user-1",
            "aud": "wrong-audience",
            "exp": datetime.now(UTC) + timedelta(seconds=60),
            "iat": datetime.now(UTC),
            "jti": "jti-1",
            "act": {"sub": "tay"},
            "org": "org-1",
            "scope": "items:write",
            "token_type": "delegated",
        }
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")

        with pytest.raises(jwt.PyJWTError):
            verify_delegated_token(token)

    def test_rejects_wrong_token_type(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        payload = {
            "iss": "terminandoyo-backend",
            "sub": "user-1",
            "aud": "terminandoyo-backend",
            "exp": datetime.now(UTC) + timedelta(seconds=60),
            "iat": datetime.now(UTC),
            "jti": "jti-1",
            "act": {"sub": "tay"},
            "org": "org-1",
            "scope": "items:write",
            "token_type": "session",  # Wrong type
        }
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")

        with pytest.raises(jwt.InvalidTokenError, match="Not a delegated token"):
            verify_delegated_token(token)

    def test_rejects_missing_act_claim(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        payload = {
            "iss": "terminandoyo-backend",
            "sub": "user-1",
            "aud": "terminandoyo-backend",
            "exp": datetime.now(UTC) + timedelta(seconds=60),
            "iat": datetime.now(UTC),
            "jti": "jti-1",
            "org": "org-1",
            "scope": "items:write",
            "token_type": "delegated",
            # No "act" claim
        }
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")

        with pytest.raises(jwt.PyJWTError):
            verify_delegated_token(token)

    def test_rejects_wrong_secret(self, monkeypatch):
        _patch_secret(monkeypatch)
        from app.delegation import verify_delegated_token

        payload = {
            "iss": "terminandoyo-backend",
            "sub": "user-1",
            "aud": "terminandoyo-backend",
            "exp": datetime.now(UTC) + timedelta(seconds=60),
            "iat": datetime.now(UTC),
            "jti": "jti-1",
            "act": {"sub": "tay"},
            "org": "org-1",
            "scope": "items:write",
            "token_type": "delegated",
        }
        token = jwt.encode(payload, "wrong-secret", algorithm="HS256")

        with pytest.raises(jwt.PyJWTError):
            verify_delegated_token(token)
