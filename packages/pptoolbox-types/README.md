# @powerplatform/pptoolbox-types

TypeScript type definitions for Power Platform Tool Box API.

## Installation

```bash
npm install --save-dev @powerplatform/pptoolbox-types
```

## Usage

### In your TypeScript tool

```typescript
/// <reference types="@powerplatform/pptoolbox-types" />

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

See the [full type definitions](./index.d.ts) for complete API documentation.

## License

MIT
