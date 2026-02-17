Start the Simulator Inspector:

1. Run `./scripts/simulator-inspector-on.sh` to build the overlay if needed and verify prerequisites
2. Call the `inspector_start` MCP tool with the project path (default: current directory's Wiki/ folder or ask the user for their Swift project path)
3. Call the `wait_for_selection` MCP tool with a 120s timeout to wait for the user to click a component
4. Display the selected component's context: class name, file:line, frame, parent class, and dependencies
