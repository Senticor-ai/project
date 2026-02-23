/**
 * Canonical URN-style identifiers for all entities.
 * Inspired by the ELI/FRBR canonical ID system from the papers.
 *
 * Format: urn:app:{entity-type}:{uuid}
 * Examples:
 *   urn:app:inbox:a1b2c3d4-e5f6-7890-abcd-ef1234567890
 *   urn:app:action:e5f6a7b8-c9d0-1234-efab-567890123456
 *   urn:app:project:c3d4e5f6-a7b8-9012-cdef-123456789012
 */
export type CanonicalId = `urn:app:${EntityType}:${string}`;

export type EntityType =
  | "inbox"
  | "action"
  | "project"
  | "waiting"
  | "someday"
  | "calendar"
  | "reference"
  | "context"
  | "tag";

export function createCanonicalId(
  entityType: EntityType,
  uuid: string,
): CanonicalId {
  return `urn:app:${entityType}:${uuid}`;
}

export function parseCanonicalId(id: CanonicalId): {
  entityType: EntityType;
  uuid: string;
} {
  const parts = id.split(":");
  return {
    entityType: parts[2] as EntityType,
    uuid: parts.slice(3).join(":"),
  };
}
