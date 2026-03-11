"""Tests for JSON-LD builders used in OpenClaw tool execution."""

from __future__ import annotations

import re

import pytest

from app.chat.jsonld_builders import (
    SCHEMA_VERSION,
    _copilot_capture_source,
    _pv,
    build_action_jsonld,
    build_project_jsonld,
    build_reference_jsonld,
)

pytestmark = pytest.mark.unit

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CONV_ID = "conv-abc-123"


def _get_prop(jsonld: dict, property_id: str) -> object:
    """Extract value from additionalProperty by propertyID."""
    for prop in jsonld["additionalProperty"]:
        if prop["propertyID"] == property_id:
            return prop["value"]
    raise KeyError(f"Property {property_id!r} not found")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_pv_returns_property_value_structure(self):
        result = _pv("app:bucket", "inbox")
        assert result == {
            "@type": "PropertyValue",
            "propertyID": "app:bucket",
            "value": "inbox",
        }

    def test_copilot_capture_source_structure(self):
        result = _copilot_capture_source("conv-42")
        assert result == {"kind": "copilot", "conversationId": "conv-42"}


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


class TestBuildProjectJsonld:
    def test_canonical_id_format(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["@id"].startswith("urn:app:project:")
        uuid_part = result["@id"].split("urn:app:project:")[1]
        assert UUID_RE.match(uuid_part)

    def test_type_is_project(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["@type"] == "Project"

    def test_schema_version(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["_schemaVersion"] == SCHEMA_VERSION
        assert result["_schemaVersion"] == 2

    def test_name_set(self):
        result = build_project_jsonld("My Project", "Outcome", CONV_ID)
        assert result["name"] == "My Project"

    def test_description_is_none(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["description"] is None

    def test_desired_outcome_in_properties(self):
        result = build_project_jsonld("P", "Ship v2", CONV_ID)
        assert _get_prop(result, "app:desiredOutcome") == "Ship v2"

    def test_bucket_is_project(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert _get_prop(result, "app:bucket") == "project"

    def test_project_status_is_active(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert _get_prop(result, "app:projectStatus") == "active"

    def test_capture_source_includes_conversation_id(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        source = _get_prop(result, "app:captureSource")
        assert source == {"kind": "copilot", "conversationId": CONV_ID}

    def test_dates_are_iso_utc(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["dateCreated"].endswith("+00:00")
        assert result["dateModified"] == result["dateCreated"]

    def test_provenance_history_has_created_entry(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        history = _get_prop(result, "app:provenanceHistory")
        assert isinstance(history, list)
        assert len(history) == 1
        assert history[0]["action"] == "created"
        assert "timestamp" in history[0]

    def test_empty_collection_defaults(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert result["keywords"] == []
        assert _get_prop(result, "app:ports") == []
        assert _get_prop(result, "app:typedReferences") == []

    def test_is_focused_defaults_false(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert _get_prop(result, "app:isFocused") is False

    def test_confidence_is_high(self):
        result = build_project_jsonld("P", "Outcome", CONV_ID)
        assert _get_prop(result, "app:confidence") == "high"


# ---------------------------------------------------------------------------
# Action
# ---------------------------------------------------------------------------


class TestBuildActionJsonld:
    def test_canonical_id_format(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert result["@id"].startswith("urn:app:action:")
        uuid_part = result["@id"].split("urn:app:action:")[1]
        assert UUID_RE.match(uuid_part)

    def test_type_is_action(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert result["@type"] == "Action"

    def test_schema_version(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert result["_schemaVersion"] == SCHEMA_VERSION

    def test_raw_capture_is_name(self):
        result = build_action_jsonld("Buy groceries", "inbox", CONV_ID)
        assert _get_prop(result, "app:rawCapture") == "Buy groceries"

    def test_bucket_from_argument(self):
        result = build_action_jsonld("A", "someday", CONV_ID)
        assert _get_prop(result, "app:bucket") == "someday"

    def test_project_refs_with_project_id(self):
        result = build_action_jsonld("A", "next", CONV_ID, project_id="urn:app:project:abc")
        assert _get_prop(result, "app:projectRefs") == ["urn:app:project:abc"]

    def test_project_refs_empty_without_project_id(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert _get_prop(result, "app:projectRefs") == []

    def test_project_refs_empty_with_none(self):
        result = build_action_jsonld("A", "next", CONV_ID, project_id=None)
        assert _get_prop(result, "app:projectRefs") == []

    def test_start_and_end_time_are_none(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert result["startTime"] is None
        assert result["endTime"] is None

    def test_description_is_none(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert result["description"] is None

    def test_capture_source_includes_conversation_id(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        source = _get_prop(result, "app:captureSource")
        assert source == {"kind": "copilot", "conversationId": CONV_ID}

    def test_contexts_is_empty(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert _get_prop(result, "app:contexts") == []

    def test_confidence_is_high(self):
        result = build_action_jsonld("A", "next", CONV_ID)
        assert _get_prop(result, "app:confidence") == "high"


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------


class TestBuildReferenceJsonld:
    def test_canonical_id_format(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["@id"].startswith("urn:app:reference:")
        uuid_part = result["@id"].split("urn:app:reference:")[1]
        assert UUID_RE.match(uuid_part)

    def test_type_is_creative_work(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["@type"] == "CreativeWork"

    def test_schema_version(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["_schemaVersion"] == SCHEMA_VERSION

    def test_name_set(self):
        result = build_reference_jsonld("My Reference", CONV_ID)
        assert result["name"] == "My Reference"

    def test_bucket_is_reference(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert _get_prop(result, "app:bucket") == "reference"

    def test_description_set_when_provided(self):
        result = build_reference_jsonld("R", CONV_ID, description="Notes about it")
        assert result["description"] == "Notes about it"

    def test_description_none_when_not_provided(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["description"] is None

    def test_url_set_when_provided(self):
        result = build_reference_jsonld("R", CONV_ID, url="https://example.com")
        assert result["url"] == "https://example.com"

    def test_url_none_when_not_provided(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["url"] is None

    def test_encoding_format_is_none(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert result["encodingFormat"] is None

    def test_confidence_is_medium(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert _get_prop(result, "app:confidence") == "medium"

    def test_origin_is_captured(self):
        result = build_reference_jsonld("R", CONV_ID)
        assert _get_prop(result, "app:origin") == "captured"

    def test_capture_source_includes_conversation_id(self):
        result = build_reference_jsonld("R", CONV_ID)
        source = _get_prop(result, "app:captureSource")
        assert source == {"kind": "copilot", "conversationId": CONV_ID}
