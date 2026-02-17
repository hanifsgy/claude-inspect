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

  // Match: class Foo: UIView, class Foo: UIViewController, struct Foo: View, etc.
  const classRegex =
    /^[ \t]*((?:public|private|internal|open|final)\s+)*(class|struct|enum)\s+(\w+)\s*(?::\s*([^{]+))?/gm;

  for (const file of swiftFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    let match;
    classRegex.lastIndex = 0;

    while ((match = classRegex.exec(content)) !== null) {
      const type = match[2]; // class, struct, enum
      const name = match[3];
      const inheritance = match[4] ? match[4].trim() : "";

      // Find the line number
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split("\n").length;

      // Extract parent classes/protocols
      const parents = inheritance
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      classMap.set(name, {
        file,
        line,
        type,
        parentClass: parents[0] || null,
        protocols: parents.slice(1),
        inheritance,
      });
    }
  }

  return classMap;
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

  const enriched = flatNodes.map((node) => {
    const classInfo = classMap.get(node.className);

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

    let content;
    try {
      content = readFileSync(classInfo.file, "utf-8");
    } catch {
      return {
        ...node,
        file: relative(projectDir, classInfo.file),
        fileLine: classInfo.line,
        parentClass: classInfo.parentClass,
        dependencies: [],
        hierarchy: null,
        mapped: true,
      };
    }

    const hierarchy = extractHierarchy(classInfo.file, content);
    const dependencies = extractDependencies(content);

    return {
      ...node,
      file: relative(projectDir, classInfo.file),
      fileLine: classInfo.line,
      parentClass: classInfo.parentClass,
      dependencies,
      hierarchy,
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
