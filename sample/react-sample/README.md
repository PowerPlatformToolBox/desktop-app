# React Sample Tool

A complete example tool for Power Platform Tool Box built with React 18, Vite, and TypeScript.

## Features

This sample demonstrates:

- ✅ **React 18** with hooks and functional components
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
  - Custom React hooks for API integration
  - Component-based architecture
  - Proper state management
  - Event-driven architecture
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

This compiles the TypeScript and React code, and outputs to the `dist/` directory.

### Development Mode

For local development with hot module replacement:

```bash
npm run dev
```

Note: The dev server will run, but ToolBox APIs will only be available when loaded within Power Platform Tool Box.

## Project Structure

```
react-sample/
├── src/
│   ├── components/
│   │   ├── ConnectionStatus.tsx    # Connection display component
│   │   ├── ToolboxAPIDemo.tsx      # ToolBox API examples
│   │   ├── DataverseAPIDemo.tsx    # Dataverse API examples
│   │   └── EventLog.tsx            # Event logging component
│   ├── hooks/
│   │   └── useToolboxAPI.ts        # Custom hooks for APIs
│   ├── App.tsx                      # Main app component
│   ├── main.tsx                     # React entry point
│   ├── index.css                    # Global styles
│   └── vite-env.d.ts               # Type definitions
├── index.html                       # HTML entry point
├── vite.config.ts                   # Vite configuration
├── tsconfig.json                    # TypeScript configuration
├── tsconfig.node.json               # Node TypeScript configuration
├── package.json                     # Package configuration
└── README.md                        # This file
```

## Architecture

### Custom Hooks

The sample includes reusable hooks for API integration:

#### `useConnection()`
```typescript
const { connection, isLoading, refreshConnection } = useConnection();
```
- Manages Dataverse connection state
- Automatically loads on mount
- Provides refresh function

#### `useToolboxEvents(onEvent)`
```typescript
useToolboxEvents((event, data) => {
    console.log('Event:', event, data);
});
```
- Subscribes to platform events
- Automatic cleanup on unmount

#### `useEventLog()`
```typescript
const { logs, addLog, clearLogs } = useEventLog();
```
- Manages event log state
- Keeps last 50 entries
- Console integration

### Components

Each component is self-contained and demonstrates specific functionality:

- **ConnectionStatus**: Displays current Dataverse connection
- **ToolboxAPIDemo**: Demonstrates ToolBox API features
- **DataverseAPIDemo**: Demonstrates Dataverse CRUD and queries
- **EventLog**: Real-time event logging with filtering

## Usage

### Install in Power Platform Tool Box

1. Open Power Platform Tool Box
2. Go to Tools section
3. Click "Install Tool"
4. Enter the path to this directory or publish to npm and use the package name

### Features Overview

#### Connection Status
- Real-time connection information
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

1. Create component in `src/components/`
2. Import and use in `App.tsx`
3. Use custom hooks for API access

### Adding New Hooks

1. Create hook in `src/hooks/`
2. Follow naming convention: `use[Feature].ts`
3. Export from hook file

### Type Safety

This tool uses TypeScript with the `@pptb/types` package:

```typescript
/// <reference types="@pptb/types" />

// Full type safety for APIs
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;
```

### Styling

Global styles are in `src/index.css`. Components use CSS classes for styling.

To modify styles:
1. Edit `src/index.css`
2. Changes apply immediately in dev mode
3. Rebuild for production

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

### React Hook Warnings

If you see "Rules of Hooks" warnings:
- Ensure hooks are only called at the top level
- Don't call hooks inside loops, conditions, or nested functions
- Only call hooks from React components or custom hooks

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
    plugins: [react()],
    base: './',  // Relative paths for embedded usage
    build: {
        outDir: 'dist',
        assetsDir: 'assets'
    }
});
```

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Tool Development Guide](../../docs/TOOL_DEVELOPMENT.md)
- [API Reference](../../packages/README.md)
- [Power Platform Tool Box Repository](https://github.com/PowerPlatform-ToolBox/desktop-app)

## License

GPL-3.0 - See LICENSE file in repository root
