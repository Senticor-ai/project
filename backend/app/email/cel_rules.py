"""CEL-backed rule catalog and evaluator for Gmail sync/proposal behavior."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import celpy
from celpy.adapter import json_to_cel

logger = logging.getLogger(__name__)

_RULES_PATH = Path(__file__).parent / "rules" / "sync_behavior_rules.json"
_compiled_rules: dict[str, dict[str, Any]] | None = None


def _load_rules() -> dict[str, dict[str, Any]]:
    """Load and compile CEL rules for email sync/proposal behavior."""
    global _compiled_rules
    if _compiled_rules is not None:
        return _compiled_rules

    try:
        with _RULES_PATH.open(encoding="utf-8") as f:
            rules_data = json.load(f)
        if not isinstance(rules_data, list):
            raise RuntimeError("Rule catalog must be a JSON array")

        env = celpy.Environment()
        compiled: dict[str, dict[str, Any]] = {}
        for raw_rule in rules_data:
            if not isinstance(raw_rule, dict):
                raise RuntimeError("Each rule entry must be a JSON object")
            rule_id = str(raw_rule.get("id") or "").strip()
            expression = raw_rule.get("expression")
            if not rule_id:
                raise RuntimeError("Rule entry missing id")
            if not isinstance(expression, str) or not expression.strip():
                raise RuntimeError(f"Rule '{rule_id}' missing expression")
            if rule_id in compiled:
                raise RuntimeError(f"Duplicate rule id '{rule_id}'")

            when_expr = raw_rule.get("when")
            when_program = None
            if isinstance(when_expr, str) and when_expr.strip():
                when_ast = env.compile(when_expr)
                when_program = env.program(when_ast)

            expr_ast = env.compile(expression)
            expr_program = env.program(expr_ast)

            compiled[rule_id] = {
                "id": rule_id,
                "description": str(raw_rule.get("description") or ""),
                "when_program": when_program,
                "rule_program": expr_program,
            }

        _compiled_rules = compiled
        logger.info("Loaded %d email CEL rules from %s", len(compiled), _RULES_PATH)
        return compiled
    except Exception as exc:
        logger.error("Failed to load email CEL rules from %s: %s", _RULES_PATH, exc)
        raise RuntimeError(f"Email CEL rule loading failed: {exc}") from exc


def evaluate_rule(
    rule_id: str,
    context: dict[str, Any],
    *,
    default: bool,
) -> bool:
    """Evaluate a single CEL rule and return a boolean decision.

    If the rule does not exist, does not apply (`when` false), or evaluation fails,
    returns `default`.
    """
    rules = _load_rules()
    rule = rules.get(rule_id)
    if rule is None:
        logger.warning("Email CEL rule not found: %s", rule_id)
        return default

    try:
        activation = json_to_cel(context)
        when_program = rule.get("when_program")
        if when_program is not None:
            applies = bool(when_program.evaluate(activation))
            if not applies:
                return default

        return bool(rule["rule_program"].evaluate(activation))
    except Exception:
        logger.warning("Email CEL rule evaluation failed: %s", rule_id, exc_info=True)
        return default


def list_rule_ids() -> list[str]:
    """Return sorted rule IDs from the email CEL catalog."""
    return sorted(_load_rules().keys())
