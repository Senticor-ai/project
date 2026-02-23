import type { ItemRecord, TayApi } from "../client/api.js";
import { buildBucketPatch, buildCreateItemJsonLd } from "../serializers/jsonld.js";
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

async function findItemByIdentifier(api: TayApi, identifier: string): Promise<ItemRecord> {
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

export async function executeProposal(api: TayApi, proposal: ProposalState): Promise<unknown> {
  if (proposal.operation === "items.create") {
    if (!isCreatePayload(proposal.payload)) {
      throw new Error("Invalid create proposal payload");
    }
    if (!proposal.payload.orgId) {
      proposal.payload.orgId = await resolveCreateOrgId(api);
    }
    const jsonld = buildCreateItemJsonLd(proposal.payload);
    const created = await api.createItem(jsonld, "tay-cli");
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
    const patched = await api.patchItem(item.item_id, buildBucketPatch(proposal.payload.bucket), {
      source: "tay-cli",
    });

    return {
      operation: proposal.operation,
      updated: patched,
    };
  }

  throw new Error(`Unsupported proposal operation: ${proposal.operation}`);
}

export async function resolveItem(api: TayApi, identifier: string): Promise<ItemRecord> {
  return findItemByIdentifier(api, identifier);
}

async function resolveCreateOrgId(api: TayApi): Promise<string> {
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
    "Org context required for org-scoped @id. Pass --org-id or set TAY_ORG_ID.",
  );
}
