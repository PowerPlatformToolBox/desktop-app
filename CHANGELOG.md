# Changelog

## v1.2.1 (2026-04-02)

### Highlights

- Import connections from XrmToolBox XML with a source selection step (XTB vs PPTB)
- Share and move connections via import/export connection files
- Review "What's New" after updates via in-app auto-update notifications
- Manage Settings as a dedicated tab, plus a Settings entry in the View menu
- Browse Community Resources with dynamic, Supabase-backed links
- Connect to US Government Dataverse environments (GCC High / DoD URL support)
- Customize connection list visuals with category/environment color border appearance settings
- Control startup behavior with an option to disable session restore

### Fixes

- Auto-update: fixed force-close TypeError ("Object has been destroyed") during modal teardown
- Global search: fixed command palette rendering behind active tool BrowserViews
- Tools: improved dual-connection handling and corrected dual-connection tab color split
- UI: fixed BrowserView sizing and spurious connection prompts after force-reload
- Auto-update: loading overlay no longer blocks system dialogs (always-on-top conflicts removed)
- Protocol handler: fixed `pptb://` handling in development mode when explicitly enabled

### Developer & Build

- toolboxAPI: deprecated `showLoading`/`hideLoading` to reduce API surface and clarify usage
- DevTools: open in detached mode for main and tool windows
- Release automation: avoid draft release creation and switch nightly versioning to `dev` tags

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.2.0...v1.2.1

## v1.2.0 (2026-03-09)

### Highlights

- Global search command palette in the activity bar for faster navigation and commands
- Tool details open as a tab (instead of a modal) for smoother browsing and install decisions
- Tool version compatibility checking to prevent running incompatible tools
- Marketplace content moved to Azure Blob storage for improved reliability and load performance
- `pptb://` protocol handler to install tools directly from links
- Connections: category filter/grouping plus environment color and browser-profile badges in selection modals
- CSP exceptions: toolmakers can explain why an exception is needed with optional per-domain user consent
- Update UX uses a themed in-app modal instead of native OS dialogs

### Fixes

- Auto-update: "Restart & Install Now" now triggers the update correctly
- Auto-update: update notification always-on-top behavior respects the configured option
- Tools: tool tabs and launch logic correctly handle environment names in tab titles
- Dataverse: entity collection bound actions/functions are handled correctly
- Dataverse: date values in function parameters are formatted correctly
- Notifications: toast behavior no longer forces always-on-top

### Developer & Build

- Added `pptb-validate` CLI for pre-publish tool validation (`packages/bin/pptb-validate.js`)
- Added CI workflow to publish `@pptb/types` with improved npm auth and environment isolation
- Added build preflight checks to validate app version and ensure release notes are updated
- Release workflows: refined versioning scheme and improved cross-platform artifact merge scripts
- Telemetry: removed Sentry monitoring in favor of the centralized logger

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.1.3...v1.2.0

## v1.1.3 (2026-02-18)

### Highlights

- Hardened tool filesystem sandbox so tools can only access user-selected paths and system directories are blocked
- Connection sign-in supports choosing Chrome/Edge plus a specific browser profile to better isolate sessions per connection
- Signed Windows installers (EXE/MSI) via Azure Trusted Signing and repackaged portable ZIPs with signed binaries
- Release metadata now records correct SHA256 and SHA512 hashes for stronger artifact integrity verification
- macOS release pipeline notarizes and staples DMG/ZIP/PKG artifacts with improved signing verification steps
- Dataverse API adds metadata CRUD operations and a `getCSDLDocument` helper for retrieving the OData CSDL document
- Save dialogs support optional file-type filters with extension-based default filter derivation
- Loading overlay positioning is fixed and includes a manual dismiss button

### Fixes

- Connections: hardened auth/session isolation to reduce cross-connection token and browser profile leakage
- macOS notarization and stapling no longer skips artifacts and handles unavailable submission logs more reliably
- macOS code signing verification avoids premature `spctl --assess` failures before notarization/stapling completes
- Release workflows regenerate Windows update metadata with correct SHA256/SHA512 after signing
- Tool filesystem reads/writes now enforce explicit user-consent access and reject unsafe/system paths
- Connection and toolbox API handling is more robust for multi-connection scenarios and updated connection fields
- Release workflow date formatting is consistent across jobs and platforms

### Developer & Build

- `dataverseAPI` types expand with metadata CRUD operations and `getCSDLDocument`
- `toolboxAPI.fileSystem.saveFile` supports filters and derives defaults from filename extensions
- Added `BrowserManager` for browser detection and profile enumeration used by interactive auth flows
- Signing/notarization scripts and workflows improved for multi-artifact pipelines and better diagnostics

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.1.2...v1.1.3

## v1.1.2 (2026-02-09)

### Highlights

- MSAL-based authentication isolates tokens per connection and validates access with WhoAmI for more reliable sign-in
- Troubleshooting modal runs configuration checks and surfaces Sentry diagnostics to speed up support and debugging
- Tool updates show inline progress and accessible status feedback while tools are updating
- Terminal UI hides the Terminal button when no terminals exist and includes additional terminal reliability improvements
- Tool menu adds dynamic feedback and quick DevTools options for tool developers
- Dataverse API expands with solution deployment/import status helpers and relationship associate/disassociate endpoints
- Windows and macOS release pipelines improve signing/notarization handling for more trustworthy installers

### Fixes

- Dataverse Functions now format parameters correctly, avoiding invocation failures
- Packaged app avoids `ERR_REQUIRE_ESM` issues by properly handling externalized telemetry dependencies
- Modal dialogs no longer remain always-on-top after closing on Windows 11
- Connection context menu no longer renders behind BrowserViews
- Settings form populates correctly on app reload and avoids duplicate IPC handler registration on macOS window recreation
- macOS notarization scripts handle missing modules/unavailable submission logs and clarify submission/status output
- Authentication token reuse/refresh reduces unexpected expiry prompts with proactive refresh and expiry detection

### Developer & Build

- Telemetry identifiers switch from machine ID to install ID for privacy-safe, stable analytics
- Windows packaging adds ARM64 support, MSI targets, and refactored electron-builder configurations
- macOS signing/notarization workflows add submission/status retrieval steps and improved error handling
- `dataverseAPI` types add `deploySolution`, `getImportJobStatus`, and `associate`/`disassociate` helpers
- `toolboxAPI` adds a `fileSystem` API set (path validation + updated publish/selectPath flows)
- Sentry logging helpers and noise reduction improve production diagnostics signal-to-noise

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.1.1...v1.1.2

## v1.1.1 (2026-01-19)

### Highlights

- Settings changes now queue until Save, preventing accidental toggles from instantly applying across the app
- Installed tools, favorites, and connection icons hot-swap with the active theme so “more” and star glyphs always stay legible
- Connections sidebar adds a default Last Used sort plus synchronized filters for faster environment switching
- Single and multi-connection pickers share the same search, filter, and Last Used ordering for a consistent selection flow
- Marketplace install button adopts a compact icon-only style with spinner feedback and refreshed badges
- Activity bar hover/active treatments gain higher-contrast light-theme colors for clearer navigation cues

### Fixes

- Resolved theme mismatches where tool more-menu and favorite icons failed to refresh after switching themes
- Fixed connection sidebar filter buttons whose active state and backgrounds ignored the current theme palette
- Corrected marketplace install hover contrast and badge radius so labels read cleanly in both themes
- Activity items now render hover and active states in light mode, restoring visual focus feedback
- Select connection and multi-connection modals now honor the saved Last Used sort instead of falling back to alphabetical order

### Developer & Build

- SettingsManager seeds `connectionsSort` to `last-used` and sanitizes persisted values for predictable ordering
- `UIConnectionData` carries `lastUsedAt`/`createdAt`, enabling tool authors to build smarter connection pickers
- Modal controller scripts share timestamp-based sorting helpers and guard filter dropdown state handling

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.1.0...v1.1.1

## v1.1.0 (2026-01-13)

### Highlights

- VS Code-style search, filter, and sorting with saved preferences across app sections for faster discovery
- Theme-aware modal refresh with improved accessibility, contrast, and consistent styling
- Homepage and theme updates with refreshed icons and marketplace visuals
- Multi-connection tooling improvements: side-by-side layouts, secondary footer display, and lifecycle status visibility
- Tool insights: source indicators (Registry/NPM/Local), related links, version badges, analytics for downloads/MAU
- Dataverse upgrades: bulk operations support, formatted FetchXML values, `getEntitySetName` helper, improved mappings
- Telemetry and diagnostics: Sentry instrumentation, machine ID tracking, Application Insights hookup, richer About dialog

### Fixes

- Resolved macOS window recreation duplicate IPC handlers
- Fixed override client ID clearing for interactive authentication flows
- Settings form now persists correctly after reload; settings and connection events emit reliably without duplicates
- Toast reconnect actions, connection footer colors, and badge palettes now honor theme/environment contrast
- Addressed race conditions in tool context initialization and improved CSP handling for tools
- Debug menu/npm-local tool loading reliability improvements

### Developer & Build

- Marketplace shows tool versions and related links; multi-connection support for npm/local tools
- Structured logging and breadcrumb tracing via Sentry; Application Insights connection string support in pipelines
- Modular renderer architecture and better modal management for maintainability

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.7...v1.1.0

## v1.0.7 (2025-12-10)

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.6...v1.0.7

## v1.0.6 (2025-11-11)

### Bug Fix - Windows Antivirus False Positive

-   **Fixed antivirus false positive detection in v1.0.5**

    -   Rebuilt `icons/icon.ico` with multiple icon sizes (16, 32, 48, 64, 96, 128, 256)
    -   Previous v1.0.5 icon had only a single 256x256 PNG which triggered false positives
    -   New icon follows Microsoft Windows icon guidelines with proper multi-resolution format
    -   Icon file size increased from 20KB to 154KB to include all required resolutions
    -   This fix addresses Windows Defender and other antivirus software flagging the installer as malicious

-   **Technical Details**
    -   Used ImageMagick to generate properly formatted ICO file from source PNG
    -   Included standard Windows icon sizes for proper display at all resolutions
    -   Follows industry best practices for Electron application icons

## v1.0.5 (2025-11-10)

### Highlights

- Add app icon to README for improved visual appeal
- Implement token refresh and expiry management
- Add missing updateTool functionality to fix tool update error
- Add tool icons to marketplace items and move installed badge to footer

### Fixes

- Fix authentication response to return refreshToken instead of homeAccountId
- Fix duplicate token expiry notifications
- Fix footer connection status not updating on app load
- Fix footer connection status to show expired state

### Developer & Build

- update publishing steps in Tool Development Guide
- Refactor README.md: Update downloads section and remove local testing instructions
- Add @mikefactorial as a contributor

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.4...v1.0.5

## v1.0.4 (2025-11-05)

### Highlights

- update release workflow to prepare release files and generate release notes
- add step to prepare release files and copy necessary artifacts

### Fixes

- Fix auto-updater to use ZIP files for macOS updates
- Fix duplicate filename issue in release artifacts
- update checkout step to use the correct branch for release workflow
- Fix Release.yml create-release "Not Found" error

### Developer & Build

- update version to 1.0.4 and restore pull request template
- test auto-update
- bump version to 1.0.2 in package.json

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.3...v1.0.4

## v1.0.3 (2025-11-05)

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.2...v1.0.3

## v1.0.2 (2025-11-05)

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.1...v1.0.2

## v1.0.1 (2025-11-04)

### Highlights

- Add macOS platform check in afterPack script
- Add gatekeeper assessment and quarantine removal script for macOS builds
- Add manual trigger to prod-release workflow
- Address code review feedback - improve security and type safety

### Fixes

- Fix macOS package corruption by adding identity: null to mac build config
- Remove getLatestToolVersion IPC handler and update renderer to use checkToolUpdates
- Fix intake-validation.yml workflow: improve error handling for npm audit
- Fix CodeQL security vulnerability: Use spawn instead of exec to prevent command injection

### Developer & Build

- Bump version to 1.0.1 in package.json
- Remove legacy build scripts and migrate configuration files
- Add testing notice to nightly build release notes

Full Changelog: https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.0...v1.0.1

## v1.0.0 (2025-11-01)

### Highlights

- Add step to delete old pre-releases before creating new ones
- Add Fluent UI styled toastr notifications
- Replace OOTB notifications with toastr custom notifications
- Enhance debugging and build process for Electron app

### Fixes

- Fix shell script to handle special characters and increase limit
- Remove default toastr icons and adjust toast container styles for improved visibility
- Update toastr position class to bottom-right for better visibility
- Fix XSS vulnerability in settings-api-example.html by escaping HTML

### Developer & Build

- Refactor notification styles to use SCSS variables
- improve validation consistency across all new methods
- Refactor README.md for clarity and consistency in section titles

## Recent Updates (2025-10-19)

### CSS Organization and CI/CD Improvements

-   **Migrated to SCSS with Modular Organization**

    -   Converted `styles.css` (2,216 lines) to `styles.scss`
    -   Created modular structure with `_variables.scss` and `_mixins.scss`
    -   Implemented SCSS variables for colors, spacing, typography, and z-index
    -   Created reusable mixins for flexbox, cards, buttons, and scrollbars
    -   Utilized SCSS nesting for better code organization
    -   Leveraged modern `@use` syntax (avoiding deprecated `@import`)
    -   Updated `index.html` to reference `styles.scss`

-   **Added CI/CD Bundle Size Tracking**

    -   Created GitHub Actions workflow (`bundle-size.yml`)
    -   Automated bundle size analysis on PRs and pushes
    -   Automatic PR comments with bundle size reports
    -   Bundle analysis artifacts uploaded for detailed review
    -   Configurable size limit checks with warnings
    -   Prevents bundle bloat through continuous monitoring

-   **Documentation**
    -   Updated `docs/BUILD_OPTIMIZATION.md` with SCSS organization guide
    -   Added CI/CD bundle tracking documentation
    -   Included examples for custom size limit checks

## Recent Updates (2025-10-18)

### Build Optimizations and ESM Migration

-   **Added Bundle Analysis**

    -   Integrated `rollup-plugin-visualizer` for bundle size analysis
    -   Generates visual reports for main and renderer processes
    -   Reports show module sizes (gzipped and brotli compressed)
    -   Treemap, sunburst, and network visualizations available
    -   Output files: `dist/stats-main.html` and `dist/stats-renderer.html`

-   **Configured Code Splitting**

    -   Automatic vendor chunk separation for better caching
    -   Manual chunks configuration for custom split points
    -   Improved load times and parallel loading
    -   Better browser caching of vendor dependencies

-   **Added CSS Preprocessing Support**

    -   Integrated Sass/SCSS preprocessor
    -   Configuration for global SCSS variables and mixins
    -   Support for Less, Stylus, and PostCSS out of the box
    -   Preprocessor options configurable in `vite.config.ts`

-   **Full ESM Migration**

    -   Migrated all `require()` calls to ES6 `import` statements
    -   Improved tree-shaking and bundle optimization
    -   Better static analysis and type checking
    -   Future-proof module system aligned with ECMAScript standards
    -   Refactored `child_process` imports in `toolsManager.ts`
    -   Refactored file system imports in `vite.config.ts`

-   **Documentation**
    -   Created comprehensive `docs/BUILD_OPTIMIZATION.md` guide
    -   Updated README.md with bundle analysis instructions
    -   Added troubleshooting and optimization tips

### Build System Migration to Vite

-   **Replaced TypeScript compiler with Vite bundler**

    -   Integrated Vite 7.1 with vite-plugin-electron for optimal Electron support
    -   Created comprehensive `vite.config.ts` with custom plugins
    -   Automatic handling of static assets (icons, JSON, bridge files)
    -   Optimized bundling with tree-shaking and code splitting

-   **Performance Improvements**

    -   Initial build time: ~5-8s → ~3.5s (50% faster)
    -   Incremental builds: ~3-5s → <1s with HMR (80% faster)
    -   Development startup: ~10s → ~3.5s (65% faster)
    -   Hot Module Replacement (HMR) for instant renderer updates

-   **Simplified Build Scripts**

    -   Consolidated multiple npm scripts into single `vite build` command
    -   Removed manual file copying operations
    -   Removed `shx` dependency (no longer needed)

-   **Bug Fixes**

    -   Fixed CSS syntax error (extra closing brace in styles.css line 2186)
    -   Fixed HTML asset paths in bundled output

-   **Documentation Updates**

    -   Updated README.md with Vite development workflow
    -   Updated CONTRIBUTING.md with new build instructions
    -   Created VITE_MIGRATION.md comprehensive migration guide
    -   Updated verify-build.sh to validate Vite output structure

-   **Maintained Compatibility**
    -   TypeScript configs preserved for IDE support
    -   ESLint configuration unchanged
    -   electron-builder packaging works seamlessly
    -   Same dist/ output structure for backward compatibility

## Recent Updates (2025-10-17)

### Documentation Reorganization

-   **Moved all documentation to `docs/` folder**

    -   `ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
    -   `TOOL_DEVELOPMENT.md` → `docs/TOOL_DEVELOPMENT.md`
    -   `TOOL_HOST_ARCHITECTURE.md` → `docs/TOOL_HOST_ARCHITECTURE.md`
    -   `CONTRIBUTING.md` → `CONTRIBUTING.md`

-   **Removed temporary documentation files**

    -   Deleted `IMPLEMENTATION_SUMMARY.md`
    -   Deleted `PROJECT_SUMMARY.md`
    -   Deleted `PR_SUMMARY.md`
    -   Deleted `REQUIREMENTS_CHECKLIST.md`

-   **Updated all documentation references**
    -   Updated `README.md` with new documentation paths
    -   Fixed all internal links to point to `docs/` folder
    -   Added comprehensive branch and PR naming conventions to `CONTRIBUTING.md`

### TypeScript Configuration Updates

-   **Updated root `tsconfig.json`**

    -   Target: ES2022 (from ES2020)
    -   Module: Node16 (from commonjs)
    -   Module Resolution: Node16 (from node)
    -   Added `allowSyntheticDefaultImports` and `isolatedModules`

-   **Updated `tsconfig.renderer.json`**

    -   Target: ES2022 (from ES2020)
    -   Lib: ES2022 + DOM (from ES2020 + DOM)
    -   Module: ES2022 (from inherited commonjs)
    -   Module Resolution: bundler (modern strategy)

-   **Updated `examples/example-tool/tsconfig.json`**
    -   Target: ES2022 (from ES2020)
    -   Module: ES2022 (from ES2020)
    -   Module Resolution: bundler (from node)
    -   Added `allowSyntheticDefaultImports` and `isolatedModules`

### New Framework Examples

Added three new complete example tools demonstrating modern framework integration:

#### React Example (`examples/react-example/`)

-   **Framework**: React 18 with TypeScript
-   **Build Tool**: Vite 6
-   **Features**:
    -   React Hooks (useState, useEffect)
    -   ToolBox API integration
    -   Connection management
    -   Event handling
    -   Modern component architecture
    -   Full TypeScript support

#### Vue Example (`examples/vue-example/`)

-   **Framework**: Vue 3 with Composition API
-   **Build Tool**: Vite 6
-   **Features**:
    -   Composition API with `<script setup>`
    -   ToolBox API integration
    -   Reactive state management
    -   Template syntax with v-if, v-for
    -   Full TypeScript support

#### Svelte Example (`examples/svelte-example/`)

-   **Framework**: Svelte 5 with TypeScript
-   **Build Tool**: Vite 6
-   **Features**:
    -   Reactive programming
    -   ToolBox API integration
    -   Svelte lifecycle hooks
    -   Component-based architecture
    -   Full TypeScript support

All examples include:

-   Complete project setup with package.json
-   Vite configuration for fast development
-   TypeScript configuration
-   README with usage instructions
-   .gitignore for proper version control
-   Integration with ToolBox API (window.toolboxAPI)
-   Connection URL and access token handling
-   Event subscription and handling
-   Interactive UI with notifications

### Documentation Improvements

-   **Updated `ARCHITECTURE.md`**

    -   Added accurate file structure reflecting `src/main/managers/` organization
    -   Added descriptions for all manager modules:
        -   `settingsManager.ts`
        -   `toolsManager.ts`
        -   `authManager.ts` (OAuth with Azure AD)
        -   `autoUpdateManager.ts` (electron-updater integration)
    -   Updated technology stack with versions
    -   Removed "Auto-updates" from future enhancements (already implemented)

-   **Updated `TOOL_DEVELOPMENT.md`**

    -   Added comprehensive section on all example tools
    -   Included framework-specific examples
    -   Updated with locations and package names

-   **Updated `CONTRIBUTING.md`**

    -   Added detailed branch naming conventions:
        -   `feature/` for new features
        -   `fix/` for bug fixes
        -   `docs/` for documentation
        -   `refactor/` for refactoring
        -   `chore/` for maintenance
        -   `test/` for tests
    -   Added Conventional Commits format for commit messages
    -   Added PR title format guidelines
    -   Updated documentation section with all doc file locations

-   **Updated `README.md`**
    -   Fixed all documentation links to point to `docs/` folder
    -   Added section showcasing all framework examples
    -   Updated contributing section with proper link

### Verification

-   ✅ All builds pass (`npm run build`)
-   ✅ All linting passes (`npm run lint`)
-   ✅ All documentation links are valid
-   ✅ File structure is properly organized
-   ✅ TypeScript configurations are modern and correct
-   ✅ electron-updater is properly integrated and documented

### Breaking Changes

None. All changes are non-breaking:

-   Documentation moves don't affect code
-   TypeScript config updates are compatible
-   New examples are additions only

### Migration Notes

If you have bookmarks or links to documentation:

-   Update `ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
-   Update `TOOL_DEVELOPMENT.md` → `docs/TOOL_DEVELOPMENT.md`
-   Update `TOOL_HOST_ARCHITECTURE.md` → `docs/TOOL_HOST_ARCHITECTURE.md`
