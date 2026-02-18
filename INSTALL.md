# Simulator Inspector for Claude Code

Simulator Inspector exists to solve a common iOS workflow problem: you can see a UI component in Simulator, but you do not know which Swift file and line own it. This tool connects Simulator UI back to source code and gives Claude that context automatically.

It does this by combining:
- AXe UI hierarchy from the booted simulator
- Source scanning/matching across your Swift codebase
- A macOS overlay to click visible components
- MCP tools + Claude hook injection for selected-component context

Your iOS app code is not modified.

## Prerequisites

- macOS with Xcode and iOS Simulator
- Node.js 18+
- `axe` CLI in `PATH` (`axe describe-ui` should work with a booted simulator)
- Claude Code CLI

## Install (recommended)

Run from your iOS project root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hanifsgy/claude-inspect/main/install.sh)
```

What this installer does:
1. Checks `git`, `node`, and `axe`
2. Clones/updates tool repo into `~/.claude-inspect`
3. Uses sparse checkout so only runtime files are fetched locally
4. Installs npm dependencies
5. Runs project setup (MCP config, Claude settings/hooks, slash command symlinks, overlay binary)

Optional flags:

```bash
# custom install location
bash <(curl -fsSL https://raw.githubusercontent.com/hanifsgy/claude-inspect/main/install.sh) -- --dir "/custom/path/.claude-inspect"

# force local overlay build
bash <(curl -fsSL https://raw.githubusercontent.com/hanifsgy/claude-inspect/main/install.sh) -- --build-from-source
```

## Install (already cloned)

If you already cloned the repo yourself, run this from your iOS project root:

```bash
/path/to/claude-inspect/scripts/setup.sh
```

## Verify installation

```bash
/path/to/claude-inspect/scripts/setup.sh --verify
```

Doctor checks:
- MCP server startup smoke test
- Overlay binary presence + executable bit
- Hook executable + valid JSON output format
- `.mcp.json` and `.claude/settings.local.json` JSON parsing
- `axe describe-ui`

## Usage

From your iOS project:

```bash
claude
```

Then run:

```text
/infra-basic:simulator-inspector-on
```

Flow:
1. Tool scans UI and maps components to Swift source
2. Overlay opens on top of Simulator
3. You click a component
4. Claude receives mapped context (`file:line`, owner type, confidence, evidence)
5. Claude can auto-analyze responsibility, interactions, and callback wiring

Stop with:

```text
/infra-basic:simulator-inspector-off
```

## MCP tools exposed to Claude

- `inspector_start`
- `inspector_stop`
- `get_hierarchy`
- `wait_for_selection`
- `explain_component`

## Mapping model (high level)

Mapping is multi-signal, not class-name only. Signals include identifier matches, class/type matches, label matches, and manual overrides from `config/inspector-map.json`.

## Troubleshooting

- **Unknown slash command**: start Claude from the project directory that contains `.claude/commands/infra-basic/`.
- **Hook schema error**: rerun installer/setup; current setup writes the new matcher-compatible hook structure.
- **Overlay missing**: boot a simulator and rerun setup; verify binary at `/path/to/claude-inspect/overlay/.build/release/OverlayApp`.
- **No mappings**: confirm project path passed to scan is correct and contains Swift sources.
- **AXe fails**: ensure simulator is booted and `axe describe-ui` succeeds in terminal.
