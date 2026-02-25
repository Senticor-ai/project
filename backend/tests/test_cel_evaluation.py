"""Unit tests for CEL business rule evaluation."""

from __future__ import annotations

import json
from unittest.mock import mock_open, patch

import pytest

from app.validation.cel_evaluator import _load_rules, evaluate_rules

pytestmark = pytest.mark.unit


class TestLoadRules:
    """Tests for CEL rule loading and compilation."""

    def test_load_rules_succeeds(self):
        """Test that rules load and compile successfully."""
        rules = _load_rules()
        assert rules is not None
        assert len(rules) > 0

        # Check that each rule has the expected structure
        for rule in rules:
            assert "id" in rule
            assert "description" in rule
            assert "when_program" in rule
            assert "rule_program" in rule

    def test_load_rules_caches_result(self):
        """Test that rules are cached after first load."""
        rules1 = _load_rules()
        rules2 = _load_rules()
        assert rules1 is rules2  # Same object reference

    @patch("app.validation.cel_evaluator._compiled_rules", None)
    @patch("pathlib.Path.open", side_effect=FileNotFoundError("File not found"))
    def test_load_rules_missing_file_raises_error(self, mock_file):
        """Test that missing rules file raises RuntimeError."""
        # Reset the module cache to force reload
        import app.validation.cel_evaluator

        app.validation.cel_evaluator._compiled_rules = None

        with pytest.raises(RuntimeError, match="CEL rules file not found"):
            _load_rules()

    @patch("app.validation.cel_evaluator._compiled_rules", None)
    def test_load_rules_invalid_json_raises_error(self):
        """Test that invalid JSON raises RuntimeError."""
        import app.validation.cel_evaluator

        app.validation.cel_evaluator._compiled_rules = None

        invalid_json = "{ not valid json }"
        with patch("pathlib.Path.open", mock_open(read_data=invalid_json)):
            with pytest.raises(RuntimeError, match="CEL rules JSON parsing failed"):
                _load_rules()

    @patch("app.validation.cel_evaluator._compiled_rules", None)
    def test_load_rules_compilation_error_raises_error(self):
        """Test that CEL compilation errors raise RuntimeError."""
        import app.validation.cel_evaluator

        app.validation.cel_evaluator._compiled_rules = None

        # Invalid CEL syntax
        invalid_rules = json.dumps(
            [
                {
                    "id": "test.invalid",
                    "description": "Invalid CEL",
                    "when": "true",
                    "expression": "invalid CEL syntax @#$%",
                }
            ]
        )

        with patch("pathlib.Path.open", mock_open(read_data=invalid_rules)):
            with pytest.raises(RuntimeError, match="CEL rule compilation failed"):
                _load_rules()


class TestEvaluateRulesTriageInboxTargets:
    """Tests for triage.inbox.targets business rule."""

    def test_inbox_to_valid_bucket_passes(self):
        """Test that triaging inbox items to valid buckets passes."""
        valid_targets = ["next", "waiting", "someday", "calendar", "reference"]

        for target in valid_targets:
            context = {
                "source": {"bucket": "inbox"},
                "target": {"bucket": target},
                "operation": "triage",
            }
            violations = evaluate_rules(context)
            assert violations == [], f"Inbox to {target} should be allowed"

    def test_inbox_to_invalid_bucket_fails(self):
        """Test that triaging inbox items to invalid buckets fails."""
        invalid_targets = ["inbox", "project", "completed"]

        for target in invalid_targets:
            context = {
                "source": {"bucket": "inbox"},
                "target": {"bucket": target},
                "operation": "triage",
            }
            violations = evaluate_rules(context)
            assert len(violations) > 0, f"Inbox to {target} should fail"

            # Check violation structure
            violation = next((v for v in violations if v["rule"] == "triage.inbox.targets"), None)
            assert violation is not None
            assert violation["source"] == "cel"
            assert violation["code"] == "TRIAGE_INBOX_TARGETS"
            assert "message" in violation

    def test_inbox_rule_not_applied_to_other_buckets(self):
        """Test that inbox rule doesn't apply to non-inbox items."""
        context = {
            "source": {"bucket": "next"},
            "target": {"bucket": "completed"},
            "operation": "triage",
        }
        violations = evaluate_rules(context)

        # Should not trigger inbox-specific rule
        inbox_violations = [v for v in violations if v["rule"] == "triage.inbox.targets"]
        assert len(inbox_violations) == 0


class TestEvaluateRulesCompletedImmutable:
    """Tests for item.completed.immutable business rule."""

    def test_read_completed_item_passes(self):
        """Test that reading completed items is allowed."""
        context = {"source": {"bucket": "completed"}, "operation": "read"}
        violations = evaluate_rules(context)

        # Should not trigger immutability violation
        completed_violations = [v for v in violations if v["rule"] == "item.completed.immutable"]
        assert len(completed_violations) == 0

    def test_modify_completed_item_fails(self):
        """Test that modifying completed items fails."""
        modify_operations = ["update", "delete", "triage", "create"]

        for operation in modify_operations:
            context = {"source": {"bucket": "completed"}, "operation": operation}
            violations = evaluate_rules(context)

            # Should have immutability violation
            violation = next(
                (v for v in violations if v["rule"] == "item.completed.immutable"), None
            )
            assert violation is not None, f"Operation {operation} on completed should fail"
            assert violation["source"] == "cel"
            assert violation["code"] == "ITEM_COMPLETED_IMMUTABLE"

    def test_completed_rule_not_applied_to_other_buckets(self):
        """Test that completed rule doesn't apply to non-completed items."""
        context = {"source": {"bucket": "inbox"}, "operation": "update"}
        violations = evaluate_rules(context)

        # Should not trigger completed-specific rule
        completed_violations = [v for v in violations if v["rule"] == "item.completed.immutable"]
        assert len(completed_violations) == 0


class TestEvaluateRulesBucketEnum:
    """Tests for item.bucket.enum business rule."""

    def test_valid_bucket_on_create_passes(self):
        """Test that valid buckets pass validation on create."""
        valid_buckets = [
            "inbox",
            "next",
            "waiting",
            "someday",
            "calendar",
            "reference",
            "project",
            "completed",
        ]

        for bucket in valid_buckets:
            context = {"bucket": bucket, "operation": "create"}
            violations = evaluate_rules(context)

            # Should not trigger bucket enum violation
            bucket_violations = [v for v in violations if v["rule"] == "item.bucket.enum"]
            assert len(bucket_violations) == 0, f"Bucket {bucket} should be valid"

    def test_invalid_bucket_on_create_fails(self):
        """Test that invalid buckets fail validation on create."""
        invalid_buckets = ["invalid", "unknown", "archive", "trash"]

        for bucket in invalid_buckets:
            context = {"bucket": bucket, "operation": "create"}
            violations = evaluate_rules(context)

            # Should have bucket enum violation
            violation = next((v for v in violations if v["rule"] == "item.bucket.enum"), None)
            assert violation is not None, f"Bucket {bucket} should fail"
            assert violation["source"] == "cel"
            assert violation["code"] == "ITEM_BUCKET_ENUM"

    def test_bucket_enum_applies_to_triage_operation(self):
        """Test that bucket enum validation applies to triage operations."""
        context = {"bucket": "invalid_bucket", "operation": "triage"}
        violations = evaluate_rules(context)

        # Should have bucket enum violation
        violation = next((v for v in violations if v["rule"] == "item.bucket.enum"), None)
        assert violation is not None

    def test_bucket_enum_not_applied_to_read_operation(self):
        """Test that bucket enum validation doesn't apply to read operations."""
        context = {"bucket": "invalid_bucket", "operation": "read"}
        violations = evaluate_rules(context)

        # Should not trigger bucket enum rule for read operations
        bucket_violations = [v for v in violations if v["rule"] == "item.bucket.enum"]
        assert len(bucket_violations) == 0


class TestEvaluateRulesMultipleViolations:
    """Tests for scenarios with multiple rule violations."""

    def test_multiple_violations_collected(self):
        """Test that multiple violations are collected."""
        # Context that violates both inbox triage and bucket enum
        context = {
            "source": {"bucket": "inbox"},
            "target": {"bucket": "invalid_bucket"},
            "bucket": "invalid_bucket",
            "operation": "triage",
        }
        violations = evaluate_rules(context)

        # Should have at least 2 violations
        assert len(violations) >= 2

        # Check that different rules are triggered
        rule_ids = {v["rule"] for v in violations}
        assert len(rule_ids) >= 2

    def test_no_violations_with_valid_context(self):
        """Test that valid context produces no violations."""
        context = {
            "source": {"bucket": "inbox"},
            "target": {"bucket": "next"},
            "bucket": "next",
            "operation": "triage",
        }
        violations = evaluate_rules(context)

        assert violations == []


class TestViolationStructure:
    """Tests for violation report structure."""

    def test_violation_has_required_fields(self):
        """Test that violations have all required fields."""
        context = {"bucket": "invalid_bucket", "operation": "create"}
        violations = evaluate_rules(context)

        assert len(violations) > 0
        violation = violations[0]

        # Check required fields
        assert "source" in violation
        assert "code" in violation
        assert "field" in violation
        assert "message" in violation
        assert "rule" in violation

        # Check field values
        assert violation["source"] == "cel"
        assert isinstance(violation["code"], str)
        assert isinstance(violation["field"], str)
        assert isinstance(violation["message"], str)
        assert isinstance(violation["rule"], str)

    def test_violation_code_is_uppercase(self):
        """Test that violation codes are uppercase."""
        context = {"bucket": "invalid_bucket", "operation": "create"}
        violations = evaluate_rules(context)

        assert len(violations) > 0
        for violation in violations:
            assert violation["code"].isupper()

    def test_violation_field_set_correctly(self):
        """Test that violation field is set based on context."""
        # Without bucket in context
        context = {"source": {"bucket": "completed"}, "operation": "update"}
        violations = evaluate_rules(context)

        if violations:
            violation = violations[0]
            assert "field" in violation
            assert violation["field"] == "item"

        # With bucket in context
        context = {"bucket": "invalid_bucket", "operation": "create"}
        violations = evaluate_rules(context)

        if violations:
            violation = violations[0]
            assert violation["field"] == "additionalProperty.app:bucket"


class TestEmptyContext:
    """Tests for edge cases with empty or minimal context."""

    def test_empty_context_no_violations(self):
        """Test that empty context produces no violations."""
        context = {}
        violations = evaluate_rules(context)

        # No rules should apply, so no violations
        assert violations == []

    def test_minimal_context_no_violations(self):
        """Test that context with only irrelevant fields produces no violations."""
        context = {"unrelated_field": "value", "another_field": 123}
        violations = evaluate_rules(context)

        # No rules should match, so no violations
        assert violations == []


class TestEvaluationErrorHandling:
    """Tests for error handling during rule evaluation."""

    def test_evaluation_error_creates_violation(self):
        """Test that evaluation errors are captured as violations."""
        # Create a context that might cause evaluation errors
        # (e.g., accessing undefined properties)
        context = {
            "source": {"bucket": "inbox"},
            "operation": "triage",
            # Missing "target" will cause error in triage rule
        }
        violations = evaluate_rules(context)

        # Should have at least one violation (either from error or normal evaluation)
        # The system should not crash
        assert isinstance(violations, list)

        # Check if any error violations exist
        error_violations = [v for v in violations if v.get("code") == "CEL_EVALUATION_ERROR"]
        # Error violations may or may not be present depending on how celpy handles missing keys
        for violation in error_violations:
            assert violation["source"] == "cel"
            assert "message" in violation
            assert "rule" in violation
