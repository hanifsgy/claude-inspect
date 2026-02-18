Start the Simulator Inspector.

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

## Step 4: Wait for selection

Call the `wait_for_selection` MCP tool with a 120-second timeout.

Display the selected component's context: class name, file:line, owner type, confidence score, and evidence chain.
