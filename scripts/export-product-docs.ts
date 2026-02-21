#!/usr/bin/env node
/**
 * Export Storybook product documentation to Markdown + PDF.
 *
 * Usage:
 *   node scripts/export-product-docs.ts                  # full export
 *   node scripts/export-product-docs.ts --no-screenshots # skip Storybook capture
 *   node scripts/export-product-docs.ts --no-pdf         # markdown only
 *   node scripts/export-product-docs.ts --help
 *
 * Prerequisites:
 *   - pandoc (brew install pandoc)
 *   - playwright browsers (npx playwright install chromium)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const DOCS_DIR = path.join(FRONTEND, "src/docs/product");
const PANDOC = "/opt/homebrew/bin/pandoc";
const STORYBOOK_PORT = 6006;
const STORYBOOK_URL = `http://localhost:${STORYBOOK_PORT}`;

// ── Document ordering ──────────────────────────────────────────────

const DOC_ORDER = [
  "ProductVision.mdx",
  "Methodology.mdx",
  "FeatureMap.mdx",
  "SalesBattlecard.mdx",
  "EpicEditableTitle.mdx",
  "EpicExport.mdx",
  "EpicSchemaEnrichment.mdx",
  "EpicPwaReadiness.mdx",
  "EpicReleaseProcess.mdx",
  "EpicRenameToProcedere.mdx",
];

// ── Screenshot configuration ───────────────────────────────────────

interface ScreenshotEntry {
  id: string;
  name: string;
  label: string;
  afterDoc: string; // filename without extension
}

const SCREENSHOT_CONFIG: ScreenshotEntry[] = [
  {
    id: "work-connectedbucketview--default",
    name: "inbox-overview",
    label: "Inbox overview with items and bucket navigation",
    afterDoc: "ProductVision",
  },
  {
    id: "work-connectedbucketview--capture-inbox",
    name: "inbox-capture",
    label: "Capturing a new thought into the inbox",
    afterDoc: "Methodology",
  },
  {
    id: "work-actionrow--inbox-item-expanded",
    name: "action-row-triage",
    label: "Expanded inbox item with inline triage actions",
    afterDoc: "Methodology",
  },
  {
    id: "work-connectedbucketview--next-actions",
    name: "next-actions",
    label: "Next Actions bucket view",
    afterDoc: "Methodology",
  },
  {
    id: "work-connectedbucketview--inbox-with-email",
    name: "inbox-email",
    label: "Email items in the inbox",
    afterDoc: "FeatureMap",
  },
  {
    id: "work-actionlist--inbox-view",
    name: "action-list-inbox",
    label: "Inbox action list with item counts",
    afterDoc: "FeatureMap",
  },
  {
    id: "work-bucketview--projects-view",
    name: "projects-view",
    label: "Projects view with sequential actions",
    afterDoc: "FeatureMap",
  },
  {
    id: "work-filedropzone--with-content",
    name: "file-drop-zone",
    label: "File drop zone for document capture",
    afterDoc: "FeatureMap",
  },
  {
    id: "work-actionrow--focused",
    name: "action-focused",
    label: "Focused action with star priority",
    afterDoc: "SalesBattlecard",
  },
  {
    id: "screens-settings--default",
    name: "settings-screen",
    label: "Application settings screen",
    afterDoc: "EpicExport",
  },
];

// ── CLI parsing ────────────────────────────────────────────────────

interface Options {
  noScreenshots: boolean;
  noPdf: boolean;
  outputDir: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: node scripts/export-product-docs.ts [options]

Options:
  --no-screenshots    Skip Storybook screenshot capture (faster)
  --no-pdf            Generate Markdown only, skip PDF conversion
  --output <path>     Output directory (default: exports)
  -h, --help          Show this help
`);
    process.exit(0);
  }

  const outputIdx = args.indexOf("--output");
  const outputDir =
    outputIdx !== -1 && args[outputIdx + 1]
      ? args[outputIdx + 1]
      : "exports";

  return {
    noScreenshots: args.includes("--no-screenshots"),
    noPdf: args.includes("--no-pdf"),
    outputDir,
  };
}

// ── Phase 1: Read and strip MDX ────────────────────────────────────

function stripMdx(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.match(/^import\s+.*from\s+["']/))
    .filter((line) => !line.match(/^<Meta\s+/))
    .join("\n")
    .replace(/^\n+/, "");
}

function rewriteInternalLinks(md: string): string {
  // Convert Storybook internal links to plain text
  return md.replace(/\[([^\]]+)\]\(\?path=[^)]+\)/g, "**$1**");
}

interface DocSection {
  filename: string;
  key: string;
  content: string;
}

async function readDocs(): Promise<DocSection[]> {
  const sections: DocSection[] = [];
  for (const filename of DOC_ORDER) {
    const filepath = path.join(DOCS_DIR, filename);
    if (!existsSync(filepath)) {
      console.warn(`[export] Warning: ${filename} not found, skipping.`);
      continue;
    }
    const raw = await readFile(filepath, "utf-8");
    const clean = rewriteInternalLinks(stripMdx(raw));
    sections.push({
      filename,
      key: filename.replace(".mdx", ""),
      content: clean,
    });
  }
  return sections;
}

// ── Phase 2: Table of contents ─────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function generateToc(sections: DocSection[]): string {
  const lines: string[] = ["## Table of Contents\n"];
  for (const section of sections) {
    for (const line of section.content.split("\n")) {
      const match = line.match(/^(#{1,2})\s+(.+)/);
      if (match) {
        const level = match[1]!.length;
        const text = match[2]!;
        const indent = "  ".repeat(level - 1);
        lines.push(`${indent}- [${text}](#${slugify(text)})`);
      }
    }
  }
  return lines.join("\n");
}

// ── Phase 3: Storybook screenshots ─────────────────────────────────

let storybookProc: ChildProcess | null = null;

function cleanup(): void {
  if (storybookProc && !storybookProc.killed) {
    console.log("[export] Stopping Storybook...");
    storybookProc.kill("SIGTERM");
    storybookProc = null;
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(1);
});

async function isStorybookRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${STORYBOOK_URL}/iframe.html`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function startStorybook(): Promise<ChildProcess> {
  const proc = spawn("npx", ["storybook", "dev", "-p", String(STORYBOOK_PORT), "--no-open"], {
    cwd: FRONTEND,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Log Storybook stderr for debugging
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[storybook] ${text}`);
  });

  // Poll until ready
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${STORYBOOK_URL}/iframe.html`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        console.log("[export] Storybook is ready.");
        return proc;
      }
    } catch {
      // not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, 2000));
  }

  proc.kill("SIGTERM");
  throw new Error("Storybook did not become ready within 180s");
}

async function captureScreenshots(screenshotDir: string): Promise<void> {
  // playwright is a devDependency in frontend/, resolve from there
  const requireFromFrontend = createRequire(path.join(FRONTEND, "package.json"));
  const { chromium } = requireFromFrontend("playwright") as typeof import("playwright");

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  for (const entry of SCREENSHOT_CONFIG) {
    const page = await context.newPage();
    const url = `${STORYBOOK_URL}/iframe.html?id=${entry.id}&viewMode=story`;

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      // Wait for story root to render content
      await page.waitForSelector("#storybook-root > *", { timeout: 15_000 });
      // Let animations settle
      await page.waitForTimeout(1000);

      const storyRoot = page.locator("#storybook-root");
      await storyRoot.screenshot({
        path: path.join(screenshotDir, `${entry.name}.png`),
        animations: "disabled",
      });
      console.log(`[export]   ${entry.name}.png (${entry.id})`);
    } catch (err) {
      console.warn(
        `[export]   Warning: Failed to capture ${entry.name}: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

// ── Phase 4: Assemble markdown ─────────────────────────────────────

function assembleMarkdown(
  sections: DocSection[],
  toc: string,
  screenshotDir: string,
  includeScreenshots: boolean
): string {
  const parts: string[] = [];

  // Title
  parts.push("# project: Product Documentation\n");
  parts.push(`*Generated on ${new Date().toISOString().split("T")[0]}*\n`);
  parts.push("---\n");

  // Table of contents
  parts.push(toc);
  parts.push("\n---\n");

  // Sections
  for (const section of sections) {
    parts.push(section.content);

    // Embed screenshots after relevant sections
    if (includeScreenshots) {
      const screenshots = SCREENSHOT_CONFIG.filter(
        (s) => s.afterDoc === section.key
      );
      for (const ss of screenshots) {
        const imgPath = path.resolve(screenshotDir, `${ss.name}.png`);
        if (existsSync(imgPath)) {
          parts.push(`\n![${ss.label}](${imgPath})\n*${ss.label}*\n`);
        }
      }
    }

    parts.push("\n---\n");
  }

  return parts.join("\n");
}

// ── Phase 5: Markdown → HTML → PDF ─────────────────────────────────

function markdownToHtml(mdPath: string, htmlPath: string, cssPath: string): void {
  if (!existsSync(PANDOC)) {
    throw new Error(
      `pandoc not found at ${PANDOC}. Install with: brew install pandoc`
    );
  }

  execFileSync(PANDOC, [
    mdPath,
    "-f",
    "gfm",
    "-t",
    "html5",
    "--standalone",
    "--embed-resources",
    `--css=${cssPath}`,
    // Set HTML <title> without rendering a visible title block
    "-V", "title-meta=project Product Documentation",
    "-V", "pagetitle=project Product Documentation",
    "-o",
    htmlPath,
  ]);
}

async function htmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const requireFromFrontend = createRequire(path.join(FRONTEND, "package.json"));
  const { chromium } = requireFromFrontend("playwright") as typeof import("playwright");

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    margin: { top: "25mm", bottom: "25mm", left: "20mm", right: "20mm" },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%; font-size:9px; color:#999; padding:0 20mm; text-align:right; font-family:system-ui;">
        project &mdash; Product Documentation
      </div>`,
    footerTemplate: `
      <div style="width:100%; font-size:9px; color:#999; padding:0 20mm; display:flex; justify-content:space-between; font-family:system-ui;">
        <span>Confidential</span>
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });

  await browser.close();
  console.log(`[export] PDF written to ${pdfPath}`);
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();
  const outputDir = path.resolve(ROOT, opts.outputDir);
  const screenshotDir = path.join(outputDir, "screenshots");
  const cssPath = path.join(__dirname, "export-pdf-style.css");

  await mkdir(outputDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  // Phase 1
  console.log("[export] Phase 1: Reading MDX docs...");
  const sections = await readDocs();
  console.log(`[export]   Read ${sections.length} documents.`);

  // Phase 2
  console.log("[export] Phase 2: Generating table of contents...");
  const toc = generateToc(sections);

  // Phase 3
  const includeScreenshots = !opts.noScreenshots;

  if (includeScreenshots) {
    console.log("[export] Phase 3: Capturing Storybook screenshots...");
    const alreadyRunning = await isStorybookRunning();

    if (!alreadyRunning) {
      console.log("[export]   Starting Storybook dev server...");
      storybookProc = await startStorybook();
    } else {
      console.log("[export]   Using existing Storybook instance on :6006");
    }

    try {
      await captureScreenshots(screenshotDir);
    } finally {
      cleanup();
    }
  } else {
    console.log("[export] Phase 3: Skipping screenshots (--no-screenshots)");
  }

  // Phase 4
  console.log("[export] Phase 4: Assembling Markdown...");
  const markdown = assembleMarkdown(sections, toc, screenshotDir, includeScreenshots);

  const mdPath = path.join(outputDir, "product-docs.md");
  await writeFile(mdPath, markdown, "utf-8");
  console.log(`[export]   Markdown written to ${mdPath}`);

  // Phase 5
  if (!opts.noPdf) {
    console.log("[export] Phase 5: Converting to PDF...");
    const htmlPath = path.join(outputDir, "product-docs.html");
    const pdfPath = path.join(outputDir, "product-docs.pdf");

    markdownToHtml(mdPath, htmlPath, cssPath);
    console.log(`[export]   HTML written to ${htmlPath}`);

    await htmlToPdf(htmlPath, pdfPath);
  } else {
    console.log("[export] Phase 5: Skipping PDF (--no-pdf)");
  }

  console.log("[export] Done.");
}

main().catch((err) => {
  console.error("[export] ERROR:", err);
  cleanup();
  process.exit(1);
});
