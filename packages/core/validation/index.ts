import celRules from "./cel/rules.json" with { type: "json" };
import { validateWithShacl } from "./shacl/validator.js";

const ACTION_BUCKETS = new Set([
  "inbox",
  "next",
  "waiting",
  "someday",
  "calendar",
  "reference",
  "completed",
]);

const TRIAGE_TARGETS_FROM_INBOX = new Set([
  "next",
  "waiting",
  "someday",
  "calendar",
  "reference",
]);

const PERSON_ROLES = new Set(["member", "founder", "accountant", "advisor", "interest"]);

type PropertyValue = {
  propertyID?: unknown;
  value?: unknown;
};

export type ValidationIssue = {
  source: "shacl" | "cel";
  code: string;
  message: string;
  field?: string;
  rule?: string;
};

export class ValidationError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

function normalizeType(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return "";
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAdditionalProperty(item: Record<string, unknown>, propertyID: string): unknown {
  const list = item.additionalProperty;
  if (!Array.isArray(list)) {
    return undefined;
  }

  for (const entry of list as PropertyValue[]) {
    if (entry && entry.propertyID === propertyID) {
      return entry.value;
    }
  }
  return undefined;
}

function bucketFromItem(item: Record<string, unknown>): string {
  const value = readAdditionalProperty(item, "app:bucket");
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Maps generic SHACL error codes to specific application error codes
 * for backward compatibility with existing tests and error handling
 */
function mapShaclErrorCode(issue: ValidationIssue, item: Record<string, unknown>): ValidationIssue {
  const type = normalizeType(item["@type"]);

  // Map REQUIRED_PROPERTY_MISSING to specific entity-based codes
  if (issue.code === "REQUIRED_PROPERTY_MISSING") {
    if (issue.field === "schema:name" || issue.field === "name") {
      if (type === "Project") {
        return { ...issue, code: "PROJECT_NAME_REQUIRED", message: "Project items require a non-empty name." };
      }
      if (type === "CreativeWork" || type === "DigitalDocument") {
        return { ...issue, code: "REFERENCE_NAME_REQUIRED", message: "Reference items require a non-empty name." };
      }
      if (type === "Person") {
        return { ...issue, code: "PERSON_NAME_REQUIRED", message: "Person items require a non-empty name." };
      }
    }
    if (issue.field === "app:orgRef" || issue.field?.includes("orgRef")) {
      return { ...issue, code: "PERSON_ORGREF_REQUIRED", message: "Person items require app:orgRef.", field: "additionalProperty.app:orgRef" };
    }
  }

  // Map INVALID_VALUE to specific entity-based codes
  if (issue.code === "INVALID_VALUE") {
    if (issue.field === "app:bucket" || issue.field?.includes("bucket")) {
      if (type === "Action" || type.endsWith(":Action") || type === "ReadAction") {
        return {
          ...issue,
          code: "ACTION_BUCKET_INVALID",
          message: "Action bucket must be one of inbox,next,waiting,someday,calendar,reference,completed.",
          field: "additionalProperty.app:bucket"
        };
      }
    }
    if (issue.field === "app:orgRole" || issue.field?.includes("orgRole")) {
      return {
        ...issue,
        code: "PERSON_ORGROLE_INVALID",
        message: "Person app:orgRole must be one of member,founder,accountant,advisor,interest.",
        field: "additionalProperty.app:orgRole"
      };
    }
  }

  return issue;
}

export function validateCreateItem(item: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bucket = bucketFromItem(item);

  // SHACL validation (schema and shape constraints)
  const shaclIssues = validateWithShacl(item, true);
  // Map generic SHACL codes to specific application codes for backward compatibility
  const mappedShaclIssues = shaclIssues.map(issue => mapShaclErrorCode(issue, item));
  issues.push(...mappedShaclIssues);

  // CEL validation (business rules)
  if (bucket && !ACTION_BUCKETS.has(bucket) && bucket !== "project") {
    issues.push({
      source: "cel",
      code: "BUCKET_ENUM",
      field: "additionalProperty.app:bucket",
      rule: "item.bucket.enum",
      message:
        "Bucket must be one of inbox,next,waiting,someday,calendar,reference,project,completed.",
    });
  }

  return issues;
}

export function validateTriageTransition(params: {
  sourceBucket?: string | null;
  targetBucket: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceBucket = (params.sourceBucket ?? "").trim();
  const targetBucket = params.targetBucket.trim();

  if (!targetBucket || (!ACTION_BUCKETS.has(targetBucket) && targetBucket !== "project")) {
    issues.push({
      source: "cel",
      code: "TRIAGE_TARGET_INVALID",
      field: "bucket",
      rule: "item.bucket.enum",
      message:
        "Target bucket must be one of inbox,next,waiting,someday,calendar,reference,project,completed.",
    });
  }

  if (sourceBucket === "inbox" && !TRIAGE_TARGETS_FROM_INBOX.has(targetBucket)) {
    issues.push({
      source: "cel",
      code: "TRIAGE_INBOX_TARGET_INVALID",
      field: "bucket",
      rule: "triage.inbox.targets",
      message:
        "Inbox items can only move to next,waiting,someday,calendar,reference.",
    });
  }

  if (sourceBucket === "completed") {
    issues.push({
      source: "cel",
      code: "COMPLETED_IMMUTABLE",
      field: "bucket",
      rule: "item.completed.immutable",
      message: "Completed items are immutable.",
    });
  }

  return issues;
}

export function validateUpdateItem(params: {
  sourceBucket?: string | null;
  nextItem: Record<string, unknown>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceBucket = (params.sourceBucket ?? "").trim();

  if (sourceBucket === "completed") {
    issues.push({
      source: "cel",
      code: "COMPLETED_IMMUTABLE",
      field: "item",
      rule: "item.completed.immutable",
      message: "Completed items are immutable.",
    });
  }

  const shapeIssues = validateCreateItem(params.nextItem);
  issues.push(...shapeIssues);

  return issues;
}

export function throwIfInvalid(issues: ValidationIssue[], message = "Validation failed"): void {
  if (issues.length === 0) {
    return;
  }
  throw new ValidationError(message, issues);
}

export function celRuleCount(): number {
  return Array.isArray(celRules) ? celRules.length : 0;
}
