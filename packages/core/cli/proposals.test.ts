import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

import { registerProposalsCommands } from "./proposals.js";

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

const {
  mockApi,
  mockCreateApi,
  mockLoadProposals,
  mockGetProposal,
  mockUpdateProposal,
  mockExecuteProposal,
} = vi.hoisted(() => {
  const mockApi = {
    listNotifications: vi.fn(),
  };
  const mockCreateApi = vi.fn().mockResolvedValue({
    api: mockApi,
    options: { json: false, host: "http://localhost:8000", yes: false },
  });
  const mockLoadProposals = vi.fn().mockResolvedValue([]);
  const mockGetProposal = vi.fn().mockResolvedValue(null);
  const mockUpdateProposal = vi.fn().mockResolvedValue(undefined);
  const mockExecuteProposal = vi.fn().mockResolvedValue({ operation: "items.create", created: {} });
  return {
    mockApi,
    mockCreateApi,
    mockLoadProposals,
    mockGetProposal,
    mockUpdateProposal,
    mockExecuteProposal,
  };
});

vi.mock("./context.js", () => ({
  createApi: mockCreateApi,
  printHuman: (value: string) => {
    process.stdout.write(`${value}\n`);
  },
  getGlobalOptions: vi.fn(),
  resolveOrgId: vi.fn(),
}));

vi.mock("./state.js", () => ({
  loadProposals: mockLoadProposals,
  getProposal: mockGetProposal,
  updateProposal: mockUpdateProposal,
  saveProposals: vi.fn(),
  addProposal: vi.fn(),
}));

vi.mock("./proposals-lib.js", () => ({
  executeProposal: mockExecuteProposal,
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
  registerProposalsCommands(program);
  return program;
}

describe("CLI proposals commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApi.mockResolvedValue({
      api: mockApi,
      options: { json: false, host: "http://localhost:8000", yes: false },
    });
  });

  describe("proposals list", () => {
    it("lists proposals in human format", async () => {
      mockLoadProposals.mockResolvedValue([
        {
          id: "prp-1",
          operation: "items.create",
          status: "pending",
          createdAt: "2026-02-26T10:00:00Z",
          payload: { name: "Test item" },
        },
        {
          id: "prp-2",
          operation: "items.triage",
          status: "applied",
          createdAt: "2026-02-26T09:00:00Z",
          appliedAt: "2026-02-26T09:30:00Z",
          payload: { id: "item-1", bucket: "action" },
        },
      ]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync(["node", "test", "proposals", "list"]);
        expect(stdout.lines.some((l) => l.includes("prp-1"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("items.create"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("prp-2"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("items.triage"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("outputs JSON when --json is set", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: true, host: "http://localhost:8000", yes: false },
      });
      mockLoadProposals.mockResolvedValue([
        {
          id: "prp-1",
          operation: "items.create",
          status: "pending",
          createdAt: "2026-02-26T10:00:00Z",
          payload: { name: "Test" },
        },
      ]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "proposals",
          "list",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.proposals).toHaveLength(1);
        expect(parsed.data.proposals[0].id).toBe("prp-1");
      } finally {
        stdout.restore();
      }
    });

    it("filters by --status", async () => {
      mockLoadProposals.mockResolvedValue([
        {
          id: "prp-1",
          operation: "items.create",
          status: "pending",
          createdAt: "2026-02-26T10:00:00Z",
          payload: {},
        },
        {
          id: "prp-2",
          operation: "items.triage",
          status: "applied",
          createdAt: "2026-02-26T09:00:00Z",
          payload: {},
        },
      ]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "list",
          "--status",
          "pending",
        ]);
        expect(stdout.lines.some((l) => l.includes("prp-1"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("prp-2"))).toBe(false);
      } finally {
        stdout.restore();
      }
    });

    it("shows nothing for empty list", async () => {
      mockLoadProposals.mockResolvedValue([]);

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync(["node", "test", "proposals", "list"]);
        // No printHuman calls when list is empty (loop body never runs)
        expect(
          stdout.lines.filter((l) => l.includes("prp-")).length,
        ).toBe(0);
      } finally {
        stdout.restore();
      }
    });
  });

  describe("proposals apply", () => {
    it("applies a pending proposal with --yes", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: false, host: "http://localhost:8000", yes: true },
      });
      const proposal = {
        id: "prp-apply-1",
        operation: "items.create",
        status: "pending",
        createdAt: "2026-02-26T10:00:00Z",
        payload: { type: "Action", name: "New task" },
      };
      mockGetProposal.mockResolvedValue(proposal);
      mockExecuteProposal.mockResolvedValue({
        operation: "items.create",
        created: { item_id: "item-new" },
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "apply",
          "prp-apply-1",
        ]);
        expect(mockGetProposal).toHaveBeenCalledWith("prp-apply-1");
        expect(mockExecuteProposal).toHaveBeenCalledWith(mockApi, proposal);
        expect(mockUpdateProposal).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "prp-apply-1",
            status: "applied",
          }),
        );
        expect(stdout.lines.some((l) => l.includes("Applied"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("outputs JSON on successful apply with --json", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: true, host: "http://localhost:8000", yes: true },
      });
      const proposal = {
        id: "prp-apply-json",
        operation: "items.create",
        status: "pending",
        createdAt: "2026-02-26T10:00:00Z",
        payload: { type: "Action", name: "Task" },
      };
      mockGetProposal.mockResolvedValue(proposal);
      mockExecuteProposal.mockResolvedValue({
        operation: "items.create",
        created: { item_id: "item-x" },
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "proposals",
          "apply",
          "prp-apply-json",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.mode).toBe("applied");
        expect(parsed.data.proposal.id).toBe("prp-apply-json");
        expect(parsed.data.proposal.status).toBe("applied");
      } finally {
        stdout.restore();
      }
    });

    it("rejects without --yes", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "proposals",
          "apply",
          "prp-no-yes",
        ]),
      ).rejects.toThrow("proposals apply requires --yes");
    });

    it("throws when proposal not found", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: false, host: "http://localhost:8000", yes: true },
      });
      mockGetProposal.mockResolvedValue(null);

      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "proposals",
          "apply",
          "prp-missing",
        ]),
      ).rejects.toThrow("Proposal not found: prp-missing");
    });

    it("throws when proposal is already applied", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: false, host: "http://localhost:8000", yes: true },
      });
      mockGetProposal.mockResolvedValue({
        id: "prp-already",
        operation: "items.create",
        status: "applied",
        createdAt: "2026-02-26T10:00:00Z",
        appliedAt: "2026-02-26T10:05:00Z",
        payload: {},
      });

      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "proposals",
          "apply",
          "prp-already",
        ]),
      ).rejects.toThrow("Proposal is not pending: prp-already");
    });
  });

  describe("proposals watch", () => {
    it("emits proposal events in human format", async () => {
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return [
            {
              event_id: "evt-w1",
              kind: "proposal_created",
              title: "New proposal",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            },
            {
              event_id: "evt-w2",
              kind: "system_info",
              title: "System info",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:01:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "watch",
          "--max-events",
          "1",
        ]);
        // Only proposal_created should be emitted, system_info is filtered
        expect(stdout.lines.some((l) => l.includes("proposal_created"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("System info"))).toBe(false);
      } finally {
        stdout.restore();
      }
    });

    it("passes cursor and advances it", async () => {
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async (params: { cursor?: string }) => {
        callCount += 1;
        if (callCount === 1) {
          expect(params.cursor).toBe("2026-02-25T00:00:00Z");
          return [
            {
              event_id: "evt-c1",
              kind: "proposal_urgent_created",
              title: "Urgent",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "watch",
          "--cursor",
          "2026-02-25T00:00:00Z",
          "--max-events",
          "1",
        ]);
        expect(stdout.lines.some((l) => l.includes("Urgent"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("filters with --urgent-only", async () => {
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return [
            {
              event_id: "evt-u1",
              kind: "proposal_created",
              title: "Normal proposal",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            },
            {
              event_id: "evt-u2",
              kind: "proposal_urgent_created",
              title: "Urgent proposal",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:01:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "watch",
          "--urgent-only",
          "--max-events",
          "1",
        ]);
        expect(stdout.lines.some((l) => l.includes("Normal proposal"))).toBe(false);
        expect(stdout.lines.some((l) => l.includes("Urgent proposal"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("stops after --max-events", async () => {
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return [
            {
              event_id: "evt-m1",
              kind: "proposal_created",
              title: "First",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            },
            {
              event_id: "evt-m2",
              kind: "proposal_updated",
              title: "Second",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:01:00Z",
            },
            {
              event_id: "evt-m3",
              kind: "proposal_created",
              title: "Third",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:02:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "watch",
          "--max-events",
          "2",
        ]);
        expect(stdout.lines.some((l) => l.includes("First"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("Second"))).toBe(true);
        expect(stdout.lines.some((l) => l.includes("Third"))).toBe(false);
      } finally {
        stdout.restore();
      }
    });

    it("skips non-proposal events", async () => {
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return [
            {
              event_id: "evt-s1",
              kind: "system_heartbeat",
              title: "Heartbeat",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:00:00Z",
            },
            {
              event_id: "evt-s2",
              kind: "proposal_created",
              title: "A proposal",
              body: "",
              url: null,
              payload: {},
              created_at: "2026-02-26T12:01:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "proposals",
          "watch",
          "--max-events",
          "1",
        ]);
        expect(stdout.lines.some((l) => l.includes("Heartbeat"))).toBe(false);
        expect(stdout.lines.some((l) => l.includes("A proposal"))).toBe(true);
      } finally {
        stdout.restore();
      }
    });

    it("outputs JSON when --json is set", async () => {
      mockCreateApi.mockResolvedValueOnce({
        api: mockApi,
        options: { json: true, host: "http://localhost:8000", yes: false },
      });
      let callCount = 0;
      mockApi.listNotifications.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return [
            {
              event_id: "evt-j1",
              kind: "proposal_created",
              title: "JSON event",
              body: "body",
              url: "https://example.com",
              payload: { key: "value" },
              created_at: "2026-02-26T12:00:00Z",
            },
          ];
        }
        return [];
      });

      const stdout = captureStdout();
      try {
        const program = buildProgram();
        await program.parseAsync([
          "node",
          "test",
          "--json",
          "proposals",
          "watch",
          "--max-events",
          "1",
        ]);
        const output = stdout.lines.join("");
        const parsed = JSON.parse(output);
        expect(parsed.event_id).toBe("evt-j1");
        expect(parsed.kind).toBe("proposal_created");
      } finally {
        stdout.restore();
      }
    });
  });

  describe("help text", () => {
    it("shows proposals subcommands in help", () => {
      const program = buildProgram();
      const cmd = program.commands.find((c) => c.name() === "proposals");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toBe("Proposal lifecycle commands");

      const subcommands = cmd!.commands.map((c) => c.name());
      expect(subcommands).toContain("list");
      expect(subcommands).toContain("apply");
      expect(subcommands).toContain("watch");
    });
  });
});
