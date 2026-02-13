"""JSON-LD builders for Tay tool execution.

Python equivalents of the frontend's item-serializer.ts builders.
These produce the same JSON-LD structures that the backend's POST /items expects.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

SCHEMA_VERSION = 2


def _pv(property_id: str, value: object) -> dict:
    """Build a schema.org PropertyValue entry."""
    return {"@type": "PropertyValue", "propertyID": property_id, "value": value}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _tay_capture_source(conversation_id: str) -> dict:
    return {"kind": "tay", "conversationId": conversation_id}


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


def build_project_jsonld(
    name: str,
    desired_outcome: str,
    conversation_id: str,
) -> dict:
    """Build JSON-LD for a Project item. Mirrors frontend buildNewProjectJsonLd."""
    canonical_id = f"urn:app:project:{uuid.uuid4()}"
    now = _now_iso()

    return {
        "@id": canonical_id,
        "@type": "Project",
        "_schemaVersion": SCHEMA_VERSION,
        "name": name,
        "description": None,
        "keywords": [],
        "dateCreated": now,
        "dateModified": now,
        "additionalProperty": [
            _pv("app:bucket", "project"),
            _pv("app:desiredOutcome", desired_outcome),
            _pv("app:projectStatus", "active"),
            _pv("app:isFocused", False),
            _pv("app:needsEnrichment", False),
            _pv("app:confidence", "high"),
            _pv("app:captureSource", _tay_capture_source(conversation_id)),
            _pv("app:ports", []),
            _pv("app:typedReferences", []),
            _pv("app:provenanceHistory", [{"timestamp": now, "action": "created"}]),
        ],
    }


# ---------------------------------------------------------------------------
# Action
# ---------------------------------------------------------------------------


def build_action_jsonld(
    name: str,
    bucket: str,
    conversation_id: str,
    project_id: str | None = None,
) -> dict:
    """Build JSON-LD for an Action item. Mirrors frontend buildNewActionJsonLd."""
    canonical_id = f"urn:app:action:{uuid.uuid4()}"
    now = _now_iso()

    return {
        "@id": canonical_id,
        "@type": "Action",
        "_schemaVersion": SCHEMA_VERSION,
        "description": None,
        "keywords": [],
        "dateCreated": now,
        "dateModified": now,
        "startTime": None,
        "endTime": None,
        "additionalProperty": [
            _pv("app:bucket", bucket),
            _pv("app:rawCapture", name),
            _pv("app:needsEnrichment", False),
            _pv("app:confidence", "high"),
            _pv("app:captureSource", _tay_capture_source(conversation_id)),
            _pv("app:contexts", []),
            _pv("app:isFocused", False),
            _pv("app:ports", []),
            _pv("app:typedReferences", []),
            _pv("app:provenanceHistory", [{"timestamp": now, "action": "created"}]),
            _pv("app:projectRefs", [project_id] if project_id else []),
        ],
    }


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------


def build_reference_jsonld(
    name: str,
    conversation_id: str,
    description: str | None = None,
    url: str | None = None,
) -> dict:
    """Build JSON-LD for a CreativeWork reference. Mirrors frontend buildNewReferenceJsonLd."""
    canonical_id = f"urn:app:reference:{uuid.uuid4()}"
    now = _now_iso()

    return {
        "@id": canonical_id,
        "@type": "CreativeWork",
        "_schemaVersion": SCHEMA_VERSION,
        "name": name,
        "description": description,
        "keywords": [],
        "dateCreated": now,
        "dateModified": now,
        "url": url,
        "encodingFormat": None,
        "additionalProperty": [
            _pv("app:bucket", "reference"),
            _pv("app:needsEnrichment", False),
            _pv("app:confidence", "medium"),
            _pv("app:captureSource", _tay_capture_source(conversation_id)),
            _pv("app:origin", "captured"),
            _pv("app:ports", []),
            _pv("app:typedReferences", []),
            _pv("app:provenanceHistory", [{"timestamp": now, "action": "created"}]),
        ],
    }


def build_file_reference_jsonld(
    name: str,
    file_id: str,
    conversation_id: str,
    project_id: str | None = None,
    description: str | None = None,
    encoding_format: str = "application/pdf",
) -> dict:
    """Build JSON-LD for a file-backed CreativeWork reference (e.g. rendered PDF)."""
    canonical_id = f"urn:app:reference:{uuid.uuid4()}"
    now = _now_iso()

    return {
        "@id": canonical_id,
        "@type": "CreativeWork",
        "_schemaVersion": SCHEMA_VERSION,
        "name": name,
        "description": description,
        "keywords": [],
        "dateCreated": now,
        "dateModified": now,
        "url": None,
        "encodingFormat": encoding_format,
        "additionalProperty": [
            _pv("app:bucket", "reference"),
            _pv("app:fileId", file_id),
            _pv("app:needsEnrichment", False),
            _pv("app:confidence", "high"),
            _pv("app:captureSource", _tay_capture_source(conversation_id)),
            _pv("app:origin", "generated"),
            _pv("app:ports", []),
            _pv("app:typedReferences", []),
            _pv("app:projectRefs", [project_id] if project_id else []),
            _pv("app:provenanceHistory", [{"timestamp": now, "action": "created"}]),
        ],
    }
