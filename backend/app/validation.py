"""Shared item validation for CLI/backend parity."""

from __future__ import annotations

from fastapi import HTTPException, status

ACTION_BUCKETS = {
    "inbox",
    "next",
    "waiting",
    "someday",
    "calendar",
    "reference",
    "completed",
    "project",
}

INBOX_TRIAGE_TARGETS = {"next", "waiting", "someday", "calendar", "reference"}
PERSON_ROLES = {"member", "founder", "accountant", "advisor", "interest"}


def _normalize_type(raw: object) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list) and raw and isinstance(raw[0], str):
        return raw[0]
    return ""


def _as_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _get_additional_property(item: dict, property_id: str):
    props = item.get("additionalProperty")
    if not isinstance(props, list):
        return None
    for entry in props:
        if isinstance(entry, dict) and entry.get("propertyID") == property_id:
            return entry.get("value")
    return None


def _bucket(item: dict) -> str:
    value = _get_additional_property(item, "app:bucket")
    return value.strip() if isinstance(value, str) else ""


def validate_item_create(item: dict) -> list[dict[str, object]]:
    issues: list[dict[str, object]] = []
    item_type = _normalize_type(item.get("@type"))
    bucket = _bucket(item)

    if not item_type:
        issues.append(
            {
                "source": "shacl",
                "code": "TYPE_REQUIRED",
                "field": "@type",
                "message": "@type is required.",
            }
        )
        return issues

    if item_type in {"Action", "ReadAction"} or item_type.endswith(":Action"):
        if bucket not in ACTION_BUCKETS:
            issues.append(
                {
                    "source": "shacl",
                    "code": "ACTION_BUCKET_INVALID",
                    "field": "additionalProperty.app:bucket",
                    "message": (
                        "Action bucket must be one of "
                        "inbox,next,waiting,someday,calendar,reference,completed"
                    ),
                }
            )
    if item_type == "Project" and not _as_text(item.get("name")):
        issues.append(
            {
                "source": "shacl",
                "code": "PROJECT_NAME_REQUIRED",
                "field": "name",
                "message": "Project items require a non-empty name.",
            }
        )

    if item_type in {"CreativeWork", "DigitalDocument"} and not _as_text(item.get("name")):
        issues.append(
            {
                "source": "shacl",
                "code": "REFERENCE_NAME_REQUIRED",
                "field": "name",
                "message": "Reference items require a non-empty name.",
            }
        )

    if item_type == "Person":
        if not _as_text(item.get("name")):
            issues.append(
                {
                    "source": "shacl",
                    "code": "PERSON_NAME_REQUIRED",
                    "field": "name",
                    "message": "Person items require a non-empty name.",
                }
            )
        if _get_additional_property(item, "app:orgRef") is None:
            issues.append(
                {
                    "source": "shacl",
                    "code": "PERSON_ORGREF_REQUIRED",
                    "field": "additionalProperty.app:orgRef",
                    "message": "Person items require app:orgRef.",
                }
            )
        role = _as_text(_get_additional_property(item, "app:orgRole"))
        if role not in PERSON_ROLES:
            issues.append(
                {
                    "source": "shacl",
                    "code": "PERSON_ORGROLE_INVALID",
                    "field": "additionalProperty.app:orgRole",
                    "message": (
                        "Person app:orgRole must be one of "
                        "member,founder,accountant,advisor,interest."
                    ),
                }
            )

    if bucket and bucket not in ACTION_BUCKETS:
        issues.append(
            {
                "source": "cel",
                "code": "BUCKET_ENUM",
                "field": "additionalProperty.app:bucket",
                "rule": "item.bucket.enum",
                "message": (
                    "Bucket must be one of "
                    "inbox,next,waiting,someday,calendar,reference,project,completed."
                ),
            }
        )

    return issues


def validate_item_update(existing_item: dict, next_item: dict) -> list[dict[str, object]]:
    issues = validate_item_create(next_item)
    source_bucket = _bucket(existing_item)
    target_bucket = _bucket(next_item)

    if source_bucket == "completed":
        issues.append(
            {
                "source": "cel",
                "code": "COMPLETED_IMMUTABLE",
                "field": "item",
                "rule": "item.completed.immutable",
                "message": "Completed items are immutable.",
            }
        )

    if (
        source_bucket == "inbox"
        and target_bucket
        and target_bucket != source_bucket
        and target_bucket not in INBOX_TRIAGE_TARGETS
    ):
        issues.append(
            {
                "source": "cel",
                "code": "TRIAGE_INBOX_TARGET_INVALID",
                "field": "additionalProperty.app:bucket",
                "rule": "triage.inbox.targets",
                "message": "Inbox items can only move to next,waiting,someday,calendar,reference.",
            }
        )

    return issues


def raise_if_invalid(
    issues: list[dict[str, object]],
    default_message: str = "Validation failed",
) -> None:
    if not issues:
        return

    message = str(issues[0].get("message") or default_message)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "message": message,
            "issues": issues,
        },
    )
