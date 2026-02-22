# @pptb/types

TypeScript type definitions for Power Platform ToolBox APIs.

- [@pptb/types](#pptbtypes)
    - [Installation](#installation)
    - [Overview](#overview)
    - [Usage](#usage)
        - [Include all type definitions](#include-all-type-definitions)
        - [Include specific API types](#include-specific-api-types)
    - [ToolBox API Examples](#toolbox-api-examples)
        - [Connections](#connections)
        - [Utilities](#utilities)
        - [Terminal Operations](#terminal-operations)
        - [Events](#events)
    - [Dataverse API Examples](#dataverse-api-examples)
        - [CRUD Operations](#crud-operations)
        - [FetchXML Queries](#fetchxml-queries)
        - [Metadata Operations](#metadata-operations)
        - [Execute Actions/Functions](#execute-actionsfunctions)
        - [Deploy Solutions](#deploy-solutions)
    - [API Reference](#api-reference)
        - [ToolBox API (`window.toolboxAPI`)](#toolbox-api-windowtoolboxapi)
            - [Connections](#connections-1)
            - [Utils](#utils)
            - [Terminal](#terminal)
            - [Events](#events-1)
        - [Dataverse API (`window.dataverseAPI`)](#dataverse-api-windowdataverseapi)
            - [CRUD Operations](#crud-operations-1)
            - [Query Operations](#query-operations)
            - [Metadata Operations](#metadata-operations-1)
            - [Advanced Operations](#advanced-operations)
        - [Security Notes](#security-notes)
    - [Publishing the package to npm](#publishing-the-package-to-npm)
    - [License](#license)

## Installation

```bash
npm install --save-dev @pptb/types
```

## Overview

The `@pptb/types` package provides TypeScript definitions for two main APIs:

1. **ToolBox API** (`window.toolboxAPI`) - Core platform features (connections, utilities, terminals, events)
2. **Dataverse API** (`window.dataverseAPI`) - Microsoft Dataverse Web API operations

## Usage

### Include all type definitions

```typescript
/// <reference types="@pptb/types" />

// Both APIs are now available
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;
```

### Include specific API types

```typescript
// Only ToolBox API types
/// <reference types="@pptb/types/toolboxAPI" />

// Only Dataverse API types
/// <reference types="@pptb/types/dataverseAPI" />
```

## ToolBox API Examples

The ToolBox API provides organized namespaces for different functionality:

### Connections

```typescript
// Get the active Dataverse connection
const connection = await toolboxAPI.connections.getActiveConnection();
if (connection) {
    console.log("Connected to:", connection.url);
    console.log("Environment:", connection.environment);
}
```

### Utilities

```typescript
// Show a notification
await toolboxAPI.utils.showNotification({
    title: "Success",
    body: "Operation completed successfully",
    type: "success",
    duration: 3000,
});

// Copy to clipboard
await toolboxAPI.utils.copyToClipboard("Text to copy");

// Save a file
const filePath = await toolboxAPI.utils.saveFile("output.json", JSON.stringify(data, null, 2));
if (filePath) {
    console.log("File saved to:", filePath);
}

// Select a folder for exporting assets
const targetFolder = await toolboxAPI.utils.selectPath({
    type: "folder",
    title: "Choose export directory",
    defaultPath: "/Users/me/Downloads",
});
if (!targetFolder) {
    console.log("User canceled folder selection");
}

// Get current theme
const theme = await toolboxAPI.utils.getCurrentTheme();
console.log("Current theme:", theme); // "light" or "dark"

// Execute multiple operations in parallel
const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel(
    dataverseAPI.retrieve("account", accountId, ["name"]),
    dataverseAPI.retrieve("contact", contactId, ["fullname"]),
    dataverseAPI.fetchXmlQuery(opportunityFetchXml),
);
console.log("All data fetched:", account, contact, opportunities);

// Show loading screen during operations
await toolboxAPI.utils.showLoading("Processing data...");
try {
    // Perform operations
    await processData();
} finally {
    // Always hide loading
    await toolboxAPI.utils.hideLoading();
}
```

### Terminal Operations

```typescript
// Create a terminal (tool ID is automatically determined)
const terminal = await toolboxAPI.terminal.create({
    name: "My Terminal",
    cwd: "/path/to/directory",
});

// Execute a command
const result = await toolboxAPI.terminal.execute(terminal.id, "npm install");
console.log("Exit code:", result.exitCode);
console.log("Output:", result.output);

// List all terminals for this tool
const terminals = await toolboxAPI.terminal.list();

// Close a terminal
await toolboxAPI.terminal.close(terminal.id);
```

### Events

```typescript
// Subscribe to events
toolboxAPI.events.on((event, payload) => {
    console.log("Event:", payload.event, "Data:", payload.data);

    switch (payload.event) {
        case "connection:updated":
            console.log("Connection updated:", payload.data);
            break;
        case "terminal:output":
            console.log("Terminal output:", payload.data);
            break;
    }
});

// Get event history
const history = await toolboxAPI.events.getHistory(10); // Last 10 events
```

## Dataverse API Examples

The Dataverse API provides direct access to Microsoft Dataverse operations:

### CRUD Operations

```typescript
// Create a record
const result = await dataverseAPI.create("account", {
    name: "Contoso Ltd",
    emailaddress1: "info@contoso.com",
    telephone1: "555-0100",
});
console.log("Created account ID:", result.id);

// Retrieve a record
const account = await dataverseAPI.retrieve("account", result.id, ["name", "emailaddress1", "telephone1"]);
console.log("Account name:", account.name);

// Update a record
await dataverseAPI.update("account", result.id, {
    name: "Updated Account Name",
    description: "Updated description",
});

// Delete a record
await dataverseAPI.delete("account", result.id);
```

### FetchXML Queries

```typescript
const fetchXml = `
<fetch top="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="emailaddress1" />
    <filter>
      <condition attribute="statecode" operator="eq" value="0" />
    </filter>
    <order attribute="name" />
  </entity>
</fetch>
`;

const result = await dataverseAPI.fetchXmlQuery(fetchXml);
console.log(`Found ${result.value.length} records`);
result.value.forEach((record) => {
    console.log(record.name);
});
```

### Metadata Operations

```typescript
// Get entity metadata
const metadata = await dataverseAPI.getEntityMetadata("account");
console.log("Display Name:", metadata.DisplayName?.LocalizedLabels[0]?.Label);
console.log("Attributes:", metadata.Attributes?.length);

// Get all entities
const allEntities = await dataverseAPI.getAllEntitiesMetadata();
console.log(`Total entities: ${allEntities.value.length}`);
```

### Execute Actions/Functions

```typescript
// Execute WhoAmI function
const whoAmI = await dataverseAPI.execute({
    operationName: "WhoAmI",
    operationType: "function",
});
console.log("User ID:", whoAmI.UserId);

// Execute bound action
const result = await dataverseAPI.execute({
    entityName: "account",
    entityId: accountId,
    operationName: "CalculateRollupField",
    operationType: "action",
    parameters: {
        FieldName: "total_revenue",
    },
});

// Publish customizations for the active environment
await dataverseAPI.publishCustomizations();

// Publish only a specific table (in this case, the account table)
await dataverseAPI.publishCustomizations("account");
```

### Deploy Solutions

```typescript
// Read solution file (returns Buffer/Uint8Array depending on runtime)
const solutionFile = await toolboxAPI.fileSystem.readBinary("/path/to/MySolution.zip");

// Deploy solution with default options (binary input is accepted)
const result = await dataverseAPI.deploySolution(solutionFile);
console.log("Solution deployment started. Import Job ID:", result.ImportJobId);

// Deploy solution with custom options using the same binary payload
const customResult = await dataverseAPI.deploySolution(solutionFile, {
    publishWorkflows: true,
    overwriteUnmanagedCustomizations: false,
    skipProductUpdateDependencies: false,
    convertToManaged: false,
});
console.log("Import Job ID:", customResult.ImportJobId);

// Deploy with a specific import job ID using an explicitly encoded base64 string
const importJobId = crypto.randomUUID();
const base64Content = btoa(String.fromCharCode(...new Uint8Array(solutionFile)));
const trackedResult = await dataverseAPI.deploySolution(base64Content, {
    importJobId,
    publishWorkflows: true,
});
console.log("Tracking import with job ID:", trackedResult.ImportJobId);

// Track the import progress
const status = await dataverseAPI.getImportJobStatus(result.ImportJobId);
console.log("Import progress:", status.progress + "%");
console.log("Started:", status.startedon);

// Poll for completion
async function waitForImport(importJobId: string) {
    while (true) {
        const status = await dataverseAPI.getImportJobStatus(importJobId);
        console.log(`Progress: ${status.progress}%`);

        if (status.completedon) {
            console.log("Import completed at:", status.completedon);
            if (status.data) {
                console.log("Import details:", status.data);
            }
            break;
        }

        // Wait 2 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

await waitForImport(result.ImportJobId);
```

> **Note:** `deploySolution` automatically supplies `PublishWorkflows` and `OverwriteUnmanagedCustomizations` with a default value of `false` when you do not specify them, aligning with Dataverse's ImportSolution requirements.

## API Reference

The Power Platform ToolBox exposes two main APIs to tools:

### ToolBox API (`window.toolboxAPI`)

Core platform features organized into namespaces:

#### Connections

- **getActiveConnection()**: Promise<DataverseConnection | null>
    - Returns the currently active Dataverse connection or null if none is active

#### Utils

- **showNotification(options: NotificationOptions)**: Promise<void>
    - Displays a ToolBox notification. `options.type` supports `info | success | warning | error` and `duration` in ms (0 = persistent)

- **copyToClipboard(text: string)**: Promise<void>
    - Copies the provided text into the system clipboard

- **saveFile(defaultPath: string, content: any)**: Promise<string | null>
    - Opens a save dialog and writes the content. Returns the saved file path or null if canceled

- **selectPath(options?: SelectPathOptions)**: Promise<string | null>
    - Opens a native dialog to select either a file or folder (defaults to file)
    - Supports custom titles, button labels, default paths, and filters when selecting files
    - Returns the selected path or null if the user cancels

- **getCurrentTheme()**: Promise<"light" | "dark">
    - Returns the current UI theme setting

- **executeParallel(...operations)**: Promise<T[]>
    - Executes multiple async operations in parallel using Promise.all
    - Accepts promises or functions that return promises as variadic arguments
    - Returns an array of results in the same order as the operations
    - Example:
        ```typescript
        const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel(
            dataverseAPI.retrieve("account", id1),
            dataverseAPI.retrieve("contact", id2),
            dataverseAPI.fetchXmlQuery(fetchXml),
        );
        ```

- **showLoading(message?: string)**: Promise<void>
    - Displays a loading overlay with spinner in the tool's context
    - Optional message parameter (defaults to "Loading...")
    - Example: `await toolboxAPI.utils.showLoading('Fetching records...');`

- **hideLoading()**: Promise<void>
    - Hides the loading overlay
    - Should be called in a finally block to ensure it's always hidden

#### Terminal

- **create(options: TerminalOptions)**: Promise<Terminal>
    - Creates a new terminal attached to the tool (tool ID is auto-determined)

- **execute(terminalId: string, command: string)**: Promise<TerminalCommandResult>
    - Executes a command in the specified terminal and returns its result

- **close(terminalId: string)**: Promise<void>
    - Closes the specified terminal

- **get(terminalId: string)**: Promise<Terminal | undefined>
    - Gets a single terminal by id, if it exists

- **list()**: Promise<Terminal[]>
    - Lists all terminals created by this tool

- **setVisibility(terminalId: string, visible: boolean)**: Promise<void>
    - Shows or hides the terminal UI for the specified terminal id

#### Events

- **getHistory(limit?: number)**: Promise<ToolBoxEventPayload[]>
    - Returns recent ToolBox events for this tool, newest first. Use `limit` to cap the number of entries

- **on(callback: (event: any, payload: ToolBoxEventPayload) => void)**: void
    - Subscribes to ToolBox events
    - Events available:
        - `tool:loaded` - A tool has been loaded
        - `tool:unloaded` - A tool has been unloaded
        - `connection:created` - A new connection was created
        - `connection:updated` - An existing connection was updated
        - `connection:deleted` - A connection was deleted
        - `notification:shown` - A notification was displayed
        - `terminal:created` - A new terminal was created
        - `terminal:closed` - A terminal was closed
        - `terminal:output` - Terminal produced output
        - `terminal:command:completed` - A terminal command finished executing
        - `terminal:error` - A terminal error occurred

- **off(callback: (event: any, payload: ToolBoxEventPayload) => void)**: void
    - Removes a previously registered event listener

### Dataverse API (`window.dataverseAPI`)

Complete HTTP client for interacting with Microsoft Dataverse:

#### CRUD Operations

- **create(entityLogicalName: string, record: Record<string, unknown>)**: Promise<{id: string, ...}>
    - Creates a new record in Dataverse
    - Returns the created record ID and any returned fields

- **retrieve(entityLogicalName: string, id: string, columns?: string[])**: Promise<Record<string, unknown>>
    - Retrieves a single record by ID
    - Optional columns array to select specific fields

- **update(entityLogicalName: string, id: string, record: Record<string, unknown>)**: Promise<void>
    - Updates an existing record

- **delete(entityLogicalName: string, id: string)**: Promise<void>
    - Deletes a record

#### Query Operations

- **fetchXmlQuery(fetchXml: string)**: Promise<{value: Record<string, unknown>[], ...}>
    - Executes a FetchXML query
    - Returns object with value array containing matching records

- **retrieveMultiple(fetchXml: string)**: Promise<{value: Record<string, unknown>[], ...}>
    - Alias for fetchXmlQuery for backward compatibility

#### Metadata Operations

- **getEntityMetadata(entityLogicalName: string)**: Promise<EntityMetadata>
    - Retrieves metadata for a specific entity

- **getAllEntitiesMetadata()**: Promise<{value: EntityMetadata[]}>
    - Retrieves metadata for all entities

#### Advanced Operations

- **execute(request: ExecuteRequest)**: Promise<Record<string, unknown>>
    - Executes a Dataverse Web API action or function
    - Supports both bound and unbound operations
- **publishCustomizations(tableLogicalName?: string)**: Promise<void>
    - Publishes pending customizations. When `tableLogicalName` is omitted it runs PublishAllXml; otherwise it publishes only the specified table.
- **deploySolution(base64SolutionContent: string | ArrayBuffer | ArrayBufferView, options?: DeploySolutionOptions, connectionTarget?: "primary" | "secondary")**: Promise<{ImportJobId: string}>
    - Deploys (imports) a solution to the Dataverse environment
    - Accepts either a base64-encoded solution zip string or raw binary data (Buffer, ArrayBuffer, Uint8Array)
    - Always supplies `PublishWorkflows` and `OverwriteUnmanagedCustomizations` booleans to Dataverse, defaulting to `false` when you omit them
    - Supports optional parameters for customizing the import (publishWorkflows, overwriteUnmanagedCustomizations, skipProductUpdateDependencies, convertToManaged)
    - Returns an ImportJobId for tracking the import progress
- **getImportJobStatus(importJobId: string, connectionTarget?: "primary" | "secondary")**: Promise<Record<string, unknown>>
    - Gets the status of a solution import job
    - Returns import job details including progress, completion status, and error information
    - Use to track the progress of a solution deployment initiated with deploySolution

### Security Notes

- **Access Tokens**: Tools do NOT have direct access to access tokens. All Dataverse operations are authenticated automatically by the platform.
- **Connection Context**: Tools only receive the connection URL, not sensitive credentials.
- **Secure Storage**: All tokens and secrets are encrypted and managed by the platform.

For detailed examples and best practices, see the [Dataverse API Documentation](../docs/DATAVERSE_API.md).

## Publishing the package to npm

This is an organization scoped package so use the following command to deploy to npm

```bash
npm publish --access public
```

## License

GPL-3.0
