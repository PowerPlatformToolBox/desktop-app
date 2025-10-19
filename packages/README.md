# @pptb/types

TypeScript type definitions for Power Platform Tool Box API.

## Installation

```bash
npm install --save-dev @pptb/types
```

## Usage

### In your TypeScript tool

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

### Type-safe event handling

```typescript
toolbox.onToolboxEvent((event, payload) => {
    switch (payload.event) {
        case "connection:updated":
            console.log("Connection updated:", payload.data);
            break;
        case "tool:loaded":
            console.log("Tool loaded:", payload.data);
            break;
    }
});
```

## API Reference

Below are the APIs exposed to tools via `window.toolboxAPI`. All methods return Promises and are safe to `await` in modern browsers/Electron webviews.

### Settings

-   getUserSettings(): Promise<any>

    -   Returns the entire user settings object stored by the ToolBox.

-   updateUserSettings(settings: any): Promise<void>

    -   Merges and persists the provided settings object into the user settings store.

-   getSetting(key: string): Promise<any>

    -   Retrieves a single setting value by key from user settings.

-   setSetting(key: string, value: any): Promise<void>
    -   Sets or updates a single setting key/value in user settings.

### Connections

-   addConnection(connection: any): Promise<void>

    -   Adds a new Dataverse connection definition to the ToolBox.

-   updateConnection(id: string, updates: any): Promise<void>

    -   Applies partial updates to an existing connection by its id.

-   deleteConnection(id: string): Promise<void>

    -   Removes an existing connection by its id.

-   getConnections(): Promise<ToolBox.DataverseConnection[]>

    -   Returns all saved Dataverse connections.

-   setActiveConnection(id: string): Promise<void>

    -   Marks the specified connection as the active connection for the current session.

-   getActiveConnection(): Promise<ToolBox.DataverseConnection | null>

    -   Returns the currently active connection or null if none is active.

-   disconnectConnection(): Promise<void>
    -   Clears the active connection for the current session.

### Tools

-   getAllTools(): Promise<ToolBox.Tool[]>

    -   Returns all tools known to the ToolBox (installed/managed).

-   getTool(toolId: string): Promise<ToolBox.Tool>

    -   Returns metadata about a specific tool by its id.

-   loadTool(packageName: string): Promise<ToolBox.Tool>

    -   Loads a tool (initializes/activates) by npm package name.

-   unloadTool(toolId: string): Promise<void>

    -   Unloads a tool instance by its id.

-   installTool(packageName: string): Promise<ToolBox.Tool>

    -   Installs a tool from npm (and registers it with the ToolBox).

-   uninstallTool(packageName: string, toolId: string): Promise<void>

    -   Uninstalls a previously installed tool and removes it from the ToolBox.

-   getToolWebviewHtml(packageName: string, connectionUrl?: string, accessToken?: string): Promise<string | null>

    -   Returns an HTML string suitable for a tool's webview. Optional connection credentials can be passed for bootstrapping.

-   getToolContext(): Promise<ToolBox.ToolContext>
    -   Returns the current tool context including `toolId`, `connectionUrl`, and `accessToken` when available.

### Tool Settings

-   getToolSettings(toolId: string): Promise<any>

    -   Returns tool-scoped settings for the specified tool id.

-   updateToolSettings(toolId: string, settings: any): Promise<void>
    -   Merges and persists tool-scoped settings for the specified tool id.

### Notifications

-   showNotification(options: ToolBox.NotificationOptions): Promise<void>
    -   Displays a ToolBox notification. `options.type` supports `info | success | warning | error` and `duration` in ms (0 = persistent).

### Clipboard

-   copyToClipboard(text: string): Promise<void>
    -   Copies the provided text into the system clipboard.

### File operations

-   saveFile(defaultPath: string, content: any): Promise<string | null>
    -   Opens a save dialog and writes the content. Returns the saved file path or null if canceled.

### Terminal operations

-   createTerminal(toolId: string, options: ToolBox.TerminalOptions): Promise<ToolBox.Terminal>

    -   Creates a new terminal attached to the tool with the given options (name, shell, cwd, env).

-   executeTerminalCommand(terminalId: string, command: string): Promise<ToolBox.TerminalCommandResult>

    -   Executes a command in the specified terminal and returns its result.

-   closeTerminal(terminalId: string): Promise<void>

    -   Closes the specified terminal.

-   getTerminal(terminalId: string): Promise<ToolBox.Terminal | undefined>

    -   Gets a single terminal by id, if it exists.

-   getToolTerminals(toolId: string): Promise<ToolBox.Terminal[]>

    -   Lists all terminals created by a specific tool.

-   getAllTerminals(): Promise<ToolBox.Terminal[]>

    -   Lists all existing terminals managed by the ToolBox.

-   setTerminalVisibility(terminalId: string, visible: boolean): Promise<void>
    -   Shows or hides the terminal UI for the specified terminal id.

### Events

-   getEventHistory(limit?: number): Promise<ToolBox.ToolBoxEventPayload[]>

    -   Returns recent ToolBox events, newest first. Use `limit` to cap the number of entries.

-   onToolboxEvent(callback: (event: any, payload: ToolBox.ToolBoxEventPayload) => void): void

    -   Subscribes to ToolBox events.
    -   Events available:
        -   `tool:loaded` - A tool has been loaded
        -   `tool:unloaded` - A tool has been unloaded
        -   `connection:created` - A new connection was created
        -   `connection:updated` - An existing connection was updated
        -   `connection:deleted` - A connection was deleted
        -   `settings:updated` - User settings were updated
        -   `notification:shown` - A notification was displayed
        -   `terminal:created` - A new terminal was created
        -   `terminal:closed` - A terminal was closed
        -   `terminal:output` - Terminal produced output
        -   `terminal:command:completed` - A terminal command finished executing
        -   `terminal:error` - A terminal error occurred

-   removeToolboxEventListener(callback: (event: any, payload: ToolBox.ToolBoxEventPayload) => void): void
    -   Removes a previously registered event listener.

### Auto-update

-   checkForUpdates(): Promise<void>

    -   Triggers an update check.

-   downloadUpdate(): Promise<void>

    -   Starts downloading an available update.

-   quitAndInstall(): Promise<void>

    -   Quits the app and installs a downloaded update.

-   getAppVersion(): Promise<string>

    -   Returns the current application version.

-   onUpdateChecking(callback: () => void): void

    -   Called when an update check has started.

-   onUpdateAvailable(callback: (info: any) => void): void

    -   Called when an update is available; `info` provides update metadata.

-   onUpdateNotAvailable(callback: () => void): void

    -   Called when no updates are available.

-   onUpdateDownloadProgress(callback: (progress: any) => void): void

    -   Called periodically with download progress information.

-   onUpdateDownloaded(callback: (info: any) => void): void

    -   Called once an update has been downloaded and is ready to install.

-   onUpdateError(callback: (error: string) => void): void
    -   Called when an update-related error occurs.

## Publishing the package to npm

This is an organization scoped package so use the following command to deploy to npm

```bash
npm publish --access public
```

## License

GPL-3.0
