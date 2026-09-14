# Plan: Review of `docs/CLI_DEBUG_TOOL_FLAG.md` (CLI `--debug-tool` flag)

## Request summary

Review the draft implementation plan for the `--debug-tool` launch flag and report flaws, bugs, and missing points. This plan file is a **review artifact** — it records verified findings against the current codebase and the corrections required before the feature is implemented.

## Goals

- Validate every factual claim the draft plan makes about the existing codebase.
- Identify blocking design flaws, latent race conditions, and missing implementation steps.
- Produce a corrected, executable set of amendments to the draft.

## Non-goals

- Implementing `--debug-tool`.
- Rewriting `docs/CLI_DEBUG_TOOL_FLAG.md` (pending user decision).

## Assumptions / Open questions

- **Q1**: Is shipping a real `pptb` launcher shim in scope, or should the feature be documented against the app executable path only? (See B1.)
- **Q2**: Should `--debug-tool` require user confirmation on first use, given it mounts arbitrary local code without interaction? (See S1.)
- **Q3**: Is `--debug-tool-connection` acceptable as a v1 requirement rather than optional? (See B4.)

## Acceptance criteria

- Every BLOCKER below has a decision recorded.
- `docs/CLI_DEBUG_TOOL_FLAG.md` is amended (or superseded) before implementation begins.

## Triage

Type: **High-risk**

Rationale:

- Touches main-process launch arguments, single-instance handling, IPC/preload surface, and tool isolation.
- Grants a non-interactive path to mount arbitrary local code into a webview that holds live Dataverse tokens.

## Participants (mesh)

- Product Manager (gateway)
- Explore (codebase verification)

---

## Verification summary

Claims in the draft that were **confirmed correct**:

- `ToolManager.loadLocalTool(localPath): Promise<Tool>` exists at [src/main/managers/toolsManager.ts](src/main/managers/toolsManager.ts#L907), derives `local-<sanitized-name>`, validates `package.json`, `dist/index.html`, and `pptb.config.json`, registers the tool and emits `tool:loaded`.
- `ProtocolHandlerManager` buffer/flush pattern is exactly as described ([src/main/managers/protocolHandlerManager.ts](src/main/managers/protocolHandlerManager.ts#L100-L160)).
- The bottom-of-file `second-instance` listener does ignore `commandLine`/`workingDirectory` ([src/main/index.ts](src/main/index.ts#L3776)).
- `showAndFocusMainWindow()` exists ([src/main/index.ts](src/main/index.ts#L3034)).
- `launchTool`, `getOpenTools`, `closeTool` are exported; `LaunchToolOptions` does have `source` and `primaryConnectionId`; `getOpenTools()` returns `Map<instanceId, OpenTool>` with `.tool`.
- `showNotification` accepts `{title, body, type, duration}` and `duration: 0` is persistent.
- `applyDebugMenuVisibility(showDebugMenu: boolean)` takes a boolean.
- `loadLocalTool` / `getLocalToolWebviewHtml` are exposed on `toolboxAPI`.

---

## Findings

### BLOCKERS

**B1 — The `pptb` command does not exist.**
`package.json` declares `"bin": { "pptb-cli": "dist/cli/index.js" }`. That binary is a **headless Node entry point** ([src/cli/index.ts](src/cli/index.ts#L1-L20)) that never launches Electron. There is no `pptb` shim anywhere. The draft's entire headline UX (`pptb --debug-tool .`) is therefore unimplementable as written, and §6.2 quietly works around it with a `pptb.executablePath` VS Code setting plus a "if the installer adds a shim" aside. This is an unresolved dependency, not a footnote.
_Required_: either (a) add a `pptb` launcher (shim that spawns the installed app executable, plus installer/PATH work on all three platforms) as an explicit step, or (b) drop `pptb` from the docs and specify the feature against the app executable, and rename the flag docs accordingly. Do not ship docs that reference a binary that isn't installed.

**B2 — The renderer IPC event will be silently dropped on cold launch.**
The draft delivers on `did-finish-load`. But the renderer registers `onProtocolInstallToolRequest` (and would register `onDebugToolLaunchRequest`) inside `setupToolboxEventListeners()`, which runs at the **end** of `initializeApplication()` — after `await loadInitialSettings()`, `loadToolsLibrary()`, `loadSidebarTools()`, `loadSidebarConnections()`, `loadHomepageData()`, and `restoreSession()` ([src/renderer/modules/initialization.ts](src/renderer/modules/initialization.ts#L141-L222)). `did-finish-load` fires long before that. `webContents.send` to a channel with no listener is a no-op with no error.
The existing `RENDERER_INITIALIZED` message is sent at the _start_ of init (~line 49) so it cannot be used as the readiness gate either.
_Required_: add a genuine renderer-ready signal emitted at the end of `initializeApplication()`, and have `DebugToolLaunchManager` hold the request until it arrives. This is also a latent bug in the existing `pptb://` path and should be fixed once, in one place.

**B3 — `closeTool()` can be vetoed, producing a duplicate tab instead of a reload.**
`closeTool(instanceId)` runs a registered close guard and **returns without closing** if the guard says no ([src/renderer/modules/toolManagement.ts](src/renderer/modules/toolManagement.ts#L952)). The draft's reload loop then calls `launchTool()` unconditionally, so a guarded tool yields two tabs — the exact failure the feature is meant to eliminate. `ToolWindowManager.hasPreventCloseTools()` shows this is a real, supported tool capability.
_Required_: check the close result, and on veto either abort with an explanatory notification or offer a force path. Define the behaviour explicitly.

**B4 — `--debug-tool` alone does not reach "ready to debug" for most tools.**
`connectionRequirement` defaults to `"required"`. With no `primaryConnectionId`, `launchTool` opens a **blocking** `openSelectConnectionModal`, and on cancel shows "Tool Launch Cancelled" and returns without launching. So the one-command promise ("source saved → tool running") is false for any connection-requiring tool. The draft's §5 recommendation ("`--debug-tool-connection` optional, ship if cheap, defer otherwise") is therefore wrong.
_Required_: treat connection preselection as **v1 scope**, or define a documented fallback (e.g. reuse the last-used connection for that tool id without prompting).

### HIGH

**H1 — `--devtools` is specified in two contradictory places.**
Step 7's renderer code calls `window.toolboxAPI.toggleActiveToolDevTools()`, which **does not exist**. Step 8 then admits the IPC has to be built. Verified: `ToolWindowManager.openDevToolsForActiveTool()` exists ([src/main/managers/toolWindowManager.ts](src/main/managers/toolWindowManager.ts#L1410)) but is reachable only from the app menu item at [src/main/index.ts](src/main/index.ts#L2862). Additionally, "active tool" is the wrong target — it should be the instance that was just launched, or DevTools may attach to whatever tab happens to be focused.
_Required_: pick one — cut `--devtools` from v1, or fully specify the channel, preload method, `api.ts` typing, and an instance-targeted `openDevToolsForInstance(instanceId)`.

**H2 — The `isPackaged ? 1 : 2` argv slice is fragile and unnecessary.**
`parseLaunchArgs` slices argv by a packaged/unpackaged heuristic. That breaks when Electron switches precede the script (`electron --inspect dist/main/index.js …`), and on `second-instance` where `commandLine` may contain Chromium-injected switches and platform-specific quoting. The existing protocol handler sidesteps all of this by simply **scanning the whole argv** for its token, with no offset.
_Required_: drop the slice; scan the full array. This removes the entire packaged-vs-unpackaged test matrix from Step 9.

**H3 — Two competing `second-instance` listeners.**
`ProtocolHandlerManager.initialize()` registers one (only when `protocolEnabled`), and the draft adds a second at the bottom of `index.ts`. Handler ordering is not guaranteed and the split makes the launch contract hard to reason about.
_Required_: consolidate second-instance argv dispatch into a single listener that fans out to both managers.

**H4 — `restoreSession()` race can resurrect a stale tab.**
If the previous session had the local tool open, `restoreSession()` reopens it. Depending on when the debug-tool request is delivered relative to restore, the handler may close nothing (restore hasn't run) and then restore adds a second, stale tab afterwards.
_Required_: define ordering — gating on the renderer-ready signal from B2 resolves this if that signal is emitted after `restoreSession()`.

**H5 — Same package name at a different path silently collides.**
`toolId` is `local-<sanitized package name>`, so `--debug-tool C:\a\my-tool` followed by `--debug-tool C:\b\my-tool` replaces the registration with no warning and no indication of which directory is live.
_Missing_: define the behaviour (warn, or surface the resolved path in the tab tooltip/notification).

### SECURITY

**S1 — The "same trust level as Browse → Load Tool" claim understates the delta.**
Browse requires a human in a native directory dialog. The flag lets **any local process that can spawn the executable** silently mount arbitrary code into a tool webview that receives the tool's declared CSP exceptions and the `dataverseAPI` bridge (live Dataverse tokens), while also flipping a persisted user setting. That is a meaningful escalation from "user picked this folder" to "something on this machine picked this folder".
_Required_: record an explicit decision — accept, or add a one-time confirmation for CLI-mounted paths.

**S2 — `isPathSafe` does not reject `..`.**
The draft repeats this claim twice (§2.1 and §5). Verified: `isPathSafe` calls `path.resolve(localPath)` **first**, which collapses `..` before any check. The actual controls are: must be absolute, no null bytes, not under a platform system directory ([src/main/managers/toolsManager.ts](src/main/managers/toolsManager.ts#L867)). The tool's own error string is likewise misleading.
_Required_: correct the security section to describe the real control (system-directory denylist), and do not lean on a traversal guarantee that isn't there.

**S3 — Forcing and persisting `showDebugMenu: true` is a surprising side effect.**
A CLI flag permanently mutating a user-facing setting, with no opt-out and no notification, is hard to discover and hard to undo. A main-process `setSetting` also will not refresh an already-open Settings pane.
_Suggested_: apply visibility for the session only, or notify the user that the setting was changed.

### MEDIUM / MISSING

- **M1 — No exit-code or failure feedback.** The second-instance process quits immediately, so `pptb --debug-tool` always "succeeds" even when the tool fails to load. The VS Code task chain in §6 cannot detect failure. Document this limitation or add a wait/exit-code mode.
- **M2 — "Files touched" table is incomplete.** Missing: `src/main/managers/toolWindowManager.ts` and the menu-action extraction (Step 8), the `--devtools` IPC channel, the renderer-ready channel (B2), `debugToolLaunchManager` tests, and `src/renderer/modules/toolsSidebarManagement.ts` if reload semantics change.
- **M3 — No `~` expansion** in the parser; `--debug-tool ~/dev/tool` will fail on shells that don't expand it.
- **M4 — Last-one-wins for repeated `--debug-tool`** is stated but not implemented by the sample parser loop (it is, incidentally, correct — but untested; add the case).
- **M5 — No validation gate.** Step 9 lists unit tests but the plan never states the `pnpm run typecheck` / `lint` / `build` gate, and there is no e2e coverage despite `tests/e2e/` existing.
- **M6 — `workingDirectory` reliability** for `.` resolution should be documented (shortcut/`start`-launched processes may have an unexpected CWD).
- **M7 — Cold-launch `showDebugMenu` timing.** The main-side `setSetting` happens in the callback, but the renderer reads `settings.showDebugMenu` during `loadInitialSettings()`. Depending on ordering, the persisted write may land after the read; the plan relies on the renderer's own `applyDebugMenuVisibility(true)` call to cover this, which only works if B2 is fixed.

---

## Recommended amendments (ordered)

1. Decide B1 (`pptb` shim in scope or not) — everything downstream depends on the answer.
2. Add a renderer-ready channel and buffer on it (B2); reuse it for `pptb://`.
3. Move connection preselection into v1 scope (B4).
4. Define close-guard-veto behaviour (B3).
5. Cut `--devtools` from v1 or fully specify it (H1).
6. Replace the argv slice with a full scan (H2) and consolidate the second-instance listeners (H3).
7. Correct the security section (S1, S2) and revisit the `showDebugMenu` side effect (S3).
8. Fill the gaps in M1–M7.

## Checkpoint

Status: **NOT READY**

- [ ] Q1 answered: `pptb` shim in scope?
- [ ] Q2 answered: confirmation prompt for CLI-mounted tools?
- [ ] Q3 answered: `--debug-tool-connection` in v1?
- [ ] User decides whether to amend `docs/CLI_DEBUG_TOOL_FLAG.md` in place or supersede it

## Files expected to change

- `docs/CLI_DEBUG_TOOL_FLAG.md` (amendments) — pending user decision. No source changes until the blockers are resolved.

## Validation steps

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

## Risks & rollback

- Implementing the draft as written would ship a feature that silently no-ops on cold launch (B2), duplicates tabs for guarded tools (B3), and never reaches a running tool for connection-requiring tools (B4).
- No rollback concerns for this review artifact.
