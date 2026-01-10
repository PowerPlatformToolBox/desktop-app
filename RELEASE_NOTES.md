# Power Platform ToolBox v1.1.0

## Highlights

-   VS Code-style search, filter, and sorting with saved preferences across app sections for faster discovery
-   Theme-aware modal refresh with improved accessibility, contrast, and consistent styling
-   Homepage and theme updates with refreshed icons and marketplace visuals
-   Multi-connection tooling improvements: side-by-side layouts, secondary footer display, and lifecycle status visibility
-   Tool insights: source indicators (Registry/NPM/Local), related links, version badges, analytics for downloads/MAU
-   Dataverse upgrades: bulk operations support, formatted FetchXML values, `getEntitySetName` helper, improved mappings
-   Telemetry and diagnostics: Sentry instrumentation, machine ID tracking, Application Insights hookup, richer About dialog

## Fixes

-   Resolved macOS window recreation duplicate IPC handlers
-   Fixed override client ID clearing for interactive authentication flows
-   Settings form now persists correctly after reload; settings and connection events emit reliably without duplicates
-   Toast reconnect actions, connection footer colors, and badge palettes now honor theme/environment contrast
-   Addressed race conditions in tool context initialization and improved CSP handling for tools
-   Debug menu/npm-local tool loading reliability improvements

## Developer & Build

-   Marketplace shows tool versions and related links; multi-connection support for npm/local tools
-   Structured logging and breadcrumb tracing via Sentry; Application Insights connection string support in pipelines
-   Modular renderer architecture and better modal management for maintainability

## Install

-   Windows: Power-Platform-Tool-Box-1.1.0-Setup.exe
-   macOS: Power-Platform-Tool-Box-1.1.0.dmg (drag to Applications)
-   Linux: Power-Platform-Tool-Box-1.1.0.AppImage (make executable, then run)

## Notes

-   No manual migration needed; existing connections and settings are preserved.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.0.7...v1.1.0
