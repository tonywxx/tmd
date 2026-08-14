#!/usr/bin/env node
/*
 * Workaround for an upstream Tauri CLI bug (affects @tauri-apps/cli 2.9.x–2.11.x).
 *
 * The CLI's embedded/bundled `DmgConfig` default-fill injects a nested `window`
 * field, but the JSON-schema it validates against (`config.schema.json` shipped
 * inside the CLI package) was regenerated with the newer flat `windowSize` /
 * `windowPosition` shape and sets `additionalProperties: false`. The result is:
 *
 *   Error "tauri.conf.json" error on `bundle > macOS > dmg`:
 *     Additional properties are not allowed ('window' was unexpected)
 *
 * The CLI reads `config.schema.json` from disk (falling back to an embedded
 * schema only if the file is missing/invalid), so patching that file to allow
 * the `window` default makes `tauri build` validate cleanly.
 *
 * Re-run this after every `pnpm install` (or wire it as a postinstall):
 *   node scripts/patch-tauri-cli.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Resolve the @tauri-apps/cli package actually used by the project.
let cliDir;
try {
  cliDir = dirname(require.resolve("@tauri-apps/cli/package.json"));
} catch {
  console.error("[@tauri-apps/cli not found — run `pnpm install` first]");
  process.exit(0); // non-fatal: nothing to patch yet
}

const schemaPath = join(cliDir, "config.schema.json");
if (!existsSync(schemaPath)) {
  console.log(`[tauri-cli patch] no config.schema.json at ${schemaPath} — skipping`);
  process.exit(0);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const dmg = schema?.definitions?.DmgConfig;
if (!dmg || typeof dmg !== "object") {
  console.log("[tauri-cli patch] DmgConfig definition not found — skipping");
  process.exit(0);
}

let changed = false;
if (dmg.additionalProperties !== true) {
  dmg.additionalProperties = true;
  changed = true;
}
if (!dmg.properties?.window) {
  dmg.properties = dmg.properties || {};
  dmg.properties.window = {
    type: "object",
    properties: { position: { type: "object" }, size: { type: "object" } },
  };
  changed = true;
}

if (changed) {
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n");
  console.log("[tauri-cli patch] patched DmgConfig schema so `tauri build` validates.");
} else {
  console.log("[tauri-cli patch] already patched — nothing to do.");
}
