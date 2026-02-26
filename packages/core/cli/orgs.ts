import { Command } from "commander";

import type { ItemRecord, OrgResponse, CopilotApi } from "../client/api.js";
import { itemType, readAdditionalProperty } from "../serializers/jsonld.js";
import { createApi, printHuman } from "./context.js";
import { printSuccessJson } from "./output.js";

const VALID_DOC_TYPES = ["general", "user", "log", "agent"] as const;
type OrgDocType = (typeof VALID_DOC_TYPES)[number];

function resolveDocId(org: OrgResponse, docType: OrgDocType): string {
  const map: Record<OrgDocType, string | null | undefined> = {
    general: org.general_doc_id,
    user: org.user_doc_id,
    log: org.log_doc_id,
    agent: org.agent_doc_id,
  };
  const docId = map[docType];
  if (!docId) {
    throw new Error(
      `Org "${org.name}" has no ${docType} document. Was the org created before knowledge docs were enabled?`,
    );
  }
  return docId;
}

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

async function resolveOrg(
  api: CopilotApi,
  idOrName: string,
): Promise<OrgResponse> {
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

async function docsForOrg(
  api: CopilotApi,
  org: OrgResponse,
): Promise<Array<Record<string, unknown>>> {
  const all = await api.listAllItems({ completed: "all" });

  const matches = all.filter((item) => {
    if (!isReferenceLike(item)) {
      return false;
    }
    const orgRef = parseOrgRef(readAdditionalProperty(item.item, "app:orgRef"));
    if (!orgRef) {
      return false;
    }
    return (
      orgRef.id === org.id ||
      orgRef.name?.toLowerCase() === org.name.toLowerCase()
    );
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

  // -- orgs docs subcommands --------------------------------------------------

  const docs = orgs
    .command("docs")
    .description("Org knowledge document operations");

  docs
    .command("update")
    .description(
      "Replace content of an org knowledge document (general, user, or agent)",
    )
    .argument("<orgIdOrName>", "Org id or name")
    .requiredOption("--doc <type>", "Document type: general, user, or agent")
    .requiredOption(
      "--text <content>",
      "New document content (replaces existing)",
    )
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function updateAction(this: Command, orgIdOrName: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        doc: string;
        text: string;
        apply?: boolean;
      }>();

      const docType = cmdOpts.doc.toLowerCase();
      if (docType === "log") {
        throw new Error(
          "Cannot update LOG document — use 'orgs docs append' instead",
        );
      }
      if (!VALID_DOC_TYPES.includes(docType as OrgDocType)) {
        throw new Error(
          `Invalid doc type "${cmdOpts.doc}". Must be one of: general, user, agent`,
        );
      }

      if (cmdOpts.apply && !options.yes) {
        throw new Error("--apply requires --yes");
      }

      const org = await resolveOrg(api, orgIdOrName);
      const docId = resolveDocId(org, docType as OrgDocType);

      if (!cmdOpts.apply) {
        if (options.json) {
          printSuccessJson({
            mode: "proposal",
            proposal: {
              operation: "orgs.docs.update",
              org: formatOrg(org),
              doc_type: docType,
              doc_id: docId,
              text_preview: cmdOpts.text.slice(0, 200),
            },
          });
        } else {
          printHuman(
            `Would update ${docType} document for org "${org.name}" (${docId})`,
          );
        }
        return;
      }

      await api.patchFileContent(docId, cmdOpts.text);

      if (options.json) {
        printSuccessJson({
          mode: "applied",
          result: {
            operation: "orgs.docs.update",
            org_id: org.id,
            doc_type: docType,
            doc_id: docId,
          },
        });
      } else {
        printHuman(`Updated ${docType} document for org "${org.name}"`);
      }
    });

  docs
    .command("append")
    .description("Append a timestamped entry to the org log document")
    .argument("<orgIdOrName>", "Org id or name")
    .requiredOption("--doc <type>", "Document type (must be: log)")
    .requiredOption("--text <content>", "Entry text to append")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function appendAction(this: Command, orgIdOrName: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        doc: string;
        text: string;
        apply?: boolean;
      }>();

      const docType = cmdOpts.doc.toLowerCase();
      if (docType !== "log") {
        throw new Error(
          `Cannot append to ${cmdOpts.doc} document — use 'orgs docs update' for non-log documents`,
        );
      }

      if (cmdOpts.apply && !options.yes) {
        throw new Error("--apply requires --yes");
      }

      const org = await resolveOrg(api, orgIdOrName);
      const docId = resolveDocId(org, "log");

      if (!cmdOpts.apply) {
        if (options.json) {
          printSuccessJson({
            mode: "proposal",
            proposal: {
              operation: "orgs.docs.append",
              org: formatOrg(org),
              doc_type: "log",
              doc_id: docId,
              text_preview: cmdOpts.text.slice(0, 200),
            },
          });
        } else {
          printHuman(
            `Would append to log for org "${org.name}" (${docId}): ${cmdOpts.text}`,
          );
        }
        return;
      }

      await api.appendContent(docId, cmdOpts.text);

      if (options.json) {
        printSuccessJson({
          mode: "applied",
          result: {
            operation: "orgs.docs.append",
            org_id: org.id,
            doc_type: "log",
            doc_id: docId,
          },
        });
      } else {
        printHuman(`Appended entry to log for org "${org.name}"`);
      }
    });
}
