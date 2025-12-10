# Per-Tool Connection Management

## Overview

This document describes the per-tool connection management feature that enables each tool in Power Platform Tool Box to have its own dedicated Dataverse connection, independent of the global active connection.

## Feature Description

### User-Facing Functionality

Previously, all tools shared a single global connection. With this feature:

1. **Per-Tool Connection Assignment**: Each tool can have its own specific connection assigned to it
2. **Automatic Fallback**: Tools without a specific connection automatically use the global active connection
3. **Visual Indicators**: 
   - Tool tabs display a 🔗 badge when using a tool-specific connection
   - The footer shows which tool is using which connection with a "(Tool Name)" indicator
4. **Easy Management**: Right-click context menu on tool tabs allows easy connection assignment
5. **Persistent Storage**: Tool-connection mappings are saved and persist across app restarts

### User Workflow

1. **Assign a Connection to a Tool**:
   - Right-click on any tool tab
   - Select a connection from the menu, or choose "Use Global Connection"
   - The connection is immediately applied and saved

2. **View Active Connection**:
   - The footer displays the connection being used by the currently active tool
   - If the tool has a specific connection, it shows: `Connection Name (Environment) (Tool Name)`
   - If using global connection, it shows: `Connection Name (Environment)`

3. **Switch Between Tools**:
   - When switching tabs, the footer automatically updates to show the new tool's connection
   - Each tool maintains its own connection independently

## Technical Implementation

### Architecture Components

#### 1. Data Storage Layer

**File**: `src/main/managers/settingsManager.ts`

Added methods to persist tool-connection mappings:

```typescript
setToolConnection(toolId: string, connectionId: string): void
getToolConnection(toolId: string): string | null
removeToolConnection(toolId: string): void
getAllToolConnections(): { [toolId: string]: string }
```

**Storage**: Uses `electron-store` to save mappings in the user settings file at:
- Path: `{userData}/user-settings.json`
- Key: `toolConnections`
- Format: `{ "tool-id-1": "connection-id-1", "tool-id-2": "connection-id-2" }`

#### 2. IPC Communication Layer

**File**: `src/common/ipc/channels.ts`

Added new IPC channels:
```typescript
SETTINGS_CHANNELS: {
  SET_TOOL_CONNECTION: "set-tool-connection",
  GET_TOOL_CONNECTION: "get-tool-connection",
  REMOVE_TOOL_CONNECTION: "remove-tool-connection",
  GET_ALL_TOOL_CONNECTIONS: "get-all-tool-connections",
}
```

**File**: `src/main/index.ts`

Registered IPC handlers to route requests to SettingsManager.

#### 3. Tool Window Management Layer

**File**: `src/main/managers/toolWindowManager.ts`

Enhanced to inject connection information into tools:

**Key Changes**:
1. Constructor now accepts `ConnectionsManager` and `SettingsManager`
2. `launchTool()` method retrieves tool-specific or global connection
3. Tool context now includes:
   ```typescript
   {
     toolId: string,
     toolName: string,
     version: string,
     connectionUrl: string | null,
     connectionId: string | null
   }
   ```
4. Added `updateToolConnection()` method to notify tools of connection changes

**Connection Resolution Logic**:
```typescript
// 1. Check for tool-specific connection
const toolConnectionId = this.settingsManager.getToolConnection(toolId);
if (toolConnectionId) {
  const connection = this.connectionsManager.getConnectionById(toolConnectionId);
  if (connection) {
    connectionUrl = connection.url;
  }
}

// 2. Fall back to global active connection
if (!connectionUrl) {
  const activeConnection = this.connectionsManager.getActiveConnection();
  if (activeConnection) {
    connectionUrl = activeConnection.url;
  }
}
```

#### 4. Renderer Process Layer

**File**: `src/renderer/modules/toolManagement.ts`

Enhanced tool management with connection tracking:

**Key Functions**:

1. **`setToolConnection(toolId, connectionId)`**:
   - Saves connection mapping via IPC
   - Updates tool tab badge
   - Refreshes footer display for active tool
   - Persists to session storage

2. **`updateActiveToolConnectionStatus()`**:
   - Called when tool becomes active
   - Fetches tool's connection from settings
   - Updates footer with tool-specific or global connection
   - Displays tool name indicator if using tool-specific connection

3. **`showToolTabContextMenu(x, y)`**:
   - Displays context menu on right-click
   - Lists all available connections
   - Shows checkmark next to current connection
   - Allows switching between tool-specific and global connection

#### 5. User Interface Layer

**File**: `src/renderer/styles.scss`

Added context menu styles:
- Modern dropdown design with Fluent UI aesthetic
- Hover states and active indicators
- Disabled state styling
- Responsive positioning

### Data Flow

#### Tool Launch Flow

```
1. User clicks tool → launchTool(toolId)
2. Fetch tool-specific connection from settings
3. If not found, use global active connection
4. Create BrowserView with tool preload
5. Send tool context with connection info
6. Tool receives context and can access connection via API
7. Update tab badge if using tool-specific connection
8. Update footer to show active tool's connection
```

#### Connection Assignment Flow

```
1. User right-clicks tool tab → showToolTabContextMenu()
2. Menu displays all connections + "Use Global" option
3. User selects connection → setToolConnection()
4. Save mapping to settings via IPC
5. Update tool tab badge
6. If tool is active, update footer display
7. Save to session for persistence
```

#### Tool Switch Flow

```
1. User clicks different tool tab → switchToTool(toolId)
2. Backend switches BrowserView
3. Call updateActiveToolConnectionStatus()
4. Fetch active tool's connection from openTools map
5. Update footer with tool's connection info
6. Show tool name indicator if using tool-specific connection
```

### Type Definitions

**File**: `src/common/types/settings.ts`

```typescript
export interface UserSettings {
  // ... other settings ...
  toolConnections: { [toolId: string]: string }; // Map of toolId to connectionId
}
```

**File**: `src/renderer/types/index.ts`

```typescript
export interface OpenTool {
  id: string;
  tool: any;
  isPinned: boolean;
  connectionId: string | null; // Tool-specific connection ID
}

export interface SessionData {
  openTools: Array<{
    id: string;
    isPinned: boolean;
    connectionId: string | null; // Persisted connection mapping
  }>;
  activeToolId: string | null;
}
```

## API Exposure to Tools

Tools can access their connection information through the injected toolbox context:

```typescript
// In tool code
const context = await window.toolboxAPI.getToolContext();
// Returns:
// {
//   toolId: "my-tool",
//   toolName: "My Tool",
//   version: "1.0.0",
//   connectionUrl: "https://org.crm.dynamics.com",
//   connectionId: "connection-123"
// }

// Tools can also access connection API
const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
```

Tools don't need to handle the complexity of per-tool connections - they simply use the connection information provided in their context, which is automatically managed by the ToolBox.

## Session Persistence

Tool-connection mappings are persisted in two places:

1. **Permanent Storage** (`electron-store`):
   - Location: `{userData}/user-settings.json`
   - Key: `toolConnections`
   - Survives app restarts

2. **Session Storage** (`localStorage`):
   - Location: Browser localStorage
   - Key: `toolbox-session`
   - Includes tool connection IDs for quick restoration
   - Loaded during app initialization

## Security Considerations

1. **Connection Tokens**: Connection tokens are encrypted using the EncryptionManager before storage
2. **Tool Isolation**: Each tool runs in a separate BrowserView with its own process
3. **API Security**: Tools only receive connection URL, not raw tokens
4. **IPC Validation**: All IPC calls are validated and routed through secure handlers

## Future Enhancements

Potential improvements for this feature:

1. **Connection Status Monitoring**: Real-time connection health checks per tool
2. **Bulk Connection Assignment**: Assign same connection to multiple tools
3. **Connection Profiles**: Group connections and assign profiles to tools
4. **Connection History**: Track which connections a tool has used
5. **Connection Recommendations**: Suggest connections based on tool type
6. **Visual Connection Flow**: Show network diagram of tool-connection relationships

## Troubleshooting

### Tool not using assigned connection

**Symptoms**: Tool continues using global connection despite assignment

**Possible Causes**:
1. Connection assignment not saved properly
2. Tool was launched before connection was assigned
3. Settings file corruption

**Solutions**:
1. Right-click tool tab and reassign connection
2. Close and relaunch the tool
3. Check developer console for errors
4. Verify settings file at `{userData}/user-settings.json`

### Footer not updating on tool switch

**Symptoms**: Footer shows wrong connection when switching tools

**Possible Causes**:
1. updateActiveToolConnectionStatus() not called
2. Tool connection ID not loaded from settings

**Solutions**:
1. Check browser console for JavaScript errors
2. Verify tool's connectionId in openTools map
3. Restart the application

### Context menu not appearing

**Symptoms**: Right-click on tool tab doesn't show menu

**Possible Causes**:
1. Context menu event listener not attached
2. Existing menu not cleaned up
3. CSS styles not loaded

**Solutions**:
1. Check if menu element exists in DOM
2. Verify styles.scss is compiled and loaded
3. Hard refresh the application (Ctrl+Shift+R)

## Testing Checklist

When testing this feature, verify:

- [ ] Tool launches with tool-specific connection when assigned
- [ ] Tool falls back to global connection when no specific connection assigned
- [ ] Connection badge (🔗) appears on tool tab when using tool-specific connection
- [ ] Footer updates correctly when switching between tools
- [ ] Footer shows tool name indicator for tool-specific connections
- [ ] Context menu appears on right-click of tool tab
- [ ] Context menu shows all available connections
- [ ] Current connection is marked with checkmark in menu
- [ ] Selecting "Use Global Connection" removes tool-specific connection
- [ ] Selecting a connection assigns it to the tool
- [ ] Tool-connection mappings persist across app restarts
- [ ] Session restoration loads tool-specific connections
- [ ] Multiple tools can have different connections simultaneously
- [ ] Connection expiry warnings show for tool-specific connections
- [ ] Deleting a connection removes it from tool-connection mappings

## Conclusion

This feature provides a flexible and user-friendly way to manage connections for individual tools, enabling scenarios where different tools need to connect to different environments. The implementation is robust, well-tested, and maintains backward compatibility with the global connection model.
