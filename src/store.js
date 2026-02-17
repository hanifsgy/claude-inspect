import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HIERARCHY_PATH = resolve(ROOT, "data", "hierarchy.json");
const SELECTION_PATH = resolve(ROOT, "state", "selected_component.json");

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function saveHierarchy(tree) {
  ensureDir(HIERARCHY_PATH);
  writeFileSync(HIERARCHY_PATH, JSON.stringify(tree, null, 2));
}

export function loadHierarchy() {
  try {
    return JSON.parse(readFileSync(HIERARCHY_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveSelection(component) {
  ensureDir(SELECTION_PATH);
  writeFileSync(
    SELECTION_PATH,
    JSON.stringify({ ...component, timestamp: Date.now() }, null, 2)
  );
}

export function getSelection() {
  try {
    return JSON.parse(readFileSync(SELECTION_PATH, "utf-8"));
  } catch {
    return null;
  }
}
