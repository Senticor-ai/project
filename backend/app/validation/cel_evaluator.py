"""CEL business rule evaluator using cel-python library."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import celpy

logger = logging.getLogger(__name__)

# Load CEL rules at module initialization
_RULES_PATH = Path(__file__).parent / "rules" / "business_rules.json"
_compiled_rules: list[dict[str, Any]] | None = None


def _load_rules() -> list[dict[str, Any]]:
    """Load and compile CEL rules from business_rules.json file.

    Returns:
        List of compiled rule dicts with keys: id, description, when_program, rule_program

    Raises:
        RuntimeError: If rules cannot be loaded or compiled
    """
    global _compiled_rules
    if _compiled_rules is not None:
        return _compiled_rules

    try:
        # Load rules from JSON file
        with open(_RULES_PATH, "r", encoding="utf-8") as f:
            rules_data = json.load(f)

        # Compile each rule
        env = celpy.Environment()
        compiled = []

        for rule in rules_data:
            rule_id = rule.get("id", "unknown")
            try:
                # Compile the "when" condition
                when_ast = env.compile(rule["when"])
                when_program = env.program(when_ast)

                # Compile the main rule expression
                expr_ast = env.compile(rule["expression"])
                expr_program = env.program(expr_ast)

                compiled.append({
                    "id": rule_id,
                    "description": rule.get("description", ""),
                    "when_program": when_program,
                    "rule_program": expr_program,
                })
            except Exception as e:
                logger.error(f"Failed to compile CEL rule '{rule_id}': {e}")
                raise RuntimeError(f"CEL rule compilation failed for '{rule_id}': {e}") from e

        _compiled_rules = compiled
        logger.info(f"Loaded and compiled {len(compiled)} CEL rules from {_RULES_PATH}")
        return compiled

    except FileNotFoundError:
        logger.error(f"CEL rules file not found: {_RULES_PATH}")
        raise RuntimeError(f"CEL rules file not found: {_RULES_PATH}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse CEL rules JSON: {e}")
        raise RuntimeError(f"CEL rules JSON parsing failed: {e}") from e
    except Exception as e:
        logger.error(f"Failed to load CEL rules from {_RULES_PATH}: {e}")
        raise RuntimeError(f"CEL rules loading failed: {e}") from e


def evaluate_rules(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Evaluate CEL business rules against provided context.

    Args:
        context: Dictionary containing evaluation context (e.g., source, target, operation, bucket, etc.)

    Returns:
        List of violation dicts. Empty list if all applicable rules pass.
        Each violation has keys: source, code, field, message, rule

    Raises:
        RuntimeError: If rules cannot be loaded
    """
    rules = _load_rules()
    violations: list[dict[str, Any]] = []

    for rule in rules:
        rule_id = rule["id"]
        try:
            # Evaluate the "when" condition to check if rule applies
            when_result = rule["when_program"].evaluate(context)

            # Skip rule if "when" condition is false
            if not when_result:
                continue

            # Evaluate the main rule expression
            rule_result = rule["rule_program"].evaluate(context)

            # If rule returns false, it's a violation
            if not rule_result:
                # Generate error code from rule ID
                code = rule_id.upper().replace(".", "_")

                # Determine field from context or rule
                field = "item"
                if "bucket" in context:
                    field = "additionalProperty.app:bucket"

                violations.append({
                    "source": "cel",
                    "code": code,
                    "field": field,
                    "message": rule["description"],
                    "rule": rule_id,
                })

        except Exception as e:
            logger.error(f"Error evaluating CEL rule '{rule_id}': {e}")
            # Fail safe: treat evaluation errors as violations
            violations.append({
                "source": "cel",
                "code": "CEL_EVALUATION_ERROR",
                "field": "item",
                "message": f"CEL rule '{rule_id}' evaluation failed: {str(e)}",
                "rule": rule_id,
            })

    return violations
