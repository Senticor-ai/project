import { Command } from "commander";

import type { CalendarEventRecord } from "../client/api.js";
import { createApi, printHuman } from "./context.js";
import { printSuccessJson } from "./output.js";

const VALID_RSVP_STATUSES = ["accepted", "tentative", "declined"] as const;

function formatEventLine(event: CalendarEventRecord): string {
  const parts = [
    event.canonical_id,
    event.start_date ?? "-",
    event.name,
    event.sync_state,
  ];
  if (event.rsvp_status) {
    parts.push(`rsvp:${event.rsvp_status}`);
  }
  if (event.provider) {
    parts.push(event.provider);
  }
  return parts.join("\t");
}

export function registerCalendarCommands(program: Command): void {
  const calendar = program
    .command("calendar")
    .description("Calendar event management");

  calendar
    .command("list")
    .description("List calendar events")
    .option("--date-from <iso>", "Filter events starting from this date (ISO)")
    .option("--date-to <iso>", "Filter events ending before this date (ISO)")
    .option("--limit <n>", "Max events to return")
    .action(async function listAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        dateFrom?: string;
        dateTo?: string;
        limit?: string;
      }>();

      const params: Record<string, unknown> = {};
      if (cmdOpts.dateFrom) params.dateFrom = cmdOpts.dateFrom;
      if (cmdOpts.dateTo) params.dateTo = cmdOpts.dateTo;
      if (cmdOpts.limit) {
        const limit = Number.parseInt(cmdOpts.limit, 10);
        if (Number.isFinite(limit) && limit > 0) params.limit = limit;
      }

      const events = await api.listCalendarEvents(params);

      if (options.json) {
        printSuccessJson({ events });
        return;
      }

      if (events.length === 0) {
        printHuman("No calendar events found.");
        return;
      }

      for (const event of events) {
        printHuman(formatEventLine(event));
      }
      printHuman(`\n${events.length} event(s)`);
    });

  calendar
    .command("patch")
    .description(
      "Update calendar event fields (propagates to Google when bound)",
    )
    .argument("<canonicalId>", "Event canonical ID")
    .option("--name <name>", "New event name")
    .option("--description <text>", "New description")
    .option("--start-date <iso>", "New start date (ISO)")
    .option("--end-date <iso>", "New end date (ISO)")
    .action(async function patchAction(this: Command, canonicalId: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        name?: string;
        description?: string;
        startDate?: string;
        endDate?: string;
      }>();

      const payload: Record<string, string> = {};
      if (cmdOpts.name) payload.name = cmdOpts.name;
      if (cmdOpts.description) payload.description = cmdOpts.description;
      if (cmdOpts.startDate) payload.start_date = cmdOpts.startDate;
      if (cmdOpts.endDate) payload.end_date = cmdOpts.endDate;

      if (Object.keys(payload).length === 0) {
        throw new Error(
          "At least one update field required: --name, --description, --start-date, --end-date",
        );
      }

      const updated = await api.patchCalendarEvent(canonicalId, payload);

      if (options.json) {
        printSuccessJson({ event: updated });
        return;
      }

      printHuman(`Updated ${updated.canonical_id}: ${updated.name}`);
    });

  calendar
    .command("rsvp")
    .description("Set RSVP status for a calendar event (propagates to Google)")
    .argument("<canonicalId>", "Event canonical ID")
    .requiredOption(
      "--status <status>",
      "RSVP status: accepted, tentative, or declined",
    )
    .action(async function rsvpAction(this: Command, canonicalId: string) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{ status: string }>();

      if (
        !VALID_RSVP_STATUSES.includes(
          cmdOpts.status as (typeof VALID_RSVP_STATUSES)[number],
        )
      ) {
        throw new Error(
          `Invalid RSVP status "${cmdOpts.status}". Must be one of: ${VALID_RSVP_STATUSES.join(", ")}`,
        );
      }

      const result = await api.setCalendarEventRsvp(canonicalId, {
        status: cmdOpts.status as (typeof VALID_RSVP_STATUSES)[number],
      });

      if (options.json) {
        printSuccessJson({ event: result });
        return;
      }

      printHuman(
        `RSVP set to ${result.rsvp_status ?? cmdOpts.status} for ${result.canonical_id}`,
      );
    });

  calendar
    .command("delete")
    .description("Archive a calendar event (propagates to Google when bound)")
    .argument("<canonicalId>", "Event canonical ID")
    .action(async function deleteAction(this: Command, canonicalId: string) {
      const { api, options } = await createApi(this);

      if (!options.yes) {
        throw new Error("Deleting a calendar event requires --yes to confirm");
      }

      const result = await api.deleteCalendarEvent(canonicalId);

      if (options.json) {
        printSuccessJson(result);
        return;
      }

      printHuman(
        `Archived ${result.canonical_id} (provider: ${result.provider_action})`,
      );
    });
}
