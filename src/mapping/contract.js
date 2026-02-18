/**
 * Mapping Contract — Enriched Node Schema & Confidence Model
 *
 * Defines how AX (accessibility) nodes from a running simulator are mapped
 * to source code locations in large multi-module Swift repos.
 *
 * Designed for: monorepos, XcodeGen setups, embedded frameworks, SPM packages.
 */

// ---------------------------------------------------------------------------
// Signal Types — each represents one kind of evidence linking AX → source
// ---------------------------------------------------------------------------

/**
 * @typedef {'identifier_exact'|'identifier_prefix'|'label_exact'|'label_fuzzy'|'class_name'|'class_inheritance'|'module_scope'|'hierarchy_position'|'manual_override'} SignalType
 */

export const SIGNAL_TYPES = {
  // Strongest: AX identifier matches a string literal assigned to .accessibilityIdentifier
  IDENTIFIER_EXACT: "identifier_exact",

  // AX identifier shares a dotted prefix with a known identifier group
  // e.g. "command.library.card.0" matches file that has "command.library.card.\(index)"
  IDENTIFIER_PREFIX: "identifier_prefix",

  // AX label matches a string literal in source
  LABEL_EXACT: "label_exact",

  // AX label fuzzy-matches (normalized) a string literal
  LABEL_FUZZY: "label_fuzzy",

  // AX type maps to a UIKit class that exists as a custom subclass in source
  CLASS_NAME: "class_name",

  // AX type maps to a UIKit base class, and a source class inherits from it
  CLASS_INHERITANCE: "class_inheritance",

  // Candidate is within the same module/target as sibling matched elements
  MODULE_SCOPE: "module_scope",

  // Parent/child structure in AX tree matches addSubview/body structure in source
  HIERARCHY_POSITION: "hierarchy_position",

  // User explicitly mapped via override file or comment annotation
  MANUAL_OVERRIDE: "manual_override",
};

// ---------------------------------------------------------------------------
// Signal Weights — how much each signal contributes to confidence score
// ---------------------------------------------------------------------------

export const SIGNAL_WEIGHTS = {
  [SIGNAL_TYPES.MANUAL_OVERRIDE]: 1.0, // Absolute — always wins
  [SIGNAL_TYPES.IDENTIFIER_EXACT]: 0.9, // Very strong — direct identifier match
  [SIGNAL_TYPES.IDENTIFIER_PREFIX]: 0.6, // Good — prefix pattern match
  [SIGNAL_TYPES.CLASS_NAME]: 0.7, // Strong — exact custom class found
  [SIGNAL_TYPES.LABEL_EXACT]: 0.5, // Moderate — labels can be shared/localized
  [SIGNAL_TYPES.CLASS_INHERITANCE]: 0.3, // Weak — many classes inherit UIButton etc
  [SIGNAL_TYPES.MODULE_SCOPE]: 0.2, // Boost — confirms other signals
  [SIGNAL_TYPES.HIERARCHY_POSITION]: 0.2, // Boost — confirms other signals
  [SIGNAL_TYPES.LABEL_FUZZY]: 0.15, // Weak — fuzzy match is unreliable
};

// ---------------------------------------------------------------------------
// Confidence Thresholds
// ---------------------------------------------------------------------------

export const CONFIDENCE = {
  /** Above this: high confidence, show as mapped */
  HIGH: 0.7,

  /** Between MEDIUM and HIGH: show with "?" indicator */
  MEDIUM: 0.4,

  /** Below MEDIUM: treat as unmapped */
  LOW: 0.4,

  /** Maximum possible score (capped) */
  MAX: 1.0,
};

// ---------------------------------------------------------------------------
// Evidence — a single piece of matching evidence
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Evidence
 * @property {SignalType} signal - The type of signal
 * @property {number} weight - The resolved weight (from SIGNAL_WEIGHTS)
 * @property {string} sourceFile - Relative path to the matched source file
 * @property {number} sourceLine - Line number in the source file
 * @property {string} detail - Human-readable description of the match
 */

/**
 * Create an evidence record.
 */
export function createEvidence(signal, sourceFile, sourceLine, detail) {
  return {
    signal,
    weight: SIGNAL_WEIGHTS[signal] ?? 0,
    sourceFile,
    sourceLine,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Candidate — a potential source match for an AX node
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Candidate
 * @property {string} file - Relative path to candidate source file
 * @property {number} line - Line number of the relevant declaration/assignment
 * @property {string} ownerType - The Swift type that owns this element ('HomeContentView', 'CommandViewController')
 * @property {string|null} module - Module/target name if known ('WikiApp', 'SharedUI', etc.)
 * @property {Evidence[]} evidence - All evidence supporting this candidate
 * @property {number} confidence - Computed score 0.0–1.0
 */

/**
 * Compute confidence for a candidate from its evidence array.
 * Uses max-plus-boost: strongest signal + diminishing contributions from others.
 */
export function computeConfidence(evidence) {
  if (!evidence || evidence.length === 0) return 0;

  // Sort by weight descending
  const sorted = [...evidence].sort((a, b) => b.weight - a.weight);

  // Strongest signal is the base
  let score = sorted[0].weight;

  // Additional signals add diminishing boosts (30% of their weight)
  for (let i = 1; i < sorted.length; i++) {
    score += sorted[i].weight * 0.3;
  }

  return Math.min(score, CONFIDENCE.MAX);
}

// ---------------------------------------------------------------------------
// Enriched Node — the final mapped output for a single AX element
// ---------------------------------------------------------------------------

/**
 * @typedef {'auto'|'manual'} Provenance
 */

/**
 * @typedef {Object} EnrichedNode
 * @property {string} id - Composite ID from AX (className_identifier or identifier)
 * @property {string} className - UIKit class name (mapped from AX type)
 * @property {string} axeType - Original AXe type (Button, StaticText, etc.)
 * @property {string} name - Display name (identifier or label)
 * @property {string} identifier - AX unique identifier
 * @property {string} label - AX label
 * @property {Object} frame - {x, y, w, h} in iOS points
 *
 * // --- Mapping fields (new) ---
 * @property {string|null} file - Best-match source file (relative to project root)
 * @property {number|null} fileLine - Line number in source file
 * @property {string|null} ownerType - The Swift class/struct that owns this view
 * @property {string|null} mappedModule - Module/target name ('WikiApp', 'SharedUI', null)
 * @property {number} confidence - 0.0–1.0 confidence score
 * @property {Evidence[]} evidence - All evidence supporting the mapping
 * @property {Provenance} provenance - 'auto' or 'manual'
 * @property {boolean} ambiguous - True if multiple candidates score within 0.15 of each other
 * @property {Candidate[]} candidates - All candidates considered (top N)
 *
 * // --- Existing fields (preserved) ---
 * @property {string|null} parentClass - UIKit parent class from source
 * @property {Object|null} dependencies - Extracted imports, injected deps, etc.
 * @property {Object|null} hierarchy - Extracted subview hierarchy from source
 * @property {string|null} parentId - Parent node ID in AX tree
 */

/**
 * Create an enriched node from an AX node and its best candidate.
 */
export function createEnrichedNode(axNode, candidates) {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0] || null;
  const runnerUp = sorted[1] || null;

  // Ambiguous if top two candidates are within 0.15 of each other
  const ambiguous =
    best && runnerUp ? Math.abs(best.confidence - runnerUp.confidence) < 0.15 : false;

  return {
    // AX fields (pass through)
    id: axNode.id,
    className: axNode.className,
    axeType: axNode.axeType,
    name: axNode.name,
    identifier: axNode.identifier,
    label: axNode.label,
    frame: axNode.frame,
    role: axNode.role,
    parentId: axNode.parentId,
    enabled: axNode.enabled,

    // Mapping fields
    file: best?.file ?? null,
    fileLine: best?.line ?? null,
    ownerType: best?.ownerType ?? null,
    mappedModule: best?.module ?? null,
    confidence: best?.confidence ?? 0,
    evidence: best?.evidence ?? [],
    provenance: best?.evidence?.some((e) => e.signal === SIGNAL_TYPES.MANUAL_OVERRIDE)
      ? "manual"
      : "auto",
    ambiguous,
    candidates: sorted.slice(0, 5), // Keep top 5 for diagnostics

    // Legacy fields
    parentClass: null,
    dependencies: null,
    hierarchy: null,
    mapped: best ? best.confidence >= CONFIDENCE.MEDIUM : false,
  };
}

// ---------------------------------------------------------------------------
// Override Entry — manual mapping from user
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} OverrideEntry
 * @property {string} pattern - Glob or regex matching AX identifier(s)
 * @property {string} file - Source file path (relative to project root)
 * @property {number|null} line - Optional line number
 * @property {string|null} ownerType - Optional Swift type name
 * @property {string|null} module - Optional module name
 */

// ---------------------------------------------------------------------------
// Module Index Entry — from target graph
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ModuleEntry
 * @property {string} name - Module/target name
 * @property {string[]} sources - Source file paths belonging to this module
 * @property {string[]} dependencies - Other module names this module depends on
 * @property {string|null} product - Product type ('framework', 'app', 'library')
 */
