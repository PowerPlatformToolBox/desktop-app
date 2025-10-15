# Tool Host Architecture

The PowerPlatform ToolBox uses a **VS Code Extension Host-inspired architecture** for secure, isolated tool execution.

## Overview

### Key Components

1. **Tool Host Manager** - Coordinates all tool host processes
2. **Tool Host Process** - Individual isolated process for each tool
3. **Tool Host Protocol** - Secure IPC communication layer
4. **Tool Host Runner** - Entry point that runs in isolated process
5. **PPToolBox API** - API module injected into tools at runtime

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Main Process (Electron)                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Tool Host Manager                        │ │
│  │  - Coordinates tool host processes                          │ │
│  │  - Routes API calls                                         │ │
│  │  - Manages tool lifecycle                                   │ │
│  └───────────┬──────────────────────────┬────────────────────┘ │
│              │                           │                       │
└──────────────┼───────────────────────────┼───────────────────────┘
               │                           │
     ┌─────────▼─────────┐       ┌────────▼──────────┐
     │ Tool Host Process │       │ Tool Host Process │
     │   (Node.js Fork)  │       │   (Node.js Fork)  │
     │                   │       │                   │
     │  ┌─────────────┐  │       │  ┌─────────────┐  │
     │  │ Tool Module │  │       │  │ Tool Module │  │
     │  │             │  │       │  │             │  │
     │  │ activate()  │  │       │  │ activate()  │  │
     │  │ deactivate()│  │       │  │ deactivate()│  │
     │  │             │  │       │  │             │  │
     │  │ ↓ imports   │  │       │  │ ↓ imports   │  │
     │  │ pptoolbox   │  │       │  │ pptoolbox   │  │
     │  └─────────────┘  │       │  └─────────────┘  │
     │         ↑         │       │         ↑         │
     │         │         │       │         │         │
     │  ┌──────┴──────┐  │       │  ┌──────┴──────┐  │
     │  │ PPToolBox   │  │       │  │ PPToolBox   │  │
     │  │     API     │  │       │  │     API     │  │
     │  │  (injected) │  │       │  │  (injected) │  │
     │  └─────────────┘  │       │  └─────────────┘  │
     └───────────────────┘       └───────────────────┘
          Tool 1                       Tool 2
```

## Secure IPC Protocol

### Message Types

- **REQUEST** - Tool calls ToolBox API
- **RESPONSE** - Successful API call result
- **ERROR** - API call failed
- **EVENT** - Event broadcast from main process
- **ACTIVATE** - Activate a tool
- **DEACTIVATE** - Deactivate a tool
- **API_CALL** - Tool calling back to main process

### Message Structure

```typescript
interface ToolHostMessage {
  type: ToolHostMessageType;
  id: string;              // Unique message ID (UUID)
  toolId: string;          // Tool identifier
  method?: string;         // Method being called
  args?: unknown[];        // Method arguments
  result?: unknown;        // Method result
  error?: string;          // Error message
  timestamp: number;       // Message timestamp
}
```

### Message Flow

#### Tool Calls API

```
1. Tool: pptoolbox.window.showInformationMessage('Hello')
2. PPToolBox API: Creates REQUEST message with unique ID
3. IPC: Sends message to Main Process via process.send()
4. Tool Host Manager: Receives message, validates, executes API
5. Tool Host Manager: Creates RESPONSE message with result
6. IPC: Sends response back to Tool Host Process
7. PPToolBox API: Resolves promise with result
8. Tool: Receives result from async call
```

#### Main Process Broadcasts Event

```
1. Main Process: Emits event (e.g., connection:created)
2. Tool Host Manager: Creates EVENT message for all tools
3. IPC: Sends event to all Tool Host Processes
4. PPToolBox API: Emits event via EventEmitter
5. Tool: Event listener receives event
```

## Tool Lifecycle

### 1. Tool Installation

```
User installs tool → npm install → package.json parsed → Tool registered
```

### 2. Tool Loading

```typescript
// ToolManager.loadTool()
1. Parse package.json (contributions, activation events)
2. Create Tool object
3. Pass to Tool Host Manager
4. Tool Host Manager creates Tool Host Process
5. Fork new Node.js process with toolHostRunner.ts
6. Wait for "ready" message
```

### 3. Tool Activation

```typescript
// ToolManager.activateTool()
1. Send ACTIVATE message to Tool Host Process
2. Tool Host Runner loads tool module
3. Create tool context (state, subscriptions)
4. Call tool's activate(context) function
5. Tool registers commands, subscribes to events
6. Send RESPONSE back to Main Process
```

### 4. Command Execution

```typescript
// User invokes command
1. Main Process: executeCommand(toolId, commandId, ...args)
2. Tool Host Manager: Send REQUEST to Tool Host Process
3. Tool Host Runner: Call tool's command handler
4. Tool: Execute command logic
5. Tool Host Runner: Send RESPONSE with result
6. Main Process: Resolve command execution promise
```

### 5. Tool Deactivation

```typescript
// ToolManager.deactivateTool()
1. Send DEACTIVATE message to Tool Host Process
2. Tool Host Runner calls tool's deactivate() function
3. Dispose all subscriptions in context.subscriptions
4. Clean up tool resources
5. Send RESPONSE back to Main Process
```

### 6. Tool Unloading

```typescript
// ToolManager.unloadTool()
1. Deactivate tool if active
2. Kill Tool Host Process
3. Clean up resources
4. Remove from loaded tools map
```

## API Injection

Tools import the `pptoolbox` module:

```javascript
const pptoolbox = require('pptoolbox');
```

### How It Works

1. Tool Host Process has `pptoolbox.ts` in its module resolution path
2. When tool does `require('pptoolbox')`, it loads the injected API
3. The API module communicates with Main Process via IPC
4. All API calls go through the secure protocol

### Why This Approach?

- **No global state** - Each tool gets its own API instance
- **Type safety** - Tools can use TypeScript definitions
- **Familiar pattern** - Same as VS Code's `vscode` module
- **Secure** - Tools can't bypass the API to access Node.js/Electron

## Security Features

### Process Isolation

- Each tool runs in separate Node.js process
- Tools cannot access:
  - Main Electron process
  - Other tools
  - Renderer process
  - File system (except via API)

### Message Validation

- All messages validated for structure
- Type checking on message fields
- Timeout handling (30 seconds default)
- Invalid messages rejected

### API Surface

Tools only have access to:
- `pptoolbox.commands` - Command registration
- `pptoolbox.window` - UI interactions
- `pptoolbox.workspace` - File operations (via dialogs)
- `pptoolbox.events` - Event subscription

Tools **cannot** access:
- `require('fs')` - File system
- `require('electron')` - Electron APIs
- `require('child_process')` - Process spawning
- Other sensitive Node.js modules

### Resource Management

- Automatic cleanup on tool deactivation
- Process killed if unresponsive
- Memory isolated per tool
- Crash of one tool doesn't affect others

## Contribution Points

Tools declare capabilities in `package.json`:

### Commands

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myTool.action",
        "title": "My Action",
        "category": "My Tool",
        "icon": "🔧"
      }
    ]
  }
}
```

### Menus

```json
{
  "contributes": {
    "menus": {
      "commandPalette": [
        { "command": "myTool.action" }
      ],
      "toolsMenu": [
        { 
          "command": "myTool.action",
          "group": "navigation"
        }
      ]
    }
  }
}
```

### Configuration

```json
{
  "contributes": {
    "configuration": [{
      "title": "My Tool Settings",
      "properties": {
        "myTool.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable my tool"
        }
      }
    }]
  }
}
```

## Comparison with VS Code

| Feature | VS Code | PowerPlatform ToolBox |
|---------|---------|----------------------|
| Extension Host | ✅ Separate process | ✅ Separate process per tool |
| API Injection | ✅ `vscode` module | ✅ `pptoolbox` module |
| IPC Protocol | ✅ Structured messages | ✅ Structured messages |
| Contribution Points | ✅ package.json | ✅ package.json |
| Activation Events | ✅ Yes | ✅ Yes |
| Commands | ✅ Yes | ✅ Yes |
| Menus | ✅ Yes | ✅ Yes (planned) |
| Views | ✅ WebViews | 🔄 Planned |
| Language Server | ✅ Yes | ❌ Not applicable |

## Performance Considerations

### Process Overhead

- Each tool = separate Node.js process
- Initial fork ~50-100ms
- Memory: ~30MB per tool process
- Solution: Lazy activation (load only when needed)

### IPC Overhead

- Message serialization/deserialization
- Network latency (local IPC)
- Solution: Batch operations when possible

### Activation Time

- Tool module loading
- Activation function execution
- Solution: Keep activate() lightweight

## Debugging

### Tool Development

1. Use `console.log()` - appears in main ToolBox console
2. Errors automatically caught and displayed
3. Use activation event `*` to load on startup for testing

### Tool Host Process

Check logs for:
- Process spawn/exit
- Message validation errors
- API call traces
- Protocol timeouts

### Main Process

- Tool Host Manager logs all IPC
- Protocol validation errors
- Tool lifecycle events

## Future Enhancements

- [ ] WebView-based custom tool UIs
- [ ] Language Server Protocol support
- [ ] Hot reload for tool development
- [ ] Tool marketplace integration
- [ ] Performance profiling for tools
- [ ] Sandboxed web workers for heavy computation
- [ ] Plugin API versioning

## References

- [VS Code Extension Host Architecture](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Node.js Child Processes](https://nodejs.org/api/child_process.html)
