# How to Install Simulator Inspector on Your Project

This is a **standalone toolkit** — it lives outside your iOS project and connects to Claude Code via MCP. Your actual iOS project doesn't need any modifications.

## Prerequisites

- macOS with Xcode and iOS Simulator
- Node.js 18+
- `axe` CLI in your PATH (`axe describe-ui` must work)
- Claude Code CLI

## Quick setup (one command)

From your iOS project root:

```bash
/path/to/claude-inspect/scripts/setup.sh
```

This creates/updates `.mcp.json`, `.claude/settings.local.json`, and copies slash commands — all with correct absolute paths. Builds the overlay if needed.

That's it. Start Claude Code and go.

## Manual setup

If you prefer to set things up yourself:

<details>
<summary>Step-by-step manual instructions</summary>

### 1. Clone and build

```bash
git clone https://github.com/hanifsgy/claude-inspect.git
cd claude-inspect
npm install
./scripts/build-overlay.sh
```

### 2. Create `.mcp.json` in your iOS project root

```json
{
  "mcpServers": {
    "simulator-inspector": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/claude-inspect/src/server.js"],
      "cwd": "/ABSOLUTE/PATH/TO/claude-inspect"
    }
  }
}
```

The `cwd` field must point to the claude-inspect directory.

### 3. Create `.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "mcp__simulator-inspector__inspector_start",
      "mcp__simulator-inspector__inspector_stop",
      "mcp__simulator-inspector__get_hierarchy",
      "mcp__simulator-inspector__wait_for_selection",
      "mcp__simulator-inspector__explain_component",
      "Bash(/ABSOLUTE/PATH/TO/claude-inspect/scripts/*)",
      "Bash(/ABSOLUTE/PATH/TO/claude-inspect/hooks/user-prompt-submit.sh)"
    ]
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "/ABSOLUTE/PATH/TO/claude-inspect/hooks/user-prompt-submit.sh"
      }
    ]
  }
}
```

### 4. Copy slash commands

```bash
mkdir -p .claude/commands/infra-basic
cp /path/to/claude-inspect/.claude/commands/infra-basic/*.md .claude/commands/infra-basic/
```

</details>

## 6. Usage

### Start Claude Code in your project

```bash
cd /path/to/your/ios-project
claude
```

Claude now has access to 5 inspector tools via MCP.

### Start the inspector

Tell Claude:
```
Start the simulator inspector on this project
```

Or use the slash command:
```
/infra-basic:simulator-inspector-on
```

Claude will call `inspector_start` with your project path. This:
1. Runs AXe to capture the simulator's accessibility tree
2. Scans your Swift source files to map UI elements → file:line
3. Opens the overlay with blue outlines on every component

### Click a component

Click any outlined component in the overlay. The inspector saves metadata to `state/selected_component.json`. If you have the hook configured, your next prompt to Claude automatically includes:
- Class name and identifier
- Source file and line number
- Owner class (enclosing type)
- Confidence score with evidence
- Alternative candidates (if ambiguous)

### Ask Claude about the component

After clicking, just type your question:
```
What does this component do?
How can I change the layout of this view?
Show me the data flow for this cell
```

Claude receives the component context automatically and can navigate to the relevant source code.

### Stop the inspector

```
Stop the inspector
```

Or: `/infra-basic:simulator-inspector-off`

## What Claude sees

When connected via MCP, Claude has these tools:

| Tool | What it does |
|------|-------------|
| `inspector_start` | Scan hierarchy + map to source + show overlay |
| `inspector_stop` | Close overlay |
| `get_hierarchy` | Get the full enriched hierarchy with file:line mappings |
| `wait_for_selection` | Wait for user to click a component |
| `explain_component` | Explain why a component was mapped to a specific file |

## How mapping works

The inspector doesn't just use class names. It uses **multi-signal matching**:

| Signal | Weight | Example |
|--------|--------|---------|
| `identifier_exact` | 0.9 | `.accessibilityIdentifier = "submitButton"` matches exactly |
| `class_name` | 0.7 | AX type `UIButton` matches `class SubmitButton: UIButton` |
| `identifier_prefix` | 0.6 | `"card.\(index)"` matches `card.0`, `card.1`, etc. |
| `label_exact` | 0.5 | AX label matches string literal in source |
| `manual_override` | 1.0 | From `config/inspector-map.json` |

Confidence: **HIGH** >= 70%, **MEDIUM** >= 40%

## Manual overrides

For components the auto-mapper can't resolve, edit `config/inspector-map.json` in the claude-inspect directory:

```json
{
  "overrides": [
    {
      "axId": "some.component.id",
      "file": "Sources/MyView.swift",
      "line": 42,
      "ownerType": "MyView"
    }
  ]
}
```

## Supported project types

The module indexer auto-detects:
- **Xcode projects** (`.xcodeproj`, including Xcode 16+ fileSystemSynchronizedGroups)
- **XcodeGen** (`project.yml`)
- **Swift Package Manager** (`Package.swift`)
- **Plain directories** (fallback — recursively finds `.swift` files)

## Troubleshooting

**Claude says "Unknown skill" for slash commands:**
Make sure you launched Claude Code from within your project directory where `.claude/commands/` exists.

**0 components mapped:**
Check that `inspector_start` received the correct absolute path to your Swift project.

**Overlay doesn't appear:**
- Is the iOS Simulator running with a booted device?
- Was the overlay built? Check: `ls /path/to/claude-inspect/overlay/.build/release/OverlayApp`

**Hook not injecting context:**
- Is the hook path absolute and correct in settings.local.json?
- Is `user-prompt-submit.sh` executable? `chmod +x /path/to/hooks/user-prompt-submit.sh`
- Was a component clicked in the last 5 minutes?
