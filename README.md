<p align="center">
    <p align="center">
        <img src="assets/icon.png" height=200 width=200/>
    </p>
</p>

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
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-release.yml" alt="Nightly Pre-Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-release.yml/badge.svg"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/prod-release.yml" alt="Prod Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/prod-release.yml/badge.svg"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/blob/master/LICENSE" alt="License">
      <img src="https://img.shields.io/github/license/PowerPlatformToolBox/desktop-app"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql" alt="CodeQL">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql/badge.svg"/>
    </a>
</p>

<p align="center">
    <a href="https://github.com/PowerPlatformToolBox/pptb-web/actions/workflows/check-updates.yml" alt="Tool Update Status">
      <img src="https://github.com/PowerPlatformToolBox/pptb-web/actions/workflows/check-updates.yml/badge.svg" />
    </a>
    <a href="https://www.powerplatformtoolbox.com" alt="Website">
      <img src="https://img.shields.io/website?url=https%3A%2F%2Fwww.powerplatformtoolbox.com" />
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app" alt="GitHub Stars">
      <img src="https://img.shields.io/github/stars/PowerPlatformToolBox/desktop-app?label=github%20stars" />
    </a>
</p>

<p align="center">
  <a href="docs/TOOL_DEV.md">
    <img src="https://img.shields.io/badge/build_your_own_tool-getting_started-a541ff?style=for-the-badge&logo=npm&labelColor=0354a3" alt="Download for Windows" />
  </a>
</p>

<p align="center">
  <span style="font-size:large;font-weight:bold">Downloads</span><br /><br />
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/releases/latest/download/Power-Platform-Tool-Box-Setup.exe">
    <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/releases/latest/download/Power-Platform-Tool-Box.dmg">
    <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
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

> [!IMPORTANT]
> macOS users: If you see a "damaged" or "unidentified developer" warning after installation, run the following command in the terminal to mark the app as safe:
> `xattr -cr "/Applications/Power Platform Tool Box.app"`

- [Known Issues](#known-issues)
- [Features Overview](#features-overview)
- [Architecture](#architecture)
- [Security Model](#security-model)
- [Tool Development](#tool-development)
  - [Sample Tools Repository](#sample-tools-repository)
- [ToolBox development](#toolbox-development)
  - [Installing Tools](#installing-tools)
  - [Tool Security](#tool-security)
- [Dataverse Connections](#dataverse-connections)
- [Releases \& Downloads](#releases--downloads)
  - [Download Latest Release](#download-latest-release)
- [Auto-Updates](#auto-updates)
  - [Enabling Auto-Updates](#enabling-auto-updates)
  - [Manual Update Check](#manual-update-check)
  - [Update Process](#update-process)
- [Telemetry and Monitoring](#telemetry-and-monitoring)
  - [Key Features](#key-features)
  - [Configuration](#configuration)
- [Documentation](#documentation)
  - [Porting XrmToolBox Tools](#porting-xrmtoolbox-tools)
- [Discussions](#discussions)
- [License](#license)
- [Team](#team)
- [Contributors](#contributors)

## Known Issues

-   Auto-Update does not work for macOS users as it needs Apple Developer Id (still working through that process)

## Features Overview

-   **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
-   **🔒 Secure Tool Host**: VS Code Extension Host-inspired architecture for isolated tool execution
-   **🛡️ Per-Tool CSP**: Content Security Policy configuration with user consent for external resource access
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
-   **Per-Tool CSP**: Tools request specific Content Security Policy exceptions with user consent (see [CSP Configuration](docs/CSP_CONFIGURATION.md))

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

## Telemetry and Monitoring

Power Platform Tool Box includes optional telemetry and monitoring using [Azure Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview). This helps track application health, usage patterns, and errors to improve the application quality and user experience.

### Key Features

- **Application lifecycle tracking** - Monitor app start, ready, quit events
- **Tool usage analytics** - Track tool installations and usage patterns  
- **Connection monitoring** - Monitor authentication and connection health
- **Error tracking** - Automatically capture unhandled exceptions and errors
- **Performance metrics** - Track operation durations and custom metrics
- **Privacy-first** - Uses anonymous machine IDs, no PII collected

### Configuration

Telemetry is **completely optional** and disabled by default. To enable:

1. Create an Azure Application Insights resource
2. Add the connection string to your `.env` file:
   ```bash
   APPINSIGHTS_CONNECTION_STRING=your-connection-string
   ```
3. Build and run the application

See [Telemetry Documentation](docs/TELEMETRY.md) for complete details on configuration, tracked events, privacy, and monitoring.

## Documentation

-   **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Application architecture overview
-   **[TOOLBOX_DEV.md](docs/TOOLBOX_DEV.md)** - Getting started with Tool Box development process
-   **[TOOL_DEV.md](docs/TOOL_DEV.md)** - Complete guide for tool developers
-   **[TELEMETRY.md](docs/TELEMETRY.md)** - Application Insights telemetry and monitoring guide
-   **[ICON_GUIDELINES.md](docs/ICON_GUIDELINES.md)** - Application icon requirements and best practices
-   **[Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools)** - Working examples of tools using different frameworks

### Porting XrmToolBox Tools

-   **[PORTING_XTB_TOOLS.md](docs/porting/PORTING_XTB_TOOLS.md)** - Comprehensive guide for porting XrmToolBox tools to PPTB (recommended approach)
-   **[PORTING_DLL_TO_WASM.md](docs/porting/PORTING_DLL_TO_WASM.md)** - Minimal-effort porting using WebAssembly/Blazor to reuse .NET DLLs
-   **[PORTING_QUICK_START.md](docs/porting/PORTING_QUICK_START.md)** - Quick reference for XTB tool porting
-   **[ADR_PORTING_STRATEGY.md](docs/porting/ADR_PORTING_STRATEGY.md)** - Technical rationale for porting strategy decision
-   **[FetchXML Builder Sample](https://github.com/PowerPlatformToolBox/sample-tools/ported-tools/fetchxmlbuilder-sample/)** - Example of a ported XTB tool

## Discussions

If you want to have any discussions on any feature, please use the [Discussion Board](https://github.com/PowerPlatformToolBox/desktop-app/discussions).

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Team

Created & maintained by **[Danish Naglekar (Power Maverick)](https://github.com/Power-Maverick)**

Supporting Team:

-   **[Matt Berg](https://github.com/MattBerg11)** — _The Product Whisperer_  
    Turns ideas into features and chaos into clarity.
-   **[Carl Cookson](https://github.com/LinkeD365)** — _Bug Crusher_ 🐞💥  
    First to test, first to build, first to break things so others don’t.
-   **[Lars Hildebrandt](https://github.com/cyco77)** — _The Box Breaker_ 📦 🚀  
    Always thinking beyond boundaries and making bold ideas actually work.
-   **[Mohsin Mirza](https://github.com/mohsinonxrm)** — _The Triple Threat_ ⚔️  
    Tester, implementor, and tool author — a one-person strike team.
-   **[Oleksandr Olashyn](https://github.com/OOlashyn)** — _The UI Polisher_ 🎨  
    Focused on refining the toolbox UI and elevating the overall experience.
-   **[Oliver Flint](https://github.com/OliverFlint)** — _The Momentum Engine_ ⚡  
     Generates ideas and relentlessly pushes the team forward.

> If you wish to offical be part of the team, please reach out to **[Danish Naglekar (Power Maverick)](https://github.com/Power-Maverick)** for onboarding.

## Contributors

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to the project.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://powermaverick.dev/"><img src="https://avatars.githubusercontent.com/u/36135520?v=4?s=100" width="100px;" alt="Danish Naglekar"/><br /><sub><b>Danish Naglekar</b></sub></a><br /><a href="#question-Power-Maverick" title="Answering Questions">💬</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Code">💻</a> <a href="#content-Power-Maverick" title="Content">🖋</a> <a href="#design-Power-Maverick" title="Design">🎨</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Documentation">📖</a> <a href="#infra-Power-Maverick" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#security-Power-Maverick" title="Security">🛡️</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=Power-Maverick" title="Tests">⚠️</a> <a href="#tool-Power-Maverick" title="Tools">🔧</a> <a href="#tutorial-Power-Maverick" title="Tutorials">✅</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/MattBerg11"><img src="https://avatars.githubusercontent.com/u/25282996?v=4?s=100" width="100px;" alt="Matt Berg"/><br /><sub><b>Matt Berg</b></sub></a><br /><a href="#content-MattBerg11" title="Content">🖋</a> <a href="#design-MattBerg11" title="Design">🎨</a> <a href="#ideas-MattBerg11" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-MattBerg11" title="Maintenance">🚧</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=MattBerg11" title="Documentation">📖</a> <a href="#example-MattBerg11" title="Examples">💡</a> <a href="#projectManagement-MattBerg11" title="Project Management">📆</a> <a href="#tutorial-MattBerg11" title="Tutorials">✅</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.dancingwithcrm.com/"><img src="https://avatars.githubusercontent.com/u/17760686?v=4?s=100" width="100px;" alt="Oleksandr Olashyn (dancingwithcrm)"/><br /><sub><b>Oleksandr Olashyn (dancingwithcrm)</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=OOlashyn" title="Code">💻</a> <a href="#design-OOlashyn" title="Design">🎨</a> <a href="#ideas-OOlashyn" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-OOlashyn" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/LinkeD365"><img src="https://avatars.githubusercontent.com/u/43988771?v=4?s=100" width="100px;" alt="LinkeD365"/><br /><sub><b>LinkeD365</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/issues?q=author%3ALinkeD365" title="Bug reports">🐛</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=LinkeD365" title="Code">💻</a> <a href="#design-LinkeD365" title="Design">🎨</a> <a href="#ideas-LinkeD365" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-LinkeD365" title="Maintenance">🚧</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=LinkeD365" title="Tests">⚠️</a> <a href="#userTesting-LinkeD365" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mohsinonxrm"><img src="https://avatars.githubusercontent.com/u/21046804?v=4?s=100" width="100px;" alt="mohsinonxrm"/><br /><sub><b>mohsinonxrm</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=mohsinonxrm" title="Code">💻</a> <a href="#design-mohsinonxrm" title="Design">🎨</a> <a href="#ideas-mohsinonxrm" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-mohsinonxrm" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.oliverflint.co.uk/"><img src="https://avatars.githubusercontent.com/u/8300688?v=4?s=100" width="100px;" alt="Oliver Flint"/><br /><sub><b>Oliver Flint</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=OliverFlint" title="Code">💻</a> <a href="#design-OliverFlint" title="Design">🎨</a> <a href="#ideas-OliverFlint" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-OliverFlint" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mikefactorial"><img src="https://avatars.githubusercontent.com/u/42348035?v=4?s=100" width="100px;" alt="Mike!"/><br /><sub><b>Mike!</b></sub></a><br /><a href="#ideas-mikefactorial" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=mikefactorial" title="Tests">⚠️</a> <a href="#userTesting-mikefactorial" title="User Testing">📓</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://www.larshildebrandt.de/"><img src="https://avatars.githubusercontent.com/u/1198698?v=4?s=100" width="100px;" alt="Lars Hildebrandt"/><br /><sub><b>Lars Hildebrandt</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=cyco77" title="Code">💻</a> <a href="#design-cyco77" title="Design">🎨</a> <a href="#ideas-cyco77" title="Ideas, Planning, & Feedback">🤔</a> <a href="#plugin-cyco77" title="Plugin/utility libraries">🔌</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

<!--Force Checkin 11/27; 10:00 AM-->
