/**
 * CLI integration tests — spawn real `tsx cli/index.ts` subprocess.
 *
 * These tests exercise the full client-side pipeline without a backend:
 *   CLI args → serializer → SHACL/CEL validation → copilot.v1 envelope
 *
 * Validation failures exit before any HTTP call, so no backend is required.
 * `items create --propose` writes proposals to local state (state.ts), also no HTTP.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TSX = path.resolve(ROOT, "node_modules/.bin/tsx");
const CLI = path.resolve(ROOT, "cli/index.ts");

type ErrorEnvelope = {
  schema_version: string;
  ok: false;
  error: { code: string; message: string; retryable: boolean; details?: Array<{ code: string }> };
};

type SuccessEnvelope = {
  schema_version: string;
  ok: true;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
};

type Envelope = ErrorEnvelope | SuccessEnvelope;

function runCli(
  args: string[],
  extraEnv?: Record<string, string>,
): { exitCode: number; stdout: string; stderr: string; envelope: Envelope | null } {
  const result = spawnSync(TSX, [CLI, ...args], {
    encoding: "utf-8",
    env: {
      ...process.env,
      COPILOT_HOST: "http://localhost:19999", // unreachable — ensures no accidental backend calls
      COPILOT_ORG_ID: "test-org-integration",
      ...extraEnv,
    },
    cwd: ROOT,
    timeout: 30_000,
  });

  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";
  let envelope: Envelope | null = null;
  if (stdout.trim()) {
    try {
      envelope = JSON.parse(stdout.trim()) as Envelope;
    } catch {
      // stdout is not JSON (human mode or commander error)
    }
  }
  return { exitCode, stdout, stderr: result.stderr ?? "", envelope };
}

async function runCliAsync(
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string; envelope: Envelope | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(TSX, [CLI, ...args], {
      env: {
        ...process.env,
        COPILOT_HOST: "http://localhost:19999",
        COPILOT_ORG_ID: "test-org-integration",
        ...extraEnv,
      },
      cwd: ROOT,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 30_000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const exitCode = timedOut ? 143 : (code ?? 1);
      let envelope: Envelope | null = null;
      if (stdout.trim()) {
        try {
          envelope = JSON.parse(stdout.trim()) as Envelope;
        } catch {
          // stdout is not JSON (human mode or commander error)
        }
      }
      resolve({ exitCode, stdout, stderr, envelope });
    });
  });
}

// ---------------------------------------------------------------------------
// Error envelope: validation failures caught before any HTTP call
// ---------------------------------------------------------------------------

describe("CLI integration — validation rejection → copilot.v1 error envelope", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), "copilot-integ-"));
  });

  it("rejects invalid Action bucket via SHACL + CEL → exit 4, VALIDATION_FAILED", () => {
    const { exitCode, envelope } = runCli(
      [
        "items",
        "create",
        "--type",
        "Action",
        "--name",
        "Steuer einreichen",
        "--bucket",
        "GARBAGE",
        "--propose",
        "--json",
      ],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(exitCode).toBe(4);
    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.code).toBe("VALIDATION_FAILED");
    expect((envelope as ErrorEnvelope).error.retryable).toBe(false);
    // details carry the per-field issues from SHACL/CEL
    expect(Array.isArray((envelope as ErrorEnvelope).error.details)).toBe(true);
    const details = (envelope as ErrorEnvelope).error.details!;
    expect(details.some((d) => d.code === "ACTION_BUCKET_INVALID")).toBe(true);
  });

  it("rejects invalid Person orgRole via SHACL → exit 4, PERSON_ORGROLE_INVALID in details", () => {
    const { exitCode, envelope } = runCli(
      [
        "items",
        "create",
        "--type",
        "Person",
        "--name",
        "Hans Müller",
        "--org",
        "beh-org-1",
        "--role",
        "UNGUELTIG",
        "--propose",
        "--json",
      ],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(exitCode).toBe(4);
    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.code).toBe("VALIDATION_FAILED");
    const details = (envelope as ErrorEnvelope).error.details!;
    expect(details.some((d) => d.code === "PERSON_ORGROLE_INVALID")).toBe(true);
  });

  it("rejects invalid triage target bucket via CEL bucket-enum rule → exit 4", () => {
    const { exitCode, envelope } = runCli(
      ["items", "triage", "some-item-id", "--bucket", "GARBAGE", "--propose", "--json"],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(exitCode).toBe(4);
    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.code).toBe("VALIDATION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Success envelope: valid --propose writes to local state, no backend needed
// ---------------------------------------------------------------------------

describe("CLI integration — valid propose → copilot.v1 success envelope", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), "copilot-integ-"));
  });

  it("valid Action create --propose returns proposal in copilot.v1 envelope", () => {
    const { exitCode, envelope } = runCli(
      [
        "items",
        "create",
        "--type",
        "Action",
        "--name",
        "Steuererklärung einreichen",
        "--bucket",
        "next",
        "--propose",
        "--json",
      ],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(exitCode).toBe(0);
    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(true);
    const data = (envelope as SuccessEnvelope).data;
    expect(data.mode).toBe("proposal");
    const proposal = data.proposal as { operation: string; id: string };
    expect(proposal.operation).toBe("items.create");
    expect(proposal.id).toMatch(/^prp_/);
  });

  it("valid triage --propose returns proposal in copilot.v1 envelope", () => {
    const { exitCode, envelope } = runCli(
      ["items", "triage", "some-item-id", "--bucket", "next", "--propose", "--json"],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(exitCode).toBe(0);
    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(true);
    const data = (envelope as SuccessEnvelope).data;
    expect(data.mode).toBe("proposal");
    const proposal = data.proposal as { operation: string };
    expect(proposal.operation).toBe("items.triage");
  });
});

// ---------------------------------------------------------------------------
// Envelope structure contract: every response always has the same shape
// ---------------------------------------------------------------------------

describe("CLI integration — copilot.v1 envelope structure contract", () => {
  it("success envelope always has schema_version, ok:true, data, meta", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "copilot-integ-"));
    const { envelope } = runCli(
      [
        "items",
        "create",
        "--type",
        "Action",
        "--name",
        "Test",
        "--bucket",
        "inbox",
        "--propose",
        "--json",
      ],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(true);
    expect((envelope as SuccessEnvelope).data).toBeDefined();
    expect((envelope as SuccessEnvelope).meta).toBeDefined();
  });

  it("error envelope always has schema_version, ok:false, error.code, error.message, error.retryable", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "copilot-integ-"));
    const { envelope } = runCli(
      [
        "items",
        "create",
        "--type",
        "Action",
        "--name",
        "Test",
        "--bucket",
        "INVALID",
        "--propose",
        "--json",
      ],
      { COPILOT_CONFIG_DIR: configDir },
    );

    expect(envelope?.schema_version).toBe("copilot.v1");
    expect(envelope?.ok).toBe(false);
    expect(typeof (envelope as ErrorEnvelope).error.code).toBe("string");
    expect(typeof (envelope as ErrorEnvelope).error.message).toBe("string");
    expect(typeof (envelope as ErrorEnvelope).error.retryable).toBe("boolean");
  });
});

describe("CLI integration — collaboration deterministic write contract", () => {
  it("projects actions create returns projection + last-event metadata", async () => {
    const server = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/projects/urn:app:project:p1/actions") {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "a1",
            canonical_id: "urn:app:action:a1",
            project_id: "urn:app:project:p1",
            name: "Ship board MVP",
            description: null,
            action_status: "PotentialActionStatus",
            owner_user_id: null,
            owner_text: null,
            due_at: null,
            tags: ["collaboration"],
            object_ref: null,
            attributes: {},
            created_at: "2026-02-26T10:00:00Z",
            updated_at: "2026-02-26T10:00:00Z",
            last_event_id: 17,
            comment_count: 0,
          }),
        );
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Unable to bind mock server");
    }
    const host = `http://127.0.0.1:${address.port}`;

    const { exitCode, envelope } = await runCliAsync(
      [
        "projects",
        "actions",
        "create",
        "--project",
        "urn:app:project:p1",
        "--name",
        "Ship board MVP",
        "--tag",
        "collaboration",
        "--apply",
        "--yes",
        "--json",
      ],
      {
        COPILOT_HOST: host,
        COPILOT_TOKEN: "test-token",
      },
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(exitCode).toBe(0);
    expect(envelope?.ok).toBe(true);
    const data = (envelope as SuccessEnvelope).data as {
      mode: string;
      projection: { canonical_id: string; last_event_id: number | null };
      action: { canonical_id: string };
      last_event_id: number | null;
      updated_at: string;
    };
    expect(data.mode).toBe("applied");
    expect(data.projection.canonical_id).toBe("urn:app:action:a1");
    expect(data.action.canonical_id).toBe("urn:app:action:a1");
    expect(data.last_event_id).toBe(17);
    expect(data.updated_at).toBe("2026-02-26T10:00:00Z");
  });

  it("projects actions comments add returns comment + projection metadata", async () => {
    const server = createServer((req, res) => {
      if (
        req.method === "POST" &&
        req.url === "/projects/urn:app:project:p1/actions/a1/comments"
      ) {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "c1",
            action_id: "a1",
            author_id: "u1",
            parent_comment_id: null,
            body: "Started work",
            created_at: "2026-02-26T10:05:00Z",
            updated_at: "2026-02-26T10:05:00Z",
          }),
        );
        return;
      }
      if (req.method === "GET" && req.url === "/projects/urn:app:project:p1/actions/a1") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "a1",
            canonical_id: "urn:app:action:a1",
            project_id: "urn:app:project:p1",
            name: "Ship board MVP",
            description: null,
            action_status: "ActiveActionStatus",
            owner_user_id: null,
            owner_text: null,
            due_at: null,
            tags: ["collaboration"],
            object_ref: null,
            attributes: {},
            created_at: "2026-02-26T10:00:00Z",
            updated_at: "2026-02-26T10:05:00Z",
            last_event_id: 19,
            comment_count: 1,
            comments: [],
            revisions: [],
          }),
        );
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Unable to bind mock server");
    }
    const host = `http://127.0.0.1:${address.port}`;

    const { exitCode, envelope } = await runCliAsync(
      [
        "projects",
        "actions",
        "comments",
        "add",
        "--project",
        "urn:app:project:p1",
        "--action",
        "a1",
        "--body",
        "Started work",
        "--apply",
        "--yes",
        "--json",
      ],
      {
        COPILOT_HOST: host,
        COPILOT_TOKEN: "test-token",
      },
    );

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(exitCode).toBe(0);
    expect(envelope?.ok).toBe(true);
    const data = (envelope as SuccessEnvelope).data as {
      mode: string;
      comment: { id: string };
      projection: { canonical_id: string; comment_count: number };
      last_event_id: number | null;
    };
    expect(data.mode).toBe("applied");
    expect(data.comment.id).toBe("c1");
    expect(data.projection.canonical_id).toBe("urn:app:action:a1");
    expect(data.projection.comment_count).toBe(1);
    expect(data.last_event_id).toBe(19);
  });

  it("collaboration writes require --apply and produce structured error envelope", () => {
    const { exitCode, envelope } = runCli([
      "projects",
      "actions",
      "create",
      "--project",
      "urn:app:project:p1",
      "--name",
      "Missing apply",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.code).toBe("BAD_REQUEST");
    expect((envelope as ErrorEnvelope).error.message).toContain("--apply --yes");
  });
});
