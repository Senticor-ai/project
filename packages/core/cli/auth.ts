import { Command } from "commander";

import { ApiError } from "../client/http.js";
import { createApi, printHuman } from "./context.js";
import { mapHttpStatusToExitCode, printSuccessJson } from "./output.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("register")
    .description("Create a local user account")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password")
    .option("--username <username>", "Username (defaults to email prefix)")
    .action(async function registerAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ email: string; password: string; username?: string }>();
      const user = await api.register(cmdOpts.email, cmdOpts.password, cmdOpts.username);

      if (options.json) {
        printSuccessJson({ user });
        return;
      }

      printHuman(`Registered ${user.email}`);
    });

  auth
    .command("login")
    .description("Log in with email + password and store session cookies")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password")
    .action(async function loginAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ email: string; password: string }>();
      const user = await api.login(cmdOpts.email, cmdOpts.password);

      if (options.json) {
        printSuccessJson({ user });
        return;
      }

      printHuman(`Logged in as ${user.email}`);
    });

  auth
    .command("status")
    .description("Show current auth/session status")
    .action(async function statusAction(this: Command) {
      const { api, options } = await createApi(this);
      try {
        const user = await api.me();
        if (options.json) {
          printSuccessJson({
            authenticated: true,
            host: options.host,
            orgId: options.orgId ?? user.default_org_id ?? null,
            user,
          });
          return;
        }

        printHuman(`Authenticated: ${user.email}`);
        printHuman(`Host: ${options.host}`);
        printHuman(`Org: ${options.orgId ?? user.default_org_id ?? "(default)"}`);
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
          throw error;
        }
        if (options.json) {
          printSuccessJson({
            authenticated: false,
            host: options.host,
            orgId: options.orgId ?? null,
          });
          return;
        }

        printHuman("Not authenticated");
        process.exitCode = mapHttpStatusToExitCode(error.status);
      }
    });

  auth
    .command("logout")
    .description("Revoke current session cookies")
    .action(async function logoutAction(this: Command) {
      const { api, options } = await createApi(this);
      try {
        await api.logout();
      } catch (error) {
        // If session already invalid, clear local state anyway.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await api.http.clearSession();
        } else {
          throw error;
        }
      }

      if (options.json) {
        printSuccessJson({ ok: true });
        return;
      }

      printHuman("Logged out");
    });
}
