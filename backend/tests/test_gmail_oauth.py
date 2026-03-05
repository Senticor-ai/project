"""Tests for Gmail OAuth helpers — URL building, token revocation, and refresh."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from app.email.gmail_oauth import GOOGLE_REVOKE_URL, build_gmail_auth_url, refresh_gmail_token, revoke_google_token


class _DummyCursor:
    def __init__(self, fetchone_result=None):
        self._fetchone_result = fetchone_result
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, query: str, params: tuple) -> None:
        self.executed.append((" ".join(query.split()), params))

    def fetchone(self):
        return self._fetchone_result

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False


class _DummyConn:
    def __init__(self, cursor: _DummyCursor):
        self._cursor = cursor
        self.committed = False

    def cursor(self):
        return self._cursor

    def commit(self) -> None:
        self.committed = True


class _DummyConnContext:
    def __init__(self, conn: _DummyConn):
        self._conn = conn

    def __enter__(self):
        return self._conn

    def __exit__(self, _exc_type, _exc, _tb):
        return False


class _DummyDbConnFactory:
    def __init__(self, conns: list[_DummyConn]):
        self._conns = iter(conns)

    def __call__(self):
        return _DummyConnContext(next(self._conns))


class _DummyHttpResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, int | str]:
        return {"access_token": "new-access-token", "expires_in": 3600}


@pytest.mark.unit
class TestBuildGmailAuthUrl:
    """build_gmail_auth_url should support optional login_hint."""

    def test_includes_login_hint_when_provided(self):
        url = build_gmail_auth_url("test-state", login_hint="user@gmail.com")
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        assert params["login_hint"] == ["user@gmail.com"]

    def test_omits_login_hint_when_not_provided(self):
        url = build_gmail_auth_url("test-state")
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        assert "login_hint" not in params

    def test_includes_required_params(self):
        url = build_gmail_auth_url("test-state")
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        assert params["state"] == ["test-state"]
        assert params["prompt"] == ["consent"]
        assert params["access_type"] == ["offline"]


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


@pytest.mark.unit
class TestRefreshGmailToken:
    def test_refresh_writes_encryption_key_version(self, monkeypatch):
        select_cursor = _DummyCursor({"encrypted_refresh_token": "enc-refresh-token"})
        update_cursor = _DummyCursor()
        select_conn = _DummyConn(select_cursor)
        update_conn = _DummyConn(update_cursor)
        monkeypatch.setattr(
            "app.email.gmail_oauth.db_conn",
            _DummyDbConnFactory([select_conn, update_conn]),
        )

        class DummyCrypto:
            active_version = 3

            def decrypt(self, _ciphertext: str) -> str:
                return "plain-refresh-token"

            def encrypt(self, plaintext: str) -> str:
                return f"enc:{plaintext}"

        monkeypatch.setattr("app.email.gmail_oauth.CryptoService", DummyCrypto)
        monkeypatch.setattr("app.email.gmail_oauth.httpx.post", lambda *_a, **_k: _DummyHttpResponse())

        token = refresh_gmail_token("connection-1", "org-1")
        assert token == "new-access-token"
        assert update_conn.committed is True
        assert len(update_cursor.executed) == 1

        query, params = update_cursor.executed[0]
        assert "encryption_key_version = %s" in query
        assert params[0] == "enc:new-access-token"
        assert params[2] == 3
        assert params[3] == "connection-1"
        assert params[4] == "org-1"
