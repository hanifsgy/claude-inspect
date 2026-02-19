/**
 * Index Cache
 *
 * Caches source indexes (identifier, class, module) by file mtime fingerprint.
 * On subsequent scans, skips re-indexing if no Swift files have changed.
 *
 * Cache location: state/index-cache.json
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

const CACHE_FILE = "index-cache.json";

/**
 * Compute a fingerprint of all Swift files using content hashing.
 * Uses mtime as a fast pre-check: only reads file content when mtime changes.
 * This avoids false cache invalidations when files are touched but not modified.
 *
 * @param {string[]} files - Absolute paths to Swift files
 * @returns {string} hex fingerprint
 */
export function computeFingerprint(files) {
  const hash = createHash("md5");

  // Sort for deterministic ordering
  const sorted = [...files].sort();

  for (const file of sorted) {
    try {
      const content = readFileSync(file, "utf-8");
      const contentHash = createHash("md5").update(content).digest("hex");
      hash.update(`${file}:${contentHash}\n`);
    } catch {
      hash.update(`${file}:missing\n`);
    }
  }

  return hash.digest("hex");
}

/**
 * Compute a fast mtime-only fingerprint for quick staleness checks.
 * Use this when you only need to know if files might have changed,
 * without reading file contents.
 *
 * @param {string[]} files - Absolute paths to Swift files
 * @returns {string} hex fingerprint
 */
export function computeMtimeFingerprint(files) {
  const hash = createHash("md5");
  const sorted = [...files].sort();

  for (const file of sorted) {
    try {
      const stat = statSync(file);
      hash.update(`${file}:${stat.mtimeMs}\n`);
    } catch {
      hash.update(`${file}:missing\n`);
    }
  }

  return hash.digest("hex");
}

/**
 * Load cached index data if the fingerprint matches.
 *
 * @param {string} stateDir - Directory for cache file (e.g. state/)
 * @param {string} fingerprint - Current file fingerprint
 * @returns {Object|null} Cached data or null if stale/missing
 */
export function loadCache(stateDir, fingerprint, projectKey = null) {
  const cachePath = join(stateDir, CACHE_FILE);
  if (!existsSync(cachePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    const cacheProjectKey = raw.projectKey || null;
    if (raw.fingerprint === fingerprint && cacheProjectKey === (projectKey || null)) {
      return raw.data;
    }
    return null; // fingerprint mismatch — stale
  } catch {
    return null;
  }
}

/**
 * Save index data to cache with fingerprint.
 *
 * @param {string} stateDir
 * @param {string} fingerprint
 * @param {Object} data - The index data to cache
 */
export function saveCache(stateDir, fingerprint, data, projectKey = null) {
  const cachePath = join(stateDir, CACHE_FILE);
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(
      cachePath,
      JSON.stringify({ fingerprint, projectKey, timestamp: Date.now(), data }),
      "utf-8"
    );
  } catch (err) {
    console.error(`[cache] Failed to write cache: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Incremental Index Updates
// ---------------------------------------------------------------------------

/**
 * Compute per-file content hashes for incremental updates.
 *
 * @param {string[]} files - Absolute paths to Swift files
 * @returns {Map<string, string>} file path -> content hash
 */
export function computeFileHashes(files) {
  const hashes = new Map();
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      const hash = createHash("md5").update(content).digest("hex");
      hashes.set(file, hash);
    } catch {
      hashes.set(file, "missing");
    }
  }
  return hashes;
}

/**
 * Save cache with per-file hashes for incremental updates.
 *
 * @param {string} stateDir
 * @param {Object} data - The index data
 * @param {Map<string, string>} fileHashes - Per-file content hashes
 */
export function saveIncrementalCache(stateDir, data, fileHashes, projectKey = null) {
  const cachePath = join(stateDir, CACHE_FILE);
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(
      cachePath,
      JSON.stringify({
        projectKey,
        timestamp: Date.now(),
        data,
        fileHashes: Object.fromEntries(fileHashes),
      }),
      "utf-8"
    );
  } catch (err) {
    console.error(`[cache] Failed to write incremental cache: ${err.message}`);
  }
}

/**
 * Load incremental cache and detect changed files.
 *
 * @param {string} stateDir
 * @param {string[]} currentFiles - Current list of Swift files
 * @param {string} projectKey
 * @returns {{ cached: Object|null, changed: string[], added: string[], removed: string[] }}
 */
export function loadIncrementalCache(stateDir, currentFiles, projectKey = null) {
  const cachePath = join(stateDir, CACHE_FILE);
  const result = { cached: null, changed: [], added: [], removed: [] };

  if (!existsSync(cachePath)) {
    result.added = [...currentFiles];
    return result;
  }

  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    const cacheProjectKey = raw.projectKey || null;

    if (cacheProjectKey !== (projectKey || null)) {
      // Different project - treat as fresh
      result.added = [...currentFiles];
      return result;
    }

    result.cached = raw.data;
    const cachedHashes = raw.fileHashes || {};
    const cachedFiles = new Set(Object.keys(cachedHashes));
    const currentFileSet = new Set(currentFiles);

    // Find added files (not in cache)
    for (const file of currentFiles) {
      if (!cachedFiles.has(file)) {
        result.added.push(file);
      }
    }

    // Find removed files (in cache but not current)
    for (const file of cachedFiles) {
      if (!currentFileSet.has(file)) {
        result.removed.push(file);
      }
    }

    // Find changed files (hash mismatch)
    for (const file of currentFiles) {
      if (cachedHashes[file]) {
        try {
          const content = readFileSync(file, "utf-8");
          const currentHash = createHash("md5").update(content).digest("hex");
          if (currentHash !== cachedHashes[file]) {
            result.changed.push(file);
          }
        } catch {
          result.changed.push(file); // File became unreadable
        }
      }
    }

    return result;
  } catch {
    result.added = [...currentFiles];
    return result;
  }
}

/**
 * Merge incremental index updates with cached data.
 *
 * @param {Object} cachedData - Previous cached indexes
 * @param {Object} newData - New indexes from changed/added files
 * @param {string[]} removedFiles - Files to remove from cache
 * @returns {Object} Merged indexes
 */
export function mergeIndexData(cachedData, newData, removedFiles) {
  if (!cachedData) return newData;
  if (!newData) return cachedData;

  // Remove entries from deleted files
  const removedSet = new Set(removedFiles);

  // Helper to filter entries by file
  const filterByFile = (map) => {
    if (!map || !(map instanceof Map)) return map;
    const filtered = new Map();
    for (const [key, entries] of map) {
      const kept = (Array.isArray(entries) ? entries : []).filter(
        (e) => !removedSet.has(e.file)
      );
      if (kept.length > 0) {
        filtered.set(key, kept);
      }
    }
    return filtered;
  };

  // Start with filtered cached data
  const merged = {
    identifierIndex: filterByFile(cachedData.identifierIndex),
    classIndex: filterByFile(cachedData.classIndex),
    labelIndex: filterByFile(cachedData.labelIndex),
  };

  // Merge new data
  if (newData.identifierIndex) {
    for (const [key, entries] of newData.identifierIndex) {
      const existing = merged.identifierIndex.get(key) || [];
      merged.identifierIndex.set(key, [...existing, ...entries]);
    }
  }

  if (newData.classIndex) {
    for (const [key, entries] of newData.classIndex) {
      const existing = merged.classIndex.get(key) || [];
      // Remove old entries from same file, add new ones
      const newFiles = new Set(entries.map((e) => e.file));
      const filtered = existing.filter((e) => !newFiles.has(e.file));
      merged.classIndex.set(key, [...filtered, ...entries]);
    }
  }

  if (newData.labelIndex) {
    for (const [key, entries] of newData.labelIndex) {
      const existing = merged.labelIndex.get(key) || [];
      const newFiles = new Set(entries.map((e) => e.file));
      const filtered = existing.filter((e) => !newFiles.has(e.file));
      merged.labelIndex.set(key, [...filtered, ...entries]);
    }
  }

  return merged;
}
