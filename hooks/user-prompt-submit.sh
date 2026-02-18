#!/bin/bash
# Hook: UserPromptSubmit
# If a component was recently selected, inject rich context about it.
# Cross-references selected_component.json with hierarchy.json for full mapping data.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/../state/selected_component.json"
HIERARCHY_FILE="$SCRIPT_DIR/../data/hierarchy.json"

# Check if state file exists
if [ ! -f "$STATE_FILE" ]; then
    exit 0
fi

# Check if file was modified within last 5 minutes (300 seconds)
if [ "$(uname)" = "Darwin" ]; then
    FILE_MOD=$(stat -f %m "$STATE_FILE" 2>/dev/null || echo 0)
else
    FILE_MOD=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
fi

NOW=$(date +%s)
AGE=$(( NOW - FILE_MOD ))

if [ "$AGE" -gt 300 ]; then
    exit 0
fi

# Build rich context using node (has access to hierarchy + mapping data)
CONTEXT=$(node --input-type=module -e "
import { readFileSync } from 'fs';

const selected = JSON.parse(readFileSync('$STATE_FILE', 'utf-8'));
const id = selected.id || selected.name;

// Try to find enriched data from hierarchy
let enriched = null;
try {
  const hierarchy = JSON.parse(readFileSync('$HIERARCHY_FILE', 'utf-8'));
  enriched = hierarchy.enriched?.find(n => n.id === id);
} catch {}

const node = enriched || selected;
const lines = [];

lines.push('[Inspector] Selected UI Component');
lines.push('');
lines.push('Class: ' + (node.className || 'unknown'));
lines.push('Name: ' + (node.name || node.id || ''));
lines.push('Frame: (' + [node.frame?.x, node.frame?.y, node.frame?.w, node.frame?.h].join(', ') + ')');

if (node.file) {
  lines.push('File: ' + node.file + (node.fileLine ? ':' + node.fileLine : ''));
}
if (node.ownerType) {
  lines.push('Owner class: ' + node.ownerType);
}
if (node.mappedModule) {
  lines.push('Module: ' + node.mappedModule);
}
if (node.confidence !== undefined && node.confidence > 0) {
  const pct = (node.confidence * 100).toFixed(0);
  const level = node.confidence >= 0.7 ? 'high' : node.confidence >= 0.4 ? 'medium' : 'low';
  lines.push('Mapping confidence: ' + pct + '% (' + level + ')' + (node.ambiguous ? ' [ambiguous]' : ''));
}
if (node.evidence && node.evidence.length > 0) {
  lines.push('Evidence:');
  for (const ev of node.evidence) {
    lines.push('  - [' + ev.signal + '] ' + ev.detail);
  }
}
if (node.candidates && node.candidates.length > 1) {
  lines.push('Alternative candidates:');
  for (const c of node.candidates.slice(1, 4)) {
    lines.push('  - ' + c.file + ':' + c.line + ' (' + (c.confidence * 100).toFixed(0) + '%)');
  }
}

console.log(lines.join('\n'));
" 2>/dev/null)

if [ -z "$CONTEXT" ]; then
    # Fallback: raw JSON
    CONTENT=$(cat "$STATE_FILE")
    CONTEXT="Selected UI Component:\n$CONTENT"
fi

# Escape for JSON
ESCAPED=$(echo "$CONTEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null)

cat <<EOF
{
  "additionalContext": $ESCAPED
}
EOF
