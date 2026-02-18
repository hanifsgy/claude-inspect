# Claude Inspect

Claude Inspect is an iOS Simulator inspection toolkit for Claude Code.

It exists to answer this fast:

"I can see this UI in Simulator - where is it in my Swift code, what handles interaction, and what is wired/missing?"

## Why this project exists

iOS debugging and UI exploration are often slow because visual components are disconnected from source context. Claude Inspect bridges that gap by:

- reading the live accessibility hierarchy from Simulator (via AXe)
- mapping UI components to Swift files/lines with confidence scoring
- drawing a clickable overlay so you can pick components visually
- injecting selected-component context into Claude prompts automatically

This turns Claude from generic assistant into a source-aware UI debugging partner.

## What it provides

- MCP server (`src/server.js`) with tools:
  - `inspector_start`
  - `inspector_stop`
  - `get_hierarchy`
  - `wait_for_selection`
  - `explain_component`
- macOS overlay app (`overlay/`) to select components directly on Simulator
- setup/installer scripts for fast onboarding across projects
- hook integration so selected component metadata is attached to prompts

## Quick install

From your iOS project root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hanifsgy/claude-inspect/main/install.sh)
```

Then start Claude Code and run:

```text
/infra-basic:simulator-inspector-on
```

## Docs

- `README.md` - project overview, purpose, and workflow
- `INSTALL.md` - installation, setup details, and troubleshooting

## Core workflow

1. Start inspector
2. Click component in overlay
3. Claude receives class, file:line, owner type, confidence, and evidence
4. Ask questions like:
   - "What does this component do?"
   - "Where does this tap callback lead?"
   - "What wiring is missing?"

## Custom mapping rules

You can define manual mapping rules with `inspector-map.json` in any of these locations:

- `config/inspector-map.json` (tool defaults)
- `<your-project>/config/inspector-map.json`
- `<your-project>/.claude/inspector-map.json`

Later files override earlier ones.

Supported keys:

- `overrides`: explicit `pattern -> file:line` mappings
- `modulePriority`: preferred module order for tie-break/boost
- `criticalMappings`: rules validated by `scan --validate`

Example:

```json
{
  "overrides": [
    { "pattern": "home.header.*", "file": "Features/Home/HomeView.swift", "line": 42 }
  ],
  "modulePriority": ["Melodi", "SharedUI"],
  "criticalMappings": [
    { "pattern": "UIButton_Generate Music", "minConfidence": 0.7 }
  ]
}
```

## Validate mappings manually

Run a standalone scan with diagnostics:

```bash
node src/scan.js /absolute/path/to/your/app --validate
```

This prints index strategy, module/file coverage, mapping metrics, and fails with exit code `1` if `criticalMappings` checks fail.

## Identifier-first workflow

For precise LLM context, generate an identifier registry first, then scan/audit.

1) Build registry from source:

```bash
npm run index-identifiers -- /absolute/path/to/your/app
```

By default this writes `<project>/.claude/identifier-registry.json`.

2) Scan runtime UI and apply registry matches:

```bash
npm run scan -- /absolute/path/to/your/app --validate
```

`scan` now auto-generates `<project>/.claude/identifier-registry.json` if it is missing.

3) Generate local quality report artifacts:

```bash
npm run mapping-audit -- /absolute/path/to/your/app
```

This writes:

- `artifacts/mapping-report.json`
- `artifacts/failures.json`

## Requirements

- macOS + Xcode + booted iOS Simulator
- Node.js 18+
- AXe CLI (`axe`)
- Claude Code CLI
