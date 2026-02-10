# Power Platform ToolBox 1.1.2

## Highlights

- MSAL-based authentication isolates tokens per connection and validates access with WhoAmI for more reliable sign-in
- Troubleshooting modal runs configuration checks and surfaces Sentry diagnostics to speed up support and debugging
- Tool updates show inline progress and accessible status feedback while tools are updating
- Terminal UI hides the Terminal button when no terminals exist and includes additional terminal reliability improvements
- Tool menu adds dynamic feedback and quick DevTools options for tool developers
- Dataverse API expands with solution deployment/import status helpers and relationship associate/disassociate endpoints
- Windows and macOS release pipelines improve signing/notarization handling for more trustworthy installers

## Fixes

- Dataverse Functions now format parameters correctly, avoiding invocation failures
- Packaged app avoids `ERR_REQUIRE_ESM` issues by properly handling externalized telemetry dependencies
- Modal dialogs no longer remain always-on-top after closing on Windows 11
- Connection context menu no longer renders behind BrowserViews
- Settings form populates correctly on app reload and avoids duplicate IPC handler registration on macOS window recreation
- macOS notarization scripts handle missing modules/unavailable submission logs and clarify submission/status output
- Authentication token reuse/refresh reduces unexpected expiry prompts with proactive refresh and expiry detection

## Developer & Build

- Telemetry identifiers switch from machine ID to install ID for privacy-safe, stable analytics
- Windows packaging adds ARM64 support, MSI targets, and refactored electron-builder configurations
- macOS signing/notarization workflows add submission/status retrieval steps and improved error handling
- `dataverseAPI` types add `deploySolution`, `getImportJobStatus`, and `associate`/`disassociate` helpers
- `toolboxAPI` adds a `fileSystem` API set (path validation + updated publish/selectPath flows)
- Sentry logging helpers and noise reduction improve production diagnostics signal-to-noise

## Install

- Windows: Power-Platform-ToolBox-1.1.2-Setup.exe
- macOS: Power-Platform-ToolBox-1.1.2.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-1.1.2.AppImage (chmod +x, then run)

## Notes

- No manual migration needed; existing settings and connections continue to work.
- You may be prompted to sign in again after upgrading because stored tokens and MSAL instances are cleared on app restart.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.1.1...v1.1.2
