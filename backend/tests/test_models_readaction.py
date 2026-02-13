"""Unit tests for ReadAction support in Pydantic models."""

import pytest

from app.models import ActionItemJsonLd, ItemPatchModel, _resolve_item_type
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
