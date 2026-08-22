# Power Platform ToolBox 1.2.5

## Highlights

- Private Marketplace supports multiple sources, source filters, author details, and restart prompts when settings change.
- CSP consent review shows current permissions, records approval history, and requests consent again when tools add permissions.
- Headless MCP execution provides job status, invocation details, log clearing, and client configuration status.
- MCP Server can remain running while tools open or reopen, supporting background headless workflows.
- Installed tool details and context menus include repository links and clearer analytics rating values.
- Connection setup adds a Configure App flow for Power Platform API app registrations.
- Telemetry consent messaging explains collection and restart behavior more clearly.

## Fixes

- Connections: selecting an environment URL after enabling Power Platform API no longer loses focus to a native confirmation dialog.
- Connections: app registration guidance and Copy Script messaging are clearer and more consistent.
- Tools: CSP consent is recalculated correctly when required or optional domains change.
- Analytics: download and MAU updates use atomic operations and preserve existing metrics when errors occur.
- Logging: Error objects retain their original stack traces in structured logs.
- Windows: release workflows generate and bundle `app-update.yml` metadata so auto-update artifacts are complete.
- Build validation: package version checks use the correct `@pptb/types` and `@pptb/validate` paths.

## Developer & Build

- Added `@sentry/electron` telemetry for main and renderer processes with consent handling and PII scrubbing.
- Added headless MCP job types, status events, log APIs, and runtime support for `toolboxAPI`, `dataverseAPI`, and `powerplatformAPI`.
- Added CSP consent utilities, review management, re-consent tests, and MCP authentication tests.
- Updated `@pptb/types` to `1.2.5` and `@pptb/validate` to `1.0.1`.
- Improved stable and insider release workflows, Windows signing, auto-update metadata, and PR validation.

## Install

- Windows: Power-Platform-ToolBox-v1.2.5-Setup.exe
- macOS: Power-Platform-ToolBox-v1.2.5.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-v1.2.5.AppImage (chmod +x, then run)

## Notes

- No manual migration needed.
- MCP headless execution, private marketplace sources, and CSP consent management include new settings and preview workflow behavior.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.2.4...v1.2.5
