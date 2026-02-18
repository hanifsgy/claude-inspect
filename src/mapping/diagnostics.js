/**
 * Diagnostics & Quality Metrics
 *
 * Provides summary statistics and per-node explain output
 * for understanding and debugging the mapping quality.
 */

import { CONFIDENCE } from "./contract.js";

/**
 * Compute aggregate mapping metrics from enriched nodes.
 *
 * @param {import('./contract.js').EnrichedNode[]} enrichedNodes
 * @returns {MappingMetrics}
 */
export function computeMetrics(enrichedNodes) {
  const total = enrichedNodes.length;
  const mapped = enrichedNodes.filter((n) => n.mapped).length;
  const unmapped = total - mapped;
  const highConf = enrichedNodes.filter((n) => n.confidence >= CONFIDENCE.HIGH).length;
  const medConf = enrichedNodes.filter(
    (n) => n.confidence >= CONFIDENCE.MEDIUM && n.confidence < CONFIDENCE.HIGH
  ).length;
  const lowConf = enrichedNodes.filter(
    (n) => n.confidence > 0 && n.confidence < CONFIDENCE.MEDIUM
  ).length;
  const ambiguous = enrichedNodes.filter((n) => n.ambiguous).length;
  const manual = enrichedNodes.filter((n) => n.provenance === "manual").length;
  const auto = enrichedNodes.filter((n) => n.provenance === "auto" && n.mapped).length;

  // Signal usage breakdown
  const signalCounts = {};
  for (const node of enrichedNodes) {
    for (const ev of node.evidence) {
      signalCounts[ev.signal] = (signalCounts[ev.signal] || 0) + 1;
    }
  }

  // Unique files touched
  const files = new Set(enrichedNodes.filter((n) => n.file).map((n) => n.file));

  // Unique modules
  const modules = new Set(
    enrichedNodes.filter((n) => n.mappedModule).map((n) => n.mappedModule)
  );

  return {
    total,
    mapped,
    unmapped,
    coverage: total > 0 ? ((mapped / total) * 100).toFixed(1) + "%" : "0%",
    confidence: {
      high: highConf,
      medium: medConf,
      low: lowConf,
      zero: total - highConf - medConf - lowConf,
    },
    ambiguous,
    provenance: { manual, auto },
    signalCounts,
    files: files.size,
    modules: modules.size,
  };
}

/**
 * Format metrics as a human-readable summary string.
 */
export function formatMetrics(metrics) {
  const lines = [
    `Mapping Coverage: ${metrics.coverage} (${metrics.mapped}/${metrics.total})`,
    `  High confidence (≥70%): ${metrics.confidence.high}`,
    `  Medium (40-70%):        ${metrics.confidence.medium}`,
    `  Low (<40%):             ${metrics.confidence.low}`,
    `  Unmapped:               ${metrics.unmapped}`,
    `  Ambiguous:              ${metrics.ambiguous}`,
    `  Manual overrides:       ${metrics.provenance.manual}`,
    `  Files touched:          ${metrics.files}`,
    `  Modules:                ${metrics.modules}`,
  ];

  if (Object.keys(metrics.signalCounts).length > 0) {
    lines.push("  Signal usage:");
    for (const [signal, count] of Object.entries(metrics.signalCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`    ${signal}: ${count}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate per-node explain output showing why a mapping was selected.
 *
 * @param {import('./contract.js').EnrichedNode} node
 * @returns {string}
 */
export function explainNode(node) {
  const lines = [
    `--- ${node.id} (${node.className}) ---`,
    `  AX: type=${node.axeType} identifier="${node.identifier}" label="${node.label}"`,
  ];

  if (node.mapped) {
    lines.push(
      `  Mapped: ${node.file}:${node.fileLine}` +
        (node.ownerType ? ` (${node.ownerType})` : "")
    );
    lines.push(
      `  Confidence: ${(node.confidence * 100).toFixed(0)}% [${node.provenance}]` +
        (node.ambiguous ? " ⚠ AMBIGUOUS" : "")
    );

    if (node.evidence.length > 0) {
      lines.push("  Evidence:");
      for (const ev of node.evidence) {
        lines.push(`    [${ev.signal}] w=${ev.weight} → ${ev.detail}`);
      }
    }

    if (node.candidates.length > 1) {
      lines.push(`  Other candidates (${node.candidates.length - 1}):`);
      for (const cand of node.candidates.slice(1, 4)) {
        lines.push(
          `    ${cand.file}:${cand.line} conf=${(cand.confidence * 100).toFixed(0)}%`
        );
      }
    }
  } else {
    lines.push("  Mapped: NO");
    lines.push(`  Confidence: ${(node.confidence * 100).toFixed(0)}%`);
  }

  return lines.join("\n");
}

/**
 * Generate full diagnostic report for all nodes.
 */
export function generateReport(enrichedNodes) {
  const metrics = computeMetrics(enrichedNodes);
  const sections = [
    "=== MAPPING DIAGNOSTICS ===",
    "",
    formatMetrics(metrics),
    "",
    "=== PER-NODE DETAIL ===",
    "",
  ];

  for (const node of enrichedNodes) {
    sections.push(explainNode(node));
    sections.push("");
  }

  return sections.join("\n");
}
