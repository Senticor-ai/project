import type { ItemRecord, CopilotApi } from "../client/api.js";
import { buildBucketPatch, buildCreateItemJsonLd } from "../serializers/jsonld.js";
import { throwIfInvalid, validateCreateItem, validateTriageTransition } from "../validation/index.js";
import type { ProposalState } from "./state.js";

export type CreateProposalPayload = {
  type: string;
  name: string;
  orgId?: string;
  bucket?: string;
  projectId?: string;
  description?: string;
  url?: string;
  orgRef?: { id?: string; name?: string };
  orgRole?: string;
  email?: string;
  conversationId?: string;
};

export type TriageProposalPayload = {
  id: string;
  bucket: string;
};

export function isCreatePayload(payload: unknown): payload is CreateProposalPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as { type?: unknown }).type === "string" &&
      typeof (payload as { name?: unknown }).name === "string",
  );
}

export function isTriagePayload(payload: unknown): payload is TriageProposalPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as { id?: unknown }).id === "string" &&
      typeof (payload as { bucket?: unknown }).bucket === "string",
  );
}

async function findItemByIdentifier(api: CopilotApi, identifier: string): Promise<ItemRecord> {
  try {
    return await api.getItem(identifier);
  } catch {
    const all = await api.listAllItems({ completed: "all" });
    const normalized = identifier.trim().toLowerCase();
    const found = all.find((item) => {
      const jsonld = item.item ?? {};
      const name = typeof jsonld.name === "string" ? jsonld.name : "";
      const canonical = item.canonical_id ?? "";
      const id = typeof jsonld["@id"] === "string" ? jsonld["@id"] : "";
      return (
        item.item_id === identifier ||
        canonical === identifier ||
        id === identifier ||
        name.toLowerCase() === normalized
      );
    });

    if (!found) {
      throw new Error(`Item not found: ${identifier}`);
    }
    return found;
  }
}

export async function executeProposal(api: CopilotApi, proposal: ProposalState): Promise<unknown> {
  if (proposal.operation === "items.create") {
    if (!isCreatePayload(proposal.payload)) {
      throw new Error("Invalid create proposal payload");
    }
    if (!proposal.payload.orgId) {
      proposal.payload.orgId = await resolveCreateOrgId(api);
    }
    const jsonld = buildCreateItemJsonLd(proposal.payload);
    throwIfInvalid(validateCreateItem(jsonld), "Create payload failed validation");
    const created = await api.createItem(jsonld, "senticor-copilot-cli");
    return {
      operation: proposal.operation,
      created,
    };
  }

  if (proposal.operation === "items.triage") {
    if (!isTriagePayload(proposal.payload)) {
      throw new Error("Invalid triage proposal payload");
    }

    const item = await findItemByIdentifier(api, proposal.payload.id);
    const existingBucket = readBucket(item.item);
    throwIfInvalid(
      validateTriageTransition({
        sourceBucket: existingBucket,
        targetBucket: proposal.payload.bucket,
      }),
      "Triage payload failed validation",
    );
    const patched = await api.patchItem(item.item_id, buildBucketPatch(proposal.payload.bucket), {
      source: "senticor-copilot-cli",
    });

    return {
      operation: proposal.operation,
      updated: patched,
    };
  }

  throw new Error(`Unsupported proposal operation: ${proposal.operation}`);
}

export async function resolveItem(api: CopilotApi, identifier: string): Promise<ItemRecord> {
  return findItemByIdentifier(api, identifier);
}

async function resolveCreateOrgId(api: CopilotApi): Promise<string> {
  const fromSession = api.http.getSession().user?.default_org_id;
  if (fromSession) {
    return fromSession;
  }

  try {
    const me = await api.me();
    if (me.default_org_id) {
      return me.default_org_id;
    }
  } catch {
    // fallback below
  }

  const orgs = await api.listOrgs();
  if (orgs.length === 1) {
    return orgs[0].id;
  }

  throw new Error(
    "Org context required for org-scoped @id. Pass --org-id or set COPILOT_ORG_ID.",
  );
}

function readBucket(item: Record<string, unknown>): string | undefined {
  const list = item.additionalProperty;
  if (!Array.isArray(list)) {
    return undefined;
  }

  for (const entry of list) {
    if (
      entry &&
      typeof entry === "object" &&
      "propertyID" in entry &&
      (entry as { propertyID?: unknown }).propertyID === "app:bucket"
    ) {
      const value = (entry as { value?: unknown }).value;
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return undefined;
}
