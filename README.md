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

-   [Features Overview](#features-overview)
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
-   [ToolBox development](#toolbox-development)
    -   [Installing Tools](#installing-tools)
    -   [Tool Security](#tool-security)
-   [Dataverse Connections](#dataverse-connections)
-   [Releases \& Downloads](#releases--downloads)
    -   [Download Latest Release](#download-latest-release)
-   [Auto-Updates](#auto-updates)
    -   [Enabling Auto-Updates](#enabling-auto-updates)
    -   [Manual Update Check](#manual-update-check)
    -   [Update Process](#update-process)
-   [Documentation](#documentation)
    -   [Porting XrmToolBox Tools](#porting-xrmtoolbox-tools)
-   [Discussions](#discussions)
-   [License](#license)
-   [Contributing](#contributing)

## Features Overview

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

## Architecture

TODO needs changing

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

## Security Model

-   **Process Isolation**: Each tool runs in a separate Node.js process
-   **Structured IPC**: All communication via validated message protocol
-   **Limited API Surface**: Tools only access specific ToolBox APIs
-   **No Direct Access**: Tools cannot access file system, Electron APIs, or other tools

## Tool Development

Power Platform Tool Box uses a secure, extensible Tool Host architecture that allows developers to create custom tools as npm packages. Tools run in isolated processes and communicate with the ToolBox through a secure API.

See **[TOOL_DEV.md](docs/TOOL_DEV.md)** for the complete guide on creating tools.

### Sample Tools Repository

Check out the **[sample-tools repository](https://github.com/PowerPlatformToolBox/sample-tools)** for complete, ready-to-use examples demonstrating different frameworks:

-   **[HTML/TypeScript Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/sample/html-sample)** - Basic HTML with TypeScript
-   **[React Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/sample/react-sample)** - React 18 with Vite and TypeScript
-   **[Vue Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/sample/vue-sample)** - Vue 3 with Composition API
-   **[Svelte Sample](https://github.com/PowerPlatformToolBox/sample-tools/tree/main/sample/svelte-sample)** - Svelte 5 with TypeScript

## ToolBox development

See **[TOOLBOX_DEV.md](docs/TOOLBOX_DEV.md)** for the complete guide on creating tools.

### Installing Tools

Users can install tools directly from the application:

1. Navigate to the Tool Marketplace within the app
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

## Releases & Downloads

Power Platform Tool Box releases are published on GitHub:

-   **Stable Releases**: Published when PRs are merged to the `main` branch
-   **Nightly Builds**: Pre-release builds from the `dev` branch (built daily if there are new commits)

### Download Latest Release

Visit the [Releases page](https://github.com/PowerPlatformToolBox/desktop-app/releases) to download:

-   **Windows**: `.exe` installer
-   **macOS**: `.dmg` installer

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

## Documentation

-   **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Application architecture overview
-   **[TOOLBOX_DEV.md](docs/TOOLBOX_DEV.md)** - Getting started with Tool Box development process
-   **[TOOL_DEV.md](docs/TOOL_DEV.md)** - Complete guide for tool developers
-   **[Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools)** - Working examples of tools using different frameworks

### Porting XrmToolBox Tools

-   **[PORTING_XTB_TOOLS.md](docs/porting/PORTING_XTB_TOOLS.md)** - Comprehensive guide for porting XrmToolBox tools to PPTB (recommended approach)
-   **[PORTING_DLL_TO_WASM.md](docs/porting/PORTING_DLL_TO_WASM.md)** - Minimal-effort porting using WebAssembly/Blazor to reuse .NET DLLs
-   **[PORTING_QUICK_START.md](docs/porting/PORTING_QUICK_START.md)** - Quick reference for XTB tool porting
-   **[ADR_PORTING_STRATEGY.md](docs/porting/ADR_PORTING_STRATEGY.md)** - Technical rationale for porting strategy decision
-   **[FetchXML Builder Sample](https://github.com/PowerPlatformToolBox/sample-tools/ported-tools/fetchxmlbuilder-sample/)** - Example of a ported XTB tool

## Discussions

If you want to have any discussions on any feature, please use the [Discussion Board](https://github.com/PowerPlatform-ToolBox/desktop-app/discussions).

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to the project.

> If you wish to offical be part of the team, please reach out to one of the listed contributor below for onboarding.

Offical Team ([emoji key](https://allcontributors.org/docs/en/emoji-key)) are:

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
