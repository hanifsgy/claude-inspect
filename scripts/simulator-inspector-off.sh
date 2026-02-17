#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../state"

# Kill by saved PID first, fall back to pkill
if [ -f "$STATE_DIR/overlay.pid" ]; then
    PID=$(cat "$STATE_DIR/overlay.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Overlay stopped (PID: $PID)"
    else
        echo "Overlay already stopped."
    fi
    rm -f "$STATE_DIR/overlay.pid"
elif pgrep -f "OverlayApp" > /dev/null 2>&1; then
    pkill -f "OverlayApp"
    echo "Overlay killed."
else
    echo "No overlay running."
fi
