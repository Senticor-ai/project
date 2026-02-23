import celRules from "./cel/rules.json" with { type: "json" };

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

export function validateCreateItem(item: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const type = normalizeType(item["@type"]);
  const bucket = bucketFromItem(item);

  if (!type) {
    issues.push({
      source: "shacl",
      code: "TYPE_REQUIRED",
      field: "@type",
      message: "@type is required.",
    });
    return issues;
  }

  if (type === "Action" || type.endsWith(":Action") || type === "ReadAction") {
    if (!ACTION_BUCKETS.has(bucket)) {
      issues.push({
        source: "shacl",
        code: "ACTION_BUCKET_INVALID",
        field: "additionalProperty.app:bucket",
        message:
          "Action bucket must be one of inbox,next,waiting,someday,calendar,reference,completed.",
      });
    }
  }

  if (type === "Project") {
    if (!trimString(item.name)) {
      issues.push({
        source: "shacl",
        code: "PROJECT_NAME_REQUIRED",
        field: "name",
        message: "Project items require a non-empty name.",
      });
    }
  }

  if (type === "CreativeWork" || type === "DigitalDocument") {
    if (!trimString(item.name)) {
      issues.push({
        source: "shacl",
        code: "REFERENCE_NAME_REQUIRED",
        field: "name",
        message: "Reference items require a non-empty name.",
      });
    }
  }

  if (type === "Person") {
    if (!trimString(item.name)) {
      issues.push({
        source: "shacl",
        code: "PERSON_NAME_REQUIRED",
        field: "name",
        message: "Person items require a non-empty name.",
      });
    }
    const orgRef = readAdditionalProperty(item, "app:orgRef");
    if (!orgRef) {
      issues.push({
        source: "shacl",
        code: "PERSON_ORGREF_REQUIRED",
        field: "additionalProperty.app:orgRef",
        message: "Person items require app:orgRef.",
      });
    }
    const role = trimString(readAdditionalProperty(item, "app:orgRole"));
    if (!PERSON_ROLES.has(role)) {
      issues.push({
        source: "shacl",
        code: "PERSON_ORGROLE_INVALID",
        field: "additionalProperty.app:orgRole",
        message: "Person app:orgRole must be one of member,founder,accountant,advisor,interest.",
      });
    }
  }

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
