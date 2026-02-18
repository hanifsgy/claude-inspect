#!/bin/bash

set -euo pipefail

REPO_URL="https://github.com/hanifsgy/claude-inspect.git"
INSTALL_DIR_DEFAULT="$HOME/.claude-inspect"
INSTALL_DIR="$INSTALL_DIR_DEFAULT"
BUILD_FROM_SOURCE=0
PROJECT_DIR="$(pwd)"
RUNTIME_PATHS=(
    "/.claude/commands/infra-basic/"
    "/config/"
    "/hooks/"
    "/overlay/"
    "/scripts/"
    "/src/"
    "/install.sh"
    "/package.json"
    "/package-lock.json"
)

usage() {
    echo "Usage: $0 [--dir <install-path>] [--build-from-source]"
    echo ""
    echo "  --dir <path>         Install tool directory (default: $INSTALL_DIR_DEFAULT)"
    echo "  --build-from-source  Skip release download and force local overlay build"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dir)
            if [ "$#" -lt 2 ]; then
                echo "Error: --dir requires a path"
                usage
                exit 1
            fi
            INSTALL_DIR="$2"
            shift
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
    local raw major
    if ! command -v node >/dev/null 2>&1; then
        echo "Error: Node.js is required (18+)."
        echo "Install from: https://nodejs.org"
        exit 1
    fi

    raw=$(node --version 2>/dev/null || true)
    major=$(printf '%s' "$raw" | sed -E 's/^v([0-9]+).*/\1/')
    if [ -z "$major" ] || [ "$major" -lt 18 ] 2>/dev/null; then
        echo "Error: Node.js 18+ is required. Found: ${raw:-unknown}"
        echo "Install from: https://nodejs.org"
        exit 1
    fi
}

check_prerequisites() {
    echo "[1/5] Checking prerequisites..."

    if ! command -v git >/dev/null 2>&1; then
        echo "Error: git is required. Install Xcode command line tools first."
        exit 1
    fi
    echo "  git: $(command -v git)"

    validate_node_version
    echo "  node: $(node --version)"

    if ! command -v axe >/dev/null 2>&1; then
        echo "Error: 'axe' CLI not found in PATH."
        echo "Install AXe from: https://github.com/nicklama/axe"
        exit 1
    fi
    echo "  axe: $(command -v axe)"
}

clone_or_update_repo() {
    echo "[2/5] Preparing tool directory: $INSTALL_DIR"

    if [ "$PROJECT_DIR" = "$INSTALL_DIR" ]; then
        echo "Error: Run this installer from your iOS project directory, not inside $INSTALL_DIR"
        exit 1
    fi

    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "  Existing install found, pulling latest changes..."
        git -C "$INSTALL_DIR" pull --ff-only
        configure_sparse_checkout
        return
    fi

    if [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
        echo "Error: Install directory exists and is not an existing claude-inspect git repo: $INSTALL_DIR"
        echo "Either choose another path with --dir or empty this directory first."
        exit 1
    fi

    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$INSTALL_DIR"
    configure_sparse_checkout
}

configure_sparse_checkout() {
    echo "  Checking out runtime files only (sparse checkout)..."
    git -C "$INSTALL_DIR" sparse-checkout init --no-cone
    git -C "$INSTALL_DIR" sparse-checkout set "${RUNTIME_PATHS[@]}"
}

reexec_using_installed_script_if_needed() {
    if [ "${INSTALL_BOOTSTRAPPED:-0}" -eq 1 ]; then
        return
    fi

    if [ "$0" = "$INSTALL_DIR/install.sh" ]; then
        return
    fi

    echo "  Switching to installed script version..."
    if [ "$INSTALL_DIR" = "$INSTALL_DIR_DEFAULT" ]; then
        if [ "$BUILD_FROM_SOURCE" -eq 1 ]; then
            INSTALL_BOOTSTRAPPED=1 bash "$INSTALL_DIR/install.sh" --build-from-source
        else
            INSTALL_BOOTSTRAPPED=1 bash "$INSTALL_DIR/install.sh"
        fi
    else
        if [ "$BUILD_FROM_SOURCE" -eq 1 ]; then
            INSTALL_BOOTSTRAPPED=1 bash "$INSTALL_DIR/install.sh" --dir "$INSTALL_DIR" --build-from-source
        else
            INSTALL_BOOTSTRAPPED=1 bash "$INSTALL_DIR/install.sh" --dir "$INSTALL_DIR"
        fi
    fi
    exit $?
}

install_node_deps() {
    echo "[3/5] Installing npm dependencies..."
    npm install --prefix "$INSTALL_DIR"
}

run_setup() {
    echo "[4/5] Preparing overlay binary (download/build via setup.sh)..."
    echo "[5/5] Configuring current project for MCP inspector..."
    if [ "$BUILD_FROM_SOURCE" -eq 1 ]; then
        (
            cd "$PROJECT_DIR"
            "$INSTALL_DIR/scripts/setup.sh" --build-from-source
        )
    else
        (
            cd "$PROJECT_DIR"
            "$INSTALL_DIR/scripts/setup.sh"
        )
    fi
}

echo "Installing simulator-inspector"
echo "  Project: $PROJECT_DIR"
echo "  Install: $INSTALL_DIR"
echo ""

check_prerequisites
clone_or_update_repo
reexec_using_installed_script_if_needed
install_node_deps
run_setup

echo ""
echo "Install complete."
echo "Run in your project: /infra-basic:simulator-inspector-on"
