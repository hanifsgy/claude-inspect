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
Using the returned `file:line`, read the source file (±30 lines around the line). Then produce a structured analysis:

1. **Identity** — class name, accessibility identifier, what kind of UI element it is
2. **Responsibility** — what this component displays or manages
3. **Interactions** — tap handlers, gesture recognisers, callbacks it fires and where they lead in the codebase
4. **Wiring** — any `onTap`, `onClick`, delegate, or closure callbacks — trace them to the call site
5. **Observations** — any missing wiring, bugs, or notable patterns (e.g. accessibility trait set but no tap handler)

### 4c. Prompt for next action
After displaying the analysis, tell the user:
> "Tap **✕ Clear** on the overlay to select another component, or tell me what you'd like to dig into."

Then **immediately call `wait_for_selection` again** (go back to 4a) without waiting for the user to re-run the skill. The bridge queues clicks made while Claude is responding, so the next call may return instantly if the user already picked something.

**Only exit the loop if:**
- The user explicitly says "stop", "done", "exit", or similar
- `wait_for_selection` times out
- The user asks a question that requires focus outside the inspector
