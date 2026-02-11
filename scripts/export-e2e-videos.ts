#!/usr/bin/env node
/**
 * Export E2E test recordings as videos.
 *
 * Runs Playwright E2E tests with video recording enabled and collects
 * the resulting .webm files into exports/videos/ with readable names.
 *
 * Usage:
 *   # Start the E2E stack first (separate terminal):
 *   bash scripts/e2e-stack.sh --no-test
 *
 *   # Then run this script:
 *   node scripts/export-e2e-videos.ts
 *   node scripts/export-e2e-videos.ts --headed          # watch tests run
 *   node scripts/export-e2e-videos.ts --grep "Full Cycle" # record specific test
 *
 * Output:
 *   exports/videos/*.webm — one video per test
 */

import { readdir, copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const TEST_RESULTS = path.join(FRONTEND, "test-results");
const OUTPUT_DIR = path.join(ROOT, "exports/videos");

// ── CLI parsing ────────────────────────────────────────────────────

function parseArgs(): { pwArgs: string[]; help: boolean } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { pwArgs: [], help: true };
  }

  return { pwArgs: args, help: false };
}

function showHelp(): void {
  console.log(`
Usage: node scripts/export-e2e-videos.ts [playwright-args...]

Records E2E test runs as .webm videos in exports/videos/.

Prerequisites:
  The E2E stack must be running. Start it with:
    bash scripts/e2e-stack.sh --no-test

Options (forwarded to Playwright):
  --headed              Watch the tests run in a visible browser
  --grep "pattern"      Run only tests matching the pattern
  --grep-invert "pat"   Skip tests matching the pattern
  -h, --help            Show this help

Examples:
  node scripts/export-e2e-videos.ts                        # all tests
  node scripts/export-e2e-videos.ts --headed               # visible browser
  node scripts/export-e2e-videos.ts --grep "Full Cycle"    # single test
  node scripts/export-e2e-videos.ts --grep "capture|triage" # subset
`);
}

// ── Health checks ──────────────────────────────────────────────────

async function checkStack(): Promise<{ baseUrl: string }> {
  // Check E2E backend (port 8001) and frontend (port 5174) first,
  // then fall back to dev ports (8000 / 5173)
  const stacks = [
    { backend: "http://localhost:8001/health", frontend: "http://localhost:5174", label: "E2E stack" },
    { backend: "http://localhost:8000/health", frontend: "http://localhost:5173", label: "dev stack" },
  ];

  for (const stack of stacks) {
    try {
      const [beRes, feRes] = await Promise.all([
        fetch(stack.backend, { signal: AbortSignal.timeout(2000) }),
        fetch(stack.frontend, { signal: AbortSignal.timeout(2000) }),
      ]);
      if (beRes.ok && feRes.ok) {
        console.log(`[video] Using ${stack.label} (${stack.frontend})`);
        return { baseUrl: stack.frontend };
      }
    } catch {
      // not running
    }
  }

  throw new Error(
    "No running stack detected. Start the E2E stack first:\n" +
    "  bash scripts/e2e-stack.sh --no-test"
  );
}

// ── Collect videos ─────────────────────────────────────────────────

async function collectVideos(): Promise<number> {
  if (!existsSync(TEST_RESULTS)) {
    console.warn("[video] No test-results directory found.");
    return 0;
  }

  // Clean previous videos to avoid stale files from earlier runs
  if (existsSync(OUTPUT_DIR)) {
    await rm(OUTPUT_DIR, { recursive: true });
  }
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Playwright stores videos as test-results/<test-dir>/video.webm
  // Walk test-results to find all video.webm files
  const videos = await findVideos(TEST_RESULTS);
  let count = 0;

  // Track names per spec file to number duplicates
  const seenSpecs = new Map<string, number>();

  for (const videoPath of videos) {
    // Playwright dir format: "<spec-stem>-<Describe>-<hash>-<test-name>-chromium"
    // e.g. "inbox-capture-Inbox-Captur-182f2-Enter-and-shows-it-in-inbox-chromium"
    // We extract just the spec file stem (e.g. "inbox-capture") for a clean name.
    const dirName = path.basename(path.dirname(videoPath));
    const specStem = extractSpecStem(dirName);

    const idx = (seenSpecs.get(specStem) ?? 0) + 1;
    seenSpecs.set(specStem, idx);

    // If there are multiple tests per spec file, number them
    const suffix = idx > 1 || videos.filter((v) =>
      extractSpecStem(path.basename(path.dirname(v))) === specStem
    ).length > 1 ? `-${idx}` : "";

    const fileName = `${specStem}${suffix}.webm`;
    const destPath = path.join(OUTPUT_DIR, fileName);

    await copyFile(videoPath, destPath);
    console.log(`[video]   ${fileName}`);
    count++;
  }

  return count;
}

/**
 * Extract the spec file stem from a Playwright test-results directory name.
 * Directory format: "<spec-stem>-<Describe-Block>-<hash>-<test-title>-chromium"
 * We match the spec stem against known spec files for accuracy,
 * falling back to taking everything before the first uppercase word.
 */
const SPEC_STEMS = [
  "auth", "inbox-capture", "inbox-triage", "full-cycle",
  "action-management", "project-tree", "context-filter",
  "rapid-entry", "import-export", "nirvana-import", "email-triage",
];

function extractSpecStem(dirName: string): string {
  // Strip "-chromium" suffix
  const name = dirName.replace(/-chromium$/, "");
  // Match longest known spec stem
  for (const stem of SPEC_STEMS.sort((a, b) => b.length - a.length)) {
    if (name.startsWith(stem + "-") || name === stem) {
      return stem;
    }
  }
  // Fallback: take until first uppercase letter (describe block starts uppercase)
  const fallback = name.match(/^([a-z0-9-]+?)-[A-Z]/);
  return fallback ? fallback[1]! : name;
}

async function findVideos(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findVideos(fullPath));
    } else if (entry.name === "video.webm") {
      results.push(fullPath);
    }
  }

  return results;
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { pwArgs, help } = parseArgs();
  if (help) {
    showHelp();
    return;
  }

  // 1. Check that the stack is running
  const { baseUrl } = await checkStack();

  // 2. Clean previous test-results to avoid stale videos
  if (existsSync(TEST_RESULTS)) {
    await rm(TEST_RESULTS, { recursive: true });
  }

  // 3. Run Playwright with video recording
  console.log("[video] Running E2E tests with video recording...");
  const pwArgsStr = pwArgs.map((a) => `"${a}"`).join(" ");
  const cmd = [
    `E2E_BASE_URL="${baseUrl}"`,
    `RECORD_VIDEO=1`,
    `npx playwright test`,
    `--config e2e/playwright.config.ts`,
    pwArgsStr,
  ].filter(Boolean).join(" ");

  try {
    execSync(cmd, {
      cwd: FRONTEND,
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        RECORD_VIDEO: "1",
      },
    });
  } catch {
    // Tests may fail — we still want the videos
    console.warn("[video] Some tests failed, but videos are still collected.");
  }

  // 4. Collect videos
  console.log("[video] Collecting videos...");
  const count = await collectVideos();

  if (count === 0) {
    console.warn("[video] No videos found. Tests may not have run.");
  } else {
    console.log(`[video] ${count} video(s) saved to ${OUTPUT_DIR}`);
  }

  console.log("[video] Done.");
}

main().catch((err) => {
  console.error("[video] ERROR:", err);
  process.exit(1);
});
