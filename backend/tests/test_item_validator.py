"""Unit tests for shared item validation behavior."""

from __future__ import annotations

import pytest

from app import validation
from app.validation.item_validator import validate_item_create

pytestmark = pytest.mark.unit


def test_validation_package_exports_item_validation_api():
    """Public app.validation API should expose legacy item validation symbols."""
    assert callable(validation.raise_if_invalid)
    assert callable(validation.validate_item_create)
    assert callable(validation.validate_item_update)


def test_validate_item_create_requires_type_before_shacl():
    """Missing @type must fail even when other fields look valid."""
    item = {
        "name": "Untyped item",
        "additionalProperty": [
            {"propertyID": "app:bucket", "value": "next"},
            {"propertyID": "app:rawCapture", "value": "Remember this"},
        ],
    }

    assert validate_item_create(item) == [
        {
            "source": "shacl",
            "code": "TYPE_REQUIRED",
            "field": "@type",
            "message": "@type is required.",
        }
    ]
