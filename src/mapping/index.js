/**
 * Mapping module — barrel export
 */

export { SIGNAL_TYPES, SIGNAL_WEIGHTS, CONFIDENCE, createEvidence, computeConfidence, createEnrichedNode, loadProjectWeights, saveProjectWeights, getEffectiveWeight, updateWeightFromFeedback, getProjectWeights } from "./contract.js";
export { buildModuleIndex, ModuleIndex } from "./module-indexer.js";
export { buildSourceIndexes, summarizeIndexes, matchNode, matchAll, setStateDir } from "./candidate-matcher.js";
export { loadOverrides, addRuntimeOverride, getRuntimeOverrides, clearRuntimeOverrides, persistRuntimeOverrides } from "./overrides.js";
export {
  buildIdentifierRegistry,
  saveIdentifierRegistry,
  loadIdentifierRegistry,
  ensureIdentifierRegistry,
  applyIdentifierRegistry,
  checkRegistryStaleness,
} from "./identifier-registry.js";
export { computeMetrics, formatMetrics, explainNode, generateReport } from "./diagnostics.js";
export { traceInteraction } from "./interaction-tracer.js";
