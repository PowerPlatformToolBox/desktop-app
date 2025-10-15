# Example PowerPlatform Tool (TypeScript)

This is a TypeScript example demonstrating the PowerPlatform ToolBox architecture with full type safety.

## Features

This example demonstrates:

- **Type-safe development** with TypeScript
- **Type definitions** for the `pptoolbox` API
- **Secure Tool Host architecture** with isolated process execution
- **Contribution points** (commands, menus, configuration)
- **State management** (global and workspace state)
- **Event subscriptions** with typed handlers
- **Error handling** best practices
- **Command registration** with async/await
- **File operations** with type safety
- **Webview UI** with advanced features

## User Interface

The tool includes an advanced webview UI (`ui/webview.html`) featuring:

- **Dashboard Cards**: Real-time statistics on commands, events, and status
- **Configuration Panel**: Type-safe settings management
- **Command Table**: Comprehensive list of all available commands
- **Dataverse Entity Viewer**: Simulated entity metadata browser
- **Type Safety Examples**: Code snippets showing TypeScript features
- **Status Bar**: Live connection and resource monitoring

The UI demonstrates how to build rich, interactive tool interfaces that work seamlessly with the Tool Host architecture.

## Project Structure

```
example-tool-typescript/
├── src/
│   ├── index.ts          # Main tool implementation
│   └── pptoolbox.d.ts    # Type definitions for pptoolbox API
├── ui/
│   └── webview.html      # Tool user interface
├── dist/                 # Compiled JavaScript (generated)
├── package.json          # Tool manifest with contribution points
└── tsconfig.json         # TypeScript configuration
```

## Commands

This tool provides the following commands:

- `exampleTs.sayHello` - Shows a hello message with usage tracking
- `exampleTs.showNotification` - Displays an example notification
- `exampleTs.exportData` - Exports tool data to JSON file with type safety
- `exampleTs.fetchDataverseData` - Simulates fetching Dataverse entity metadata

## Installation

### From npm (when published)

```bash
npm install @powerplatform/example-tool-typescript
```

### Local Development

1. Clone or copy this directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the TypeScript code:
   ```bash
   npm run build
   ```
4. Link for local testing:
   ```bash
   npm link
   ```

## Development

### Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Watch Mode

Auto-compile on file changes:

```bash
npm run watch
```

### Type Checking

The project uses TypeScript in strict mode for maximum type safety:

- All `pptoolbox` API calls are type-checked
- Event handlers have typed parameters
- State storage uses generics for type safety
- Interfaces define data structures

## Configuration

The tool supports the following settings (declared in `package.json`):

- `exampleTs.enabled` (boolean) - Enable/disable the tool
- `exampleTs.message` (string) - Default greeting message
- `exampleTs.apiTimeout` (number) - API timeout in milliseconds

## Type Definitions

The `src/pptoolbox.d.ts` file provides complete TypeScript definitions for:

- `ToolContext` - Tool activation context
- `StateStorage` - State management interface
- `commands` namespace - Command registration and execution
- `window` namespace - UI interactions
- `workspace` namespace - File operations
- `events` namespace - Event subscription
- `EventType` enum - Built-in event types

## Usage Example

```typescript
import * as pptoolbox from './pptoolbox';

export async function activate(context: pptoolbox.ToolContext): Promise<void> {
  // Register a command with type safety
  const cmd = pptoolbox.commands.registerCommand(
    'myTool.action',
    async () => {
      await pptoolbox.window.showInformationMessage('Hello!');
    }
  );

  // Subscribe to events with typed handlers
  const listener = pptoolbox.events.onEvent(
    pptoolbox.EventType.CONNECTION_CREATED,
    async (eventData: unknown) => {
      console.log('Connection created:', eventData);
    }
  );

  // Store in context for cleanup
  context.subscriptions.push(cmd, listener);
}

export async function deactivate(): Promise<void> {
  // Cleanup happens automatically
}
```

## Benefits of TypeScript

1. **Type Safety** - Catch errors at compile time
2. **IntelliSense** - Better IDE support with autocomplete
3. **Refactoring** - Safer code changes with type checking
4. **Documentation** - Types serve as inline documentation
5. **Maintainability** - Easier to understand and modify code

## Migration from JavaScript

To migrate a JavaScript tool to TypeScript:

1. Rename `.js` files to `.ts`
2. Add `tsconfig.json`
3. Copy `pptoolbox.d.ts` type definitions
4. Add type annotations to functions and variables
5. Update `package.json` main field to point to `dist/index.js`
6. Add build scripts

## Architecture

This tool runs in an isolated Node.js process managed by the Tool Host:

```
Main Process (Electron)
    ↓
Tool Host Manager
    ↓
Tool Host Process (Node.js fork)
    ↓
Your Tool (TypeScript compiled to JavaScript)
    ↓
pptoolbox API (injected at runtime)
```

### Security

- Isolated process execution
- No direct file system access
- Structured IPC communication
- API calls validated and sandboxed

## Publishing

Before publishing to npm:

1. Update version in `package.json`
2. Build the project: `npm run build`
3. Test locally with `npm link`
4. Publish: `npm publish --access public`

## Resources

- [Tool Development Guide](../../TOOL_DEVELOPMENT.md)
- [Tool Host Architecture](../../TOOL_HOST_ARCHITECTURE.md)
- [PowerPlatform ToolBox Repository](https://github.com/PowerPlatform-ToolBox/desktop-app)

## License

This example is provided as-is for demonstration purposes.
