#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
OVERLAY_BINARY="$ROOT_DIR/overlay/.build/release/OverlayApp"
SCAN_SCRIPT="$ROOT_DIR/src/scan.js"
STATE_DIR="$ROOT_DIR/state"
FRAMES_PATH="$STATE_DIR/overlay_frames.json"

# --- Arg: project path (required) ---
PROJECT_PATH="${1:-}"
if [ -z "$PROJECT_PATH" ]; then
    echo "Usage: ./scripts/simulator-inspector-on.sh <project-path> [simulator-udid]"
    echo "Example: ./scripts/simulator-inspector-on.sh ./Wiki"
    exit 1
fi

SIMULATOR_UDID="${2:-}"

mkdir -p "$STATE_DIR"

# Kill any existing overlay
pkill -f "OverlayApp" 2>/dev/null || true
sleep 0.3

# --- Step 1: Build overlay if needed ---
if [ ! -f "$OVERLAY_BINARY" ]; then
    echo "[1/4] Overlay binary not found. Building..."
    "$SCRIPT_DIR/build-overlay.sh"
else
    echo "[1/4] Overlay binary ready."
fi

# --- Step 2: Check prerequisites ---
echo "[2/4] Checking prerequisites..."

if ! command -v axe &>/dev/null; then
    echo "  ERROR: 'axe' CLI not found."
    echo "  Install: https://github.com/nicklama/axe"
    exit 1
fi

if ! xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
    echo "  ERROR: No booted simulator. Start one in Xcode first."
    exit 1
fi

echo "  axe: OK"
echo "  simulator: booted"

# --- Step 3: Run scan (AXe + file mapper) → create metadata ---
echo "[3/4] Scanning simulator UI + mapping to source files..."

SCAN_ARGS="$PROJECT_PATH"
if [ -n "$SIMULATOR_UDID" ]; then
    SCAN_ARGS="$PROJECT_PATH $SIMULATOR_UDID"
fi

# scan.js outputs overlay frames JSON to stdout, saves hierarchy to data/
node "$SCAN_SCRIPT" $SCAN_ARGS > "$FRAMES_PATH"

FRAME_COUNT=$(python3 -c "import json; d=json.load(open('$FRAMES_PATH')); print(len(d.get('components', d) if isinstance(d, dict) else d))" 2>/dev/null || echo "?")
echo "  Found $FRAME_COUNT components"
echo "  Saved to $FRAMES_PATH"

# --- Step 4: Launch overlay with frames file ---
echo "[4/4] Launching overlay..."

# Overlay reads frames from file, stays alive independently
"$OVERLAY_BINARY" "$FRAMES_PATH" &
OVERLAY_PID=$!
echo "$OVERLAY_PID" > "$STATE_DIR/overlay.pid"

echo ""
echo "Inspector running (PID: $OVERLAY_PID)"
echo "  - Overlay follows simulator window"
echo "  - Click 'Select' in status bar to pick a component"
echo "  - Click 'Refresh' to re-read frames"
echo "  - Click '✕' to close overlay"
echo "  - Or run: ./scripts/simulator-inspector-off.sh"
