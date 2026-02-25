"""Unit tests for ReadAction support in Pydantic models."""

import pytest
from pydantic import ValidationError

from app.models import ACTION_SUBTYPES, ActionItemJsonLd, ItemPatchModel, _resolve_item_type
from app.routes.items import _is_action_type

pytestmark = pytest.mark.unit


class TestResolveItemType:
    def test_read_action_resolves_to_action(self):
        assert _resolve_item_type({"@type": "ReadAction"}) == "action"

    def test_action_resolves_to_action(self):
        assert _resolve_item_type({"@type": "Action"}) == "action"

    def test_email_message_resolves_to_action(self):
        assert _resolve_item_type({"@type": "EmailMessage"}) == "action"

    def test_digital_document_resolves_to_creative_work(self):
        assert _resolve_item_type({"@type": "DigitalDocument"}) == "creative_work"


class TestIsActionType:
    def test_read_action_is_action_type(self):
        assert _is_action_type("ReadAction") is True

    def test_action_is_action_type(self):
        assert _is_action_type("Action") is True

    def test_plan_action_is_action_type(self):
        assert _is_action_type("PlanAction") is True

    def test_creative_work_is_not_action_type(self):
        assert _is_action_type("CreativeWork") is False

    def test_digital_document_is_not_action_type(self):
        assert _is_action_type("DigitalDocument") is False


class TestActionSubtypeValidation:
    def test_all_subtypes_resolve_to_action(self):
        """All ACTION_SUBTYPES should resolve to 'action' discriminator."""
        for subtype in ACTION_SUBTYPES:
            result = _resolve_item_type({"@type": subtype})
            assert result == "action", f"{subtype} should resolve to 'action', got '{result}'"

    def test_invalid_subtype_rejected(self):
        """Invalid action subtypes should be rejected by Pydantic validation."""
        data = {
            "@id": "urn:app:test:invalid",
            "@type": "InvalidAction",
            "_schemaVersion": 2,
            "name": "Invalid action",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
        }
        with pytest.raises(ValidationError) as exc_info:
            ActionItemJsonLd.model_validate(data)
        # Verify the error is about the @type field
        assert "type" in str(exc_info.value).lower()

    def test_creative_work_not_action_type(self):
        """CreativeWork types should not resolve to 'action'."""
        assert _resolve_item_type({"@type": "CreativeWork"}) != "action"
        assert _resolve_item_type({"@type": "DigitalDocument"}) != "action"


class TestActionItemJsonLd:
    def test_accepts_read_action_type(self):
        data = {
            "@id": "urn:app:test:1",
            "@type": "ReadAction",
            "_schemaVersion": 2,
            "name": "Read report",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
            "object": {"@id": "urn:app:reference:doc1"},
        }
        item = ActionItemJsonLd.model_validate(data)
        assert item.type == "ReadAction"
        assert item.object_ref == {"@id": "urn:app:reference:doc1"}

    def test_action_without_object_ref(self):
        data = {
            "@id": "urn:app:test:2",
            "@type": "Action",
            "_schemaVersion": 2,
            "name": "Buy milk",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
        }
        item = ActionItemJsonLd.model_validate(data)
        assert item.type == "Action"
        assert item.object_ref is None

    def test_read_action_serializes_with_alias(self):
        data = {
            "@id": "urn:app:test:3",
            "@type": "ReadAction",
            "_schemaVersion": 2,
            "name": "Read doc",
            "additionalProperty": [],
            "object": {"@id": "urn:app:reference:x"},
        }
        item = ActionItemJsonLd.model_validate(data)
        dumped = item.model_dump(by_alias=True)
        assert dumped["object"] == {"@id": "urn:app:reference:x"}
        assert "object_ref" not in dumped


class TestActionRelationshipFields:
    def test_create_action_with_all_relationships(self):
        """Test creating an action with all 6 relationship fields set."""
        data = {
            "@id": "urn:app:test:relationships",
            "@type": "CreateAction",
            "_schemaVersion": 2,
            "name": "Create document",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
            "object": {"@id": "urn:app:reference:doc1"},
            "instrument": {"@id": "urn:app:reference:tool1"},
            "agent": {"@id": "urn:app:reference:user1"},
            "participant": {"@id": "urn:app:reference:user2"},
            "result": {"@id": "urn:app:reference:result1"},
            "location": {"@id": "urn:app:reference:office"},
        }
        item = ActionItemJsonLd.model_validate(data)
        assert item.type == "CreateAction"
        assert item.object_ref == {"@id": "urn:app:reference:doc1"}
        assert item.instrument == {"@id": "urn:app:reference:tool1"}
        assert item.agent == {"@id": "urn:app:reference:user1"}
        assert item.participant == {"@id": "urn:app:reference:user2"}
        assert item.result == {"@id": "urn:app:reference:result1"}
        assert item.location == {"@id": "urn:app:reference:office"}

    def test_relationship_fields_serialize_with_aliases(self):
        """Test that relationship fields serialize correctly with JSON-LD aliases."""
        data = {
            "@id": "urn:app:test:aliases",
            "@type": "UpdateAction",
            "_schemaVersion": 2,
            "name": "Update file",
            "additionalProperty": [],
            "object": {"@id": "urn:app:reference:file1"},
            "instrument": {"@id": "urn:app:reference:editor"},
            "agent": {"@id": "urn:app:reference:author"},
        }
        item = ActionItemJsonLd.model_validate(data)
        dumped = item.model_dump(by_alias=True)
        # Verify object uses alias "object" not "object_ref"
        assert dumped["object"] == {"@id": "urn:app:reference:file1"}
        assert "object_ref" not in dumped
        # Other relationship fields use their field names directly (no aliases)
        assert dumped["instrument"] == {"@id": "urn:app:reference:editor"}
        assert dumped["agent"] == {"@id": "urn:app:reference:author"}

    def test_relationship_fields_optional(self):
        """Test that relationship fields are optional and can be omitted."""
        data = {
            "@id": "urn:app:test:optional",
            "@type": "SearchAction",
            "_schemaVersion": 2,
            "name": "Search query",
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
        }
        item = ActionItemJsonLd.model_validate(data)
        assert item.type == "SearchAction"
        assert item.object_ref is None
        assert item.instrument is None
        assert item.agent is None
        assert item.participant is None
        assert item.result is None
        assert item.location is None


class TestItemPatchModel:
    def test_accepts_read_action_type(self):
        data = {
            "@type": "ReadAction",
            "object": {"@id": "urn:app:reference:doc1"},
            "additionalProperty": [
                {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
            ],
        }
        patch = ItemPatchModel.model_validate(data)
        assert patch.type == "ReadAction"
        assert patch.object_ref == {"@id": "urn:app:reference:doc1"}

    def test_patch_serializes_object_with_alias(self):
        data = {
            "@type": "ReadAction",
            "object": {"@id": "urn:app:reference:y"},
        }
        patch = ItemPatchModel.model_validate(data)
        dumped = patch.model_dump(by_alias=True, exclude_none=True)
        assert dumped["object"] == {"@id": "urn:app:reference:y"}
        assert "object_ref" not in dumped

    def test_patch_accepts_action_location_object(self):
        data = {
            "@type": "CreateAction",
            "location": {"@id": "urn:app:reference:office"},
        }
        patch = ItemPatchModel.model_validate(data)
        assert patch.location == {"@id": "urn:app:reference:office"}

    def test_patch_accepts_event_location_string(self):
        data = {
            "@type": "Event",
            "location": "Conference Room A",
        }
        patch = ItemPatchModel.model_validate(data)
        assert patch.location == "Conference Room A"
