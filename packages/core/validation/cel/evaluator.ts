import { run } from "@bufbuild/cel";
import celRules from "./rules.json" with { type: "json" };
import type { ValidationIssue } from "../index.js";

interface CelRule {
  id: string;
  description: string;
  when?: string;
  expression: string;
}

/**
 * Maps CEL rule IDs to application error codes for backward compatibility
 */
function mapRuleIdToErrorCode(ruleId: string): string {
  const mapping: Record<string, string> = {
    "triage.inbox.targets": "TRIAGE_INBOX_TARGET_INVALID",
    "item.completed.immutable": "COMPLETED_IMMUTABLE",
    "item.bucket.enum": "BUCKET_ENUM",
  };
  return mapping[ruleId] || "CEL_RULE_VIOLATION";
}

/**
 * Maps CEL rule IDs to human-readable error messages
 */
function mapRuleIdToMessage(ruleId: string): string {
  const mapping: Record<string, string> = {
    "triage.inbox.targets":
      "Inbox items can only move to next,waiting,someday,calendar,reference.",
    "item.completed.immutable": "Completed items are immutable.",
    "item.bucket.enum":
      "Bucket must be one of inbox,next,waiting,someday,calendar,reference,project,completed.",
  };
  return mapping[ruleId] || "Business rule violation";
}

/**
 * Maps CEL rule IDs to field names (if applicable)
 */
function mapRuleIdToField(ruleId: string): string | undefined {
  const mapping: Record<string, string> = {
    "triage.inbox.targets": "bucket",
    "item.completed.immutable": "bucket",
    "item.bucket.enum": "additionalProperty.app:bucket",
  };
  return mapping[ruleId];
}

// Load CEL rules at module initialization
const rules = celRules as CelRule[];

/**
 * Evaluates CEL business rules against the provided context
 *
 * @param context - Evaluation context with variables referenced by CEL expressions
 * @returns Array of validation issues for rules that failed
 *
 * @example
 * ```typescript
 * const issues = evaluateCelRules({
 *   operation: 'create',
 *   bucket: 'inbox',
 * });
 * ```
 */
export function evaluateCelRules(
  context: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of rules) {
    try {
      // Check if rule applies to this context
      if (rule.when) {
        // Type assertion: context values are valid CEL inputs
        const applies = run(rule.when, context as Record<string, any>);
        if (!applies) {
          continue; // Rule doesn't apply, skip it
        }
      }

      // Evaluate the rule expression
      // Type assertion: context values are valid CEL inputs
      const result = run(rule.expression, context as Record<string, any>);

      // If result is false, it's a violation
      if (result === false) {
        issues.push({
          source: "cel",
          code: mapRuleIdToErrorCode(rule.id),
          message: mapRuleIdToMessage(rule.id),
          field: mapRuleIdToField(rule.id),
          rule: rule.id,
        });
      }
    } catch (error) {
      // Fail-safe: treat evaluation errors as violations
      issues.push({
        source: "cel",
        code: "CEL_EVALUATION_ERROR",
        message: `Rule ${rule.id} evaluation failed: ${error}`,
        field: undefined,
        rule: rule.id,
      });
    }
  }

  return issues;
}
