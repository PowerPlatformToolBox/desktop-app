# Context-Aware & Secure Storage Implementation

## Overview

This document describes the implementation of context-aware APIs and secure storage for the Power Platform Tool Box.

## Features Implemented

### 1. Encryption for Sensitive Data

**Location**: `src/main/managers/encryptionManager.ts`, `src/main/managers/settingsManager.ts`

#### What's Encrypted
- `clientId`
- `clientSecret`
- `accessToken`
- `refreshToken`
- `password` (username/password authentication)

#### How It Works
- Uses Electron's `safeStorage` API which leverages OS-native secure storage:
  - **macOS**: Keychain
  - **Windows**: DPAPI (Data Protection API)
  - **Linux**: libsecret
- Data is encrypted before being stored in electron-store
- Data is decrypted when retrieved from storage
- Automatic migration of existing plain-text data on first launch

#### API
```typescript
// EncryptionManager
const encryptionManager = new EncryptionManager();
const encrypted = encryptionManager.encrypt('plaintext');
const decrypted = encryptionManager.decrypt(encrypted);

// Encrypt multiple fields at once
const encryptedObj = encryptionManager.encryptFields(obj, ['field1', 'field2']);
const decryptedObj = encryptionManager.decryptFields(obj, ['field1', 'field2']);
```

### 2. Auto-Detect Tool ID from Iframe Context

**Location**: `src/renderer/toolboxAPIBridge.js`

#### How It Works
- When a tool iframe is loaded, the parent window sends a `TOOLBOX_CONTEXT` message
- The bridge automatically captures and stores the `toolId` from this message
- The stored `toolId` is then automatically injected into context-aware API calls

#### Code Example
```javascript
// In toolboxAPIBridge.js
window.addEventListener('message', function(event) {
    if (event.data.type === 'TOOLBOX_CONTEXT') {
        window.TOOLBOX_CONTEXT = event.data.data;
        // Auto-detect and store tool ID
        if (data.data && data.data.toolId) {
            currentToolId = data.data.toolId;
            console.log('ToolBox: Auto-detected tool ID:', currentToolId);
        }
    }
});
```

#### Benefits for Tool Developers
- No need to manually pass tool ID in API calls
- Cleaner, simpler code
- Automatic tool isolation

### 3. Remove AccessToken from Tool Context

**Location**: 
- `src/types/index.ts` (ToolContext interface)
- `src/main/managers/toolsManager.ts` (getToolContext)
- `src/renderer/renderer.ts` (tool loading)
- `src/renderer/toolboxAPIBridge.js` (getToolContext)

#### What Changed
- `ToolContext` interface no longer includes `accessToken` field
- Tools cannot access the raw access token
- Tools must use secure backend APIs (like `dataverseAPI`) instead

#### Before
```typescript
interface ToolContext {
  toolId: string;
  connectionUrl: string | null;
  accessToken: string | null; // ❌ Security risk
}
```

#### After
```typescript
interface ToolContext {
  toolId: string;
  connectionUrl: string | null;
  // accessToken removed for security
}
```

#### Security Benefits
- Tools cannot misuse access tokens
- Token leakage through tool code is prevented
- Better separation of concerns

### 4. Tool-Specific Terminals and Events

**Location**: 
- `src/renderer/toolboxAPIBridge.js` (terminal and events APIs)
- `src/renderer/renderer.ts` (context-aware API routing)
- `src/main/managers/terminalManager.ts` (event payloads)

#### Terminal Auto-Naming
Tools no longer need to specify terminal names. The terminal automatically uses the tool's name.

**Before (tool developer had to do this)**:
```javascript
// Tool code had to specify terminal name
await toolboxAPI.terminal.create({ 
    name: "My Tool Terminal",  // Manual naming
    shell: "/bin/bash" 
});
```

**After (automatic)**:
```javascript
// Terminal name auto-uses tool name
await toolboxAPI.terminal.create({ 
    shell: "/bin/bash" 
    // name is optional - defaults to tool name
});
```

#### Tool-Specific Terminal Listing
Each tool only sees its own terminals.

```javascript
// Returns only terminals created by this tool
const terminals = await toolboxAPI.terminal.list();
```

#### Tool-Specific Events
Events are automatically filtered to only show relevant events to each tool.

**Event Filtering Rules**:
- **Terminal events** (`terminal:created`, `terminal:output`, `terminal:closed`, etc.): Only shown if the terminal belongs to the tool
- **Tool events** (`tool:loaded`, `tool:unloaded`): Only shown if about the specific tool
- **Global events** (`connection:created`, `connection:updated`, `notification:shown`): Shown to all tools

```javascript
// Only receives events relevant to this tool
toolboxAPI.events.on((event, payload) => {
    console.log('Tool-specific event:', payload);
});

// Get event history filtered to this tool
const history = await toolboxAPI.events.getHistory(10);
```

## Migration Guide

### For Existing Connections
No action required. The first time the app runs with this update, existing connections will be automatically migrated from plain-text to encrypted storage.

### For Tool Developers

#### Terminal Creation
**Old way** (still works but deprecated):
```javascript
await window.toolboxAPI.createTerminal(toolId, { 
    name: "My Terminal" 
});
```

**New way** (recommended):
```javascript
await toolboxAPI.terminal.create({ 
    // name is optional - defaults to tool name
    // toolId is auto-detected
});
```

#### Getting Tool Context
**Old way**:
```javascript
const context = await toolboxAPI.getToolContext();
const accessToken = context.accessToken; // ❌ No longer available
```

**New way**:
```javascript
const context = await toolboxAPI.getToolContext();
const connectionUrl = context.connectionUrl;
// Use dataverseAPI instead of raw tokens
await dataverseAPI.retrieve('account', accountId);
```

## Testing Checklist

### Encryption
- [ ] Create a new connection - verify sensitive fields are encrypted in storage file
- [ ] Retrieve connection - verify fields are properly decrypted
- [ ] Update connection with new credentials - verify new values are encrypted
- [ ] Launch app with existing plain-text connections - verify automatic migration

### Tool Context
- [ ] Load a tool - verify TOOLBOX_CONTEXT message is received
- [ ] Check console for "Auto-detected tool ID" message
- [ ] Verify tool cannot access accessToken through getToolContext()

### Terminals
- [ ] Create terminal without specifying name - verify it uses tool name
- [ ] Create multiple terminals from different tools - verify each tool only sees its own
- [ ] Verify terminal events only go to the owning tool

### Events
- [ ] Trigger terminal event - verify only relevant tool receives it
- [ ] Create/update connection - verify all tools receive the global event
- [ ] Load/unload tool - verify only that specific tool receives its event

## Files Modified

### New Files
- `src/main/managers/encryptionManager.ts` - Encryption utility using safeStorage
- `docs/CONTEXT_AWARE_SECURE_STORAGE.md` - This documentation

### Modified Files
- `src/main/managers/settingsManager.ts` - Added encryption for connections
- `src/main/managers/toolsManager.ts` - Removed accessToken from getToolContext
- `src/main/managers/terminalManager.ts` - Added toolId to all terminal events
- `src/main/index.ts` - Updated getToolContext IPC handler
- `src/renderer/renderer.ts` - Added context-aware API routing for terminals and events
- `src/renderer/toolboxAPIBridge.js` - Auto-detect tool ID, context-aware APIs
- `src/types/index.ts` - Removed accessToken from ToolContext

## Security Considerations

1. **Encryption at Rest**: All sensitive credentials are now encrypted using OS-native secure storage
2. **No Token Exposure**: Tools can no longer access raw access tokens
3. **Tool Isolation**: Each tool can only access its own resources (terminals, events)
4. **Backwards Compatibility**: Automatic migration ensures existing data is preserved

## Performance Impact

- **Minimal**: Encryption/decryption operations are performed only during connection CRUD operations
- **No impact on tool runtime**: Tools don't access encrypted data during normal operation
- **Event filtering**: Performed in-memory, negligible performance cost

## Future Improvements

1. Add encryption for tool-specific settings
2. Implement secure key rotation
3. Add audit logging for sensitive data access
4. Extend context-awareness to other APIs (notifications, file operations, etc.)
