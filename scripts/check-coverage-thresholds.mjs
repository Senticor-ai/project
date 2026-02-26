#!/usr/bin/env node
// Two-tier coverage threshold checker.
// Usage: node check-coverage-thresholds.mjs <coverage-summary.json> <lines> <statements> <functions> <branches>
// Example: node check-coverage-thresholds.mjs ./coverage/unit/coverage-summary.json 50 50 50 40

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [reportPath, ...thresholdArgs] = process.argv.slice(2);

if (!reportPath) {
  console.error(
    "Usage: check-coverage-thresholds.mjs <coverage-summary.json> <lines> <stmts> <funcs> <branches>",
  );
  process.exit(2);
}

const resolved = resolve(reportPath);
if (!existsSync(resolved)) {
  console.error(
    `FAIL: Coverage report not found at ${resolved}\n` +
      "The coverage generation step probably failed — check its output above.",
  );
  process.exit(1);
}

const thresholds = {
  lines: Number(thresholdArgs[0] ?? 80),
  statements: Number(thresholdArgs[1] ?? 80),
  functions: Number(thresholdArgs[2] ?? 80),
  branches: Number(thresholdArgs[3] ?? 70),
};

const summary = JSON.parse(readFileSync(resolved, "utf-8"));
const { total } = summary;

let failed = false;
for (const [metric, threshold] of Object.entries(thresholds)) {
  const actual = total[metric]?.pct ?? 0;
  if (actual < threshold) {
    console.error(
      `FAIL: ${metric} coverage ${actual.toFixed(2)}% < ${threshold}% threshold`,
    );
    failed = true;
  } else {
    console.log(
      `PASS: ${metric} coverage ${actual.toFixed(2)}% >= ${threshold}%`,
    );
  }
}

process.exit(failed ? 1 : 0);
