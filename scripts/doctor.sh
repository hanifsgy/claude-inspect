#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${1:-$(pwd)}"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "PASS: $1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "      $2"
    fi
}

check_server_smoke() {
    local log_file server_pid exit_code
    log_file=$(mktemp)

    (
        node "$TOOL_DIR/src/server.js" >"$log_file" 2>&1
    ) &
    server_pid=$!

    sleep 1

    if kill -0 "$server_pid" 2>/dev/null; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
        pass "MCP server starts (smoke test)"
    else
        wait "$server_pid"
        exit_code=$?

        if [ "$exit_code" -eq 0 ]; then
            pass "MCP server starts (smoke test)"
        else
            local first_line
            first_line=$(sed -n '1p' "$log_file")
            fail "MCP server starts (smoke test)" "${first_line:-server exited with code $exit_code}"
        fi
    fi

    rm -f "$log_file"
}

check_overlay_binary() {
    local overlay_bin
    overlay_bin="$TOOL_DIR/overlay/.build/release/OverlayApp"

    if [ -x "$overlay_bin" ]; then
        pass "Overlay binary exists and is executable"
    else
        fail "Overlay binary exists and is executable" "Missing or not executable: $overlay_bin"
    fi
}

check_hook_output() {
    local hook_file state_file hierarchy_file temp_dir hook_output
    local had_state had_hierarchy

    hook_file="$TOOL_DIR/hooks/user-prompt-submit.sh"
    state_file="$TOOL_DIR/state/selected_component.json"
    hierarchy_file="$TOOL_DIR/data/hierarchy.json"

    if [ ! -x "$hook_file" ]; then
        fail "Hook file is executable" "Missing +x on $hook_file"
        fail "Hook produces valid JSON output" "Hook not executable"
        return
    fi

    pass "Hook file is executable"

    temp_dir=$(mktemp -d)
    had_state=0
    had_hierarchy=0

    if [ -f "$state_file" ]; then
        cp "$state_file" "$temp_dir/state.backup"
        had_state=1
    fi

    if [ -f "$hierarchy_file" ]; then
        cp "$hierarchy_file" "$temp_dir/hierarchy.backup"
        had_hierarchy=1
    fi

    mkdir -p "$TOOL_DIR/state" "$TOOL_DIR/data"

    cat > "$state_file" <<'EOF'
{
  "id": "doctor.button",
  "name": "DoctorButton",
  "className": "UIButton",
  "frame": { "x": 0, "y": 0, "w": 10, "h": 10 }
}
EOF

    cat > "$hierarchy_file" <<'EOF'
{
  "enriched": [
    {
      "id": "doctor.button",
      "name": "DoctorButton",
      "className": "UIButton",
      "file": "Sources/DoctorView.swift",
      "fileLine": 42,
      "ownerType": "DoctorViewController",
      "confidence": 0.9,
      "evidence": [
        { "signal": "identifier_exact", "detail": "doctor.button" }
      ]
    }
  ]
}
EOF

    hook_output=$("$hook_file" 2>/dev/null || true)

    if [ -z "$hook_output" ]; then
        fail "Hook produces valid JSON output" "Hook returned empty output"
    elif printf '%s' "$hook_output" | node --input-type=module -e "
let data = '';
process.stdin.on('data', (chunk) => data += chunk);
process.stdin.on('end', () => {
  const parsed = JSON.parse(data);
  if (typeof parsed.additionalContext !== 'string') {
    process.exit(1);
  }
});
" >/dev/null 2>&1; then
        pass "Hook produces valid JSON output"
    else
        fail "Hook produces valid JSON output" "Output was not valid JSON with additionalContext"
    fi

    if [ "$had_state" -eq 1 ]; then
        cp "$temp_dir/state.backup" "$state_file"
    else
        rm -f "$state_file"
    fi

    if [ "$had_hierarchy" -eq 1 ]; then
        cp "$temp_dir/hierarchy.backup" "$hierarchy_file"
    else
        rm -f "$hierarchy_file"
    fi

    rm -rf "$temp_dir"
}

check_json_file() {
    local file_path label
    file_path="$1"
    label="$2"

    if [ ! -f "$file_path" ]; then
        fail "$label parses as JSON" "Missing file: $file_path"
        return
    fi

    if node --input-type=module -e "
import { readFileSync } from 'fs';
JSON.parse(readFileSync(process.argv[1], 'utf8'));
" "$file_path" >/dev/null 2>&1; then
        pass "$label parses as JSON"
    else
        fail "$label parses as JSON" "Invalid JSON in $file_path"
    fi
}

check_axe_describe_ui() {
    if ! command -v axe >/dev/null 2>&1; then
        fail "axe describe-ui works" "axe CLI not found in PATH"
        return
    fi

    if axe describe-ui >/dev/null 2>&1; then
        pass "axe describe-ui works"
    else
        fail "axe describe-ui works" "Command failed (boot a simulator and retry)"
    fi
}

echo "Running simulator-inspector doctor"
echo "  Tool:    $TOOL_DIR"
echo "  Project: $PROJECT_DIR"
echo ""

check_server_smoke
check_overlay_binary
check_hook_output
check_json_file "$PROJECT_DIR/.mcp.json" ".mcp.json"
check_json_file "$PROJECT_DIR/.claude/settings.local.json" "settings.local.json"
check_axe_describe_ui

echo ""
echo "Summary: $PASS_COUNT passed, $FAIL_COUNT failed"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi

exit 0
