# Power Platform Tool Box Architecture

## Overview

Power Platform Tool Box is an Electron-based desktop application built with TypeScript. It follows a modular architecture with clear separation between the main process, renderer process, and API layers.

## Technology Stack

-   **Electron**: Cross-platform desktop application framework (v28)
-   **TypeScript**: Type-safe JavaScript (v5.9.3 with ES2022 target, strict mode)
-   **Vite**: Modern build tool and dev server (v7.1.11)
-   **pnpm**: Fast, disk space efficient package manager (v10.18.3+)
-   **Sass/SCSS**: CSS preprocessor for modular styling
-   **electron-store**: Persistent settings storage with encryption (v8.2.0)
-   **electron-updater**: Automatic application updates (v6.6.2)
-   **@azure/msal-node**: Microsoft Authentication Library for OAuth flows (v3.8.0)
-   **@fluentui/tokens**: Fluent UI design tokens for consistent styling (v1.0.0-alpha.22)
-   **@fluentui/svg-icons**: Fluent UI System Icons (v1.1.312)
-   **Node.js**: Runtime environment (v18+, tested with v20.19.5)

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                      Power Platform Tool Box                          │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐         ┌──────────────────────────┐          │
│  │  Renderer Process│◄────────┤  IPC Communication       │          │
│  │                  │         │  (contextBridge)         │          │
│  │  - UI (HTML)     │─────────►                          │          │
│  │  - SCSS Styles   │         └──────────────────────────┘          │
│  │  - TypeScript    │                    │                           │
│  │  - Tool Iframes  │                    ▼                           │
│  └──────────────────┘         ┌────────────────────────┐            │
│                                │   Main Process         │            │
│                                │                        │            │
│                                │  ┌──────────────────┐  │            │
│  ┌──────────────┐              │  │   ToolBoxApp    │  │            │
│  │ ToolBox API  │◄─────────────┤  │   Coordinator   │  │            │
│  │              │              │  └────────┬─────────┘  │            │
│  │ - Events     │              │           │            │            │
│  │ - Notif.     │              │  ┌────────▼─────────┐  │            │
│  └──────────────┘              │  │    Managers      │  │            │
│                                │  │                  │  │            │
│  ┌──────────────┐              │  │ - Settings      │  │            │
│  │  Tool (npm)  │◄─────────────┤  │ - Connections   │  │            │
│  │  - activate()│              │  │ - Tools         │  │            │
│  │  - API calls │              │  │ - Auth (MSAL)   │  │            │
│  │  - Isolated  │              │  │ - Dataverse API │  │            │
│  └──────────────┘              │  │ - Terminal      │  │            │
│                                │  │ - AutoUpdate    │  │            │
│                                │  │ - Encryption    │  │            │
│                                │  └──────────────────┘  │            │
│                                └────────────────────────┘            │
│                                           │                           │
│                                           ▼                           │
│                                ┌────────────────────┐                │
│                                │   Secure Storage   │                │
│                                │                    │                │
│                                │ - Encrypted Tokens │                │
│                                │ - Settings (JSON)  │                │
│                                │ - Tool Storage     │                │
│                                │ - OS Keychain      │                │
│                                └────────────────────┘                │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Main Process (`src/main/`)

The main process is the entry point of the Electron application and manages the application lifecycle.

#### `index.ts`

-   **Purpose**: Main application entry point
-   **Responsibilities**:
    -   Initialize Electron app
    -   Create application window
    -   Set up IPC handlers
    -   Coordinate between managers

#### Managers (`src/main/managers/`)

##### `settingsManager.ts`

-   **Purpose**: Manage application settings
-   **Responsibilities**:
    -   User settings (theme, language, auto-update)
    -   Persistent storage using electron-store
    -   Integration with encryption for sensitive data

##### `connectionsManager.ts`

-   **Purpose**: Manage Dataverse connections
-   **Responsibilities**:
    -   CRUD operations for connections
    -   Active connection management
    -   Encrypted storage of credentials (clientId, clientSecret, tokens)
    -   Connection validation and testing

##### `toolsManager.ts`

-   **Purpose**: Manage external tools
-   **Responsibilities**:
    -   Load/unload tools
    -   Install tools from registry (primary method)
    -   Install/uninstall tools via npm/pnpm (legacy, deprecated)
    -   Track loaded tools
    -   Parse contribution points from package.json
    -   Emit tool lifecycle events
    -   Provide tool context (without exposing access tokens)
    -   Manage tool manifests and metadata

##### `toolRegistryManager.ts`

-   **Purpose**: Manage tool registry and downloads
-   **Responsibilities**:
    -   Fetch tool registry from server (VS Code marketplace style)
    -   Download tools as pre-built archives via HTTP/HTTPS
    -   Extract and cache tools locally
    -   Manage tool manifests (installation tracking)
    -   Check for tool updates
    -   Handle tool versioning
    -   No npm/pnpm dependency required

##### `authManager.ts`

-   **Purpose**: Manage authentication and authorization
-   **Responsibilities**:
    -   Handle OAuth flows with Azure AD
    -   Manage access tokens for Dataverse connections
    -   MSAL integration for secure authentication
    -   Token refresh and caching
    -   Username/password authentication support

##### `dataverseManager.ts`

-   **Purpose**: Manage Dataverse Web API operations
-   **Responsibilities**:
    -   CRUD operations (create, retrieve, update, delete)
    -   FetchXML query execution
    -   Entity metadata retrieval
    -   Execute actions and functions
    -   Automatic token management and refresh
    -   HTTP client for Dataverse Web API
    -   OData v4.0 compliant requests
    -   Entity set name conversion (singular to plural)

##### `encryptionManager.ts`

-   **Purpose**: Handle encryption of sensitive data
-   **Responsibilities**:
    -   Encrypt/decrypt using OS-native secure storage (Keychain, DPAPI, libsecret)
    -   Encrypt connection credentials (clientId, clientSecret, tokens)
    -   Automatic migration of plain-text data
    -   Field-level encryption utilities

##### `terminalManager.ts`

-   **Purpose**: Manage terminal instances for tools
-   **Responsibilities**:
    -   Create and manage terminal instances
    -   Execute shell commands
    -   Stream command output
    -   Handle multiple shell types (bash, zsh, powershell, cmd)
    -   Emit terminal events (created, output, completed, error)
    -   Context-aware terminal isolation per tool

##### `autoUpdateManager.ts`

-   **Purpose**: Manage application auto-updates
-   **Responsibilities**:
    -   Check for updates using electron-updater
    -   Download and install updates
    -   Notify users of available updates
    -   Periodic update checks (configurable interval)
    -   User control over update installation

#### `preload.ts`

-   **Purpose**: Secure bridge between main and renderer
-   **Responsibilities**:
    -   Expose safe APIs to renderer via contextBridge
    -   IPC communication wrapper
    -   Security isolation
    -   Expose toolbox API methods to renderer
    -   Expose dataverse API methods to renderer

### 2. Renderer Process (`src/renderer/`)

The renderer process handles the UI and user interactions.

#### `index.html`

-   **Purpose**: Application UI structure
-   **Features**:
    -   Multi-panel layout (Tools, Connections, Settings, Terminal)
    -   Modal dialogs for tool installation and connections
    -   Modern, responsive design
    -   Tool iframes for isolated execution
    -   Terminal panel with tabs

#### `styles.scss` and `styles/`

-   **Purpose**: Application styling with SCSS
-   **Features**:
    -   Modular SCSS architecture with variables and mixins
    -   Fluent UI design tokens integration
    -   CSS custom properties for theming
    -   Responsive grid layouts
    -   Clean, professional appearance
    -   **`_variables.scss`**: SCSS variables (colors, spacing, typography)
    -   **`_mixins.scss`**: Reusable SCSS mixins

#### `renderer.ts`

-   **Purpose**: UI logic and interactions
-   **Responsibilities**:
    -   Handle user interactions
    -   Communicate with main process via IPC
    -   Update UI based on state changes
    -   Manage modal dialogs
    -   Load tools in iframes
    -   Context-aware API message routing
    -   Terminal UI management
    -   Tool context injection

#### `toolboxAPIBridge.js`

-   **Purpose**: API bridge for tools running in iframes
-   **Responsibilities**:
    -   Expose `toolboxAPI` object to tools
    -   Expose `dataverseAPI` object to tools
    -   Handle postMessage communication
    -   Auto-detect tool ID from context
    -   Context-aware API calls (terminals, events)
    -   Filter events relevant to specific tool

### 3. API Layer (`src/api/`)

#### `toolboxAPI.ts`

-   **Purpose**: Event-driven API for tools and application
-   **Responsibilities**:
    -   Event emission and subscription
    -   Notification system
    -   Event history tracking
    -   Communication hub for tools
    -   Event types: tool lifecycle, connections, terminals, settings, notifications

### 4. Type Definitions (`src/types/`)

#### `index.ts`

-   **Purpose**: TypeScript type definitions
-   **Contents**:
    -   Tool interface with contribution points
    -   Contribution point types (commands, menus, views, configuration)
    -   Settings interfaces
    -   Connection interfaces
    -   Event types and payloads
    -   Notification options
    -   Terminal types
    -   Tool context (without access token)

### 5. Type Definitions Package (`packages/`)

Separate npm package for tool developers with TypeScript type definitions.

#### `toolboxAPI.d.ts`

-   **Purpose**: TypeScript definitions for toolbox API
-   **Contents**:
    -   Utils API (notifications, clipboard, file operations, theme)
    -   Terminal API (create, execute, close, list, visibility)
    -   Events API (on, off, getHistory)
    -   Connections API (getActiveConnection)

#### `dataverseAPI.d.ts`

-   **Purpose**: TypeScript definitions for Dataverse API
-   **Contents**:
    -   CRUD operations (create, retrieve, update, delete)
    -   Query operations (fetchXmlQuery, retrieveMultiple)
    -   Metadata operations (getEntityMetadata, getAllEntitiesMetadata)
    -   Execute operations (actions and functions)

#### `index.d.ts`

-   **Purpose**: Main export for all type definitions
-   **Exports**: Both toolboxAPI and dataverseAPI types

## Data Flow

### Tool Installation Flow

```
User clicks "Install Tool"
    ↓
Renderer opens modal
    ↓
User enters package name
    ↓
Renderer → IPC → Main Process
    ↓
Tool Manager installs via pnpm (--dir flag for isolation)
    ↓
Tool Manager loads the tool
    ↓
Event emitted: tool:loaded
    ↓
ToolBox API broadcasts event
    ↓
Renderer updates UI
```

### Connection Creation Flow

```
User clicks "Add Connection"
    ↓
Renderer opens modal
    ↓
User enters connection details
    ↓
Renderer → IPC → Main Process
    ↓
Connections Manager saves connection
    ↓
Encryption Manager encrypts sensitive fields (clientId, clientSecret, tokens)
    ↓
Event emitted: connection:created
    ↓
ToolBox API broadcasts event
    ↓
Renderer updates UI
```

### Context-Aware Tool API Flow

```
Tool (iframe) calls API
    ↓
toolboxAPIBridge.js auto-injects tool ID
    ↓
postMessage → Renderer Process
    ↓
Renderer routes based on tool context
    ↓
IPC → Main Process
    ↓
Manager executes with tool context
    ↓
Response → IPC → Renderer
    ↓
postMessage → Tool iframe
    ↓
Promise resolves in tool
```

## Security Model

### Tool Isolation Architecture

Power Platform Tool Box implements a **secure iframe-based architecture** for tool execution:

#### Isolated Execution

-   Each tool runs in a separate iframe with limited API access
-   Tools cannot directly access the main application or other tools
-   Iframe isolation prevents memory leaks and crashes from affecting the main app
-   Tools only have access to explicitly exposed APIs

#### Structured postMessage Protocol

-   All tool communication uses window.postMessage
-   Messages are validated for structure and content
-   Request/response pattern with unique message IDs
-   Context-aware message routing with automatic tool ID injection

#### API Injection

-   Tools access `toolboxAPI` and `dataverseAPI` objects injected into iframe
-   The APIs are provided by `toolboxAPIBridge.js`
-   Tools only have access to the specific APIs exposed by ToolBox
-   No direct access to Node.js, Electron APIs, or other sensitive modules

#### Context-Aware APIs

-   **Tool ID Auto-Detection**: Tools don't need to manually specify their ID
-   **Terminal Isolation**: Each tool only sees its own terminals
-   **Event Filtering**: Tools only receive events relevant to them
-   **No Token Exposure**: Tools cannot access raw access tokens

#### Message Flow Example

```
Tool (iframe)              toolboxAPIBridge.js         Renderer Process          Main Process
    |                              |                          |                        |
    |--dataverseAPI.retrieve()---->|                          |                        |
    |                              |--postMessage(with ID)--->|                        |
    |                              |                          |--IPC(invoke)---------->|
    |                              |                          |                        |--HTTP-->Dataverse
    |                              |                          |<---IPC(response)-------|
    |                              |<--postMessage------------|                        |
    |<--promise resolved-----------|                          |                        |
```

### Encryption & Secure Storage

#### OS-Native Encryption

-   Uses Electron's `safeStorage` API for encryption
-   **macOS**: Keychain
-   **Windows**: DPAPI (Data Protection API)
-   **Linux**: libsecret

#### Encrypted Fields

-   `clientId` - OAuth client identifier
-   `clientSecret` - OAuth client secret
-   `accessToken` - Dataverse access token
-   `refreshToken` - Token refresh credentials
-   `password` - Username/password authentication

#### Automatic Migration

-   Existing plain-text connections are automatically encrypted on first launch
-   No user intervention required
-   Backwards compatible with older versions

### Tool Integration

Tools declare their capabilities in `package.json`:

#### Basic Tool Structure

```json
{
    "name": "my-tool",
    "version": "1.0.0",
    "main": "index.html",
    "pptoolbox": {
        "displayName": "My Tool",
        "description": "A tool for Power Platform",
        "icon": "icon.png"
    }
}
```

#### Tool Entry Point

Tools are loaded as HTML pages in iframes with access to `toolboxAPI` and `dataverseAPI`:

```html
<!DOCTYPE html>
<html>
    <head>
        <title>My Tool</title>
    </head>
    <body>
        <h1>My Tool</h1>
        <script>
            // Access injected APIs
            async function init() {
                const context = await toolboxAPI.getToolContext();
                console.log("Tool ID:", context.toolId);

                // Create a terminal
                const terminal = await toolboxAPI.terminal.create({
                    shell: "/bin/bash",
                });

                // Query Dataverse
                const accounts = await dataverseAPI.fetchXmlQuery(`
                    <fetch top="10">
                        <entity name="account">
                            <attribute name="name" />
                        </entity>
                    </fetch>
                `);
            }

            init();
        </script>
    </body>
</html>
```

### Context Isolation & Communication

#### Context Isolation

-   Renderer process runs in isolated context
-   No direct access to Node.js APIs from tools
-   Communication only through preload script (for main UI) or postMessage (for tools)
-   Tools run in sandboxed iframes

#### IPC Communication (Main UI ↔ Main Process)

-   All main-renderer communication via IPC
-   Handlers validate and sanitize input
-   Secure contextBridge API exposure in preload.ts

#### postMessage Communication (Tools ↔ Renderer)

-   Tools communicate with renderer via window.postMessage
-   toolboxAPIBridge.js handles message routing
-   Context-aware: Tool ID automatically injected
-   Event filtering ensures tools only receive relevant events

#### Settings Storage

-   electron-store provides JSON storage
-   Sensitive data encrypted using EncryptionManager
-   Settings stored in user data directory
-   Per-user, per-application isolation

## Extension Points

### Tool Integration

External tools can integrate through:

1. **npm packages**: Standard installation mechanism via pnpm
2. **HTML/JavaScript**: Tools are HTML pages loaded in iframes
3. **ToolBox API**: Access to utilities, terminals, events, connections
4. **Dataverse API**: Complete Dataverse Web API client for CRUD, queries, and metadata
5. **Context-Aware**: Automatic tool ID detection and resource isolation

### ToolBox API

Tools have access to organized APIs:

#### Utils
-   `showNotification()` - Display notifications
-   `copyToClipboard()` - Copy text to clipboard
-   `saveFile()` - Save files to disk
-   `getCurrentTheme()` - Get current theme

#### Terminal
-   `create()` - Create a terminal (auto-named with tool name)
-   `execute()` - Execute commands
-   `close()` - Close terminal
-   `list()` - List tool's terminals only
-   `setVisibility()` - Show/hide terminal

#### Events
-   `on()` - Subscribe to events (filtered to relevant events)
-   `off()` - Unsubscribe from events
-   `getHistory()` - Get event history (tool-specific)

#### Connections
-   `getActiveConnection()` - Get active Dataverse connection (without token)

### Dataverse API

Complete Dataverse Web API client:

#### CRUD Operations
-   `create(entity, record)` - Create records
-   `retrieve(entity, id, columns)` - Retrieve by ID
-   `update(entity, id, record)` - Update records
-   `delete(entity, id)` - Delete records

#### Query Operations
-   `fetchXmlQuery(fetchXml)` - Execute FetchXML queries
-   `retrieveMultiple(fetchXml)` - Alias for fetchXmlQuery

#### Metadata Operations
-   `getEntityMetadata(entityName)` - Get entity metadata
-   `getAllEntitiesMetadata()` - Get all entities metadata

#### Advanced Operations
-   `execute(request)` - Execute actions and functions

### Event System

Tools and components can:

-   Subscribe to system events
-   Emit custom events
-   React to state changes
-   Coordinate between tools

## File Structure

```
desktop-app/
├── src/
│   ├── api/
│   │   └── toolboxAPI.ts             # Event system and API (~121 lines)
│   ├── main/
│   │   ├── index.ts                   # Main process entry (~649 lines)
│   │   ├── preload.ts                 # Secure IPC bridge (~203 lines)
│   │   ├── constants.ts               # App constants (~11 lines)
│   │   └── managers/
│   │       ├── settingsManager.ts     # Settings management (~109 lines)
│   │       ├── connectionsManager.ts  # Connection management (~186 lines)
│   │       ├── toolsManager.ts        # Tool lifecycle (~255 lines)
│   │       ├── authManager.ts         # Authentication (MSAL) (~360 lines)
│   │       ├── dataverseManager.ts    # Dataverse API operations (~380 lines)
│   │       ├── encryptionManager.ts   # Secure encryption (~88 lines)
│   │       ├── terminalManager.ts     # Terminal management (~342 lines)
│   │       └── autoUpdateManager.ts   # Auto-updates (~198 lines)
│   ├── renderer/
│   │   ├── index.html                 # UI structure (~1,050 lines)
│   │   ├── styles.scss                # Main stylesheet (~1,200 lines)
│   │   ├── styles/
│   │   │   ├── _variables.scss        # SCSS variables (~35 lines)
│   │   │   └── _mixins.scss           # SCSS mixins (~35 lines)
│   │   ├── renderer.ts                # UI logic (~3,062 lines)
│   │   ├── types.d.ts                 # Renderer types (~120 lines)
│   │   ├── toolboxAPIBridge.js        # API bridge for tools (~250 lines)
│   │   ├── tools.json                 # Tool registry
│   │   └── icons/                     # UI icons (light/dark themes)
│   └── types/
│       └── index.ts                   # Shared type definitions (~103 lines)
├── packages/                          # Type definitions package for tool developers
│   ├── toolboxAPI.d.ts                # ToolBox API types (~180 lines)
│   ├── dataverseAPI.d.ts              # Dataverse API types (~210 lines)
│   ├── index.d.ts                     # Main export (~15 lines)
│   ├── package.json                   # Package metadata
│   └── README.md                      # Tool developer documentation
├── docs/
│   ├── ARCHITECTURE.md                # Architecture documentation (this file)
│   ├── TOOL_DEVELOPMENT.md            # Tool development guide
│   ├── DATAVERSE_API.md               # Dataverse API reference
│   ├── TERMINAL_USAGE.md              # Terminal API guide
│   ├── CONTEXT_AWARE_SECURE_STORAGE.md # Security documentation
│   ├── PNPM_MIGRATION.md              # pnpm package manager guide
│   ├── BUILD_OPTIMIZATION.md          # Build and optimization guide
│   └── FEATURES_OVERVIEW.md           # Feature documentation
├── assets/
│   └── icon.png                       # Application icon
├── icons/
│   ├── icon.ico                       # Windows icon
│   ├── icon.icns                      # macOS icon
│   └── icon256x256.png                # Linux icon
├── dist/                              # Compiled output (gitignored)
│   ├── main/                          # Main process build
│   ├── renderer/                      # Renderer process build
│   └── api/                           # API build
├── build/                             # Build artifacts (gitignored)
├── node_modules/                      # Dependencies (gitignored)
├── package.json                       # Dependencies and scripts
├── pnpm-lock.yaml                     # pnpm lockfile
├── pnpm-workspace.yaml                # pnpm workspace config
├── .npmrc                             # pnpm configuration
├── tsconfig.json                      # TypeScript config (main/api)
├── tsconfig.renderer.json             # TypeScript config (renderer)
├── vite.config.ts                     # Vite build configuration
├── .eslintrc.js                       # Linting configuration
├── .prettierrc.json                   # Code formatting config
└── CONTRIBUTING.md                    # Contribution guidelines
```

**Total Lines of Code**: ~7,500 lines across 13 TypeScript source files + renderer HTML/SCSS

## Build Process

The application uses **Vite** as the modern build tool for fast, optimized builds.

### Build System

**Package Manager**: pnpm (v10.18.3+)
**Build Tool**: Vite (v7.1.11)
**Compiler**: TypeScript (v5.9.3)

### Build Commands

```bash
pnpm install         # Install dependencies (~40s first time)
pnpm run lint        # Lint TypeScript files (0 errors expected)
pnpm run build       # Production build (2-5 seconds)
pnpm run watch       # Watch mode for development
pnpm run dev         # Development mode with Vite dev server
pnpm start           # Run the built application
pnpm run package     # Create distributable packages
```

### Vite Build Process

Vite builds three separate bundles in parallel:

1. **Main Process Build**:
    - Entry: `src/main/index.ts`
    - Output: `dist/main/index.js`
    - Bundles all managers and dependencies
    - Includes rollup-plugin-visualizer for bundle analysis

2. **Preload Script Build**:
    - Entry: `src/main/preload.ts`
    - Output: `dist/main/preload.js`
    - Secure bridge for IPC communication

3. **Renderer Process Build**:
    - Entry: `src/renderer/index.html`
    - Output: `dist/renderer/`
    - Bundles TypeScript, compiles SCSS to CSS
    - Code splitting: Vendor chunks separated
    - Copies static assets (HTML, JSON, icons)

### Static Asset Handling

A custom Vite plugin handles post-build operations:

-   Reorganizes HTML from nested paths to `dist/renderer/`
-   Copies `tools.json` and `toolboxAPIBridge.js`
-   Copies icon directories (light/dark themes)
-   Fixes asset paths in HTML

### Bundle Analysis

After `pnpm run build`, view bundle analysis reports:

-   `dist/stats-main.html` - Main process bundle analysis
-   `dist/stats-renderer.html` - Renderer process bundle analysis

### Module System

-   **Main/API**: ES Modules (Node16 module resolution)
-   **Renderer**: ES Modules (bundler resolution, ES2022)
-   **Target**: ES2022 for modern JavaScript features

### Code Splitting

-   Vendor dependencies split into separate chunk
-   Better browser caching
-   Parallel chunk loading

### SCSS Compilation

-   SCSS files automatically compiled to CSS by Vite
-   Supports variables, mixins, nesting
-   Modular architecture with `_variables.scss` and `_mixins.scss`

### Electron Packaging

electron-builder creates installers:

-   **Windows**: NSIS installer
-   **macOS**: DMG disk image
-   **Linux**: AppImage

### Output Structure

```
dist/
├── main/
│   ├── index.js              # Main process
│   ├── preload.js            # Preload script
│   └── managers/             # Manager modules
├── renderer/
│   ├── index.html            # UI entry point
│   ├── assets/               # JavaScript and CSS bundles
│   ├── icons/                # UI icons
│   ├── tools.json            # Tool registry
│   └── toolboxAPIBridge.js   # Tool API bridge
└── stats-*.html              # Bundle analysis reports
```

## Future Enhancements

### Planned Features

1. **Tool Marketplace**: Browse and install tools from a catalog
2. **Enhanced Tool Sandboxing**: Additional security layers for third-party tools
3. **Multi-language Support**: Internationalization (i18n)
4. **Theme Customization**: User-defined themes and dark mode
5. **Enhanced Dataverse API**: Batch requests, change tracking, upsert operations
6. **Testing Framework**: Automated testing infrastructure
7. **Documentation Site**: Comprehensive online documentation
8. **Plugin Versioning**: Tool update management and version compatibility
9. **Collaboration Features**: Share tools and configurations between team members

### Technical Debt

1. Add comprehensive test coverage (unit, integration, E2E)
2. Implement proper error boundaries in renderer
3. Add structured logging system with log levels
4. Implement tool verification/signing for security
5. Add performance monitoring and metrics
6. Improve bundle size optimization
7. Add more comprehensive TypeScript types (reduce `any` usage)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on:

-   Setting up development environment
-   Installing pnpm and dependencies
-   Code standards and linting
-   Pull request process
-   Building and testing

## Tool Development

See [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for:

-   Tool structure requirements
-   ToolBox API documentation
-   Dataverse API usage
-   Example implementations
-   Publishing guidelines

## Additional Documentation

-   **[DATAVERSE_API.md](DATAVERSE_API.md)**: Complete Dataverse API reference with examples
-   **[TERMINAL_USAGE.md](TERMINAL_USAGE.md)**: Terminal API guide for tool developers
-   **[CONTEXT_AWARE_SECURE_STORAGE.md](CONTEXT_AWARE_SECURE_STORAGE.md)**: Security implementation details
-   **[PNPM_MIGRATION.md](PNPM_MIGRATION.md)**: pnpm package manager and tool isolation
-   **[BUILD_OPTIMIZATION.md](BUILD_OPTIMIZATION.md)**: Build system and optimization guide
-   **[FEATURES_OVERVIEW.md](FEATURES_OVERVIEW.md)**: Feature documentation

## Terminal Integration

The Terminal feature allows tools to create and manage their own terminal instances for executing commands.

### Terminal Manager

The `TerminalManager` (in `src/main/managers/terminalManager.ts`) provides:

-   **Terminal Creation**: Tools can create named terminals with custom shell preferences
-   **Command Execution**: Execute shell commands and receive real-time output
-   **Shell Selection**: Tools specify preferred shell with automatic fallback to system default
-   **Context-Aware**: Each tool only sees and manages its own terminals
-   **Event System**: Real-time events for terminal output, completion, and errors
-   **Lifecycle Management**: Proper cleanup and resource management
-   **Auto-Naming**: Terminals automatically named with tool name if not specified

### API Integration

Terminal functionality is exposed through multiple layers:

1. **Main Process**: TerminalManager class and IPC handlers in `src/main/index.ts`
2. **Preload Bridge**: Secure API exposure in `src/main/preload.ts`
3. **Renderer Process**: Context-aware message routing in `src/renderer/renderer.ts`
4. **Tool API Bridge**: iframe-safe API bridge in `src/renderer/toolboxAPIBridge.js`
5. **Type Definitions**: TypeScript types in `packages/toolboxAPI.d.ts`

### UI Components

Terminal UI includes:

-   **Terminal Panel**: Resizable bottom panel for terminal output
-   **Terminal Tabs**: Multiple terminals can run simultaneously
-   **Output Display**: Real-time command output with ANSI color support
-   **Show/Hide Controls**: Users can toggle terminal visibility
-   **Tool Isolation**: Each tool's terminals are isolated and filtered

### Context-Aware Features

-   **Automatic Tool ID**: Tools don't need to specify their ID when creating terminals
-   **Filtered Listing**: `terminal.list()` only returns the calling tool's terminals
-   **Event Filtering**: Terminal events only sent to the owning tool
-   **Resource Isolation**: Tools cannot access or control other tools' terminals

### Usage Example

```javascript
// Create a terminal (auto-named with tool name)
const terminal = await toolboxAPI.terminal.create({
    shell: "/bin/bash",
});

// Execute a command
await toolboxAPI.terminal.execute(terminal.id, "ls -la");

// Listen for output
toolboxAPI.events.on((event, payload) => {
    if (event === "terminal:output" && payload.id === terminal.id) {
        console.log("Output:", payload.output);
    }
});

// Close terminal when done
await toolboxAPI.terminal.close(terminal.id);
```

### Supported Shells

-   **Unix/Linux**: bash, zsh, sh
-   **macOS**: bash, zsh
-   **Windows**: PowerShell, cmd

### Security Considerations

-   Commands execute with user's permissions
-   No elevation or sudo access by default
-   Output is sanitized before display
-   Process isolation prevents cross-tool interference

For complete documentation, see [TERMINAL_USAGE.md](TERMINAL_USAGE.md).
