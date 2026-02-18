#!/bin/bash
# Setup simulator-inspector in a target iOS project.
# Run from the target project root:
#   /path/to/claude-inspect/scripts/setup.sh
#
# Or with a one-liner:
#   bash <(curl -sL https://raw.githubusercontent.com/hanifsgy/claude-inspect/main/scripts/setup.sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(pwd)"

# Sanity check — don't install into the tool itself
if [ "$PROJECT_DIR" = "$TOOL_DIR" ]; then
    echo "Error: Run this from your iOS project directory, not from claude-inspect."
    exit 1
fi

echo "Setting up simulator-inspector"
echo "  Tool:    $TOOL_DIR"
echo "  Project: $PROJECT_DIR"
echo ""

# --- 1. .mcp.json ---
MCP_FILE="$PROJECT_DIR/.mcp.json"
if [ -f "$MCP_FILE" ]; then
    # Merge: add simulator-inspector to existing mcpServers
    HAS_INSPECTOR=$(node -e "
        const f = JSON.parse(require('fs').readFileSync('$MCP_FILE','utf-8'));
        console.log(f.mcpServers?.['simulator-inspector'] ? 'yes' : 'no');
    " 2>/dev/null || echo "no")

    if [ "$HAS_INSPECTOR" = "yes" ]; then
        echo "[1/4] .mcp.json already has simulator-inspector — skipping"
    else
        node -e "
            const fs = require('fs');
            const f = JSON.parse(fs.readFileSync('$MCP_FILE','utf-8'));
            if (!f.mcpServers) f.mcpServers = {};
            f.mcpServers['simulator-inspector'] = {
                command: 'node',
                args: ['$TOOL_DIR/src/server.js'],
                cwd: '$TOOL_DIR'
            };
            fs.writeFileSync('$MCP_FILE', JSON.stringify(f, null, 2) + '\n');
        "
        echo "[1/4] .mcp.json updated — added simulator-inspector"
    fi
else
    cat > "$MCP_FILE" << MCPEOF
{
  "mcpServers": {
    "simulator-inspector": {
      "command": "node",
      "args": ["$TOOL_DIR/src/server.js"],
      "cwd": "$TOOL_DIR"
    }
  }
}
MCPEOF
    echo "[1/4] .mcp.json created"
fi

# --- 2. Slash commands ---
CMD_DIR="$PROJECT_DIR/.claude/commands/infra-basic"
mkdir -p "$CMD_DIR"
cp "$TOOL_DIR/.claude/commands/infra-basic/simulator-inspector-on.md" "$CMD_DIR/"
cp "$TOOL_DIR/.claude/commands/infra-basic/simulator-inspector-off.md" "$CMD_DIR/"
echo "[2/4] Slash commands copied to .claude/commands/infra-basic/"

# --- 3. Settings (permissions + hook) ---
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.local.json"
HOOK_CMD="$TOOL_DIR/hooks/user-prompt-submit.sh"

if [ -f "$SETTINGS_FILE" ]; then
    node -e "
        const fs = require('fs');
        const f = JSON.parse(fs.readFileSync('$SETTINGS_FILE','utf-8'));

        const perms = [
            'mcp__simulator-inspector__inspector_start',
            'mcp__simulator-inspector__inspector_stop',
            'mcp__simulator-inspector__get_hierarchy',
            'mcp__simulator-inspector__wait_for_selection',
            'mcp__simulator-inspector__explain_component',
            'Bash($TOOL_DIR/scripts/*)',
            'Bash($HOOK_CMD)'
        ];

        if (!f.permissions) f.permissions = {};
        if (!f.permissions.allow) f.permissions.allow = [];
        for (const p of perms) {
            if (!f.permissions.allow.includes(p)) f.permissions.allow.push(p);
        }

        const hookEntry = { command: '$HOOK_CMD' };
        if (!f.hooks) f.hooks = {};
        if (!f.hooks.UserPromptSubmit) f.hooks.UserPromptSubmit = [];
        const hasHook = f.hooks.UserPromptSubmit.some(h => h.command === '$HOOK_CMD');
        if (!hasHook) f.hooks.UserPromptSubmit.push(hookEntry);

        fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(f, null, 2) + '\n');
    "
    echo "[3/4] settings.local.json updated — permissions + hook merged"
else
    mkdir -p "$PROJECT_DIR/.claude"
    cat > "$SETTINGS_FILE" << SETEOF
{
  "permissions": {
    "allow": [
      "mcp__simulator-inspector__inspector_start",
      "mcp__simulator-inspector__inspector_stop",
      "mcp__simulator-inspector__get_hierarchy",
      "mcp__simulator-inspector__wait_for_selection",
      "mcp__simulator-inspector__explain_component",
      "Bash($TOOL_DIR/scripts/*)",
      "Bash($HOOK_CMD)"
    ]
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "$HOOK_CMD"
      }
    ]
  }
}
SETEOF
    echo "[3/4] settings.local.json created"
fi

# --- 4. Build overlay if needed ---
OVERLAY_BIN="$TOOL_DIR/overlay/.build/release/OverlayApp"
if [ ! -f "$OVERLAY_BIN" ]; then
    echo "[4/4] Building overlay..."
    "$TOOL_DIR/scripts/build-overlay.sh"
else
    echo "[4/4] Overlay binary already built"
fi

echo ""
echo "Done! Start Claude Code in this directory and use:"
echo "  /infra-basic:simulator-inspector-on"
echo ""
echo "Or tell Claude: \"Start the simulator inspector\""
