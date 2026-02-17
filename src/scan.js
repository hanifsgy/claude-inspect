#!/usr/bin/env node
/**
 * Standalone scanner: runs AXe + file-mapper, outputs enriched hierarchy.
 *
 * Usage:
 *   node src/scan.js <projectPath> [simulatorUdid]
 *
 * Outputs:
 *   data/hierarchy.json        — full enriched hierarchy
 *   stdout (JSON)              — overlay-ready format with screen dims + components
 */
import { describeUI, flattenTree } from "./axe.js";
import { reconcile } from "./file-mapper.js";
import { saveHierarchy } from "./store.js";
import { detectGeometry } from "./geometry.js";

const projectPath = process.argv[2];
const simulatorUdid = process.argv[3]; // optional

if (!projectPath) {
  console.error("Usage: node src/scan.js <projectPath> [simulatorUdid]");
  process.exit(1);
}

// Step 1: Run AXe → get UI tree from simulator
let tree, flat;
try {
  const result = describeUI(simulatorUdid);
  tree = result.tree;
  flat = result.flat;
  console.error(`[scan] AXe found ${flat.length} UI elements`);
} catch (err) {
  console.error(`[scan] AXe failed: ${err.message}`);
  console.error(`[scan] Falling back to file-only scan (no simulator data)`);
  tree = [];
  flat = [];
}

// Step 2: Extract iOS screen dimensions from root element (Application)
let screen = { w: 402, h: 874 }; // sensible default for iPhone 17 Pro
if (flat.length > 0) {
  const root = flat[0];
  if (root.frame && root.frame.w > 0 && root.frame.h > 0) {
    screen = { w: root.frame.w, h: root.frame.h };
  }
}
console.error(`[scan] iOS screen: ${screen.w} x ${screen.h} points`);

// Step 3: Scan project Swift files → enrich with file:line, dependencies
const enriched = reconcile(flat, projectPath);
const mapped = enriched.filter((n) => n.mapped).length;
console.error(`[scan] Mapped ${mapped}/${enriched.length} elements to source files`);

// Step 4: Save full hierarchy to data/hierarchy.json
const hierarchy = { tree, enriched, timestamp: Date.now() };
saveHierarchy(hierarchy);
console.error(`[scan] Saved hierarchy to data/hierarchy.json`);

// Step 5: Detect simulator geometry — exact iOS content rect within macOS window
console.error(`[scan] Detecting simulator geometry...`);
const geometry = detectGeometry(screen.w, screen.h);
const verticalOffset = 20;
const contentRect = {
  ...geometry.contentRect,
  y: geometry.contentRect.y + verticalOffset,
};

console.error(
  `[scan] Content rect: (${contentRect.x.toFixed(1)}, ${contentRect.y.toFixed(1)}, ${contentRect.w.toFixed(1)}, ${contentRect.h.toFixed(1)})`
);
console.error(`[scan] Applied vertical offset: +${verticalOffset}px`);
console.error(`[scan] Render scale: ${geometry.scale.toFixed(4)}`);

// Step 6: Output overlay-ready format with screen info + contentRect + enriched components
const components = enriched
  .filter((node) => node.className !== "UIApplication")
  .map((node) => ({
    id: node.id,
    className: node.className,
    name: node.name,
    frame: node.frame,
    file: node.file || null,
    fileLine: node.fileLine || null,
  }));

const output = {
  screen,
  contentRect,
  scale: geometry.scale,
  components,
};

console.log(JSON.stringify(output));
