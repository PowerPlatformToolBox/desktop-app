# Terminal Feature - Optional Architecture

## Problem

The terminal feature initially required `node-pty`, a native Node.js module that:
- Must be compiled for the specific Electron/Node.js version
- Fails to build with Node.js v23+ 
- Causes TypeScript compilation errors if not available
- Prevented the app from starting if the module failed to load

## Solution

Redesigned the terminal feature to be **fully optional and non-breaking**:

### 1. Optional Dependency
- Moved `node-pty` from `dependencies` to `optionalDependencies` in package.json
- npm install will succeed even if `node-pty` fails to build
- Other app features remain unaffected

### 2. Graceful Degradation
- Terminal module uses dynamic `require()` with try-catch
- If `node-pty` fails to load, terminal features are disabled but logged
- App continues to function normally without terminal

### 3. Runtime Availability Checks
- Added `isTerminalAvailable()` method to check if terminal can be used
- IPC handler `terminal:is-available` returns availability status
- Frontend checks availability before showing terminal UI

### 4. User Experience
- Terminal toggle button is hidden if terminal unavailable
- Clear error messages guide users to run `npm run rebuild`
- No cryptic TypeScript errors or app crashes

## Architecture Changes

### Backend (TerminalManager)
```typescript
// Dynamic import with error handling
let pty: typeof import('node-pty') | null = null;
try {
  pty = require('node-pty');
} catch (error) {
  console.warn('node-pty not available. Terminal disabled.');
}

// Availability checks
isTerminalAvailable(): boolean {
  return pty !== null;
}

createTerminal(options): Terminal {
  if (!this.isAvailable || !pty) {
    throw new Error('Terminal not available. Run: npm run rebuild');
  }
  // ... terminal creation
}
```

### Frontend (Terminal UI)
```typescript
async initialize() {
  this.isAvailable = await window.toolboxAPI.isTerminalAvailable();
  
  if (!this.isAvailable) {
    this.disableTerminalUI();
    return;
  }
  // ... normal initialization
}

private disableTerminalUI() {
  // Hide terminal button
  // Show helpful message in console
}
```

### IPC Handlers
```typescript
ipcMain.handle("terminal:is-available", () => {
  return this.terminalManager.isTerminalAvailable();
});

ipcMain.handle("terminal:create", (_, options) => {
  if (!this.terminalManager.isTerminalAvailable()) {
    throw new Error('Terminal not available. Run: npm run rebuild');
  }
  return this.terminalManager.createTerminal(options);
});
```

## Benefits

1. **No Build Failures**: App installs and builds successfully even without node-pty
2. **No Runtime Crashes**: App starts and runs normally without terminal features
3. **Clear User Guidance**: Users know exactly what to do to enable terminal
4. **Better Developer Experience**: No confusing TypeScript errors
5. **Backward Compatible**: Existing functionality unaffected

## Enabling Terminal Features

After installation, if terminal is disabled:

```bash
npm run rebuild
```

Then restart the app. The terminal feature will be available.

## Future Considerations

- Could add a settings panel to check terminal status
- Could show an in-app notification about running rebuild
- Could attempt auto-rebuild on first app start
- Alternative: Explore terminal implementations that don't require native modules

## Testing

- ✅ App builds with node-pty present
- ✅ App builds without node-pty (TypeScript compiles)
- ✅ App runs with node-pty unavailable (terminal disabled)
- ✅ App runs with node-pty available (terminal works)
- ✅ Clear error messages when attempting to use disabled terminal
- ✅ No UI elements shown for disabled terminal
