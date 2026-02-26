import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright globalSetup — validates that all E2E prerequisites are met
 * (PostgreSQL, backend, agents, frontend) before running any tests.
 *
 * Runs scripts/e2e-preflight.sh in --quiet mode. On failure, throws a
 * clear error with actionable fix instructions instead of letting tests
 * time out with opaque connection errors.
 */
export default function globalSetup() {
  const script = path.resolve(__dirname, "../../scripts/e2e-preflight.sh");
  try {
    execSync(`bash "${script}" --quiet`, {
      stdio: "pipe",
      timeout: 15_000,
    });
  } catch (err: unknown) {
    const stdout =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: Buffer }).stderr)
        : "";
    const output = [stdout, stderr].filter(Boolean).join("\n");

    throw new Error(
      `E2E preflight failed. Fix the issues below before running tests:\n\n${output}\n` +
        `Run 'bash scripts/e2e-preflight.sh' for full details, or start the stack with 'bash scripts/e2e-stack.sh --no-test'.`,
    );
  }
}
