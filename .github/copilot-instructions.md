# Power Platform Tool Box - Copilot Instructions

## Repository Overview

**Power Platform Tool Box** is an Electron-based desktop application (v28) that provides a universal platform for Power Platform development tools. It features a VS Code Extension Host-inspired architecture for secure, isolated tool execution. The app is built with TypeScript targeting ES2022 and requires Node.js 18+.

**Size**: ~10,000+ lines of code across TypeScript source files
**Primary Language**: TypeScript (strict mode enabled)
**Runtime**: Electron 28, Node.js 18+
**Key Technologies**: Electron, TypeScript, electron-store (settings), electron-updater (auto-updates), @azure/msal-node (authentication), Vite (build tool), Sass (styling)

## CRITICAL: Code Quality Standards

### Logging and Error Handling

**NEVER use console.log, console.warn, or console.error in production code.** Instead, use appropriate Sentry methods for telemetry and error tracking:

-   **For informational logs**: Use `Sentry.captureMessage(message, 'info')` or appropriate logging mechanism
-   **For warnings**: Use `Sentry.captureMessage(message, 'warning')`
-   **For errors**: Use `Sentry.captureException(error)` to capture full error context with stack traces
-   **For debug information**: Only use console methods during development with clear comments indicating they should be removed

**Example - BAD:**

```typescript
console.log("User settings loaded");
console.warn("Connection token expired");
console.error("Failed to load tool:", error);
```

**Example - GOOD:**

```typescript
Sentry.captureMessage("User settings loaded successfully", "info");
Sentry.captureMessage("Connection token expired for user", "warning");
Sentry.captureException(new Error("Failed to load tool"), {
    extra: { toolId, error: error.message },
});
```

### ESLint and Prettier Configuration

**ALWAYS format code according to project standards before committing:**

-   **Prettier Configuration** (`.prettierrc.json`):

    -   **printWidth**: 200 characters (long lines are OK)
    -   **tabWidth**: 4 spaces (NOT 2)
    -   **singleQuote**: false (use double quotes)
    -   **semi**: true (always use semicolons)
    -   **trailingComma**: "all" (add trailing commas)
    -   **endOfLine**: "auto" (cross-platform compatibility)

-   **ESLint Configuration** (`.eslintrc.js`):
    -   Parser: `@typescript-eslint/parser`
    -   Strict TypeScript rules enabled
    -   **`@typescript-eslint/no-explicit-any`**: "warn" (warnings OK, but avoid when possible)
    -   Target: ES2020, Node.js environment

**Before any commit or code generation:**

1. Run `pnpm run lint` - Must complete with 0 errors (warnings are acceptable)
2. Format code with Prettier (4-space tabs, double quotes, semicolons, trailing commas)
3. Verify TypeScript strict mode compliance

**Example Formatting:**

```typescript
// CORRECT ✓
export interface UserSettings {
    theme: string;
    language: string;
    autoUpdate: boolean;
}

async function loadUserData(): Promise<UserSettings> {
    const settings = await settingsManager.getUserSettings();
    return settings;
}

// INCORRECT ✗ (2-space tabs, single quotes, missing trailing comma)
export interface UserSettings {
    theme: string;
    language: string;
    autoUpdate: boolean;
}

async function loadUserData(): Promise<UserSettings> {
    const settings = await settingsManager.getUserSettings();
    return settings;
}
```

## Build System & Commands

### Prerequisites

-   Node.js 18 or higher (currently tested with v20.19.5)
-   pnpm 10.18.3 or higher (package manager - REQUIRED)
-   **Supabase credentials** (required for tool registry):
    -   `SUPABASE_URL` - Your Supabase project URL
    -   `SUPABASE_ANON_KEY` - Your Supabase anonymous key

### Environment Variables

Create a `.env` file in the project root (gitignored) with:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Security Note**: These values are injected at build time via Vite and NOT stored in source code. For GitHub Actions, configure them as repository secrets.

### Installation & Build Sequence

**ALWAYS run these commands in this exact order for a clean build:**

```bash
pnpm install         # Install dependencies (~40s with pnpm)
pnpm run typecheck   # TypeScript type checking (main + renderer)
pnpm run lint        # Lint code (must have 0 errors, warnings OK)
pnpm run build       # Build the application using Vite (~2-5s)
```

### Available Commands

-   **`pnpm install`** - Install all dependencies. Takes ~40s on first install. ALWAYS run after cloning or pulling package changes.
-   **`pnpm run typecheck`** - Run TypeScript compiler in check mode for both main and renderer processes. No output files generated.
-   **`pnpm run build`** - Complete production build. Runs typecheck + Vite build for main, preload, and renderer processes. Takes 2-5 seconds.
-   **`pnpm run build:debug`** - Development build with source maps enabled for debugging.
-   **`pnpm run lint`** - Run ESLint on all TypeScript files. Must complete with 0 errors (warnings acceptable).
-   **`pnpm run watch`** - Watch mode for Vite build. Useful for development with auto-rebuild on file changes.
-   **`pnpm run dev`** - Development mode with Vite dev server. Requires display/GUI environment.
-   **`pnpm start`** - Start the built application with Electron (requires prior `pnpm run build`).
-   **`pnpm run package`** - Build and create distributable packages (Windows NSIS, macOS DMG/ZIP, Linux AppImage).

### Build Process Details

The build process uses **Vite** (not Webpack) and consists of multiple parallel builds:

1. **Main Process Build**: `src/main/` → `dist/main/index.js`
    - Entry point: `src/main/index.ts`
    - Includes all managers and utilities
    - Environment variables injected at build time
2. **Preload Scripts Build**: `src/main/preload.ts` → `dist/main/preload.js`
    - `preload.ts` - Main window preload (exposes `toolboxAPI`)
    - `toolPreloadBridge.ts` - Tool window preload (exposes `toolboxAPI` + `dataverseAPI`)
    - `notificationPreload.ts` - Notification window preload
    - `modalPreload.ts` - Modal window preload
3. **Renderer Process Build**: `src/renderer/` → `dist/renderer/`
    - Entry: `src/renderer/index.html` + `src/renderer/renderer.ts`
    - Sass compilation: `src/renderer/styles.scss` → CSS
    - Static assets copied to `dist/renderer/`

**Important Build Notes:**

-   Output directory: `dist/` (gitignored)
-   Production builds exclude source maps
-   Development builds (`build:debug`) include source maps
-   All preload scripts use context isolation and expose limited APIs via `contextBridge`

## Project Structure

### Root Directory Files

```
.all-contributorsrc      # All contributors configuration
.eslintrc.js            # ESLint configuration (TypeScript rules)
.gitignore              # Git ignore patterns (includes dist/, build/, node_modules/)
.prettierrc.json        # Prettier code formatting config (4-space tabs, double quotes)
.vscodeignore           # VS Code ignore patterns
CHANGELOG.md            # Project changelog
CODE_OF_CONDUCT.md      # Community guidelines
CONTRIBUTING.md         # Contributor guidelines
LICENSE                 # GPL-3.0 license
README.md               # Main documentation
package.json            # Main package file with scripts and dependencies
pnpm-lock.yaml          # pnpm lockfile for reproducible installs
pnpm-workspace.yaml     # pnpm workspace configuration
.npmrc                  # pnpm configuration (tool isolation, disk optimization)
tsconfig.json           # TypeScript config for main process
tsconfig.renderer.json  # TypeScript config for renderer process
vite.config.ts          # Vite build configuration (main + preload + renderer)
```

### Source Code Architecture (`src/`)

The application follows **standard Electron 3-process architecture** with strict process isolation:

```
src/
├── common/                              # Shared code between processes
│   ├── ipc/
│   │   └── channels.ts                  # IPC channel constants (single source of truth)
│   └── types/                           # Shared TypeScript type definitions
│       ├── index.ts                     # Type exports
│       ├── common.ts                    # Common types
│       ├── tool.ts                      # Tool-related types
│       ├── connection.ts                # Connection types
│       ├── terminal.ts                  # Terminal types
│       ├── settings.ts                  # Settings types
│       ├── events.ts                    # Event types
│       ├── dataverse.ts                 # Dataverse types
│       └── api.ts                       # API types
├── main/                                # Main Electron process (Node.js runtime)
│   ├── index.ts                         # Application entry point, IPC handlers
│   ├── constants.ts                     # Main process constants
│   ├── preload.ts                       # Main window preload (exposes toolboxAPI)
│   ├── toolPreloadBridge.ts             # Tool window preload (toolboxAPI + dataverseAPI)
│   ├── notificationPreload.ts           # Notification window preload
│   ├── modalPreload.ts                  # Modal window preload
│   ├── data/
│   │   └── registry.json                # Tool registry cache
│   ├── managers/                        # Core business logic managers
│   │   ├── settingsManager.ts           # electron-store wrapper for user settings
│   │   ├── connectionsManager.ts        # Dataverse connection management
│   │   ├── toolsManager.ts              # Tool lifecycle and plugin management
│   │   ├── toolRegistryManager.ts       # Supabase tool registry integration
│   │   ├── toolWindowManager.ts         # BrowserView-based tool windows
│   │   ├── authManager.ts               # OAuth/MSAL authentication
│   │   ├── autoUpdateManager.ts         # electron-updater integration
│   │   ├── terminalManager.ts           # Integrated terminal management
│   │   ├── dataverseManager.ts          # Dataverse API operations
│   │   ├── encryptionManager.ts         # Sensitive data encryption
│   │   ├── machineIdManager.ts          # Machine identity management
│   │   ├── modalWindowManager.ts        # Modal dialog management
│   │   ├── notificationWindowManager.ts # Notification system
│   │   ├── loadingOverlayWindowManager.ts # Loading overlay management
│   │   ├── browserviewProtocolManager.ts # Custom protocol handler
│   │   └── toolboxUtilityManager.ts     # Utility functions for tools
│   └── utilities/                       # Utility modules
│       ├── clipboard.ts                 # Clipboard operations
│       ├── filesystem.ts                # File system operations
│       ├── theme.ts                     # Theme management
│       └── index.ts                     # Utility exports
└── renderer/                            # Renderer process (Chromium + Web APIs)
    ├── index.html                       # Main UI structure
    ├── renderer.ts                      # UI initialization and IPC handling
    ├── styles.scss                      # Main Sass stylesheet
    ├── types.d.ts                       # Renderer-specific type definitions
    ├── constants/
    │   └── index.ts                     # UI constants
    ├── icons/                           # UI icons (light/dark theme variants)
    │   ├── dark/
    │   └── light/
    ├── modals/                          # Modal dialog components
    │   ├── sharedStyles.ts              # Shared modal styles
    │   ├── addConnection/               # Add connection modal (MVC pattern)
    │   │   ├── controller.ts
    │   │   └── view.ts
    │   ├── editConnection/              # Edit connection modal
    │   ├── selectConnection/            # Connection selection modal
    │   ├── selectMultiConnection/       # Multi-connection selection
    │   ├── toolDetail/                  # Tool details modal
    │   └── cspException/                # CSP exception consent modal
    ├── modules/                         # Feature modules (separation of concerns)
    │   ├── initialization.ts            # App initialization
    │   ├── themeManagement.ts           # Theme switching
    │   ├── settingsManagement.ts        # Settings UI
    │   ├── connectionManagement.ts      # Connection UI logic
    │   ├── toolManagement.ts            # Tool UI logic
    │   ├── toolsSidebarManagement.ts    # Tools sidebar
    │   ├── marketplaceManagement.ts     # Tool marketplace UI
    │   ├── homepageManagement.ts        # Homepage UI
    │   ├── terminalManagement.ts        # Terminal UI
    │   ├── modalManagement.ts           # Modal coordination
    │   ├── browserWindowModals.ts       # BrowserWindow-based modals
    │   ├── notifications.ts             # Notification UI
    │   ├── autoUpdateManagement.ts      # Auto-update UI
    │   ├── sidebarManagement.ts         # Sidebar navigation
    │   └── cspExceptionModal.ts         # CSP exception UI
    ├── styles/                          # Modular SCSS stylesheets
    │   ├── _variables.scss              # Sass variables
    │   ├── _mixins.scss                 # Sass mixins
    │   ├── homepage.scss                # Homepage styles
    │   └── README.md                    # Styles documentation
    ├── types/
    │   └── index.ts                     # Renderer type definitions
    └── utils/
        └── toolSourceIcon.ts            # Tool icon utilities
```

### Additional Directories

-   **`packages/`** - Separate npm package with TypeScript types for tool developers (`pptoolbox-types`)
-   **`assets/`** - Application assets (logo, etc.)
-   **`icons/`** - Platform-specific app icons (`.ico`, `.icns`)
-   **`buildScripts/`** - Build and packaging scripts
-   **`.github/ISSUE_TEMPLATE/`** - GitHub issue templates
-   **`.vscode/`** - VS Code tasks and launch configurations

### Build Outputs (Gitignored)

-   **`dist/`** - Compiled JavaScript and bundled assets
    -   `dist/main/` - Main process bundle
    -   `dist/renderer/` - Renderer process bundle
-   **`build/`** - electron-builder packaging output (installers/DMGs)
-   **`node_modules/`** - Dependencies

## Configuration Files

### TypeScript Configuration

-   **`tsconfig.json`** - Main/API/Types compilation

    -   Target: ES2022
    -   Module: Node16
    -   Strict mode enabled
    -   Outputs to `dist/`
    -   Excludes renderer files

-   **`tsconfig.renderer.json`** - Renderer compilation
    -   Extends main tsconfig
    -   Includes DOM types
    -   Module: ES2022
    -   ModuleResolution: bundler
    -   Only includes `src/renderer/`

### Linting & Formatting

-   **`.eslintrc.js`**

    -   Parser: @typescript-eslint/parser
    -   Rules: ESLint recommended + TypeScript recommended
    -   `@typescript-eslint/no-explicit-any`: "warn" (not "error")
    -   Environment: Node.js, ES2020

-   **`.prettierrc.json`**
    -   printWidth: 200
    -   tabWidth: 4
    -   singleQuote: false
    -   semi: true
    -   trailingComma: "all"

### Electron Builder Configuration

Defined in `package.json` under `"build"`:

-   **appId**: `com.powerplatform.toolbox`
-   **Publish**: GitHub releases (owner: PowerPlatformToolBox)
-   **Output**: `build/` directory
-   **Targets**: Windows NSIS, macOS DMG, Linux AppImage

## Electron Architecture Key Points

### Process Architecture (Standard Electron Pattern)

This application follows the **standard Electron multi-process architecture** with strict security isolation:

#### 1. Main Process (`src/main/`)

-   **Runtime**: Node.js (full access to system APIs)
-   **Responsibilities**:
    -   Create and manage BrowserWindow instances
    -   Handle IPC communication from renderer processes
    -   Coordinate all manager instances (settings, tools, auth, connections, etc.)
    -   Manage tool host processes (separate Node.js child processes)
    -   Perform file system operations
    -   Handle system-level operations (clipboard, dialogs, etc.)
-   **Entry Point**: `src/main/index.ts` - Contains the `ToolBoxApp` class

#### 2. Renderer Process (`src/renderer/`)

-   **Runtime**: Chromium (web APIs only, NO direct Node.js access)
-   **Responsibilities**:
    -   Display UI using HTML/CSS/JavaScript
    -   Handle user interactions
    -   Communicate with main process via IPC through preload bridge
    -   Show modals for tool installation, connections, settings
-   **Entry Point**: `src/renderer/index.html` + `src/renderer/renderer.ts`
-   **Context Isolation**: Enabled (renderer has no access to Electron or Node.js APIs directly)

#### 3. Preload Scripts (`src/main/*.preload.ts`)

-   **Runtime**: Node.js context with Chromium access
-   **Purpose**: Secure bridge between main and renderer processes
-   **Types**:
    -   `preload.ts` - Main application window (exposes `toolboxAPI`)
    -   `toolPreloadBridge.ts` - Tool windows (exposes `toolboxAPI` + `dataverseAPI`)
    -   `notificationPreload.ts` - Notification windows
    -   `modalPreload.ts` - Modal windows
-   **Security**: Uses `contextBridge.exposeInMainWorld()` to expose limited, validated APIs

### IPC Communication Pattern

**All inter-process communication uses the IPC (Inter-Process Communication) system:**

1. **Channel Constants**: Defined in `src/common/ipc/channels.ts` (single source of truth)
2. **Main Process Handlers**: Registered in `src/main/index.ts` using `ipcMain.handle()` or `ipcMain.on()`
3. **Preload Bridge**: Exposes safe API methods via `contextBridge`
4. **Renderer Invocation**: Calls exposed APIs (e.g., `window.toolboxAPI.getTool()`)

**Example Flow:**

```typescript
// 1. Channel definition (src/common/ipc/channels.ts)
export const TOOL_CHANNELS = {
    GET_TOOL: "get-tool",
} as const;

// 2. Main process handler (src/main/index.ts)
ipcMain.handle(TOOL_CHANNELS.GET_TOOL, async (_, toolId: string) => {
    return await this.toolManager.getTool(toolId);
});

// 3. Preload exposure (src/main/preload.ts)
contextBridge.exposeInMainWorld("toolboxAPI", {
    getTool: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL, toolId),
});

// 4. Renderer usage (src/renderer/renderer.ts)
const tool = await window.toolboxAPI.getTool("example-tool");
```

### Security Model

-   **Process Isolation**: Each tool runs in a separate Node.js child process, completely isolated from the main application
-   **Context Isolation**: Renderer processes cannot access Electron or Node.js APIs directly
-   **Limited API Surface**: Tools only access the controlled `pptoolbox` API via their preload bridge
-   **IPC Validation**: All IPC messages are validated and typed
-   **CSP (Content Security Policy)**: Tools must declare CSP exceptions in their manifest

### Tool Host System (VS Code Extension Host Pattern)

Tools are isolated plugins similar to VS Code extensions:

1. **Tool Structure**: Each tool is an npm package with:
    - `package.json` with tool manifest (name, version, features, CSP exceptions)
    - HTML entry point (loaded into BrowserView)
    - Optional JavaScript/CSS assets
2. **Installation**: Tools installed via pnpm with `--dir` flag into isolated directories (`app.getPath("userData")/tools`)
3. **Lifecycle**: Tools activate/deactivate via host system
4. **API Access**: Tools receive injected `pptoolbox` API through preload script
5. **Execution**: Each tool runs in its own BrowserView with dedicated preload script

**Tool API Surface** (`toolPreloadBridge.ts`):

-   `toolboxAPI`: Core app features (settings, events, connections, terminal, etc.)
-   `dataverseAPI`: Dataverse-specific operations (queries, metadata, etc.)

### Manager Architecture

Managers encapsulate business logic and are instantiated in the main process:

-   **SettingsManager**: electron-store wrapper for user preferences
-   **ConnectionsManager**: Dataverse connection lifecycle with encryption
-   **ToolsManager**: Tool discovery, installation, and lifecycle
-   **ToolRegistryManager**: Supabase integration for tool marketplace
-   **ToolWindowManager**: BrowserView-based tool window management
-   **AuthManager**: OAuth flows using @azure/msal-node
-   **AutoUpdateManager**: electron-updater integration for auto-updates
-   **TerminalManager**: Integrated terminal with pty support
-   **DataverseManager**: Dataverse Web API operations
-   **EncryptionManager**: Sensitive data encryption (tokens, secrets)
-   **MachineIdManager**: Unique machine identification
-   **ModalWindowManager**: Modal dialog orchestration
-   **NotificationWindowManager**: Toast notification system
-   **LoadingOverlayWindowManager**: Loading state overlays
-   **BrowserviewProtocolManager**: Custom protocol handler for tool assets

Each manager is a singleton instance owned by the `ToolBoxApp` class.

## Validation & Testing

## Configuration Files

### TypeScript Configuration

-   **`tsconfig.json`** - Main/API/Types compilation

    -   Target: ES2022
    -   Module: Node16
    -   Strict mode enabled
    -   Outputs to `dist/`
    -   Excludes renderer files

-   **`tsconfig.renderer.json`** - Renderer compilation
    -   Extends main tsconfig
    -   Includes DOM types
    -   Module: ES2022
    -   ModuleResolution: bundler
    -   Only includes `src/renderer/`

### Linting & Formatting

-   **`.eslintrc.js`**

    -   Parser: @typescript-eslint/parser
    -   Rules: ESLint recommended + TypeScript recommended
    -   `@typescript-eslint/no-explicit-any`: "warn" (not "error")
    -   Environment: Node.js, ES2020

-   **`.prettierrc.json`**
    -   printWidth: 200
    -   tabWidth: 4
    -   singleQuote: false
    -   semi: true
    -   trailingComma: "all"

### Electron Builder Configuration

Defined in `package.json` under `"build"`:

-   **appId**: `com.powerplatform.toolbox`
-   **Publish**: GitHub releases (owner: PowerPlatformToolBox)
-   **Output**: `build/` directory
-   **Targets**: Windows NSIS, macOS DMG, Linux AppImage

### Vite Configuration (`vite.config.ts`)

-   **Main Process**: Entry at `src/main/index.ts`, outputs to `dist/main/index.js`
-   **Preload Scripts**: Multiple preload files bundled to `dist/main/`
-   **Renderer Process**: Entry at `src/renderer/index.html`, outputs to `dist/renderer/`
-   **Environment Variables**: Injects Supabase credentials at build time
-   **Source Maps**: Enabled for development builds, disabled for production

## Validation & Testing

### Pre-Commit Validation

There are no automated GitHub Actions workflows yet. Manual validation steps:

1. **Lint**: `pnpm run lint` - Must complete with 0 errors (warnings OK)
2. **Build**: `pnpm run build` - Must complete successfully and create `dist/` directory
3. **Verify Build**: `bash verify-build.sh` - Check output structure (note: script has outdated paths but is informational)

### Manual Testing

Since there's no test framework yet, validate changes by:

1. Building successfully: `pnpm run build`
2. Running the app (if you have a display): `pnpm run dev`
3. Testing affected functionality manually in the UI
4. Checking console for errors

### No Test Framework

Currently there are no unit tests, integration tests, or test framework. Do not add test files unless implementing a new test infrastructure is your task.

## Common Workflows

### Making Code Changes

1. Make your changes to TypeScript files
2. Run `pnpm run lint` to check for issues
3. Run `pnpm run build` to compile
4. Test manually if possible or verify build succeeds

### Adding a New Manager

1. Create `src/main/managers/yourManager.ts`
2. Export a class with appropriate methods
3. Import and initialize in `src/main/index.ts`
4. Add IPC handlers if needed in `index.ts`
5. Update types in `src/common/types/` if needed

### Modifying the UI

1. Edit `src/renderer/index.html` for structure
2. Edit `src/renderer/styles.scss` for styling
3. Edit `src/renderer/renderer.ts` for logic
4. Run `pnpm run build` (compiles and bundles)
5. Test with `pnpm run dev`

### Updating Dependencies

1. Update `package.json`
2. Run `pnpm install`
3. Run `pnpm run build` to verify compatibility
4. Test the application

## UI Design Guidelines

### Fluent UI Components

This app uses **Fluent UI Web Components** to align with the Microsoft ecosystem and Power Platform design language.

**ALWAYS use Fluent UI components when building or modifying UI:**

-   **Available Components**: The app includes the full Fluent UI Web Components library. Refer to [Fluent UI Web Components documentation](https://aka.ms/fluentui-web-components) for available components.
-   **Common Components**: `fluent-button`, `fluent-text-field`, `fluent-select`, `fluent-checkbox`, `fluent-radio`, `fluent-switch`, `fluent-tabs`, `fluent-dialog`, `fluent-card`, `fluent-badge`, `fluent-progress`, `fluent-menu`, `fluent-tooltip`, etc.
-   **Design Tokens**: Use Fluent UI design tokens from `@fluentui/tokens` for consistent colors, spacing, and typography.

**How to use Fluent UI components:**

1. **In HTML**: Use custom element tags directly

    ```html
    <fluent-button appearance="primary">Click me</fluent-button> <fluent-text-field placeholder="Enter text"></fluent-text-field>
    ```

2. **In TypeScript**: Create elements programmatically

    ```typescript
    const button = document.createElement("fluent-button");
    button.textContent = "Click me";
    button.setAttribute("appearance", "primary");
    ```

3. **Styling**: Fluent components support CSS custom properties for theming
    ```css
    fluent-button {
        --neutral-fill-rest: var(--primary-color);
    }
    ```

**Icons**: When adding icons, prefer using Fluent UI icon SVGs or icon fonts instead of custom icons to maintain consistency with Microsoft's design language.

**Icon Library**: All application icons use Fluent UI System Icons from `@fluentui/svg-icons`. Available icons can be found in `node_modules/@fluentui/svg-icons/icons/`. Icons should use `fill="currentColor"` to inherit color from parent elements.

**Migration**: When modifying existing UI, gradually migrate custom HTML elements to Fluent UI components where appropriate.

## Important Notes

-   **ALWAYS use pnpm** - This project uses pnpm as the package manager for better dependency management and disk space optimization
-   **ALWAYS run `pnpm install` after pulling changes** that modify `package.json` or `pnpm-lock.yaml`
-   **ALWAYS run `pnpm run build` before running the app** with `pnpm start` or `pnpm run dev`
-   **DO NOT commit `dist/` or `build/` directories** - they are gitignored
-   **DO NOT commit `node_modules/` or `.pnpm-store/`** - they're gitignored
-   **DO NOT use npm or yarn commands** - always use pnpm to maintain consistency
-   **Check lint before committing**: While warnings are OK, ensure no new errors are introduced
-   **Follow existing code style**: 4-space tabs, double quotes, semicolons (per .prettierrc.json)
-   **Update documentation** if you change architecture or add new features

## Dependencies to Be Aware Of

-   **pnpm** (v10.18.3): Package manager with content-addressable store and symlinks for disk space optimization
-   **electron** (v28): Main framework, breaking changes between major versions
-   **electron-store** (v8.2.0): Settings persistence, schema-based
-   **electron-updater** (v6.6.2): Auto-update system, requires GitHub releases
-   **@azure/msal-node** (v3.8.0): Microsoft authentication, OAuth flows
-   **TypeScript** (v5.9.3): Compiler, strict mode enabled
-   **vite** (v7.1.11): Build tool and dev server, replaces webpack
-   **@fluentui/tokens** (v1.0.0-alpha.22): Fluent UI design tokens (colors, spacing, typography)
-   **@fluentui/svg-icons** (v1.1.312): Fluent UI System Icons (SVG) for consistent iconography

## Trust These Instructions

These instructions are comprehensive and tested. Only search for additional information if:

-   You encounter an error not documented here
-   You need to understand implementation details not covered
-   The build process has changed (check package.json scripts first)

For architecture details, refer to `docs/ARCHITECTURE.md` and other docs in `docs/` directory.
