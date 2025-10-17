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
-   [Architecture](#architecture)
    -   [Main Process (`src/main/`)](#main-process-srcmain)
    -   [API Layer (`src/api/`)](#api-layer-srcapi)
    -   [Renderer Process (`src/renderer/`)](#renderer-process-srcrenderer)
    -   [Types (`src/types/`)](#types-srctypes)
-   [Security Model](#security-model)
-   [Tool Development](#tool-development)
    -   [Quick Example](#quick-example)
    -   [Contribution Points (package.json)](#contribution-points-packagejson)
-   [Getting Started](#getting-started)
    -   [Prerequisites](#prerequisites)
    -   [Installation](#installation)
    -   [Development](#development)
    -   [Linting](#linting)
    -   [Packaging](#packaging)
-   [Tool Development](#tool-development-1)
    -   [Requirements](#requirements)
    -   [Example Tools](#example-tools)
    -   [Installing Tools](#installing-tools)
    -   [Tool Security](#tool-security)
-   [Dataverse Connections](#dataverse-connections)
-   [Auto-Updates](#auto-updates)
    -   [Enabling Auto-Updates](#enabling-auto-updates)
    -   [Manual Update Check](#manual-update-check)
    -   [Update Process](#update-process)
-   [Event System](#event-system)
-   [Documentation](#documentation)
-   [🔉 Discussions](#-discussions)
-   [License](#license)
-   [Contributing](#contributing)

## Features

-   **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
-   **🔒 Secure Tool Host**: VS Code Extension Host-inspired architecture for isolated tool execution
-   **🔗 Dataverse Connections**: Create and manage connections to Dataverse environments
-   **⚙️ Settings Management**:
    -   User settings for the ToolBox application
    -   Individual tool-specific settings
-   **🎨 Modern Interface**: Clean, modern UI that showcases tools and their details
-   **📡 Event-Driven API**: ToolBox provides its own APIs that emit events
-   **🔔 Notifications**: Built-in notification system to keep users informed
-   **🔄 Auto-Updates**: Automatic application updates with user control

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

-   **index.html**: Main application UI
-   **styles.css**: Modern, responsive styling
-   **renderer.ts**: UI logic and interaction handlers

### Types (`src/types/`)

-   Comprehensive TypeScript type definitions for all application entities
-   Tool contribution points and Tool Host protocol types

## Security Model

-   **Process Isolation**: Each tool runs in a separate Node.js process
-   **Structured IPC**: All communication via validated message protocol
-   **Limited API Surface**: Tools only access specific ToolBox APIs
-   **No Direct Access**: Tools cannot access file system, Electron APIs, or other tools

## Tool Development

Tools are npm packages that follow a specific structure. See [TOOL_DEVELOPMENT.md](docs/TOOL_DEVELOPMENT.md) for detailed guide.

### Quick Example

```javascript
// Tool entry point
const pptoolbox = require("pptoolbox");

function activate(context) {
    // Register a command
    const cmd = pptoolbox.commands.registerCommand("myTool.action", async () => {
        await pptoolbox.window.showInformationMessage("Hello!");
    });

    context.subscriptions.push(cmd);
}

function deactivate() {
    // Cleanup handled automatically
}

module.exports = { activate, deactivate };
```

### Contribution Points (package.json)

```json
{
    "contributes": {
        "commands": [
            {
                "command": "myTool.action",
                "title": "My Action",
                "category": "My Tool"
            }
        ]
    },
    "activationEvents": ["onCommand:myTool.action"]
}
```

## Getting Started

### Prerequisites

-   Node.js 18 or higher
-   npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/PowerPlatform-ToolBox/desktop-app.git
cd desktop-app
```

2. Install dependencies:

```bash
npm install
```

3. Build the application:

```bash
npm run build
```

4. Run the application:

```bash
npm start
```

### Development

For development with hot-reload:

```bash
npm run watch
```

In a separate terminal:

```bash
npm run dev
```

### Linting

Check code quality:

```bash
npm run lint
```

### Packaging

Build distributable packages:

```bash
npm run package
```

This will create installers for your platform in the `build/` directory.

## Tool Development

Tools are npm packages with specific structure and contribution points.

### Requirements

A tool must:

1. Be published as an npm package
2. Include proper metadata in `package.json`:

    - `name`: Unique package name (e.g., `@powerplatform/my-tool`)
    - `version`: Semantic version
    - `description`: Tool description
    - `displayName`: Human-readable name (optional)
    - `author`: Tool author

3. Export `activate(context)` and `deactivate()` functions
4. Use the `pptoolbox` API for ToolBox integration

### Example Tools

Multiple framework examples are available in the `examples/` directory:

-   **[example-tool](examples/example-tool/)** - Basic HTML/TypeScript example
-   **[react-example](examples/react-example/)** - React 18 with TypeScript and Vite
-   **[vue-example](examples/vue-example/)** - Vue 3 with Composition API and Vite
-   **[svelte-example](examples/svelte-example/)** - Svelte 5 with TypeScript and Vite

Each example demonstrates:

-   ToolBox API integration
-   Connection management
-   Event handling
-   Modern build tooling
-   TypeScript support

For detailed documentation, see [TOOL_DEVELOPMENT.md](docs/TOOL_DEVELOPMENT.md).

### Installing Tools

Users can install tools directly from the application:

1. Click "Install Tool" button
2. Enter the npm package name (e.g., `@powerplatform/example-tool`)
3. The tool will be installed, loaded, and activated automatically

### Tool Security

-   Each tool runs in an isolated Node.js process
-   Tools communicate with ToolBox via secure IPC protocol
-   Tools only have access to the `pptoolbox` API
-   No direct access to file system, Electron, or Node.js APIs

## Dataverse Connections

Create connections to Dataverse environments:

1. Navigate to "Connections" tab
2. Click "Add Connection"
3. Provide:
    - Connection name
    - Environment URL
    - Client ID (optional)
    - Tenant ID (optional)

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

## Event System

The ToolBox emits events for various operations:

-   `tool:loaded` - When a tool is loaded
-   `tool:unloaded` - When a tool is unloaded
-   `tool:activated` - When a tool is activated
-   `tool:deactivated` - When a tool is deactivated
-   `connection:created` - When a connection is created
-   `connection:updated` - When a connection is updated
-   `connection:deleted` - When a connection is deleted
-   `settings:updated` - When settings are updated
-   `notification:shown` - When a notification is shown

## Documentation

-   **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Application architecture overview
-   **[TOOL_HOST_ARCHITECTURE.md](docs/TOOL_HOST_ARCHITECTURE.md)** - Detailed Tool Host architecture
-   **[TOOL_DEVELOPMENT.md](docs/TOOL_DEVELOPMENT.md)** - Complete guide for tool developers
-   **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to the project

## 🔉 Discussions

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
