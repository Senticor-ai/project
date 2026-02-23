import { Command } from "commander";

import type { ItemRecord } from "../client/api.js";
import { buildCreateItemJsonLd, itemType, readAdditionalProperty } from "../serializers/jsonld.js";
import { throwIfInvalid, validateCreateItem, validateTriageTransition } from "../validation/index.js";
import { createApi, printHuman, resolveOrgId } from "./context.js";
import { printSuccessJson } from "./output.js";
import {
  type CreateProposalPayload,
  executeProposal,
  resolveItem,
} from "./proposals-lib.js";
import { addProposal } from "./state.js";

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
      // ignore
    }
    return { name: value };
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

function getBucket(record: ItemRecord): string | undefined {
  const value = readAdditionalProperty(record.item, "app:bucket");
  return typeof value === "string" ? value : undefined;
}

function getDisplayName(record: ItemRecord): string | null {
  if (typeof record.item.name === "string" && record.item.name.trim()) {
    return record.item.name;
  }
  const rawCapture = readAdditionalProperty(record.item, "app:rawCapture");
  if (typeof rawCapture === "string" && rawCapture.trim()) {
    return rawCapture;
  }
  return null;
}

function formatItem(record: ItemRecord): Record<string, unknown> {
  const orgRef = parseOrgRef(readAdditionalProperty(record.item, "app:orgRef"));
  const projectRefs = readAdditionalProperty(record.item, "app:projectRefs");
  return {
    item_id: record.item_id,
    canonical_id: record.canonical_id,
    type: itemType(record.item),
    name: getDisplayName(record),
    bucket: getBucket(record) ?? null,
    org_ref: orgRef,
    project_refs: Array.isArray(projectRefs) ? projectRefs : [],
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function printItemLines(records: ItemRecord[]): void {
  for (const record of records) {
    const line = [
      record.item_id,
      record.canonical_id,
      itemType(record.item),
      getDisplayName(record) ?? "(unnamed)",
      getBucket(record) ?? "-",
    ].join("\t");
    printHuman(line);
  }
}

export function registerItemsCommands(program: Command): void {
  const items = program.command("items").description("List and manage workspace items");

  items
    .command("list")
    .description("List items")
    .option("--bucket <bucket>", "Filter by app:bucket")
    .option("--org <org>", "Filter by app:orgRef.id or app:orgRef.name")
    .option("--summary", "Return summary counts")
    .option("--limit <n>", "Max records to return", "100")
    .action(async function listAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        bucket?: string;
        org?: string;
        summary?: boolean;
        limit: string;
      }>();

      const limit = Number.parseInt(cmdOpts.limit, 10);
      const all = await api.listAllItems({ completed: "all" });

      let filtered = all;
      if (cmdOpts.bucket) {
        const bucketFilter = cmdOpts.bucket.toLowerCase();
        filtered = filtered.filter((item) => (getBucket(item) ?? "").toLowerCase() === bucketFilter);
      }
      if (cmdOpts.org) {
        const orgFilter = cmdOpts.org.toLowerCase();
        filtered = filtered.filter((item) => {
          const orgRef = parseOrgRef(readAdditionalProperty(item.item, "app:orgRef"));
          if (!orgRef) return false;
          return (
            (orgRef.id ?? "").toLowerCase() === orgFilter ||
            (orgRef.name ?? "").toLowerCase() === orgFilter
          );
        });
      }

      const sliced = Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;

      if (cmdOpts.summary) {
        const bucketCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        for (const record of sliced) {
          const bucket = getBucket(record) ?? "unknown";
          bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
          const type = itemType(record.item);
          typeCounts[type] = (typeCounts[type] ?? 0) + 1;
        }

        const data = {
          total: sliced.length,
          bucket_counts: bucketCounts,
          type_counts: typeCounts,
        };
        if (options.json) {
          printSuccessJson(data);
        } else {
          printHuman(`Total: ${data.total}`);
          printHuman(`Buckets: ${JSON.stringify(data.bucket_counts)}`);
          printHuman(`Types: ${JSON.stringify(data.type_counts)}`);
        }
        return;
      }

      const formatted = sliced.map(formatItem);
      if (options.json) {
        printSuccessJson({ items: formatted });
      } else {
        printItemLines(sliced);
      }
    });

  items
    .command("get")
    .description("Get item details")
    .argument("<id>", "Item id, canonical id, or name")
    .option("--content", "Include extracted file content")
    .action(async function getAction(this: Command, id: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ content?: boolean }>();

      if (cmdOpts.content) {
        const payload = await api.getItemContent(id);
        if (options.json) {
          printSuccessJson(payload);
        } else {
          printHuman(JSON.stringify(payload, null, 2));
        }
        return;
      }

      const item = await resolveItem(api, id);
      const payload = formatItem(item);
      if (options.json) {
        printSuccessJson(payload);
      } else {
        printHuman(JSON.stringify(payload, null, 2));
      }
    });

  items
    .command("create")
    .description("Create an item (proposal by default)")
    .requiredOption("--type <type>", "Schema.org type (Action, Project, Person, CreativeWork, ...)")
    .requiredOption("--name <name>", "Name/title")
    .option("--bucket <bucket>", "Bucket override")
    .option("--project <projectId>", "Project canonical id")
    .option("--description <text>", "Description")
    .option("--url <url>", "URL (for references)")
    .option("--org <org>", "Org id or name for app:orgRef")
    .option("--role <role>", "Org role for app:orgRole")
    .option("--email <email>", "Email (for Person)")
    .option("--conversation-id <id>", "Conversation id for app:captureSource")
    .option("--propose", "Store as proposal (default)")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function createAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        type: string;
        name: string;
        bucket?: string;
        project?: string;
        description?: string;
        url?: string;
        org?: string;
        role?: string;
        email?: string;
        conversationId?: string;
        propose?: boolean;
        apply?: boolean;
      }>();

      if (cmdOpts.apply && cmdOpts.propose) {
        throw new Error("Use either --propose or --apply, not both");
      }

      const payload: CreateProposalPayload = {
        type: cmdOpts.type,
        name: cmdOpts.name,
        orgId: await resolveOrgId(api, options),
        bucket: cmdOpts.bucket,
        projectId: cmdOpts.project,
        description: cmdOpts.description,
        url: cmdOpts.url,
        orgRef: cmdOpts.org ? { id: cmdOpts.org, name: cmdOpts.org } : undefined,
        orgRole: cmdOpts.role,
        email: cmdOpts.email,
        conversationId: cmdOpts.conversationId,
      };

      const previewItem = buildCreateItemJsonLd(payload);
      throwIfInvalid(validateCreateItem(previewItem), "Create payload failed validation");

      const shouldApply = Boolean(cmdOpts.apply);
      if (!shouldApply) {
        const proposal = await addProposal("items.create", payload as Record<string, unknown>);
        if (options.json) {
          printSuccessJson({
            mode: "proposal",
            proposal: {
              id: proposal.id,
              operation: proposal.operation,
              preview: {
                ...payload,
                item: previewItem,
              },
            },
          });
        } else {
          printHuman(`Proposal created: ${proposal.id}`);
        }
        return;
      }

      if (!options.yes) {
        throw new Error("--apply requires --yes");
      }

      const applied = await executeProposal(api, {
        id: "inline",
        operation: "items.create",
        status: "pending",
        createdAt: new Date().toISOString(),
        payload: payload as Record<string, unknown>,
      });

      if (options.json) {
        printSuccessJson({ mode: "applied", result: applied });
      } else {
        printHuman("Item created");
      }
    });

  items
    .command("triage")
    .description("Move item to a target bucket (proposal by default)")
    .argument("<id>", "Item id, canonical id, or name")
    .requiredOption("--bucket <bucket>", "Target bucket")
    .option("--propose", "Store as proposal (default)")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function triageAction(this: Command, id: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        bucket: string;
        propose?: boolean;
        apply?: boolean;
      }>();

      if (cmdOpts.apply && cmdOpts.propose) {
        throw new Error("Use either --propose or --apply, not both");
      }

      const payload = {
        id,
        bucket: cmdOpts.bucket,
      };

      throwIfInvalid(
        validateTriageTransition({
          sourceBucket: "inbox",
          targetBucket: cmdOpts.bucket,
        }).filter((issue) => issue.code !== "TRIAGE_INBOX_TARGET_INVALID"),
        "Triage payload failed validation",
      );

      const shouldApply = Boolean(cmdOpts.apply);
      if (!shouldApply) {
        const proposal = await addProposal("items.triage", payload);
        if (options.json) {
          printSuccessJson({
            mode: "proposal",
            proposal: {
              id: proposal.id,
              operation: proposal.operation,
              preview: payload,
            },
          });
        } else {
          printHuman(`Proposal created: ${proposal.id}`);
        }
        return;
      }

      if (!options.yes) {
        throw new Error("--apply requires --yes");
      }

      const applied = await executeProposal(api, {
        id: "inline",
        operation: "items.triage",
        status: "pending",
        createdAt: new Date().toISOString(),
        payload,
      });

      if (options.json) {
        printSuccessJson({ mode: "applied", result: applied });
      } else {
        printHuman("Item updated");
      }
    });

}
