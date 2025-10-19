# Terminal Usage Guide for Tool Developers

This guide explains how tools can create and use terminal instances in the Power Platform Tool Box.

## Overview

The Terminal API allows tools to:
- Create their own terminal instances with custom names
- Execute commands in the terminal
- Receive command output and completion events
- Choose which shell to use (with automatic fallback to system default)
- Show/hide terminal panels to the user

## Creating a Terminal

To create a terminal for your tool, use the `createTerminal` API:

```javascript
// Get the tool context to access your tool ID
const context = await window.toolboxAPI.getToolContext();

// Create a terminal with options
const terminal = await window.toolboxAPI.createTerminal(context.toolId, {
    name: 'My Tool Terminal',      // Required: Display name for the terminal tab
    shell: '/bin/bash',             // Optional: Preferred shell (e.g., '/bin/bash', 'powershell', 'cmd')
    cwd: '/path/to/working/dir',   // Optional: Working directory
    env: {                          // Optional: Environment variables
        MY_VAR: 'value'
    }
});

console.log('Terminal created:', terminal.id);
```

### Terminal Options

- **`name`** (required): The display name shown in the terminal tab
- **`shell`** (optional): Preferred shell path. If not available, falls back to system default
  - Windows: `cmd.exe`, `powershell.exe`, `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  - Linux/macOS: `/bin/bash`, `/bin/sh`, `/bin/zsh`
- **`cwd`** (optional): Working directory for the terminal. Defaults to current process directory
- **`env`** (optional): Additional environment variables for the terminal session

## Executing Commands

Once you have a terminal, you can execute commands and receive results:

```javascript
// Execute a command
const result = await window.toolboxAPI.executeTerminalCommand(terminal.id, 'ls -la');

console.log('Command output:', result.output);
console.log('Exit code:', result.exitCode);
console.log('Command ID:', result.commandId);
```

### Command Result

The command execution returns a `TerminalCommandResult` object:

```typescript
interface TerminalCommandResult {
    terminalId: string;      // ID of the terminal
    commandId: string;       // Unique ID for this command
    output?: string;         // Command output (stdout + stderr)
    exitCode?: number;       // Exit code (if command completed)
    error?: string;          // Error message (if command failed)
}
```

## Listening to Terminal Events

Tools can listen to terminal events to react to output and completion:

```javascript
// Listen for all toolbox events
window.toolboxAPI.onToolboxEvent((event, payload) => {
    switch(payload.event) {
        case 'terminal:created':
            console.log('Terminal created:', payload.data);
            break;
            
        case 'terminal:output':
            console.log('Terminal output:', payload.data.data);
            break;
            
        case 'terminal:command:completed':
            console.log('Command completed:', payload.data);
            break;
            
        case 'terminal:error':
            console.error('Terminal error:', payload.data.error);
            break;
            
        case 'terminal:closed':
            console.log('Terminal closed:', payload.data.terminalId);
            break;
    }
});
```

## Managing Terminal Visibility

You can programmatically show or hide the terminal panel:

```javascript
// Show terminal
await window.toolboxAPI.setTerminalVisibility(terminal.id, true);

// Hide terminal
await window.toolboxAPI.setTerminalVisibility(terminal.id, false);
```

## Retrieving Terminal Information

```javascript
// Get a specific terminal
const terminal = await window.toolboxAPI.getTerminal(terminalId);

// Get all terminals for your tool
const context = await window.toolboxAPI.getToolContext();
const terminals = await window.toolboxAPI.getToolTerminals(context.toolId);

// Get all terminals
const allTerminals = await window.toolboxAPI.getAllTerminals();
```

## Closing a Terminal

When you're done with a terminal, close it to free resources:

```javascript
await window.toolboxAPI.closeTerminal(terminal.id);
```

## Complete Example

Here's a complete example of a tool using the terminal API:

```javascript
// Initialize terminal when tool loads
async function initTerminal() {
    try {
        const context = await window.toolboxAPI.getToolContext();
        
        // Create terminal
        const terminal = await window.toolboxAPI.createTerminal(context.toolId, {
            name: 'PCF Builder',
            shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
            cwd: process.cwd()
        });
        
        // Listen for terminal events
        window.toolboxAPI.onToolboxEvent((event, payload) => {
            if (payload.event === 'terminal:output' && payload.data.terminalId === terminal.id) {
                updateUIWithOutput(payload.data.data);
            }
            
            if (payload.event === 'terminal:command:completed' && payload.data.terminalId === terminal.id) {
                onCommandCompleted(payload.data);
            }
        });
        
        // Execute a command
        const result = await window.toolboxAPI.executeTerminalCommand(
            terminal.id,
            'pac pcf init --namespace MyNamespace --name MyControl --template field'
        );
        
        console.log('PCF init result:', result);
        
        // Execute another command
        await window.toolboxAPI.executeTerminalCommand(
            terminal.id,
            'npm install'
        );
        
    } catch (error) {
        console.error('Failed to initialize terminal:', error);
    }
}

function updateUIWithOutput(output) {
    // Update your tool's UI with the terminal output
    const outputElement = document.getElementById('output');
    if (outputElement) {
        outputElement.textContent += output;
    }
}

function onCommandCompleted(result) {
    // Handle command completion
    console.log('Command completed with exit code:', result.exitCode);
}

// Call when tool loads
initTerminal();
```

## Best Practices

1. **Clean up terminals**: Always close terminals when your tool is unloaded or when they're no longer needed
2. **Use meaningful names**: Give terminals descriptive names that help users identify their purpose
3. **Handle errors**: Always handle errors when creating terminals or executing commands
4. **Choose appropriate shells**: Select shells that match your command requirements
5. **Provide feedback**: Use the terminal output events to keep users informed of progress
6. **Test cross-platform**: If your tool runs on multiple platforms, test terminal commands on each

## Platform-Specific Considerations

### Windows
- Default shell: `cmd.exe` or `C:\Windows\System32\cmd.exe`
- PowerShell: `powershell.exe` or full path
- Use `\r\n` for line endings in commands

### Linux/macOS
- Default shell: Value of `$SHELL` environment variable (usually `/bin/bash`)
- Alternative shells: `/bin/sh`, `/bin/zsh`, `/bin/fish`
- Use `\n` for line endings in commands

## Troubleshooting

### Shell not found
If your specified shell is not found, the terminal will automatically fall back to the system default shell. Check the terminal creation result for the actual shell being used.

### Commands not completing
Commands have a 5-second timeout. If your command takes longer, it will still return the output collected so far. For long-running commands, consider breaking them into smaller steps or using background execution.

### Output encoding issues
Terminal output is captured as UTF-8. If you're seeing encoding issues, ensure your shell and commands are using UTF-8 encoding.

## API Reference

For complete TypeScript type definitions, see:
- `packages/pptoolbox-types/index.d.ts` - Type definitions for the ToolBox API
- `src/types/index.ts` - Internal type definitions
