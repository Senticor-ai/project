import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

import { registerCalendarCommands } from "./calendar.js";

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

// Use vi.hoisted so mockApi is available when vi.mock factory runs
const { mockApi, mockCreateApi } = vi.hoisted(() => {
  const mockApi = {
    listCalendarEvents: vi.fn(),
    patchCalendarEvent: vi.fn(),
    setCalendarEventRsvp: vi.fn(),
    deleteCalendarEvent: vi.fn(),
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
  registerCalendarCommands(program);
  return program;
}

describe("CLI calendar commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApi.mockResolvedValue({
      api: mockApi,
      options: { json: false, host: "http://localhost:8000", yes: false },
    });
  });

  describe("calendar list", () => {
    it("lists calendar events in human format", async () => {
      mockApi.listCalendarEvents.mockResolvedValue([
        {
          item_id: "item-1",
          canonical_id: "cal-1",
          name: "Team standup",
          description: null,
          start_date: "2026-02-26T09:00:00Z",
          end_date: "2026-02-26T09:30:00Z",
          source: "google_calendar",
          provider: "google_calendar",
          calendar_id: "primary",
          event_id: "evt-goog-1",
          access_role: "owner",
          writable: true,
          rsvp_status: "accepted",
          sync_state: "Synced",
          updated_at: "2026-02-26T08:00:00Z",
        },
        {
          item_id: "item-2",
          canonical_id: "cal-2",
          name: "Lunch",
          description: "With colleagues",
          start_date: "2026-02-26T12:00:00Z",
          end_date: null,
          source: "manual",
          provider: null,
          calendar_id: null,
          event_id: null,
          access_role: null,
          writable: true,
          rsvp_status: null,
          sync_state: "Local only",
          updated_at: "2026-02-26T10:00:00Z",
        },
      ]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync(["node", "test", "calendar", "list"]);
        expect(mockApi.listCalendarEvents).toHaveBeenCalledWith({});
        expect(stdout.lines.some((l) => l.includes("Team standup"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("Lunch"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("passes date-from and date-to params", async () => {
      mockApi.listCalendarEvents.mockResolvedValue([]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "calendar",
          "list",
          "--date-from",
          "2026-03-01",
          "--date-to",
          "2026-03-31",
          "--limit",
          "100",
        ]);
        expect(mockApi.listCalendarEvents).toHaveBeenCalledWith({
          dateFrom: "2026-03-01",
          dateTo: "2026-03-31",
          limit: 100,
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

      mockApi.listCalendarEvents.mockResolvedValue([
        {
          item_id: "item-1",
          canonical_id: "cal-1",
          name: "Meeting",
          start_date: "2026-02-26T09:00:00Z",
          end_date: null,
          source: "manual",
          provider: null,
          writable: true,
          rsvp_status: null,
          sync_state: "Local only",
          updated_at: "2026-02-26T08:00:00Z",
        },
      ]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "calendar",
          "list",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.events).toHaveLength(1);
        expect(parsed.data.events[0].name).toBe("Meeting");
      } finally {
        stdout.restore();
      }
    });

    it("shows message when no events found", async () => {
      mockApi.listCalendarEvents.mockResolvedValue([]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync(["node", "test", "calendar", "list"]);
        expect(stdout.lines.some((l) => l.includes("No calendar events"))).toBe(
          true,
        );
      } finally {
        stdout.restore();
      }
    });
  });

  describe("calendar patch", () => {
    it("patches event with name and start-date", async () => {
      mockApi.patchCalendarEvent.mockResolvedValue({
        item_id: "item-1",
        canonical_id: "cal-1",
        name: "Updated meeting",
        start_date: "2026-02-27T10:00:00Z",
        end_date: null,
        source: "manual",
        provider: null,
        writable: true,
        rsvp_status: null,
        sync_state: "Local only",
        updated_at: "2026-02-26T12:00:00Z",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "calendar",
          "patch",
          "cal-1",
          "--name",
          "Updated meeting",
          "--start-date",
          "2026-02-27T10:00:00Z",
        ]);
        expect(mockApi.patchCalendarEvent).toHaveBeenCalledWith("cal-1", {
          name: "Updated meeting",
          start_date: "2026-02-27T10:00:00Z",
        });
        expect(stdout.lines.some((l) => l.includes("Updated"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("requires at least one update field", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync(["node", "test", "calendar", "patch", "cal-1"]),
      ).rejects.toThrow();
    });
  });

  describe("calendar rsvp", () => {
    it("sets RSVP status", async () => {
      mockApi.setCalendarEventRsvp.mockResolvedValue({
        item_id: "item-1",
        canonical_id: "cal-1",
        name: "Meeting",
        rsvp_status: "accepted",
        sync_state: "Synced",
        updated_at: "2026-02-26T12:00:00Z",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "calendar",
          "rsvp",
          "cal-1",
          "--status",
          "accepted",
        ]);
        expect(mockApi.setCalendarEventRsvp).toHaveBeenCalledWith("cal-1", {
          status: "accepted",
        });
        expect(stdout.lines.some((l) => l.includes("accepted"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("rejects invalid RSVP status", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "calendar",
          "rsvp",
          "cal-1",
          "--status",
          "maybe",
        ]),
      ).rejects.toThrow();
    });
  });

  describe("calendar delete", () => {
    it("archives a calendar event", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: false, host: "http://localhost:8000", yes: true },
      });
      mockApi.deleteCalendarEvent.mockResolvedValue({
        canonical_id: "cal-1",
        status: "deleted",
        provider_action: "local_only",
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "calendar",
          "delete",
          "cal-1",
        ]);
        expect(mockApi.deleteCalendarEvent).toHaveBeenCalledWith("cal-1");
        expect(stdout.lines.some((l) => l.includes("cal-1"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("requires --yes for delete", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync(["node", "test", "calendar", "delete", "cal-1"]),
      ).rejects.toThrow("--yes");
    });
  });

  describe("help text", () => {
    it("shows calendar subcommands in help", () => {
      const program = buildProgram();
      const calendarCmd = program.commands.find((c) => c.name() === "calendar");
      expect(calendarCmd).toBeDefined();
      expect(calendarCmd!.description()).toBe("Calendar event management");

      const subcommands = calendarCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain("list");
      expect(subcommands).toContain("patch");
      expect(subcommands).toContain("rsvp");
      expect(subcommands).toContain("delete");
    });
  });
});
