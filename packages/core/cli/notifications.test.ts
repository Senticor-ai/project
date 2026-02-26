import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

import { registerNotificationsCommands } from "./notifications.js";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((...args: Parameters<typeof process.stdout.write>) => {
      const [chunk] = args;
      if (typeof chunk === "string") {
        lines.push(chunk);
      }
      return true;
    });
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}

const { mockApi, mockCreateApi } = vi.hoisted(() => {
  const mockApi = {
    sendNotification: vi.fn(),
    listNotifications: vi.fn(),
    http: {
      getSession: vi.fn().mockReturnValue({ cookies: { sid: "test-cookie" } }),
    },
  };
  const mockCreateApi = vi.fn().mockResolvedValue({
    api: mockApi,
    options: { json: false, host: "http://localhost:8000", yes: false },
  });
  return { mockApi, mockCreateApi };
});

vi.mock("./context.js", () => ({
  createApi: mockCreateApi,
  printHuman: (value: string) => {
    process.stdout.write(`${value}\n`);
  },
  getGlobalOptions: vi.fn(),
  resolveOrgId: vi.fn(),
}));

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  program
    .option("--host <url>", "Backend host", "http://localhost:8000")
    .option("--json", "JSON output")
    .option("--non-interactive", "Disable prompts")
    .option("--yes", "Auto-confirm")
    .option("--no-color", "No color");
  registerNotificationsCommands(program);
  return program;
}

describe("CLI notifications commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApi.mockResolvedValue({
      api: mockApi,
      options: { json: false, host: "http://localhost:8000", yes: false },
    });
  });

  describe("notifications send", () => {
    it("sends a notification with required fields", async () => {
      mockApi.sendNotification.mockResolvedValue({
        event_id: "evt-1",
        kind: "manual",
        title: "Test alert",
        body: "Something happened",
        url: null,
        payload: {},
        created_at: "2026-02-26T10:00:00Z",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--title",
          "Test alert",
          "--body",
          "Something happened",
        ]);
        expect(mockApi.sendNotification).toHaveBeenCalledWith({
          kind: "manual",
          title: "Test alert",
          body: "Something happened",
          url: null,
          payload: {},
          target_user_id: undefined,
        });
        expect(stdout.lines.some((l) => l.includes("Sent"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("evt-1"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("sends a notification with all optional fields", async () => {
      mockApi.sendNotification.mockResolvedValue({
        event_id: "evt-2",
        kind: "proposal_created",
        title: "New proposal",
        body: "Review it",
        url: "https://example.com/proposal/1",
        payload: { foo: "bar" },
        created_at: "2026-02-26T10:00:00Z",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--title",
          "New proposal",
          "--body",
          "Review it",
          "--kind",
          "proposal_created",
          "--url",
          "https://example.com/proposal/1",
          "--payload-json",
          '{"foo":"bar"}',
          "--target-user-id",
          "user-42",
        ]);
        expect(mockApi.sendNotification).toHaveBeenCalledWith({
          kind: "proposal_created",
          title: "New proposal",
          body: "Review it",
          url: "https://example.com/proposal/1",
          payload: { foo: "bar" },
          target_user_id: "user-42",
        });
      } finally {
        stdout.restore();
      }
    });

    it("outputs JSON when --json is set", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: true, host: "http://localhost:8000", yes: false },
      });
      mockApi.sendNotification.mockResolvedValue({
        event_id: "evt-3",
        kind: "manual",
        title: "JSON test",
        body: "body",
        url: null,
        payload: {},
        created_at: "2026-02-26T10:00:00Z",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "notifications",
          "send",
          "--title",
          "JSON test",
          "--body",
          "body",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.event.event_id).toBe("evt-3");
      } finally {
        stdout.restore();
      }
    });

    it("fails when --title is missing", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--body",
          "only body",
        ]),
      ).rejects.toThrow();
    });

    it("fails when --body is missing", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--title",
          "only title",
        ]),
      ).rejects.toThrow();
    });

    it("rejects invalid --payload-json", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--title",
          "test",
          "--body",
          "test",
          "--payload-json",
          "not json",
        ]),
      ).rejects.toThrow("Invalid --payload-json");
    });

    it("rejects array --payload-json", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "notifications",
          "send",
          "--title",
          "test",
          "--body",
          "test",
          "--payload-json",
          "[1,2,3]",
        ]),
      ).rejects.toThrow("payload-json must be a JSON object");
    });
  });

  describe("notifications watch", () => {
    function buildSSEStream(events: Array<{ event?: string; data: string }>): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const lines: string[] = [];
      for (const evt of events) {
        if (evt.event) {
          lines.push(`event: ${evt.event}`);
        }
        lines.push(`data: ${evt.data}`);
        lines.push(""); // blank line = event boundary
      }
      const raw = lines.join("\n") + "\n";
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(raw));
          controller.close();
        },
      });
    }

    it("streams notification events in human format", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([
          {
            event: "notification",
            data: JSON.stringify({
              event_id: "evt-10",
              kind: "proposal_created",
              title: "New item",
              body: "Body text",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            }),
          },
        ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "watch",
        ]);
        expect(mockFetch).toHaveBeenCalledOnce();
        expect(stdout.lines.some((l) => l.includes("proposal_created"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("New item"))).toBe(true);
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("filters with --urgent-only", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([
          {
            event: "notification",
            data: JSON.stringify({
              event_id: "evt-20",
              kind: "proposal_created",
              title: "Normal",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            }),
          },
          {
            event: "notification",
            data: JSON.stringify({
              event_id: "evt-21",
              kind: "proposal_urgent_created",
              title: "Urgent!",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:01:00Z",
            }),
          },
        ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "watch",
          "--urgent-only",
        ]);
        expect(stdout.lines.some((l) => l.includes("Normal"))).toBe(false);
        expect(stdout.lines.some((l) => l.includes("Urgent!"))).toBe(true);
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("passes --cursor to stream URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "watch",
          "--cursor",
          "2026-02-25T00:00:00Z",
        ]);
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain("cursor=2026-02-25T00%3A00%3A00Z");
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("outputs JSON when --json is set", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: true, host: "http://localhost:8000", yes: false },
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([
          {
            event: "notification",
            data: JSON.stringify({
              event_id: "evt-30",
              kind: "proposal_created",
              title: "JSON event",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T14:00:00Z",
            }),
          },
        ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "notifications",
          "watch",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.event_id).toBe("evt-30");
        expect(parsed.kind).toBe("proposal_created");
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("skips non-notification events", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([
          {
            // no event: field → defaults to "message" which is skipped
            data: JSON.stringify({
              event_id: "evt-skip",
              kind: "heartbeat",
              title: "ping",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            }),
          },
        ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "watch",
        ]);
        expect(stdout.lines.some((l) => l.includes("ping"))).toBe(false);
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("handles malformed event data gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: buildSSEStream([
          {
            event: "notification",
            data: "not valid json",
          },
          {
            event: "notification",
            data: JSON.stringify({
              event_id: "evt-ok",
              kind: "manual",
              title: "Valid",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            }),
          },
        ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "notifications",
          "watch",
        ]);
        // malformed event was skipped, valid one was processed
        expect(stdout.lines.some((l) => l.includes("Valid"))).toBe(true);
      } finally {
        stdout.restore();
        vi.unstubAllGlobals();
      }
    });

    it("throws on non-200 response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: vi.fn().mockResolvedValue("Not authenticated"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const program = buildProgram();
      await expect(
        program.parseAsync(["node", "test", "notifications", "watch"]),
      ).rejects.toThrow("notifications stream failed (401)");

      vi.unstubAllGlobals();
    });
  });

  describe("help text", () => {
    it("shows notifications subcommands in help", () => {
      const program = buildProgram();
      const cmd = program.commands.find((c) => c.name() === "notifications");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toBe(
        "Notification stream + send commands",
      );

      const subcommands = cmd!.commands.map((c) => c.name());
      expect(subcommands).toContain("send");
      expect(subcommands).toContain("watch");
    });
  });
});
