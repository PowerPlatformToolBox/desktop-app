# Power Platform ToolBox v1.2.8

## Highlights

- Configure automatic or manual HTTP/HTTPS proxies for app services and Dataverse requests.
- Monitor MCP server status and inspect invocation details with improved status feedback.
- Search across categories with global search tabs and filtering.
- Select connections through an improved workflow, including connection-aware MCP requests.
- Run Dataverse batch requests with response headers and transactional changesets.
- Use declared .NET worker processes with managed startup and communication.

## Fixes

- Dataverse: fixed HTTP proxy handling and improved proxy failure diagnostics.
- Windows: handle command shims during tool package installation.
- Tools: display color SVG icons and load icons for locally installed tools.
- Windows: improved .NET worker process handling.
- Notifications: close notification history after clearing it.
- Dialogs: fixed button mnemonics in tool message boxes.
- Dataverse: apply dedicated response size limits to metadata and individual Web API responses.

## Developer & Build

- MCP: add server status management, invocation status details, and positional connection input support.
- `dataverseAPI`: expose batch response headers and transactional changesets.
- Proxy: add Node.js HTTP/HTTPS proxy configuration with automatic detection and manual override.
- Worker API: reduce unnecessary process checks during request handling.
- Nix: add source builds, a development shell, and desktop integration with the `pptb://` handler.

## Install

- Windows: Power-Platform-ToolBox-v1.2.8-Setup.exe
- macOS: Power-Platform-ToolBox-v1.2.8.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-v1.2.8.AppImage (chmod +x, then run)

## Notes

- No manual migration needed; existing tool connection declarations and primary/secondary APIs remain supported.
- .NET worker use is opt-in and requires user consent for native execution.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.2.7...v1.2.8
