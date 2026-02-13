/**
 * JSON Schema validation helper for serializer tests.
 *
 * Loads JSON Schemas from static files exported by the backend
 * (`backend/scripts/export_schemas.py`). Falls back to fetching from
 * the live backend API when static files are not available (local dev).
 *
 * If the backend changes its Pydantic models, re-run the export script
 * to update the static files — contract drift is caught automatically.
 */
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const ajv = new Ajv({ allErrors: true, strict: false });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "schemas");

function loadStaticSchema(name: string): object | null {
  try {
    const content = readFileSync(resolve(SCHEMAS_DIR, `${name}.json`), "utf-8");
    return JSON.parse(content) as object;
  } catch {
    return null;
  }
}

async function fetchSchema(name: string): Promise<object> {
  const res = await fetch(`${API_BASE}/schemas/${name}`);
  if (!res.ok) throw new Error(`Failed to fetch schema ${name}: ${res.status}`);
  return (await res.json()) as object;
}

async function getSchema(name: string): Promise<object> {
  const staticSchema = loadStaticSchema(name);
  if (staticSchema) return staticSchema;
  return fetchSchema(name);
}

/** Check if schemas are available (static files or live backend). */
export async function isBackendAvailable(): Promise<boolean> {
  // Static files always available if exported
  if (loadStaticSchema("action-item")) return true;

  try {
    const res = await fetch(`${API_BASE}/schemas`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SchemaValidators {
  validateInboxItem: ValidateFunction;
  validateActionItem: ValidateFunction;
  validateProjectItem: ValidateFunction;
  validateReferenceItem: ValidateFunction;
  validateItemPatch: ValidateFunction;
}

/** Load and compile all schema validators (static files first, backend fallback). */
export async function loadValidators(): Promise<SchemaValidators> {
  const [inbox, action, project, reference, patch] = await Promise.all([
    getSchema("inbox-item"),
    getSchema("action-item"),
    getSchema("project-item"),
    getSchema("reference-item"),
    getSchema("item-patch"),
  ]);

  return {
    validateInboxItem: ajv.compile(inbox),
    validateActionItem: ajv.compile(action),
    validateProjectItem: ajv.compile(project),
    validateReferenceItem: ajv.compile(reference),
    validateItemPatch: ajv.compile(patch),
  };
}

/** Format ajv errors into a readable string. */
export function formatErrors(validate: { errors?: Ajv["errors"] }): string {
  if (!validate.errors) return "";
  return validate.errors
    .map((e) => `${e.instancePath} ${e.message}`)
    .join("; ");
}
