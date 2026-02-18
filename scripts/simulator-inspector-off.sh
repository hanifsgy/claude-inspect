#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../state"
SCAN_PID_PATH="$STATE_DIR/scan.pid"
SCAN_TRIGGER_PATH="$STATE_DIR/scan.trigger"

# Kill by saved PID only
if [ -f "$STATE_DIR/overlay.pid" ]; then
    PID=$(cat "$STATE_DIR/overlay.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Overlay stopped (PID: $PID)"
    else
        echo "Overlay already stopped."
    fi
    rm -f "$STATE_DIR/overlay.pid"
else
    echo "No overlay running."
fi

# Stop background scan loop if present
if [ -f "$SCAN_PID_PATH" ]; then
    SCAN_PID=$(cat "$SCAN_PID_PATH")
    if kill -0 "$SCAN_PID" 2>/dev/null; then
        kill "$SCAN_PID"
        echo "Scan loop stopped (PID: $SCAN_PID)"
    else
        echo "Scan loop already stopped."
    fi
    rm -f "$SCAN_PID_PATH"
fi

rm -f "$SCAN_TRIGGER_PATH"
