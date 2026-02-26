import { Command } from "commander";

import type { NotificationEventRecord } from "../client/api.js";
import { createApi, printHuman } from "./context.js";
import { printJson, printSuccessJson } from "./output.js";
import { executeProposal } from "./proposals-lib.js";
import { getProposal, loadProposals, updateProposal } from "./state.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isProposalEvent(event: NotificationEventRecord): boolean {
  return event.kind.startsWith("proposal_");
}

function sortByCreatedAt(
  events: NotificationEventRecord[],
): NotificationEventRecord[] {
  return [...events].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
}

export function registerProposalsCommands(program: Command): void {
  const proposals = program.command("proposals").description("Proposal lifecycle commands");

  proposals
    .command("list")
    .description("List local proposals")
    .option("--status <status>", "Filter by status (pending|applied)")
    .action(async function listAction(this: Command) {
      const { options } = await createApi(this);
      const cmdOpts = this.opts<{ status?: string }>();

      let entries = await loadProposals();
      if (cmdOpts.status) {
        const status = cmdOpts.status.toLowerCase();
        entries = entries.filter((entry) => entry.status === status);
      }

      if (options.json) {
        printSuccessJson({ proposals: entries });
        return;
      }

      for (const entry of entries) {
        printHuman(
          `${entry.id}\t${entry.operation}\t${entry.status}\t${entry.createdAt}${entry.appliedAt ? `\t${entry.appliedAt}` : ""}`,
        );
      }
    });

  proposals
    .command("apply")
    .description("Apply a pending proposal")
    .argument("<id>", "Proposal id")
    .option("--yes", "Confirm apply")
    .action(async function applyAction(this: Command, id: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ yes?: boolean }>();

      if (!(cmdOpts.yes || options.yes)) {
        throw new Error("proposals apply requires --yes");
      }

      const proposal = await getProposal(id);
      if (!proposal) {
        throw new Error(`Proposal not found: ${id}`);
      }
      if (proposal.status !== "pending") {
        throw new Error(`Proposal is not pending: ${id}`);
      }

      const result = await executeProposal(api, proposal);

      proposal.status = "applied";
      proposal.appliedAt = new Date().toISOString();
      await updateProposal(proposal);

      if (options.json) {
        printSuccessJson({
          mode: "applied",
          proposal: {
            id: proposal.id,
            operation: proposal.operation,
            status: proposal.status,
            applied_at: proposal.appliedAt,
          },
          result,
        });
        return;
      }

      printHuman(`Applied proposal ${proposal.id}`);
    });

  proposals
    .command("watch")
    .description("Watch proposal notifications")
    .option(
      "--cursor <iso>",
      "Start cursor for notification polling (ISO timestamp)",
    )
    .option(
      "--interval-seconds <seconds>",
      "Poll interval in seconds",
      "1",
    )
    .option("--urgent-only", "Only emit urgent proposal notifications")
    .option("--max-events <count>", "Stop after N emitted events")
    .action(async function watchAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        cursor?: string;
        intervalSeconds?: string;
        urgentOnly?: boolean;
        maxEvents?: string;
      }>();

      const intervalSeconds = Number.parseFloat(cmdOpts.intervalSeconds ?? "1");
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error("proposals watch requires a positive --interval-seconds");
      }

      const maxEvents = cmdOpts.maxEvents
        ? Number.parseInt(cmdOpts.maxEvents, 10)
        : undefined;
      if (maxEvents !== undefined && (!Number.isFinite(maxEvents) || maxEvents <= 0)) {
        throw new Error("proposals watch requires --max-events to be a positive integer");
      }

      let cursor = cmdOpts.cursor;
      let emitted = 0;
      while (true) {
        const events = sortByCreatedAt(
          await api.listNotifications({
            cursor,
            limit: 200,
          }),
        );

        for (const event of events) {
          cursor = event.created_at;
          if (!isProposalEvent(event)) {
            continue;
          }
          if (cmdOpts.urgentOnly && event.kind !== "proposal_urgent_created") {
            continue;
          }

          emitted += 1;
          if (options.json) {
            printJson(event);
          } else {
            printHuman(
              `[${event.created_at}] ${event.kind}\t${event.title}${event.url ? `\t${event.url}` : ""}`,
            );
          }

          if (maxEvents !== undefined && emitted >= maxEvents) {
            return;
          }
        }

        await sleep(Math.round(intervalSeconds * 1000));
      }
    });
}
