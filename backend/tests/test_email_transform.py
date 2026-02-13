"""Tests for email/transform.py — EmailMessage → JSON-LD transform."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.email.imap_client import EmailMessage
from app.email.transform import _email_canonical_id, _snippet, build_email_item

pytestmark = pytest.mark.unit


def _make_msg(**overrides) -> EmailMessage:
    """Factory for test EmailMessage instances."""
    defaults = {
        "uid": "12345",
        "message_id": "<test-abc-123@example.com>",
        "subject": "Re: Antrag auf Verlängerung",
        "sender_email": "h.schmidt@example.de",
        "sender_name": "Hans Schmidt",
        "recipients": [
            {"email": "beamte@bund.de", "name": "Beamte", "type": "to"},
            {"email": "cc@bund.de", "name": "", "type": "cc"},
        ],
        "received_at": datetime(2026, 2, 10, 9, 0, 0, tzinfo=UTC),
        "body_text": "Sehr geehrte Frau Müller, bitte prüfen Sie den Antrag.",
        "body_html": "<p>Sehr geehrte Frau Müller, bitte prüfen Sie den Antrag.</p>",
        "attachments": [],
    }
    defaults.update(overrides)
    return EmailMessage(**defaults)


class TestEmailCanonicalId:
    def test_deterministic(self):
        id1 = _email_canonical_id("<msg@example.com>")
        id2 = _email_canonical_id("<msg@example.com>")
        assert id1 == id2

    def test_starts_with_urn_prefix(self):
        cid = _email_canonical_id("<msg@example.com>")
        assert cid.startswith("urn:app:email:")

    def test_different_message_ids_produce_different_ids(self):
        id1 = _email_canonical_id("<a@example.com>")
        id2 = _email_canonical_id("<b@example.com>")
        assert id1 != id2

    def test_hex_digest_length(self):
        cid = _email_canonical_id("<msg@example.com>")
        hex_part = cid.split(":")[-1]
        assert len(hex_part) == 16
        assert all(c in "0123456789abcdef" for c in hex_part)


class TestSnippet:
    def test_short_text_unchanged(self):
        assert _snippet("Hello") == "Hello"

    def test_long_text_truncated(self):
        long_text = "a" * 200
        result = _snippet(long_text, max_len=120)
        assert len(result) <= 121  # 120 + ellipsis char
        assert result.endswith("…")

    def test_whitespace_collapsed(self):
        assert _snippet("  hello\n  world  ") == "hello world"

    def test_none_returns_empty(self):
        assert _snippet(None) == ""

    def test_empty_returns_empty(self):
        assert _snippet("") == ""


class TestBuildEmailItem:
    def test_basic_transform(self):
        msg = _make_msg()
        canonical_id, entity = build_email_item(msg)

        assert canonical_id.startswith("urn:app:email:")
        assert entity["@id"] == canonical_id
        assert entity["@type"] == "EmailMessage"
        assert entity["_schemaVersion"] == 2
        assert entity["name"] == "Re: Antrag auf Verlängerung"

    def test_sender_populated(self):
        msg = _make_msg()
        _, entity = build_email_item(msg)

        assert entity["sender"]["@type"] == "Person"
        assert entity["sender"]["email"] == "h.schmidt@example.de"
        assert entity["sender"]["name"] == "Hans Schmidt"

    def test_recipients_split(self):
        msg = _make_msg()
        _, entity = build_email_item(msg)

        assert len(entity["toRecipient"]) == 1
        assert entity["toRecipient"][0]["email"] == "beamte@bund.de"
        assert len(entity["ccRecipient"]) == 1
        assert entity["ccRecipient"][0]["email"] == "cc@bund.de"

    def test_additional_properties(self):
        msg = _make_msg()
        _, entity = build_email_item(msg)

        props = {p["propertyID"]: p["value"] for p in entity["additionalProperty"]}

        assert props["app:bucket"] == "inbox"
        assert props["app:needsEnrichment"] is True
        assert props["app:confidence"] == "medium"
        assert props["app:captureSource"]["kind"] == "email"
        assert props["app:captureSource"]["from"] == "h.schmidt@example.de"
        assert "Verlängerung" in props["app:captureSource"]["subject"]
        assert props["app:extractableEntities"] == ["Person", "Organization"]

    def test_email_body_prefers_html(self):
        msg = _make_msg(
            body_text="plain text",
            body_html="<p>html body</p>",
        )
        _, entity = build_email_item(msg)
        props = {p["propertyID"]: p["value"] for p in entity["additionalProperty"]}

        assert props["app:emailBody"] == "<p>html body</p>"

    def test_email_body_falls_back_to_text(self):
        msg = _make_msg(body_text="plain fallback", body_html=None)
        _, entity = build_email_item(msg)
        props = {p["propertyID"]: p["value"] for p in entity["additionalProperty"]}

        assert props["app:emailBody"] == "plain fallback"

    def test_source_metadata(self):
        msg = _make_msg()
        _, entity = build_email_item(msg, source="gmail")

        sm = entity["sourceMetadata"]
        assert sm["schemaVersion"] == 1
        assert sm["provider"] == "gmail"
        assert sm["rawId"] == "<test-abc-123@example.com>"
        assert sm["raw"]["messageId"] == "<test-abc-123@example.com>"
        assert sm["raw"]["uid"] == "12345"

    def test_missing_subject_gets_default(self):
        msg = _make_msg(subject=None)
        _, entity = build_email_item(msg)

        assert entity["name"] == "(kein Betreff)"

    def test_missing_body_produces_empty_snippet(self):
        msg = _make_msg(body_text=None, body_html=None)
        _, entity = build_email_item(msg)

        assert entity["description"] is None

    def test_fallback_to_uid_when_no_message_id(self):
        msg = _make_msg(message_id=None)
        canonical_id, _ = build_email_item(msg)

        # Should use UID as fallback for canonical ID
        assert canonical_id.startswith("urn:app:email:")

    def test_no_sender_when_empty_email(self):
        msg = _make_msg(sender_email="", sender_name=None)
        _, entity = build_email_item(msg)

        assert "sender" not in entity

    def test_dates_from_received_at(self):
        received = datetime(2026, 2, 10, 9, 30, 0, tzinfo=UTC)
        msg = _make_msg(received_at=received)
        _, entity = build_email_item(msg)

        assert entity["dateCreated"] == received.isoformat()
        assert entity["dateModified"] == received.isoformat()

    def test_german_umlauts_preserved(self):
        msg = _make_msg(
            subject="Prüfung des Änderungsantrags",
            body_text="Bitte leiten Sie den Antrag an Frau Müller weiter.",
        )
        _, entity = build_email_item(msg)

        assert "Prüfung" in entity["name"]
        assert "Müller" in (entity["description"] or "")

    def test_deduplication_across_syncs(self):
        """Same message_id should always produce the same canonical_id."""
        msg1 = _make_msg(uid="100", message_id="<same@example.com>")
        msg2 = _make_msg(uid="200", message_id="<same@example.com>")

        id1, _ = build_email_item(msg1)
        id2, _ = build_email_item(msg2)

        assert id1 == id2

    def test_keeps_provenance_and_typed_refs(self):
        """Verify that provenanceHistory, ports, typedReferences survive from base."""
        msg = _make_msg()
        _, entity = build_email_item(msg)

        prop_ids = [p["propertyID"] for p in entity["additionalProperty"]]
        assert "app:provenanceHistory" in prop_ids
        assert "app:typedReferences" in prop_ids
        assert "app:ports" in prop_ids
