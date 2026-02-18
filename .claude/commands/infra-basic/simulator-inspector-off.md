Stop the Simulator Inspector.

## Step 1: Resolve tool path

Read `.mcp.json` in the current project directory. Find the `simulator-inspector` server entry and extract the `cwd` field — this is the tool's install path (TOOL_DIR).

## Step 2: Stop MCP inspector

Call the `inspector_stop` MCP tool to close the overlay.

## Step 3: Kill remaining processes

Run `<TOOL_DIR>/scripts/simulator-inspector-off.sh` to kill any remaining overlay or scan processes.

Confirm the inspector has been stopped.
