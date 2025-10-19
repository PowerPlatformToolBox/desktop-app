# Tool Development Guide

This guide explains how to develop external tools for the Power Platform Tool Box using the new **Tool Host architecture** based on VS Code's Extension Host model.

## Overview

The Power Platform Tool Box uses a secure, isolated architecture for running tools:

-   **Tool Host**: Each tool runs in a separate Node.js process
-   **Secure IPC**: Structured message protocol for safe communication
-   **API Injection**: The `pptoolbox` API is injected at runtime
-   **Contribution Points**: Tools declare capabilities in `package.json`

## Quick Start

### 1. Create Your Tool Package

Create a new npm package with this structure:

```
my-tool/
├── package.json
├── index.js
└── README.md
```

### 2. Define package.json

```json
{
    "name": "@powerplatform/my-tool",
    "version": "1.0.0",
    "displayName": "My Tool",
    "description": "Description of what your tool does",
    "main": "index.js",
    "author": "Your Name",
    "keywords": ["powerplatform", "dataverse", "toolbox"],
    "engines": {
        "node": ">=16.0.0"
    }
}
```

### 3. Implement Your Tool

Create `index.js` with activation and deactivation functions:

```javascript
// Import the Power Platform Tool Box API
const pptoolbox = require("pptoolbox");

/**
 * Called when your tool is activated
 */
function activate(context) {
    console.log("My tool is now active!");

    // Register a command
    const disposable = pptoolbox.commands.registerCommand("myTool.doSomething", async () => {
        await pptoolbox.window.showInformationMessage("Hello from My Tool!");
    });

    // Subscribe to events
    const listener = pptoolbox.events.onEvent(pptoolbox.EventType.CONNECTION_CREATED, (event) => {
        console.log("Connection created:", event);
    });

    // Store disposables for cleanup
    context.subscriptions.push(disposable);
    context.subscriptions.push(listener);

    // Save state
    context.globalState.update("activated", new Date().toISOString());
}

/**
 * Called when your tool is deactivated
 */
function deactivate() {
    console.log("My tool is now deactivated!");
    // Cleanup is automatic via context.subscriptions
}

module.exports = { activate, deactivate };
```

## ToolBox API Reference

The `pptoolbox` module provides access to ToolBox functionality.

### Commands API

```javascript
// Register a command
const disposable = pptoolbox.commands.registerCommand("myTool.commandId", async (...args) => {
    // Command implementation
});

// Execute a command
await pptoolbox.commands.executeCommand("myTool.commandId", arg1, arg2);
```

### Window API

```javascript
// Show information message
await pptoolbox.window.showInformationMessage("Info message");

// Show warning message
await pptoolbox.window.showWarningMessage("Warning message");

// Show error message
await pptoolbox.window.showErrorMessage("Error message");

// Copy to clipboard
await pptoolbox.window.copyToClipboard("text to copy");
```

### Workspace API

```javascript
// Save file with dialog
const filePath = await pptoolbox.workspace.saveFile("default-filename.json", JSON.stringify(data, null, 2));
```

### Events API

```javascript
// Subscribe to events
const disposable = pptoolbox.events.onEvent(pptoolbox.EventType.CONNECTION_CREATED, (event) => {
    console.log("Event:", event);
});

// Emit custom event
await pptoolbox.events.emitEvent("myTool.customEvent", { data: "value" });

// Get event history
const history = await pptoolbox.events.getEventHistory(10);
```

### Available Event Types

```javascript
pptoolbox.EventType.TOOL_LOADED;
pptoolbox.EventType.TOOL_UNLOADED;
pptoolbox.EventType.CONNECTION_CREATED;
pptoolbox.EventType.CONNECTION_UPDATED;
pptoolbox.EventType.CONNECTION_DELETED;
pptoolbox.EventType.SETTINGS_UPDATED;
pptoolbox.EventType.NOTIFICATION_SHOWN;
```

## Tool Context

The `context` object passed to `activate()` provides:

### Global State

Persistent state across all workspaces:

```javascript
// Get value with default
const value = context.globalState.get("key", defaultValue);

// Update value
await context.globalState.update("key", value);

// Get all keys
const keys = context.globalState.keys();
```

### Workspace State

State specific to the current workspace:

```javascript
// Same API as globalState
const value = context.workspaceState.get("key", defaultValue);
await context.workspaceState.update("key", value);
```

### Subscriptions

Array for cleanup on deactivation:

```javascript
function activate(context) {
  const disposable = pptoolbox.commands.registerCommand(...);

  // Add to subscriptions for automatic cleanup
  context.subscriptions.push(disposable);
}
```

### Tool Information

```javascript
context.toolId; // Your tool's ID
context.extensionPath; // Path to your tool's installation directory
```

## Security Model

### Isolated Execution

-   Each tool runs in a separate Node.js process
-   Tools cannot directly access the main application or other tools
-   All communication goes through the structured IPC protocol

### API Restrictions

-   Tools only have access to the `pptoolbox` API
-   No direct access to Electron APIs or Node.js fs module
-   File operations go through secure dialogs

### Message Validation

-   All IPC messages are validated for structure and content
-   Prevents malicious or buggy tools from compromising the app
-   Request/response pattern with timeouts

## Best Practices

### 1. Command Naming

Use a unique prefix for your commands:

```javascript
"myTool.commandName"; // Good
"commandName"; // Bad - conflicts possible
```

### 2. Error Handling

Always handle errors gracefully:

```javascript
pptoolbox.commands.registerCommand("myTool.action", async () => {
    try {
        // Your code
    } catch (error) {
        await pptoolbox.window.showErrorMessage(`Failed to execute action: ${error.message}`);
    }
});
```

### 3. State Management

Use context.globalState for persistent settings:

```javascript
// Save user preference
await context.globalState.update("lastUsedConnection", connectionId);

// Load on next activation
const lastConn = context.globalState.get("lastUsedConnection");
```

### 4. Resource Cleanup

Always add disposables to context.subscriptions:

```javascript
function activate(context) {
  const cmd = pptoolbox.commands.registerCommand(...);
  const listener = pptoolbox.events.onEvent(...);

  context.subscriptions.push(cmd, listener);
  // Automatic cleanup on deactivation
}
```

### 5. Activation Events

Use specific activation events when possible:

```javascript
"activationEvents": [
  "onCommand:myTool.action"  // Good - loads only when needed
  // "*"                      // Avoid - loads on startup
]
```

## Publishing Your Tool

### 1. Test Locally

Install your tool locally for testing:

```bash
cd my-tool
npm link

# In ToolBox data directory
cd ~/AppData/Roaming/powerplatform-toolbox/tools  # Windows
# or ~/Library/Application Support/powerplatform-toolbox/tools  # macOS
npm link @powerplatform/my-tool
```

### 2. Publish to npm

```bash
cd my-tool
npm login
npm publish --access public
```

### 3. Install in ToolBox

Users can then install your tool from the ToolBox UI or command palette.

## Example Tools

Multiple complete example tools are available in the repository demonstrating different frameworks:

### Basic HTML/TypeScript Example

-   **Location**: `/examples/example-tool/`
-   **Package**: `pptb-example-tool-test`
-   **Demonstrates**: HTML-first architecture with TypeScript

### React Example

-   **Location**: `/examples/react-example/`
-   **Package**: `pptb-react-example`
-   **Demonstrates**: React 18 with Vite, TypeScript, and hooks

### Vue Example

-   **Location**: `/examples/vue-example/`
-   **Package**: `pptb-vue-example`
-   **Demonstrates**: Vue 3 with Composition API, Vite, and TypeScript

### Svelte Example

-   **Location**: `/examples/svelte-example/`
-   **Package**: `pptb-svelte-example`
-   **Demonstrates**: Svelte 5 with Vite and TypeScript

All examples demonstrate:

-   ToolBox API integration
-   Connection URL and access token handling
-   Event subscription and handling
-   Interactive UI with notifications
-   Modern build tooling (Vite)
-   Full TypeScript support

## Debugging

### Console Output

Use `console.log()` in your tool - output appears in the ToolBox developer console.

### Error Messages

Unhandled errors in your tool will be caught and displayed to the user.

### Tool Host Logs

Check the main ToolBox logs for tool host process information.

## Migration from Old Architecture

If you have tools using the old architecture:

### Old Pattern

```javascript
module.exports = {
    init: function (toolboxAPI, settings) {
        // Old initialization
    },
};
```

### New Pattern

```javascript
function activate(context) {
    // New activation
}

function deactivate() {
    // Cleanup
}

module.exports = { activate, deactivate };
```

### Key Changes

1. **Import API**: Use `require('pptoolbox')` instead of receiving it as parameter
2. **Context**: Use `context` object for state and subscriptions
3. **Commands**: Register commands via `pptoolbox.commands.registerCommand()`
4. **Lifecycle**: Implement `activate()` and `deactivate()` functions
5. **Contribution Points**: Declare in `package.json` instead of at runtime

## Support and Resources

-   **Documentation**: https://github.com/PowerPlatform-ToolBox/desktop-app
-   **Example Tool**: `/examples/example-tool/`
-   **Issues**: https://github.com/PowerPlatform-ToolBox/desktop-app/issues
-   **Discussions**: https://github.com/PowerPlatform-ToolBox/desktop-app/discussions
