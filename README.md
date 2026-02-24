<p align="center">
    <p align="center">
        <img src="assets/icon.png" height=200 width=200/>
    </p>
</p>

<p align="center">
    <h1 align="center">
        Power Platform ToolBox
    </h1>
    <h3 align="center">
        A universal desktop app that contains multiple tools to ease the customization and configuration of Power Platform
    </h3>
    <p align="center">
        This repo is an open-source project for the Power Platform ToolBox (PPTB)
    </p>
</p>

<p align="center">
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-release.yml" alt="Nightly Pre-Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/nightly-release.yml/badge.svg"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/prod-release.yml" alt="Prod Release">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/prod-release.yml/badge.svg"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/pptb-web/actions/workflows/check-updates.yml" alt="Tool Update Status">
      <img src="https://github.com/PowerPlatformToolBox/pptb-web/actions/workflows/check-updates.yml/badge.svg" />
    </a>
</p>

<p align="center">
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/blob/master/LICENSE" alt="License">
      <img src="https://img.shields.io/github/license/PowerPlatformToolBox/desktop-app"/>
    </a>
    <a href="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql" alt="CodeQL">
      <img src="https://github.com/PowerPlatformToolBox/desktop-app/actions/workflows/github-code-scanning/codeql/badge.svg"/>
    </a>
    <a href="https://www.powerplatformtoolbox.com" alt="Website">
      <img src="https://img.shields.io/website?url=https%3A%2F%2Fwww.powerplatformtoolbox.com" />
    </a>
    
</p>

<p align="center">
  <a href="https://github.com/PowerPlatformToolBox/desktop-app" alt="Downloads">
      <img alt="GitHub Downloads (all assets, all releases)" src="https://img.shields.io/github/downloads/PowerPlatformToolBox/desktop-app/total">
  </a>
  <a href="https://github.com/PowerPlatformToolBox/desktop-app" alt="GitHub Stars">
      <img src="https://img.shields.io/github/stars/PowerPlatformToolBox/desktop-app?label=github%20stars" />
  </a>
  <a href="https://github.com/PowerPlatformToolBox/desktop-app" alt="GitHub Release">
      <img alt="GitHub Release" src="https://img.shields.io/github/v/release/PowerPlatformToolBox/desktop-app">

  </a>
</p>

<p align="center">
  <a href="https://docs.powerplatformtoolbox.com/tool-development">
    <img src="https://img.shields.io/badge/build_your_own_tool-getting_started-a541ff?style=for-the-badge&logo=npm&labelColor=0354a3" alt="Download for Windows" />
  </a>
</p>

<p align="center">
  <span style="font-size:large;font-weight:bold">Download</span><br /><br />
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/releases/latest/download/Power-Platform-Tool-Box-Setup.exe">
    <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/releases/latest/download/Power-Platform-Tool-Box.dmg">
    <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
  </a>
</p>

<h3 align="center">
  <a href="https://docs.powerplatformtoolbox.com/quickstart">Quick Start</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://docs.powerplatformtoolbox.com/">Support</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://docs.powerplatformtoolbox.com/authentication">Authentication</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://discord.gg/7ZQzVTngcN">Discord</a>
</h3>

<h3 align="center">
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issues-form-feature-request.yaml">Feature request</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issue-form-bug.yml">Report a bug</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://www.powerplatformtoolbox.com/dashboard">Tool Submission</a>
  <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
  <a href="https://www.powerplatformtoolbox.com/tools">Tool List</a>
</h3>

<hr />

- [Known Issues](#known-issues)
- [Features Overview](#features-overview)
- [Releases \& Downloads](#releases--downloads)
  - [Download Latest Release](#download-latest-release)
  - [Building from Source](#building-from-source)
- [Development Configuration](#development-configuration)
  - [Telemetry and Error Tracking](#telemetry-and-error-tracking)
  - [Environment Variables](#environment-variables)
- [Discussions](#discussions)
- [License](#license)
- [Team](#team)
- [Contributors](#contributors)

## Known Issues

- No open issues currently tracked for installers. Please report problems on GitHub so we can investigate quickly.

## Features Overview

- **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
- **🔒 Secure Tool Host**: VS Code Extension Host-inspired architecture for isolated tool execution
- **🛡️ Per-Tool CSP**: Content Security Policy configuration with user consent for external resource access
- **🔗 Dataverse Connections**: Create and manage connections to Dataverse environments
- **⚙️ Settings Management**:
    - User settings for the ToolBox application
    - Individual tool-specific settings
- **🎨 Modern Interface**: Built with Microsoft Fluent UI components for a consistent, accessible experience aligned with Power Platform
- **📡 Event-Driven API**: ToolBox provides its own APIs that emit events
- **🔔 Notifications**: Built-in notification system to keep users informed
- **🔄 Auto-Updates**: Automatic application updates with user control

> [!IMPORTANT]
> Full documentation of the toolbox including How tos, FAQs, architecture, design & security principles is available on our main website [https://docs.powerplatformtoolbox.com/](https://docs.powerplatformtoolbox.com/)

## Releases & Downloads

Power Platform ToolBox releases are published on GitHub:

- **Stable Releases**: Published when PRs are merged to the `main` branch
- **Insider Builds**: Pre-release builds from the `dev` branch (built daily if there are new commits)

### Download Latest Release

Visit the [Releases page](https://github.com/PowerPlatformToolBox/desktop-app/releases) to download:

- **Windows**: `.exe` installer (x64/ARM64) or portable `.zip` (no admin rights required)
- **macOS**: Signed & notarized `.dmg` (universal) or `.zip` archive
- **Linux**: `.AppImage` (x64)

### Building from Source

To build the application for your platform:

```bash
# Install dependencies
pnpm install

# Build application code
pnpm run build

# Package for your current platform (auto-detects architecture)
pnpm run package
```

**Platform-specific builds:**

```bash
# Windows x64
pnpm run package:win

# Windows ARM64 (for Snapdragon processors)
pnpm run package:win-arm64

# macOS (Universal binary with x64 and ARM64)
pnpm run package:mac

# Linux x64
pnpm run package:linux
```

The packaged application will be available in the `build/` directory.

## Development Configuration

### Telemetry and Error Tracking

Power Platform ToolBox uses [Sentry.io](https://sentry.io) for error tracking and telemetry.
By default, telemetry is enabled to help improve the application. You can disable it in the application settings.

### Environment Variables

The application supports the following environment variables in a `.env` file:

- `SUPABASE_URL` - Your Supabase project URL (required for tool registry)
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key (required for tool registry)
- `SENTRY_DSN` - Your Sentry DSN for error tracking (optional)
- `SENTRY_AUTH_TOKEN` - Your Sentry auth token for source map upload (optional, production only)
- `SENTRY_ORG` - Your Sentry organization slug (optional, production only)
- `SENTRY_PROJECT` - Your Sentry project slug (optional, production only)

All environment variables are injected at build time and not exposed in the final bundle.

## Discussions

If you want to have any discussions on any feature, tool or ideas for a tool, please join us on [Discord](https://discord.gg/7ZQzVTngcN).

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Team

Created & maintained by **[Danish Naglekar (Power Maverick)](https://github.com/Power-Maverick)**

Supporting Team:

- **[Matt Berg](https://github.com/MattBerg11)** — _The Product Whisperer_  
  Turns ideas into features and chaos into clarity.
- **[Carl Cookson](https://github.com/LinkeD365)** — _Bug Crusher_ 🐞💥  
  First to test, first to build, first to break things so others don’t.
- **[Lars Hildebrandt](https://github.com/cyco77)** — _The Box Breaker_ 📦 🚀  
  Always thinking beyond boundaries and making bold ideas actually work.
- **[Mohsin Mirza](https://github.com/mohsinonxrm)** — _The Triple Threat_ ⚔️  
  Tester, implementor, and tool author — a one-person strike team.
- **[Oleksandr Olashyn](https://github.com/OOlashyn)** — _The UI Polisher_ 🎨  
  Focused on refining the toolbox UI and elevating the overall experience.
- **[Oliver Flint](https://github.com/OliverFlint)** — _The Momentum Engine_ ⚡  
   Generates ideas and relentlessly pushes the team forward.
- **[Mike Ochs](https://github.com/mikefactorial)** - _The Idea Factory_ 💡  
   Constantly brainstorming new features and improvements to keep the toolbox evolving.

> If you wish to officially be part of the team, please reach out to **[Danish Naglekar (Power Maverick)](https://github.com/Power-Maverick)** for onboarding.

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
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/darkwheel"><img src="https://avatars.githubusercontent.com/u/37546897?v=4?s=100" width="100px;" alt="darkwheel"/><br /><sub><b>darkwheel</b></sub></a><br /><a href="https://github.com/Power-Maverick/PowerPlatformToolBox/issues?q=author%3Adarkwheel" title="Bug reports">🐛</a> <a href="https://github.com/Power-Maverick/PowerPlatformToolBox/commits?author=darkwheel" title="Code">💻</a> <a href="#maintenance-darkwheel" title="Maintenance">🚧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

<!--Force Checkin 02/15/26; 10:47 PM-->
