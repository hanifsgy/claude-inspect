import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";

/**
 * Recursively find all .swift files in a directory.
 */
function findSwiftFiles(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip hidden dirs, build dirs, pods, derived data
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
      findSwiftFiles(fullPath, results);
    } else if (extname(entry) === ".swift") {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Phase A: Discover class/struct definitions in Swift files.
 * Returns Map<className, { file, line, type, parentClass }>
 */
function discoverClasses(swiftFiles) {
  const classMap = new Map();

  const declarationRegex =
    /^(\s*)((?:public|private|internal|open|fileprivate|final|override|static)\s+)*(actor|class|struct|enum|protocol)\s+(\w+)/;

  function parseInheritance(text, name) {
    const colonIdx = text.indexOf(":");
    if (colonIdx < 0) return { parentClass: null, protocols: [] };

    let inheritancePart = text.slice(colonIdx + 1);
    const braceIdx = inheritancePart.indexOf("{");
    if (braceIdx >= 0) {
      inheritancePart = inheritancePart.slice(0, braceIdx);
    }

    const whereIdx = inheritancePart.indexOf(" where ");
    if (whereIdx >= 0) {
      inheritancePart = inheritancePart.slice(0, whereIdx);
    }

    const parts = inheritancePart
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return { parentClass: null, protocols: [] };
    }

    return { parentClass: parts[0] || null, protocols: parts.slice(1) };
  }

  function collectDeclaration(lines, startIdx) {
    let fullText = lines[startIdx];
    let braceFound = fullText.includes("{");
    let endIdx = startIdx;

    while (!braceFound && endIdx < lines.length - 1) {
      endIdx++;
      fullText += " " + lines[endIdx].trim();
      braceFound = lines[endIdx].includes("{");
    }

    return { text: fullText, endLine: endIdx + 1, hasBrace: braceFound };
  }

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const typeStack = [];
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const match = line.match(declarationRegex);
      if (match) {
        const indent = match[1] || "";
        const typeKind = match[4];
        const name = match[5];

        const expectedDepth = Math.floor(indent.length / 4);
        while (typeStack.length > expectedDepth) {
          typeStack.pop();
        }

        const { text: fullDecl, hasBrace } = collectDeclaration(lines, i);
        const { parentClass, protocols } = parseInheritance(fullDecl, name);

        const fullName = typeStack.length > 0
          ? `${typeStack[typeStack.length - 1].name}.${name}`
          : name;

        classMap.set(fullName, {
          file,
          line: lineNum,
          type: typeKind,
          parentClass,
          protocols,
          nestingPath: typeStack.map(t => t.name),
          isObjc: /@objc(?:\(|\s|$)/.test(line),
          isObjcMembers: /@objcMembers/.test(line),
        });

        classMap.set(name, {
          file,
          line: lineNum,
          type: typeKind,
          parentClass,
          protocols,
          isObjc: /@objc(?:\(|\s|$)/.test(line),
          isObjcMembers: /@objcMembers/.test(line),
        });

        if (hasBrace) {
          typeStack.push({ name: fullName, line: lineNum, depth: braceDepth });
        }
      }

      for (const ch of line) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") {
          braceDepth--;
          if (typeStack.length > 0 && braceDepth <= typeStack[typeStack.length - 1].depth) {
            typeStack.pop();
          }
        }
      }
    }
  }

  return classMap;
}

/**
 * Build an index of string literals across Swift files.
 * Useful for matching AX identifiers like "home.header.logo" to source lines.
 * Returns Map<literal, Array<{file, line, text}>>
 */
function buildStringLiteralIndex(swiftFiles) {
  const literalMap = new Map();
  const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      stringRegex.lastIndex = 0;

      let match;
      while ((match = stringRegex.exec(text)) !== null) {
        const literal = match[1];
        if (!literal) continue;

        const list = literalMap.get(literal) || [];
        list.push({ file, line: i + 1, text });
        literalMap.set(literal, list);
      }
    }
  }

  return literalMap;
}

function selectBestLiteralMatch(candidates) {
  if (!candidates || candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = scoreLiteralCandidate(best);

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const score = scoreLiteralCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scoreLiteralCandidate(candidate) {
  const text = candidate.text || "";
  let score = 0;
  if (/accessibilityIdentifier/.test(text)) score += 100;
  if (/\.id\(/.test(text)) score += 30;
  if (/text\(/.test(text)) score -= 5;
  if (/print\(/.test(text)) score -= 10;
  return score;
}

/**
 * Phase B: Extract view hierarchy info from a class file.
 */
function extractHierarchy(file, content) {
  const info = {
    subviews: [],
    outlets: [],
    bodyComponents: [],
  };

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // addSubview(someView)
    const addSubview = line.match(/addSubview\((\w+)\)/);
    if (addSubview) {
      info.subviews.push({ name: addSubview[1], line: i + 1 });
    }

    // @IBOutlet weak var label: UILabel!
    const outlet = line.match(/@IBOutlet\s+(?:weak\s+)?var\s+(\w+)\s*:\s*(\w+)/);
    if (outlet) {
      info.outlets.push({ name: outlet[1], type: outlet[2], line: i + 1 });
    }

    // SwiftUI body composition: VStack, HStack, ZStack, List, etc.
    const swiftUIContainer = line.match(
      /\b(VStack|HStack|ZStack|List|ScrollView|NavigationView|NavigationStack|TabView|Form|Group|LazyVStack|LazyHStack|LazyVGrid|LazyHGrid)\b/
    );
    if (swiftUIContainer) {
      info.bodyComponents.push({ type: swiftUIContainer[1], line: i + 1 });
    }
  }

  return info;
}

/**
 * Phase C: Extract dependencies from a Swift file.
 */
function extractDependencies(content) {
  const deps = {
    imports: [],
    injected: [],
    environment: [],
    conformances: [],
  };

  const lines = content.split("\n");

  for (const line of lines) {
    // import statements
    const imp = line.match(/^import\s+(\w+)/);
    if (imp) deps.imports.push(imp[1]);

    // @Environment / @EnvironmentObject
    const env = line.match(/@(?:Environment|EnvironmentObject)\s*(?:\(\\\.(\w+)\))?\s*(?:var\s+)?(\w+)/);
    if (env) {
      deps.environment.push({ key: env[1] || "", name: env[2] });
    }

    // @StateObject, @ObservedObject
    const observed = line.match(/@(?:StateObject|ObservedObject)\s+var\s+(\w+)\s*:\s*(\w+)/);
    if (observed) {
      deps.injected.push({ name: observed[1], type: observed[2] });
    }

    // Init injection: init(something: Type)
    const initParam = line.match(/init\(([^)]+)\)/);
    if (initParam) {
      const params = initParam[1].split(",");
      for (const p of params) {
        const paramMatch = p.trim().match(/(\w+)\s*:\s*(\w+)/);
        if (paramMatch) {
          deps.injected.push({ name: paramMatch[1], type: paramMatch[2] });
        }
      }
    }

    // analyzer-deps comment
    const analyzerDeps = line.match(/\/\/\s*analyzer-deps:\s*(.+)/);
    if (analyzerDeps) {
      deps.injected.push(
        ...analyzerDeps[1].split(",").map((d) => ({ name: d.trim(), type: "manual" }))
      );
    }
  }

  return deps;
}

/**
 * Phase D: Reconcile AXe nodes with source file info.
 * @param {object[]} flatNodes - Flat list from AXe
 * @param {string} projectDir - Path to Swift project
 * @returns {object[]} Enriched nodes
 */
export function reconcile(flatNodes, projectDir) {
  const swiftFiles = findSwiftFiles(projectDir);
  const classMap = discoverClasses(swiftFiles);
  const literalMap = buildStringLiteralIndex(swiftFiles);
  const fileCache = new Map();

  const loadFileData = (file) => {
    if (fileCache.has(file)) return fileCache.get(file);

    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      const fallback = { dependencies: [], hierarchy: null };
      fileCache.set(file, fallback);
      return fallback;
    }

    const loaded = {
      dependencies: extractDependencies(content),
      hierarchy: extractHierarchy(file, content),
    };
    fileCache.set(file, loaded);
    return loaded;
  };

  const enriched = flatNodes.map((node) => {
    let classInfo = classMap.get(node.className);

    // Fallback strategy: match AX identifier/name against Swift string literals,
    // preferring accessibilityIdentifier assignments.
    if (!classInfo) {
      const probes = [];
      if (node.identifier && typeof node.identifier === "string") probes.push(node.identifier);
      if (node.name && typeof node.name === "string" && node.name !== node.identifier) probes.push(node.name);

      for (const probe of probes) {
        const candidates = literalMap.get(probe);
        const best = selectBestLiteralMatch(candidates);
        if (best) {
          classInfo = {
            file: best.file,
            line: best.line,
            type: "literal",
            parentClass: null,
            protocols: [],
            inheritance: "",
          };
          break;
        }
      }
    }

    if (!classInfo) {
      return {
        ...node,
        file: null,
        fileLine: null,
        parentClass: null,
        dependencies: [],
        hierarchy: null,
        mapped: false,
      };
    }

    const fileData = loadFileData(classInfo.file);

    return {
      ...node,
      file: relative(projectDir, classInfo.file),
      fileLine: classInfo.line,
      parentClass: classInfo.parentClass,
      dependencies: fileData.dependencies,
      hierarchy: fileData.hierarchy,
      mapped: true,
    };
  });

  return enriched;
}

/**
 * Standalone scan: discover all classes in a project.
 */
export function scanProject(projectDir) {
  const swiftFiles = findSwiftFiles(projectDir);
  const classMap = discoverClasses(swiftFiles);

  const result = {};
  for (const [name, info] of classMap) {
    result[name] = {
      ...info,
      file: relative(projectDir, info.file),
    };
  }
  return result;
}
