# PowerPlatform Example Tool

A complete example tool demonstrating the HTML-first architecture with TypeScript for PowerPlatform ToolBox.

## Features

- ✅ TypeScript with full type safety
- ✅ HTML+CSS+JS architecture
- ✅ Access to ToolBox API via `window.toolboxAPI`
- ✅ Connection URL and access token handling
- ✅ Event subscription and handling
- ✅ Interactive UI with notifications, clipboard, and data display

## Structure

```
example-tool/
├── src/
│   ├── index.html      # Main UI
│   ├── index.ts        # Tool logic (TypeScript)
│   └── styles.css      # Styling
├── dist/               # Compiled output (after build)
│   ├── index.html
│   ├── index.js
│   ├── index.js.map
│   └── styles.css
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

Install dependencies:

```bash
npm install
```

## Development

Build the tool:

```bash
npm run build
```

Watch mode for development:

```bash
npm run watch
```

## Usage in ToolBox

1. Install the tool in ToolBox:
   ```javascript
   await window.toolboxAPI.installTool('@powerplatform/example-tool');
   ```

2. Load the tool:
   ```javascript
   await window.toolboxAPI.loadTool('@powerplatform/example-tool');
   ```

3. Get the tool's HTML with connection context:
   ```javascript
   const html = await window.toolboxAPI.getToolWebviewHtml(
     '@powerplatform/example-tool',
     'https://your-env.crm.dynamics.com',
     'your-access-token'
   );
   ```

4. Render the HTML in a webview.

## API Usage

The tool demonstrates various ToolBox API features:

### Getting Connection Context

```typescript
const context = await window.toolboxAPI.getToolContext();
console.log(context.connectionUrl);
console.log(context.accessToken);
```

### Showing Notifications

```typescript
await window.toolboxAPI.showNotification({
  title: 'Success',
  body: 'Operation completed',
  type: 'success'
});
```

### Subscribing to Events

```typescript
window.toolboxAPI.onToolboxEvent((event, payload) => {
  console.log('Event:', payload.event);
  console.log('Data:', payload.data);
});
```

### Accessing Connections

```typescript
const connections = await window.toolboxAPI.getConnections();
const active = await window.toolboxAPI.getActiveConnection();
```

## Type Definitions

This tool includes TypeScript type definitions in the `types/` folder. The type definitions provide:

- Full ToolBoxAPI interface
- Event type definitions
- Connection and Tool interfaces
- Notification options
- And more...

## TypeScript Configuration

The tool uses modern TypeScript configuration:

- **Target**: ES2022
- **Module**: ES2022
- **Module Resolution**: bundler (modern strategy)
- **Strict Mode**: Enabled with additional safety checks:
  - `noUnusedLocals`: Warns about unused local variables
  - `noUnusedParameters`: Warns about unused function parameters
  - `noFallthroughCasesInSwitch`: Ensures all switch cases handle control flow
  - `useDefineForClassFields`: Modern class field semantics
  - `moduleDetection`: Force module detection

## License

MIT
