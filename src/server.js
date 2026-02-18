import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeUI } from "./axe.js";
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
} from "./mapping/index.js";
import { OverlayBridge } from "./overlay-bridge.js";
import { saveHierarchy, loadHierarchy, saveSelection, getSelection } from "./store.js";
import { dirname, join, resolve } from "path";
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
        const components = existing.enriched.map((node) => ({
          id: node.id,
          className: node.className,
          name: node.name,
          frame: node.frame,
        }));
        bridge.highlight(components);

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
        };
      }

      currentHierarchy = {
        tree,
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

      const components = enriched.map((node) => ({
        id: node.id,
        className: node.className,
        name: node.name,
        frame: node.frame,
      }));
      bridge.highlight(components);

      const metrics = computeMetrics(enriched);
      const scanInfo = [
        `Index strategy: ${indexSummary.strategy}`,
        `Modules: ${indexSummary.modules}, Swift files: ${indexSummary.swiftFiles}`,
      ];
      if (sources.length > 0) {
        scanInfo.push(`Override sources: ${sources.join(", ")}`);
      }
      if (identifierRegistry) {
        scanInfo.push(
          `Identifier registry: applied=${identifierRegistry.applied}, ambiguous=${identifierRegistry.ambiguous}`
        );
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
  {},
  async () => {
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

    // Compact output: only essential fields
    const compact = hierarchy.enriched.map((n) => ({
      id: n.id,
      className: n.className,
      name: n.name,
      frame: n.frame,
      file: n.file,
      fileLine: n.fileLine,
      ownerType: n.ownerType,
      confidence: n.confidence,
      mapped: n.mapped,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(compact, null, 2),
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

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server failed:", err);
  process.exit(1);
});
