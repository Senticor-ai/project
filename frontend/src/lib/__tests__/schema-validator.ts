/**
 * JSON Schema validation helper for serializer tests.
 *
 * Loads the generated JSON Schema files from schema/ and validates
 * serializer output against them using ajv. If the backend changes
 * its Pydantic models and the schemas are regenerated, these
 * validations break — catching contract drift automatically.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";

const SCHEMA_DIR = resolve(__dirname, "../../../../schema");

const ajv = new Ajv({ allErrors: true, strict: false });

function loadSchema(filename: string): object {
  const raw = readFileSync(resolve(SCHEMA_DIR, filename), "utf-8");
  return JSON.parse(raw) as object;
}

// Pre-compile validators for each entity type
export const validateInboxThing = ajv.compile(
  loadSchema("inbox-thing.schema.json"),
);
export const validateActionThing = ajv.compile(
  loadSchema("action-thing.schema.json"),
);
export const validateProjectThing = ajv.compile(
  loadSchema("project-thing.schema.json"),
);
export const validateReferenceThing = ajv.compile(
  loadSchema("reference-thing.schema.json"),
);
export const validateThingPatch = ajv.compile(
  loadSchema("thing-patch.schema.json"),
);

/** Format ajv errors into a readable string. */
export function formatErrors(
  validate: { errors?: Ajv["errors"] },
): string {
  if (!validate.errors) return "";
  return validate.errors
    .map((e) => `${e.instancePath} ${e.message}`)
    .join("; ");
}
