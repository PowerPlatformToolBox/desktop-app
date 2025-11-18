# Final Refactored Structure

## Folder Organization

```
src/
├── common/                          # Shared code between main and renderer
│   └── types/                       # Type definitions (shared)
│       ├── api.ts                   # API type interfaces
│       ├── common.ts                # Common types (CspExceptions, Theme, etc.)
│       ├── connection.ts            # Connection types + type guards
│       ├── dataverse.ts             # Dataverse API types
│       ├── events.ts                # Event types and enums
│       ├── index.ts                 # Re-exports all types
│       ├── settings.ts              # Settings types
│       ├── terminal.ts              # Terminal types + type guards
│       └── tool.ts                  # Tool types + type guards
│
├── main/                            # Main process code only
│   ├── constants.ts                 # Application constants
│   ├── index.ts                     # Main entry point
│   ├── preload.ts                   # Preload script for main window
│   ├── toolPreloadBridge.ts         # Preload bridge for tool windows
│   │
│   ├── ipc/                         # IPC infrastructure
│   │   ├── channels.ts              # Channel name constants (155+ channels)
│   │   └── utilities.ts             # IPC handler utilities
│   │
│   ├── managers/                    # Business logic managers
│   │   ├── authManager.ts           # Authentication
│   │   ├── autoUpdateManager.ts     # Auto-updates
│   │   ├── browserviewProtocolManager.ts  # Custom protocol (renamed)
│   │   ├── connectionsManager.ts    # Connection management
│   │   ├── dataverseManager.ts      # Dataverse operations
│   │   ├── encryptionManager.ts     # Encryption utilities
│   │   ├── notificationWindowManager.ts  # Notifications
│   │   ├── settingsManager.ts       # Settings persistence
│   │   ├── terminalManager.ts       # Terminal management
│   │   ├── toolboxUtilityManager.ts # Utility manager
│   │   ├── toolRegistryManager.ts   # Tool registry
│   │   ├── toolsManager.ts          # Tool lifecycle
│   │   └── toolWindowManager.ts     # Tool window management
│   │
│   └── utilities/                   # Utility functions
│       ├── clipboard.ts             # Clipboard operations
│       ├── filesystem.ts            # File operations
│       ├── theme.ts                 # Theme utilities
│       └── index.ts                 # Re-exports
│
└── renderer/                        # Renderer process code only
    ├── index.html                   # Main UI HTML
    ├── renderer.ts                  # UI logic (uses -pptb CSS classes)
    ├── toolboxAPIBridge.js          # API bridge for tools in iframes
    ├── types.d.ts                   # Renderer-specific type extensions
    ├── styles.scss                  # Main styles (uses -pptb CSS classes)
    │
    ├── icons/                       # UI icons
    │   ├── dark/                    # Dark theme icons
    │   └── light/                   # Light theme icons
    │
    └── styles/                      # Style modules
        ├── _mixins.scss             # SCSS mixins
        ├── _variables.scss          # SCSS variables
        └── README.md                # Styles documentation
```

## Key Changes from Original

### 1. Type Organization
**Before:** All types in single `src/types/index.ts` file
**After:** Domain-organized types in `src/common/types/` with:
- Separate files per domain (tool, connection, terminal, etc.)
- Type guards for runtime validation
- Strongly-typed API interfaces
- Re-exported via index.ts for convenience

### 2. IPC Infrastructure
**Before:** Hardcoded channel strings throughout codebase
**After:** Centralized in `src/main/ipc/channels.ts`:
- 155+ channel constants organized by domain
- Type-safe channel references
- Reusable handler utilities

### 3. Utilities
**Before:** Inline implementations scattered across files
**After:** Organized modules in `src/main/utilities/`:
- clipboard.ts - Clipboard operations
- filesystem.ts - File dialogs and operations
- theme.ts - Theme resolution

### 4. Branding
**Before:** VSCode references and `-vscode` CSS classes
**After:** PPTB branding throughout:
- `webviewProtocolManager` → `browserviewProtocolManager`
- All `-vscode` CSS classes → `-pptb`
- 35+ CSS class renames
- Updated comments and documentation

### 5. Folder Structure
**Before:** Mixed organization with `src/api/`, `src/types/` at root
**After:** Clear separation:
- `src/common/` - Shared between main and renderer
- `src/main/` - Main process only
- `src/renderer/` - Renderer process only

## Import Patterns

### Importing Types
```typescript
// From main process
import { Tool, DataverseConnection } from "../../common/types";

// From renderer process
import { ToolboxAPI, ToolContext } from "../common/types";

// Or import specific domains
import { Tool } from "../common/types/tool";
import { Theme } from "../common/types/common";
```

### Importing IPC Channels
```typescript
import { SETTINGS_CHANNELS, TOOL_CHANNELS } from "./ipc/channels";

// Usage
ipcMain.handle(SETTINGS_CHANNELS.GET_USER_SETTINGS, ...);
```

### Importing Utilities
```typescript
import { copyToClipboard, saveFile, resolveTheme } from "./utilities";

// Or import specific modules
import { copyToClipboard } from "./utilities/clipboard";
```

## CSS Classes

All UI components now use `-pptb` suffix instead of `-vscode`:

### Tool Items
- `.tool-item-pptb`
- `.tool-item-header-pptb`
- `.tool-item-icon-pptb`
- `.tool-item-name-pptb`
- `.tool-item-description-pptb`
- `.tool-item-version-pptb`
- `.tool-item-actions-pptb`

### Connection Items
- `.connection-item-pptb`
- `.connection-item-header-pptb`
- `.connection-item-name-pptb`
- `.connection-item-url-pptb`
- `.connection-item-actions-pptb`

### Marketplace Items
- `.marketplace-item-pptb`
- `.marketplace-item-header-pptb`
- `.marketplace-item-icon-pptb`
- `.marketplace-item-info-pptb`
- `.marketplace-item-name-pptb`
- `.marketplace-item-author-pptb`
- `.marketplace-item-description-pptb`
- `.marketplace-item-footer-pptb`
- `.marketplace-item-category-pptb`
- `.marketplace-item-actions-pptb`

## Files and Purposes

### Core Files

| File | Purpose | Location |
|------|---------|----------|
| toolboxAPIBridge.js | API bridge for tools in iframes | src/renderer/ |
| preload.ts | Main window preload script | src/main/ |
| toolPreloadBridge.ts | Tool window preload bridge | src/main/ |
| index.ts | Main app entry point | src/main/ |
| renderer.ts | UI logic and event handlers | src/renderer/ |

### Why toolboxAPIBridge.js?

This file is **required** for the tool execution system. It:
- Runs inside tool iframes
- Exposes `window.toolboxAPI` to tools
- Proxies calls to parent window via postMessage
- Provides security isolation for tools
- Cannot be removed without breaking tool functionality

## Build & Test Status

✅ **Build:** Passing
✅ **TypeCheck:** Passing
✅ **Lint:** 0 errors, 73 warnings (expected)
✅ **CodeQL:** 0 security alerts
✅ **Backward Compatibility:** Maintained

## Migration Impact

**Zero Breaking Changes:**
- All existing APIs work as before
- Internal reorganization only
- Types still accessible via index re-exports
- Build process unchanged
- Tool execution unaffected
