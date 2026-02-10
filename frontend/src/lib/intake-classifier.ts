import type { CaptureSource, ConfidenceLevel } from "@/model/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Schema.org @type values the classifier can assign. */
export type SchemaType =
  | "Action"
  | "CreativeWork"
  | "DigitalDocument"
  | "EmailMessage"
  | "Event";

/** Entity types that could be extracted from structured files. */
export type ExtractableEntity = "Person" | "Organization" | "Event";

/** Result of classifying user input at capture time. */
export interface IntakeClassification {
  schemaType: SchemaType;
  confidence: ConfidenceLevel;
  captureSource: CaptureSource;
  encodingFormat?: string;
  extractableEntities?: ExtractableEntity[];
}

// ---------------------------------------------------------------------------
// MIME → schema.org type lookup
// ---------------------------------------------------------------------------

interface MimeEntry {
  schemaType: SchemaType;
  extractableEntities?: ExtractableEntity[];
}

const MIME_TYPE_MAP: Record<string, MimeEntry> = {
  // Documents
  "application/pdf": { schemaType: "DigitalDocument" },
  "application/msword": { schemaType: "DigitalDocument" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    schemaType: "DigitalDocument",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    schemaType: "DigitalDocument",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    schemaType: "DigitalDocument",
  },
  "application/vnd.oasis.opendocument.text": { schemaType: "DigitalDocument" },
  "application/vnd.oasis.opendocument.spreadsheet": {
    schemaType: "DigitalDocument",
  },
  "text/plain": { schemaType: "DigitalDocument" },
  "text/csv": { schemaType: "DigitalDocument" },
  "text/html": { schemaType: "CreativeWork" },

  // Images
  "image/jpeg": { schemaType: "DigitalDocument" },
  "image/png": { schemaType: "DigitalDocument" },
  "image/gif": { schemaType: "DigitalDocument" },
  "image/svg+xml": { schemaType: "DigitalDocument" },
  "image/webp": { schemaType: "DigitalDocument" },

  // Email
  "message/rfc822": {
    schemaType: "EmailMessage",
    extractableEntities: ["Person", "Organization"],
  },
  "application/vnd.ms-outlook": {
    schemaType: "EmailMessage",
    extractableEntities: ["Person", "Organization"],
  },

  // vCard
  "text/vcard": {
    schemaType: "DigitalDocument",
    extractableEntities: ["Person", "Organization"],
  },
  "text/x-vcard": {
    schemaType: "DigitalDocument",
    extractableEntities: ["Person", "Organization"],
  },

  // Calendar
  "text/calendar": {
    schemaType: "DigitalDocument",
    extractableEntities: ["Event", "Person"],
  },
};

/** Fallback: extension → MIME for browsers that don't provide a MIME type. */
const EXTENSION_FALLBACK: Record<string, string> = {
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
  ".vcf": "text/vcard",
  ".ics": "text/calendar",
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
};

// ---------------------------------------------------------------------------
// URL detection
// ---------------------------------------------------------------------------

/** Matches input that is *solely* a URL (with http/https protocol). */
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify manually typed text.
 * - If the entire input is a URL, classify as CreativeWork.
 * - Otherwise classify as Action (the user is capturing something to do).
 */
export function classifyText(rawText: string): IntakeClassification {
  const trimmed = rawText.trim();

  if (URL_ONLY_RE.test(trimmed)) {
    return classifyUrl(trimmed);
  }

  return {
    schemaType: "Action",
    confidence: "medium",
    captureSource: { kind: "thought" },
  };
}

/**
 * Classify a dropped/uploaded file based on MIME type (with extension fallback).
 */
export function classifyFile(file: File): IntakeClassification {
  let mimeType = file.type;

  // Fallback to extension when MIME is empty or generic
  if (!mimeType || mimeType === "application/octet-stream") {
    const ext = extractExtension(file.name);
    mimeType = (ext && EXTENSION_FALLBACK[ext]) || mimeType;
  }

  const entry = MIME_TYPE_MAP[mimeType];

  const result: IntakeClassification = {
    schemaType: entry?.schemaType ?? "DigitalDocument",
    confidence: "medium",
    captureSource: {
      kind: "file",
      fileName: file.name,
      mimeType: mimeType || "application/octet-stream",
    },
  };

  if (mimeType) {
    result.encodingFormat = mimeType;
  }

  if (entry?.extractableEntities) {
    result.extractableEntities = entry.extractableEntities;
  }

  return result;
}

/**
 * Classify a pasted/detected URL.
 */
export function classifyUrl(url: string): IntakeClassification {
  return {
    schemaType: "CreativeWork",
    confidence: "medium",
    captureSource: { kind: "url", url },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractExtension(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return undefined;
  return fileName.slice(dot).toLowerCase();
}
