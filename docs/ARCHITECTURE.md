# Power Platform Tool Box Architecture

## Overview

Power Platform Tool Box is an Electron-based desktop application built with TypeScript. It follows a modular architecture with clear separation between the main process, renderer process, and API layers.

## Technology Stack

-   **Electron**: Cross-platform desktop application framework (v28)
-   **TypeScript**: Type-safe JavaScript (v5.3 with ES2022 target)
-   **electron-store**: Persistent settings storage
-   **electron-updater**: Automatic application updates
-   **@azure/msal-node**: Microsoft Authentication Library for OAuth flows
-   **Node.js**: Runtime environment (v18+)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Power Platform Tool Box                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌────────────────────────────┐   │
│  │   Renderer   │◄────────┤   IPC Communication        │   │
│  │   Process    │         │   (contextBridge)          │   │
│  │              │─────────►                            │   │
│  │  - UI (HTML) │         └────────────────────────────┘   │
│  │  - Styles    │                      │                    │
│  │  - Logic     │                      │                    │
│  └──────────────┘                      ▼                    │
│                              ┌──────────────────┐           │
│                              │  Main Process    │           │
│                              │                  │           │
│                              │  ┌────────────┐  │           │
│                              │  │  ToolBox   │  │           │
│                              │  │    App     │  │           │
│                              │  └─────┬──────┘  │           │
│                              │        │         │           │
│                              │   ┌────▼─────┐   │           │
│  ┌──────────────┐           │   │ Settings │   │           │
│  │  ToolBox API │◄──────────┤   │ Manager  │   │           │
│  │              │           │   └──────────┘   │           │
│  │  - Events    │           │                  │           │
│  │  - Notif.    │           │   ┌──────────┐   │           │
│  └──────────────┘           │   │   Tool   │   │           │
│                              │   │ Manager  │   │           │
│                              │   └──────────┘   │           │
│                              └──────────────────┘           │
│                                      │                      │
│                                      ▼                      │
│                              ┌──────────────────┐           │
│                              │  File System     │           │
│                              │  - Settings      │           │
│                              │  - Tool Storage  │           │
│                              └──────────────────┘           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
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

-   **Purpose**: Manage application and tool settings
-   **Responsibilities**:
    -   User settings (theme, language, auto-update)
    -   Dataverse connections (CRUD operations)
    -   Tool-specific settings
    -   Persistent storage using electron-store

##### `toolsManager.ts`

-   **Purpose**: Manage external tools
-   **Responsibilities**:
    -   Load/unload tools
    -   Install/uninstall tools via npm
    -   Track loaded tools
    -   Coordinate with Tool Host Manager
    -   Parse contribution points from package.json
    -   Emit tool lifecycle events

##### `authManager.ts`

-   **Purpose**: Manage authentication and authorization
-   **Responsibilities**:
    -   Handle OAuth flows with Azure AD
    -   Manage access tokens for Dataverse connections
    -   MSAL integration for secure authentication
    -   Token refresh and caching

##### `autoUpdateManager.ts`

-   **Purpose**: Manage application auto-updates
-   **Responsibilities**:
    -   Check for updates using electron-updater
    -   Download and install updates
    -   Notify users of available updates
    -   Periodic update checks (configurable interval)
    -   User control over update installation

#### Tool Host (`src/main/toolHost/`)

The Tool Host subsystem provides secure, isolated execution of tools, inspired by VS Code's Extension Host.

##### `toolHostManager.ts`

-   **Purpose**: Coordinate all tool host processes
-   **Responsibilities**:
    -   Create and manage tool host processes
    -   Route API calls between tools and main process
    -   Handle command execution
    -   Manage tool lifecycle events

##### `toolHostProcess.ts`

-   **Purpose**: Manage individual tool host process
-   **Responsibilities**:
    -   Fork separate Node.js process for each tool
    -   Handle tool activation/deactivation
    -   Manage IPC communication with tool
    -   Process lifecycle management

##### `toolHostProtocol.ts`

-   **Purpose**: Secure IPC protocol implementation
-   **Responsibilities**:
    -   Request/response message handling
    -   Message validation and serialization
    -   Timeout management
    -   Protocol message creation

##### `toolHostRunner.ts`

-   **Purpose**: Entry point for tool host processes
-   **Responsibilities**:
    -   Load tool modules in isolated environment
    -   Execute tool activation/deactivation
    -   Handle API calls from tools
    -   Manage tool context and state

#### `preload.ts`

-   **Purpose**: Secure bridge between main and renderer
-   **Responsibilities**:
    -   Expose safe APIs to renderer via contextBridge
    -   IPC communication wrapper
    -   Security isolation

### 2. Renderer Process (`src/renderer/`)

The renderer process handles the UI and user interactions.

#### `index.html`

-   **Purpose**: Application UI structure
-   **Features**:
    -   Three-panel layout (Tools, Connections, Settings)
    -   Modal dialogs for tool installation and connections
    -   Modern, responsive design

#### `styles.css`

-   **Purpose**: Application styling
-   **Features**:
    -   Modern Fluent-inspired design
    -   CSS variables for theming
    -   Responsive grid layouts
    -   Clean, professional appearance

#### `renderer.ts`

-   **Purpose**: UI logic and interactions
-   **Responsibilities**:
    -   Handle user interactions
    -   Communicate with main process via IPC
    -   Update UI based on state changes
    -   Manage modal dialogs

### 3. API Layer (`src/api/`)

#### `toolbox-api.ts`

-   **Purpose**: Event-driven API for tools and application
-   **Responsibilities**:
    -   Event emission and subscription
    -   Notification system
    -   Event history tracking
    -   Communication hub for tools

### 4. Type Definitions (`src/types/`)

#### `index.ts`

-   **Purpose**: TypeScript type definitions
-   **Contents**:
    -   Tool interface with contribution points
    -   Contribution point types (commands, menus, views, configuration)
    -   Tool Host protocol types and message structures
    -   Tool context and state storage interfaces
    -   Settings interfaces
    -   Connection interfaces
    -   Event types and payloads
    -   Notification options

### 5. Tool Host API (`src/toolHost/api/`)

#### `pptoolbox.ts`

-   **Purpose**: API module injected into tools at runtime
-   **Responsibilities**:
    -   Provide `pptoolbox` module that tools import
    -   Handle IPC communication with main process
    -   Expose commands, window, workspace, and events APIs
    -   Request/response handling for API calls
-   **Similar to**: VS Code's `vscode` module

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
Tool Manager installs via npm
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
Settings Manager saves connection
    ↓
Event emitted: connection:created
    ↓
ToolBox API broadcasts event
    ↓
Renderer updates UI
```

### Settings Update Flow

```
User changes setting
    ↓
Renderer → IPC → Main Process
    ↓
Settings Manager updates setting
    ↓
Event emitted: settings:updated
    ↓
ToolBox API broadcasts event
    ↓
Application applies new settings
```

## Security Model

### Tool Host Architecture

The Power Platform Tool Box implements a **VS Code Extension Host-like architecture** for secure tool execution:

#### Isolated Processes

-   Each tool runs in a separate Node.js process (Tool Host Process)
-   Tools cannot directly access the main application or other tools
-   Process isolation prevents memory leaks and crashes from affecting the main app

#### Structured IPC Protocol

-   All communication uses a structured message protocol (ToolHostProtocol)
-   Messages are validated for structure and content
-   Request/response pattern with unique message IDs
-   Automatic timeout handling (30 seconds default)
-   Message types: REQUEST, RESPONSE, EVENT, ERROR, ACTIVATE, DEACTIVATE, API_CALL

#### API Injection

-   Tools import `pptoolbox` module: `const pptoolbox = require('pptoolbox');`
-   The actual API is injected at runtime by the Tool Host environment
-   Tools only have access to the specific APIs exposed by ToolBox
-   No direct access to Node.js fs, Electron APIs, or other sensitive modules

#### Message Flow Example

```
Tool                    Tool Host Process              Tool Host Manager           Main Process
 |                             |                              |                          |
 |--pptoolbox.window.show()--->|                              |                          |
 |                             |--API_CALL(showNotification)->|                          |
 |                             |                              |--showNotification()----->|
 |                             |                              |<-----success-------------|
 |                             |<-------RESPONSE--------------|                          |
 |<----promise resolved--------|                              |                          |
```

### Contribution Points

Tools declare their capabilities in `package.json`:

#### Commands

```json
"contributes": {
  "commands": [
    {
      "command": "myTool.action",
      "title": "My Action",
      "category": "My Tool"
    }
  ]
}
```

#### Menus

```json
"contributes": {
  "menus": {
    "commandPalette": [{ "command": "myTool.action" }],
    "toolsMenu": [{ "command": "myTool.action", "group": "navigation" }]
  }
}
```

#### Configuration

```json
"contributes": {
  "configuration": [{
    "title": "My Tool Settings",
    "properties": {
      "myTool.enabled": {
        "type": "boolean",
        "default": true
      }
    }
  }]
}
```

#### Activation Events

```json
"activationEvents": [
  "onCommand:myTool.action",  // Load when command is invoked
  "*"                          // Load on startup
]
```

### Context Isolation

-   Renderer process runs in isolated context
-   No direct access to Node.js APIs
-   Communication only through preload script

### IPC Communication

-   All main-renderer communication via IPC
-   Handlers validate and sanitize input
-   Secure contextBridge API exposure

### Settings Storage

-   electron-store provides encrypted storage
-   Settings stored in user data directory
-   Per-user, per-application isolation

## Extension Points

### Tool Integration

External tools can integrate through:

1. **npm packages**: Standard installation mechanism
2. **ToolBox API**: Access to events and notifications
3. **Tool Settings**: Persistent configuration storage
4. **Connection Access**: Use configured Dataverse connections

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
│   │   └── toolbox-api.ts           # Event system and API
│   ├── main/
│   │   ├── index.ts                 # Main process entry
│   │   ├── preload.ts               # Secure IPC bridge
│   │   └── managers/
│   │       ├── settingsManager.ts   # Settings management
│   │       ├── toolsManager.ts      # Tool lifecycle
│   │       ├── authManager.ts       # Authentication
│   │       └── autoUpdateManager.ts # Auto-updates
│   ├── renderer/
│   │   ├── index.html               # UI structure
│   │   ├── styles.css               # Styling
│   │   ├── renderer.ts              # UI logic
│   │   ├── types.d.ts               # Renderer types
│   │   └── toolboxAPIBridge.js      # API bridge
│   └── types/
│       └── index.ts                 # Shared type definitions
├── docs/
│   ├── ARCHITECTURE.md              # Architecture documentation
│   ├── TOOL_DEVELOPMENT.md          # Tool development guide
│   ├── TOOL_HOST_ARCHITECTURE.md    # Tool Host details
├── examples/
│   └── example-tool/                # Example tool implementation
├── assets/
│   └── icon.png                     # Application icon
├── dist/                            # Compiled output
├── build/                           # Build artifacts
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript config (main)
├── tsconfig.renderer.json           # TypeScript config (renderer)
└── .eslintrc.js                     # Linting configuration
└── CONTRIBUTING.md                  # Contribution guidelines
```

## Build Process

1. **TypeScript Compilation**:

    - Main process: `tsc` → `dist/main/`
    - Renderer process: `tsc -p tsconfig.renderer.json` → `dist/renderer/`

2. **Static File Copy**:

    - HTML and CSS → `dist/renderer/`

3. **Electron Packaging**:
    - electron-builder packages the application
    - Creates installers for Windows, macOS, Linux

## Future Enhancements

### Planned Features

1. **Tool Marketplace**: Browse and install tools from a catalog
2. **Tool Sandboxing**: Enhanced security for third-party tools
3. **Multi-language Support**: Internationalization
4. **Theme Customization**: User-defined themes
5. **Plugin API v2**: Enhanced tool integration capabilities
6. **Testing Framework**: Automated testing infrastructure
7. **Documentation Site**: Comprehensive online documentation

### Technical Debt

1. Add comprehensive test coverage
2. Implement proper error boundaries
3. Add structured logging system
4. Implement tool verification/signing
5. Add performance monitoring

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on:

-   Setting up development environment
-   Code standards
-   Pull request process
-   Testing requirements

## Tool Development

See [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for:

-   Tool structure requirements
-   API documentation
-   Example implementations
-   Publishing guidelines
