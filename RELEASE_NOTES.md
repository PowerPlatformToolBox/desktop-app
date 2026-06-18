# Power Platform ToolBox 1.2.3

## Highlights

- Move the app from beta to the stable release channel
- Support beta and pre-release npm packages in tool discovery and installs
- Let npm-installed and locally loaded tools declare capabilities
- Tighten terminal command blocking during tool execution
- Sanitize version scopes before running npm install

## Fixes

- Terminal: improve blocking rules and related command handling
- Terminal: keep stdout processing stable while filtering sentinel output
- Install flow: sanitize npm version scopes before invoking installs
- Marketplace: keep prerelease package handling aligned with tool registry metadata
- Tools: preserve capability metadata for npm and locally loaded tools

## Developer & Build

- `packages/` now ships stable and insider package metadata separately
- Tool registry and preload APIs now carry prerelease package support end to end
- Terminal manager refactor expands the blocking pipeline and stdout handling internals
- Version bumps were aligned through `package.json` and `packages/package.json` for the stable release

## Install

- Windows: Power-Platform-ToolBox-1.2.3-Setup.exe
- macOS: Power-Platform-ToolBox-1.2.3.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-1.2.3.AppImage (chmod +x, then run)

## Notes

- No manual migration needed.
- Tool developers using prerelease packages should confirm their package metadata is published with the expected version scope.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/v1.2.2...v1.2.3
