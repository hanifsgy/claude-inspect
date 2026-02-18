#!/usr/bin/env node
/**
 * Standalone scanner: runs AXe + file-mapper, outputs enriched hierarchy.
 *
 * Usage:
 *   node src/scan.js <projectPath> [simulatorUdid]
 *
 * Outputs:
 *   data/hierarchy.json        — full enriched hierarchy
 *   stdout (JSON)              — overlay-ready format with screen dims + components
 */
import { describeUI } from "./axe.js";
import {
  buildSourceIndexes,
  summarizeIndexes,
  matchAll,
  loadOverrides,
  loadIdentifierRegistry,
  applyIdentifierRegistry,
  setStateDir,
  computeMetrics,
  formatMetrics,
} from "./mapping/index.js";
import { saveHierarchy } from "./store.js";
import { detectGeometry } from "./geometry.js";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));

const projectPath = positional[0];
const simulatorUdid = positional[1]; // optional
const resolvedProjectPath = projectPath ? resolve(projectPath) : null;
const validateMode = flags.has("--validate");

if (!projectPath) {
  console.error("Usage: node src/scan.js <projectPath> [simulatorUdid] [--validate]");
  process.exit(1);
}

// Step 1: Run AXe → get UI tree from simulator
let tree, flat;
try {
  const result = describeUI(simulatorUdid);
  tree = result.tree;
  flat = result.flat;
  console.error(`[scan] AXe found ${flat.length} UI elements`);
} catch (err) {
  console.error(`[scan] AXe failed: ${err.message}`);
  console.error(`[scan] Falling back to file-only scan (no simulator data)`);
  tree = [];
  flat = [];
}

// Step 2: Extract iOS screen dimensions from root element (Application)
let screen = { w: 402, h: 874 }; // sensible default for iPhone 17 Pro
if (flat.length > 0) {
  const root = flat[0];
  if (root.frame && root.frame.w > 0 && root.frame.h > 0) {
    screen = { w: root.frame.w, h: root.frame.h };
  }
}
console.error(`[scan] iOS screen: ${screen.w} x ${screen.h} points`);

// Step 3: Load manual overrides + map AX nodes to source with confidence scoring
const toolRoot = dirname(__dirname);
setStateDir(join(toolRoot, "state"));
const { overrides, modulePriority, criticalMappings, sources } = loadOverrides(
  toolRoot,
  resolvedProjectPath
);
const indexes = buildSourceIndexes(resolvedProjectPath);
const indexSummary = summarizeIndexes(indexes);
let enriched = matchAll(flat, resolvedProjectPath, overrides, {
  modulePriority,
  indexes,
});

const registryMatch = loadIdentifierRegistry(toolRoot, resolvedProjectPath);
let registryStats = null;
if (registryMatch) {
  const applied = applyIdentifierRegistry(enriched, registryMatch.registry);
  enriched = applied.nodes;
  registryStats = {
    path: registryMatch.path,
    ...applied.stats,
  };
}

const mapped = enriched.filter((n) => n.mapped).length;
const highConf = enriched.filter((n) => n.confidence >= 0.7).length;
console.error(`[scan] Mapped ${mapped}/${enriched.length} elements (${highConf} high confidence)`);
console.error(
  `[scan] Index strategy=${indexSummary.strategy} modules=${indexSummary.modules} swiftFiles=${indexSummary.swiftFiles} ` +
  `identifiers=${indexSummary.identifierKeys} labels=${indexSummary.labelKeys} classes=${indexSummary.classKeys}`
);
if (sources.length > 0) {
  console.error(`[scan] Override sources: ${sources.join(", ")}`);
}
if (registryStats) {
  console.error(
    `[scan] Identifier registry applied=${registryStats.applied} ambiguous=${registryStats.ambiguous} source=${registryStats.path}`
  );
}

// Step 4: Save full hierarchy to data/hierarchy.json
const hierarchy = {
  tree,
  enriched,
  timestamp: Date.now(),
  scanMeta: {
    projectPath: resolvedProjectPath,
    simulatorUdid: simulatorUdid || "booted",
    rootLabel: tree?.[0]?.label || null,
    scanVersion: 2,
    indexSummary,
    overrideSources: sources,
    identifierRegistry: registryStats,
  },
};
saveHierarchy(hierarchy);
console.error(`[scan] Saved hierarchy to data/hierarchy.json`);

if (validateMode) {
  const metrics = computeMetrics(enriched);
  console.error("[scan] Validation report:");
  console.error(formatMetrics(metrics));
  const criticalResult = validateCriticalMappings(enriched, criticalMappings);
  if (criticalResult.total > 0) {
    console.error(
      `[scan] Critical mappings: ${criticalResult.passed}/${criticalResult.total} passed`
    );
    for (const failure of criticalResult.failures) {
      console.error(
        `[scan] FAIL ${failure.pattern} min=${failure.minConfidence} reason=${failure.reason}`
      );
    }
  }
  if (criticalResult.failures.length > 0) {
    process.exitCode = 1;
  }
}

// Step 5: Detect simulator geometry — exact iOS content rect within macOS window
console.error(`[scan] Detecting simulator geometry...`);
const geometry = detectGeometry(screen.w, screen.h);
const verticalOffset = 20;
const contentRect = {
  ...geometry.contentRect,
  y: geometry.contentRect.y + verticalOffset,
};

console.error(
  `[scan] Content rect: (${contentRect.x.toFixed(1)}, ${contentRect.y.toFixed(1)}, ${contentRect.w.toFixed(1)}, ${contentRect.h.toFixed(1)})`
);
console.error(`[scan] Applied vertical offset: +${verticalOffset}px`);
console.error(`[scan] Render scale: ${geometry.scale.toFixed(4)}`);

// Step 6: Output overlay-ready format with screen info + contentRect + enriched components
const components = enriched
  .filter((node) => node.className !== "UIApplication")
  .map((node) => ({
    id: node.id,
    className: node.className,
    name: node.name,
    frame: node.frame,
    file: node.file || null,
    fileLine: node.fileLine || null,
    ownerType: node.ownerType || null,
    confidence: node.confidence,
  }));

const output = {
  screen,
  contentRect,
  scale: geometry.scale,
  components,
};

console.log(JSON.stringify(output));

function validateCriticalMappings(enrichedNodes, criticalMappings = []) {
  const failures = [];
  const rules = Array.isArray(criticalMappings) ? criticalMappings : [];

  for (const rule of rules) {
    const pattern = rule.pattern || "";
    if (!pattern) continue;
    const minConfidence = typeof rule.minConfidence === "number" ? rule.minConfidence : 0.7;

    const matches = enrichedNodes.filter((node) => {
      const values = [node.id, node.identifier, node.name, node.label].filter(Boolean);
      return values.some((v) => patternMatches(pattern, v));
    });

    if (matches.length === 0) {
      failures.push({ pattern, minConfidence, reason: "no matching nodes" });
      continue;
    }

    const best = matches.reduce((top, node) => (node.confidence > top.confidence ? node : top), matches[0]);
    if (best.confidence < minConfidence) {
      failures.push({
        pattern,
        minConfidence,
        reason: `best confidence ${(best.confidence * 100).toFixed(0)}% on ${best.id}`,
      });
    }
  }

  return {
    total: rules.length,
    passed: rules.length - failures.length,
    failures,
  };
}

function patternMatches(pattern, value) {
  if (!pattern || !value) return false;
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(value);
    } catch {
      return false;
    }
  }

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
