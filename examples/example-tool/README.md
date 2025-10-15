# Example PowerPlatform Tool

This is an example tool that demonstrates the PowerPlatform ToolBox architecture with:

- **Secure Tool Host**: Runs in an isolated process with structured IPC
- **Contribution Points**: Commands, menus, and configuration declared in package.json
- **ToolBox API**: Access to notifications, clipboard, file operations, and events
- **State Management**: Persistent global and workspace state
- **Webview UI**: Interactive user interface rendered in the ToolBox renderer

## Features

### Commands

- `example.sayHello` - Shows a hello message
- `example.showNotification` - Displays an example notification
- `example.exportData` - Exports example data to a JSON file

### Event Subscriptions

- Listens to connection created events
- Listens to settings updated events

### User Interface

The tool includes a webview-based UI (`ui/webview.html`) that provides:
- Tool information dashboard
- Command execution buttons
- Event log viewer
- Custom message input
- Interactive controls for all tool features

## Installation

In the PowerPlatform ToolBox, use the Tools menu to install:

```
@powerplatform/example-tool
```

The tool will be automatically loaded and activated.

## Project Structure

```
example-tool/
├── index.js          # Main tool implementation
├── ui/
│   └── webview.html  # Tool user interface
├── package.json      # Tool manifest with contribution points
└── README.md         # This file
```

## User Interface

The tool includes a webview UI that displays in the ToolBox renderer:

- **Tool Information**: Shows tool metadata and status
- **Available Commands**: Lists all registered commands with execute buttons
- **Tool Actions**: Quick access buttons for common operations
- **Event Log**: Real-time log of tool activities
- **Custom Input**: Allows users to customize messages and actions

The UI is rendered using standard HTML/CSS/JavaScript and communicates with the tool's backend through the ToolBox API.

## Usage

Once installed, the tool will automatically activate when:
- Any of its commands are executed
- The ToolBox starts (via `*` activation event)

## Development

To create your own tool based on this example:

1. Copy this structure to a new directory
2. Update `package.json` with your tool information
3. Modify `index.js` to implement your tool logic
4. Publish to npm with `npm publish`

## Architecture

This tool demonstrates the VS Code Extension Host-like architecture:

- **Isolated Execution**: Runs in a separate Node.js process
- **Secure IPC**: Structured message protocol for communication
- **API Injection**: `pptoolbox` module is injected at runtime
- **Lifecycle Management**: `activate()` and `deactivate()` functions

## API Reference

See the main ToolBox documentation for complete API reference:
- `pptoolbox.commands` - Command registration and execution
- `pptoolbox.window` - UI interactions (messages, clipboard)
- `pptoolbox.workspace` - File operations
- `pptoolbox.events` - Event subscription and emission
