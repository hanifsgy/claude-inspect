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
    tryXcodeWorkspace,
    tryXcodeproj,
    tryDirectoryScan, // fallback
  ];

  for (const strategy of strategies) {
    const found = strategy(projectDir, index);
    if (found) {
      index.buildReverseLookup();
      if (index.fileToModule.size > 0) {
        index.strategy = strategy.name;
        break;
      }

      // Strategy found project structure but produced zero source files.
      // Clear intermediate state and continue to fallback strategies.
      index.modules.clear();
      index.fileToModule.clear();
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
    for (const sourcePath of target.sourceDirs) {
      collectXcodeGenSourcePath(projectDir, sourcePath, sources);
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
        const normalizedPath = normalizeSourcePath(srcItem[1]);
        if (normalizedPath) currentTarget.sourceDirs.push(normalizedPath);
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

function collectXcodeGenSourcePath(projectDir, sourcePath, sources) {
  if (!sourcePath) return;

  const normalized = normalizeSourcePath(sourcePath);
  if (!normalized) return;

  const wildcardIdx = normalized.search(/[\*\{\[]/);
  const basePath = wildcardIdx >= 0 ? normalized.slice(0, wildcardIdx) : normalized;
  const trimmedBase = basePath.replace(/^\/+|\/+$/g, "");
  const absBase = join(projectDir, trimmedBase || ".");

  if (existsSync(absBase)) {
    const stat = statSync(absBase);
    if (stat.isDirectory()) {
      collectSwiftFiles(absBase, projectDir, sources);
      return;
    }
    if (stat.isFile() && extname(absBase) === ".swift") {
      sources.push(relative(projectDir, absBase));
      return;
    }
  }

  // Last-resort fallback for non-standard globs: walk project and filter by prefix/suffix.
  if (normalized.includes("*")) {
    const all = [];
    collectSwiftFiles(projectDir, projectDir, all);
    const globRegex = new RegExp(
      "^" + normalizeGlobPattern(normalized).replace(/\*/g, ".*") + "$"
    );
    for (const file of all) {
      if (globRegex.test(file)) sources.push(file);
    }
  }
}

function normalizeSourcePath(value) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^path:\s*/, "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/#.*$/, "")
    .trim();
}

function normalizeGlobPattern(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
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
// Strategy: .xcworkspace (multi-project workspace)
// ---------------------------------------------------------------------------

function tryXcodeWorkspace(projectDir, index) {
  // Find *.xcworkspace directory at the project root (skip any inside .xcodeproj bundles)
  let workspacePath = null;
  try {
    const entries = readdirSync(projectDir);
    for (const entry of entries) {
      if (entry.endsWith(".xcworkspace")) {
        workspacePath = join(projectDir, entry);
        break;
      }
    }
  } catch {
    return false;
  }

  if (!workspacePath) return false;

  const contentsPath = join(workspacePath, "contents.xcworkspacedata");
  if (!existsSync(contentsPath)) return false;

  let contents;
  try {
    contents = readFileSync(contentsPath, "utf-8");
  } catch {
    return false;
  }

  // Extract <FileRef location="group:relative/path"> entries
  const fileRefRe = /<FileRef\s+location\s*=\s*"group:([^"]+)"\s*\/?>/g;
  let match;
  const xcodeprojPaths = [];

  while ((match = fileRefRe.exec(contents)) !== null) {
    const ref = match[1];
    // Only process .xcodeproj references, skip Pods
    if (ref.endsWith(".xcodeproj") && !ref.includes("Pods")) {
      xcodeprojPaths.push(ref);
    }
  }

  if (xcodeprojPaths.length === 0) return false;

  let totalTargets = 0;

  for (const projRelPath of xcodeprojPaths) {
    const projAbsPath = join(projectDir, projRelPath);
    const pbxPath = join(projAbsPath, "project.pbxproj");

    if (!existsSync(pbxPath)) continue;

    let pbxContent;
    try {
      pbxContent = readFileSync(pbxPath, "utf-8");
    } catch {
      continue;
    }

    // The subproject root is the parent directory of the .xcodeproj
    const subprojectRoot = dirname(projAbsPath);
    // For workspace-relative paths, compute the relative prefix from projectDir
    const relPrefix = relative(projectDir, subprojectRoot);

    const targets = parsePbxprojTargets(pbxContent, subprojectRoot);

    for (const target of targets) {
      // Rebase source paths to be relative to the workspace root (projectDir)
      const rebasedSources = target.sources.map((s) =>
        relPrefix ? join(relPrefix, s) : s
      );
      index.addModule(
        target.name,
        rebasedSources,
        target.dependencies,
        target.type
      );
      totalTargets++;
    }
  }

  return totalTargets > 0;
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

  // Build full file-reference path map once for the whole project
  const fileRefPathMap = buildFileRefPathMap(pbx);

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
      sources = resolveSourcesFromPhases(pbx, phaseIds, fileRefPathMap);
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

/**
 * Traverse PBXGroup hierarchy to resolve fileRef IDs to full project-relative paths.
 * Walks from the mainGroup root, accumulating directory prefixes so that
 * "ViewController.swift" inside Sources/Feature/ becomes "Sources/Feature/ViewController.swift".
 *
 * @param {string} pbx - Raw pbxproj content
 * @returns {Map<string, string>} fileRef ID → full relative path
 */
function buildFileRefPathMap(pbx) {
  const pathMap = new Map();

  // Find mainGroup ID from project root object
  const rootObjMatch = pbx.match(/rootObject\s*=\s*([A-Fa-f0-9]{20,})/);
  if (!rootObjMatch) return pathMap;

  const rootObjId = rootObjMatch[1];
  const rootBlock = extractObjectBlock(pbx, rootObjId);
  if (!rootBlock) return pathMap;

  const mainGroupId = extractField(rootBlock, "mainGroup");
  if (!mainGroupId) return pathMap;

  // Parse all PBXGroup entries into a lookup
  const groupStart = pbx.indexOf("/* Begin PBXGroup section */");
  const groupEnd = pbx.indexOf("/* End PBXGroup section */");
  if (groupStart < 0 || groupEnd < 0) return pathMap;

  const groupSection = pbx.slice(groupStart, groupEnd);
  const groups = new Map(); // id → { path, children[] }

  const groupRe = /([A-Fa-f0-9]{20,})\s*(?:\/\*[^*]*\*\/\s*)?=\s*\{/g;
  let gm;
  while ((gm = groupRe.exec(groupSection)) !== null) {
    const blockStart = gm.index + gm[0].length;
    const block = extractBlock(groupSection, blockStart);
    if (!block) continue;

    const path = extractField(block, "path");
    const children = extractList(block, "children");
    groups.set(gm[1], { path: path || null, children });
  }

  // Build a set of all known PBXFileReference IDs with their basenames
  const fileRefStart = pbx.indexOf("/* Begin PBXFileReference section */");
  const fileRefEnd = pbx.indexOf("/* End PBXFileReference section */");
  const fileRefs = new Map(); // id → path (basename from PBXFileReference)
  if (fileRefStart >= 0 && fileRefEnd >= 0) {
    const frSection = pbx.slice(fileRefStart, fileRefEnd);
    const frRe = /([A-Fa-f0-9]{20,})\s*\/\*[^*]*\*\/\s*=\s*\{([^}]*)\}/g;
    let fm;
    while ((fm = frRe.exec(frSection)) !== null) {
      const p = extractField(fm[2], "path");
      if (p) fileRefs.set(fm[1], p);
    }
  }

  // DFS from mainGroup, accumulating path prefix
  function walk(groupId, prefix) {
    const group = groups.get(groupId);
    if (!group) return;

    const currentPath = group.path
      ? (prefix ? prefix + "/" + group.path : group.path)
      : prefix;

    for (const childId of group.children) {
      if (groups.has(childId)) {
        // Child is a group — recurse
        walk(childId, currentPath);
      } else if (fileRefs.has(childId)) {
        // Child is a file reference — record full path
        const fileName = fileRefs.get(childId);
        const fullPath = currentPath ? currentPath + "/" + fileName : fileName;
        pathMap.set(childId, fullPath);
      }
    }
  }

  const mainGroupClean = mainGroupId.match(/^[A-Fa-f0-9]{20,}/)?.[0];
  if (mainGroupClean) {
    walk(mainGroupClean, "");
  }

  return pathMap;
}

/** Extract an object block by its ID from anywhere in the pbxproj */
function extractObjectBlock(pbx, objectId) {
  const re = new RegExp(objectId + "\\s*(?:\\/\\*[^*]*\\*\\/\\s*)?=\\s*\\{");
  const m = re.exec(pbx);
  if (!m) return null;
  const blockStart = m.index + m[0].length;
  return extractBlock(pbx, blockStart);
}

/** Resolve traditional PBXSourcesBuildPhase files to source paths */
function resolveSourcesFromPhases(pbx, phaseIds, fileRefPathMap = new Map()) {
  const sources = [];

  // Build fileRef → path map
  const fileRefs = new Map();
  const frSectionStart = pbx.indexOf("/* Begin PBXFileReference section */");
  const frSectionEnd = pbx.indexOf("/* End PBXFileReference section */");
  const frSection = pbx.slice(
    frSectionStart >= 0 ? frSectionStart : 0,
    frSectionEnd >= 0 ? frSectionEnd : pbx.length
  );
  const frRe = /([A-Fa-f0-9]{20,})\s*\/\*[^*]*\*\/\s*=\s*\{([^}]*)\}/g;
  let m;
  while ((m = frRe.exec(frSection)) !== null) {
    const path = extractField(m[2], "path");
    if (path) fileRefs.set(m[1], path);
  }

  // Build buildFile → fileRef map
  const buildFiles = new Map();
  const bfSectionStart = pbx.indexOf("/* Begin PBXBuildFile section */");
  const bfSectionEnd = pbx.indexOf("/* End PBXBuildFile section */");
  const bfSection = pbx.slice(
    bfSectionStart >= 0 ? bfSectionStart : 0,
    bfSectionEnd >= 0 ? bfSectionEnd : pbx.length
  );
  const bfRe = /([A-Fa-f0-9]{20,})\s*\/\*[^*]*\*\/\s*=\s*\{([^}]*)\}/g;
  while ((m = bfRe.exec(bfSection)) !== null) {
    const rawFileRef = extractField(m[2], "fileRef");
    const fileRef = rawFileRef?.match(/^[A-Fa-f0-9]{20,}/)?.[0] ?? null;
    if (fileRef) buildFiles.set(m[1], fileRef);
  }

  // Find PBXSourcesBuildPhase matching our phase IDs
  const spSectionStart = pbx.indexOf("/* Begin PBXSourcesBuildPhase section */");
  const spSectionEnd = pbx.indexOf("/* End PBXSourcesBuildPhase section */");
  const spSection = pbx.slice(
    spSectionStart >= 0 ? spSectionStart : 0,
    spSectionEnd >= 0 ? spSectionEnd : pbx.length
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
      // Prefer full path from PBXGroup hierarchy; fall back to PBXFileReference basename
      const fullPath = fileRefPathMap.get(frId);
      const fallbackPath = fileRefs.get(frId);
      const resolvedPath = fullPath || fallbackPath;
      if (resolvedPath?.endsWith(".swift")) sources.push(resolvedPath);
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
