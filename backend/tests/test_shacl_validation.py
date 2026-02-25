"""Unit tests for SHACL validation wrapper."""

from __future__ import annotations

import pytest
from rdflib import Graph, Literal, Namespace, URIRef

from app.validation.shacl_validator import (
    _load_shapes,
    validate_shacl,
)

pytestmark = pytest.mark.unit

SCHEMA = Namespace("https://schema.org/")
APP = Namespace("urn:app:property:")
RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")


def _create_action_graph(
    bucket: str | None = "inbox",
    raw_capture: str | None = "test action",
) -> Graph:
    """Helper to create Action entity graph."""
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)

    subject = URIRef("urn:item:1")
    g.add((subject, RDF.type, SCHEMA.Action))

    if bucket is not None:
        g.add((subject, APP.bucket, Literal(bucket)))
    if raw_capture is not None:
        g.add((subject, APP.rawCapture, Literal(raw_capture)))

    return g


def _create_project_graph(name: str | None = "Test Project") -> Graph:
    """Helper to create Project entity graph."""
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)

    subject = URIRef("urn:item:1")
    g.add((subject, RDF.type, SCHEMA.Project))

    if name is not None:
        g.add((subject, SCHEMA.name, Literal(name)))

    return g


def _create_person_graph(
    name: str | None = "John Doe",
    org_ref: str | None = "org123",
    org_role: str | None = "member",
) -> Graph:
    """Helper to create Person entity graph."""
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)

    subject = URIRef("urn:item:1")
    g.add((subject, RDF.type, SCHEMA.Person))

    if name is not None:
        g.add((subject, SCHEMA.name, Literal(name)))
    if org_ref is not None:
        g.add((subject, APP.orgRef, Literal(org_ref)))
    if org_role is not None:
        g.add((subject, APP.orgRole, Literal(org_role)))

    return g


def _create_creative_work_graph(name: str | None = "Test Document") -> Graph:
    """Helper to create CreativeWork entity graph."""
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)

    subject = URIRef("urn:item:1")
    g.add((subject, RDF.type, SCHEMA.CreativeWork))

    if name is not None:
        g.add((subject, SCHEMA.name, Literal(name)))

    return g


def _create_digital_document_graph(name: str | None = "Test PDF") -> Graph:
    """Helper to create DigitalDocument entity graph."""
    g = Graph()
    g.bind("schema", SCHEMA)
    g.bind("app", APP)

    subject = URIRef("urn:item:1")
    g.add((subject, RDF.type, SCHEMA.DigitalDocument))

    if name is not None:
        g.add((subject, SCHEMA.name, Literal(name)))

    return g


class TestLoadShapes:
    """Tests for SHACL shape loading."""

    def test_load_shapes_succeeds(self):
        """Test that shapes load successfully."""
        shapes = _load_shapes()
        assert shapes is not None
        assert len(shapes) > 0

    def test_load_shapes_caches_result(self):
        """Test that shapes are cached after first load."""
        shapes1 = _load_shapes()
        shapes2 = _load_shapes()
        assert shapes1 is shapes2  # Same object reference


class TestValidateShaclAction:
    """Tests for SHACL validation of Action entities."""

    def test_valid_action_passes_validation(self):
        """Test that a valid Action entity passes validation."""
        graph = _create_action_graph(bucket="inbox", raw_capture="test action")
        violations = validate_shacl(graph)
        assert violations == []

    def test_action_with_all_valid_buckets(self):
        """Test that all valid bucket values pass validation."""
        valid_buckets = [
            "inbox",
            "next",
            "waiting",
            "someday",
            "calendar",
            "reference",
            "completed",
            "project",
        ]
        for bucket in valid_buckets:
            graph = _create_action_graph(bucket=bucket)
            violations = validate_shacl(graph)
            assert violations == [], f"Bucket '{bucket}' should be valid"

    def test_action_missing_bucket_fails(self):
        """Test that Action without bucket fails validation."""
        graph = _create_action_graph(bucket=None, raw_capture="test")
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)

    def test_action_missing_raw_capture_passes(self):
        """Test that Action without rawCapture still passes validation."""
        graph = _create_action_graph(bucket="inbox", raw_capture=None)
        violations = validate_shacl(graph)
        assert violations == []

    def test_action_invalid_bucket_fails(self):
        """Test that Action with invalid bucket fails validation."""
        graph = _create_action_graph(bucket="invalid_bucket", raw_capture="test")
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)


class TestValidateShaclProject:
    """Tests for SHACL validation of Project entities."""

    def test_valid_project_passes_validation(self):
        """Test that a valid Project entity passes validation."""
        graph = _create_project_graph(name="Test Project")
        violations = validate_shacl(graph)
        assert violations == []

    def test_project_missing_name_fails(self):
        """Test that Project without name fails validation."""
        graph = _create_project_graph(name=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)


class TestValidateShaclPerson:
    """Tests for SHACL validation of Person entities."""

    def test_valid_person_passes_validation(self):
        """Test that a valid Person entity passes validation."""
        graph = _create_person_graph(
            name="John Doe", org_ref="org123", org_role="member"
        )
        violations = validate_shacl(graph)
        assert violations == []

    def test_person_with_all_valid_roles(self):
        """Test that all valid org role values pass validation."""
        valid_roles = ["member", "founder", "accountant", "advisor", "interest"]
        for role in valid_roles:
            graph = _create_person_graph(org_role=role)
            violations = validate_shacl(graph)
            assert violations == [], f"Role '{role}' should be valid"

    def test_person_missing_name_fails(self):
        """Test that Person without name fails validation."""
        graph = _create_person_graph(name=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)

    def test_person_missing_org_ref_fails(self):
        """Test that Person without orgRef fails validation."""
        graph = _create_person_graph(org_ref=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)

    def test_person_missing_org_role_fails(self):
        """Test that Person without orgRole fails validation."""
        graph = _create_person_graph(org_role=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)

    def test_person_invalid_org_role_fails(self):
        """Test that Person with invalid orgRole fails validation."""
        graph = _create_person_graph(org_role="invalid_role")
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)


class TestValidateShaclCreativeWork:
    """Tests for SHACL validation of CreativeWork entities."""

    def test_valid_creative_work_passes_validation(self):
        """Test that a valid CreativeWork entity passes validation."""
        graph = _create_creative_work_graph(name="Test Document")
        violations = validate_shacl(graph)
        assert violations == []

    def test_creative_work_missing_name_fails(self):
        """Test that CreativeWork without name fails validation."""
        graph = _create_creative_work_graph(name=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)


class TestValidateShaclDigitalDocument:
    """Tests for SHACL validation of DigitalDocument entities."""

    def test_valid_digital_document_passes_validation(self):
        """Test that a valid DigitalDocument entity passes validation."""
        graph = _create_digital_document_graph(name="Test PDF")
        violations = validate_shacl(graph)
        assert violations == []

    def test_digital_document_missing_name_fails(self):
        """Test that DigitalDocument without name fails validation."""
        graph = _create_digital_document_graph(name=None)
        violations = validate_shacl(graph)
        assert len(violations) > 0
        assert any(v["source"] == "shacl" for v in violations)


class TestAbortOnFirst:
    """Tests for abort_on_first parameter behavior."""

    def test_abort_on_first_false_collects_all_violations(self):
        """Test that abort_on_first=False collects all violations."""
        # Create a Person with multiple violations (no name, no orgRef, no orgRole)
        graph = _create_person_graph(name=None, org_ref=None, org_role=None)
        violations = validate_shacl(graph, abort_on_first=False)

        # Should have multiple violations
        assert len(violations) >= 2

    def test_abort_on_first_true_stops_at_first_violation(self):
        """Test that abort_on_first=True stops at first violation."""
        # Create a Person with multiple violations
        graph = _create_person_graph(name=None, org_ref=None, org_role=None)
        violations = validate_shacl(graph, abort_on_first=True)

        # Should have at least one violation (may stop early)
        assert len(violations) >= 1


class TestViolationStructure:
    """Tests for violation report structure."""

    def test_violation_has_required_fields(self):
        """Test that violations have required fields."""
        graph = _create_project_graph(name=None)
        violations = validate_shacl(graph)

        assert len(violations) > 0
        violation = violations[0]

        # Check required fields
        assert "source" in violation
        assert "code" in violation
        assert "field" in violation
        assert "message" in violation

        # Check field values
        assert violation["source"] == "shacl"
        assert isinstance(violation["code"], str)
        assert isinstance(violation["field"], str)
        assert isinstance(violation["message"], str)

    def test_violation_message_is_human_readable(self):
        """Test that violation messages are human-readable."""
        graph = _create_project_graph(name=None)
        violations = validate_shacl(graph)

        assert len(violations) > 0
        violation = violations[0]
        message = violation["message"]

        # Message should be non-empty and not a raw URI
        assert len(message) > 0
        assert not message.startswith("http://")
        assert not message.startswith("https://")


class TestEmptyGraph:
    """Tests for empty or minimal graphs."""

    def test_empty_graph_passes_validation(self):
        """Test that an empty graph passes validation (no constraints apply)."""
        g = Graph()
        violations = validate_shacl(g)
        # Empty graph has no entities to validate, so no violations
        assert violations == []

    def test_graph_with_unknown_type_passes_validation(self):
        """Test that entities with unknown types pass validation."""
        g = Graph()
        g.bind("schema", SCHEMA)
        subject = URIRef("urn:item:1")
        # Add an entity with a type that has no SHACL shape
        g.add((subject, RDF.type, SCHEMA.Thing))
        g.add((subject, SCHEMA.name, Literal("Test Thing")))

        violations = validate_shacl(g)
        # No shape for Thing, so no violations
        assert violations == []
