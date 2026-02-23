import { Command } from "commander";

import { TayApi } from "../client/api.js";

export type GlobalOptions = {
  host: string;
  orgId?: string;
  json: boolean;
  nonInteractive: boolean;
  yes: boolean;
  color: boolean;
  token?: string;
};

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

export function getGlobalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals() as {
    host?: string;
    orgId?: string;
    json?: boolean;
    nonInteractive?: boolean;
    yes?: boolean;
    color?: boolean;
  };

  const host = normalizeHost(options.host ?? process.env.TAY_HOST ?? "http://localhost:8000");
  const orgId = options.orgId ?? process.env.TAY_ORG_ID;
  const token = process.env.TAY_TOKEN;

  return {
    host,
    orgId: orgId || undefined,
    json: Boolean(options.json),
    nonInteractive: Boolean(options.nonInteractive),
    yes: Boolean(options.yes),
    color: options.color ?? true,
    token: token || undefined,
  };
}

export async function createApi(command: Command): Promise<{
  api: TayApi;
  options: GlobalOptions;
}> {
  const options = getGlobalOptions(command);
  const api = await TayApi.create({
    host: options.host,
    orgId: options.orgId,
    token: options.token,
  });
  return { api, options };
}

export async function resolveOrgId(api: TayApi, options: GlobalOptions): Promise<string> {
  if (options.orgId) {
    return options.orgId;
  }

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
    // Continue to org listing fallback.
  }

  const orgs = await api.listOrgs();
  if (orgs.length === 1) {
    return orgs[0].id;
  }

  throw new Error(
    "Org context required. Pass --org-id or set TAY_ORG_ID so IDs can be org-scoped.",
  );
}

export function printHuman(value: string): void {
  process.stdout.write(`${value}\n`);
}
