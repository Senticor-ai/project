import pytest

from app.validation import validate_item_create

pytestmark = pytest.mark.unit


def _action_item(item_type: str, bucket: str | None = None) -> dict:
    additional_property: list[dict[str, str]] = []
    if bucket is not None:
        additional_property.append(
            {
                "@type": "PropertyValue",
                "propertyID": "app:bucket",
                "value": bucket,
            }
        )
    return {
        "@type": item_type,
        "name": "Action subtype test",
        "additionalProperty": additional_property,
    }


def _has_code(issues: list[dict[str, object]], code: str) -> bool:
    return any(issue.get("code") == code for issue in issues)


def test_create_action_requires_bucket():
    issues = validate_item_create(_action_item("CreateAction"))
    assert _has_code(issues, "ACTION_BUCKET_INVALID")


def test_update_action_requires_bucket():
    issues = validate_item_create(_action_item("UpdateAction"))
    assert _has_code(issues, "ACTION_BUCKET_INVALID")


def test_create_action_with_valid_bucket_passes():
    issues = validate_item_create(_action_item("CreateAction", bucket="next"))
    assert not _has_code(issues, "ACTION_BUCKET_INVALID")
