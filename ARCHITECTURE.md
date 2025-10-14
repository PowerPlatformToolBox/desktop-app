# PowerPlatform ToolBox Architecture

## Overview

PowerPlatform ToolBox is an Electron-based desktop application built with TypeScript. It follows a modular architecture with clear separation between the main process, renderer process, and API layers.

## Technology Stack

- **Electron**: Cross-platform desktop application framework
- **TypeScript**: Type-safe JavaScript
- **electron-store**: Persistent settings storage
- **Node.js**: Runtime environment

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PowerPlatform ToolBox                     │
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
- **Purpose**: Main application entry point
- **Responsibilities**:
  - Initialize Electron app
  - Create application window
  - Set up IPC handlers
  - Coordinate between managers

#### `settings-manager.ts`
- **Purpose**: Manage application and tool settings
- **Responsibilities**:
  - User settings (theme, language, auto-update)
  - Dataverse connections (CRUD operations)
  - Tool-specific settings
  - Persistent storage using electron-store

#### `tool-manager.ts`
- **Purpose**: Manage external tools
- **Responsibilities**:
  - Load/unload tools
  - Install/uninstall tools via npm
  - Track loaded tools
  - Emit tool lifecycle events

#### `preload.ts`
- **Purpose**: Secure bridge between main and renderer
- **Responsibilities**:
  - Expose safe APIs to renderer via contextBridge
  - IPC communication wrapper
  - Security isolation

### 2. Renderer Process (`src/renderer/`)

The renderer process handles the UI and user interactions.

#### `index.html`
- **Purpose**: Application UI structure
- **Features**:
  - Three-panel layout (Tools, Connections, Settings)
  - Modal dialogs for tool installation and connections
  - Modern, responsive design

#### `styles.css`
- **Purpose**: Application styling
- **Features**:
  - Modern Fluent-inspired design
  - CSS variables for theming
  - Responsive grid layouts
  - Clean, professional appearance

#### `renderer.ts`
- **Purpose**: UI logic and interactions
- **Responsibilities**:
  - Handle user interactions
  - Communicate with main process via IPC
  - Update UI based on state changes
  - Manage modal dialogs

### 3. API Layer (`src/api/`)

#### `toolbox-api.ts`
- **Purpose**: Event-driven API for tools and application
- **Responsibilities**:
  - Event emission and subscription
  - Notification system
  - Event history tracking
  - Communication hub for tools

### 4. Type Definitions (`src/types/`)

#### `index.ts`
- **Purpose**: TypeScript type definitions
- **Contents**:
  - Tool interface
  - Settings interfaces
  - Connection interfaces
  - Event types and payloads
  - Notification options

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

### Context Isolation

- Renderer process runs in isolated context
- No direct access to Node.js APIs
- Communication only through preload script

### IPC Communication

- All main-renderer communication via IPC
- Handlers validate and sanitize input
- Secure contextBridge API exposure

### Settings Storage

- electron-store provides encrypted storage
- Settings stored in user data directory
- Per-user, per-application isolation

## Extension Points

### Tool Integration

External tools can integrate through:
1. **npm packages**: Standard installation mechanism
2. **ToolBox API**: Access to events and notifications
3. **Tool Settings**: Persistent configuration storage
4. **Connection Access**: Use configured Dataverse connections

### Event System

Tools and components can:
- Subscribe to system events
- Emit custom events
- React to state changes
- Coordinate between tools

## File Structure

```
desktop-app/
├── src/
│   ├── api/
│   │   └── toolbox-api.ts      # Event system and API
│   ├── main/
│   │   ├── index.ts            # Main process entry
│   │   ├── preload.ts          # Secure IPC bridge
│   │   ├── settings-manager.ts # Settings management
│   │   └── tool-manager.ts     # Tool lifecycle
│   ├── renderer/
│   │   ├── index.html          # UI structure
│   │   ├── styles.css          # Styling
│   │   ├── renderer.ts         # UI logic
│   │   └── types.d.ts          # Renderer types
│   └── types/
│       └── index.ts            # Shared type definitions
├── assets/
│   └── icon.png                # Application icon
├── dist/                       # Compiled output
├── build/                      # Build artifacts
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (main)
├── tsconfig.renderer.json      # TypeScript config (renderer)
└── .eslintrc.js               # Linting configuration
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
5. **Auto-updates**: Automatic application updates
6. **Plugin API v2**: Enhanced tool integration capabilities
7. **Testing Framework**: Automated testing infrastructure
8. **Documentation Site**: Comprehensive online documentation

### Technical Debt

1. Add comprehensive test coverage
2. Implement proper error boundaries
3. Add logging system
4. Implement tool verification/signing
5. Add performance monitoring

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up development environment
- Code standards
- Pull request process
- Testing requirements

## Tool Development

See [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for:
- Tool structure requirements
- API documentation
- Example implementations
- Publishing guidelines
