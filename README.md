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

<p align="center">
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-build.yml" alt="Nightly Pre-Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-build.yml/badge.svg?branch=main"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/release.yml" alt="Prod Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/release.yml/badge.svg"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/blob/master/LICENSE" alt="License">
      <img src="https://img.shields.io/github/license/PowerPlatformToolBox/desktop-app"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql" alt="CodeQL">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql/badge.svg"/>
    </a>
</p>

<p align="center">
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/releases/latest" alt="GH Prod Release">
      <img src="https://img.shields.io/github/downloads/PowerPlatformToolBox/desktop-app/latest/total?label=Production%20Build" />
    </a>
    <a href="https://www.powerplatformtoolbox.com" alt="Website">
      <img src="https://img.shields.io/website?url=https%3A%2F%2Fwww.powerplatformtoolbox.com" />
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app" alt="GitHub Stars">
      <img src="https://img.shields.io/github/stars/PowerPlatformToolBox/desktop-app?label=github%20stars" />
    </a>
</p>

<h3 align="center">
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issues-form-feature-request.yaml">Feature request</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issue-form-bug.yml">Report a bug</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://github.com/PowerPlatformToolBox/pptb-web/issues/new?template=tool-submission.yml">Tool Submission</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/discussions/categories/q-a">Support</a>
</h3>

<hr />

-   [Features Overview](#features-overview)
-   [Architecture](#architecture)
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

The application uses a **robust Tool Host architecture** inspired by VS Code's Extension Host.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for more information.

## Security Model

-   **Process Isolation**: Each tool runs in a separate Node.js process
-   **Structured IPC**: All communication via validated message protocol
-   **Limited API Surface**: Tools only access specific ToolBox APIs
-   **No Direct Access**: Tools cannot access file system, Electron APIs, or other tools

## Tool Development

Power Platform Tool Box uses a secure, extensible Tool Host architecture that allows developers to create custom tools as npm packages. Tools run in isolated processes and communicate with the ToolBox through a secure API.

See **[TOOL_DEV.md](docs/TOOL_DEV.md)** for the complete guide on creating tools.

### Testing Tools Locally

You can test your tools locally during development without publishing to npm. This enables rapid iteration using watch mode:

1. Navigate to the **Debug** section in ToolBox
2. Use **Load Local Tool** to select your tool directory
3. Make changes with watch mode running (`npm run build -- --watch`)
4. Reload the tool in ToolBox to see updates

See **[LOCAL_TOOL_TESTING.md](docs/LOCAL_TOOL_TESTING.md)** for a complete step-by-step guide.

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
-   **[LOCAL_TOOL_TESTING.md](docs/LOCAL_TOOL_TESTING.md)** - Step-by-step guide for testing tools locally without publishing
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
