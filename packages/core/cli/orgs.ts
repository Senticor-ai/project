import { Command } from "commander";

import type { ItemRecord, OrgResponse, TayApi } from "../client/api.js";
import { itemType, readAdditionalProperty } from "../serializers/jsonld.js";
import { createApi, printHuman } from "./context.js";
import { printSuccessJson } from "./output.js";

function parseOrgRef(value: unknown): { id?: string; name?: string } | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as { id?: string; name?: string };
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      return { name: value };
    }
  }

  if (typeof value === "object") {
    const typed = value as { id?: unknown; name?: unknown };
    return {
      id: typeof typed.id === "string" ? typed.id : undefined,
      name: typeof typed.name === "string" ? typed.name : undefined,
    };
  }

  return null;
}

function formatOrg(org: OrgResponse): Record<string, unknown> {
  return {
    id: org.id,
    name: org.name,
    role: org.role,
    created_at: org.created_at,
  };
}

async function resolveOrg(api: TayApi, idOrName: string): Promise<OrgResponse> {
  const orgs = await api.listOrgs();
  const normalized = idOrName.trim().toLowerCase();
  const org = orgs.find((entry) => {
    return entry.id === idOrName || entry.name.toLowerCase() === normalized;
  });

  if (!org) {
    throw new Error(`Org not found: ${idOrName}`);
  }

  return org;
}

function isReferenceLike(item: ItemRecord): boolean {
  const type = itemType(item.item);
  return type === "CreativeWork" || type === "DigitalDocument";
}

function itemName(item: ItemRecord): string | null {
  return typeof item.item.name === "string" ? item.item.name : null;
}

async function docsForOrg(api: TayApi, org: OrgResponse): Promise<Array<Record<string, unknown>>> {
  const all = await api.listAllItems({ completed: "all" });

  const matches = all.filter((item) => {
    if (!isReferenceLike(item)) {
      return false;
    }
    const orgRef = parseOrgRef(readAdditionalProperty(item.item, "app:orgRef"));
    if (!orgRef) {
      return false;
    }
    return orgRef.id === org.id || orgRef.name?.toLowerCase() === org.name.toLowerCase();
  });

  return matches.map((item) => {
    const bucket = readAdditionalProperty(item.item, "app:bucket");
    const role = readAdditionalProperty(item.item, "app:orgRole");
    return {
      item_id: item.item_id,
      canonical_id: item.canonical_id,
      name: itemName(item),
      type: itemType(item.item),
      bucket: typeof bucket === "string" ? bucket : null,
      org_role: typeof role === "string" ? role : null,
      updated_at: item.updated_at,
    };
  });
}

export function registerOrgsCommands(program: Command): void {
  const orgs = program.command("orgs").description("Organization commands");

  orgs
    .command("list")
    .description("List organizations")
    .action(async function listAction(this: Command) {
      const { api, options } = await createApi(this);
      const payload = (await api.listOrgs()).map(formatOrg);
      if (options.json) {
        printSuccessJson({ orgs: payload });
        return;
      }

      for (const org of payload) {
        printHuman(`${org.id}\t${org.name}\t${org.role}`);
      }
    });

  orgs
    .command("get")
    .description("Get org details")
    .argument("<idOrName>", "Org id or name")
    .option("--docs", "Include org-linked reference docs")
    .action(async function getAction(this: Command, idOrName: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ docs?: boolean }>();

      const org = await resolveOrg(api, idOrName);
      const data: Record<string, unknown> = {
        org: formatOrg(org),
      };

      if (cmdOpts.docs) {
        data.docs = await docsForOrg(api, org);
      }

      if (options.json) {
        printSuccessJson(data);
        return;
      }

      printHuman(JSON.stringify(data, null, 2));
    });
}
