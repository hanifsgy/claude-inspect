Start the Simulator Inspector and enter a persistent inspection loop.

## Step 1: Resolve tool path

Read `.mcp.json` in the current project directory. Find the `simulator-inspector` server entry and extract the `cwd` field — this is the tool's install path (TOOL_DIR).

If `.mcp.json` doesn't exist or has no `simulator-inspector` entry, ask the user for the absolute path to the claude-inspect directory.

## Step 2: Build & start overlay

Run `<TOOL_DIR>/scripts/simulator-inspector-on.sh <PROJECT_PATH>` where:
- `TOOL_DIR` is from step 1
- `PROJECT_PATH` is the current working directory (the user's iOS project)

This builds the overlay if needed, runs AXe + source mapping, and launches the overlay window.

## Step 3: Start MCP inspector

Call the `inspector_start` MCP tool with:
- `projectPath`: the current working directory (absolute path)
- `rescan`: false (the script already scanned)

## Step 4: Inspection loop

**Enter a persistent loop — keep listening until the user explicitly says to stop.**

For each iteration:

### 4a. Wait for selection
Call the `wait_for_selection` MCP tool with a 120-second timeout.

Tell the user: "Overlay is ready — click **◉ Select** then tap a component."

### 4b. Auto-analyse the selected component
Using the `wait_for_selection` payload, include these inputs in your analysis context before writing your answer:

- Component class + name + accessibility identifier
- Source location (`file:line`) and a code snippet (±20 lines)
- Mapping confidence and evidence chain
- Any alternative mapping candidates

Then produce a structured analysis:

1. **Identity** — class name, accessibility identifier, what kind of UI element it is
2. **Responsibility** — what this component displays or manages
3. **Interactions** — tap handlers, gesture recognisers, callbacks it fires and where they lead in the codebase
4. **Wiring** — any `onTap`, `onClick`, delegate, or closure callbacks — trace them to the call site
5. **Observations** — any missing wiring, bugs, or notable patterns (e.g. accessibility trait set but no tap handler)

Use this exact response template:

```
Identity
- ...

Responsibility
- ...

Interactions
- ...

Wiring / Callback chain
- ...

Observations / Gaps
- ...
```

### 4c. Prompt for next action
After displaying the analysis, tell the user:
> "Say **next** when you want me to wait for another component selection, or ask a follow-up question about this component."

Do **not** call `wait_for_selection` again immediately. Re-enter step 4a only when the user explicitly requests another selection (for example: "next", "another", "select", "continue") or taps another component and asks to inspect it.

**Only exit the loop if:**
- The user explicitly says "stop", "done", "exit", or similar
- `wait_for_selection` times out
- The user asks a question that requires focus outside the inspector
