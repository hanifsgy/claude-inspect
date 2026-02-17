import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeUI, flattenTree } from "./axe.js";
import { reconcile } from "./file-mapper.js";
import { OverlayBridge } from "./overlay-bridge.js";
import { saveHierarchy, loadHierarchy, saveSelection, getSelection } from "./store.js";

const server = new McpServer({
  name: "simulator-inspector",
  version: "1.0.0",
});

const bridge = new OverlayBridge();
let currentHierarchy = null;

// --- Tool: inspector_start ---
server.tool(
  "inspector_start",
  "Start the simulator inspector. If the script already ran (hierarchy exists in data/hierarchy.json), reuses that data. Otherwise runs AXe + file mapper fresh. Launches overlay with component outlines.",
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
      // Check if script already generated the hierarchy
      const existing = loadHierarchy();
      const isFresh = existing && (Date.now() - existing.timestamp < 60000); // <1 min old

      if (isFresh && !rescan) {
        // Reuse hierarchy from scan.js (already run by simulator-inspector-on.sh)
        currentHierarchy = existing;
        const mapped = existing.enriched.filter((n) => n.mapped).length;
        const total = existing.enriched.length;

        // Start overlay and send existing frames
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
              text: `Inspector started (using cached scan). Found ${total} UI elements, ${mapped} mapped to source files.`,
            },
          ],
        };
      }

      // Fresh scan: AXe + file mapper
      // 1. Start overlay
      bridge.start(simulatorUdid || "booted");

      // 2. Run AXe to get class names from simulator
      const { tree, flat } = describeUI(simulatorUdid);

      // 3. Run file mapper to enrich with file:line + dependencies
      const enriched = reconcile(flat, projectPath);

      // 4. Save hierarchy
      currentHierarchy = { tree, enriched, timestamp: Date.now() };
      saveHierarchy(currentHierarchy);

      // 5. Send frames to overlay
      const components = enriched.map((node) => ({
        id: node.id,
        className: node.className,
        name: node.name,
        frame: node.frame,
      }));
      bridge.highlight(components);

      const mapped = enriched.filter((n) => n.mapped).length;
      const total = enriched.length;

      return {
        content: [
          {
            type: "text",
            text: `Inspector started (fresh scan). Found ${total} UI elements, ${mapped} mapped to source files.`,
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
  "Return the enriched UI hierarchy tree with class names, file:line mappings, frames, and dependency info.",
  {},
  async () => {
    const hierarchy = currentHierarchy || loadHierarchy();

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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(hierarchy.enriched, null, 2),
        },
      ],
    };
  }
);

// --- Tool: wait_for_selection ---
server.tool(
  "wait_for_selection",
  "Wait for the user to click a component in the simulator overlay. Returns the selected component's metadata including class name, file:line, frame, and dependencies.",
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

      const lines = [
        `Selected: ${selection.className}`,
        selection.name ? `Name: "${selection.name}"` : null,
        selection.file ? `File: ${selection.file}:${selection.fileLine}` : null,
        selection.parentClass ? `Parent: ${selection.parentClass}` : null,
        `Frame: (${selection.frame.x}, ${selection.frame.y}, ${selection.frame.w}, ${selection.frame.h})`,
      ].filter(Boolean);

      if (selection.dependencies && selection.dependencies.imports) {
        lines.push(`Imports: ${selection.dependencies.imports.join(", ")}`);
      }

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

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server failed:", err);
  process.exit(1);
});
