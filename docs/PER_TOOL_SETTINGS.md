# Per-Tool Settings Feature

## Overview

The Per-Tool Settings feature provides a context-aware, persistent storage mechanism for tool-specific preferences and configuration. Each tool automatically gets its own isolated settings namespace without needing to specify a tool ID.

## Key Features

- **Context-Aware**: Settings are automatically scoped to the current tool - no need to pass tool ID
- **Persistent**: Settings are stored using electron-store and persist across app restarts
- **Isolated**: Each tool has its own settings namespace - tools cannot access each other's settings
- **Type-Safe**: Supports any JSON-serializable value (strings, numbers, booleans, objects, arrays)
- **Simple API**: Just four methods covering all common use cases

## API Methods

### `toolboxAPI.settings.getSettings()`

Get all settings for the current tool.

**Returns:** `Promise<Record<string, any>>` - Object containing all settings (empty object if no settings exist)

**Example:**
```javascript
const allSettings = await toolboxAPI.settings.getSettings();
console.log(allSettings);
// { theme: 'dark', autoRefresh: true, refreshInterval: 5000 }
```

### `toolboxAPI.settings.getSetting(key)`

Get a specific setting by key.

**Parameters:**
- `key` (string) - The setting key to retrieve

**Returns:** `Promise<any>` - The setting value, or `undefined` if not found

**Example:**
```javascript
const theme = await toolboxAPI.settings.getSetting('theme');
console.log(theme); // 'dark'

// Handle non-existent settings
const value = await toolboxAPI.settings.getSetting('nonExistent');
if (value === undefined) {
    console.log('Setting does not exist - use defaults');
}
```

### `toolboxAPI.settings.setSetting(key, value)`

Set a specific setting by key.

**Parameters:**
- `key` (string) - The setting key to set
- `value` (any) - The value to store (must be JSON-serializable)

**Returns:** `Promise<void>`

**Example:**
```javascript
await toolboxAPI.settings.setSetting('theme', 'dark');
await toolboxAPI.settings.setSetting('autoRefresh', true);
await toolboxAPI.settings.setSetting('refreshInterval', 5000);
await toolboxAPI.settings.setSetting('userPreferences', {
    showWelcome: false,
    defaultView: 'grid'
});
```

### `toolboxAPI.settings.setSettings(settings)`

Set all settings (replaces entire settings object).

**Parameters:**
- `settings` (Record<string, any>) - The settings object to store

**Returns:** `Promise<void>`

**Example:**
```javascript
await toolboxAPI.settings.setSettings({
    theme: 'light',
    autoRefresh: false,
    refreshInterval: 10000,
    lastSync: new Date().toISOString()
});
```

## Common Use Cases

### 1. Load Settings on Startup

```javascript
async function initializeTool() {
    const settings = await toolboxAPI.settings.getSettings();
    
    // Apply settings with defaults
    const theme = settings.theme || 'light';
    const autoRefresh = settings.autoRefresh ?? true;
    const refreshInterval = settings.refreshInterval || 5000;
    
    applyTheme(theme);
    if (autoRefresh) {
        startAutoRefresh(refreshInterval);
    }
}
```

### 2. Save User Preferences

```javascript
async function saveUserPreferences(formData) {
    await toolboxAPI.settings.setSettings({
        theme: formData.theme,
        autoRefresh: formData.autoRefresh,
        refreshInterval: formData.refreshInterval,
        notifications: formData.notifications
    });
    
    await toolboxAPI.utils.showNotification({
        title: 'Settings Saved',
        body: 'Your preferences have been saved',
        type: 'success'
    });
}
```

### 3. Store Complex Data

```javascript
// Save recent files list
await toolboxAPI.settings.setSetting('recentFiles', [
    { path: '/path/to/file1.txt', lastOpened: Date.now() },
    { path: '/path/to/file2.txt', lastOpened: Date.now() - 86400000 }
]);

// Save window layout
await toolboxAPI.settings.setSetting('windowLayout', {
    sidebar: { width: 250, visible: true },
    panel: { height: 300, position: 'bottom' },
    columns: ['name', 'date', 'status', 'actions']
});
```

### 4. Incremental Updates

```javascript
// Update a single setting without affecting others
async function updateTheme(newTheme) {
    await toolboxAPI.settings.setSetting('theme', newTheme);
}

// Load a setting with fallback
async function getRefreshInterval() {
    const interval = await toolboxAPI.settings.getSetting('refreshInterval');
    return interval ?? 5000; // Default to 5 seconds
}
```

## Implementation Details

### Backend Storage

Settings are stored using `electron-store` in a separate file named `tool-settings.json` in the app's user data directory. The structure is:

```json
{
    "my-tool-package-name": {
        "theme": "dark",
        "autoRefresh": true,
        "refreshInterval": 5000
    },
    "another-tool-package": {
        "setting1": "value1"
    }
}
```

### Security & Isolation

- Each tool's settings are keyed by the tool's package name (tool ID)
- Tools can only access their own settings through the API
- The tool ID is automatically detected from the context - tools cannot specify a different tool ID
- Settings are stored locally and not transmitted over the network

### Data Types

Any JSON-serializable value is supported:
- Strings: `"hello"`
- Numbers: `42`, `3.14`
- Booleans: `true`, `false`
- Objects: `{ key: "value" }`
- Arrays: `[1, 2, 3]`
- Null: `null`

Non-serializable values (functions, undefined, Symbol, etc.) cannot be stored.

## Migration from Manual Storage

If your tool previously used manual storage (e.g., localStorage in browser context), migrate to the Settings API:

**Before:**
```javascript
// Not available in webview context
localStorage.setItem('theme', 'dark');
const theme = localStorage.getItem('theme');
```

**After:**
```javascript
await toolboxAPI.settings.setSetting('theme', 'dark');
const theme = await toolboxAPI.settings.getSetting('theme');
```

## Examples

See the comprehensive examples:
- [Settings API Example (HTML)](./docs/examples/settings-api-example.html) - Interactive example with UI
- [Context-Aware Tool Example (JS)](./docs/examples/context-aware-tool-example.js) - Complete tool example including settings

## TypeScript Support

Full TypeScript definitions are available in `@pptb/types` package:

```typescript
interface SettingsAPI {
    getSettings: () => Promise<Record<string, any>>;
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;
    setSettings: (settings: Record<string, any>) => Promise<void>;
}

// Usage with proper typing
const settings = await toolboxAPI.settings.getSettings();
const theme = await toolboxAPI.settings.getSetting('theme') as string;
```

## Troubleshooting

### Settings not persisting

**Problem:** Settings are lost after app restart.

**Solution:** Ensure you're using `await` with all settings methods. Settings are persisted asynchronously.

```javascript
// Wrong - doesn't wait for save
toolboxAPI.settings.setSetting('theme', 'dark');

// Correct - waits for save to complete
await toolboxAPI.settings.setSetting('theme', 'dark');
```

### Getting `undefined` for existing settings

**Problem:** `getSetting()` returns `undefined` even though you set a value.

**Solution:** Make sure the key matches exactly (case-sensitive) and that you waited for `setSetting()` to complete.

### Tool ID not detected

**Problem:** Error "Tool ID not available" when calling settings methods.

**Solution:** Ensure the tool context is initialized by the parent window before calling settings methods. This typically happens automatically on tool load.

## Related Documentation

- [Tool Development Guide](./docs/TOOL_DEVELOPMENT.md) - Complete guide to developing tools
- [API Reference](./packages/toolboxAPI.d.ts) - Full TypeScript API definitions
- [Architecture Documentation](./docs/ARCHITECTURE.md) - System architecture overview
