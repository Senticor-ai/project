#!/usr/bin/env node

import { Command } from "commander";

import { ApiError } from "../client/http.js";
import { registerAuthCommands } from "./auth.js";
import { registerItemsCommands } from "./items.js";
import {
  errorCodeFromStatus,
  mapHttpStatusToExitCode,
  printErrorJson,
} from "./output.js";
import { registerOrgsCommands } from "./orgs.js";
import { registerProjectsCommands } from "./projects.js";
import { registerProposalsCommands } from "./proposals.js";
import { ValidationError } from "../validation/index.js";

function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

async function main(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("senticor-copilot")
    .description("Senticor Copilot CLI")
    .showHelpAfterError()
    .option(
      "--host <url>",
      "Backend host",
      process.env.COPILOT_HOST ?? "http://localhost:8000",
    )
    .option(
      "--org-id <id>",
      "Tenant org id (X-Org-Id header)",
      process.env.COPILOT_ORG_ID,
    )
    .option("--json", "Emit machine-readable JSON envelopes")
    .option("--non-interactive", "Disable prompts and interactive behavior")
    .option("--yes", "Auto-confirm destructive/apply actions")
    .option("--no-color", "Disable ANSI colors");

  registerAuthCommands(program);
  registerItemsCommands(program);
  registerProjectsCommands(program);
  registerOrgsCommands(program);
  registerProposalsCommands(program);

  await program.parseAsync(argv);
}

main(process.argv).catch((error) => {
  const json = wantsJson(process.argv);

  if (error instanceof ApiError) {
    const exitCode = mapHttpStatusToExitCode(error.status);
    if (json) {
      printErrorJson({
        status: error.status,
        message: error.message,
        details: error.details,
      });
    } else {
      process.stderr.write(
        `${errorCodeFromStatus(error.status)} (${error.status}): ${error.message}\n`,
      );
    }
    process.exit(exitCode);
  }

  if (error instanceof ValidationError) {
    if (json) {
      printErrorJson({
        status: 422,
        message: error.message,
        details: error.issues,
        code: "VALIDATION_FAILED",
      });
    } else {
      process.stderr.write(`VALIDATION_FAILED: ${error.message}\n`);
    }
    process.exit(4);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    printErrorJson({
      status: 400,
      message,
    });
  } else {
    process.stderr.write(`REQUEST_FAILED: ${message}\n`);
  }
  process.exit(2);
});
