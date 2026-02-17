#!/bin/bash
# Hook: UserPromptSubmit
# If a component was recently selected, inject its metadata as additionalContext.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/../state/selected_component.json"

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

# Read the JSON and output as additionalContext
CONTENT=$(cat "$STATE_FILE")

cat <<EOF
{
  "additionalContext": "Selected UI Component:\n$CONTENT"
}
EOF
