"""Tests for Gmail OAuth helpers — token revocation."""

import httpx
import pytest
import respx

from app.email.gmail_oauth import GOOGLE_REVOKE_URL, revoke_google_token


@pytest.mark.unit
class TestRevokeGoogleToken:
    """revoke_google_token must be resilient: log but never raise."""

    @respx.mock
    def test_successful_revocation(self):
        route = respx.post(GOOGLE_REVOKE_URL).respond(200)
        revoke_google_token("test-token")
        assert route.called

    @respx.mock
    def test_non_200_does_not_raise(self):
        respx.post(GOOGLE_REVOKE_URL).respond(400, json={"error": "invalid_token"})
        # Must not raise
        revoke_google_token("bad-token")

    @respx.mock
    def test_timeout_does_not_raise(self):
        respx.post(GOOGLE_REVOKE_URL).mock(side_effect=httpx.TimeoutException("timeout"))
        # Must not raise
        revoke_google_token("test-token")

    @respx.mock
    def test_network_error_does_not_raise(self):
        respx.post(GOOGLE_REVOKE_URL).mock(side_effect=httpx.ConnectError("refused"))
        # Must not raise
        revoke_google_token("test-token")
