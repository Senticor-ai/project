import { Command } from "commander";

import { createApi, printHuman } from "./context.js";
import { printSuccessJson } from "./output.js";
import { executeProposal } from "./proposals-lib.js";
import { getProposal, loadProposals, updateProposal } from "./state.js";

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
}
