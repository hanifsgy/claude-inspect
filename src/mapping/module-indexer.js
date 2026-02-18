/**
 * Module/Target Graph Indexer
 *
 * Discovers project structure from .xcodeproj, XcodeGen project.yml,
 * or SPM Package.swift. Builds an index of:
 *   - Modules (targets) and their source files
 *   - Inter-module dependencies
 *   - File → module reverse lookup
 *
 * @typedef {import('./contract.js').ModuleEntry} ModuleEntry
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, dirname, basename, extname } from "path";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a module index for a project directory.
 * Auto-detects project type and delegates to the appropriate parser.
 *
 * @param {string} projectDir - Root directory of the iOS/Swift project
 * @returns {ModuleIndex}
 */
export function buildModuleIndex(projectDir) {
  const index = new ModuleIndex(projectDir);

  // Try each strategy in order of specificity
  const strategies = [
    tryXcodeGen,
    trySPMPackage,
    tryXcodeproj,
    tryDirectoryScan, // fallback
  ];

  for (const strategy of strategies) {
    const found = strategy(projectDir, index);
    if (found) {
      index.strategy = strategy.name;
      break;
    }
  }

  // Build reverse lookup: file → module
  index.buildReverseLookup();

  return index;
}

// ---------------------------------------------------------------------------
// Module Index class
// ---------------------------------------------------------------------------

export class ModuleIndex {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.strategy = "none";

    /** @type {Map<string, ModuleEntry>} module name → entry */
    this.modules = new Map();

    /** @type {Map<string, string>} relative file path → module name */
    this.fileToModule = new Map();
  }

  addModule(name, sources, dependencies = [], product = null) {
    this.modules.set(name, {
      name,
      sources, // relative paths
      dependencies,
      product,
    });
  }

  buildReverseLookup() {
    this.fileToModule.clear();
    for (const [name, mod] of this.modules) {
      for (const src of mod.sources) {
        this.fileToModule.set(src, name);
      }
    }
  }

  /** Get the module that owns a file (relative path). */
  moduleForFile(relPath) {
    return this.fileToModule.get(relPath) ?? null;
  }

  /** Get all source files for a module. */
  sourcesForModule(moduleName) {
    return this.modules.get(moduleName)?.sources ?? [];
  }

  /** Get modules that a given module depends on. */
  dependenciesOf(moduleName) {
    return this.modules.get(moduleName)?.dependencies ?? [];
  }

  /** Serialize to a plain object for caching. */
  toJSON() {
    const modules = {};
    for (const [name, entry] of this.modules) {
      modules[name] = entry;
    }
    return {
      projectDir: this.projectDir,
      strategy: this.strategy,
      modules,
      moduleCount: this.modules.size,
      fileCount: this.fileToModule.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Strategy: XcodeGen project.yml
// ---------------------------------------------------------------------------

function tryXcodeGen(projectDir, index) {
  const ymlPath = join(projectDir, "project.yml");
  if (!existsSync(ymlPath)) return false;

  let content;
  try {
    content = readFileSync(ymlPath, "utf-8");
  } catch {
    return false;
  }

  // Simple YAML parser for XcodeGen's target format.
  // Handles the common pattern:
  //   targets:
  //     MyApp:
  //       type: application
  //       sources: [Sources/MyApp]
  //       dependencies:
  //         - target: SharedUI
  const targets = parseXcodeGenTargets(content);
  if (targets.length === 0) return false;

  for (const target of targets) {
    const sources = [];
    for (const srcDir of target.sourceDirs) {
      const absDir = join(projectDir, srcDir);
      if (existsSync(absDir)) {
        collectSwiftFiles(absDir, projectDir, sources);
      }
    }
    index.addModule(target.name, sources, target.dependencies, target.type);
  }

  return true;
}

function parseXcodeGenTargets(yaml) {
  const targets = [];

  // Find the targets: block
  const targetsMatch = yaml.match(/^targets:\s*$/m);
  if (!targetsMatch) return targets;

  const afterTargets = yaml.slice(targetsMatch.index + targetsMatch[0].length);
  const lines = afterTargets.split("\n");

  let currentTarget = null;
  let inDeps = false;
  let inSources = false;

  for (const line of lines) {
    // Top-level key ends the targets block
    if (/^\S/.test(line) && !/^\s/.test(line) && line.trim() !== "") break;

    // Target name (2-space indent, no leading dash)
    const targetMatch = line.match(/^  (\w[\w.-]*):\s*$/);
    if (targetMatch) {
      currentTarget = {
        name: targetMatch[1],
        type: null,
        sourceDirs: [],
        dependencies: [],
      };
      targets.push(currentTarget);
      inDeps = false;
      inSources = false;
      continue;
    }

    if (!currentTarget) continue;

    // type: application/framework/library
    const typeMatch = line.match(/^\s+type:\s*(\w+)/);
    if (typeMatch) {
      currentTarget.type = typeMatch[1];
      continue;
    }

    // sources: [path] or sources: (start of list)
    const sourcesInline = line.match(/^\s+sources:\s*\[([^\]]+)\]/);
    if (sourcesInline) {
      currentTarget.sourceDirs = sourcesInline[1].split(",").map((s) => s.trim());
      inSources = false;
      continue;
    }

    const sourcesBlock = line.match(/^\s+sources:\s*$/);
    if (sourcesBlock) {
      inSources = true;
      inDeps = false;
      continue;
    }

    // dependencies: (start of list)
    const depsBlock = line.match(/^\s+dependencies:\s*$/);
    if (depsBlock) {
      inDeps = true;
      inSources = false;
      continue;
    }

    // List item under sources
    if (inSources) {
      const srcItem = line.match(/^\s+-\s*(?:path:\s*)?(.+)/);
      if (srcItem) {
        currentTarget.sourceDirs.push(srcItem[1].trim());
        continue;
      }
      if (/^\s+\w+:/.test(line)) inSources = false;
    }

    // List item under dependencies
    if (inDeps) {
      const depTarget = line.match(/^\s+-\s*target:\s*(\w[\w.-]*)/);
      if (depTarget) {
        currentTarget.dependencies.push(depTarget[1]);
        continue;
      }
      const depPkg = line.match(/^\s+-\s*package:\s*(\w[\w.-]*)/);
      if (depPkg) {
        currentTarget.dependencies.push(depPkg[1]);
        continue;
      }
      if (/^\s+\w+:/.test(line)) inDeps = false;
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Strategy: Swift Package Manager (Package.swift)
// ---------------------------------------------------------------------------

function trySPMPackage(projectDir, index) {
  const pkgPath = join(projectDir, "Package.swift");
  if (!existsSync(pkgPath)) return false;

  let content;
  try {
    content = readFileSync(pkgPath, "utf-8");
  } catch {
    return false;
  }

  // Parse .target(name:, dependencies:, path:) and .executableTarget(...)
  const targetRegex =
    /\.(target|executableTarget|testTarget)\(\s*name:\s*"([^"]+)"(?:.*?dependencies:\s*\[([^\]]*)\])?(?:.*?path:\s*"([^"]+)")?/gs;

  let match;
  while ((match = targetRegex.exec(content)) !== null) {
    const type = match[1];
    const name = match[2];
    const depsRaw = match[3] || "";
    const customPath = match[4];

    // Parse dependencies (handles both string and .target/.product forms)
    const deps = [];
    const depItemRegex = /"([^"]+)"|\.(?:target|product)\(\s*name:\s*"([^"]+)"/g;
    let depMatch;
    while ((depMatch = depItemRegex.exec(depsRaw)) !== null) {
      deps.push(depMatch[1] || depMatch[2]);
    }

    // Resolve source directory
    const srcDir = customPath
      ? join(projectDir, customPath)
      : join(projectDir, "Sources", name);

    const sources = [];
    if (existsSync(srcDir)) {
      collectSwiftFiles(srcDir, projectDir, sources);
    }

    const product = type === "testTarget" ? "test" : type === "executableTarget" ? "executable" : "library";

    index.addModule(name, sources, deps, product);
  }

  return index.modules.size > 0;
}

// ---------------------------------------------------------------------------
// Strategy: .xcodeproj (pbxproj)
// ---------------------------------------------------------------------------

function tryXcodeproj(projectDir, index) {
  // Find .xcodeproj directory
  let xcodeprojDir = null;
  try {
    const entries = readdirSync(projectDir);
    for (const entry of entries) {
      if (entry.endsWith(".xcodeproj")) {
        xcodeprojDir = join(projectDir, entry);
        break;
      }
    }
  } catch {
    return false;
  }

  if (!xcodeprojDir) return false;

  const pbxPath = join(xcodeprojDir, "project.pbxproj");
  if (!existsSync(pbxPath)) return false;

  let content;
  try {
    content = readFileSync(pbxPath, "utf-8");
  } catch {
    return false;
  }

  // Parse PBXNativeTarget sections to find target names and their source build phases
  const targets = parsePbxprojTargets(content, projectDir);

  for (const target of targets) {
    index.addModule(target.name, target.sources, target.dependencies, target.type);
  }

  return targets.length > 0;
}

function parsePbxprojTargets(pbx, projectDir) {
  const targets = [];

  // Parse PBXNativeTarget blocks from the section
  const sectionStart = pbx.indexOf("/* Begin PBXNativeTarget section */");
  const sectionEnd = pbx.indexOf("/* End PBXNativeTarget section */");
  if (sectionStart < 0 || sectionEnd < 0) return targets;

  const section = pbx.slice(sectionStart, sectionEnd);

  // Extract each target block by matching top-level { } within the section
  const blockRegex = /([A-Fa-f0-9]{20,})\s*\/\*\s*([^*]+?)\s*\*\/\s*=\s*\{/g;
  let bm;
  while ((bm = blockRegex.exec(section)) !== null) {
    const blockStart = bm.index + bm[0].length;
    const blockContent = extractBlock(section, blockStart);
    if (!blockContent) continue;

    const name = extractField(blockContent, "name");
    const productType = extractField(blockContent, "productType");
    if (!name) continue;

    // Resolve product type
    const type = productType?.includes("application")
      ? "application"
      : productType?.includes("framework")
        ? "framework"
        : productType?.includes("test")
          ? "test"
          : "library";

    // Try two strategies for finding source files:
    // Strategy A: fileSystemSynchronizedGroups (Xcode 16+)
    const syncGroups = extractList(blockContent, "fileSystemSynchronizedGroups");
    let sources = [];

    if (syncGroups.length > 0) {
      // Resolve each group to a directory path from PBXFileSystemSynchronizedRootGroup
      for (const groupId of syncGroups) {
        const groupPath = resolveGroupPath(pbx, groupId);
        if (groupPath) {
          const absDir = join(projectDir, groupPath);
          if (existsSync(absDir)) {
            collectSwiftFiles(absDir, projectDir, sources);
          }
        }
      }
    }

    // Strategy B: Traditional PBXSourcesBuildPhase with file references
    if (sources.length === 0) {
      const phaseIds = extractList(blockContent, "buildPhases");
      sources = resolveSourcesFromPhases(pbx, phaseIds);
    }

    // Parse target dependencies
    const depIds = extractList(blockContent, "dependencies");
    const deps = resolveTargetDeps(pbx, depIds);

    targets.push({ name, sources, dependencies: deps, type });
  }

  return targets;
}

/** Extract content between matching braces starting just after an opening { */
function extractBlock(text, startAfterBrace) {
  let depth = 1;
  let i = startAfterBrace;
  while (depth > 0 && i < text.length) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  return depth === 0 ? text.slice(startAfterBrace, i - 1) : null;
}

/** Extract a simple field value: name = "Foo" or name = Foo */
function extractField(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*"?([^";\\n]+)"?`, "m");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** Extract a list: key = ( items... ) — returns array of ID strings */
function extractList(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*\\(([^)]*?)\\)`, "s");
  const m = block.match(re);
  if (!m) return [];
  const ids = [];
  const itemRe = /([A-Fa-f0-9]{20,})/g;
  let im;
  while ((im = itemRe.exec(m[1])) !== null) {
    ids.push(im[1]);
  }
  return ids;
}

/** Resolve a fileSystemSynchronizedGroups ID to a path */
function resolveGroupPath(pbx, groupId) {
  // Find the group definition: ID /* name */ = { ... path = "Wiki"; ... }
  const re = new RegExp(
    groupId + "\\s*/\\*[^*]*\\*/\\s*=\\s*\\{([^}]*?)\\}",
    "s"
  );
  const m = pbx.match(re);
  if (!m) return null;
  return extractField(m[1], "path");
}

/** Resolve traditional PBXSourcesBuildPhase files to source paths */
function resolveSourcesFromPhases(pbx, phaseIds) {
  const sources = [];

  // Build fileRef → path map
  const fileRefs = new Map();
  const frSection = pbx.slice(
    pbx.indexOf("/* Begin PBXFileReference section */") || 0,
    pbx.indexOf("/* End PBXFileReference section */") || pbx.length
  );
  const frRe = /([A-Fa-f0-9]{20,})\s*\/\*[^*]*\*\/\s*=\s*\{([^}]*)\}/g;
  let m;
  while ((m = frRe.exec(frSection)) !== null) {
    const path = extractField(m[2], "path");
    if (path) fileRefs.set(m[1], path);
  }

  // Build buildFile → fileRef map
  const buildFiles = new Map();
  const bfSection = pbx.slice(
    pbx.indexOf("/* Begin PBXBuildFile section */") || 0,
    pbx.indexOf("/* End PBXBuildFile section */") || pbx.length
  );
  const bfRe = /([A-Fa-f0-9]{20,})\s*\/\*[^*]*\*\/\s*=\s*\{([^}]*)\}/g;
  while ((m = bfRe.exec(bfSection)) !== null) {
    const fileRef = extractField(m[2], "fileRef");
    if (fileRef) buildFiles.set(m[1], fileRef);
  }

  // Find PBXSourcesBuildPhase matching our phase IDs
  const spSection = pbx.slice(
    pbx.indexOf("/* Begin PBXSourcesBuildPhase section */") || 0,
    pbx.indexOf("/* End PBXSourcesBuildPhase section */") || pbx.length
  );
  for (const phaseId of phaseIds) {
    const re = new RegExp(
      phaseId + "\\s*/\\*[^*]*\\*/\\s*=\\s*\\{([^}]*?)\\}",
      "s"
    );
    const pm = spSection.match(re);
    if (!pm) continue;
    if (!pm[1].includes("PBXSourcesBuildPhase")) continue;

    const fileIds = extractList(pm[1], "files");
    for (const bfId of fileIds) {
      const frId = buildFiles.get(bfId);
      if (!frId) continue;
      const path = fileRefs.get(frId);
      if (path?.endsWith(".swift")) sources.push(path);
    }
  }

  return sources;
}

/** Resolve PBXTargetDependency IDs to target names */
function resolveTargetDeps(pbx, depIds) {
  const deps = [];
  for (const depId of depIds) {
    const re = new RegExp(
      depId + "\\s*/\\*[^*]*\\*/\\s*=\\s*\\{([^}]*?)\\}",
      "s"
    );
    const m = pbx.match(re);
    if (!m) continue;
    const targetId = extractField(m[1], "target");
    if (!targetId) continue;
    // Find target name from PBXNativeTarget
    const nameRe = new RegExp(
      targetId + "\\s*/\\*\\s*([^*]+?)\\s*\\*/",
    );
    const nm = pbx.match(nameRe);
    if (nm) deps.push(nm[1]);
  }
  return deps;
}

// ---------------------------------------------------------------------------
// Strategy: Directory scan fallback
// ---------------------------------------------------------------------------

function tryDirectoryScan(projectDir, index) {
  // No project file found — treat the entire directory as a single module.
  // Use the directory basename as the module name.
  const moduleName = basename(projectDir);
  const sources = [];
  collectSwiftFiles(projectDir, projectDir, sources);

  if (sources.length === 0) return false;

  index.addModule(moduleName, sources, [], "unknown");
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectSwiftFiles(dir, projectRoot, results) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.startsWith(".") ||
      entry === "build" ||
      entry === "DerivedData" ||
      entry === "Pods" ||
      entry === ".build" ||
      entry === "node_modules"
    ) {
      continue;
    }

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      collectSwiftFiles(fullPath, projectRoot, results);
    } else if (extname(entry) === ".swift") {
      results.push(relative(projectRoot, fullPath));
    }
  }
}
