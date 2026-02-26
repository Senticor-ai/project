import { Command } from "commander";

import type { NotificationEventRecord } from "../client/api.js";
import { createApi, printHuman } from "./context.js";
import { printJson, printSuccessJson } from "./output.js";

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function parsePayloadJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload-json must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid --payload-json: ${error.message}`
        : "Invalid --payload-json",
    );
  }
}

async function streamNotifications(
  url: string,
  headers: Headers,
  onEvent: (event: NotificationEventRecord) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(
      `notifications stream failed (${response.status}): ${detail || response.statusText}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flushEvent = () => {
    const data = dataLines.join("\n").trim();
    if (!data || eventName !== "notification") {
      dataLines = [];
      eventName = "message";
      return;
    }
    try {
      const parsed = JSON.parse(data) as NotificationEventRecord;
      if (parsed && typeof parsed === "object" && typeof parsed.event_id === "string") {
        onEvent(parsed);
      }
    } catch {
      // Ignore malformed events and continue.
    }
    dataLines = [];
    eventName = "message";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      flushEvent();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) {
        flushEvent();
        continue;
      }
      if (line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
  }
}

export function registerNotificationsCommands(program: Command): void {
  const notifications = program
    .command("notifications")
    .description("Notification stream + send commands");

  notifications
    .command("send")
    .description("Send a notification through backend notification pipeline")
    .requiredOption("--title <title>", "Notification title")
    .requiredOption("--body <body>", "Notification body")
    .option("--kind <kind>", "Event kind", "manual")
    .option("--url <url>", "Click URL")
    .option("--payload-json <json>", "JSON object payload")
    .option("--target-user-id <userId>", "Override target user id")
    .action(async function sendAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        title: string;
        body: string;
        kind?: string;
        url?: string;
        payloadJson?: string;
        targetUserId?: string;
      }>();

      const result = await api.sendNotification({
        kind: cmdOpts.kind ?? "manual",
        title: cmdOpts.title,
        body: cmdOpts.body,
        url: cmdOpts.url ?? null,
        payload: parsePayloadJson(cmdOpts.payloadJson),
        target_user_id: cmdOpts.targetUserId,
      });

      if (options.json) {
        printSuccessJson({ event: result });
        return;
      }

      printHuman(`Sent ${result.kind} -> ${result.event_id}`);
    });

  notifications
    .command("watch")
    .description("Watch notification stream (SSE)")
    .option("--sse", "Use SSE stream endpoint", true)
    .option("--cursor <iso>", "Start cursor (ISO timestamp)")
    .option("--urgent-only", "Only emit urgent proposal notifications")
    .action(async function watchAction(this: Command) {
      const { api, options } = await createApi(this);
      const cmdOpts = this.opts<{
        sse?: boolean;
        cursor?: string;
        urgentOnly?: boolean;
      }>();

      if (!cmdOpts.sse) {
        throw new Error("notifications watch currently supports only --sse mode");
      }

      const searchParams = new URLSearchParams();
      if (cmdOpts.cursor) searchParams.set("cursor", cmdOpts.cursor);
      const query = searchParams.toString();
      const url = `${options.host}/notifications/stream${query ? `?${query}` : ""}`;

      const headers = new Headers();
      headers.set("Accept", "text/event-stream");
      if (options.orgId) {
        headers.set("X-Org-Id", options.orgId);
      }
      if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
      } else {
        const cookieHeader = buildCookieHeader(api.http.getSession().cookies);
        if (cookieHeader) {
          headers.set("Cookie", cookieHeader);
        }
      }

      await streamNotifications(url, headers, (event) => {
        if (cmdOpts.urgentOnly && event.kind !== "proposal_urgent_created") {
          return;
        }
        if (options.json) {
          printJson(event);
          return;
        }
        printHuman(
          `[${event.created_at}] ${event.kind}\t${event.title}${event.url ? `\t${event.url}` : ""}`,
        );
      });
    });
}
