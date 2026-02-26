import { Command } from "commander";

import type { ItemRecord, ProjectActionRecord, ProjectActionUpdatePayload } from "../client/api.js";
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

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseJsonObject(value: string, optionName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${optionName} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${optionName}: ${message}`);
  }
}

function parseOptionalInteger(value: string | undefined, optionName: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${optionName} must be an integer`);
  }
  return parsed;
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function requireApply(
  options: {
    apply?: boolean;
  },
  global: {
    yes: boolean;
  },
  commandName: string,
): void {
  if (!options.apply) {
    throw new Error(`${commandName} is write-only and requires --apply --yes`);
  }
  if (!global.yes) {
    throw new Error("--apply requires --yes");
  }
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

function formatProjectAction(action: ProjectActionRecord): Record<string, unknown> {
  return {
    id: action.id,
    canonical_id: action.canonical_id,
    project_id: action.project_id,
    name: action.name,
    description: action.description,
    action_status: action.action_status,
    owner_user_id: action.owner_user_id,
    owner_text: action.owner_text,
    due_at: action.due_at,
    tags: action.tags,
    object_ref: action.object_ref,
    attributes: action.attributes,
    created_at: action.created_at,
    updated_at: action.updated_at,
    last_event_id: action.last_event_id,
    comment_count: action.comment_count,
  };
}

function formatActionProjection(
  action: ProjectActionRecord,
): {
  projection: Record<string, unknown>;
  action: Record<string, unknown>;
  last_event_id: number | null;
  updated_at: string;
} {
  const projection = formatProjectAction(action);
  return {
    projection,
    action: projection,
    last_event_id: action.last_event_id,
    updated_at: action.updated_at,
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
    .option("--members", "Include project collaborators")
    .option("--workflow", "Include workflow definition")
    .action(async function getAction(this: Command, id: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        items?: boolean;
        members?: boolean;
        workflow?: boolean;
      }>();

      const project = await resolveProject(api, id);
      const data: Record<string, unknown> = {
        project: formatProject(project),
      };

      if (cmdOpts.items) {
        data.items = await api.listProjectItems(project.canonical_id);
      }
      if (cmdOpts.members) {
        data.members = await api.listProjectMembers(project.canonical_id);
      }
      if (cmdOpts.workflow) {
        data.workflow = await api.getProjectWorkflow(project.canonical_id);
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

  const members = projects.command("members").description("Project collaborator commands");

  members
    .command("list")
    .description("List collaborators for a project")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .action(async function membersListAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ project: string }>();
      const payload = await api.listProjectMembers(cmdOpts.project);
      if (options.json) {
        printSuccessJson({ members: payload });
      } else {
        printHuman(JSON.stringify(payload, null, 2));
      }
    });

  members
    .command("add")
    .description("Add a collaborator (registered user email)")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--email <email>", "User email")
    .option("--role <role>", "Collaborator role", "member")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function membersAddAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        email: string;
        role: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects members add");
      const created = await api.addProjectMember(cmdOpts.project, {
        email: cmdOpts.email,
        role: cmdOpts.role,
      });
      if (options.json) {
        printSuccessJson({ mode: "applied", member: created });
      } else {
        printHuman(JSON.stringify(created, null, 2));
      }
    });

  members
    .command("remove")
    .description("Remove a collaborator from a project")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--user <id>", "Target user id")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function membersRemoveAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        user: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects members remove");
      const removed = await api.removeProjectMember(cmdOpts.project, cmdOpts.user);
      if (options.json) {
        printSuccessJson({ mode: "applied", result: removed });
      } else {
        printHuman(JSON.stringify(removed, null, 2));
      }
    });

  const actions = projects.command("actions").description("Project action collaboration commands");

  actions
    .command("list")
    .description("List actions in a project")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .option("--status <status>", "Filter by action status (repeatable)", collectValues, [])
    .option("--tag <tag>", "Filter by tag")
    .option("--assignee <userId>", "Filter by owner user id")
    .option("--due-before <iso>", "Filter by due_at <= ISO timestamp")
    .option("--due-after <iso>", "Filter by due_at >= ISO timestamp")
    .option("--limit <n>", "Return first n actions")
    .action(async function actionsListAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        status: string[];
        tag?: string;
        assignee?: string;
        dueBefore?: string;
        dueAfter?: string;
        limit?: string;
      }>();
      const actionsList = await api.listProjectActions(cmdOpts.project, {
        status: cmdOpts.status,
        tag: cmdOpts.tag,
        ownerUserId: cmdOpts.assignee,
        dueBefore: cmdOpts.dueBefore,
        dueAfter: cmdOpts.dueAfter,
      });
      const limit = parseOptionalInteger(cmdOpts.limit, "--limit");
      const sliced = limit && limit > 0 ? actionsList.slice(0, limit) : actionsList;
      const payload = sliced.map(formatProjectAction);
      if (options.json) {
        printSuccessJson({ actions: payload });
      } else {
        printHuman(JSON.stringify(payload, null, 2));
      }
    });

  actions
    .command("get")
    .description("Get action detail")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .option("--comments", "Include comments in output")
    .option("--history", "Include transition/revision history")
    .action(async function actionsGetAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        action: string;
        comments?: boolean;
        history?: boolean;
      }>();
      const detail = await api.getProjectAction(cmdOpts.project, cmdOpts.action);
      const payload: Record<string, unknown> = {
        action: formatProjectAction(detail),
        revisions: detail.revisions,
      };
      if (cmdOpts.comments) {
        payload.comments = detail.comments;
      }
      if (cmdOpts.history) {
        payload.history = await api.getProjectActionHistory(cmdOpts.project, cmdOpts.action);
      }
      if (options.json) {
        printSuccessJson(payload);
      } else {
        printHuman(JSON.stringify(payload, null, 2));
      }
    });

  actions
    .command("history")
    .description("Get transition and revision history for an action")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .action(async function actionsHistoryAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ project: string; action: string }>();
      const payload = await api.getProjectActionHistory(cmdOpts.project, cmdOpts.action);
      if (options.json) {
        printSuccessJson(payload);
      } else {
        printHuman(JSON.stringify(payload, null, 2));
      }
    });

  actions
    .command("create")
    .description("Create a project action")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--name <name>", "Action title")
    .option("--description <text>", "Action description")
    .option("--status <status>", "Initial action status")
    .option("--due <iso>", "Due timestamp (ISO-8601)")
    .option("--assignee-user <id>", "Owner user id")
    .option("--assignee-text <text>", "Fallback owner text")
    .option("--tag <tag>", "Attach tag (repeatable)", collectValues, [])
    .option("--object-ref <id>", "Linked object canonical id")
    .option("--object-ref-json <json>", "Linked object JSON")
    .option("--correlation-id <id>", "Correlation id for tracing")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function actionsCreateAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        name: string;
        description?: string;
        status?: string;
        due?: string;
        assigneeUser?: string;
        assigneeText?: string;
        tag: string[];
        objectRef?: string;
        objectRefJson?: string;
        correlationId?: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects actions create");

      let objectRef: Record<string, unknown> | undefined;
      if (cmdOpts.objectRefJson) {
        objectRef = parseJsonObject(cmdOpts.objectRefJson, "--object-ref-json");
      } else if (cmdOpts.objectRef) {
        objectRef = { "@id": cmdOpts.objectRef };
      }

      const created = await api.createProjectAction(cmdOpts.project, {
        name: cmdOpts.name,
        description: cmdOpts.description,
        action_status: cmdOpts.status,
        due_at: cmdOpts.due,
        owner_user_id: cmdOpts.assigneeUser,
        owner_text: cmdOpts.assigneeText,
        tags: normalizeTags(cmdOpts.tag),
        object_ref: objectRef,
        correlation_id: cmdOpts.correlationId,
      });

      if (options.json) {
        printSuccessJson({
          mode: "applied",
          ...formatActionProjection(created),
        });
      } else {
        printHuman(JSON.stringify(formatProjectAction(created), null, 2));
      }
    });

  actions
    .command("update")
    .description("Update a project action")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .option("--name <name>", "Action title")
    .option("--description <text>", "Action description")
    .option("--due <iso>", "Due timestamp (ISO-8601)")
    .option("--assignee-user <id>", "Owner user id")
    .option("--assignee-text <text>", "Fallback owner text")
    .option("--tag-add <tag>", "Add tag (repeatable)", collectValues, [])
    .option("--tag-remove <tag>", "Remove tag (repeatable)", collectValues, [])
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function actionsUpdateAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        action: string;
        name?: string;
        description?: string;
        due?: string;
        assigneeUser?: string;
        assigneeText?: string;
        tagAdd: string[];
        tagRemove: string[];
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects actions update");

      const payload: ProjectActionUpdatePayload = {};
      if (cmdOpts.name !== undefined) {
        payload.name = cmdOpts.name;
      }
      if (cmdOpts.description !== undefined) {
        payload.description = cmdOpts.description;
      }
      if (cmdOpts.due !== undefined) {
        payload.due_at = cmdOpts.due;
      }
      if (cmdOpts.assigneeUser !== undefined) {
        payload.owner_user_id = cmdOpts.assigneeUser;
      }
      if (cmdOpts.assigneeText !== undefined) {
        payload.owner_text = cmdOpts.assigneeText;
      }

      const hasTagMutation = cmdOpts.tagAdd.length > 0 || cmdOpts.tagRemove.length > 0;
      if (hasTagMutation) {
        const current = await api.getProjectAction(cmdOpts.project, cmdOpts.action);
        const tagSet = new Set(current.tags);
        for (const tag of normalizeTags(cmdOpts.tagAdd)) {
          tagSet.add(tag);
        }
        for (const tag of normalizeTags(cmdOpts.tagRemove)) {
          tagSet.delete(tag);
        }
        payload.tags = Array.from(tagSet);
      }

      if (Object.keys(payload).length === 0) {
        throw new Error("No changes supplied. Provide at least one update option.");
      }

      const updated = await api.updateProjectAction(cmdOpts.project, cmdOpts.action, payload);
      if (options.json) {
        printSuccessJson({
          mode: "applied",
          ...formatActionProjection(updated),
        });
      } else {
        printHuman(JSON.stringify(formatProjectAction(updated), null, 2));
      }
    });

  actions
    .command("transition")
    .description("Transition action status with optimistic concurrency")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .requiredOption("--to <status>", "Target status")
    .option("--reason <text>", "Transition reason")
    .option("--expected-last-event <id>", "Expected last event id")
    .option("--correlation-id <id>", "Correlation id")
    .option("--payload <json>", "Optional payload JSON")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function actionsTransitionAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        action: string;
        to: string;
        reason?: string;
        expectedLastEvent?: string;
        correlationId?: string;
        payload?: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects actions transition");

      const transitioned = await api.transitionProjectAction(cmdOpts.project, cmdOpts.action, {
        to_status: cmdOpts.to,
        reason: cmdOpts.reason,
        expected_last_event_id: parseOptionalInteger(
          cmdOpts.expectedLastEvent,
          "--expected-last-event",
        ),
        correlation_id: cmdOpts.correlationId,
        payload: cmdOpts.payload ? parseJsonObject(cmdOpts.payload, "--payload") : undefined,
      });

      if (options.json) {
        printSuccessJson({
          mode: "applied",
          ...formatActionProjection(transitioned),
        });
      } else {
        printHuman(JSON.stringify(formatProjectAction(transitioned), null, 2));
      }
    });

  const comments = actions.command("comments").description("Project action comment commands");

  comments
    .command("add")
    .description("Add a comment to an action")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .requiredOption("--body <text>", "Comment body")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function commentsAddAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        action: string;
        body: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects actions comments add");
      const created = await api.addProjectActionComment(cmdOpts.project, cmdOpts.action, {
        body: cmdOpts.body,
      });
      const projected = await api.getProjectAction(cmdOpts.project, cmdOpts.action);
      if (options.json) {
        printSuccessJson({
          mode: "applied",
          comment: created,
          ...formatActionProjection(projected),
        });
      } else {
        printHuman(JSON.stringify(created, null, 2));
      }
    });

  comments
    .command("reply")
    .description("Reply to an existing comment thread")
    .requiredOption("--project <id>", "Project id (item id or canonical id)")
    .requiredOption("--action <id>", "Action id")
    .requiredOption("--parent <id>", "Parent comment id")
    .requiredOption("--body <text>", "Comment body")
    .option("--apply", "Apply immediately (requires --yes)")
    .action(async function commentsReplyAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        project: string;
        action: string;
        parent: string;
        body: string;
        apply?: boolean;
      }>();
      requireApply(cmdOpts, options, "projects actions comments reply");
      const created = await api.addProjectActionComment(cmdOpts.project, cmdOpts.action, {
        body: cmdOpts.body,
        parent_comment_id: cmdOpts.parent,
      });
      const projected = await api.getProjectAction(cmdOpts.project, cmdOpts.action);
      if (options.json) {
        printSuccessJson({
          mode: "applied",
          comment: created,
          ...formatActionProjection(projected),
        });
      } else {
        printHuman(JSON.stringify(created, null, 2));
      }
    });
}
