/**
 * CLI integration tests — spawn real `tsx cli/index.ts` subprocess.
 *
 * These tests exercise the full client-side pipeline without a backend:
 *   CLI args → serializer → SHACL/CEL validation → copilot.v1 envelope
 *
 * Validation failures exit before any HTTP call, so no backend is required.
 * `items create --propose` writes proposals to local state (state.ts), also no HTTP.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Array<{ code: string }>;
  };
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
): {
  exitCode: number;
  stdout: string;
  stderr: string;
  envelope: Envelope | null;
} {
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
      [
        "items",
        "triage",
        "some-item-id",
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
      [
        "items",
        "triage",
        "some-item-id",
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

// ---------------------------------------------------------------------------
// Orgs docs: client-side validation (no backend needed)
// ---------------------------------------------------------------------------

describe("CLI integration — orgs docs validation", () => {
  it("orgs docs update rejects --doc log (must use append) → exit 2, error envelope", () => {
    const { exitCode, envelope } = runCli([
      "orgs",
      "docs",
      "update",
      "some-org",
      "--doc",
      "log",
      "--text",
      "should fail",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.message).toContain("append");
  });

  it("orgs docs append rejects --doc agent (must use update) → exit 2, error envelope", () => {
    const { exitCode, envelope } = runCli([
      "orgs",
      "docs",
      "append",
      "some-org",
      "--doc",
      "agent",
      "--text",
      "should fail",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.message).toContain("update");
  });

  it("orgs docs update requires --text → commander error", () => {
    const { exitCode, stderr } = runCli([
      "orgs",
      "docs",
      "update",
      "some-org",
      "--doc",
      "agent",
      "--json",
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("--text");
  });

  it("orgs docs append requires --text → commander error", () => {
    const { exitCode, stderr } = runCli([
      "orgs",
      "docs",
      "append",
      "some-org",
      "--doc",
      "log",
      "--json",
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("--text");
  });

  it("orgs docs update rejects invalid doc type → exit 2, error envelope", () => {
    const { exitCode, envelope } = runCli([
      "orgs",
      "docs",
      "update",
      "some-org",
      "--doc",
      "INVALID",
      "--text",
      "test",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(envelope?.ok).toBe(false);
    expect((envelope as ErrorEnvelope).error.message).toContain(
      "general, user, agent",
    );
  });
});
