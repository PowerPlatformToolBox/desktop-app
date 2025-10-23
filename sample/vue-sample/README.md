# Vue Sample Tool

A complete example tool for Power Platform Tool Box built with Vue 3, Composition API, Vite, and TypeScript.

## Features

This sample demonstrates:

- ✅ **Vue 3** with Composition API and `<script setup>` syntax
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
  - Composables (Vue's equivalent to React hooks) for API integration
  - Component-based architecture with Single File Components
  - Reactive state management with `ref` and `reactive`
  - Event-driven architecture with `emit`
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

This compiles the TypeScript and Vue code, and outputs to the `dist/` directory.

### Development Mode

For local development with hot module replacement:

```bash
npm run dev
```

Note: The dev server will run, but ToolBox APIs will only be available when loaded within Power Platform Tool Box.

## Project Structure

```
vue-sample/
├── src/
│   ├── components/
│   │   ├── ConnectionStatus.vue     # Connection display component
│   │   ├── ToolboxAPIDemo.vue       # ToolBox API examples
│   │   ├── DataverseAPIDemo.vue     # Dataverse API examples
│   │   └── EventLog.vue             # Event logging component
│   ├── composables/
│   │   └── useToolboxAPI.ts         # Composables for APIs
│   ├── App.vue                       # Main app component
│   ├── main.ts                       # Vue entry point
│   ├── style.css                     # Global styles
│   └── vite-env.d.ts                # Type definitions
├── index.html                        # HTML entry point
├── vite.config.ts                    # Vite configuration
├── tsconfig.json                     # TypeScript configuration
├── tsconfig.node.json                # Node TypeScript configuration
├── package.json                      # Package configuration
└── README.md                         # This file
```

## Architecture

### Composables

The sample includes reusable composables for API integration:

#### `useConnection()`
```typescript
const { connection, isLoading, refreshConnection } = useConnection();
```
- Manages Dataverse connection state with reactivity
- Automatically loads on mount
- Provides refresh function

#### `useToolboxEvents(callback)`
```typescript
useToolboxEvents((event, data) => {
    console.log('Event:', event, data);
});
```
- Subscribes to platform events
- Automatic setup on mount

#### `useEventLog()`
```typescript
const { logs, addLog, clearLogs } = useEventLog();
```
- Manages event log state reactively
- Keeps last 50 entries
- Console integration

### Components

Each component is a Single File Component (SFC) with `<script setup>` syntax:

- **ConnectionStatus.vue**: Displays current Dataverse connection
- **ToolboxAPIDemo.vue**: Demonstrates ToolBox API features
- **DataverseAPIDemo.vue**: Demonstrates Dataverse CRUD and queries
- **EventLog.vue**: Real-time event logging with filtering

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

1. Create `.vue` component in `src/components/`
2. Import and use in `App.vue`
3. Use composables for API access

### Adding New Composables

1. Create composable in `src/composables/`
2. Follow naming convention: `use[Feature].ts`
3. Export functions that return reactive values

### Type Safety

This tool uses TypeScript with the `@pptb/types` package:

```typescript
/// <reference types="@pptb/types" />

// Full type safety for APIs
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;
```

### Component Communication

Vue components use props and emits for communication:

```vue
<script setup lang="ts">
// Receive data
const props = defineProps<{
    connection: ToolBoxAPI.DataverseConnection | null;
}>();

// Send events
const emit = defineEmits<{
    log: [message: string, type: string];
}>();

emit('log', 'Message', 'info');
</script>
```

### Styling

Global styles are in `src/style.css`. Components can include scoped styles:

```vue
<style scoped>
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
- Ensure you're using `ref()` or `reactive()`
- Access ref values with `.value` in script
- No need for `.value` in template

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
    plugins: [vue()],
    base: './',  // Relative paths for embedded usage
    build: {
        outDir: 'dist',
        assetsDir: 'assets'
    }
});
```

## Vue 3 Composition API

This sample uses Vue 3's Composition API with `<script setup>`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

// Reactive state
const count = ref(0);

// Computed values
const doubled = computed(() => count.value * 2);

// Lifecycle hooks
onMounted(() => {
    console.log('Component mounted');
});
</script>
```

## Resources

- [Vue 3 Documentation](https://vuejs.org)
- [Composition API Guide](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vite Documentation](https://vitejs.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Tool Development Guide](../../docs/TOOL_DEVELOPMENT.md)
- [API Reference](../../packages/README.md)
- [Power Platform Tool Box Repository](https://github.com/PowerPlatform-ToolBox/desktop-app)

## License

GPL-3.0 - See LICENSE file in repository root
