# Power Platform ToolBox 1.1.1

## Highlights

- Settings changes now queue until Save, preventing accidental toggles from instantly applying across the app
- Installed tools, favorites, and connection icons hot-swap with the active theme so “more” and star glyphs always stay legible
- Connections sidebar adds a default Last Used sort plus synchronized filters for faster environment switching
- Single and multi-connection pickers share the same search, filter, and Last Used ordering for a consistent selection flow
- Marketplace install button adopts a compact icon-only style with spinner feedback and refreshed badges
- Activity bar hover/active treatments gain higher-contrast light-theme colors for clearer navigation cues

## Fixes

- Resolved theme mismatches where tool more-menu and favorite icons failed to refresh after switching themes
- Fixed connection sidebar filter buttons whose active state and backgrounds ignored the current theme palette
- Corrected marketplace install hover contrast and badge radius so labels read cleanly in both themes
- Activity items now render hover and active states in light mode, restoring visual focus feedback
- Select connection and multi-connection modals now honor the saved Last Used sort instead of falling back to alphabetical order

## Developer & Build

- SettingsManager seeds `connectionsSort` to `last-used` and sanitizes persisted values for predictable ordering
- `UIConnectionData` carries `lastUsedAt`/`createdAt`, enabling tool authors to build smarter connection pickers
- Modal controller scripts share timestamp-based sorting helpers and guard filter dropdown state handling

## Install

- Windows: Power-Platform-ToolBox-1.1.1-Setup.exe
- macOS: Power-Platform-ToolBox-1.1.1.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-1.1.1.AppImage (chmod +x, then run)

## Notes

- No manual migration needed; existing settings and connections continue to work.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/1.1.0...1.1.1
