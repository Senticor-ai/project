"""IMAP client for fetching emails — OAuth2-only (Gmail).

Ported from Procedere's imap_service.py, stripped of password auth and save_draft.
Kept for future non-Gmail IMAP providers; currently unused (Gmail uses REST API).

Requires optional dependency: ``pip install imapclient>=3.0.0``
"""

from __future__ import annotations

import email as email_mod
import email.policy
import logging
import ssl
from email.utils import parsedate_to_datetime

from imapclient import IMAPClient

from .transform import EmailAttachment, EmailMessage

logger = logging.getLogger(__name__)


class ImapClient:
    """IMAP client using XOAUTH2 for Gmail."""

    def __init__(
        self,
        host: str = "imap.gmail.com",
        port: int = 993,
        username: str = "",
        access_token: str = "",
    ):
        self.host = host
        self.port = port
        self.username = username
        self.access_token = access_token

    def _connect(self) -> IMAPClient:
        ssl_context = ssl.create_default_context()
        client = IMAPClient(self.host, port=self.port, ssl=True, ssl_context=ssl_context)
        if not self.access_token:
            raise ValueError("OAuth2 access token is required")
        client.oauth2_login(self.username, self.access_token)
        return client

    def test_connection(self) -> tuple[bool, str | None]:
        """Test IMAP connection credentials."""
        try:
            with self._connect() as client:
                folder_info = client.select_folder("INBOX", readonly=True)
                msg_count = folder_info.get(b"EXISTS", 0)
                logger.info(
                    "IMAP connection OK: host=%s user=%s inbox=%d",
                    self.host,
                    self.username,
                    msg_count,
                )
            return True, None
        except Exception as e:
            logger.warning("IMAP connection failed: host=%s error=%s", self.host, str(e))
            return False, str(e)

    def fetch_since_uid(
        self,
        folder: str = "INBOX",
        since_uid: int = 0,
        limit: int = 100,
    ) -> list[EmailMessage]:
        """Fetch messages with UID greater than since_uid.

        Uses IMAP UID SEARCH to find messages newer than the last seen UID.
        Returns at most `limit` messages, oldest first.
        """
        messages: list[EmailMessage] = []

        with self._connect() as client:
            client.select_folder(folder, readonly=True)

            # UID range search: since_uid+1:*
            if since_uid > 0:
                criteria = [f"UID {since_uid + 1}:*"]
            else:
                criteria = ["ALL"]

            uids = client.search(criteria)

            # Filter out UIDs <= since_uid (IMAP UID * can include last UID)
            if since_uid > 0:
                uids = [u for u in uids if u > since_uid]

            # Take oldest first, limited
            uids = sorted(uids)[:limit]

            if not uids:
                return messages

            fetched = client.fetch(uids, ["UID", "RFC822", "INTERNALDATE"])

            for uid, data in fetched.items():
                try:
                    msg = _parse_message(uid, data)
                    if msg:
                        messages.append(msg)
                except Exception:
                    logger.warning("Failed to parse message uid=%s", uid, exc_info=True)

        return messages

    def mark_read(self, folder: str, uids: list[int]) -> None:
        """Mark messages as read (add \\Seen flag)."""
        if not uids:
            return
        with self._connect() as client:
            client.select_folder(folder)
            client.add_flags(uids, [b"\\Seen"])


# ---------------------------------------------------------------------------
# Message parsing (module-level functions)
# ---------------------------------------------------------------------------


def _parse_message(uid: int, data: dict) -> EmailMessage | None:
    raw_email = data.get(b"RFC822")
    internal_date = data.get(b"INTERNALDATE")

    if not raw_email:
        return None

    msg = email_mod.message_from_bytes(raw_email, policy=email_mod.policy.default)

    # Sender
    from_header = msg["From"]
    if from_header and hasattr(from_header, "addresses") and from_header.addresses:
        addr = from_header.addresses[0]
        sender_name = addr.display_name if addr.display_name else None
        sender_email = addr.addr_spec
    else:
        sender_name = None
        sender_email = ""

    subject = str(msg.get("Subject", "") or "")
    message_id = str(msg.get("Message-ID", "") or "") or None

    # Recipients
    recipients = []
    for header_type, recipient_type in [("To", "to"), ("Cc", "cc")]:
        header_value = msg[header_type]
        if header_value and hasattr(header_value, "addresses"):
            for addr in header_value.addresses:
                recipients.append(
                    {
                        "email": addr.addr_spec,
                        "name": addr.display_name or "",
                        "type": recipient_type,
                    }
                )

    # Date
    received_at = internal_date
    if not received_at:
        date_header = msg.get("Date")
        if date_header:
            try:
                received_at = parsedate_to_datetime(str(date_header))
            except Exception:
                received_at = None

    # Body
    body_text, body_html, attachments = _parse_body(msg)

    return EmailMessage(
        uid=str(uid),
        message_id=message_id,
        subject=subject,
        sender_email=sender_email,
        sender_name=sender_name,
        recipients=recipients,
        received_at=received_at,
        body_text=body_text,
        body_html=body_html,
        attachments=attachments,
    )


def _parse_body(
    msg: email_mod.message.Message,
) -> tuple[str | None, str | None, list[EmailAttachment]]:
    body_text: str | None = None
    body_html: str | None = None
    attachments: list[EmailAttachment] = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            if content_type.startswith("multipart/"):
                continue

            if "attachment" in content_disposition:
                filename = part.get_filename() or "attachment"
                payload = part.get_payload(decode=True)
                attachments.append(
                    EmailAttachment(
                        filename=str(filename),
                        content_type=content_type,
                        size=len(payload) if payload else 0,
                    )
                )
                continue

            if content_type == "text/plain" and not body_text:
                payload = part.get_payload(decode=True)
                if isinstance(payload, bytes):
                    charset = part.get_content_charset() or "utf-8"
                    body_text = payload.decode(charset, errors="replace")

            elif content_type == "text/html" and not body_html:
                payload = part.get_payload(decode=True)
                if isinstance(payload, bytes):
                    charset = part.get_content_charset() or "utf-8"
                    body_html = payload.decode(charset, errors="replace")
    else:
        content_type = msg.get_content_type()
        payload = msg.get_payload(decode=True)
        if isinstance(payload, bytes):
            charset = msg.get_content_charset() or "utf-8"
            text = payload.decode(charset, errors="replace")
            if content_type == "text/html":
                body_html = text
            else:
                body_text = text

    return body_text, body_html, attachments
