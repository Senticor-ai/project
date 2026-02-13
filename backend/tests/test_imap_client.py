"""Tests for email/imap_client.py — IMAP fetch + parse with mocked imapclient."""

from __future__ import annotations

import email.mime.multipart
import email.mime.text
from datetime import UTC, datetime
from email.mime.base import MIMEBase
from unittest.mock import MagicMock, patch

import pytest

from app.email.imap_client import (
    EmailMessage,
    ImapClient,
    _parse_body,
    _parse_message,
)

# ---------------------------------------------------------------------------
# Helpers to build raw RFC822 email bytes
# ---------------------------------------------------------------------------


def _build_simple_email(
    *,
    subject: str = "Test Subject",
    from_addr: str = "sender@example.com",
    from_name: str = "Sender Name",
    to_addr: str = "recipient@example.com",
    body_text: str = "Hello, World!",
    message_id: str = "<test-123@example.com>",
    date: str = "Mon, 10 Feb 2026 10:00:00 +0100",
) -> bytes:
    msg = email.mime.text.MIMEText(body_text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_addr
    msg["Message-ID"] = message_id
    msg["Date"] = date
    return msg.as_bytes()


def _build_multipart_email(
    *,
    subject: str = "Multipart Email",
    from_addr: str = "sender@example.com",
    body_text: str = "Plain text body",
    body_html: str = "<p>HTML body</p>",
    attachment_name: str | None = None,
    attachment_data: bytes | None = None,
    message_id: str = "<multi-456@example.com>",
) -> bytes:
    msg = email.mime.multipart.MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = "recipient@example.com"
    msg["Message-ID"] = message_id

    # Text alternative
    alt = email.mime.multipart.MIMEMultipart("alternative")
    alt.attach(email.mime.text.MIMEText(body_text, "plain", "utf-8"))
    alt.attach(email.mime.text.MIMEText(body_html, "html", "utf-8"))
    msg.attach(alt)

    if attachment_name and attachment_data:
        att = MIMEBase("application", "octet-stream")
        att.set_payload(attachment_data)
        att.add_header("Content-Disposition", "attachment", filename=attachment_name)
        msg.attach(att)

    return msg.as_bytes()


# ---------------------------------------------------------------------------
# _parse_message tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestParseMessage:
    def test_simple_text_email(self):
        raw = _build_simple_email()
        data = {b"RFC822": raw, b"INTERNALDATE": datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC)}

        result = _parse_message(12345, data)

        assert result is not None
        assert isinstance(result, EmailMessage)
        assert result.uid == "12345"
        assert result.message_id == "<test-123@example.com>"
        assert result.subject == "Test Subject"
        assert result.sender_email == "sender@example.com"
        assert result.sender_name == "Sender Name"
        assert result.body_text is not None
        assert "Hello, World!" in result.body_text
        assert result.body_html is None
        assert result.attachments == []

    def test_multipart_with_html_and_attachment(self):
        raw = _build_multipart_email(
            attachment_name="report.pdf",
            attachment_data=b"%PDF-fake-content",
        )
        data = {b"RFC822": raw, b"INTERNALDATE": datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC)}

        result = _parse_message(999, data)

        assert result is not None
        assert result.body_text is not None
        assert "Plain text body" in result.body_text
        assert result.body_html is not None
        assert "<p>HTML body</p>" in result.body_html
        assert len(result.attachments) == 1
        assert result.attachments[0].filename == "report.pdf"
        assert result.attachments[0].content_type == "application/octet-stream"
        assert result.attachments[0].size > 0

    def test_returns_none_when_no_rfc822(self):
        data = {b"INTERNALDATE": datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC)}
        assert _parse_message(1, data) is None

    def test_recipients_to_and_cc(self):
        msg = email.mime.text.MIMEText("body", "plain", "utf-8")
        msg["From"] = "from@example.com"
        msg["To"] = "to1@example.com, to2@example.com"
        msg["Cc"] = "cc@example.com"
        msg["Message-ID"] = "<recip-test@example.com>"
        data = {b"RFC822": msg.as_bytes(), b"INTERNALDATE": None}

        result = _parse_message(1, data)

        assert result is not None
        to_emails = [r["email"] for r in result.recipients if r["type"] == "to"]
        cc_emails = [r["email"] for r in result.recipients if r["type"] == "cc"]
        assert "to1@example.com" in to_emails
        assert "to2@example.com" in to_emails
        assert "cc@example.com" in cc_emails

    def test_german_umlauts_in_subject_and_body(self):
        raw = _build_simple_email(
            subject="Antrag auf Verlängerung der Frist",
            body_text="Sehr geehrte Frau Müller, bitte prüfen Sie den Antrag.",
        )
        data = {b"RFC822": raw, b"INTERNALDATE": None}

        result = _parse_message(1, data)

        assert result is not None
        assert "Verlängerung" in (result.subject or "")
        assert "Müller" in (result.body_text or "")

    def test_missing_subject_returns_empty_string(self):
        msg = email.mime.text.MIMEText("body", "plain")
        msg["From"] = "from@example.com"
        msg["To"] = "to@example.com"
        msg["Message-ID"] = "<no-subject@example.com>"
        data = {b"RFC822": msg.as_bytes(), b"INTERNALDATE": None}

        result = _parse_message(1, data)

        assert result is not None
        assert result.subject == ""

    def test_fallback_to_date_header_when_no_internal_date(self):
        raw = _build_simple_email(date="Tue, 11 Feb 2026 14:30:00 +0000")
        data = {b"RFC822": raw, b"INTERNALDATE": None}

        result = _parse_message(1, data)

        assert result is not None
        assert result.received_at is not None
        assert result.received_at.year == 2026
        assert result.received_at.month == 2
        assert result.received_at.day == 11


# ---------------------------------------------------------------------------
# _parse_body tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestParseBody:
    def test_plain_text_only(self):
        msg = email.mime.text.MIMEText("plain content", "plain", "utf-8")
        raw_msg = email.message_from_bytes(msg.as_bytes(), policy=email.policy.default)  # type: ignore[arg-type]
        text, html, atts = _parse_body(raw_msg)

        assert text is not None
        assert "plain content" in text
        assert html is None
        assert atts == []

    def test_html_only(self):
        msg = email.mime.text.MIMEText("<b>bold</b>", "html", "utf-8")
        raw_msg = email.message_from_bytes(msg.as_bytes(), policy=email.policy.default)  # type: ignore[arg-type]
        text, html, atts = _parse_body(raw_msg)

        assert text is None
        assert html is not None
        assert "<b>bold</b>" in html


# ---------------------------------------------------------------------------
# ImapClient tests (mocked imapclient)
# ---------------------------------------------------------------------------


class TestImapClient:
    def test_connect_requires_access_token(self):
        client = ImapClient(username="user@gmail.com", access_token="")
        with pytest.raises(ValueError, match="access token"):
            client._connect()

    @patch("app.email.imap_client.IMAPClient")
    def test_test_connection_success(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_conn.select_folder.return_value = {b"EXISTS": 42}
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="fake-token")
        ok, err = client.test_connection()

        assert ok is True
        assert err is None
        mock_conn.oauth2_login.assert_called_once_with("user@gmail.com", "fake-token")

    @patch("app.email.imap_client.IMAPClient")
    def test_test_connection_failure(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_conn.oauth2_login.side_effect = Exception("auth failed")
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="bad-token")
        ok, err = client.test_connection()

        assert ok is False
        assert "auth failed" in (err or "")

    @patch("app.email.imap_client.IMAPClient")
    def test_fetch_since_uid_returns_messages(self, mock_imap_cls):
        raw_email = _build_simple_email(
            subject="Neuer Antrag",
            from_addr="hans@example.de",
            from_name="Hans Schmidt",
        )
        mock_conn = MagicMock()
        mock_conn.select_folder.return_value = {}
        mock_conn.search.return_value = [101, 102]
        mock_conn.fetch.return_value = {
            101: {
                b"RFC822": raw_email,
                b"INTERNALDATE": datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC),
            },
        }
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="token")
        messages = client.fetch_since_uid(folder="INBOX", since_uid=100, limit=10)

        assert len(messages) == 1
        assert messages[0].subject == "Neuer Antrag"
        assert messages[0].sender_email == "hans@example.de"

    @patch("app.email.imap_client.IMAPClient")
    def test_fetch_since_uid_filters_old_uids(self, mock_imap_cls):
        """IMAP UID range can include the boundary UID — verify we filter it."""
        mock_conn = MagicMock()
        mock_conn.select_folder.return_value = {}
        mock_conn.search.return_value = [50, 51]  # 50 <= since_uid
        mock_conn.fetch.return_value = {}
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="token")
        client.fetch_since_uid(since_uid=50, limit=10)

        # Only UID 51 should be requested (>50), so fetch should be called with [51]
        mock_conn.fetch.assert_called_once()
        call_args = mock_conn.fetch.call_args[0]
        assert 50 not in call_args[0]
        assert 51 in call_args[0]

    @patch("app.email.imap_client.IMAPClient")
    def test_mark_read(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="token")
        client.mark_read("INBOX", [101, 102])

        mock_conn.select_folder.assert_called_once_with("INBOX")
        mock_conn.add_flags.assert_called_once_with([101, 102], [b"\\Seen"])

    @patch("app.email.imap_client.IMAPClient")
    def test_mark_read_skips_empty_uids(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn

        client = ImapClient(username="user@gmail.com", access_token="token")
        client.mark_read("INBOX", [])

        # Should not even connect
        mock_imap_cls.assert_not_called()
