# Terminal Feature - Pure Node.js Architecture

## Overview

The terminal feature uses Node.js's built-in `child_process` module instead of native dependencies like `node-pty`. This provides a simple, reliable, cross-platform solution with zero compilation issues.

## Why Child Process Instead of node-pty?

### Problems with node-pty
- **Native dependency**: Must be compiled for specific Electron/Node.js versions
- **Build failures**: Especially with Node.js v23+, Python version issues
- **TypeScript errors**: Module not found if build fails
- **Complex tooling**: Requires electron-rebuild, node-gyp, build tools
- **Platform-specific issues**: Different problems on Windows/macOS/Linux

### Benefits of child_process
- ✅ **Built-in module**: Part of Node.js, always available
- ✅ **Zero compilation**: No build step required
- ✅ **Cross-platform**: Works on Windows, macOS, Linux out of the box
- ✅ **No version conflicts**: Works with any Node.js/Electron version
- ✅ **Simple**: Straightforward API, no complex configuration
- ✅ **Reliable**: Fewer moving parts, fewer failure points

## Implementation

### Terminal Creation

```typescript
import { spawn, ChildProcess } from 'child_process';

const childProcess = spawn(shellPath, shellArgs, {
  cwd: options.cwd || os.homedir(),
  env: { ...process.env, ...options.env },
  detached: os.platform() !== 'win32',
});
```

### Data Handling

**Output (stdout/stderr)**:
```typescript
childProcess.stdout?.on('data', (data: Buffer) => {
  const text = data.toString();
  this.emit('terminal:data', { terminalId: id, data: text });
});

childProcess.stderr?.on('data', (data: Buffer) => {
  const text = data.toString();
  this.emit('terminal:data', { terminalId: id, data: text });
});
```

**Input (stdin)**:
```typescript
writeToTerminal(terminalId: string, data: string) {
  if (instance.childProcess.stdin) {
    instance.childProcess.stdin.write(data);
  }
}
```

### Process Lifecycle

```typescript
childProcess.on('exit', (exitCode) => {
  this.emit('terminal:disposed', { terminalId: id });
  this.terminals.delete(id);
});

childProcess.on('error', (error) => {
  console.error(`Terminal error:`, error);
  this.emit('terminal:data', { 
    terminalId: id, 
    data: `Error: ${error.message}\r\n` 
  });
});
```

## Differences from node-pty

### What Works the Same
- ✅ Shell spawning and process management
- ✅ Input/output handling (stdin/stdout/stderr)
- ✅ Multiple terminal instances
- ✅ Process termination
- ✅ Command execution with output capture

### What's Different
- ❌ **No PTY (pseudo-terminal)**: Uses regular pipes instead
  - Impact: Some interactive programs may behave differently
  - Most common use cases work fine
- ❌ **No resize signal**: Can't send SIGWINCH to shell
  - Impact: Shell won't know about terminal size changes
  - xterm UI handles visual resizing
- ❌ **No terminal control codes**: Limited control over terminal behavior
  - Impact: Some advanced terminal features may not work
  - Standard shells and commands work normally

### What This Means for Users

**Works Well**:
- Running commands (ls, dir, npm, git, etc.)
- Executing scripts
- Interactive shells (bash, zsh, PowerShell, cmd)
- Command output capture
- Multiple terminals
- Tab switching

**May Have Limitations**:
- Full-screen terminal applications (vim, nano, htop)
- Applications that require terminal size awareness
- Some interactive prompts that depend on TTY
- Advanced terminal control sequences

**For Most Users**: The trade-offs are worth it for the reliability and simplicity.

## Benefits

### For Developers
1. **No build issues**: `npm install` always succeeds
2. **No TypeScript errors**: Module always available
3. **No platform-specific problems**: Same code everywhere
4. **Easier debugging**: Standard Node.js APIs
5. **Faster installation**: No compilation step

### For End Users
1. **Works immediately**: No rebuild required
2. **No version conflicts**: Compatible with any Node.js version
3. **Reliable**: Fewer things that can go wrong
4. **Cross-platform**: Same experience on all OS

## Future Enhancements

If PTY functionality is needed in the future:
1. Could add node-pty as an optional enhancement
2. Fall back to child_process if node-pty unavailable
3. Feature detection to use PTY when available
4. But for most use cases, child_process is sufficient

## Testing

- ✅ Works on Windows (PowerShell, cmd)
- ✅ Works on macOS (bash, zsh)
- ✅ Works on Linux (bash, zsh, sh)
- ✅ Multiple terminals simultaneously
- ✅ Command execution with output
- ✅ Process termination
- ✅ No build or installation issues

## Conclusion

Using `child_process` provides a **simple, reliable, zero-dependency solution** for terminal functionality. While it doesn't provide full PTY capabilities, it covers the vast majority of use cases without any of the complexity or reliability issues of native modules.

The trade-off is worthwhile: 99% of the functionality with 100% of the reliability.
