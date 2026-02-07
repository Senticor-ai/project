/**
 * JSON Schema validation helper for serializer tests.
 *
 * Fetches JSON Schemas from the backend `/schemas` API endpoint and
 * validates serializer output against them using ajv. If the backend
 * changes its Pydantic models, these validations break — catching
 * contract drift automatically.
 *
 * Requires a running backend at VITE_API_BASE_URL (default: http://localhost:8000).
 * Tests using these validators should skip gracefully when the backend
 * is unreachable.
 */
import Ajv, { type ValidateFunction } from "ajv";

const API_BASE = process.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const ajv = new Ajv({ allErrors: true, strict: false });

async function fetchSchema(name: string): Promise<object> {
  const res = await fetch(`${API_BASE}/schemas/${name}`);
  if (!res.ok) throw new Error(`Failed to fetch schema ${name}: ${res.status}`);
  return (await res.json()) as object;
}

/** Check if the backend is reachable. */
export async function isBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/schemas`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SchemaValidators {
  validateInboxThing: ValidateFunction;
  validateActionThing: ValidateFunction;
  validateProjectThing: ValidateFunction;
  validateReferenceThing: ValidateFunction;
  validateThingPatch: ValidateFunction;
}

/** Fetch and compile all schema validators from the backend API. */
export async function loadValidators(): Promise<SchemaValidators> {
  const [inbox, action, project, reference, patch] = await Promise.all([
    fetchSchema("inbox-thing"),
    fetchSchema("action-thing"),
    fetchSchema("project-thing"),
    fetchSchema("reference-thing"),
    fetchSchema("thing-patch"),
  ]);

  return {
    validateInboxThing: ajv.compile(inbox),
    validateActionThing: ajv.compile(action),
    validateProjectThing: ajv.compile(project),
    validateReferenceThing: ajv.compile(reference),
    validateThingPatch: ajv.compile(patch),
  };
}

/** Format ajv errors into a readable string. */
export function formatErrors(
  validate: { errors?: Ajv["errors"] },
): string {
  if (!validate.errors) return "";
  return validate.errors
    .map((e) => `${e.instancePath} ${e.message}`)
    .join("; ");
}
