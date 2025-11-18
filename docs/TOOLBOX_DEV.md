# Getting Started with ToolBox development

- [Getting Started with ToolBox development](#getting-started-with-toolbox-development)
  - [Prerequisites](#prerequisites)
  - [Development Setup](#development-setup)
  - [Linting](#linting)
  - [Packaging](#packaging)
  - [Folder Organization](#folder-organization)
  - [Troubleshooting](#troubleshooting)
    - [Electron won't start](#electron-wont-start)

## Prerequisites

-   Node.js 18 or higher
-   pnpm 10 or higher (recommended package manager)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/PowerPlatform-ToolBox/desktop-app.git
cd desktop-app
```

2. Install pnpm (if not already installed):

```bash
npm install -g pnpm
```

3. Install dependencies:

```bash
pnpm install
```

4. Build the application:

```bash
pnpm run build
```

5. Run the application:

    - Start

    ```bash
    pnpm start
    ```

    - For development with Vite's built-in hot module replacement (HMR):

    ```bash
    pnpm run dev
    ```

    This starts the Vite dev server with Electron, providing fast refresh for renderer process changes.

    - For watch mode (continuous compilation):

    ```bash
    pnpm run watch
    ```

    - Run and Debug in VS Code

    Under "Run and Debug" activity bar menu option you'll find **Debug Main Process** as an option which you can use to debug the application with breakpoints in the main process. This will not break the code for any debug pointers in the renderer; for that you will have to run **Renderer (Chromium) Attach** process.

## Linting

Check code quality:

```bash
pnpm run lint
```

## Packaging

Build distributable packages:

```bash
pnpm run package
```

This will create installers for your platform in the `build/` directory.

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

## Troubleshooting

### Electron won't start

Getting the following error `throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');`

Manually trigger Electron's install script

```bash
node node_modules/electron/install.js
```
