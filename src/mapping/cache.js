/**
 * Index Cache
 *
 * Caches source indexes (identifier, class, module) by file mtime fingerprint.
 * On subsequent scans, skips re-indexing if no Swift files have changed.
 *
 * Cache location: state/index-cache.json
 */

import { readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const CACHE_FILE = "index-cache.json";

/**
 * Compute a fingerprint of all Swift file mtimes in a project.
 * Changes when any Swift file is added, removed, or modified.
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
export function loadCache(stateDir, fingerprint) {
  const cachePath = join(stateDir, CACHE_FILE);
  if (!existsSync(cachePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (raw.fingerprint === fingerprint) {
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
export function saveCache(stateDir, fingerprint, data) {
  const cachePath = join(stateDir, CACHE_FILE);
  try {
    writeFileSync(
      cachePath,
      JSON.stringify({ fingerprint, timestamp: Date.now(), data }),
      "utf-8"
    );
  } catch (err) {
    console.error(`[cache] Failed to write cache: ${err.message}`);
  }
}
