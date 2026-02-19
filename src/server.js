import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeUI } from "./axe.js";
import { detectGeometry } from "./geometry.js";
import {
  buildSourceIndexes,
  summarizeIndexes,
  matchAll,
  loadOverrides,
  ensureIdentifierRegistry,
  applyIdentifierRegistry,
  setStateDir,
  computeMetrics,
  formatMetrics,
  explainNode,
  traceInteraction,
  addRuntimeOverride,
  getRuntimeOverrides,
  persistRuntimeOverrides,
} from "./mapping/index.js";
import { OverlayBridge } from "./overlay-bridge.js";
import { saveHierarchy, loadHierarchy, saveSelection, getSelection, saveFeedback, loadAllFeedback, getFeedbackStats, clearFeedback } from "./store.js";
import { dirname, join, resolve, sep } from "path";

/** Return true if filePath resolves to within projectRoot. */
function isPathWithinRoot(projectRoot, filePath) {
  const root = resolve(projectRoot);
  const resolved = resolve(root, filePath);
  return resolved === root || resolved.startsWith(root + sep);
}
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = dirname(__dirname);

const server = new McpServer({
  name: "simulator-inspector",
  version: "2.0.0",
});

const bridge = new OverlayBridge();
let currentHierarchy = null;

// --- Tool: inspector_start ---
server.tool(
  "inspector_start",
  "Start the simulator inspector. If the script already ran (hierarchy exists in data/hierarchy.json), reuses that data. Otherwise runs AXe + new mapping module with confidence scoring.",
  {
    projectPath: z
      .string()
      .describe("Path to the iOS/Swift project directory to scan for source files"),
    simulatorUdid: z
      .string()
      .optional()
      .describe("Simulator UDID (uses booted simulator if omitted)"),
    rescan: z
      .boolean()
      .optional()
      .default(false)
      .describe("Force re-scan even if hierarchy already exists"),
  },
  async ({ projectPath, simulatorUdid, rescan }) => {
    try {
      const resolvedProjectPath = resolve(projectPath);

      // Check if script already generated the hierarchy
      const existing = loadHierarchy();
      const isFresh = existing && (Date.now() - existing.timestamp < 60000);
      const cacheMatchesProject = existing?.scanMeta?.projectPath === resolvedProjectPath;

      if (isFresh && cacheMatchesProject && !rescan) {
        currentHierarchy = existing;
        const metrics = computeMetrics(existing.enriched);
        const indexSummary = existing.scanMeta?.indexSummary;
        const registrySummary = existing.scanMeta?.identifierRegistry;
        const indexLine = indexSummary
          ? `\nIndex: strategy=${indexSummary.strategy} modules=${indexSummary.modules} swiftFiles=${indexSummary.swiftFiles}`
          : "";
        const registryLine = registrySummary
          ? `\nIdentifier registry: applied=${registrySummary.applied} ambiguous=${registrySummary.ambiguous}`
          : "";

        bridge.start(simulatorUdid || "booted");
        
        const root = existing.flat?.[0] || existing.enriched?.[0];
        const screen = root?.frame ? { w: root.frame.w, h: root.frame.h } : { w: 402, h: 874 };
        const geometry = detectGeometry(screen.w, screen.h);
        const verticalOffset = 20;
        const contentRect = geometry.contentRect ? {
          ...geometry.contentRect,
          y: geometry.contentRect.y + verticalOffset,
        } : null;
        
        const components = existing.enriched
          .filter((node) => node.className !== "UIApplication")
          .map((node) => ({
            id: node.id,
            className: node.className,
            name: node.name,
            frame: node.frame,
            confidence: node.confidence,
            file: node.file,
            fileLine: node.fileLine,
            ownerType: node.ownerType,
          }));
        
        bridge.highlight({ screen, contentRect, scale: geometry.scale, components });

        return {
          content: [
            {
              type: "text",
              text: `Inspector started (cached scan).\n${formatMetrics(metrics)}${indexLine}${registryLine}`,
            },
          ],
        };
      }

      // Fresh scan: AXe + mapping module
      bridge.start(simulatorUdid || "booted");

      const { tree, flat } = describeUI(simulatorUdid);

      setStateDir(join(toolRoot, "state"));
      const { overrides, modulePriority, sources } = loadOverrides(toolRoot, resolvedProjectPath);
      const indexes = buildSourceIndexes(resolvedProjectPath);
      const indexSummary = summarizeIndexes(indexes);
      let enriched = matchAll(flat, resolvedProjectPath, overrides, {
        modulePriority,
        indexes,
      });
      const registryMatch = ensureIdentifierRegistry(toolRoot, resolvedProjectPath, indexes);
      let identifierRegistry = null;
      if (registryMatch) {
        const applied = applyIdentifierRegistry(enriched, registryMatch.registry);
        enriched = applied.nodes;
        identifierRegistry = {
          path: registryMatch.path,
          ...applied.stats,
          refreshed: registryMatch.refreshed || false,
          refreshReason: registryMatch.refreshReason || null,
        };
      }

      currentHierarchy = {
        tree,
        flat,
        enriched,
        timestamp: Date.now(),
        scanMeta: {
          projectPath: resolvedProjectPath,
          simulatorUdid: simulatorUdid || "booted",
          rootLabel: tree?.[0]?.label || null,
          scanVersion: 2,
          indexSummary,
          overrideSources: sources,
          identifierRegistry,
        },
      };
      saveHierarchy(currentHierarchy);

      const root = flat?.[0];
      const screen = root?.frame ? { w: root.frame.w, h: root.frame.h } : { w: 402, h: 874 };
      const geometry = detectGeometry(screen.w, screen.h);
      const verticalOffset = 20;
      const contentRect = geometry.contentRect ? {
        ...geometry.contentRect,
        y: geometry.contentRect.y + verticalOffset,
      } : null;

      const components = enriched
        .filter((node) => node.className !== "UIApplication")
        .map((node) => ({
          id: node.id,
          className: node.className,
          name: node.name,
          frame: node.frame,
          confidence: node.confidence,
          file: node.file,
          fileLine: node.fileLine,
          ownerType: node.ownerType,
        }));
      
      bridge.highlight({ screen, contentRect, scale: geometry.scale, components });

      const metrics = computeMetrics(enriched);
      const scanInfo = [
        `Index strategy: ${indexSummary.strategy}`,
        `Modules: ${indexSummary.modules}, Swift files: ${indexSummary.swiftFiles}`,
      ];
      if (sources.length > 0) {
        scanInfo.push(`Override sources: ${sources.join(", ")}`);
      }
      if (identifierRegistry) {
        const regLine = `Identifier registry: applied=${identifierRegistry.applied}, ambiguous=${identifierRegistry.ambiguous}`;
        if (identifierRegistry.refreshed) {
          scanInfo.push(`${regLine} (refreshed: ${identifierRegistry.refreshReason})`);
        } else {
          scanInfo.push(regLine);
        }
      }

      if (isFresh && !cacheMatchesProject && !rescan) {
        console.error(
          `[scan] Ignoring cached hierarchy for different project: ${existing?.scanMeta?.projectPath || "unknown"}`
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Inspector started (fresh scan).\n${formatMetrics(metrics)}\n${scanInfo.join("\n")}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error starting inspector: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: inspector_stop ---
server.tool(
  "inspector_stop",
  "Stop the simulator inspector and close the overlay window.",
  {},
  async () => {
    bridge.stop();
    currentHierarchy = null;
    return {
      content: [{ type: "text", text: "Inspector stopped. Overlay closed." }],
    };
  }
);

// --- Tool: get_hierarchy ---
server.tool(
  "get_hierarchy",
  "Return the enriched UI hierarchy with file:line mappings, confidence scores, and per-node evidence chains.",
  {
    minConfidence: z
      .number()
      .optional()
      .default(0)
      .describe("Minimum confidence threshold (0-1). Default 0 returns all."),
    module: z
      .string()
      .optional()
      .describe("Filter by module name"),
    excludeContainers: z
      .boolean()
      .optional()
      .default(true)
      .describe("Exclude UIApplication and container-only views"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of components to return"),
    offset: z
      .number()
      .optional()
      .default(0)
      .describe("Offset for pagination"),
  },
  async ({ minConfidence, module, excludeContainers, limit, offset }) => {
    const hierarchy = currentHierarchy || loadHierarchy();
    const maxAgeMs = 5 * 60 * 1000;

    if (!hierarchy) {
      return {
        content: [
          {
            type: "text",
            text: "No hierarchy available. Run inspector_start first.",
          },
        ],
        isError: true,
      };
    }

    const isStale = !hierarchy.timestamp || (Date.now() - hierarchy.timestamp > maxAgeMs);
    if (isStale) {
      return {
        content: [
          {
            type: "text",
            text: "Hierarchy is stale. Run inspector_start again to refresh mappings.",
          },
        ],
        isError: true,
      };
    }

    let filtered = hierarchy.enriched;

    if (minConfidence > 0) {
      filtered = filtered.filter((n) => (n.confidence || 0) >= minConfidence);
    }

    if (module) {
      filtered = filtered.filter((n) => n.mappedModule === module);
    }

    if (excludeContainers) {
      const containerClasses = ["UIApplication", "UIWindow"];
      filtered = filtered.filter((n) => !containerClasses.includes(n.className));
    }

    const total = filtered.length;

    if (offset > 0) {
      filtered = filtered.slice(offset);
    }

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    const compact = filtered.map((n) => ({
      id: n.id,
      className: n.className,
      name: n.name,
      frame: n.frame,
      file: n.file,
      fileLine: n.fileLine,
      ownerType: n.ownerType,
      confidence: n.confidence,
      mapped: n.mapped,
      module: n.mappedModule,
    }));

    const summary = {
      total,
      returned: compact.length,
      offset: offset || 0,
      filtered: minConfidence > 0 || module || excludeContainers,
      components: compact,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

// --- Tool: suggest_mappings ---
server.tool(
  "suggest_mappings",
  "For unmapped or low-confidence components, return likely source files based on partial signals. Useful when automatic mapping failed but you want manual selection options.",
  {
    componentId: z.string().describe("Component ID to find suggestions for"),
    maxResults: z.number().optional().default(5).describe("Maximum suggestions to return"),
  },
  async ({ componentId, maxResults }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const node = hierarchy.enriched.find((n) => n.id === componentId);
    if (!node) {
      return {
        content: [{ type: "text", text: `Component "${componentId}" not found in hierarchy.` }],
        isError: true,
      };
    }

    const suggestions = [];

    if (node.candidates && node.candidates.length > 0) {
      for (const cand of node.candidates.slice(0, maxResults)) {
        suggestions.push({
          file: cand.file,
          line: cand.line,
          confidence: cand.confidence,
          reason: `Candidate from automatic matching`,
        });
      }
    }

    if (node.identifier) {
      suggestions.push({
        file: null,
        line: null,
        confidence: 0.3,
        reason: `Search source for identifier: "${node.identifier}"`,
        searchPattern: node.identifier,
      });
    }

    if (node.className && node.className !== "UIView" && node.className !== "UILabel") {
      suggestions.push({
        file: null,
        line: null,
        confidence: 0.2,
        reason: `Search source for class: ${node.className}`,
        searchPattern: `class ${node.className}`,
      });
    }

    if (node.label) {
      suggestions.push({
        file: null,
        line: null,
        confidence: 0.15,
        reason: `Search source for label text: "${node.label}"`,
        searchPattern: node.label,
      });
    }

    const unique = [];
    const seen = new Set();
    for (const s of suggestions) {
      const key = s.file ? `${s.file}:${s.line}` : s.searchPattern;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    const result = {
      componentId,
      currentMapping: node.mapped
        ? { file: node.file, line: node.fileLine, confidence: node.confidence }
        : null,
      suggestions: unique.slice(0, maxResults),
    };

    const lines = [
      `## Suggestions for ${componentId}`,
      ``,
      `**Current mapping:** ${node.mapped ? `${node.file}:${node.fileLine} (${(node.confidence * 100).toFixed(0)}%)` : "None"}`,
      ``,
      `**Suggestions:**`,
    ];

    for (const s of unique.slice(0, maxResults)) {
      if (s.file) {
        lines.push(`- \`${s.file}:${s.line}\` (${(s.confidence * 100).toFixed(0)}%) — ${s.reason}`);
      } else {
        lines.push(`- [Search] ${s.reason}`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: filter_hierarchy ---
server.tool(
  "filter_hierarchy",
  "Filter hierarchy by multiple criteria. Returns components matching all specified filters.",
  {
    minConfidence: z.number().optional().describe("Minimum confidence (0-1)"),
    maxConfidence: z.number().optional().describe("Maximum confidence (0-1)"),
    mapped: z.boolean().optional().describe("Filter by mapped status (true/false)"),
    hasIdentifier: z.boolean().optional().describe("Filter by presence of accessibilityIdentifier"),
    module: z.string().optional().describe("Filter by module name"),
    className: z.string().optional().describe("Filter by class name (supports wildcards)"),
    screenRegion: z
      .object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })
      .optional()
      .describe("Screen region {x,y,w,h} - return components whose frame intersects"),
    limit: z.number().optional().default(50).describe("Maximum results"),
  },
  async (filters) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    let filtered = hierarchy.enriched;

    if (filters.minConfidence !== undefined) {
      filtered = filtered.filter((n) => (n.confidence || 0) >= filters.minConfidence);
    }

    if (filters.maxConfidence !== undefined) {
      filtered = filtered.filter((n) => (n.confidence || 0) <= filters.maxConfidence);
    }

    if (filters.mapped !== undefined) {
      filtered = filtered.filter((n) => n.mapped === filters.mapped);
    }

    if (filters.hasIdentifier !== undefined) {
      filtered = filtered.filter((n) => !!n.identifier === filters.hasIdentifier);
    }

    if (filters.module) {
      filtered = filtered.filter((n) => n.mappedModule === filters.module);
    }

    if (filters.className) {
      const pattern = filters.className.replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}$`, "i");
      filtered = filtered.filter((n) => regex.test(n.className));
    }

    if (filters.screenRegion) {
      const { x, y, w, h } = filters.screenRegion;
      filtered = filtered.filter((n) => {
        if (!n.frame) return false;
        const nx = n.frame.x, ny = n.frame.y, nw = n.frame.w, nh = n.frame.h;
        return !(nx + nw < x || nx > x + w || ny + nh < y || ny > y + h);
      });
    }

    const total = filtered.length;
    filtered = filtered.slice(0, filters.limit || 50);

    const results = filtered.map((n) => ({
      id: n.id,
      className: n.className,
      name: n.name,
      file: n.file,
      fileLine: n.fileLine,
      confidence: n.confidence,
      mapped: n.mapped,
      identifier: n.identifier,
      module: n.mappedModule,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ total, returned: results.length, filters, components: results }, null, 2),
        },
      ],
    };
  }
);

// --- Tool: wait_for_selection ---
server.tool(
  "wait_for_selection",
  "Wait for the user to click a component in the overlay. Returns rich context: class, file:line, ownerType, confidence, evidence, and source dependencies.",
  {
    timeoutSeconds: z
      .number()
      .optional()
      .default(120)
      .describe("How long to wait for a selection (default 120s)"),
  },
  async ({ timeoutSeconds }) => {
    try {
      const clicked = await bridge.waitForClick(timeoutSeconds * 1000);

      // Match clicked component to enriched hierarchy
      const hierarchy = currentHierarchy || loadHierarchy();
      let enrichedMatch = null;

      if (hierarchy) {
        enrichedMatch = hierarchy.enriched.find((n) => n.id === clicked.id);
      }

      const selection = enrichedMatch || clicked;
      saveSelection(selection);

      // Build rich context
      const lines = [
        `## Selected Component`,
        ``,
        `**${selection.className}** \`${selection.name || selection.id}\``,
      ];

      if (selection.file) {
        lines.push(`**File:** \`${selection.file}:${selection.fileLine}\``);
      }
      if (selection.ownerType) {
        lines.push(`**Owner:** \`${selection.ownerType}\``);
      }
      if (selection.mappedModule) {
        lines.push(`**Module:** ${selection.mappedModule}`);
      }
      if (selection.confidence !== undefined) {
        const pct = (selection.confidence * 100).toFixed(0);
        const level = selection.confidence >= 0.7 ? "high" : selection.confidence >= 0.4 ? "medium" : "low";
        lines.push(`**Confidence:** ${pct}% (${level})${selection.ambiguous ? " - AMBIGUOUS" : ""}`);
      }

      if (selection.frame && typeof selection.frame === "object") {
        const { x, y, w, h } = selection.frame;
        lines.push(`**Frame:** (${x}, ${y}, ${w}, ${h})`);
      } else {
        lines.push("**Frame:** unavailable");
      }

      if (selection.evidence && selection.evidence.length > 0) {
        lines.push(``, `**Evidence:**`);
        for (const ev of selection.evidence) {
          lines.push(`- [${ev.signal}] ${ev.detail}`);
        }
      }

      if (selection.candidates && selection.candidates.length > 1) {
        lines.push(``, `**Other candidates:** ${selection.candidates.length - 1}`);
        for (const cand of selection.candidates.slice(1, 4)) {
          lines.push(`- ${cand.file}:${cand.line} (${(cand.confidence * 100).toFixed(0)}%)`);
        }
      }

      lines.push(``, `**Session status:** awaiting_user_action`);
      lines.push(`Do not call \`wait_for_selection\` again until the user asks for next selection.`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Selection failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: trace_interaction ---
server.tool(
  "trace_interaction",
  "Trace likely interaction wiring for a mapped component: handlers, callbacks, and potential missing wiring.",
  {
    componentId: z
      .string()
      .optional()
      .describe("Component ID to trace. If omitted, uses the last selected component."),
    contextLines: z
      .number()
      .optional()
      .default(24)
      .describe("How many lines before/after mapped line to inspect (default 24)"),
  },
  async ({ componentId, contextLines }) => {
    const hierarchy = currentHierarchy || loadHierarchy();
    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const selected = getSelection();
    const resolvedComponentId = componentId || selected?.id;
    if (!resolvedComponentId) {
      return {
        content: [{ type: "text", text: "No component specified and no last selection found." }],
        isError: true,
      };
    }

    const node = hierarchy.enriched.find((n) => n.id === resolvedComponentId);
    if (!node) {
      return {
        content: [{ type: "text", text: `Component \"${resolvedComponentId}\" not found in hierarchy.` }],
        isError: true,
      };
    }

    const projectPath = hierarchy.scanMeta?.projectPath;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: "Missing project path in hierarchy metadata. Re-run inspector_start." }],
        isError: true,
      };
    }

    const trace = traceInteraction(node, projectPath, Math.max(8, Math.min(contextLines, 80)));
    if (!trace.ok) {
      return {
        content: [{ type: "text", text: `Trace failed: ${trace.error}` }],
        isError: true,
      };
    }

    const lines = [
      "Identity",
      `- Component: \`${node.id}\` (${node.className})`,
      `- Source: \`${trace.file}:${trace.focusLine}\`${node.ownerType ? ` (${node.ownerType})` : ""}`,
      node.identifier ? `- Identifier: \`${node.identifier}\`` : "- Identifier: unavailable",
      "",
      "Interactions",
    ];

    if (trace.interactionSignals.length > 0) {
      for (const sig of trace.interactionSignals.slice(0, 8)) {
        const handler = sig.handler ? ` -> handler \`${sig.handler}\`` : "";
        lines.push(`- [${sig.kind}] line ${sig.line}${handler}`);
      }
    } else {
      lines.push("- No direct interaction signal found in local context window");
    }

    lines.push("", "Wiring / Callback chain");
    if (trace.handlers.length > 0) {
      for (const handler of trace.handlers.slice(0, 6)) {
        const calls = handler.calls.length > 0 ? handler.calls.join(", ") : "(no downstream calls detected)";
        lines.push(`- \`${handler.name}\` at line ${handler.line} calls: ${calls}`);
      }
    } else {
      lines.push("- No handler function definitions matched from local wiring signals");
    }

    lines.push("", "Observations / Gaps");
    lines.push(`- Verdict: **${trace.verdict.status}** — ${trace.verdict.reason}`);

    lines.push("", "Local source snippet");
    lines.push("```swift");
    for (const row of trace.snippet) {
      const mark = row.line === trace.focusLine ? ">" : " ";
      lines.push(`${mark}${String(row.line).padStart(4, " ")} | ${row.text}`);
    }
    lines.push("```");

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: explain_component ---
server.tool(
  "explain_component",
  "Explain why a specific component was mapped to a source file. Shows all signals, weights, and alternative candidates.",
  {
    componentId: z.string().describe("The component ID to explain (e.g. 'command.header.title')"),
  },
  async ({ componentId }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const node = hierarchy.enriched.find((n) => n.id === componentId);
    if (!node) {
      return {
        content: [{ type: "text", text: `Component "${componentId}" not found in hierarchy.` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: explainNode(node) }],
    };
  }
);

// --- Tool: get_related ---
server.tool(
  "get_related",
  "Get parent, children, and siblings of a component in the UI hierarchy. Useful for understanding component context.",
  {
    componentId: z.string().describe("Component ID to find relations for"),
  },
  async ({ componentId }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const node = hierarchy.enriched.find((n) => n.id === componentId);
    if (!node) {
      return {
        content: [{ type: "text", text: `Component "${componentId}" not found in hierarchy.` }],
        isError: true,
      };
    }

    const parentNode = node.parentId
      ? hierarchy.enriched.find((n) => n.id === node.parentId)
      : null;

    const children = hierarchy.enriched.filter((n) => n.parentId === componentId);

    const siblings = node.parentId
      ? hierarchy.enriched.filter((n) => n.parentId === node.parentId && n.id !== componentId)
      : [];

    const formatNode = (n) => ({
      id: n.id,
      className: n.className,
      name: n.name,
      file: n.file,
      fileLine: n.fileLine,
      confidence: n.confidence,
    });

    const lines = [
      `## Relations for ${componentId}`,
      ``,
      `**Component:** ${node.className} "${node.name || node.id}"`,
    ];

    if (node.file) {
      lines.push(`**Location:** ${node.file}:${node.fileLine}`);
    }

    lines.push(``, `**Parent:**`);
    if (parentNode) {
      lines.push(`- ${parentNode.className} "${parentNode.name || parentNode.id}" (${parentNode.file || "no file"})`);
    } else {
      lines.push(`- (none - root level)`);
    }

    lines.push(``, `**Children:** ${children.length}`);
    for (const child of children.slice(0, 10)) {
      lines.push(`- ${child.className} "${child.name || child.id}" (${child.file || "no file"})`);
    }
    if (children.length > 10) {
      lines.push(`- ... and ${children.length - 10} more`);
    }

    lines.push(``, `**Siblings:** ${siblings.length}`);
    for (const sib of siblings.slice(0, 10)) {
      lines.push(`- ${sib.className} "${sib.name || sib.id}" (${sib.file || "no file"})`);
    }
    if (siblings.length > 10) {
      lines.push(`- ... and ${siblings.length - 10} more`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: add_override ---
server.tool(
  "add_override",
  "Add a runtime mapping override without editing JSON. Pattern supports exact match or glob (* for single level, ** for any depth).",
  {
    pattern: z.string().describe("AX identifier pattern (e.g., 'home.header.title' or 'home.header.*')"),
    file: z.string().describe("Source file path relative to project root"),
    line: z.number().optional().describe("Line number in the file"),
    ownerType: z.string().optional().describe("Owning class/struct name"),
    module: z.string().optional().describe("Module name"),
    persist: z.boolean().optional().default(false).describe("Persist to .claude/inspector-map.json"),
  },
  async ({ pattern, file, line, ownerType, module, persist }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    const projectPath = hierarchy?.scanMeta?.projectPath;
    if (projectPath && !isPathWithinRoot(projectPath, file)) {
      return {
        content: [{ type: "text", text: `Error: file path "${file}" escapes the project root. Only paths within the project directory are allowed.` }],
        isError: true,
      };
    }

    const entry = addRuntimeOverride({ pattern, file, line, ownerType, module });

    let persistedPath = null;
    if (persist && hierarchy?.scanMeta?.projectPath) {
      persistedPath = persistRuntimeOverrides(hierarchy.scanMeta.projectPath);
    }

    const lines = [
      `## Override Added`,
      ``,
      `**Pattern:** ${pattern}`,
      `**File:** ${file}${line ? `:${line}` : ""}`,
    ];

    if (ownerType) {
      lines.push(`**Owner Type:** ${ownerType}`);
    }
    if (module) {
      lines.push(`**Module:** ${module}`);
    }

    lines.push(``, `**Status:** ${persist && persistedPath ? `Persisted to ${persistedPath}` : "Runtime only (will be lost on restart)"}`);

    if (hierarchy) {
      lines.push(``, `**Note:** Run \`inspector_start --rescan\` to apply the override.`);
    }

    const runtimeCount = getRuntimeOverrides().length;
    lines.push(``, `**Runtime overrides:** ${runtimeCount}`);

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: list_overrides ---
server.tool(
  "list_overrides",
  "List all runtime overrides added during this session.",
  {},
  async () => {
    const overrides = getRuntimeOverrides();

    if (overrides.length === 0) {
      return {
        content: [{ type: "text", text: "No runtime overrides. Use `add_override` to add one." }],
      };
    }

    const lines = [`## Runtime Overrides (${overrides.length})`, ``];

    for (const o of overrides) {
      lines.push(`- \`${o.pattern}\` → ${o.file}${o.line ? `:${o.line}` : ""}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: rate_mapping ---
server.tool(
  "rate_mapping",
  "Rate a component's mapping as correct or incorrect. This feedback is stored and can be used to improve mapping confidence weights over time.",
  {
    componentId: z.string().describe("Component ID that was mapped"),
    correct: z.boolean().describe("true if mapping is correct, false if incorrect"),
    notes: z.string().optional().describe("Optional notes about why the mapping was correct/incorrect"),
  },
  async ({ componentId, correct, notes }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    const entry = {
      componentId,
      correct,
      notes: notes || null,
      timestamp: Date.now(),
    };

    if (hierarchy) {
      const node = hierarchy.enriched.find((n) => n.id === componentId);
      if (node) {
        entry.file = node.file;
        entry.fileLine = node.fileLine;
        entry.confidence = node.confidence;
        entry.signals = (node.evidence || []).map((e) => e.signal);
        entry.ambiguous = node.ambiguous || false;
      }
    }

    saveFeedback(entry);

    const stats = getFeedbackStats();
    const lines = [
      `## Feedback Recorded`,
      ``,
      `**Component:** ${componentId}`,
      `**Rating:** ${correct ? "✓ Correct" : "✗ Incorrect"}`,
      `**Total feedback:** ${stats.total} (${stats.correct} correct, ${stats.incorrect} incorrect)`,
    ];

    if (notes) {
      lines.push(`**Notes:** ${notes}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: feedback_stats ---
server.tool(
  "feedback_stats",
  "Show statistics about mapping feedback collected so far. Useful for understanding which signal types are most reliable.",
  {},
  async () => {
    const stats = getFeedbackStats();

    const lines = [
      `## Mapping Feedback Statistics`,
      ``,
      `**Total ratings:** ${stats.total}`,
      `**Correct:** ${stats.correct}`,
      `**Incorrect:** ${stats.incorrect}`,
      `**Accuracy:** ${stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : 0}%`,
    ];

    if (Object.keys(stats.bySignal).length > 0) {
      lines.push(``, `**By signal type:**`);
      for (const [signal, data] of Object.entries(stats.bySignal).sort((a, b) => b[1].correct - a[1].correct)) {
        const total = data.correct + data.incorrect;
        const acc = total > 0 ? ((data.correct / total) * 100).toFixed(0) : 0;
        lines.push(`- ${signal}: ${data.correct}/${total} (${acc}%)`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// --- Tool: validate_mapping ---
server.tool(
  "validate_mapping",
  "Check if a component's mapping is still valid. Verifies source file exists and expected pattern is still present.",
  {
    componentId: z.string().describe("Component ID to validate"),
  },
  async ({ componentId }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const node = hierarchy.enriched.find((n) => n.id === componentId);
    if (!node) {
      return {
        content: [{ type: "text", text: `Component "${componentId}" not found.` }],
        isError: true,
      };
    }

    const lines = [`## Validation: ${componentId}`, ``];

    if (!node.mapped || !node.file) {
      lines.push("**Status:** Not mapped");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    const projectPath = hierarchy.scanMeta?.projectPath;
    if (!projectPath) {
      lines.push("**Status:** Cannot validate - missing project path");
      return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
    }

    if (!isPathWithinRoot(projectPath, node.file)) {
      lines.push(`**Status:** ❌ INVALID`);
      lines.push(`**Reason:** Mapped file path escapes project root: ${node.file}`);
      return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
    }

    const fs = await import("fs");
    const filePath = join(projectPath, node.file);

    // Check 1: File exists
    if (!fs.existsSync(filePath)) {
      lines.push(`**Status:** ❌ INVALID`);
      lines.push(`**Reason:** Source file not found: ${node.file}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // Check 2: Line exists (if specified)
    if (node.fileLine) {
      const content = fs.readFileSync(filePath, "utf-8");
      const fileLines = content.split("\n");
      
      if (node.fileLine > fileLines.length) {
        lines.push(`**Status:** ❌ INVALID`);
        lines.push(`**Reason:** Line ${node.fileLine} exceeds file length (${fileLines.length} lines)`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Check 3: Identifier still present near that line (if we have one)
      if (node.identifier) {
        const searchStart = Math.max(0, node.fileLine - 5);
        const searchEnd = Math.min(fileLines.length, node.fileLine + 5);
        const context = fileLines.slice(searchStart, searchEnd).join("\n");
        
        if (!context.includes(node.identifier)) {
          lines.push(`**Status:** ⚠️ STALE`);
          lines.push(`**Reason:** Identifier "${node.identifier}" not found near line ${node.fileLine}`);
          lines.push(`**File:** ${node.file}:${node.fileLine}`);
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }
      }
    }

    lines.push(`**Status:** ✓ VALID`);
    lines.push(`**File:** ${node.file}:${node.fileLine}`);
    lines.push(`**Confidence:** ${(node.confidence * 100).toFixed(0)}%`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// --- Tool: refresh_index ---
server.tool(
  "refresh_index",
  "Refresh source indexes for specific files or modules. Useful when you've edited source files and want updated mappings without a full rescan.",
  {
    files: z.array(z.string()).optional().describe("Specific files to re-index (relative paths)"),
    module: z.string().optional().describe("Module name to re-index all its files"),
    rescanHierarchy: z.boolean().optional().default(false).describe("Also re-run hierarchy matching"),
  },
  async ({ files, module, rescanHierarchy }) => {
    const hierarchy = currentHierarchy || loadHierarchy();

    if (!hierarchy) {
      return {
        content: [{ type: "text", text: "No hierarchy available. Run inspector_start first." }],
        isError: true,
      };
    }

    const projectPath = hierarchy.scanMeta?.projectPath;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: "Missing project path in hierarchy." }],
        isError: true,
      };
    }

    const fs = await import("fs");
    const refreshedFiles = [];
    const errors = [];

    // Collect files to refresh
    let targetFiles = [];

    if (files && files.length > 0) {
      for (const f of files) {
        const absPath = join(projectPath, f);
        if (fs.existsSync(absPath)) {
          targetFiles.push(absPath);
        } else {
          errors.push(`File not found: ${f}`);
        }
      }
    }

    if (module && hierarchy.scanMeta?.indexSummary) {
      // Note: This would require access to moduleIndex which we don't have here
      // For now, indicate that module refresh needs full rescan
      lines.push(`**Note:** Module-specific refresh requires full rescan. Use inspector_start --rescan instead.`);
    }

    // Clear cache for target files by touching them
    for (const f of targetFiles) {
      try {
        const now = new Date();
        fs.utimesSync(f, now, now);
        refreshedFiles.push(f.replace(projectPath + "/", ""));
      } catch (err) {
        errors.push(`Failed to refresh ${f}: ${err.message}`);
      }
    }

    const lines = [
      `## Index Refresh`,
      ``,
      `**Refreshed files:** ${refreshedFiles.length}`,
    ];

    if (refreshedFiles.length > 0) {
      for (const f of refreshedFiles.slice(0, 10)) {
        lines.push(`- ${f}`);
      }
      if (refreshedFiles.length > 10) {
        lines.push(`- ... and ${refreshedFiles.length - 10} more`);
      }
    }

    if (rescanHierarchy && refreshedFiles.length > 0) {
      lines.push(``, `**Next step:** Run \`inspector_start --rescan\` to apply changes.`);
    }

    if (errors.length > 0) {
      lines.push(``, `**Errors:**`);
      for (const e of errors) {
        lines.push(`- ${e}`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server failed:", err);
  process.exit(1);
});
