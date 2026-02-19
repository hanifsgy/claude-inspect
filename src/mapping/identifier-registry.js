import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { SIGNAL_TYPES, createEvidence } from "./contract.js";

export function buildIdentifierRegistry(projectPath, indexes) {
  const resolvedProjectPath = resolve(projectPath);
  const exact = new Map();
  const patterns = [];

  for (const [literal, entries] of indexes.identifierIndex) {
    if (literal.startsWith("prefix:")) continue;

    for (const entry of entries) {
      const record = {
        identifier: literal,
        matchType: entry.matchType || "exact",
        file: entry.file,
        line: entry.line || 1,
        ownerType: entry.ownerType || null,
        module: indexes.moduleIndex.moduleForFile(entry.file),
        context: entry.context || "",
        prefix: entry.matchType === "pattern" ? literal.split("\\(")[0] : null,
      };

      if (record.matchType === "pattern") {
        patterns.push(record);
      } else {
        const list = exact.get(record.identifier) || [];
        list.push(record);
        exact.set(record.identifier, list);
      }
    }
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    projectPath: resolvedProjectPath,
    summary: {
      exactIdentifiers: exact.size,
      patternIdentifiers: patterns.length,
      modules: indexes.moduleIndex.modules.size,
      swiftFiles: indexes.moduleIndex.fileToModule.size,
    },
    entries: {
      exact: Object.fromEntries(exact),
      patterns,
    },
  };
}

export function saveIdentifierRegistry(registry, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(registry, null, 2));
}

export function loadIdentifierRegistry(toolRoot, projectPath, explicitPath = null) {
  const resolvedProjectPath = resolve(projectPath);
  const candidates = [];

  if (explicitPath) {
    candidates.push(explicitPath);
  } else {
    candidates.push(join(resolvedProjectPath, ".claude", "identifier-registry.json"));
    candidates.push(join(toolRoot, "artifacts", "identifier-registry.json"));
  }

  for (const path of candidates) {
    if (!existsSync(path)) continue;

    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      if (raw.projectPath && resolve(raw.projectPath) !== resolvedProjectPath) {
        continue;
      }

      return {
        path,
        registry: raw,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Check if an identifier registry is stale by comparing its generatedAt
 * timestamp against source file mtimes.
 *
 * @param {Object} registry - The loaded registry object
 * @param {string} projectPath - Project root path
 * @param {Object} indexes - Source indexes with moduleIndex
 * @returns {{stale: boolean, reason: string|null}}
 */
export function checkRegistryStaleness(registry, projectPath, indexes) {
  if (!registry?.generatedAt) {
    return { stale: true, reason: "Registry has no generatedAt timestamp" };
  }

  const registryTime = new Date(registry.generatedAt).getTime();
  if (isNaN(registryTime)) {
    return { stale: true, reason: "Registry has invalid generatedAt timestamp" };
  }

  const resolvedProjectPath = resolve(projectPath);
  let newerFiles = 0;

  for (const [, mod] of indexes.moduleIndex.modules) {
    for (const src of mod.sources) {
      try {
        const stat = statSync(join(resolvedProjectPath, src));
        if (stat.mtimeMs > registryTime) {
          newerFiles++;
        }
      } catch {
        // file may have been removed
      }
    }
  }

  if (newerFiles > 0) {
    return { stale: true, reason: `${newerFiles} source file(s) modified after registry generation` };
  }

  return { stale: false, reason: null };
}

export function ensureIdentifierRegistry(toolRoot, projectPath, indexes, { explicitPath = null, autoRefresh = true } = {}) {
  const existing = loadIdentifierRegistry(toolRoot, projectPath, explicitPath);

  if (existing) {
    // Check staleness and auto-refresh if needed
    if (autoRefresh) {
      const { stale, reason } = checkRegistryStaleness(existing.registry, projectPath, indexes);
      if (stale) {
        console.error(`[registry] Stale identifier registry: ${reason}. Auto-refreshing...`);
        const registry = buildIdentifierRegistry(projectPath, indexes);
        saveIdentifierRegistry(registry, existing.path);
        return { path: existing.path, registry, refreshed: true, refreshReason: reason };
      }
    }
    return { ...existing, refreshed: false };
  }

  const outputPath = explicitPath || join(resolve(projectPath), ".claude", "identifier-registry.json");
  const registry = buildIdentifierRegistry(projectPath, indexes);
  saveIdentifierRegistry(registry, outputPath);

  return {
    path: outputPath,
    registry,
    refreshed: true,
    refreshReason: "New registry generated",
  };
}

export function applyIdentifierRegistry(enrichedNodes, registry) {
  const exact = registry?.entries?.exact || {};
  const patterns = Array.isArray(registry?.entries?.patterns)
    ? registry.entries.patterns
    : [];

  let applied = 0;
  let ambiguous = 0;

  const patched = enrichedNodes.map((node) => {
    if (!node?.identifier || node.provenance === "manual") {
      return node;
    }

    let matches = exact[node.identifier] || [];
    if (matches.length === 0) {
      matches = patterns.filter((p) => p.prefix && node.identifier.startsWith(p.prefix));
    }
    if (matches.length === 0) return node;

    const primary = pickBestEntry(matches, node);
    if (!primary) return node;

    const candidates = matches.map((entry) => ({
      file: entry.file,
      line: entry.line,
      ownerType: entry.ownerType,
      module: entry.module,
      confidence: 0.96,
      evidence: [
        createEvidence(
          SIGNAL_TYPES.IDENTIFIER_EXACT,
          entry.file,
          entry.line,
          `Identifier registry ${entry.matchType} match: ${entry.identifier}`
        ),
      ],
    }));

    applied += 1;
    if (matches.length > 1) ambiguous += 1;

    return {
      ...node,
      file: primary.file,
      fileLine: primary.line,
      ownerType: primary.ownerType || node.ownerType,
      mappedModule: primary.module || node.mappedModule,
      confidence: Math.max(node.confidence || 0, 0.96),
      evidence: [
        createEvidence(
          SIGNAL_TYPES.IDENTIFIER_EXACT,
          primary.file,
          primary.line,
          `Identifier registry ${primary.matchType} match: ${primary.identifier}`
        ),
      ],
      provenance: "auto",
      mapped: true,
      ambiguous: matches.length > 1,
      candidates: candidates.slice(0, 5),
    };
  });

  return {
    nodes: patched,
    stats: {
      applied,
      ambiguous,
    },
  };
}

function pickBestEntry(entries, node) {
  if (!entries || entries.length === 0) return null;

  if (node.mappedModule) {
    const scoped = entries.find((entry) => entry.module === node.mappedModule);
    if (scoped) return scoped;
  }

  return entries[0];
}
