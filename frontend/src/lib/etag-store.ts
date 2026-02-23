/**
 * In-memory ETag store for optimistic concurrency control.
 * Maps item IDs to their latest known ETag values.
 */
const etagMap = new Map<string, string>();

export function setEtag(itemId: string, etag: string) {
  etagMap.set(itemId, etag);
}

export function getEtag(itemId: string): string | undefined {
  return etagMap.get(itemId);
}

export function clearEtag(itemId: string) {
  etagMap.delete(itemId);
}
