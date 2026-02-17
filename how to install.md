# How to Install

This project can be reused as a standalone toolkit and connected to Claude Code via MCP.

## 1) Clone and install dependencies

```bash
git clone <your-repo-url> analyze-components-tools
cd analyze-components-tools
npm install
```

## 2) Build the overlay binary

```bash
./scripts/build-overlay.sh
```

## 3) Prerequisites

- macOS with Xcode Simulator
- Node.js
- `axe` CLI available in `PATH`

## 4) Hook into Claude Code (MCP)

In your target project, create or update `.mcp.json`:

```json
{
  "mcpServers": {
    "simulator-inspector": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/analyze-components-tools/src/server.js"],
      "cwd": "/ABSOLUTE/PATH/TO/analyze-components-tools"
    }
  }
}
```

Available MCP tools:

- `inspector_start`
- `inspector_stop`
- `get_hierarchy`
- `wait_for_selection`

## 5) Optional Claude Code integrations

Copy command docs to your project:

- `.claude/commands/infra-basic/simulator-inspector-on.md`
- `.claude/commands/infra-basic/simulator-inspector-off.md`

Add hook in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "/ABSOLUTE/PATH/TO/analyze-components-tools/hooks/user-prompt-submit.sh"
      }
    ]
  }
}
```

## 6) Run manually (optional)

```bash
./scripts/simulator-inspector-on.sh <path-to-swift-project>
./scripts/simulator-inspector-off.sh
```
