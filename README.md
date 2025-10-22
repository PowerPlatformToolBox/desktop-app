<p align="center">
    <h1 align="center">
        Power Platform Tool Box
    </h1>
    <h3 align="center">
        A universal desktop app that contains multiple tools to ease the customization and configuration of Power Platform
    </h3>
    <p align="center">
        This repo is an open-source project that provides a code for a Power Platform Tool Box (PPTB)
    </p>
</p>

<!-- <p align="center">
    <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/actions/workflows/build.yml" alt="Build">
      <img src="https://github.com/Power-Maverick/DataverseDevTools-VSCode/actions/workflows/build.yml/badge.svg?branch=main"/>
    </a>
    <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/actions/workflows/release.yml" alt="Release">
      <img src="https://github.com/Power-Maverick/DataverseDevTools-VSCode/actions/workflows/release.yml/badge.svg?branch=release"/>
    </a>
    <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/blob/master/LICENSE" alt="License">
      <img src="https://img.shields.io/github/license/Power-Maverick/DataverseDevTools-VSCode"/>
    </a>
    <a href="https://app.codacy.com/gh/Power-Maverick/DataverseDevTools-VSCode?utm_source=github.com&utm_medium=referral&utm_content=Power-Maverick/DataverseDevTools-VSCode&utm_campaign=Badge_Grade" alt="Codacy Badge">
      <img src="https://api.codacy.com/project/badge/Grade/b947883a529941309d08736843cb126f"/>
    </a>
</p> -->

<!-- <p align="center">
    <a href="https://img.shields.io/visual-studio-marketplace/d/danish-naglekar.dataverse-devtools" alt="Visual Studio Marketplace Downloads">
      <img src="https://img.shields.io/visual-studio-marketplace/d/danish-naglekar.dataverse-devtools" />
    </a>
    <a href="https://marketplace.visualstudio.com/items?itemName=danish-naglekar.dataverse-devtools" alt="Visual Studio Marketplace Version">
      <img src="https://img.shields.io/visual-studio-marketplace/v/danish-naglekar.dataverse-devtools?label=vscode%20marketplace" />
    </a>
    <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode" alt="GitHub Stars">
      <img src="https://img.shields.io/github/stars/Power-Maverick/DataverseDevTools-VSCode?label=github%20stars" />
    </a>
</p> -->

<!-- <p align="center">
    <a href="https://github.com/sponsors/Power-Maverick" alt="Sponsor">
      <img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub" />
    </a>
    <a href="https://twitter.com/DanzMaverick" alt="Twitter Follow">
      <img src="https://img.shields.io/twitter/follow/DanzMaverick?style=social" />
    </a>
</p>

<h3 align="center">
  <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/issues/new?assignees=Power-Maverick&labels=enhancement%2Ctriage&template=issues-form-feature-request.yaml&title=%5BFeature%5D%3A+">Feature request</a>
  <span> · </span>
  <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/issues/new?assignees=Power-Maverick&labels=bug%2Ctriage&template=issue-form-bug.yaml&title=%5BBug%5D%3A+">Report a bug</a>
  <span> · </span>
  <a href="https://github.com/Power-Maverick/DataverseDevTools-VSCode/discussions/categories/q-a">Support</a>
</h3> -->

-   [Features](#features)
-   [📋 Comprehensive Features Overview](#-comprehensive-features-overview)
-   [Architecture](#architecture)
    -   [Main Process (`src/main/`)](#main-process-srcmain)
    -   [API Layer (`src/api/`)](#api-layer-srcapi)
    -   [Renderer Process (`src/renderer/`)](#renderer-process-srcrenderer)
    -   [UI Design](#ui-design)
    -   [Types (`src/types/`)](#types-srctypes)
    -   [Build System](#build-system)
-   [Security Model](#security-model)
-   [Tool Development](#tool-development)
    -   [Sample Tools Repository](#sample-tools-repository)
    -   [Getting Started with Tool Development](#getting-started-with-tool-development)
    -   [Quick Example](#quick-example)
-   [Getting Started](#getting-started)
    -   [Prerequisites](#prerequisites)
    -   [Installation](#installation)
    -   [Development](#development)
    -   [Linting](#linting)
    -   [Bundle Analysis](#bundle-analysis)
    -   [Packaging](#packaging)
-   [Tools provided by the Tool Box](#tools-provided-by-the-tool-box)
    -   [Installing Tools](#installing-tools)
    -   [Tool Security](#tool-security)
-   [Dataverse Connections](#dataverse-connections)
-   [Auto-Updates](#auto-updates)
    -   [Enabling Auto-Updates](#enabling-auto-updates)
    -   [Manual Update Check](#manual-update-check)
    -   [Update Process](#update-process)
-   [Troubleshooting](#troubleshooting)
    -   [Electron won't start](#electron-wont-start)
-   [Documentation](#documentation)
-   [Discussions](#discussions)
-   [License](#license)
-   [Contributing](#contributing)

## Features

-   **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
-   **🔒 Secure Tool Host**: VS Code Extension Host-inspired architecture for isolated tool execution
-   **🔗 Dataverse Connections**: Create and manage connections to Dataverse environments
-   **⚙️ Settings Management**:
    -   User settings for the ToolBox application
    -   Individual tool-specific settings
-   **🎨 Modern Interface**: Built with Microsoft Fluent UI components for a consistent, accessible experience aligned with Power Platform
-   **📡 Event-Driven API**: ToolBox provides its own APIs that emit events
-   **🔔 Notifications**: Built-in notification system to keep users informed
-   **🔄 Auto-Updates**: Automatic application updates with user control

## 📋 Comprehensive Features Overview

For a **complete, detailed overview** of all features, maturity assessment, known limitations, security considerations, and future roadmap, see:

**👉 [FEATURES_OVERVIEW.md](docs/FEATURES_OVERVIEW.md)**

This comprehensive document includes:

-   **Feature Maturity Matrix** - Production readiness of each feature
-   **Known Limitations** - Current platform and technical constraints
-   **Security Considerations** - Threat model and security recommendations
-   **Performance Characteristics** - Benchmarks and optimization tips
-   **Future Enhancements** - Detailed roadmap for upcoming features
-   **Known Issues** - Current issues and workarounds
-   **Maturity Assessment** - Overall platform maturity and adoption recommendations

Perfect for understanding the platform's capabilities and planning your adoption strategy.

## Architecture

The application uses a **robust Tool Host architecture** inspired by VS Code's Extension Host:

### Main Process (`src/main/`)

-   **index.ts**: Main Electron application entry point
-   **settings-manager.ts**: Manages user and tool settings using electron-store
-   **tool-manager.ts**: Handles tool installation, loading, and management via npm
-   **auto-update-manager.ts**: Manages automatic application updates using electron-updater
-   **preload.ts**: Secure bridge between main and renderer processes

### API Layer (`src/api/`)

-   **toolbox-api.ts**: Event-driven API system for tools and application events

### Renderer Process (`src/renderer/`)

-   **index.html**: Main application UI built with Fluent UI Web Components
-   **styles.css**: Modern, responsive styling with Fluent Design System integration
-   **renderer.ts**: UI logic and interaction handlers

### UI Design

-   **Fluent UI Web Components**: Microsoft's design system for consistent, accessible UI
-   **Design Tokens**: Uses `@fluentui/tokens` for colors, spacing, and typography
-   **Theme Support**: Seamless light/dark theme switching
-   See [FLUENT_UI_INTEGRATION.md](docs/FLUENT_UI_INTEGRATION.md) for details

### Types (`src/types/`)

-   Comprehensive TypeScript type definitions for all application entities
-   Tool contribution points and Tool Host protocol types

### Build System

-   **Vite**: Modern, fast bundler for both main and renderer processes
-   **TypeScript**: Strict mode enabled for type safety
-   **Hot Module Replacement (HMR)**: Instant feedback during development
-   **Optimized Bundling**: Production builds are optimized for size and performance
-   **Bundle Analysis**: Visualize bundle composition with built-in analysis tools
-   **Code Splitting**: Automatic vendor chunk separation for better caching
-   **SCSS Modules**: Organized SCSS with variables and mixins for maintainable styles
-   **ES Modules**: Full ESM migration for better tree-shaking and performance
-   **CI/CD Monitoring**: Automated bundle size tracking in GitHub Actions

For detailed build optimization information, see [BUILD_OPTIMIZATION.md](docs/BUILD_OPTIMIZATION.md).

## Security Model

-   **Process Isolation**: Each tool runs in a separate Node.js process
-   **Structured IPC**: All communication via validated message protocol
-   **Limited API Surface**: Tools only access specific ToolBox APIs
-   **No Direct Access**: Tools cannot access file system, Electron APIs, or other tools

## Tool Development

Power Platform Tool Box uses a secure, extensible Tool Host architecture that allows developers to create custom tools as npm packages. Tools run in isolated processes and communicate with the ToolBox through a secure API.

### Sample Tools Repository

Check out the **[sample-tools repository](https://github.com/PowerPlatformToolBox/sample-tools)** for complete, ready-to-use examples demonstrating different frameworks:

-   **[HTML/TypeScript Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/html-sample)** - Basic HTML with TypeScript
-   **[React Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/react-sample)** - React 18 with Vite and TypeScript
-   **[Vue Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/vue-sample)** - Vue 3 with Composition API
-   **[Svelte Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/svelte-sample)** - Svelte 5 with TypeScript

Each sample demonstrates:

-   ToolBox API integration
-   Connection management
-   Event handling
-   Modern build tooling
-   Full TypeScript support

### Getting Started with Tool Development

See **[TOOL_DEVELOPMENT.md](docs/TOOL_DEVELOPMENT.md)** for the complete guide on creating tools.

### Quick Example

```typescript
/// <reference types="@pptb/types" />

// Access the ToolBox API
const toolbox = window.toolboxAPI;

// Get connection context
const context = await toolbox.getToolContext();
console.log("Connection URL:", context.connectionUrl);
console.log("Access Token:", context.accessToken);

// Subscribe to events
toolbox.onToolboxEvent((event, payload) => {
    console.log("Event:", payload.event, "Data:", payload.data);
});

// Show notifications
await toolbox.showNotification({
    title: "Success",
    body: "Operation completed successfully",
    type: "success",
});
```

## Getting Started

### Prerequisites

-   Node.js 18 or higher
-   pnpm 10 or higher (recommended package manager)

### Installation

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

```bash
pnpm start
```

### Development

For development with Vite's built-in hot module replacement (HMR):

```bash
pnpm run dev
```

This starts the Vite dev server with Electron, providing fast refresh for renderer process changes.

For watch mode (continuous compilation):

```bash
pnpm run watch
```

### Linting

Check code quality:

```bash
pnpm run lint
```

### Bundle Analysis

After building, view bundle composition reports:

```bash
# Build the project first
pnpm run build

# View bundle analysis reports (in browser)
open dist/stats-main.html      # Main process bundle
open dist/stats-renderer.html  # Renderer process bundle
```

The reports show module sizes, dependencies, and optimization opportunities. See [BUILD_OPTIMIZATION.md](docs/BUILD_OPTIMIZATION.md) for details.

### Packaging

Build distributable packages:

```bash
pnpm run package
```

This will create installers for your platform in the `build/` directory.

## Tools provided by the Tool Box

Tools are npm packages with specific structure that extend the Power Platform Tool Box functionality. The Tool Box uses pnpm to install tools, which provides:

-   **Isolated installations**: Each tool is installed in its own isolated folder to avoid dependency conflicts
-   **Disk space optimization**: pnpm uses a content-addressable store with symlinks, significantly reducing disk space usage
-   **Fast installations**: Packages are cached globally and reused across projects

### Installing Tools

Users can install tools directly from the application:

1. Navigate to the Tool MArketplace within the app
2. Search for the tool and click on `Install` button on the tool
3. The tool will be installed, loaded, and activated automatically

### Tool Security

-   Each tool runs in an isolated Node.js process
-   Tools communicate with ToolBox via secure IPC protocol
-   Tools only have access to the `Power Platform Tool Box` API
-   No direct access to file system, Electron, or Node.js APIs

## Dataverse Connections

Create connections to Dataverse environments:

1. Navigate to "Connections" tab
2. Click "Add Connection"
3. Follow the prompt

## Auto-Updates

The application supports automatic updates to keep your ToolBox up to date:

### Enabling Auto-Updates

1. Navigate to "Settings" tab
2. Check the "Auto Update" checkbox
3. The application will automatically check for updates every 6 hours

### Manual Update Check

1. Navigate to "Settings" tab
2. Click "Check for Updates" button
3. If an update is available, you'll be prompted to download it
4. Once downloaded, restart the application to install the update

### Update Process

-   Updates are downloaded in the background
-   You control when to install updates
-   Updates are published via GitHub releases
-   The application checks for updates on startup (if auto-update is enabled)

## Troubleshooting

### Electron won't start

Getting the following error `throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');`

Manually trigger Electron's install script

```bash
node node_modules/electron/install.js
```

## Documentation

-   **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Application architecture overview
-   **[TOOL_HOST_ARCHITECTURE.md](docs/TOOL_HOST_ARCHITECTURE.md)** - Detailed Tool Host architecture
-   **[TOOL_DEVELOPMENT.md](docs/TOOL_DEVELOPMENT.md)** - Complete guide for tool developers
-   **[TERMINAL_USAGE.md](docs/TERMINAL_USAGE.md)** - Terminal API usage guide for tool developers
-   **[TERMINAL_SETUP.md](docs/terminal-setup.md)** - Terminal setup guide for Oh-My-Posh, Starship, and other prompt themes
-   **[Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools)** - Working examples of tools using different frameworks
-   **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to the project

## Discussions

If you want to have any discussions on any feature, please use the [Discussion Board](https://github.com/PowerPlatform-ToolBox/desktop-app/discussions).

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to the project.

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://powermaverick.dev/"><img src="https://avatars.githubusercontent.com/u/36135520?v=4?s=100" width="100px;" alt="Danish Naglekar"/><br /><sub><b>Danish Naglekar</b></sub></a><br /><a href="#question-Power-Maverick" title="Answering Questions">💬</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Code">💻</a> <a href="#content-Power-Maverick" title="Content">🖋</a> <a href="#design-Power-Maverick" title="Design">🎨</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Documentation">📖</a> <a href="#infra-Power-Maverick" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#security-Power-Maverick" title="Security">🛡️</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Tests">⚠️</a> <a href="#tool-Power-Maverick" title="Tools">🔧</a> <a href="#tutorial-Power-Maverick" title="Tutorials">✅</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
