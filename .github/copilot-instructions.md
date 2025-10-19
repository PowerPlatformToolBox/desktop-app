# Power Platform Tool Box - Copilot Instructions

## Repository Overview

**Power Platform Tool Box** is an Electron-based desktop application (v28) that provides a universal platform for Power Platform development tools. It features a VS Code Extension Host-inspired architecture for secure, isolated tool execution. The app is built with TypeScript targeting ES2022 and requires Node.js 18+.

**Size**: ~7,000 lines of code across 13 TypeScript/JavaScript source files
**Primary Language**: TypeScript (strict mode)
**Runtime**: Electron 28, Node.js 18+
**Key Technologies**: Electron, TypeScript, electron-store (settings), electron-updater (auto-updates), @azure/msal-node (authentication)

## Build System & Commands

### Prerequisites

-   Node.js 18 or higher (currently tested with v20.19.5)
-   npm 10.8.2 or higher

### Installation & Build Sequence

**ALWAYS run these commands in this exact order for a clean build:**

```bash
npm install          # Install dependencies (~28s)
npm run lint         # Lint code (optional but recommended before build)
npm run build        # Build the application (~2-3s)
```

### Available Commands

-   **`npm install`** - Install all dependencies. Takes ~28s on first install. ALWAYS run before building after cloning or pulling.
-   **`npm run build`** - Complete build process. Runs TypeScript compilation (main + renderer) then copies static files to `dist/`. Takes 2-3 seconds.
-   **`npm run lint`** - Run ESLint on all TypeScript files. Will show warnings for `any` types but should have 0 errors.
-   **`npm run watch`** - Watch mode for TypeScript compilation. Useful for development. Only watches main process files, not renderer.
-   **`npm run dev`** - Build and run the application with Electron. Requires display/GUI environment.
-   **`npm start`** - Start the application with Electron (requires prior build). Requires display/GUI environment.
-   **`npm run package`** - Build and create distributable packages (Windows NSIS, macOS DMG, Linux AppImage). Outputs to `build/` directory.

### Build Process Details

The build process is composed of three sequential steps:

1. **Main Process Compilation**: `tsc` compiles `src/main/`, `src/api/`, `src/types/` → `dist/`
2. **Renderer Process Compilation**: `tsc -p tsconfig.renderer.json` compiles `src/renderer/` → `dist/renderer/`
3. **Static File Copy**: Copies HTML, CSS, JS, JSON, and icons from `src/renderer/` to `dist/renderer/`

**Important**: The build outputs to `dist/` which is gitignored. Always run `npm run build` after code changes.

### Build Verification

After building, verify the output structure:

```bash
bash verify-build.sh
```

**Note**: `verify-build.sh` checks for outdated paths (`settings-manager.js`, `tool-manager.js`, `toolbox-api.js`). Actual files are in `dist/main/managers/` subdirectory and named `settingsManager.js`, `toolsManager.js`, and `dist/api/toolboxAPI.js`.

### Known Build Issues & Workarounds

1. **TypeScript Version Warning**: ESLint shows a warning about TypeScript 5.9.3 not being officially supported (expects <5.4.0). This is non-blocking - build and lint still work correctly.

2. **Electron Sandbox Error**: Running `npm start` or `npm run dev` without a display shows a SUID sandbox error. This is expected in headless environments and can be ignored.

3. **Linting Warnings**: Linting produces ~55 warnings about `any` types. These are intentional and set to "warn" level in `.eslintrc.js`. Zero errors is the passing criteria.

4. **npm audit vulnerabilities**: Shows 5 vulnerabilities (4 low, 1 moderate) in dev dependencies. These are in deprecated transitive dependencies and don't affect the build.

## Project Structure

### Root Directory Files

```
.all-contributorsrc      # All contributors configuration
.eslintrc.js            # ESLint configuration (TypeScript rules)
.gitignore              # Git ignore patterns (includes dist/, build/, node_modules/)
.prettierrc.json        # Prettier code formatting config
.vscodeignore           # VS Code ignore patterns
CHANGELOG.md            # Project changelog
CODE_OF_CONDUCT.md      # Community guidelines
CONTRIBUTING.md         # Contributor guidelines
LICENSE                 # GPL-3.0 license
README.md               # Main documentation (363 lines)
package.json            # Main package file with scripts
package-lock.json       # Locked dependencies
tsconfig.json           # TypeScript config for main process
tsconfig.renderer.json  # TypeScript config for renderer (extends main)
verify-build.sh         # Build verification script
```

### Source Code Architecture (`src/`)

```
src/
├── main/                          # Main Electron process
│   ├── index.ts                   # App entry point, IPC handlers (498 lines)
│   ├── preload.ts                 # Secure bridge for IPC (99 lines)
│   └── managers/                  # Core managers
│       ├── authManager.ts         # OAuth/MSAL authentication (359 lines)
│       ├── autoUpdateManager.ts   # electron-updater integration (198 lines)
│       ├── settingsManager.ts     # electron-store wrapper (187 lines)
│       └── toolsManager.ts        # Tool lifecycle management (262 lines)
├── api/
│   └── toolboxAPI.ts              # Event-driven API system (121 lines)
├── renderer/                      # UI process
│   ├── index.html                 # Main UI structure (490 lines)
│   ├── styles.css                 # Fluent-inspired styling (1,962 lines)
│   ├── renderer.ts                # UI logic and IPC (2,534 lines)
│   ├── types.d.ts                 # Renderer type definitions (66 lines)
│   ├── toolboxAPIBridge.js        # API bridge for tools (159 lines)
│   ├── tools.json                 # Tool registry
│   └── icons/                     # UI icons
└── types/
    └── index.ts                   # Shared TypeScript types (103 lines)
```

### Additional Directories

-   **`docs/`** - Architecture and development guides
    -   `ARCHITECTURE.md` - Full architecture documentation
    -   `TOOL_HOST_ARCHITECTURE.md` - Tool Host system details
    -   `TOOL_DEVELOPMENT.md` - Guide for tool developers
-   **`packages/pptoolbox-types/`** - Separate npm package with TypeScript types for tool developers
-   **`assets/`** - Application assets (icon, etc.)
-   **`.github/ISSUE_TEMPLATE/`** - GitHub issue templates (bug reports, feature requests, tool submissions)
-   **`.vscode/`** - VS Code tasks and launch configurations

### Build Outputs (Gitignored)

-   **`dist/`** - Compiled JavaScript, copied static files
-   **`build/`** - electron-builder packaging output (installers)
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
-   **Publish**: GitHub releases (owner: PowerPlatform-ToolBox)
-   **Output**: `build/` directory
-   **Targets**: Windows NSIS, macOS DMG, Linux AppImage

## Architecture Key Points

### Main Process Responsibilities

-   Create BrowserWindow for UI
-   Manage IPC communication via preload bridge
-   Coordinate managers (settings, tools, auth, auto-update)
-   Handle tool host processes (separate Node.js forks)
-   Manage file system operations

### Renderer Process Responsibilities

-   Display UI (HTML/CSS)
-   Handle user interactions
-   Communicate with main via IPC (contextBridge API)
-   Show modals for tool installation, connections, settings

### Security Model

-   **Process Isolation**: Each tool runs in separate Node.js process
-   **IPC Protocol**: Structured message validation
-   **Limited API**: Tools only access `pptoolbox` API
-   **Context Isolation**: Renderer has no direct Node.js access

### Tool Host System

Tools are npm packages that:

1. Export `activate(context)` and `deactivate()` functions
2. Declare contribution points in `package.json`
3. Use the injected `pptoolbox` API
4. Run in isolated Node.js child processes

## Validation & Testing

### Pre-Commit Validation

There are no automated GitHub Actions workflows yet. Manual validation steps:

1. **Lint**: `npm run lint` - Must complete with 0 errors (warnings OK)
2. **Build**: `npm run build` - Must complete successfully and create `dist/` directory
3. **Verify Build**: `bash verify-build.sh` - Check output structure (note: script has outdated paths but is informational)

### Manual Testing

Since there's no test framework yet, validate changes by:

1. Building successfully: `npm run build`
2. Running the app (if you have a display): `npm run dev`
3. Testing affected functionality manually in the UI
4. Checking console for errors

### No Test Framework

Currently there are no unit tests, integration tests, or test framework. Do not add test files unless implementing a new test infrastructure is your task.

## Common Workflows

### Making Code Changes

1. Make your changes to TypeScript files
2. Run `npm run lint` to check for issues
3. Run `npm run build` to compile
4. Test manually if possible or verify build succeeds

### Adding a New Manager

1. Create `src/main/managers/yourManager.ts`
2. Export a class with appropriate methods
3. Import and initialize in `src/main/index.ts`
4. Add IPC handlers if needed in `index.ts`
5. Update types in `src/types/index.ts` if needed

### Modifying the UI

1. Edit `src/renderer/index.html` for structure
2. Edit `src/renderer/styles.css` for styling
3. Edit `src/renderer/renderer.ts` for logic
4. Run `npm run build` (copies static files)
5. Test with `npm run dev`

### Updating Dependencies

1. Update `package.json`
2. Run `npm install`
3. Run `npm run build` to verify compatibility
4. Test the application

## Important Notes

-   **ALWAYS run `npm install` after pulling changes** that modify `package.json` or `package-lock.json`
-   **ALWAYS run `npm run build` before running the app** with `npm start` or `npm run dev`
-   **DO NOT commit `dist/` or `build/` directories** - they are gitignored
-   **DO NOT commit `node_modules/`** - it's gitignored
-   **Check lint before committing**: While warnings are OK, ensure no new errors are introduced
-   **Follow existing code style**: 4-space tabs, double quotes, semicolons (per .prettierrc.json)
-   **Update documentation** if you change architecture or add new features

## Dependencies to Be Aware Of

-   **electron** (v28): Main framework, breaking changes between major versions
-   **electron-store** (v8.1.0): Settings persistence, schema-based
-   **electron-updater** (v6.6.2): Auto-update system, requires GitHub releases
-   **@azure/msal-node** (v3.8.0): Microsoft authentication, OAuth flows
-   **TypeScript** (v5.3.0): Compiler, strict mode enabled
-   **shx** (v0.4.0): Cross-platform shell commands in npm scripts
-   **@fluentui/web-components** (v2.6.1): Microsoft Fluent UI web components for modern UI
-   **@fluentui/tokens** (v1.0.0-alpha.22): Fluent UI design tokens (colors, spacing, typography)
-   **@fluentui/svg-icons** (v1.1.312): Fluent UI System Icons (SVG) for consistent iconography

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

## Trust These Instructions

These instructions are comprehensive and tested. Only search for additional information if:

-   You encounter an error not documented here
-   You need to understand implementation details not covered
-   The build process has changed (check package.json scripts first)

For architecture details, refer to `docs/ARCHITECTURE.md` and other docs in `docs/` directory.
