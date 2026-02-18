/**
 * Candidate Matcher — weighted signal-based matching of AX nodes to source code.
 *
 * Takes AX nodes from the running simulator and matches them against:
 *   - String literal index (accessibilityIdentifier assignments)
 *   - Class definition index (class/struct declarations)
 *   - Module index (target/module ownership)
 *
 * Produces ranked candidates with confidence scores using the contract model.
 */

import { readFileSync, existsSync } from "fs";
import { join, relative, extname, dirname } from "path";
import {
  SIGNAL_TYPES,
  createEvidence,
  computeConfidence,
  createEnrichedNode,
} from "./contract.js";
import { buildModuleIndex } from "./module-indexer.js";
import { computeFingerprint, loadCache, saveCache } from "./cache.js";

// ---------------------------------------------------------------------------
// Source Indexes — built once per project scan
// ---------------------------------------------------------------------------

/** @type {string|null} */
let _stateDir = null;

/** Set the state directory for caching (call before buildSourceIndexes). */
export function setStateDir(dir) {
  _stateDir = dir;
}

/**
 * Build all source-level indexes needed for matching.
 * Uses file-mtime cache to skip re-indexing when no Swift files have changed.
 *
 * @param {string} projectDir
 * @returns {SourceIndexes}
 */
export function buildSourceIndexes(projectDir) {
  const moduleIndex = buildModuleIndex(projectDir);

  // Collect all Swift files from the module index
  const swiftFiles = new Set();
  for (const [, mod] of moduleIndex.modules) {
    for (const src of mod.sources) {
      swiftFiles.add(join(projectDir, src));
    }
  }

  const fileList = [...swiftFiles];
  const fingerprint = computeFingerprint(fileList);

  // Try loading from cache
  const stateDir = _stateDir || join(dirname(projectDir), "state");
  const cached = loadCache(stateDir, fingerprint);

  if (cached) {
    console.error(`[cache] Source indexes loaded from cache (${fileList.length} files unchanged)`);
    // Reconstruct Maps from cached plain objects
    return {
      moduleIndex,
      classIndex: reconstructMap(cached.classIndex),
      identifierIndex: reconstructMap(cached.identifierIndex),
      labelIndex: reconstructMap(cached.labelIndex),
      projectDir,
    };
  }

  // Build fresh indexes
  console.error(`[cache] Building fresh source indexes (${fileList.length} files)`);
  const classIndex = buildClassIndex(fileList, projectDir);
  const identifierIndex = buildIdentifierIndex(fileList, projectDir);
  const labelIndex = buildLabelIndex(fileList, projectDir);

  // Save to cache
  saveCache(stateDir, fingerprint, {
    classIndex: serializeMap(classIndex),
    identifierIndex: serializeMap(identifierIndex),
    labelIndex: serializeMap(labelIndex),
  });

  return { moduleIndex, classIndex, identifierIndex, labelIndex, projectDir };
}

export function summarizeIndexes(indexes) {
  const moduleCount = indexes.moduleIndex.modules.size;
  const swiftFileCount = [...indexes.moduleIndex.modules.values()].reduce(
    (sum, mod) => sum + mod.sources.length,
    0
  );

  return {
    strategy: indexes.moduleIndex.strategy,
    modules: moduleCount,
    swiftFiles: swiftFileCount,
    classKeys: indexes.classIndex.size,
    identifierKeys: indexes.identifierIndex.size,
    labelKeys: indexes.labelIndex.size,
  };
}

function serializeMap(map) {
  const obj = {};
  for (const [key, value] of map) {
    obj[key] = value;
  }
  return obj;
}

function reconstructMap(obj) {
  const map = new Map();
  for (const [key, value] of Object.entries(obj)) {
    map.set(key, value);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Class Index — maps Swift class names to file:line
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ClassEntry
 * @property {string} name
 * @property {string} file - relative path
 * @property {number} line
 * @property {string} type - 'class' | 'struct' | 'enum'
 * @property {string|null} parentClass
 * @property {string[]} protocols
 */

function buildClassIndex(swiftFiles, projectDir) {
  /** @type {Map<string, ClassEntry[]>} className → entries (may have duplicates across modules) */
  const index = new Map();

  const classRegex =
    /^[ \t]*((?:public|private|internal|open|final)\s+)*(class|struct|enum)\s+(\w+)\s*(?::\s*([^{]+))?/gm;

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    classRegex.lastIndex = 0;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const type = match[2];
      const name = match[3];
      const inheritance = match[4] ? match[4].trim() : "";
      const parents = inheritance.split(",").map((s) => s.trim()).filter(Boolean);

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split("\n").length;

      const entry = {
        name,
        file: relative(projectDir, file),
        line,
        type,
        parentClass: parents[0] || null,
        protocols: parents.slice(1),
      };

      const list = index.get(name) || [];
      list.push(entry);
      index.set(name, list);
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// Identifier Index — maps accessibilityIdentifier string literals to source
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} IdentifierEntry
 * @property {string} literal - The string value
 * @property {string} file - relative path
 * @property {number} line
 * @property {string} context - The surrounding code line
 * @property {string|null} ownerType - Enclosing class/struct name if detectable
 * @property {'exact'|'pattern'} matchType
 */

function buildIdentifierIndex(swiftFiles, projectDir) {
  /** @type {Map<string, IdentifierEntry[]>} literal → entries */
  const index = new Map();

  // Patterns we look for:
  // 1. .accessibilityIdentifier = "foo.bar"
  // 2. accessibilityIdentifier = "foo.bar"
  // 3. .accessibilityIdentifier("foo.bar")  (SwiftUI modifier)
  const idRegex =
    /\.?accessibilityIdentifier\s*[=(]\s*"([^"]+)"/g;

  // Also capture dynamic patterns like "command.library.card.\(index)"
  const dynamicIdRegex =
    /\.?accessibilityIdentifier\s*[=(]\s*"([^"]*\\[^"]*)"/ ;

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const relFile = relative(projectDir, file);
    const lines = content.split("\n");
    const ownerStack = detectOwnerTypes(content);

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      idRegex.lastIndex = 0;

      let match;
      while ((match = idRegex.exec(text)) !== null) {
        const literal = match[1];
        const ownerType = findOwnerAtLine(ownerStack, i + 1);

        // Check if this is a dynamic pattern (contains string interpolation)
        const isPattern = literal.includes("\\(");

        const entry = {
          literal: isPattern ? literal : literal,
          file: relFile,
          line: i + 1,
          context: text.trim(),
          ownerType,
          matchType: isPattern ? "pattern" : "exact",
        };

        // For patterns, also store a normalized prefix for prefix matching
        if (isPattern) {
          // "command.library.card.\(index)" → prefix "command.library.card."
          const prefix = literal.split("\\(")[0];
          const prefixEntries = index.get(`prefix:${prefix}`) || [];
          prefixEntries.push(entry);
          index.set(`prefix:${prefix}`, prefixEntries);
        }

        const list = index.get(literal) || [];
        list.push(entry);
        index.set(literal, list);
      }
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// Label Index — maps other string literals (for label matching)
// ---------------------------------------------------------------------------

function buildLabelIndex(swiftFiles, projectDir) {
  /** @type {Map<string, Array<{file: string, line: number, context: string, ownerType: string|null}>>} */
  const index = new Map();
  const stringRegex = /"([^"\\]{3,})"/g; // Only 3+ char literals

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const relFile = relative(projectDir, file);
    const lines = content.split("\n");
    const ownerStack = detectOwnerTypes(content);

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      // Skip comments and imports
      if (/^\s*\/\//.test(text) || /^\s*import\b/.test(text)) continue;
      // Skip accessibilityIdentifier lines (already indexed)
      if (/accessibilityIdentifier/.test(text)) continue;

      stringRegex.lastIndex = 0;
      let match;
      while ((match = stringRegex.exec(text)) !== null) {
        const literal = match[1];
        // Skip common non-label strings
        if (/^[#@{}\[\]]/.test(literal)) continue;
        if (/^https?:/.test(literal)) continue;

        const list = index.get(literal) || [];
        list.push({
          file: relFile,
          line: i + 1,
          context: text.trim(),
          ownerType: findOwnerAtLine(ownerStack, i + 1),
        });
        index.set(literal, list);
      }
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// Owner Detection — determine which class/struct a line belongs to
// ---------------------------------------------------------------------------

function detectOwnerTypes(content) {
  const owners = []; // { name, startLine, endLine }
  const classRegex =
    /^[ \t]*((?:public|private|internal|open|final)\s+)*(class|struct|enum)\s+(\w+)/gm;

  const lines = content.split("\n");
  let match;
  classRegex.lastIndex = 0;

  while ((match = classRegex.exec(content)) !== null) {
    const name = match[3];
    const startLine = content.slice(0, match.index).split("\n").length;

    // Find the closing brace by tracking brace depth from the opening {
    const afterMatch = content.slice(match.index);
    const braceStart = afterMatch.indexOf("{");
    if (braceStart < 0) continue;

    let depth = 1;
    let pos = match.index + braceStart + 1;
    while (depth > 0 && pos < content.length) {
      if (content[pos] === "{") depth++;
      else if (content[pos] === "}") depth--;
      pos++;
    }

    const endLine = content.slice(0, pos).split("\n").length;
    owners.push({ name, startLine, endLine });
  }

  return owners;
}

function findOwnerAtLine(ownerStack, line) {
  // Find the most specific (innermost) owner for this line
  let best = null;
  for (const owner of ownerStack) {
    if (line >= owner.startLine && line <= owner.endLine) {
      if (!best || (owner.endLine - owner.startLine) < (best.endLine - best.startLine)) {
        best = owner;
      }
    }
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// Matcher — the core matching logic
// ---------------------------------------------------------------------------

/**
 * Match a single AX node against source indexes.
 * Returns array of Candidate objects sorted by confidence.
 *
 * @param {Object} axNode - Normalized AX node from axe.js
 * @param {Object} indexes - From buildSourceIndexes()
 * @returns {import('./contract.js').Candidate[]}
 */
export function matchNode(axNode, indexes) {
  const { identifierIndex, classIndex, labelIndex, moduleIndex, projectDir } = indexes;
  /** @type {Map<string, {file, line, ownerType, module, evidence: Evidence[]}>} */
  const candidateMap = new Map(); // keyed by "file:line"

  function addEvidence(file, line, ownerType, evidence) {
    const key = `${file}:${line}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        file,
        line,
        ownerType: ownerType || null,
        module: moduleIndex.moduleForFile(file),
        evidence: [],
      });
    }
    candidateMap.get(key).evidence.push(evidence);
  }

  // --- Signal 1: IDENTIFIER_EXACT ---
  if (axNode.identifier) {
    const exact = identifierIndex.get(axNode.identifier);
    if (exact) {
      for (const entry of exact) {
        if (entry.matchType === "exact") {
          addEvidence(
            entry.file,
            entry.line,
            entry.ownerType,
            createEvidence(
              SIGNAL_TYPES.IDENTIFIER_EXACT,
              entry.file,
              entry.line,
              `accessibilityIdentifier = "${axNode.identifier}"`
            )
          );
        }
      }
    }
  }

  // --- Signal 2: IDENTIFIER_PREFIX ---
  if (axNode.identifier) {
    // Try matching "command.library.card.0" against pattern "command.library.card.\(index)"
    const parts = axNode.identifier.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join(".") + ".";
      const patterns = identifierIndex.get(`prefix:${prefix}`);
      if (patterns) {
        for (const entry of patterns) {
          addEvidence(
            entry.file,
            entry.line,
            entry.ownerType,
            createEvidence(
              SIGNAL_TYPES.IDENTIFIER_PREFIX,
              entry.file,
              entry.line,
              `Pattern "${entry.literal}" matches prefix "${prefix}"`
            )
          );
        }
        break; // Use the longest matching prefix
      }
    }
  }

  // --- Signal 3: LABEL_EXACT ---
  if (axNode.label) {
    const labelHits = labelIndex.get(axNode.label);
    if (labelHits) {
      for (const entry of labelHits) {
        addEvidence(
          entry.file,
          entry.line,
          entry.ownerType,
          createEvidence(
            SIGNAL_TYPES.LABEL_EXACT,
            entry.file,
            entry.line,
            `Label "${axNode.label}" found in source`
          )
        );
      }
    }
  }

  // --- Signal 4: CLASS_NAME ---
  if (axNode.className) {
    const classHits = classIndex.get(axNode.className);
    if (classHits) {
      for (const entry of classHits) {
        addEvidence(
          entry.file,
          entry.line,
          entry.name,
          createEvidence(
            SIGNAL_TYPES.CLASS_NAME,
            entry.file,
            entry.line,
            `Class "${entry.name}" matches AX type "${axNode.className}"`
          )
        );
      }
    }
  }

  // --- Signal 5: CLASS_INHERITANCE ---
  // Look for classes that inherit from the AX type's UIKit class
  if (axNode.className && axNode.className !== "UIView") {
    for (const [name, entries] of classIndex) {
      for (const entry of entries) {
        if (entry.parentClass === axNode.className) {
          addEvidence(
            entry.file,
            entry.line,
            entry.name,
            createEvidence(
              SIGNAL_TYPES.CLASS_INHERITANCE,
              entry.file,
              entry.line,
              `"${name}: ${axNode.className}" inherits from AX type`
            )
          );
        }
      }
    }
  }

  // --- Signal 6: MODULE_SCOPE boost ---
  // If multiple candidates exist, boost those in the same module as other matched siblings
  // (This is applied after initial scoring, during confidence computation)

  // Compute confidence for each candidate
  const candidates = [];
  for (const [, cand] of candidateMap) {
    candidates.push({
      ...cand,
      confidence: computeConfidence(cand.evidence),
    });
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

function applyModulePriority(candidates, modulePriority) {
  if (!Array.isArray(modulePriority) || modulePriority.length === 0) {
    return candidates;
  }

  return candidates.map((cand) => {
    const idx = modulePriority.indexOf(cand.module);
    if (idx < 0) return cand;

    const alreadyHasBoost = cand.evidence.some(
      (ev) => ev.signal === SIGNAL_TYPES.MODULE_SCOPE && ev.detail.startsWith("Module priority boost")
    );
    if (alreadyHasBoost) return cand;

    const boostedEvidence = [
      ...cand.evidence,
      createEvidence(
        SIGNAL_TYPES.MODULE_SCOPE,
        cand.file,
        cand.line,
        `Module priority boost: ${cand.module} (rank ${idx + 1}/${modulePriority.length})`
      ),
    ];

    return {
      ...cand,
      evidence: boostedEvidence,
      confidence: computeConfidence(boostedEvidence),
    };
  });
}

// ---------------------------------------------------------------------------
// Batch Matcher — match all AX nodes, return enriched nodes
// ---------------------------------------------------------------------------

/**
 * Match all AX nodes and return enriched results.
 *
 * @param {Object[]} flatNodes - Flat list from AXe
 * @param {string} projectDir - Path to Swift project
 * @param {Object[]} [overrides] - Manual override entries
 * @returns {import('./contract.js').EnrichedNode[]}
 */
export function matchAll(flatNodes, projectDir, overrides = [], options = {}) {
  const { modulePriority = [], indexes: prebuiltIndexes = null } = options;
  const indexes = prebuiltIndexes || buildSourceIndexes(projectDir);

  // Build override index
  const overrideIndex = buildOverrideIndex(overrides);

  return flatNodes.map((axNode) => {
    // Check manual overrides first
    const overrideCandidates = findOverrides(axNode, overrideIndex, indexes);
    const autoCandidates = matchNode(axNode, indexes);

    // Merge: overrides take priority
    const allCandidates = applyModulePriority(
      [...overrideCandidates, ...autoCandidates],
      modulePriority
    );

    return createEnrichedNode(axNode, allCandidates);
  });
}

// ---------------------------------------------------------------------------
// Override Support
// ---------------------------------------------------------------------------

function buildOverrideIndex(overrides) {
  // Group by exact match vs glob/regex
  const exact = new Map();
  const patterns = [];

  for (const entry of overrides) {
    if (entry.pattern.includes("*") || entry.pattern.startsWith("/")) {
      patterns.push(entry);
    } else {
      exact.set(entry.pattern, entry);
    }
  }

  return { exact, patterns };
}

function findOverrides(axNode, overrideIndex, indexes) {
  const candidates = [];
  const { moduleIndex } = indexes;

  // Check exact match
  const exactMatch =
    overrideIndex.exact.get(axNode.identifier) ||
    overrideIndex.exact.get(axNode.id) ||
    overrideIndex.exact.get(axNode.name);

  if (exactMatch) {
    candidates.push({
      file: exactMatch.file,
      line: exactMatch.line || 1,
      ownerType: exactMatch.ownerType || null,
      module: exactMatch.module || moduleIndex.moduleForFile(exactMatch.file),
      evidence: [
        createEvidence(
          SIGNAL_TYPES.MANUAL_OVERRIDE,
          exactMatch.file,
          exactMatch.line || 1,
          `Manual override for "${axNode.identifier || axNode.id}"`
        ),
      ],
      confidence: 1.0,
    });
  }

  // Check glob patterns
  for (const pattern of overrideIndex.patterns) {
    const globRegex = new RegExp(
      "^" + pattern.pattern.replace(/\*/g, ".*") + "$"
    );
    const testValues = [axNode.identifier, axNode.id, axNode.name].filter(Boolean);

    if (testValues.some((v) => globRegex.test(v))) {
      candidates.push({
        file: pattern.file,
        line: pattern.line || 1,
        ownerType: pattern.ownerType || null,
        module: pattern.module || moduleIndex.moduleForFile(pattern.file),
        evidence: [
          createEvidence(
            SIGNAL_TYPES.MANUAL_OVERRIDE,
            pattern.file,
            pattern.line || 1,
            `Manual override pattern "${pattern.pattern}"`
          ),
        ],
        confidence: 1.0,
      });
    }
  }

  return candidates;
}
