"""Tests for JSON-LD builders (Python equivalents of frontend item-serializer.ts)."""

import re

import pytest

from jsonld_builders import build_action_jsonld, build_project_jsonld, build_reference_jsonld

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CONVERSATION_ID = "conv-1234567890-abc12"


def _props(jsonld: dict) -> dict:
    """Extract additionalProperty as {propertyID: value} dict."""
    return {p["propertyID"]: p["value"] for p in jsonld["additionalProperty"]}


# ---------------------------------------------------------------------------
# Project builder
# ---------------------------------------------------------------------------


class TestBuildProjectJsonLd:
    def test_structure(self):
        result = build_project_jsonld("Umzug", "Neue Wohnung bezogen", CONVERSATION_ID)

        assert result["@type"] == "Project"
        assert result["_schemaVersion"] == 2
        assert result["name"] == "Umzug"
        assert result["description"] is None
        assert result["keywords"] == []
        assert result["dateCreated"] is not None
        assert result["dateModified"] is not None

    def test_canonical_id_format(self):
        result = build_project_jsonld("Test", "Done", CONVERSATION_ID)
        assert result["@id"].startswith("urn:app:project:")
        uuid_part = result["@id"].split(":")[-1]
        assert UUID_RE.match(uuid_part)

    def test_bucket_is_project(self):
        result = build_project_jsonld("Test", "Done", CONVERSATION_ID)
        props = _props(result)
        assert props["app:bucket"] == "project"

    def test_desired_outcome(self):
        result = build_project_jsonld("Test", "Everything moved", CONVERSATION_ID)
        props = _props(result)
        assert props["app:desiredOutcome"] == "Everything moved"

    def test_project_status_active(self):
        result = build_project_jsonld("Test", "Done", CONVERSATION_ID)
        props = _props(result)
        assert props["app:projectStatus"] == "active"

    def test_is_focused_false(self):
        result = build_project_jsonld("Test", "Done", CONVERSATION_ID)
        props = _props(result)
        assert props["app:isFocused"] is False


# ---------------------------------------------------------------------------
# Action builder
# ---------------------------------------------------------------------------


class TestBuildActionJsonLd:
    def test_structure(self):
        result = build_action_jsonld("Einkaufen", "next", CONVERSATION_ID)

        assert result["@type"] == "Action"
        assert result["_schemaVersion"] == 2
        assert result["description"] is None
        assert result["keywords"] == []
        assert result["startTime"] is None
        assert result["endTime"] is None

    def test_canonical_id_format(self):
        result = build_action_jsonld("Test", "next", CONVERSATION_ID)
        assert result["@id"].startswith("urn:app:action:")
        uuid_part = result["@id"].split(":")[-1]
        assert UUID_RE.match(uuid_part)

    def test_bucket_from_argument(self):
        for bucket in ("next", "waiting", "calendar", "someday", "inbox"):
            result = build_action_jsonld("Test", bucket, CONVERSATION_ID)
            props = _props(result)
            assert props["app:bucket"] == bucket

    def test_raw_capture_is_name(self):
        result = build_action_jsonld("Einkaufen gehen", "next", CONVERSATION_ID)
        props = _props(result)
        assert props["app:rawCapture"] == "Einkaufen gehen"

    def test_with_project_ref(self):
        result = build_action_jsonld(
            "Kartons besorgen", "next", CONVERSATION_ID, project_id="urn:app:project:p1"
        )
        props = _props(result)
        assert props["app:projectRefs"] == ["urn:app:project:p1"]

    def test_without_project_ref(self):
        result = build_action_jsonld("Solo task", "next", CONVERSATION_ID)
        props = _props(result)
        assert props["app:projectRefs"] == []

    def test_contexts_empty(self):
        result = build_action_jsonld("Test", "next", CONVERSATION_ID)
        props = _props(result)
        assert props["app:contexts"] == []


# ---------------------------------------------------------------------------
# Reference builder
# ---------------------------------------------------------------------------


class TestBuildReferenceJsonLd:
    def test_structure(self):
        result = build_reference_jsonld("Styleguide", CONVERSATION_ID)

        assert result["@type"] == "CreativeWork"
        assert result["_schemaVersion"] == 2
        assert result["name"] == "Styleguide"
        assert result["description"] is None
        assert result["url"] is None
        assert result["encodingFormat"] is None

    def test_canonical_id_format(self):
        result = build_reference_jsonld("Test", CONVERSATION_ID)
        assert result["@id"].startswith("urn:app:reference:")
        uuid_part = result["@id"].split(":")[-1]
        assert UUID_RE.match(uuid_part)

    def test_bucket_is_reference(self):
        result = build_reference_jsonld("Test", CONVERSATION_ID)
        props = _props(result)
        assert props["app:bucket"] == "reference"

    def test_origin_is_captured(self):
        result = build_reference_jsonld("Test", CONVERSATION_ID)
        props = _props(result)
        assert props["app:origin"] == "captured"

    def test_with_description(self):
        result = build_reference_jsonld("Doc", CONVERSATION_ID, description="A useful doc")
        assert result["description"] == "A useful doc"

    def test_with_url(self):
        result = build_reference_jsonld("Link", CONVERSATION_ID, url="https://example.com")
        assert result["url"] == "https://example.com"

    def test_confidence_medium(self):
        """References from frontend use 'medium' confidence — replicate that."""
        result = build_reference_jsonld("Test", CONVERSATION_ID)
        props = _props(result)
        assert props["app:confidence"] == "medium"


# ---------------------------------------------------------------------------
# Cross-cutting concerns (all builders)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "builder,args",
    [
        (build_project_jsonld, ("P", "Outcome", CONVERSATION_ID)),
        (build_action_jsonld, ("A", "next", CONVERSATION_ID)),
        (build_reference_jsonld, ("R", CONVERSATION_ID)),
    ],
    ids=["project", "action", "reference"],
)
class TestAllBuilders:
    def test_schema_version_2(self, builder, args):
        result = builder(*args)
        assert result["_schemaVersion"] == 2

    def test_copilot_capture_source(self, builder, args):
        result = builder(*args)
        props = _props(result)
        assert props["app:captureSource"] == {
            "kind": "copilot",
            "conversationId": CONVERSATION_ID,
        }

    def test_needs_enrichment_false(self, builder, args):
        result = builder(*args)
        props = _props(result)
        assert props["app:needsEnrichment"] is False

    def test_provenance_history_has_created(self, builder, args):
        result = builder(*args)
        props = _props(result)
        history = props["app:provenanceHistory"]
        assert len(history) == 1
        assert history[0]["action"] == "created"
        assert "timestamp" in history[0]

    def test_empty_ports(self, builder, args):
        result = builder(*args)
        props = _props(result)
        assert props["app:ports"] == []

    def test_empty_typed_references(self, builder, args):
        result = builder(*args)
        props = _props(result)
        assert props["app:typedReferences"] == []

    def test_property_value_type(self, builder, args):
        """All additionalProperty entries must have @type: PropertyValue."""
        result = builder(*args)
        for prop in result["additionalProperty"]:
            assert prop["@type"] == "PropertyValue"
