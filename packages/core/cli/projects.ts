import { Command } from "commander";

import type { ItemRecord } from "../client/api.js";
import { buildCreateItemJsonLd, itemType, readAdditionalProperty } from "../serializers/jsonld.js";
import { throwIfInvalid, validateCreateItem } from "../validation/index.js";
import { createApi, printHuman, resolveOrgId } from "./context.js";
import { printSuccessJson } from "./output.js";
import { type CreateProposalPayload, executeProposal } from "./proposals-lib.js";
import { addProposal } from "./state.js";

function isProject(item: ItemRecord): boolean {
  return itemType(item.item) === "Project";
}

function projectName(item: ItemRecord): string {
  return typeof item.item.name === "string" ? item.item.name : "(unnamed project)";
}

function formatProject(item: ItemRecord): Record<string, unknown> {
  const desiredOutcome = readAdditionalProperty(item.item, "app:desiredOutcome");
  return {
    item_id: item.item_id,
    canonical_id: item.canonical_id,
    name: projectName(item),
    desired_outcome: typeof desiredOutcome === "string" ? desiredOutcome : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

async function resolveProject(api: Awaited<ReturnType<typeof createApi>>["api"], id: string) {
  const all = await api.listAllItems({ completed: "all" });
  const normalized = id.trim().toLowerCase();
  const project = all.find((item) => {
    if (!isProject(item)) return false;
    const jsonldId = typeof item.item["@id"] === "string" ? item.item["@id"] : "";
    return (
      item.item_id === id ||
      item.canonical_id === id ||
      jsonldId === id ||
      projectName(item).toLowerCase() === normalized
    );
  });

  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }

  return project;
}

export function registerProjectsCommands(program: Command): void {
  const projects = program.command("projects").description("Project-focused commands");

  projects
    .command("list")
    .description("List project items")
    .option("--limit <n>", "Max records", "100")
    .action(async function listAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ limit: string }>();
      const limit = Number.parseInt(cmdOpts.limit, 10);

      const all = await api.listAllItems({ completed: "all" });
      const records = all.filter(isProject);
      const sliced = Number.isFinite(limit) && limit > 0 ? records.slice(0, limit) : records;
      const formatted = sliced.map(formatProject);

      if (options.json) {
        printSuccessJson({ projects: formatted });
        return;
      }

      for (const record of formatted) {
        printHuman(`${record.item_id}\t${record.canonical_id}\t${record.name}`);
      }
    });

  projects
    .command("get")
    .description("Get a single project")
    .argument("<id>", "Item id, canonical id, or name")
    .option("--items", "Include project-linked items")
    .action(async function getAction(this: Command, id: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ items?: boolean }>();

      const project = await resolveProject(api, id);
      const data: Record<string, unknown> = {
        project: formatProject(project),
      };

      if (cmdOpts.items) {
        const projectItems = await api.listProjectItems(project.canonical_id);
        data.items = projectItems;
      }

      if (options.json) {
        printSuccessJson(data);
      } else {
        printHuman(JSON.stringify(data, null, 2));
      }
    });

  projects
    .command("create")
    .description("Create a project (proposal by default)")
    .requiredOption("--name <name>", "Project name")
    .option("--description <text>", "Desired outcome/description")
    .option("--conversation-id <id>", "Conversation id for app:captureSource")
    .option("--propose", "Store as proposal (default)")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function createAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        name: string;
        description?: string;
        conversationId?: string;
        propose?: boolean;
        apply?: boolean;
      }>();

      if (cmdOpts.apply && cmdOpts.propose) {
        throw new Error("Use either --propose or --apply, not both");
      }

      const payload: CreateProposalPayload = {
        type: "Project",
        name: cmdOpts.name,
        description: cmdOpts.description,
        conversationId: cmdOpts.conversationId,
        orgId: await resolveOrgId(api, options),
      };

      const previewItem = buildCreateItemJsonLd(payload);
      throwIfInvalid(validateCreateItem(previewItem), "Project payload failed validation");

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
        printHuman("Project created");
      }
    });
}
