import { existsSync, readFileSync } from "fs";
import { join, resolve, sep } from "path";

/**
 * Check that a file path resolves to within the project root.
 * Prevents path-traversal attacks where an override file like
 * "../../.ssh/id_rsa" could escape the project directory.
 */
function isPathWithinRoot(projectRoot, filePath) {
  const root = resolve(projectRoot);
  const resolved = resolve(root, filePath);
  return resolved === root || resolved.startsWith(root + sep);
}

const INTERACTION_SIGNAL_PATTERNS = [
  {
    kind: "target_action",
    regex: /addTarget\s*\(.*action:\s*#selector\((?:\w+\.)?(\w+)\)/,
  },
  {
    kind: "gesture_selector",
    regex: /(?:UITapGestureRecognizer|UILongPressGestureRecognizer|UISwipeGestureRecognizer)\s*\(.*action:\s*#selector\((?:\w+\.)?(\w+)\)/,
  },
  {
    kind: "swiftui_onTapGesture",
    regex: /\.onTapGesture(?:\s*\([^)]*\))?\s*\{/,
  },
  {
    kind: "swiftui_button_action",
    regex: /Button\s*\([^)]*action:\s*\{/,
  },
  {
    kind: "swiftui_simultaneousGesture",
    regex: /\.simultaneousGesture\s*\(/,
  },
  {
    kind: "swiftui_highPriorityGesture",
    regex: /\.highPriorityGesture\s*\(/,
  },
  {
    kind: "delegate_assignment",
    regex: /\bdelegate\s*=\s*self\b/,
  },
  {
    kind: "control_event_closure",
    regex: /UIAction\s*\(\s*\{\s*\[/,
  },
];

const HANDLER_DEFINITION =
  /^\s*(?:@IBAction\s+)?(?:@objc\s+)?(?:private\s+|fileprivate\s+|internal\s+|public\s+|open\s+)?func\s+(\w+)\s*\(/;

const CALL_NAME_REGEX = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const SWIFT_KEYWORDS = new Set([
  "if", "for", "while", "switch", "guard", "return", "print", "assert", "fatalError",
  "init", "deinit", "super", "self", "map", "filter", "reduce",
]);

export function traceInteraction(node, projectPath, contextLines = 24) {
  if (!node?.file) {
    return {
      ok: false,
      error: "No mapped source file for this component.",
    };
  }

  if (!isPathWithinRoot(projectPath, node.file)) {
    return {
      ok: false,
      error: `Refusing to read file outside project root: ${node.file}`,
    };
  }

  const absPath = join(projectPath, node.file);
  if (!existsSync(absPath)) {
    return {
      ok: false,
      error: `Mapped source file not found: ${node.file}`,
    };
  }

  const content = readFileSync(absPath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;
  const focusLine = resolveFocusLine(node, lines);
  const start = Math.max(1, focusLine - contextLines);
  const end = Math.min(totalLines, focusLine + contextLines);

  const snippetLines = lines.slice(start - 1, end).map((line, idx) => ({
    line: start + idx,
    text: line,
  }));

  const interactionSignals = collectSignals(snippetLines);
  const handlerNames = new Set(
    interactionSignals.map((sig) => sig.handler).filter(Boolean)
  );
  const handlerDefs = collectHandlerDefinitions(lines, handlerNames);
  const handlers = handlerDefs.map((def) => ({
    name: def.name,
    line: def.line,
    calls: extractCallsFromFunction(lines, def.line),
  }));

  const likelyInteractive = isLikelyInteractive(node);
  const verdict = classifyVerdict(likelyInteractive, interactionSignals, handlers);

  return {
    ok: true,
    file: node.file,
    absoluteFile: absPath,
    focusLine,
    snippetStart: start,
    snippetEnd: end,
    snippet: snippetLines,
    interactionSignals,
    handlers,
    verdict,
  };
}

function resolveFocusLine(node, lines) {
  if (Number.isInteger(node.fileLine) && node.fileLine > 0) {
    return node.fileLine;
  }

  if (node.identifier) {
    const needle = node.identifier;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle)) return i + 1;
    }
  }

  return 1;
}

function collectSignals(snippetLines) {
  const signals = [];
  for (const row of snippetLines) {
    for (const pattern of INTERACTION_SIGNAL_PATTERNS) {
      const match = row.text.match(pattern.regex);
      if (!match) continue;

      signals.push({
        kind: pattern.kind,
        line: row.line,
        text: row.text.trim(),
        handler: match[1] || null,
      });
    }
  }
  return signals;
}

function collectHandlerDefinitions(lines, preferredNames) {
  const defs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HANDLER_DEFINITION);
    if (!m) continue;

    const name = m[1];
    if (preferredNames.size > 0 && !preferredNames.has(name)) continue;

    defs.push({ name, line: i + 1 });
  }
  return defs;
}

function extractCallsFromFunction(lines, startLine) {
  const startIndex = startLine - 1;
  const calls = new Set();
  let depth = 0;
  let sawBodyStart = false;

  for (let i = startIndex; i < lines.length; i++) {
    const text = lines[i];

    for (const ch of text) {
      if (ch === "{") {
        depth += 1;
        sawBodyStart = true;
      } else if (ch === "}") {
        depth -= 1;
      }
    }

    if (sawBodyStart) {
      CALL_NAME_REGEX.lastIndex = 0;
      let m;
      while ((m = CALL_NAME_REGEX.exec(text)) !== null) {
        const name = m[1];
        if (!SWIFT_KEYWORDS.has(name)) calls.add(name);
      }
    }

    if (sawBodyStart && depth <= 0 && i > startIndex) {
      break;
    }
  }

  return [...calls].slice(0, 12);
}

function isLikelyInteractive(node) {
  const className = node.className || "";
  const role = node.role || "";
  const name = node.name || "";
  const identifier = node.identifier || "";

  if (/button|switch|slider|textfield|textview|cell|control/i.test(className)) return true;
  if (/button|tab|toggle|switch/i.test(role)) return true;
  if (/tap|button|cta|action|submit|save|create|delete|next|continue/i.test(name)) return true;
  if (/tap|button|cta|action|submit|save|create|delete|next|continue/i.test(identifier)) return true;

  return false;
}

function classifyVerdict(likelyInteractive, signals, handlers) {
  if (signals.length > 0) {
    return {
      status: "wired",
      reason: "Found interaction wiring signals near the mapped source line.",
    };
  }

  if (handlers.length > 0) {
    return {
      status: "likely_wired",
      reason: "Found candidate handler definitions but no direct local wiring signal.",
    };
  }

  if (likelyInteractive) {
    return {
      status: "likely_missing",
      reason: "Component appears interactive but no local tap/gesture/action wiring was found.",
    };
  }

  return {
    status: "display_only",
    reason: "No interaction wiring found; component appears display-only.",
  };
}
