"""Shared item validation for CLI/backend parity."""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from rdflib import Graph, Literal, Namespace, URIRef

logger = logging.getLogger(__name__)

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

# RDF Namespaces
SCHEMA = Namespace("https://schema.org/")
APP = Namespace("urn:app:property:")
XSD = Namespace("http://www.w3.org/2001/XMLSchema#")


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


def _item_to_rdf_graph(item: dict) -> Graph:
    """Convert item dict to RDF graph for SHACL validation.

    Args:
        item: Item dictionary with @type, name, additionalProperty, etc.

    Returns:
        RDF Graph representing the item
    """
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)
    g.bind("xsd", XSD)

    # Create a subject node for the item
    subject = URIRef("urn:item:1")

    # Add @type as rdf:type
    item_type = _normalize_type(item.get("@type"))
    if item_type:
        # Map to schema.org class
        if item_type == "Action" or item_type.endswith(":Action"):
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.Action))
        elif item_type == "ReadAction":
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.Action))
        elif item_type == "Project":
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.Project))
        elif item_type == "Person":
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.Person))
        elif item_type == "CreativeWork":
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.CreativeWork))
        elif item_type == "DigitalDocument":
            g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), SCHEMA.DigitalDocument))

    # Add schema:name if present
    name = item.get("name")
    if name and isinstance(name, str) and name.strip():
        g.add((subject, SCHEMA.name, Literal(name.strip(), datatype=XSD.string)))

    # Add additionalProperty values as direct properties
    props = item.get("additionalProperty")
    if isinstance(props, list):
        for entry in props:
            if isinstance(entry, dict):
                prop_id = entry.get("propertyID")
                value = entry.get("value")

                if prop_id == "app:bucket" and isinstance(value, str):
                    g.add((subject, APP.bucket, Literal(value, datatype=XSD.string)))
                elif prop_id == "app:rawCapture" and isinstance(value, str):
                    g.add((subject, APP.rawCapture, Literal(value, datatype=XSD.string)))
                elif prop_id == "app:orgRef" and value is not None:
                    g.add((subject, APP.orgRef, Literal(str(value), datatype=XSD.string)))
                elif prop_id == "app:orgRole" and isinstance(value, str):
                    g.add((subject, APP.orgRole, Literal(value, datatype=XSD.string)))

    return g


def validate_item_create(item: dict) -> list[dict[str, object]]:
    """Validate item creation using SHACL shapes and CEL rules.

    SHACL validation is now performed using pyshacl library.
    CEL rules remain hardcoded (to be replaced in phase 4).

    Args:
        item: Item dictionary to validate

    Returns:
        List of validation issues (empty if valid)
    """
    issues: list[dict[str, object]] = []
    bucket = _bucket(item)

    # SHACL validation using pyshacl
    try:
        from app.validation.shacl_validator import validate_shacl

        data_graph = _item_to_rdf_graph(item)
        shacl_violations = validate_shacl(data_graph, abort_on_first=False)

        # Map SHACL violations to expected format with custom codes
        for violation in shacl_violations:
            field = violation.get("field", "item")
            code = violation.get("code", "VALIDATION_ERROR")

            # Map generic SHACL field names to our field format
            if field == "bucket":
                field = "additionalProperty.app:bucket"
            elif field == "name":
                field = "name"
            elif field == "orgRef":
                field = "additionalProperty.app:orgRef"
            elif field == "orgRole":
                field = "additionalProperty.app:orgRole"
            elif field == "rawCapture":
                field = "additionalProperty.app:rawCapture"

            # Generate domain-specific error codes based on field and type
            item_type = _normalize_type(item.get("@type"))
            if "name" in field and item_type == "Project":
                code = "PROJECT_NAME_REQUIRED"
            elif "name" in field and item_type in {"CreativeWork", "DigitalDocument"}:
                code = "REFERENCE_NAME_REQUIRED"
            elif "name" in field and item_type == "Person":
                code = "PERSON_NAME_REQUIRED"
            elif "bucket" in field:
                code = "ACTION_BUCKET_INVALID"
            elif "orgRef" in field:
                code = "PERSON_ORGREF_REQUIRED"
            elif "orgRole" in field:
                code = "PERSON_ORGROLE_INVALID"
            elif "@type" in field or field == "item":
                code = "TYPE_REQUIRED"

            issues.append({
                "source": "shacl",
                "code": code,
                "field": field,
                "message": violation.get("message", "Validation constraint violated"),
            })
    except ImportError:
        # Fallback to hardcoded validation if pyshacl not available
        logger.warning("pyshacl not available, using hardcoded validation")
        item_type = _normalize_type(item.get("@type"))

        if not item_type:
            issues.append({
                "source": "shacl",
                "code": "TYPE_REQUIRED",
                "field": "@type",
                "message": "@type is required.",
            })
            return issues

        if item_type in {"Action", "ReadAction"} or item_type.endswith(":Action"):
            if bucket not in ACTION_BUCKETS:
                issues.append({
                    "source": "shacl",
                    "code": "ACTION_BUCKET_INVALID",
                    "field": "additionalProperty.app:bucket",
                    "message": (
                        "Action bucket must be one of "
                        "inbox,next,waiting,someday,calendar,reference,completed"
                    ),
                })

        if item_type == "Project" and not _as_text(item.get("name")):
            issues.append({
                "source": "shacl",
                "code": "PROJECT_NAME_REQUIRED",
                "field": "name",
                "message": "Project items require a non-empty name.",
            })

        if item_type in {"CreativeWork", "DigitalDocument"} and not _as_text(item.get("name")):
            issues.append({
                "source": "shacl",
                "code": "REFERENCE_NAME_REQUIRED",
                "field": "name",
                "message": "Reference items require a non-empty name.",
            })

        if item_type == "Person":
            if not _as_text(item.get("name")):
                issues.append({
                    "source": "shacl",
                    "code": "PERSON_NAME_REQUIRED",
                    "field": "name",
                    "message": "Person items require a non-empty name.",
                })
            if _get_additional_property(item, "app:orgRef") is None:
                issues.append({
                    "source": "shacl",
                    "code": "PERSON_ORGREF_REQUIRED",
                    "field": "additionalProperty.app:orgRef",
                    "message": "Person items require app:orgRef.",
                })
            role = _as_text(_get_additional_property(item, "app:orgRole"))
            if role not in PERSON_ROLES:
                issues.append({
                    "source": "shacl",
                    "code": "PERSON_ORGROLE_INVALID",
                    "field": "additionalProperty.app:orgRole",
                    "message": (
                        "Person app:orgRole must be one of "
                        "member,founder,accountant,advisor,interest."
                    ),
                })

    # CEL rules using cel-python
    try:
        from app.validation.cel_evaluator import evaluate_rules

        cel_context = {
            "operation": "create",
            "bucket": bucket,
        }
        cel_violations = evaluate_rules(cel_context)
        issues.extend(cel_violations)
    except ImportError:
        # Fallback to hardcoded CEL if cel-python not available
        logger.warning("cel-python not available, using hardcoded CEL validation")
        if bucket and bucket not in ACTION_BUCKETS:
            issues.append({
                "source": "cel",
                "code": "BUCKET_ENUM",
                "field": "additionalProperty.app:bucket",
                "rule": "item.bucket.enum",
                "message": (
                    "Bucket must be one of "
                    "inbox,next,waiting,someday,calendar,reference,project,completed."
                ),
            })

    return issues


def validate_item_update(existing_item: dict, next_item: dict) -> list[dict[str, object]]:
    issues = validate_item_create(next_item)
    source_bucket = _bucket(existing_item)
    target_bucket = _bucket(next_item)

    # CEL rules using cel-python
    try:
        from app.validation.cel_evaluator import evaluate_rules

        # Determine operation type (triage if bucket changed, otherwise update)
        operation = "triage" if source_bucket != target_bucket else "update"

        cel_context = {
            "operation": operation,
            "source": {"bucket": source_bucket},
            "target": {"bucket": target_bucket},
            "bucket": target_bucket,
        }
        cel_violations = evaluate_rules(cel_context)
        issues.extend(cel_violations)
    except ImportError:
        # Fallback to hardcoded CEL if cel-python not available
        logger.warning("cel-python not available, using hardcoded CEL validation")
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
