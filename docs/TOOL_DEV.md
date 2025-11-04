# Tool Development Guide

This guide explains how to develop external tools for the Power Platform Tool Box using webview-based architecture with organized, secure APIs.

-   [Tool Development Guide](#tool-development-guide)
    -   [Overview](#overview)
    -   [API Architecture](#api-architecture)
        -   [1. ToolBox API (`window.toolboxAPI`)](#1-toolbox-api-windowtoolboxapi)
        -   [2. Dataverse API (`window.dataverseAPI`)](#2-dataverse-api-windowdataverseapi)
    -   [Prerequisites (_optional_)](#prerequisites-optional)
    -   [Quick Start](#quick-start)
        -   [1. Create Your Tool Package](#1-create-your-tool-package)
        -   [2. Define package.json](#2-define-packagejson)
        -   [3. Install Type Definitions](#3-install-type-definitions)
        -   [4. Create Your Tool HTML](#4-create-your-tool-html)
        -   [5. Implement Your Tool Logic](#5-implement-your-tool-logic)
    -   [Comprehensive API Examples](#comprehensive-api-examples)
        -   [ToolBox API](#toolbox-api)
            -   [Working with Connections](#working-with-connections)
            -   [Using Utilities](#using-utilities)
            -   [Tool Settings Storage](#tool-settings-storage)
            -   [Terminal Operations](#terminal-operations)
            -   [Event Handling](#event-handling)
        -   [Dataverse API](#dataverse-api)
            -   [Complete CRUD Example](#complete-crud-example)
            -   [FetchXML Query Examples](#fetchxml-query-examples)
            -   [OData Query Examples](#odata-query-examples)
            -   [Metadata Operations](#metadata-operations)
            -   [Solutions](#solutions)
            -   [Execute Actions and Functions](#execute-actions-and-functions)
            -   [Error Handling](#error-handling)
        -   [Building a Complete Tool](#building-a-complete-tool)
    -   [API Reference](#api-reference)
    -   [Security Model](#security-model)
        -   [Webview Isolation](#webview-isolation)
        -   [API Restrictions](#api-restrictions)
        -   [Context-Aware Features](#context-aware-features)
        -   [Message Validation](#message-validation)
    -   [Best Practices](#best-practices)
        -   [1. Always Check for Active Connection](#1-always-check-for-active-connection)
        -   [2. Handle Errors Gracefully](#2-handle-errors-gracefully)
        -   [3. Use Type Definitions](#3-use-type-definitions)
        -   [4. Subscribe to Relevant Events](#4-subscribe-to-relevant-events)
        -   [5. Clean Up Resources](#5-clean-up-resources)
        -   [6. Use Specific Column Selection](#6-use-specific-column-selection)
        -   [7. Limit Query Results](#7-limit-query-results)
    -   [Error Handling](#error-handling-1)
    -   [Publishing Your Tool](#publishing-your-tool)
        -   [1. Build your tool](#1-build-your-tool)
        -   [2. Prepare for Publishing](#2-prepare-for-publishing)
        -   [3. Publish to npm](#3-publish-to-npm)
        -   [4. Test in ToolBox](#4-test-in-toolbox)
    -   [Submitting the tool to the Tool Box registry](#submitting-the-tool-to-the-tool-box-registry)
        -   [Process Flow](#process-flow)
    -   [Sample Tools Repository](#sample-tools-repository)
    -   [Debugging](#debugging)
        -   [Console Output](#console-output)
        -   [Error Messages](#error-messages)
    -   [Support and Resources](#support-and-resources)
    -   [Feature Summary](#feature-summary)
        -   [Supported Frameworks](#supported-frameworks)
        -   [What Tools Can Do](#what-tools-can-do)
        -   [What Tools Cannot Do](#what-tools-cannot-do)
        -   [Architecture](#architecture)

## Overview

The Power Platform Tool Box provides a secure, isolated environment for running tools:

-   **Webview-Based**: Each tool runs in a sandboxed iframe with limited API access
-   **Organized APIs**: Namespaced APIs for connections, utilities, terminals, events, and Dataverse
-   **Secure Communication**: Structured message protocol via postMessage
-   **Context-Aware**: Tool ID and connection context automatically managed
-   **Type-Safe**: Full TypeScript support with `@pptb/types` package

## API Architecture

Tools have access to two main APIs:

### 1. ToolBox API (`window.toolboxAPI`)

Organized into namespaces:

-   **connections** - Get active Dataverse connection (read-only)
-   **utils** - Notifications, clipboard, file operations, theme
-   **settings** - Tool-specific settings storage (context-aware)
-   **terminal** - Create and manage terminals (context-aware)
-   **events** - Subscribe to platform events (tool-specific)

### 2. Dataverse API (`window.dataverseAPI`)

Complete HTTP client for Dataverse:

-   CRUD operations (create, retrieve, update, delete)
-   FetchXML queries
-   Metadata operations
-   Execute actions and functions

## Prerequisites (_optional_)

Install Yeoman and the PPTB generator globally:

```bash
npm install -g yo generator-pptb
```

## Quick Start

### 1. Create Your Tool Package

```bash
yo pptb
```

Or create in a specific directory:

```bash
yo pptb my-tool
```

And follow the prompt. This will generate a folder structure based on your selection.

Example:

```
my-tool/
├── package.json
├── index.html
├── styles.css
├── app..ts
└── README.md
```

If you do not want to download Yeoman and PPTB Generator globally you can run the below command:

```bash
npx --package yo --package generator-pptb -- yo pptb
```

### 2. Define package.json

```json
{
    "name": "@powerplatform/my-tool",
    "version": "1.0.0",
    "displayName": "My Tool",
    "description": "Description of what your tool does",
    "author": "Your Name",
    "keywords": ["powerplatform", "dataverse", "toolbox"]
}
```

### 3. Install Type Definitions

```bash
npm install --save-dev @pptb/types
```

### 4. Create Your Tool HTML

**index.html:**

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My Tool</title>
        <link rel="stylesheet" href="styles.css" />
    </head>
    <body>
        <div id="app">
            <h1>My Power Platform Tool</h1>
            <div id="connection-info"></div>
            <button id="test-btn">Test API</button>
            <div id="output"></div>
        </div>
        <script src="app.js"></script>
    </body>
</html>
```

### 5. Implement Your Tool Logic

**app.ts:**

```typescript
/// <reference types="@pptb/types" />

// Tool APIs are available as globals
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;

async function initialize() {
    try {
        // Get active connection
        const connection = await toolbox.connections.getActiveConnection();

        if (connection) {
            document.getElementById("connection-info")!.textContent = `Connected to: ${connection.name} (${connection.environment})`;
        } else {
            document.getElementById("connection-info")!.textContent = "No active connection";
        }

        // Subscribe to events
        toolbox.events.on((event, payload) => {
            console.log("Event received:", payload.event, payload.data);

            if (payload.event === "connection:updated") {
                // Refresh connection info
                initialize();
            }
        });

        // Show notification
        await toolbox.utils.showNotification({
            title: "Tool Loaded",
            body: "My tool is ready!",
            type: "success",
            duration: 3000,
        });
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// Test button handler
document.getElementById("test-btn")?.addEventListener("click", async () => {
    try {
        // Example: Query accounts
        const fetchXml = `
        <fetch top="10">
          <entity name="account">
            <attribute name="name" />
            <attribute name="accountid" />
            <order attribute="name" />
          </entity>
        </fetch>
        `;

        const result = await dataverse.fetchXmlQuery(fetchXml);

        const output = document.getElementById("output")!;
        output.textContent = `Found ${result.value.length} accounts:\n` + result.value.map((a) => `- ${a.name}`).join("\n");
    } catch (error) {
        console.error("Query error:", error);
        await toolbox.utils.showNotification({
            title: "Error",
            body: (error as Error).message,
            type: "error",
        });
    }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}
```

## Comprehensive API Examples

### ToolBox API

#### Working with Connections

```typescript
// Get the active connection
const connection = await toolboxAPI.connections.getActiveConnection();

if (connection) {
    console.log("Connection Details:");
    console.log("  Name:", connection.name);
    console.log("  URL:", connection.url);
    console.log("  Environment:", connection.environment);
    console.log("  ID:", connection.id);
} else {
    console.log("No active connection - please connect first");

    // Show a notification to the user
    await toolboxAPI.utils.showNotification({
        title: "No Connection",
        body: "Please connect to a Dataverse environment first",
        type: "warning",
    });
}
```

#### Using Utilities

```typescript
// Show different types of notifications
await toolboxAPI.utils.showNotification({
    title: "Info",
    body: "This is an informational message",
    type: "info",
    duration: 3000, // Auto-dismiss after 3 seconds
});

await toolboxAPI.utils.showNotification({
    title: "Success",
    body: "Operation completed successfully",
    type: "success",
    duration: 3000,
});

await toolboxAPI.utils.showNotification({
    title: "Warning",
    body: "Please review this warning",
    type: "warning",
    duration: 5000,
});

await toolboxAPI.utils.showNotification({
    title: "Error",
    body: "An error occurred",
    type: "error",
    duration: 0, // Persistent - user must dismiss
});

// Copy to clipboard
const data = JSON.stringify({ foo: "bar" }, null, 2);
await toolboxAPI.utils.copyToClipboard(data);
await toolboxAPI.utils.showNotification({
    title: "Copied",
    body: "Data copied to clipboard",
    type: "success",
});

// Save a file
const jsonData = { accounts: [], contacts: [] };
const filePath = await toolboxAPI.utils.saveFile("export.json", JSON.stringify(jsonData, null, 2));

if (filePath) {
    console.log("File saved to:", filePath);
} else {
    console.log("Save cancelled");
}

// Get current theme and adjust UI
const theme = await toolboxAPI.utils.getCurrentTheme();
document.body.classList.add(`theme-${theme}`);
```

#### Tool Settings Storage

```typescript
// Save individual settings
await toolboxAPI.settings.setSetting("theme", "dark");
await toolboxAPI.settings.setSetting("autoRefresh", true);
await toolboxAPI.settings.setSetting("refreshInterval", 5000);
await toolboxAPI.settings.setSetting("userPreferences", {
    showWelcome: false,
    defaultView: "grid",
});

// Get individual settings
const theme = await toolboxAPI.settings.getSetting("theme");
const autoRefresh = await toolboxAPI.settings.getSetting("autoRefresh");
console.log("Theme:", theme); // 'dark'
console.log("Auto-refresh:", autoRefresh); // true

// Get all settings
const allSettings = await toolboxAPI.settings.getSettings();
console.log("All settings:", allSettings);
// Returns: { theme: 'dark', autoRefresh: true, refreshInterval: 5000, ... }

// Update multiple settings at once
await toolboxAPI.settings.setSettings({
    theme: "light",
    autoRefresh: false,
    refreshInterval: 10000,
    lastSync: new Date().toISOString(),
});

// Check if a setting exists
const value = await toolboxAPI.settings.getSetting("nonExistentKey");
if (value === undefined) {
    console.log("Setting does not exist - use defaults");
}

// Example: Load settings on startup
async function loadUserSettings() {
    const settings = await toolboxAPI.settings.getSettings();

    // Apply settings with defaults
    const theme = settings.theme || "light";
    const autoRefresh = settings.autoRefresh ?? true;
    const refreshInterval = settings.refreshInterval || 5000;

    applyTheme(theme);
    if (autoRefresh) {
        startAutoRefresh(refreshInterval);
    }
}
```

#### Terminal Operations

```typescript
// Create a terminal
const terminal = await toolboxAPI.terminal.create({
    name: "Build Terminal",
    cwd: "/path/to/project",
    env: {
        NODE_ENV: "production",
    },
});

console.log("Terminal created:", terminal.id);

// Execute commands
const npmInstall = await toolboxAPI.terminal.execute(terminal.id, "npm install");

if (npmInstall.exitCode === 0) {
    console.log("npm install completed successfully");

    // Run build
    const build = await toolboxAPI.terminal.execute(terminal.id, "npm run build");

    console.log("Build output:", build.output);
} else {
    console.error("npm install failed:", npmInstall.error);
}

// List all terminals for this tool
const terminals = await toolboxAPI.terminal.list();
console.log(`This tool has ${terminals.length} terminals`);

// Show/hide terminal UI
await toolboxAPI.terminal.setVisibility(terminal.id, true);

// Close terminal when done
await toolboxAPI.terminal.close(terminal.id);
```

#### Event Handling

```typescript
// Subscribe to all events
const eventCallback = (event: any, payload: ToolBoxAPI.ToolBoxEventPayload) => {
    console.log(`[${payload.timestamp}] ${payload.event}:`, payload.data);

    switch (payload.event) {
        case "connection:updated":
            console.log("Connection changed:", payload.data);
            // Refresh UI with new connection
            refreshConnectionUI();
            break;

        case "connection:deleted":
            console.log("Connection deleted:", payload.data);
            // Clear connection-dependent UI
            clearConnectionUI();
            break;

        case "terminal:output":
            // Show terminal output in UI
            const { terminalId, output } = payload.data as any;
            appendTerminalOutput(terminalId, output);
            break;

        case "terminal:command:completed":
            console.log("Command completed:", payload.data);
            break;

        case "terminal:error":
            console.error("Terminal error:", payload.data);
            break;
    }
};

// Subscribe to events
toolboxAPI.events.on(eventCallback);

// Get event history
const recentEvents = await toolboxAPI.events.getHistory(20);
console.log("Last 20 events:", recentEvents);

// Unsubscribe when no longer needed
// toolboxAPI.events.off(eventCallback);
```

### Dataverse API

#### Complete CRUD Example

```typescript
async function crudExample() {
    try {
        // CREATE
        console.log("Creating account...");
        const created = await dataverseAPI.create("account", {
            name: "Contoso Ltd",
            emailaddress1: "info@contoso.com",
            telephone1: "555-0100",
            websiteurl: "https://contoso.com",
            description: "Sample account created by tool",
        });

        console.log("Created account ID:", created.id);
        const accountId = created.id;

        // RETRIEVE
        console.log("Retrieving account...");
        const account = await dataverseAPI.retrieve("account", accountId, ["name", "emailaddress1", "telephone1", "websiteurl", "description"]);

        console.log("Retrieved account:", account);

        // UPDATE
        console.log("Updating account...");
        await dataverseAPI.update("account", accountId, {
            name: "Contoso Corporation",
            description: "Updated description",
            telephone1: "555-0200",
        });

        console.log("Account updated");

        // Verify update
        const updated = await dataverseAPI.retrieve("account", accountId, ["name", "telephone1"]);
        console.log("Updated values:", updated);

        // DELETE
        console.log("Deleting account...");
        await dataverseAPI.delete("account", accountId);
        console.log("Account deleted");

        return true;
    } catch (error) {
        console.error("CRUD operation failed:", error);
        return false;
    }
}
```

#### FetchXML Query Examples

```typescript
// Simple query with filter and ordering
async function queryActiveAccounts() {
    const fetchXml = `
    <fetch top="50">
      <entity name="account">
        <attribute name="name" />
        <attribute name="accountid" />
        <attribute name="emailaddress1" />
        <attribute name="telephone1" />
        <filter>
          <condition attribute="statecode" operator="eq" value="0" />
        </filter>
        <order attribute="name" descending="false" />
      </entity>
    </fetch>
    `;

    const result = await dataverseAPI.fetchXmlQuery(fetchXml);
    console.log(`Found ${result.value.length} active accounts`);

    return result.value;
}

// Complex query with linked entities
async function queryContactsWithAccounts() {
    const fetchXml = `
    <fetch top="100">
      <entity name="contact">
        <attribute name="fullname" />
        <attribute name="emailaddress1" />
        <attribute name="contactid" />
        <link-entity name="account" from="accountid" to="parentcustomerid" alias="account">
          <attribute name="name" />
          <attribute name="accountid" />
        </link-entity>
        <filter>
          <condition attribute="statecode" operator="eq" value="0" />
        </filter>
        <order attribute="fullname" />
      </entity>
    </fetch>
    `;

    const result = await dataverseAPI.fetchXmlQuery(fetchXml);

    result.value.forEach((contact) => {
        console.log(`${contact.fullname} - ${contact["account.name"]}`);
    });

    return result.value;
}

// Query with aggregation
async function getAccountCountByIndustry() {
    const fetchXml = `
    <fetch aggregate="true">
      <entity name="account">
        <attribute name="industrycode" alias="industry" groupby="true" />
        <attribute name="accountid" alias="count" aggregate="count" />
      </entity>
    </fetch>
    `;

    const result = await dataverseAPI.fetchXmlQuery(fetchXml);

    result.value.forEach((row) => {
        console.log(`Industry ${row.industry}: ${row.count} accounts`);
    });

    return result.value;
}
```

#### OData Query Examples

```typescript
const result = await dataverseAPI.queryData(
                    '$select=name,emailaddress1,telephone1&$filter=statecode eq 0&$orderby=name&$top=10'
                );
console.log(`Found ${result.value.length} records`);
result.value.forEach(record => {
   console.log(`${record.name} - ${record.emailaddress1}`);
);
```

#### Metadata Operations

```typescript
// Get entity metadata
async function exploreEntity(entityLogicalName: string) {
    const metadata = await dataverseAPI.getEntityMetadata(entityLogicalName, true);

    console.log("Entity Information:");
    console.log("  Logical Name:", metadata.LogicalName);
    console.log("  Display Name:", metadata.DisplayName?.LocalizedLabels?.[0]?.Label);
    console.log("  Metadata ID:", metadata.MetadataId);

    // You can inspect specific attributes
    const attributes = await dataverseAPI.getEntityRelatedMetadata(entityLogicalName, "Attributes");
    console.log("Attributes:", attributes.value);

    return { entityMetadata: metadata, Attributes: attributes };
}
```

#### Solutions

```typescript
const solutions = await dataverseAPI.getSolutions(["solutionid", "uniquename", "friendlyname", "version", "ismanaged"]);
console.log(`Total solutions: ${solutions.value.length}`);
solutions.value.forEach((solution) => {
    console.log(`${solution.friendlyname} (${solution.uniquename}) - v${solution.version}`);
});
```

#### Execute Actions and Functions

```typescript
// Get current user information
async function whoAmI() {
    const result = await dataverseAPI.execute({
        operationName: "WhoAmI",
        operationType: "function",
    });

    console.log("Current User:");
    console.log("  User ID:", result.UserId);
    console.log("  Business Unit ID:", result.BusinessUnitId);
    console.log("  Organization ID:", result.OrganizationId);

    return result;
}

// Execute a custom action
async function executeCustomAction(entityId: string) {
    const result = await dataverseAPI.execute({
        entityName: "account",
        entityId: entityId,
        operationName: "new_CustomAction",
        operationType: "action",
        parameters: {
            InputParameter: "value",
            NumericParameter: 42,
        },
    });

    console.log("Action result:", result);
    return result;
}

// Execute a global action
async function executeGlobalAction() {
    const result = await dataverseAPI.execute({
        operationName: "new_GlobalAction",
        operationType: "action",
        parameters: {
            Parameter1: "value1",
            Parameter2: "value2",
        },
    });

    return result;
}
```

#### Error Handling

```typescript
async function robustDataverseOperation() {
    try {
        // Check for active connection first
        const connection = await toolboxAPI.connections.getActiveConnection();

        if (!connection) {
            await toolboxAPI.utils.showNotification({
                title: "No Connection",
                body: "Please connect to a Dataverse environment",
                type: "warning",
            });
            return;
        }

        // Perform operation
        const result = await dataverseAPI.create("account", {
            name: "Test Account",
        });

        await toolboxAPI.utils.showNotification({
            title: "Success",
            body: `Account created: ${result.id}`,
            type: "success",
        });
    } catch (error) {
        console.error("Operation failed:", error);

        let errorMessage = "An unknown error occurred";

        if (error instanceof Error) {
            errorMessage = error.message;

            // Check for specific error types
            if (errorMessage.includes("No active connection")) {
                errorMessage = "Please connect to a Dataverse environment first";
            } else if (errorMessage.includes("401")) {
                errorMessage = "Authentication failed - please reconnect";
            } else if (errorMessage.includes("403")) {
                errorMessage = "Permission denied - check your security roles";
            } else if (errorMessage.includes("404")) {
                errorMessage = "Record not found";
            }
        }

        await toolboxAPI.utils.showNotification({
            title: "Error",
            body: errorMessage,
            type: "error",
            duration: 0, // Persistent
        });
    }
}
```

### Building a Complete Tool

Here's a complete example of a tool that demonstrates all major features:

```typescript
/// <reference types="@pptb/types" />

class MyTool {
    private connection: ToolBoxAPI.DataverseConnection | null = null;
    private terminals: Map<string, ToolBoxAPI.Terminal> = new Map();

    async initialize() {
        console.log("Initializing tool...");

        // Subscribe to events
        toolboxAPI.events.on(this.handleEvent.bind(this));

        // Get initial connection
        await this.refreshConnection();

        // Apply theme
        await this.applyTheme();

        // Show ready notification
        await toolboxAPI.utils.showNotification({
            title: "Tool Ready",
            body: "My Tool has been loaded successfully",
            type: "success",
            duration: 3000,
        });

        console.log("Tool initialized");
    }

    private async refreshConnection() {
        this.connection = await toolboxAPI.connections.getActiveConnection();

        if (this.connection) {
            console.log("Connected to:", this.connection.name);
            this.updateConnectionUI();
        } else {
            console.log("No active connection");
            this.clearConnectionUI();
        }
    }

    private async applyTheme() {
        const theme = await toolboxAPI.utils.getCurrentTheme();
        document.body.classList.remove("theme-light", "theme-dark");
        document.body.classList.add(`theme-${theme}`);
    }

    private handleEvent(event: any, payload: ToolBoxAPI.ToolBoxEventPayload) {
        console.log("Event:", payload.event, payload.data);

        switch (payload.event) {
            case "connection:updated":
            case "connection:created":
                this.refreshConnection();
                break;

            case "connection:deleted":
                this.connection = null;
                this.clearConnectionUI();
                break;

            case "terminal:output":
                this.handleTerminalOutput(payload.data);
                break;
        }
    }

    private updateConnectionUI() {
        const element = document.getElementById("connection-status");
        if (element && this.connection) {
            element.innerHTML = `
                <div class="connection-active">
                    <strong>${this.connection.name}</strong>
                    <span class="env-badge ${this.connection.environment.toLowerCase()}">
                        ${this.connection.environment}
                    </span>
                </div>
            `;
        }
    }

    private clearConnectionUI() {
        const element = document.getElementById("connection-status");
        if (element) {
            element.innerHTML = '<div class="no-connection">Not connected</div>';
        }
    }

    private handleTerminalOutput(data: any) {
        const { terminalId, output } = data;
        // Update terminal UI with output
        console.log(`Terminal ${terminalId}:`, output);
    }

    async queryData() {
        if (!this.connection) {
            await toolboxAPI.utils.showNotification({
                title: "No Connection",
                body: "Please connect to an environment first",
                type: "warning",
            });
            return;
        }

        try {
            const fetchXml = `
            <fetch top="10">
              <entity name="account">
                <attribute name="name" />
                <attribute name="accountid" />
              </entity>
            </fetch>
            `;

            const result = await dataverseAPI.fetchXmlQuery(fetchXml);

            // Display results
            this.displayResults(result.value);
        } catch (error) {
            console.error("Query failed:", error);
            await toolboxAPI.utils.showNotification({
                title: "Query Failed",
                body: (error as Error).message,
                type: "error",
            });
        }
    }

    private displayResults(records: any[]) {
        const element = document.getElementById("results");
        if (element) {
            element.innerHTML = records.map((r) => `<div class="result-item">${r.name}</div>`).join("");
        }
    }

    async exportData() {
        try {
            const data = await this.collectData();
            const json = JSON.stringify(data, null, 2);

            const filePath = await toolboxAPI.utils.saveFile("export.json", json);

            if (filePath) {
                await toolboxAPI.utils.showNotification({
                    title: "Export Successful",
                    body: `Data exported to ${filePath}`,
                    type: "success",
                });
            }
        } catch (error) {
            console.error("Export failed:", error);
        }
    }

    private async collectData() {
        // Collect data to export
        return {
            timestamp: new Date().toISOString(),
            connection: this.connection?.name,
            data: [],
        };
    }

    cleanup() {
        // Close all terminals
        this.terminals.forEach(async (terminal) => {
            await toolboxAPI.terminal.close(terminal.id);
        });

        this.terminals.clear();
    }
}

// Initialize the tool when DOM is ready
const tool = new MyTool();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => tool.initialize());
} else {
    tool.initialize();
}
```

## API Reference

For complete API documentation, see **[ToolBox API & Dataverse API Reference](../packages/README.md)**

## Security Model

### Webview Isolation

-   Each tool runs in a sandboxed iframe with limited API access
-   Tools cannot directly access the main application or other tools
-   All communication goes through the secure postMessage protocol

### API Restrictions

-   Tools only have access to namespaced `toolboxAPI` and `dataverseAPI`
-   No direct access to Electron APIs or Node.js modules
-   No access to user settings or sensitive connection data
-   Access tokens are managed securely by the platform

### Context-Aware Features

-   Tool ID is automatically determined by the platform
-   Terminal operations are scoped to the calling tool
-   Event subscriptions are filtered to relevant events only

### Message Validation

-   All API calls are validated for structure and content
-   Prevents malicious or buggy tools from compromising the app
-   Request/response pattern with timeouts
-   Error handling with detailed messages

## Best Practices

### 1. Always Check for Active Connection

```typescript
const connection = await toolboxAPI.connections.getActiveConnection();
if (!connection) {
    // Show message to user
    await toolboxAPI.utils.showNotification({
        title: "No Connection",
        body: "Please connect to an environment",
        type: "warning",
    });
    return;
}
```

### 2. Handle Errors Gracefully

```typescript
try {
    const result = await dataverseAPI.create("account", data);
} catch (error) {
    console.error("Operation failed:", error);
    await toolboxAPI.utils.showNotification({
        title: "Error",
        body: (error as Error).message,
        type: "error",
    });
}
```

### 3. Use Type Definitions

```typescript
/// <reference types="@pptb/types" />

// Get full IntelliSense and type checking
const connection: ToolBoxAPI.DataverseConnection | null = await toolboxAPI.connections.getActiveConnection();
```

### 4. Subscribe to Relevant Events

```typescript
toolboxAPI.events.on((event, payload) => {
    if (payload.event === "connection:updated") {
        // Refresh your connection-dependent UI
        refreshData();
    }
});
```

### 5. Clean Up Resources

```typescript
// Close terminals when done
const terminals = await toolboxAPI.terminal.list();
for (const terminal of terminals) {
    await toolboxAPI.terminal.close(terminal.id);
}

// Unsubscribe from events if needed
toolboxAPI.events.off(eventCallback);
```

### 6. Use Specific Column Selection

```typescript
// Good - only retrieve needed columns
const account = await dataverseAPI.retrieve("account", id, ["name", "emailaddress1"]);

// Avoid - retrieves all columns
const account = await dataverseAPI.retrieve("account", id);
```

### 7. Limit Query Results

```xml
<!-- Good - use top attribute -->
<fetch top="50">
  <entity name="account">
    <attribute name="name" />
  </entity>
</fetch>

<!-- Avoid - no limit -->
<fetch>
  <entity name="account">
    <all-attributes />
  </entity>
</fetch>
```

## Error Handling

Always handle errors gracefully:

```typescript
try {
    const result = await dataverseAPI.fetchXmlQuery(fetchXml);
    // Process result
} catch (error) {
    console.error("Query failed:", error);

    // Show user-friendly error
    let message = "An error occurred";

    if (error instanceof Error) {
        if (error.message.includes("No active connection")) {
            message = "Please connect to an environment";
        } else if (error.message.includes("401")) {
            message = "Authentication failed - please reconnect";
        } else if (error.message.includes("Invalid FetchXML")) {
            message = "Query syntax error";
        } else {
            message = error.message;
        }
    }

    await toolboxAPI.utils.showNotification({
        title: "Error",
        body: message,
        type: "error",
    });
}
```

## Testing Your Tool Locally

Before publishing your tool, you can test it locally in the Power Platform Tool Box without needing to publish to npm.

### Local Development Workflow

1. **Build your tool with watch mode:**

   ```bash
   cd my-tool
   npm run build -- --watch
   ```

   This will continuously rebuild your tool when you make changes.

2. **Load the tool in ToolBox:**

   - Open Power Platform Tool Box
   - Click on the **Debug** icon in the activity bar (left sidebar)
   - In the "Load Local Tool" section, click **Browse**
   - Select your tool's root directory (the one containing `package.json`)
   - Click **Load Tool**

3. **Make changes and reload:**

   - Edit your tool's source code
   - The watch mode will automatically rebuild to `dist/`
   - In ToolBox, close the tool tab and reload it from the sidebar to see your changes

### Requirements for Local Tools

Your tool directory must:

- Have a `package.json` file at the root
- Have a `dist/index.html` file (the entry point)
- Be built before loading (run `npm run build` first)

### Example Directory Structure

```
my-tool/
├── package.json          # Required
├── dist/                 # Required - output from build
│   ├── index.html       # Required - entry point
│   ├── app.js
│   └── styles.css
├── src/                  # Your source files
│   ├── app.ts
│   └── styles.css
├── tsconfig.json
└── README.md
```

### Tips for Local Development

- **Use watch mode**: Run your build tool with watch mode (`npm run build -- --watch`) so changes are automatically compiled
- **Hot reload**: After making changes, close and reopen the tool in ToolBox to see updates
- **Check console**: Open the ToolBox developer console (View > Toggle Developer Tools) to see console.log output from your tool
- **Test connections**: Test with different Dataverse connections to ensure your tool works properly
- **Tool ID**: Local tools have IDs prefixed with `local:` (e.g., `local:@powerplatform/my-tool`)

### Common Build Commands

Most tools use one of these patterns:

```bash
# TypeScript with Vite
npm run build -- --watch

# Plain npm scripts
npm run watch

# webpack
npm run dev
```

Check your tool's `package.json` `scripts` section for the correct command.

## Publishing Your Tool

Once you've tested your tool locally and are ready to share it:

### 1. Build your tool

```bash
npm run build
```

### 2. Prepare for Publishing

Ensure your `package.json` has all required fields:

```json
{
    "name": "@org-name/my-tool",
    "version": "1.0.0",
    "displayName": "My Tool",
    "description": "Clear description of what your tool does",
    "main": "index.html",
    "author": "Your Name",
    "keywords": ["powerplatform", "dataverse", "toolbox"],
    "repository": {
        "type": "git",
        "url": "https://github.com/yourusername/your-tool"
    },
    "license": "MIT"
}
```

### 3. Publish to npm

```bash
cd my-tool
npm login
npm publish --access public
```

### 4. Test Published Version

You can test the published version by installing it from npm via the ToolBox **Debug** menu "Install Tool by Package Name" section.

## Submitting the tool to the Tool Box registry

The Power Platform Tool Box uses a registry-based system where tools are distributed as pre-built `.tar.gz` archives. Tool developers publish their tools to npm, and an automated system converts them to the registry format.

### Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Developer                                    │
│  - Develops tool                                                      │
│  - Publishes to npm                                                   │
│  - Submits intake form                                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Tool Intake Form                                     │
│  - Tool npm package name                                              │
│  - Tool description                                                   │
│  - Author information                                                 │
│  - Tags/categories                                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│               Review & Approval Process                               │
│  - Maintainers review submission                                      │
│  - Check for malicious code                                           │
│  - Verify tool follows guidelines                                     │
│  - Approve or request changes                                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│            Automated Conversion Server                                │
│  - Downloads npm package                                              │
│  - Runs npm install & build                                           │
│  - Creates .tar.gz archive                                            │
│  - Generates checksum                                                 │
│  - Uploads to CDN                                                     │
│  - Updates registry.json                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                Tool Registry (GitHub/CDN)                             │
│  - registry.json updated                                              │
│  - Tool available in ToolBox                                          │
│  - Users can install                                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [TOOL_INTAKE_PROCESS.md](TOOL_INTAKE_PROCESS.md) for more information.

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

## Support and Resources

-   **Documentation**: https://github.com/PowerPlatform-ToolBox/desktop-app
-   **Sample Tools**: https://github.com/PowerPlatformToolBox/sample-tools
-   **Issues**: https://github.com/PowerPlatform-ToolBox/desktop-app/issues
-   **Discussions**: https://github.com/PowerPlatform-ToolBox/desktop-app/discussions

## Feature Summary

Power Platform Tool Box provides a comprehensive platform for building tools with the following capabilities:

### Supported Frameworks

Tools can be built with any web framework:

-   Plain HTML/CSS/JavaScript
-   TypeScript
-   React
-   Vue
-   Svelte
-   Angular
-   Any other web framework

### What Tools Can Do

✅ Query and manipulate Dataverse data
✅ Create rich interactive UIs
✅ Run terminal commands
✅ Save and export data
✅ Show notifications to users
✅ React to connection changes
✅ Access entity metadata
✅ Execute custom actions

### What Tools Cannot Do

❌ Access raw access tokens (security)
❌ Manage user settings (platform responsibility)
❌ Install/uninstall other tools
❌ Access Electron APIs directly
❌ Access Node.js filesystem directly
❌ Modify platform configuration

### Architecture

```
┌─────────────────────────────────────────┐
│         Power Platform Tool Box          │
│  ┌────────────────────────────────────┐ │
│  │   Tool (iframe - sandboxed)        │ │
│  │                                    │ │
│  │   window.toolboxAPI                │ │
│  │   window.dataverseAPI              │ │
│  │                                    │ │
│  │   Your HTML/CSS/JS                 │ │
│  └────────────────────────────────────┘ │
│              ↕ postMessage               │
│  ┌────────────────────────────────────┐ │
│  │   toolboxAPIBridge.js              │ │
│  └────────────────────────────────────┘ │
│              ↕ IPC                      │
│  ┌────────────────────────────────────┐ │
│  │   Main Process                     │ │
│  │   - DataverseManager               │ │
│  │   - TerminalManager                │ │
│  │   - ConnectionsManager             │ │
│  │   - AuthManager                    │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

This architecture ensures:

-   **Security**: Tools cannot access sensitive data
-   **Isolation**: Tools cannot interfere with each other
-   **Stability**: Tool errors don't crash the platform
-   **Simplicity**: Clean APIs with clear boundaries
