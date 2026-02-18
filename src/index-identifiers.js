#!/usr/bin/env node

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  buildSourceIndexes,
  summarizeIndexes,
  setStateDir,
  buildIdentifierRegistry,
  saveIdentifierRegistry,
} from "./mapping/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = dirname(__dirname);

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));

const projectPath = positional[0];
const resolvedProjectPath = projectPath ? resolve(projectPath) : null;

const outFlag = args.find((arg) => arg.startsWith("--out="));
const outputPath = outFlag
  ? resolve(outFlag.slice("--out=".length))
  : resolvedProjectPath
    ? join(resolvedProjectPath, ".claude", "identifier-registry.json")
    : null;

if (!resolvedProjectPath) {
  console.error("Usage: node src/index-identifiers.js <projectPath> [--out=/path/to/identifier-registry.json]");
  process.exit(1);
}

setStateDir(join(toolRoot, "state"));

const indexes = buildSourceIndexes(resolvedProjectPath);
const summary = summarizeIndexes(indexes);
const registry = buildIdentifierRegistry(resolvedProjectPath, indexes);

saveIdentifierRegistry(registry, outputPath);

console.error(
  `[identifier-registry] strategy=${summary.strategy} modules=${summary.modules} swiftFiles=${summary.swiftFiles}`
);
console.error(
  `[identifier-registry] exact=${registry.summary.exactIdentifiers} patterns=${registry.summary.patternIdentifiers}`
);
console.log(JSON.stringify({
  outputPath,
  projectPath: resolvedProjectPath,
  summary: registry.summary,
}, null, 2));
