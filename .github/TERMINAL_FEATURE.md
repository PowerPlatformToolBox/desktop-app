# Terminal Feature Implementation

## Overview

This PR implements a comprehensive terminal feature for the Power Platform Tool Box, allowing tools to create and manage their own terminal instances for executing shell commands.

## Features Implemented

### 1. Terminal Manager (`src/main/managers/terminalManager.ts`)
- Creates and manages terminal instances for tools
- Executes shell commands and captures output
- Supports custom shell selection with automatic fallback to system defaults
- Handles multiple simultaneous terminals
- Provides event-driven architecture for real-time updates
- Includes proper cleanup and resource management

### 2. Type Definitions
- Added terminal-related types to `src/types/index.ts`:
  - `TerminalOptions`: Configuration for creating terminals
  - `Terminal`: Terminal instance representation
  - `TerminalCommandResult`: Command execution results
  - `TerminalEvent`: Terminal event types
- Updated `ToolBoxEvent` enum to include terminal events
- Updated `packages/pptoolbox-types/index.d.ts` for tool developers

### 3. API Integration
- **Main Process** (`src/main/index.ts`):
  - Integrated TerminalManager
  - Added IPC handlers for terminal operations
  - Set up event forwarding to renderer process
  
- **Preload Bridge** (`src/main/preload.ts`):
  - Exposed terminal API methods to renderer
  
- **Renderer Bridge** (`src/renderer/toolboxAPIBridge.js`):
  - Added terminal API for tool iframe access
  
- **Renderer Types** (`src/renderer/types.d.ts`):
  - Updated TypeScript definitions

### 4. User Interface (`src/renderer/`)
- **HTML** (`index.html`):
  - Added terminal panel with resizable height
  - Terminal tabs for multiple terminals
  - Show/hide toggle button in footer
  - Close button for individual terminals
  
- **CSS** (`styles.scss`):
  - Terminal panel styling (VS Code-inspired)
  - Dark and light theme support
  - Responsive resize handle
  - Terminal output formatting
  
- **JavaScript** (`renderer.ts`):
  - Terminal tab management
  - Real-time output display
  - Event handling for terminal lifecycle
  - Show/hide functionality
  - Resize handle implementation

### 5. Documentation
- **Terminal Usage Guide** (`docs/TERMINAL_USAGE.md`):
  - Complete API reference
  - Usage examples
  - Best practices
  - Platform-specific considerations
  - Troubleshooting guide
  
- **Interactive Example** (`docs/examples/terminal-example.html`):
  - Fully functional terminal demo tool
  - Shows all terminal API features
  - Ready-to-use for testing
  
- **Architecture Update** (`docs/ARCHITECTURE.md`):
  - Added terminal feature section
  - Explained integration points

## API Methods

Tools can use the following methods via `window.toolboxAPI`:

```typescript
// Create a terminal
createTerminal(toolId: string, options: TerminalOptions): Promise<Terminal>

// Execute a command
executeTerminalCommand(terminalId: string, command: string): Promise<TerminalCommandResult>

// Close a terminal
closeTerminal(terminalId: string): Promise<void>

// Get terminal information
getTerminal(terminalId: string): Promise<Terminal | undefined>
getToolTerminals(toolId: string): Promise<Terminal[]>
getAllTerminals(): Promise<Terminal[]>

// Control visibility
setTerminalVisibility(terminalId: string, visible: boolean): Promise<void>
```

## Events

The following events are emitted during terminal operations:

- `terminal:created` - When a terminal is created
- `terminal:closed` - When a terminal is closed
- `terminal:output` - When terminal produces output
- `terminal:command:completed` - When a command finishes execution
- `terminal:error` - When an error occurs

## Requirements Met

✅ Tools can create their own terminal  
✅ Commands can be sent to terminal from tools  
✅ Responses are sent back to tools (via events)  
✅ Completion events are sent even if full response cannot be transmitted  
✅ Each terminal is named with tool's short name  
✅ Tools can decide which shell to use  
✅ Fallback to default shell if specified shell doesn't exist  
✅ Terminal execution is visible to the user  
✅ User can show or hide the terminal panel

## Platform Support

### Windows
- Default shell: `cmd.exe`
- Supported shells: `cmd.exe`, `powershell.exe`
- Command format: Uses `\r\n` line endings

### Linux/macOS
- Default shell: Value of `$SHELL` environment variable (typically `/bin/bash`)
- Supported shells: `/bin/bash`, `/bin/sh`, `/bin/zsh`, `/bin/fish`, etc.
- Command format: Uses `\n` line endings

## Testing

To test the terminal feature:

1. Build the project: `npm run build`
2. Run the application: `npm start` or `npm run dev`
3. Install a tool that uses the terminal API
4. Or use the provided example: `docs/examples/terminal-example.html`

## Example Usage

```javascript
// Get tool context
const context = await window.toolboxAPI.getToolContext();

// Create a terminal
const terminal = await window.toolboxAPI.createTerminal(context.toolId, {
    name: 'My Tool Terminal',
    shell: '/bin/bash'  // Optional
});

// Execute a command
const result = await window.toolboxAPI.executeTerminalCommand(
    terminal.id,
    'npm install'
);

console.log('Output:', result.output);
console.log('Exit Code:', result.exitCode);

// Listen for events
window.toolboxAPI.onToolboxEvent((event, payload) => {
    if (payload.event === 'terminal:output') {
        console.log('Terminal output:', payload.data.data);
    }
});

// Close when done
await window.toolboxAPI.closeTerminal(terminal.id);
```

## Technical Details

### Shell Process Management
- Each terminal spawns a separate shell process
- Processes run in interactive mode
- Environment variables can be customized
- Working directory can be set
- Automatic cleanup on terminal close

### Command Execution
- Commands are queued and executed sequentially
- 5-second timeout per command (configurable)
- Output is captured from both stdout and stderr
- Exit codes are tracked when available

### Security Considerations
- Terminal processes are isolated per tool
- No direct filesystem access beyond shell capabilities
- Command execution is audited via events
- Tools cannot access terminals from other tools

## Future Enhancements

Potential improvements for future versions:

1. Command history and recall
2. Tab completion support
3. ANSI color code rendering
4. Input stream support for interactive commands
5. Terminal session persistence
6. Terminal multiplexing (split panes)
7. Custom keybindings
8. Copy/paste functionality in terminal UI

## Breaking Changes

None - this is a new feature that doesn't affect existing functionality.

## Migration Guide

No migration needed. Existing tools will continue to work without changes. Tools that want to use the terminal feature can start using the API immediately.
