/**
 * Manual Override Ingestion
 *
 * Reads config/inspector-map.json for:
 *   - overrides[]: explicit AX identifier → file:line mappings
 *   - modulePriority[]: preferred modules when resolving ambiguous matches
 *
 * File format:
 * {
 *   "overrides": [
 *     { "pattern": "home.header.*", "file": "Wiki/HomeView.swift", "ownerType": "HomeHeaderView" },
 *     { "pattern": "command.bottom.chats", "file": "Wiki/CommandView.swift", "line": 680 }
 *   ],
 *   "modulePriority": ["AppModule", "SharedUI"]
 * }
 *
 * Pattern supports:
 *   - Exact: "command.bottom.chats"
 *   - Glob:  "command.bottom.*"  (matches any suffix)
 *   - Glob:  "home.**"           (matches any depth)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * @typedef {Object} OverrideConfig
 * @property {import('./contract.js').OverrideEntry[]} overrides
 * @property {string[]} modulePriority
 */

/**
 * Load overrides from the project config file.
 * Looks for config/inspector-map.json relative to the tool root.
 *
 * @param {string} [toolRoot] - Root of the analyze-components-tools dir
 * @returns {OverrideConfig}
 */
export function loadOverrides(toolRoot) {
  const configPath = join(toolRoot || process.cwd(), "config", "inspector-map.json");

  if (!existsSync(configPath)) {
    return { overrides: [], modulePriority: [] };
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error(`[overrides] Failed to parse ${configPath}: ${err.message}`);
    return { overrides: [], modulePriority: [] };
  }

  const overrides = (raw.overrides || []).map((entry) => ({
    pattern: entry.pattern || "",
    file: entry.file || null,
    line: entry.line ?? null,
    ownerType: entry.ownerType ?? null,
    module: entry.module ?? null,
  }));

  const modulePriority = raw.modulePriority || [];

  if (overrides.length > 0) {
    console.error(`[overrides] Loaded ${overrides.length} manual overrides`);
  }

  return { overrides, modulePriority };
}
