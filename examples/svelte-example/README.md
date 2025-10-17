# PowerPlatform Svelte Example Tool

A complete example tool demonstrating Svelte integration with PowerPlatform ToolBox using Vite and TypeScript.

## Features

- ✅ Svelte 5 with TypeScript
- ✅ Vite for fast development and building
- ✅ Access to ToolBox API via `window.toolboxAPI`
- ✅ Connection URL and access token handling
- ✅ Event subscription and handling
- ✅ Interactive UI with notifications and data display
- ✅ Reactive programming with Svelte stores

## Structure

```
svelte-example/
├── src/
│   ├── App.svelte     # Main Svelte component
│   ├── main.ts        # Entry point
│   ├── app.css        # Global styles
│   └── vite-env.d.ts  # Vite types
├── index.html         # HTML template
├── vite.config.ts     # Vite configuration
├── svelte.config.js   # Svelte configuration
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

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Check types:

```bash
npm run check
```

## Usage in ToolBox

1. Build the tool:
   ```bash
   npm run build
   ```

2. The built files will be in the `dist/` directory

3. Install the tool in ToolBox through the UI or programmatically

## Key Concepts

### ToolBox API Integration

The tool uses `window.toolboxAPI` to interact with the ToolBox:

```typescript
// Listen for TOOLBOX_CONTEXT from parent window (important!)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TOOLBOX_CONTEXT') {
    window.TOOLBOX_CONTEXT = event.data.data;
  }
});

// Get connection context - try TOOLBOX_CONTEXT first, then API
let context = window.TOOLBOX_CONTEXT;
if (!context) {
  context = await window.toolboxAPI.getToolContext();
}

// Show notifications
await window.toolboxAPI.showNotification({
  title: 'Success',
  body: 'Operation completed',
  type: 'success'
});

// Subscribe to events
window.toolboxAPI.onToolboxEvent((event, payload) => {
  console.log('Event:', event);
});

// Get connections
const connections = await window.toolboxAPI.getConnections();
```

**Important**: The tool must listen for `TOOLBOX_CONTEXT` via `postMessage` from the parent window. This provides connection information when the tool is loaded in a webview.

### Svelte Reactivity

The example demonstrates:

- Reactive variables with `let`
- `onMount` lifecycle function for initialization
- Conditional rendering with `{#if}` blocks
- List rendering with `{#each}` blocks
- Event handling with `on:click`
- Type-safe event handling with TypeScript

### Styling

Uses CSS with modern features:

- CSS Grid for layouts
- Flexbox for alignment
- Scoped styles in components
- Global styles in app.css
- Responsive design

## TypeScript

Full TypeScript support with:

- Type declarations for ToolBox API
- Strict type checking
- Modern ES2022 features
- Svelte component types

## License

MIT
