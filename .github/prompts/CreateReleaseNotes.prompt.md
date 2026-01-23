---
agent: agent
name: "CreateReleaseNotes"
description: "Generate release notes for the latest changes in the codebase."
model: GPT-5.2 (copilot)
---

You are writing GitHub Release notes for Power Platform ToolBox.
Version: ${input:newVersion}
Compare tag: ${input:previousVersion}...${input:newVersion}
Audience: end users + developers; keep it concise, scannable, and non-marketing.

Produce sections with this structure and overwrite the RELEASE_NOTES.md file with the output.

# Power Platform ToolBox ${input:newVersion}

## Highlights

- 5–8 bullets of the biggest user-facing changes; keep each to one line, action/result oriented.

## Fixes

- 4–8 bullets for key fixes; one line each; include platform or feature area when relevant.

## Developer & Build

- 3–6 bullets for dev-facing or pipeline changes (telemetry, build, APIs, tooling).

## Install

- Windows: Power-Platform-ToolBox-${input:newVersion}-Setup.exe
- macOS: Power-Platform-ToolBox-${input:newVersion}.dmg (drag to Applications)
- Linux: Power-Platform-ToolBox-${input:newVersion}.AppImage (chmod +x, then run)

## Notes

- 1–2 bullets on migrations or expectations; state “No manual migration needed” if true.

## Full Changelog

https://github.com/PowerPlatformToolBox/desktop-app/compare/${input:previousVersion}...${input:newVersion}

Style rules:

- Keep bullets single-line, start with strong nouns/verbs, no fluff.
- Avoid marketing language; be direct and specific.
- Do not add emojis.
- Use plain Markdown; no HTML.
- Use the exact section titles above.
- Do not invent features; rely on provided commit summaries or changelog diffs.
- Prefer grouping related items (connections, tools, telemetry, UI, build).
- Keep under ~200 lines total.
