/**
 * Diagnostics & Quality Metrics
 *
 * Provides summary statistics and per-node explain output
 * for understanding and debugging the mapping quality.
 */

import { CONFIDENCE, SIGNAL_WEIGHTS, getProjectWeights } from "./contract.js";

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
        (node.ambiguous ? ` ⚠ AMBIGUOUS (score=${(node.ambiguityScore || 0).toFixed(2)})` : "")
    );

    if (node.ambiguityReason) {
      lines.push(`  Ambiguity reason: ${node.ambiguityReason}`);
    }

    if (node.evidence.length > 0) {
      lines.push("  Evidence breakdown:");
      const sortedEvidence = [...node.evidence].sort((a, b) => b.weight - a.weight);
      const projectWeights = getProjectWeights();
      
      for (const ev of sortedEvidence) {
        const baseWeight = SIGNAL_WEIGHTS[ev.signal] ?? 0;
        const learnedWeight = projectWeights?.[ev.signal];
        const weightNote = learnedWeight !== undefined && learnedWeight !== baseWeight
          ? ` (learned: ${learnedWeight.toFixed(2)}, base: ${baseWeight.toFixed(2)})`
          : "";
        lines.push(`    [${ev.signal}] weight=${ev.weight.toFixed(2)}${weightNote}`);
        lines.push(`      → ${ev.detail}`);
      }
      
      // Show confidence computation
      const topWeight = sortedEvidence[0]?.weight || 0;
      const boostSum = sortedEvidence.slice(1).reduce((sum, ev) => sum + ev.weight * 0.3, 0);
      const computedConf = Math.min(topWeight + boostSum, 1.0);
      lines.push(`  Computed confidence: ${topWeight.toFixed(2)} + boost ${boostSum.toFixed(2)} = ${computedConf.toFixed(2)}`);
    }

    if (node.candidates.length > 1) {
      lines.push(`  Other candidates (${node.candidates.length - 1}):`);
      for (const cand of node.candidates.slice(1, 4)) {
        const signals = cand.evidence?.map(e => e.signal).join(", ") || "none";
        lines.push(
          `    ${cand.file}:${cand.line} conf=${(cand.confidence * 100).toFixed(0)}% [${signals}]`
        );
      }
    }
  } else {
    lines.push("  Mapped: NO");
    lines.push(`  Confidence: ${(node.confidence * 100).toFixed(0)}%`);
    
    // Suggest why mapping might have failed
    if (!node.identifier && !node.label) {
      lines.push("  No identifier or label available for matching");
    } else if (node.candidates && node.candidates.length > 0) {
      lines.push(`  Had ${node.candidates.length} candidates but all below confidence threshold (${CONFIDENCE.MEDIUM})`);
    }
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
