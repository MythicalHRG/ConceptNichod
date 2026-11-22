#!/usr/bin/env node
/**
 * ConceptNichod Anti-AI Reverse-Engineering Wrapper powered by qybaihe/bla (bla-agents).
 *
 * Targets ONLY Next.js client static bundles (.next/static/chunks) so Server Actions,
 * API routes, MongoDB queries, and React RSC hydration remain untouched.
 *
 * Usage:
 *   node scripts/bla-shield.mjs audit                 # Audit .next/static/chunks exposure (read-only)
 *   node scripts/bla-shield.mjs harden                # Dry-run preview into .bla-hardened/
 *   node scripts/bla-shield.mjs harden --apply        # Shield client JS chunks in-place
 *   node scripts/bla-shield.mjs restore               # Restore original chunks
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CHUNKS_DIR = path.join(ROOT, ".next", "static", "chunks");
const NEXT_CONFIG_PATH = path.join(ROOT, "next.config.mjs");

function checkSourceMapsConfig() {
  if (!fs.existsSync(NEXT_CONFIG_PATH)) return;
  const content = fs.readFileSync(NEXT_CONFIG_PATH, "utf8");
  if (/productionBrowserSourceMaps\s*:\s*true/.test(content)) {
    console.warn(
      "[BLA Warning] productionBrowserSourceMaps is set to true in next.config.mjs. Disable it before shipping hardened client bundles."
    );
  }
}

function collectJsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

function runBla(args) {
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npxBin, ["-y", "bla-agents@latest", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });
  return result.status ?? 1;
}

function main() {
  const [, , command = "audit", ...restArgs] = process.argv;
  checkSourceMapsConfig();

  if (!fs.existsSync(CHUNKS_DIR)) {
    console.error(
      "[BLA] Build output not found at " + CHUNKS_DIR + '. Run "npm run build" first.'
    );
    process.exit(1);
  }

  const jsFiles = collectJsFiles(CHUNKS_DIR);
  console.log(
    "[BLA] Found " + jsFiles.length + " Next.js client JS chunk(s) under .next/static/chunks"
  );

  if (command === "audit") {
    const code = runBla(["audit", CHUNKS_DIR, ...restArgs]);
    if (code !== 0) {
      console.warn("[BLA] Audit exited with code " + code + ".");
    }
    process.exit(code);
  }

  if (command === "harden") {
    const applyFlag = restArgs.includes("--apply") ? ["--apply"] : [];
    const extraArgs = restArgs.filter((arg) => arg !== "--apply");
    const code = runBla(["harden", CHUNKS_DIR, ...applyFlag, ...extraArgs]);
    process.exit(code);
  }

  if (command === "restore") {
    const code = runBla(["harden", CHUNKS_DIR, "--restore"]);
    process.exit(code);
  }

  console.error(
    '[BLA] Unknown command "' + command + '". Supported: audit | harden [--apply] | restore'
  );
  process.exit(1);
}

main();
