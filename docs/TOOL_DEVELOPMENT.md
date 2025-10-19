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

> Scafolding coming soon. This is a placeholder text

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

#### 3.1 Install `@pptb/types`

```bash
npm install --save-dev @pptb/types
```

#### 3.2 In your `index.ts` file

```typescript
/// <reference types="@pptb/types" />

// Access the ToolBox API
const toolbox = window.toolboxAPI;

// Get connection context
const context = await toolbox.getToolContext();
console.log("Connection URL:", context.connectionUrl);
console.log("Access Token:", context.accessToken);

// Subscribe to events
toolbox.onToolboxEvent((event, payload) => {
    console.log("Event:", payload.event, "Data:", payload.data);
});

// Show notifications
await toolbox.showNotification({
    title: "Success",
    body: "Operation completed successfully",
    type: "success",
});
```

## ToolBox API Reference

The `Power Platform Tool Box` module provides access to ToolBox functionality.

👉 [Power Platform Tool Box API references](../packages//README.md)

## Security Model

### Isolated Execution

-   Each tool runs in a separate Node.js process
-   Tools cannot directly access the main application or other tools
-   All communication goes through the structured IPC protocol

### API Restrictions

-   Tools only have access to the `Power Platform Tool Box` API
-   No direct access to Electron APIs or Node.js fs module
-   File operations go through secure dialogs

### Message Validation

-   All IPC messages are validated for structure and content
-   Prevents malicious or buggy tools from compromising the app
-   Request/response pattern with timeouts

## Error Handling

Always handle errors gracefully:

```javascript
try {
    const tools = await toolbox.getAllTools();
    logEvent(`Retrieved ${tools.length} tools`);
} catch (error) {
    logEvent("Error getting tools", error);
}
```

## Publishing Your Tool

### 1. Test Locally

Ensure the build is successful

> More will be added here later

### n. Publish to npm

```bash
cd my-tool
npm login
npm publish --access public
```

### n+1. Install in ToolBox

Users can then install your tool from the ToolBox UI.

## Sample Tools Repository

Check out the **[sample-tools repository](https://github.com/PowerPlatformToolBox/sample-tools)** for complete, ready-to-use examples demonstrating different frameworks:

-   **[HTML/TypeScript Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/html-sample)** - Basic HTML with TypeScript
-   **[React Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/react-sample)** - React 18 with Vite and TypeScript
-   **[Vue Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/vue-sample)** - Vue 3 with Composition API
-   **[Svelte Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/svelte-sample)** - Svelte 5 with TypeScript

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

## Support and Resources

-   **Documentation**: https://github.com/PowerPlatform-ToolBox/desktop-app
-   **Sample Tool**: https://github.com/PowerPlatformToolBox/sample-tools
-   **Issues**: https://github.com/PowerPlatform-ToolBox/desktop-app/issues
-   **Discussions**: https://github.com/PowerPlatform-ToolBox/desktop-app/discussions
