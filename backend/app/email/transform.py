"""Transform EmailMessage dataclass → TAY JSON-LD EmailMessage entity.

Follows the same pattern as imports/nirvana/transform.py, using shared helpers
from imports/shared.py for canonical IDs and property values.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime

from ..imports.shared import (
    _SOURCE_METADATA_SCHEMA_VERSION,
    _build_base_entity,
    _canonical_id,
    _pv,
)


@dataclass
class EmailAttachment:
    """Represents an email attachment."""

    filename: str
    content_type: str
    size: int


@dataclass
class EmailMessage:
    """Represents a fetched email message (source-agnostic)."""

    uid: str
    message_id: str | None
    subject: str | None
    sender_email: str
    sender_name: str | None
    recipients: list[dict[str, str]] = field(default_factory=list)
    received_at: datetime | None = None
    body_text: str | None = None
    body_html: str | None = None
    attachments: list[EmailAttachment] = field(default_factory=list)


def _email_canonical_id(message_id: str) -> str:
    """Build canonical ID from RFC 2822 Message-ID.

    Uses first 16 hex chars of SHA-256 for deduplication-safe IDs.
    """
    digest = hashlib.sha256(message_id.encode("utf-8")).hexdigest()[:16]
    return _canonical_id("email", digest)


def _snippet(text: str | None, max_len: int = 120) -> str:
    """Extract a short snippet from the body text."""
    if not text:
        return ""
    clean = " ".join(text.split())
    if len(clean) <= max_len:
        return clean
    return clean[:max_len].rstrip() + "…"


def build_email_item(
    msg: EmailMessage,
    *,
    source: str = "gmail",
) -> tuple[str, dict]:
    """Convert an IMAP EmailMessage to a TAY JSON-LD entity.

    Returns (canonical_id, json_ld_entity).
    """
    # For Gmail we want a strict 1:1 mapping between Gmail message and item.
    # RFC Message-ID can collide across different Gmail messages.
    raw_message_id = msg.uid if source == "gmail" else (msg.message_id or msg.uid)
    canonical_id = _email_canonical_id(raw_message_id)

    subject = msg.subject or "(kein Betreff)"
    body_snippet = _snippet(msg.body_text)
    now = datetime.now(UTC)
    received = msg.received_at or now

    # Build sender Person object
    sender: dict | None = None
    if msg.sender_email:
        sender = {
            "@type": "Person",
            "email": msg.sender_email,
        }
        if msg.sender_name:
            sender["name"] = msg.sender_name

    # Build recipient list
    to_recipients = [
        {"@type": "Person", "email": r["email"], "name": r.get("name") or None}
        for r in msg.recipients
        if r.get("type") == "to"
    ]
    cc_recipients = [
        {"@type": "Person", "email": r["email"], "name": r.get("name") or None}
        for r in msg.recipients
        if r.get("type") == "cc"
    ]

    # Build base entity (reuse shared helper)
    entity = _build_base_entity(
        canonical_id=canonical_id,
        name=subject,
        description=body_snippet or None,
        keywords=[],
        created_at=received,
        updated_at=received,
        source=source,
        ports=[],
        source_metadata={
            "schemaVersion": _SOURCE_METADATA_SCHEMA_VERSION,
            "provider": source,
            "rawId": raw_message_id,
            "rawType": 0,
            "rawState": 0,
            "raw": {
                "messageId": msg.message_id,
                "uid": msg.uid,
                "from": msg.sender_email,
                "fromName": msg.sender_name,
                "to": [r for r in msg.recipients if r.get("type") == "to"],
                "cc": [r for r in msg.recipients if r.get("type") == "cc"],
            },
        },
    )

    entity["@type"] = "EmailMessage"

    # Schema.org EmailMessage fields
    if sender:
        entity["sender"] = sender
    if to_recipients:
        entity["toRecipient"] = to_recipients
    if cc_recipients:
        entity["ccRecipient"] = cc_recipients

    # Override captureSource from _build_base_entity (which sets kind=import)
    # and add email-specific additional properties
    email_props = [
        _pv("app:bucket", "inbox"),
        _pv(
            "app:rawCapture",
            body_snippet or subject,
        ),
        _pv("app:needsEnrichment", True),
        _pv("app:confidence", "medium"),
        _pv(
            "app:captureSource",
            {
                "kind": "email",
                "subject": subject,
                "from": msg.sender_email,
            },
        ),
        _pv("app:emailBody", msg.body_html or msg.body_text or ""),
        _pv("app:extractableEntities", ["Person", "Organization"]),
    ]

    # Replace the default additionalProperty list with email-specific one.
    # Keep provenanceHistory, ports, typedReferences from base; replace the rest.
    base_props = entity["additionalProperty"]
    keep_ids = {"app:provenanceHistory", "app:ports", "app:typedReferences"}
    entity["additionalProperty"] = [
        p for p in base_props if p.get("propertyID") in keep_ids
    ] + email_props

    return canonical_id, entity
