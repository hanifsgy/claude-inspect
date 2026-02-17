#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OVERLAY_DIR="$SCRIPT_DIR/../overlay"

echo "Building overlay app..."
cd "$OVERLAY_DIR"
swift build -c release 2>&1

BINARY="$OVERLAY_DIR/.build/release/OverlayApp"
if [ -f "$BINARY" ]; then
    echo "Build successful: $BINARY"
else
    echo "Build failed: binary not found"
    exit 1
fi
