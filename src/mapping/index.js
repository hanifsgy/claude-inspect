/**
 * Mapping module — barrel export
 */

export { SIGNAL_TYPES, SIGNAL_WEIGHTS, CONFIDENCE, createEvidence, computeConfidence, createEnrichedNode } from "./contract.js";
export { buildModuleIndex, ModuleIndex } from "./module-indexer.js";
export { buildSourceIndexes, matchNode, matchAll, setStateDir } from "./candidate-matcher.js";
export { loadOverrides } from "./overrides.js";
export { computeMetrics, formatMetrics, explainNode, generateReport } from "./diagnostics.js";
