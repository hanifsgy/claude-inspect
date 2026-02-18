#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { loadOverrides } from "./mapping/index.js";
import { loadIdentifierRegistry } from "./mapping/identifier-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = dirname(__dirname);

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const projectPath = positional[0] ? resolve(positional[0]) : null;

if (!projectPath) {
  console.error("Usage: node src/mapping-audit.js <projectPath> [--out=/path/to/artifacts] [--hierarchy=/path/to/hierarchy.json]");
  process.exit(1);
}

const outFlag = args.find((arg) => arg.startsWith("--out="));
const hierarchyFlag = args.find((arg) => arg.startsWith("--hierarchy="));

const outDir = outFlag
  ? resolve(outFlag.slice("--out=".length))
  : join(toolRoot, "artifacts");
const hierarchyPath = hierarchyFlag
  ? resolve(hierarchyFlag.slice("--hierarchy=".length))
  : join(toolRoot, "data", "hierarchy.json");

if (!existsSync(hierarchyPath)) {
  console.error(`[mapping-audit] Missing hierarchy file: ${hierarchyPath}`);
  process.exit(2);
}

const hierarchy = JSON.parse(readFileSync(hierarchyPath, "utf-8"));
const nodes = Array.isArray(hierarchy?.enriched) ? hierarchy.enriched : [];

const registryMatch = loadIdentifierRegistry(toolRoot, projectPath);
const { criticalMappings = [] } = loadOverrides(toolRoot, projectPath);

const total = nodes.length;
const interactive = nodes.filter((n) => n.className !== "UIApplication");
const withIdentifier = interactive.filter((n) => Boolean(n.identifier));
const mapped = interactive.filter((n) => n.mapped);
const high = interactive.filter((n) => (n.confidence || 0) >= 0.7);
const unresolvedIdentifiers = withIdentifier.filter((n) => !n.mapped || !n.file);
const registryResolved = withIdentifier.filter((n) =>
  (n.evidence || []).some((ev) => (ev.detail || "").startsWith("Identifier registry"))
);

const criticalFailures = evaluateCriticalMappings(interactive, criticalMappings);

const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  projectPath,
  hierarchyPath,
  registryPath: registryMatch?.path || null,
  totals: {
    totalNodes: total,
    interactiveNodes: interactive.length,
    mapped: mapped.length,
    coveragePct: percent(mapped.length, interactive.length),
    highConfidence: high.length,
    withIdentifier: withIdentifier.length,
    identifierCoveragePct: percent(withIdentifier.length, interactive.length),
    identifierResolvedByRegistry: registryResolved.length,
    identifierRegistryResolutionPct: percent(registryResolved.length, withIdentifier.length),
    unresolvedIdentifiers: unresolvedIdentifiers.length,
  },
  critical: {
    total: criticalMappings.length,
    passed: criticalMappings.length - criticalFailures.length,
    failed: criticalFailures.length,
  },
};

const failures = {
  schemaVersion: "1.0.0",
  generatedAt: report.generatedAt,
  criticalFailures,
  unresolvedIdentifiers: unresolvedIdentifiers.slice(0, 50).map((n) => ({
    id: n.id,
    identifier: n.identifier,
    className: n.className,
    confidence: n.confidence,
  })),
};

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "mapping-report.json");
const failuresPath = join(outDir, "failures.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(failuresPath, JSON.stringify(failures, null, 2));

console.error(
  `[mapping-audit] coverage=${report.totals.coveragePct}% identifierCoverage=${report.totals.identifierCoveragePct}%`
);
console.error(
  `[mapping-audit] unresolvedIdentifiers=${report.totals.unresolvedIdentifiers} criticalFailed=${criticalFailures.length}`
);

console.log(
  JSON.stringify(
    {
      reportPath,
      failuresPath,
      totals: report.totals,
      critical: report.critical,
    },
    null,
    2
  )
);

if (criticalFailures.length > 0) {
  process.exitCode = 1;
}

function percent(value, max) {
  if (!max) return 0;
  return Number(((value / max) * 100).toFixed(1));
}

function evaluateCriticalMappings(nodes, rules) {
  const failures = [];
  const list = Array.isArray(rules) ? rules : [];

  for (const rule of list) {
    const pattern = rule.pattern || "";
    if (!pattern) continue;
    const minConfidence = typeof rule.minConfidence === "number" ? rule.minConfidence : 0.7;

    const candidates = nodes.filter((node) => {
      const values = [node.id, node.identifier, node.name, node.label].filter(Boolean);
      return values.some((value) => patternMatches(pattern, value));
    });

    if (candidates.length === 0) {
      failures.push({ pattern, minConfidence, reason: "no matching node" });
      continue;
    }

    const best = candidates.reduce((top, node) =>
      (node.confidence || 0) > (top.confidence || 0) ? node : top
    , candidates[0]);

    if ((best.confidence || 0) < minConfidence) {
      failures.push({
        pattern,
        minConfidence,
        reason: `best confidence ${Math.round((best.confidence || 0) * 100)}% on ${best.id}`,
      });
    }
  }

  return failures;
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
