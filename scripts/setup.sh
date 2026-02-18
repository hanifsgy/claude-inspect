#!/bin/bash
# Setup simulator-inspector in a target iOS project.
# Run from the target project root:
#   /path/to/claude-inspect/scripts/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(pwd)"
GITHUB_REPO="hanifsgy/claude-inspect"

VERIFY_ONLY=0
BUILD_FROM_SOURCE=0

usage() {
    echo "Usage: $0 [--verify] [--build-from-source]"
    echo ""
    echo "  --verify             Run post-install doctor checks and exit"
    echo "  --build-from-source  Skip release download and build overlay locally"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --verify)
            VERIFY_ONLY=1
            ;;
        --build-from-source)
            BUILD_FROM_SOURCE=1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option '$1'"
            usage
            exit 1
            ;;
    esac
    shift
done

validate_node_version() {
    if ! command -v node >/dev/null 2>&1; then
        echo "Error: Node.js is required (18+)."
        echo "Install from: https://nodejs.org"
        exit 1
    fi

    local raw major
    raw=$(node --version 2>/dev/null || true)
    major=$(printf '%s' "$raw" | sed -E 's/^v([0-9]+).*/\1/')

    if [ -z "$major" ] || [ "$major" -lt 18 ] 2>/dev/null; then
        echo "Error: Node.js 18+ is required. Found: ${raw:-unknown}"
        echo "Install a newer version from: https://nodejs.org"
        exit 1
    fi

    echo "  node: $raw"
}

check_prerequisites() {
    echo "[1/6] Checking prerequisites..."

    validate_node_version

    if ! command -v axe >/dev/null 2>&1; then
        echo "Error: 'axe' CLI not found in PATH."
        echo "Install AXe from: https://github.com/nicklama/axe"
        exit 1
    fi
    echo "  axe: $(command -v axe)"

    if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
        echo "  simulator: booted"
    else
        echo "  WARNING: no booted iOS simulator found."
        echo "  You can still finish setup now; start a simulator before running the inspector."
    fi
}

detect_arch_token() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        arm64)
            echo "arm64"
            ;;
        x86_64)
            echo "x86_64"
            ;;
        *)
            echo ""
            ;;
    esac
}

download_prebuilt_overlay() {
    local arch_token release_json asset_url asset_name checksum_url checksum_file expected_sha actual_sha tmp_bin
    arch_token=$(detect_arch_token)

    if [ -z "$arch_token" ]; then
        echo "  Unsupported architecture '$(uname -m)' for prebuilt overlay; building from source."
        return 1
    fi

    release_json=$(mktemp)
    if ! curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" -o "$release_json"; then
        rm -f "$release_json"
        echo "  Could not fetch latest release metadata; building from source."
        return 1
    fi

    asset_url=$(node --input-type=module -e "
import { readFileSync } from 'fs';

const release = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const arch = process.argv[2];
const assets = Array.isArray(release.assets) ? release.assets : [];
const candidates = assets.filter((asset) => {
  const name = String(asset.name || '').toLowerCase();
  if (!name.includes('overlay')) return false;
  if (!(name.includes('darwin') || name.includes('macos') || name.includes('mac'))) return false;
  return name.includes(arch);
});
if (candidates.length === 0) {
  process.stdout.write('');
} else {
  process.stdout.write(String(candidates[0].browser_download_url || ''));
}
" "$release_json" "$arch_token")

    if [ -z "$asset_url" ]; then
        rm -f "$release_json"
        echo "  No matching release asset found for macOS/$arch_token; building from source."
        return 1
    fi

    asset_name=$(basename "$asset_url")
    checksum_url=$(node --input-type=module -e "
import { readFileSync } from 'fs';

const release = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const assetName = process.argv[2];
const assets = Array.isArray(release.assets) ? release.assets : [];
const exact = assets.find((asset) => String(asset.name || '') === (assetName + '.sha256'));
if (exact) {
  process.stdout.write(String(exact.browser_download_url || ''));
} else {
  process.stdout.write('');
}
" "$release_json" "$asset_name")
    rm -f "$release_json"

    if [ -z "$checksum_url" ]; then
        echo "  Missing checksum asset (${asset_name}.sha256); building from source."
        return 1
    fi

    if ! command -v shasum >/dev/null 2>&1; then
        echo "  shasum not found; building from source."
        return 1
    fi

    mkdir -p "$(dirname "$OVERLAY_BIN")"
    tmp_bin="$OVERLAY_BIN.tmp"
    if ! curl -fL "$asset_url" -o "$tmp_bin"; then
        rm -f "$tmp_bin"
        echo "  Download failed; building from source."
        return 1
    fi

    checksum_file=$(mktemp)
    if ! curl -fsSL "$checksum_url" -o "$checksum_file"; then
        rm -f "$tmp_bin" "$checksum_file"
        echo "  Failed to download checksum file; building from source."
        return 1
    fi

    expected_sha=$(tr -d '\r' < "$checksum_file" | awk '{print $1}')
    rm -f "$checksum_file"

    if [ -z "$expected_sha" ]; then
        rm -f "$tmp_bin"
        echo "  Invalid checksum file format; building from source."
        return 1
    fi

    actual_sha=$(shasum -a 256 "$tmp_bin" | awk '{print $1}')
    if [ "$actual_sha" != "$expected_sha" ]; then
        rm -f "$tmp_bin"
        echo "  Checksum mismatch for downloaded overlay; building from source."
        return 1
    fi

    chmod +x "$tmp_bin"
    mv "$tmp_bin" "$OVERLAY_BIN"
    echo "  Downloaded prebuilt overlay for $arch_token"
    return 0
}

if [ "$VERIFY_ONLY" -eq 1 ]; then
    "$TOOL_DIR/scripts/doctor.sh" "$PROJECT_DIR"
    exit $?
fi

# Sanity check — don't install into the tool itself
if [ "$PROJECT_DIR" = "$TOOL_DIR" ]; then
    echo "Error: Run this from your iOS project directory, not from claude-inspect."
    exit 1
fi

echo "Setting up simulator-inspector"
echo "  Tool:    $TOOL_DIR"
echo "  Project: $PROJECT_DIR"
echo ""

check_prerequisites

# --- 2. .mcp.json ---
MCP_FILE="$PROJECT_DIR/.mcp.json"
if [ -f "$MCP_FILE" ]; then
    # Merge: add simulator-inspector to existing mcpServers
    HAS_INSPECTOR=$(node -e "
        const f = JSON.parse(require('fs').readFileSync('$MCP_FILE','utf-8'));
        console.log(f.mcpServers?.['simulator-inspector'] ? 'yes' : 'no');
    " 2>/dev/null || echo "no")

    if [ "$HAS_INSPECTOR" = "yes" ]; then
        echo "[2/6] .mcp.json already has simulator-inspector — skipping"
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
        echo "[2/6] .mcp.json updated — added simulator-inspector"
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
    echo "[2/6] .mcp.json created"
fi

# --- 3. Slash commands ---
CMD_DIR="$PROJECT_DIR/.claude/commands/infra-basic"
mkdir -p "$CMD_DIR"
ln -sf "$TOOL_DIR/.claude/commands/infra-basic/simulator-inspector-on.md" "$CMD_DIR/simulator-inspector-on.md"
ln -sf "$TOOL_DIR/.claude/commands/infra-basic/simulator-inspector-off.md" "$CMD_DIR/simulator-inspector-off.md"
echo "[3/6] Slash commands symlinked to .claude/commands/infra-basic/"

# --- 4. Settings (permissions + hook) ---
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
            'Bash($TOOL_DIR/scripts/simulator-inspector-on.sh:*)',
            'Bash($TOOL_DIR/scripts/simulator-inspector-off.sh:*)',
            'Bash($HOOK_CMD)'
        ];

        if (!f.permissions) f.permissions = {};
        if (!f.permissions.allow) f.permissions.allow = [];
        for (const p of perms) {
            if (!f.permissions.allow.includes(p)) f.permissions.allow.push(p);
        }

        if (!f.hooks) f.hooks = {};
        const currentHooks = Array.isArray(f.hooks.UserPromptSubmit) ? f.hooks.UserPromptSubmit : [];

        const normalizedHooks = [];
        for (const entry of currentHooks) {
            if (entry && Array.isArray(entry.hooks)) {
                normalizedHooks.push(entry);
                continue;
            }

            if (entry && typeof entry.command === 'string') {
                normalizedHooks.push({
                    hooks: [
                        {
                            type: 'command',
                            command: entry.command
                        }
                    ]
                });
            }
        }

        const hasHook = normalizedHooks.some(entry =>
            Array.isArray(entry.hooks) &&
            entry.hooks.some(h => h && h.type === 'command' && h.command === '$HOOK_CMD')
        );

        if (!hasHook) {
            normalizedHooks.push({
                hooks: [
                    {
                        type: 'command',
                        command: '$HOOK_CMD'
                    }
                ]
            });
        }

        f.hooks.UserPromptSubmit = normalizedHooks;

        fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(f, null, 2) + '\n');
    "
    echo "[4/6] settings.local.json updated — permissions + hook merged"
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
      "Bash($TOOL_DIR/scripts/simulator-inspector-on.sh:*)",
      "Bash($TOOL_DIR/scripts/simulator-inspector-off.sh:*)",
      "Bash($HOOK_CMD)"
    ]
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOOK_CMD"
          }
        ]
      }
    ]
  }
}
SETEOF
    echo "[4/6] settings.local.json created"
fi

# --- 5. Install Node dependencies ---
if [ ! -d "$TOOL_DIR/node_modules" ]; then
    echo "[5/6] Installing npm dependencies..."
    npm install --prefix "$TOOL_DIR"
else
    echo "[5/6] npm dependencies already installed"
fi

# --- 6. Download/build overlay if needed ---
OVERLAY_BIN="$TOOL_DIR/overlay/.build/release/OverlayApp"
if [ -x "$OVERLAY_BIN" ]; then
    echo "[6/6] Overlay binary already built"
else
    echo "[6/6] Preparing overlay binary..."
    if [ "$BUILD_FROM_SOURCE" -eq 1 ]; then
        echo "  --build-from-source set; skipping release download"
        "$TOOL_DIR/scripts/build-overlay.sh"
    elif ! download_prebuilt_overlay; then
        "$TOOL_DIR/scripts/build-overlay.sh"
    fi
fi

echo ""
echo "Done! Start Claude Code in this directory and use:"
echo "  /infra-basic:simulator-inspector-on"
echo ""
echo "Health check: $TOOL_DIR/scripts/setup.sh --verify"
echo "Or tell Claude: \"Start the simulator inspector\""
