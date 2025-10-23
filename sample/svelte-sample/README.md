# Svelte Sample Tool

A complete example tool for Power Platform Tool Box built with Svelte 5, Vite, and TypeScript.

## Features

This sample demonstrates:

- ✅ **Svelte 5** with modern reactivity and runes
- ✅ **TypeScript** with full type safety
- ✅ **Vite** for fast development and optimized builds
- ✅ **ToolBox API Integration**
  - Connection management with real-time updates
  - Notifications system
  - Clipboard operations
  - File save dialogs
  - Theme detection
  - Event subscription and handling

- ✅ **Dataverse API Usage**
  - FetchXML queries
  - CRUD operations (Create, Read, Update, Delete)
  - Entity metadata retrieval
  - Error handling

- ✅ **Best Practices**
  - Stores for state management
  - Component-based architecture
  - Reactive statements with `$` syntax
  - Event dispatching
  - Clean, modern UI design
  - Responsive layout

## Installation

### Prerequisites

- Node.js 18 or higher
- Power Platform Tool Box desktop application

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles the TypeScript and Svelte code, and outputs to the `dist/` directory.

### Development Mode

For local development with hot module replacement:

```bash
npm run dev
```

Note: The dev server will run, but ToolBox APIs will only be available when loaded within Power Platform Tool Box.

## Project Structure

```
svelte-sample/
├── src/
│   ├── lib/
│   │   ├── ConnectionStatus.svelte    # Connection display component
│   │   ├── ToolboxAPIDemo.svelte      # ToolBox API examples
│   │   ├── DataverseAPIDemo.svelte    # Dataverse API examples
│   │   ├── EventLog.svelte            # Event logging component
│   │   └── stores.ts                  # Svelte stores
│   ├── App.svelte                      # Main app component
│   ├── main.ts                         # Svelte entry point
│   ├── app.css                         # Global styles
│   └── vite-env.d.ts                  # Type definitions
├── index.html                          # HTML entry point
├── vite.config.ts                      # Vite configuration
├── svelte.config.js                    # Svelte configuration
├── tsconfig.json                       # TypeScript configuration
├── tsconfig.node.json                  # Node TypeScript configuration
├── package.json                        # Package configuration
└── README.md                           # This file
```

## Architecture

### Stores

The sample includes reusable stores for state management:

#### `createConnectionStore()`
```typescript
const { connection, isLoading, refreshConnection } = createConnectionStore();
```
- Manages Dataverse connection state with Svelte stores
- Reactive updates with `$` syntax
- Provides refresh function

#### `createEventLog()`
```typescript
const { logs, addLog, clearLogs } = createEventLog();
```
- Manages event log state reactively
- Keeps last 50 entries
- Console integration

#### `setupEventListeners(callback)`
```typescript
setupEventListeners((event, data) => {
    console.log('Event:', event, data);
});
```
- Subscribes to platform events
- Automatic setup on mount

### Components

Each component is a Svelte Single File Component:

- **ConnectionStatus.svelte**: Displays current Dataverse connection
- **ToolboxAPIDemo.svelte**: Demonstrates ToolBox API features
- **DataverseAPIDemo.svelte**: Demonstrates Dataverse CRUD and queries
- **EventLog.svelte**: Real-time event logging

## Usage

### Install in Power Platform Tool Box

1. Open Power Platform Tool Box
2. Go to Tools section
3. Click "Install Tool"
4. Enter the path to this directory or publish to npm and use the package name

### Features Overview

#### Connection Status
- Real-time connection information with reactive updates
- Environment type badges
- Automatic updates on connection changes

#### ToolBox API Examples

**Notifications:**
```typescript
await window.toolboxAPI.utils.showNotification({
    title: 'Success',
    body: 'Operation completed',
    type: 'success',
    duration: 3000
});
```

**Utilities:**
- Copy data to clipboard
- Get current theme (light/dark)
- Save data to file with native dialog

#### Dataverse API Examples

**Query with FetchXML:**
```typescript
const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
```

**CRUD Operations:**
```typescript
// Create
const account = await window.dataverseAPI.create('account', { name: 'Test' });

// Update
await window.dataverseAPI.update('account', id, { telephone1: '555-0100' });

// Delete
await window.dataverseAPI.delete('account', id);
```

**Metadata:**
```typescript
const metadata = await window.dataverseAPI.getEntityMetadata('account');
```

## Development

### Adding New Components

1. Create `.svelte` component in `src/lib/`
2. Import and use in `App.svelte`
3. Use stores for state management

### Adding New Stores

1. Create store function in `src/lib/stores.ts`
2. Follow naming convention: `create[Feature]Store()`
3. Return Svelte writable stores

### Type Safety

This tool uses TypeScript with the `@pptb/types` package:

```typescript
/// <reference types="@pptb/types" />

// Full type safety for APIs
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;
```

### Component Communication

Svelte components use props and event dispatchers:

```svelte
<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    // Receive data
    export let connection: ToolBoxAPI.DataverseConnection | null = null;

    // Send events
    const dispatch = createEventDispatcher<{
        log: { message: string; type: string };
    }>();

    dispatch('log', { message: 'Message', type: 'info' });
</script>
```

### Reactivity

Svelte provides automatic reactivity:

```svelte
<script lang="ts">
    import { writable } from 'svelte/store';

    // Reactive variable
    let count = 0;

    // Store
    const name = writable('John');

    // Reactive statement
    $: doubled = count * 2;
</script>

<!-- Access store with $ prefix -->
<p>{$name}</p>

<!-- Reactive updates -->
<p>{doubled}</p>
```

### Styling

Global styles are in `src/app.css`. Components can include scoped styles:

```svelte
<style>
    .component-class {
        color: blue;
    }
</style>
```

## Building for Production

```bash
npm run build
```

Output goes to `dist/` directory with:
- Optimized and minified JavaScript
- CSS extraction and minification
- Asset optimization
- Source maps for debugging

## Troubleshooting

### Build Errors

If you encounter TypeScript errors:
1. Ensure all dependencies are installed: `npm install`
2. Check TypeScript version: `tsc --version`
3. Clean and rebuild: `rm -rf dist && npm run build`

### Reactivity Issues

If reactive values don't update:
- Ensure you're using `$` for store access
- Use `bind:` for two-way binding
- Reactive statements need `$:` prefix

### API Not Available

If `toolboxAPI` or `dataverseAPI` is undefined:
- The tool must be loaded within Power Platform Tool Box
- These APIs are injected by the platform
- They are not available in standalone dev mode

### Connection Issues

If connection is null:
- Open Power Platform Tool Box
- Create a connection to a Dataverse environment
- The tool will automatically detect the connection via events

## Vite Configuration

The `vite.config.ts` is configured for Power Platform Tool Box:

```typescript
export default defineConfig({
    plugins: [svelte()],
    base: './',  // Relative paths for embedded usage
    build: {
        outDir: 'dist',
        assetsDir: 'assets'
    }
});
```

## Svelte 5 Features

This sample uses Svelte 5 features:

- **Stores**: Reactive state management with `writable`
- **Component Events**: Type-safe event dispatching
- **Reactive Statements**: Automatic dependency tracking with `$:`
- **Bind Directives**: Two-way data binding with `bind:`
- **Event Handlers**: Direct event handling with `on:click`

## Resources

- [Svelte Documentation](https://svelte.dev)
- [Svelte Tutorial](https://learn.svelte.dev)
- [Vite Documentation](https://vitejs.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Tool Development Guide](../../docs/TOOL_DEVELOPMENT.md)
- [API Reference](../../packages/README.md)
- [Power Platform Tool Box Repository](https://github.com/PowerPlatform-ToolBox/desktop-app)

## License

GPL-3.0 - See LICENSE file in repository root
