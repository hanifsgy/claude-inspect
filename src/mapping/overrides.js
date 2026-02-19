/**
 * Manual Override Ingestion
 *
 * Reads inspector-map.json from multiple locations for:
 *   - overrides[]: explicit AX identifier → file:line mappings
 *   - modulePriority[]: preferred modules when resolving ambiguous matches
 *   - criticalMappings[]: required mapping assertions for validation mode
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

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, resolve, dirname, sep } from "path";
import { mkdirSync } from "fs";

/**
 * Return true if `filePath` resolves to within `projectRoot`.
 * Prevents `../../etc/passwd` style traversal from override entries.
 */
function isPathWithinRoot(projectRoot, filePath) {
  const root = resolve(projectRoot);
  const resolved = resolve(root, filePath);
  return resolved === root || resolved.startsWith(root + sep);
}

let runtimeOverrides = [];

export function addRuntimeOverride(entry) {
  const override = {
    pattern: entry.pattern || "",
    file: entry.file || null,
    line: entry.line ?? null,
    ownerType: entry.ownerType ?? null,
    module: entry.module ?? null,
    addedAt: Date.now(),
  };
  runtimeOverrides.push(override);
  return override;
}

export function getRuntimeOverrides() {
  return [...runtimeOverrides];
}

export function clearRuntimeOverrides() {
  runtimeOverrides = [];
}

export function persistRuntimeOverrides(projectPath) {
  if (runtimeOverrides.length === 0) return null;

  const configDir = join(projectPath, ".claude");
  const configPath = join(configDir, "inspector-map.json");

  let existing = { overrides: [], modulePriority: [], criticalMappings: [] };
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      // ignore parse errors
    }
  }

  for (const ro of runtimeOverrides) {
    const { addedAt, ...entry } = ro;
    if (!existing.overrides.some(o => o.pattern === entry.pattern)) {
      existing.overrides.push(entry);
    }
  }

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(existing, null, 2));

  return configPath;
}

/**
 * @typedef {Object} OverrideConfig
 * @property {import('./contract.js').OverrideEntry[]} overrides
 * @property {string[]} modulePriority
 */

/**
 * Load overrides from the project config file.
 * Looks for (in merge order):
 *   1) <toolRoot>/config/inspector-map.json
 *   2) <projectPath>/config/inspector-map.json
 *   3) <projectPath>/.claude/inspector-map.json
 *
 * @param {string} [toolRoot] - Root of the analyze-components-tools dir
 * @returns {OverrideConfig}
 */
export function loadOverrides(toolRoot, projectPath) {
  const resolvedToolRoot = toolRoot || process.cwd();
  const resolvedProjectPath = projectPath ? resolve(projectPath) : null;

  const configPaths = [
    join(resolvedToolRoot, "config", "inspector-map.json"),
  ];

  if (resolvedProjectPath) {
    configPaths.push(join(resolvedProjectPath, "config", "inspector-map.json"));
    configPaths.push(join(resolvedProjectPath, ".claude", "inspector-map.json"));
  }

  const merged = {
    overrides: [],
    modulePriority: [],
    criticalMappings: [],
    sources: [],
  };

  for (const path of configPaths) {
    const loaded = loadOverrideFile(path, resolvedProjectPath);
    if (!loaded) continue;

    merged.sources.push(path);
    merged.overrides.push(...loaded.overrides);
    if (loaded.modulePriority.length > 0) {
      merged.modulePriority = [...loaded.modulePriority];
    }
    merged.criticalMappings.push(...loaded.criticalMappings);
  }

  if (merged.overrides.length > 0) {
    console.error(
      `[overrides] Loaded ${merged.overrides.length} manual overrides from ${merged.sources.length} file(s)`
    );
  }

  return merged;
}

function loadOverrideFile(configPath, projectRoot = null) {
  if (!existsSync(configPath)) return null;

  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error(`[overrides] Failed to parse ${configPath}: ${err.message}`);
    return null;
  }

  const overrides = (raw.overrides || []).flatMap((entry) => {
    const file = entry.file || null;
    if (file && projectRoot && !isPathWithinRoot(projectRoot, file)) {
      console.error(`[overrides] Skipping unsafe path in ${configPath}: "${file}"`);
      return [];
    }
    return [{
      pattern: entry.pattern || "",
      file,
      line: entry.line ?? null,
      ownerType: entry.ownerType ?? null,
      module: entry.module ?? null,
    }];
  });

  const modulePriority = Array.isArray(raw.modulePriority) ? raw.modulePriority : [];
  const criticalMappings = Array.isArray(raw.criticalMappings) ? raw.criticalMappings : [];

  return {
    overrides,
    modulePriority,
    criticalMappings,
  };
}
