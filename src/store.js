import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HIERARCHY_PATH = resolve(ROOT, "data", "hierarchy.json");
const SELECTION_PATH = resolve(ROOT, "state", "selected_component.json");
const FEEDBACK_PATH = resolve(ROOT, "state", "mapping-feedback.json");

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

export function saveFeedback(feedback) {
  ensureDir(FEEDBACK_PATH);
  let all = loadAllFeedback();
  all.entries.push(feedback);
  all.updatedAt = Date.now();
  writeFileSync(FEEDBACK_PATH, JSON.stringify(all, null, 2));
}

export function loadAllFeedback() {
  try {
    return JSON.parse(readFileSync(FEEDBACK_PATH, "utf-8"));
  } catch {
    return { entries: [], createdAt: Date.now(), updatedAt: Date.now() };
  }
}

export function getFeedbackStats() {
  const all = loadAllFeedback();
  const correct = all.entries.filter(e => e.correct).length;
  const incorrect = all.entries.filter(e => !e.correct).length;
  const bySignal = {};
  
  for (const entry of all.entries) {
    for (const signal of (entry.signals || [])) {
      if (!bySignal[signal]) bySignal[signal] = { correct: 0, incorrect: 0 };
      bySignal[signal][entry.correct ? 'correct' : 'incorrect']++;
    }
  }
  
  return { total: all.entries.length, correct, incorrect, bySignal };
}

export function clearFeedback() {
  ensureDir(FEEDBACK_PATH);
  writeFileSync(FEEDBACK_PATH, JSON.stringify({ entries: [], createdAt: Date.now(), updatedAt: Date.now() }, null, 2));
}
