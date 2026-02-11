#!/usr/bin/env node
/**
 * Merge individual E2E test videos into a single showcase video.
 *
 * Uses ffmpeg concat demuxer for fast, lossless merging of .webm files.
 * Optionally adds a title card between sections using ffmpeg filters.
 *
 * Usage:
 *   node scripts/merge-videos.ts                     # merge all
 *   node scripts/merge-videos.ts --input exports/videos  # custom input dir
 *   node scripts/merge-videos.ts --help
 *
 * Prerequisites:
 *   - ffmpeg (brew install ffmpeg)
 *   - Run export-e2e-videos.ts first to generate individual clips
 */

import { readdir, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

// ── Video ordering ─────────────────────────────────────────────────
// Spec files in a logical demo order (auth first, then capture → triage → manage)

const SECTION_ORDER = [
  { stem: "auth", title: "Authentication" },
  { stem: "inbox-capture", title: "Inbox Capture" },
  { stem: "inbox-triage", title: "Inbox Triage" },
  { stem: "full-cycle", title: "Full Cycle" },
  { stem: "action-management", title: "Action Management" },
  { stem: "project-tree", title: "Project Tree" },
  { stem: "context-filter", title: "Context Filters" },
  { stem: "rapid-entry", title: "Rapid Entry" },
  { stem: "import-export", title: "Import & Export" },
  { stem: "email-triage", title: "Email Triage" },
  { stem: "nirvana-import", title: "Nirvana Import" },
];

// ── CLI parsing ────────────────────────────────────────────────────

interface Options {
  inputDir: string;
  outputDir: string;
  withTitles: boolean;
}

function parseArgs(): Options | null {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: node scripts/merge-videos.ts [options]

Merges individual E2E test .webm videos into a single showcase video.

Prerequisites:
  Run export-e2e-videos.ts first to generate the individual clips.

Options:
  --input <path>     Input directory with .webm files (default: exports/videos)
  --output <path>    Output directory (default: exports)
  --with-titles      Add title cards between test sections
  -h, --help         Show this help
`);
    return null;
  }

  const inputIdx = args.indexOf("--input");
  const outputIdx = args.indexOf("--output");

  return {
    inputDir: inputIdx !== -1 && args[inputIdx + 1]
      ? args[inputIdx + 1]
      : "exports/videos",
    outputDir: outputIdx !== -1 && args[outputIdx + 1]
      ? args[outputIdx + 1]
      : "exports",
    withTitles: args.includes("--with-titles"),
  };
}

// ── Title card generation ──────────────────────────────────────────

function createTitleCard(
  title: string,
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  durationSec: number,
): void {
  // Generate a short video clip with text on a dark background
  execFileSync(FFMPEG, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x18181b:s=${width}x${height}:d=${durationSec}:r=${fps}`,
    "-vf", [
      `drawtext=text='${title.replace(/'/g, "'\\''")}'`,
      "fontcolor=white",
      "fontsize=36",
      "x=(w-text_w)/2",
      "y=(h-text_h)/2",
      `fontfile=/System/Library/Fonts/Helvetica.ttc`,
    ].join(":"),
    "-c:v", "libvpx",
    "-b:v", "1M",
    "-an",
    outputPath,
  ], { stdio: "pipe" });
}

// ── Video probing ──────────────────────────────────────────────────

interface VideoInfo {
  width: number;
  height: number;
  fps: number;
}

function probeVideo(videoPath: string): VideoInfo {
  const out = execFileSync(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-of", "csv=p=0",
    videoPath,
  ], { encoding: "utf-8" }).trim();

  const parts = out.split(",");
  const [fpsNum, fpsDen] = (parts[2] ?? "25/1").split("/");
  return {
    width: parseInt(parts[0] ?? "800", 10),
    height: parseInt(parts[1] ?? "450", 10),
    fps: Math.round(parseInt(fpsNum ?? "25", 10) / parseInt(fpsDen ?? "1", 10)),
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();
  if (!opts) return;

  if (!existsSync(FFMPEG)) {
    throw new Error(`ffmpeg not found at ${FFMPEG}. Install with: brew install ffmpeg`);
  }

  const inputDir = path.resolve(ROOT, opts.inputDir);
  const outputDir = path.resolve(ROOT, opts.outputDir);

  if (!existsSync(inputDir)) {
    throw new Error(
      `Input directory not found: ${inputDir}\n` +
      "Run export-e2e-videos.ts first to generate the video clips."
    );
  }

  // Discover all .webm files
  const allFiles = (await readdir(inputDir))
    .filter((f) => f.endsWith(".webm"))
    .sort();

  if (allFiles.length === 0) {
    throw new Error(`No .webm files found in ${inputDir}`);
  }

  console.log(`[merge] Found ${allFiles.length} video clips in ${inputDir}`);

  // Sort files by section order, then by number suffix
  const sortedFiles = sortBySection(allFiles);

  // Probe first video for dimensions
  const info = probeVideo(path.join(inputDir, sortedFiles[0]!));
  console.log(`[merge] Video format: ${info.width}x${info.height} @ ${info.fps}fps`);

  // Build concat file list
  await mkdir(outputDir, { recursive: true });
  const concatListPath = path.join(outputDir, ".concat-list.txt");
  const tempFiles: string[] = [concatListPath];
  const concatLines: string[] = [];

  let currentSection = "";
  for (const file of sortedFiles) {
    const section = file.replace(/-\d+\.webm$/, "").replace(/\.webm$/, "");

    // Add title card when section changes
    if (opts.withTitles && section !== currentSection) {
      currentSection = section;
      const sectionInfo = SECTION_ORDER.find((s) => s.stem === section);
      const title = sectionInfo?.title ?? section;

      const titlePath = path.join(outputDir, `.title-${section}.webm`);
      console.log(`[merge]   Title card: ${title}`);
      createTitleCard(title, titlePath, info.width, info.height, info.fps, 2);
      concatLines.push(`file '${titlePath}'`);
      tempFiles.push(titlePath);
    }

    concatLines.push(`file '${path.join(inputDir, file)}'`);
  }

  await writeFile(concatListPath, concatLines.join("\n"), "utf-8");

  // Merge
  const outputPath = path.join(outputDir, "e2e-showcase.webm");
  console.log(`[merge] Merging ${sortedFiles.length} clips...`);

  execFileSync(FFMPEG, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    outputPath,
  ], { stdio: "pipe" });

  // Clean up temp files
  for (const tmp of tempFiles) {
    if (existsSync(tmp)) {
      await unlink(tmp);
    }
  }

  const sizeKb = Math.round(
    (await import("node:fs")).statSync(outputPath).size / 1024
  );
  console.log(`[merge] Output: ${outputPath} (${sizeKb}KB)`);
  console.log("[merge] Done.");
}

function sortBySection(files: string[]): string[] {
  const orderMap = new Map(SECTION_ORDER.map((s, i) => [s.stem, i]));

  return [...files].sort((a, b) => {
    const stemA = a.replace(/-\d+\.webm$/, "").replace(/\.webm$/, "");
    const stemB = b.replace(/-\d+\.webm$/, "").replace(/\.webm$/, "");
    const orderA = orderMap.get(stemA) ?? 999;
    const orderB = orderMap.get(stemB) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    // Same section — sort by number suffix
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

main().catch((err) => {
  console.error("[merge] ERROR:", err);
  process.exit(1);
});
