# Plan: CLI `--debug-tool` flag — mount and open a local tool from the command line

## Request summary

Add a `--debug-tool <path>` argument to the installed Power Platform ToolBox executable that mounts a local tool directory and opens it in a tab, ready to debug. Re-running the same command against a running instance reloads the tool instead of opening a duplicate tab.

Target invocation (Windows):

```
"C:\Users\<user>\AppData\Local\Programs\Power Platform ToolBox\Power Platform ToolBox.exe" --debug-tool .\my-tool-folder
```

Supersedes the draft at [docs/CLI_DEBUG_TOOL_FLAG.md](docs/CLI_DEBUG_TOOL_FLAG.md). Review findings that drove the corrections are in [.github/plans/plan-cli-debug-tool-flag-review.md](.github/plans/plan-cli-debug-tool-flag-review.md).

## Goals

- One command takes a tool maker from "source built" to "tool running in PPTB".
- `--debug-tool .` works from the tool's own folder.
- Re-invoking reloads in place (close stale tab → relaunch), no duplicate tabs, no second app instance.
- Works in **packaged** builds on Windows, macOS, and Linux.
- `--debug-tool-connection <idOrName>` preselects a connection so the launch is non-interactive.

## Non-goals

- A `pptb` PATH shim or installer/PATH work. **Decided: out of scope** — the app executable is invoked directly.
- File watching / hot reload of the tool's `dist/`.
- Attaching a Node debugger (tools run in a Chromium webview; DevTools is the surface).
- Building or installing the tool. PPTB mounts `dist/`; producing it stays the tool project's job.
- Executing anything from the mounted directory (no `npm install`, no lifecycle scripts). **Explicit security non-goal.**
- An exit-code / wait mode for the CLI (see Limitation L1).

## Assumptions / Open questions

- **RESOLVED — Q1**: No `pptb` shim. Docs reference the app executable path directly.
- **RESOLVED — Q3**: `--debug-tool-connection` is **in v1**.
- **RESOLVED — D1**: **Prompt once per resolved folder**, persisted and revocable. See "D1 — decided" below.
- **RESOLVED — D2**: **Allow any connection.** `--debug-tool-connection` may resolve to any saved connection, including UAT/Production, with no modal. The D1 trust prompt is the compensating control and MUST name the target environment when the flag is supplied.

## Acceptance criteria

1. Cold launch with `--debug-tool <path>` opens PPTB with the tool mounted and its tab open.
2. Warm launch (app already running) focuses the window and **reloads** the tool: exactly one tab for that tool id afterwards.
3. `--debug-tool .` resolves against the **calling** process's working directory, both cold and warm.
4. A tool that declines to close (close guard, pinned tab, or main-process PreventClose) does **not** produce a duplicate tab; the user is told why.
5. With `--debug-tool-connection` resolving to a connection, the tool launches with **no modal** (any environment classification).
6. With the flag omitted but a stored connection for that tool, the tool launches with **no modal**.
   6b. The first `--debug-tool` for a given resolved path shows a trust prompt; subsequent runs for that path do not.
7. An invalid path, an unbuilt tool, or a bad `package.json` produces a persistent error notification and PPTB still starts normally.
8. The resolved mount path is always surfaced to the user in a notification.
9. No user-path, connection name, or raw argv reaches Sentry.
10. `pnpm run typecheck` / `lint` (0 errors) / `build` / `test` all pass.

## Triage

Type: **High-risk**

Rationale:

- Main-process launch arguments, single-instance handling, IPC/preload surface, tool isolation.
- Creates a **non-interactive** path to mount arbitrary local code into a webview with the `dataverseAPI` bridge, `fileSystem`, and `terminal` access.

## Participants (mesh)

- Product Manager (gateway)
- Explore (codebase verification)
- Tech Designer (corrected technical design)
- Security Reviewer (threat model + decisions)

---

## Plan (drafted by agents)

### Product Manager (Orchestrator)

Draft-vs-corrected delta, for reviewers of the old doc:

| Draft said                                            | Corrected                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pptb --debug-tool .`                                 | App executable path directly; no shim                                              |
| Deliver on `did-finish-load`                          | Deliver on a new `app:renderer-ready` signal (draft would silently drop the event) |
| `closeTool` then `launchTool`                         | Probe `getOpenTools()` after close; abort with a warning if vetoed                 |
| `--debug-tool-connection` optional                    | In v1; plus a stored-connection fallback                                           |
| `parseLaunchArgs(argv, isPackaged, cwd)` with a slice | Full-argv scan, no `isPackaged`, no slice                                          |
| Persist `showDebugMenu: true`                         | Session-only; no persisted mutation                                                |
| `isPathSafe` "rejects `..`"                           | False — it `path.resolve()`s first; real control is the system-dir denylist        |
| "No new security surface"                             | False — strike it; see Security section                                            |

### Tech Designer

**1. Renderer-ready gate (fixes the silent-drop bug; also fixes it for `pptb://`)**

- New `APP_CHANNELS` group in [src/common/ipc/channels.ts](src/common/ipc/channels.ts): `RENDERER_READY: "app:renderer-ready"`. Renderer→main, so it must **not** go in `EVENT_CHANNELS`.
- Renderer emits `window.api.send(APP_CHANNELS.RENDERER_READY)` as the **last** statement of the `try` block in `initializeApplication()` ([src/renderer/modules/initialization.ts](src/renderer/modules/initialization.ts)) — after `restoreSession()` and after `setupToolboxEventListeners()`. Not emitted in the `catch` branch. `window.api.send` is already an unrestricted passthrough, so no preload change.
- New `src/main/managers/rendererReadyGate.ts`: `initialize()`, `attachWindow(win)`, `runWhenReady(task)`, `isReady()`. Buffers tasks until the signal arrives; **resets to not-ready on `did-start-loading`** so a `Ctrl+R` reload doesn't strand a later request.
- Migrate the existing protocol callback in [src/main/index.ts](src/main/index.ts) from `did-finish-load` to `rendererReadyGate.runWhenReady(deliver)`.
- Emitting after `restoreSession()` also removes the stale-restored-tab race.

**2. `src/main/launchArgs.ts` — pure parser, no Electron imports**

- Signature `parseLaunchArgs(argv: readonly string[], cwd: string, homeDir = os.homedir()): LaunchArgs`.
- **Scans the whole argv** — no slice, no `isPackaged`. This deletes the packaged/unpackaged test matrix and survives `electron --inspect …`, Chromium-injected switches, and the forwarded `commandLine`.
- Supports `--debug-tool <p>`, `--debug-tool=<p>`, `--debug-tool-connection <v>` / `=<v>`, `--devtools`. Last-one-wins. Ignores unknown switches.
- `~` / `~/…` expansion (VS Code tasks and Windows shortcuts don't expand it).
- Guards `--debug-tool --devtools` (won't consume a successor flag as the path value).
- No prefix collision between `--debug-tool=` and `--debug-tool-connection`.
- Also exports `describePath(fullPath)` → `basename#sha8` for Sentry-safe logging.

**3. Consolidated `second-instance` handling**

- Remove the `app.on("second-instance")` listener from `ProtocolHandlerManager.initialize()`; replace with a public `handleSecondInstanceCommandLine(commandLine)` that keeps the `protocolEnabled` early-out **inside** it (the listener is currently conditional — dev and Insider builds don't have one at all).
- Rewrite the single listener at the bottom of [src/main/index.ts](src/main/index.ts) to `(_e, commandLine, workingDirectory)` and fan out to both consumers via a new `ToolBoxApp.handleSecondInstanceCommandLine()`. `workingDirectory` (not `process.cwd()`) is what makes `--debug-tool .` resolve correctly on the reload path.

**4. `src/main/managers/debugToolLaunchManager.ts`** — `initialize(args)` (cold launch, before `app.whenReady()`), `handleRequest(args)` (second instance), `setupHandler(cb)` (after the window exists; flushes). Buffer depth 1 — a newer request supersedes a queued one. Throws nothing.

**5. Connection preselection**

- `window.toolboxAPI.connections.getById` / `.getAll` exist; resolve id first, then exact case-insensitive name match.
- **Finding**: `getToolConnection(toolId)` / `getToolSecondaryConnection(toolId)` already persist a per-tool connection, and **nothing in the renderer currently reads them**. Use as the fallback — it's keyed on the stable `local-<name>` id.
- Attempt silent `connections.authenticate(id)` and null out on failure so `launchTool` prompts rather than launching against a dead token.
- Flag resolves → no modal. Flag omitted + stored connection → no modal. Nothing available + `connectionRequirement: "required"` → let `launchTool` prompt, preceded by an info notification hinting at the flag. Flag supplied but unresolved/ambiguous → fall back to stored **and warn**; never guess between duplicates.

**6. Renderer handler** — new `src/renderer/modules/debugToolLaunch.ts` (keeps `initialization.ts` from growing further).

- **Finding**: `closeTool()` has **three** veto paths, not one — close guard, pinned tab, and main-process PreventClose — and returns `Promise<void>` in all three. Probe `getOpenTools().has(instanceId)` after awaiting; that one check covers all three.
- On any veto: **abort with a warning notification**, do not relaunch (relaunching produces the exact duplicate tab this feature exists to remove) and do not force-close (that would override a tool's unsaved-work protection).
- Always include the resolved path in the notification — two directories can share a package name and collide on the same `local-<name>` id.
- `applyDebugMenuVisibility(true)` for the session only.

**7. IPC / preload / typings** — `EVENT_CHANNELS.DEBUG_TOOL_LAUNCH_REQUEST: "debug:tool-launch-request"`; `onDebugToolLaunchRequest` in [src/main/preload.ts](src/main/preload.ts) and [src/common/types/api.ts](src/common/types/api.ts).

**8. `--devtools` — recommend IN for v1** (~30 lines, additive). `ToolWindowManager.openDevToolsForActiveTool()` already exists but is menu-only and targets the wrong thing. Add `openDevToolsForInstance(instanceId)`, make the existing method a one-line delegate (menu item unchanged), add `TOOL_WINDOW_CHANNELS.OPEN_DEVTOOLS` + preload + typing. `launchTool` returns `void`, so read `getActiveToolId()` immediately after it resolves. Without this, step 6 of the manual ritual survives and undercuts the headline claim.

**9. Logging — critical correction**

- **`logInfo` IS Sentry.** [src/common/logger.ts](src/common/logger.ts) forwards to `sentryHelper`. The draft's "log it locally via `logInfo` only" guidance is wrong; there is no local-only log.
- Therefore: **never** pass `localPath`, `workingDirectory`, raw argv, or a connection name to any log function. Use `describePath()`. Raw messages appear only in user-facing notifications, which never leave the machine.
- Audit `loadLocalTool`'s thrown messages — they embed `localPath`. Log a sanitized wrapper; show the raw message only in the notification.

**10. Platform caveat** — on macOS, `open -a … --args` does **not** reliably forward argv to a running instance. Docs must use the in-bundle binary: `"/Applications/Power Platform ToolBox.app/Contents/MacOS/Power Platform ToolBox" --debug-tool .`

### Security Reviewer

**Capability surface of a mounted tool** — `BrowserView` with `webSecurity: false` plus `toolPreloadBridge`: full `dataverseAPI` (CRUD, `execute`, FetchXML, **metadata write**, `publishCustomizations`, `deploySolution` — proxied in main, but the tool drives the token); `powerplatformAPI`; `fileSystem` read/write gated only by a system-dir denylist (`%APPDATA%`, `~/.ssh`, and PPTB's own `userData` are reachable); `terminal` (blocklist does not cover `node`/`npm` → effectively arbitrary code execution); `invocation.launchTool` with connection inheritance. **A mounted tool is not sandboxed.**

**Verdict on "same trust level as Browse → Load Tool": not defensible.** Same capability surface, different authorisation. Browse needs a human in a native dialog — unforgeable by another process. The flag replaces that with "any local process that can spawn the exe". The draft's "no new security surface" criterion must be struck.

**Confirmed findings**

- `isPathSafe` does **not** reject `..` — `path.resolve()` collapses it first. Real controls: absolute, no null bytes, not under a system dir. The denylist does **not** cover `%APPDATA%`, `%LOCALAPPDATA%`, `%TEMP%`, or the user profile, so `--debug-tool %TEMP%\payload` is permitted. The thrown error string is also misleading and should be corrected.
- **S4 (new, and it's a security bug not just UX)**: CSP consent is keyed by `toolId` = `local-<package name>`. Consent granted for `C:\good\my-tool` is silently reused by `C:\evil\my-tool` — the second copy inherits approved `connect-src` exfil destinations with **no prompt**. With `webSecurity: false`, CSP is the _only_ network control, so this carries real weight.
- **S9 (pre-existing, independent of this feature)**: `fileSystem` has no `userData` denylist, so any tool can write PPTB's own store. Worth a separate hardening item in [src/main/utilities/filesystem.ts](src/main/utilities/filesystem.ts).

**Agreed with Tech Designer**: do **not** persist `showDebugMenu` (session-only); always surface the mounted path.

**Additional hardening (adopt)**

- Rate-limit the second-instance debug-tool path, mirroring `ProtocolHandlerManager` (5 s window, 3 requests). Without it a loop of invocations is a trivial local DoS that closes/relaunches a BrowserView each time.
- Bound the input: reject paths over ~4096 chars and non-string argv entries before `path.resolve`.
- Do **not** copy the `app.isPackaged` / Insider gate — that exists because `pptb://` is an OS-level _claim_; this flag isn't, and must work packaged.
- Audit-log every CLI mount (sanitized) so a silent mount isn't forensically invisible.

### Critic — decisions

**D1 — DECIDED: prompt once per resolved folder.**

Implement per the Security Reviewer's UX below. Consequences for implementation:

- New `trustedDebugToolPaths` entry in `SettingsManager`, storing `{ resolvedPath, packageName }`, revocable from Settings alongside CSP consents.
- The prompt is shown **before** `loadLocalTool` mounts anything, and is shown for the **CLI path only** — the existing Browse button stays unprompted (its native dialog _is_ the consent).
- Re-prompt if the `package.json` `name` at that path has changed since trust was granted.
- Because D2 allows any connection, the prompt **must name the target environment** when `--debug-tool-connection` is supplied, so one click covers both the mount and the environment.
- Reading `package.json` to populate the prompt happens before the trust decision. That is acceptable (`JSON.parse` of an untrusted file only) — but reinforces the non-goal: never execute anything from the mounted directory.
- Path-keyed trust also closes S4 (CSP consent laundering between two folders sharing a package name).

**D2 — DECIDED: allow any connection.** No environment-classification restriction on `--debug-tool-connection`. Tech Designer's resolution order stands as designed. The D1 prompt carries the risk.

---

_Original disagreement, retained for the record:_

**D1 — Confirmation prompt before mounting. The two specialists disagreed.**

|                       | Position                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tech Designer**     | **No prompt.** An attacker who can spawn your binary with arbitrary args can already write to the userData tools directory. Mitigate with: no persisted setting mutation, always surface the path, record the decision in the PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Security Reviewer** | **Prompt, first-time-per-resolved-path, persisted.** The local attacker has code exec but _not_ your Dataverse tokens, connection list, or a UI-blessed surface; the flag hands over exactly that crossing. Costs **one** click per project, ever — cheaper than step 4 of the current ritual, which costs a click _every_ time. Also fixes S4, since trust becomes path-keyed. UX: reuse the `openCspExceptionModal` BrowserWindow pattern; show full path + `name`/`version`; "Local tools run with full access to your files, terminal, and the selected Dataverse environment."; **Trust this folder** / **Cancel** with default focus on Cancel; persist to a `trustedDebugToolPaths` list revocable from Settings; re-prompt if the `package.json` name at that path changes. |

My read: the Security position is stronger on S4 alone — without path-keyed trust, CSP consent laundering is a real, silent bug, and no amount of "surface the path in a notification" fixes it (the notification fires _after_ the mount). The "they already own you" argument is the one that historically loses this class of bug. **Recommend adopting the prompt.** — _adopted._

**D2 — `--debug-tool-connection` scope.** Security recommended restricting non-interactive selection to `Dev`/`Test`. **Not adopted** — user elected to allow any connection, with the D1 trust prompt naming the target environment as the compensating control.

---

## Limitations (document, don't fix)

- **L1** — The second process quits as soon as `requestSingleInstanceLock()` fails, so the command's exit code is always 0 and carries no load result. A VS Code task chain cannot detect failure; feedback is the in-app notification only. An exit-code/wait mode needs a return IPC and a non-quitting second process — out of scope.

## Checkpoint

Status: **APPROVED**

- [x] Scope and acceptance criteria confirmed
- [x] Critic reviewed
- [x] **D1 decided** — prompt once per resolved folder, persisted and revocable
- [x] **D2 decided** — allow any connection; trust prompt names the target environment
- [x] User approved plan (required for high-risk)

## Files expected to change

| File                                                      | Change                                                                                                                                                                                                                | New |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `src/main/launchArgs.ts`                                  | `LaunchArgs`, `parseLaunchArgs`, `describePath`                                                                                                                                                                       | ✅  |
| `src/main/managers/rendererReadyGate.ts`                  | `RendererReadyGate`                                                                                                                                                                                                   | ✅  |
| `src/main/managers/debugToolLaunchManager.ts`             | `DebugToolLaunchManager`                                                                                                                                                                                              | ✅  |
| `src/renderer/modules/debugToolLaunch.ts`                 | handler + connection resolution                                                                                                                                                                                       | ✅  |
| `src/common/ipc/channels.ts`                              | `APP_CHANNELS`; `EVENT_CHANNELS.DEBUG_TOOL_LAUNCH_REQUEST`; `TOOL_WINDOW_CHANNELS.OPEN_DEVTOOLS`                                                                                                                      |     |
| `src/common/types/api.ts`                                 | `onDebugToolLaunchRequest`, `openToolDevTools`                                                                                                                                                                        |     |
| `src/main/preload.ts`                                     | expose both                                                                                                                                                                                                           |     |
| `src/main/index.ts`                                       | 2 fields + constructor; init before `whenReady`; `attachWindow`; protocol callback → `runWhenReady`; `setupHandler`; `OPEN_DEVTOOLS` handler; `handleSecondInstanceCommandLine`; rewrite the second-instance listener |     |
| `src/main/managers/protocolHandlerManager.ts`             | remove listener; add `handleSecondInstanceCommandLine()`                                                                                                                                                              |     |
| `src/main/managers/toolWindowManager.ts`                  | `openDevToolsForInstance()`; delegate the existing method                                                                                                                                                             |     |
| `src/renderer/modules/initialization.ts`                  | emit `RENDERER_READY`; register the listener                                                                                                                                                                          |     |
| `src/main/managers/settingsManager.ts`                    | `trustedDebugToolPaths` (D1)                                                                                                                                                                                          |     |
| `src/renderer/modals/debugToolTrust/`                     | trust modal, MVC per existing modal pattern (D1)                                                                                                                                                                      | ✅  |
| `tests/unit/main/managers/settingsManager.test.ts`        | trust-list add/read/revoke cases (D1)                                                                                                                                                                                 |     |
| `tests/unit/main/launchArgs.test.ts`                      | 11 parser cases                                                                                                                                                                                                       | ✅  |
| `tests/unit/main/managers/debugToolLaunchManager.test.ts` | 5 buffer/flush cases                                                                                                                                                                                                  | ✅  |
| `tests/unit/main/managers/rendererReadyGate.test.ts`      | 4 gate cases, incl. reload reset                                                                                                                                                                                      | ✅  |
| `docs/CLI_DEBUG_TOOL_FLAG.md`                             | rewrite to match this plan                                                                                                                                                                                            |     |

`src/renderer/modules/toolManagement.ts` and `src/main/managers/toolsManager.ts` need **no changes**.

## Validation steps

- `pnpm run typecheck`
- `pnpm run lint` (0 errors)
- `pnpm run build`
- `pnpm test`

Manual matrix: cold launch × warm reload, on Windows packaged / macOS packaged (in-bundle binary) / Linux AppImage. Plus: close-guard-vetoing tool, pinned tab, bad path, unbuilt tool (no `dist/index.html`), `--debug-tool .` from the tool folder, and `Ctrl+R` renderer reload followed by a second-instance invocation.

D1-specific: first run on a path prompts; second run does not; declining aborts the mount cleanly; renaming the package at a trusted path re-prompts; revoking from Settings re-prompts; the prompt names the environment when `--debug-tool-connection` is supplied.

## Risks & rollback

- **R1** — If the renderer-ready gate regresses, both `--debug-tool` and `pptb://` silently no-op. Mitigated by unit tests 17–20 and the manual matrix.
- **R2** — Moving the protocol `second-instance` listener into `index.ts` touches a shipping deep-link path. Mitigated by keeping the `protocolEnabled` early-out inside the moved method.
- **R3** — Emitting `RENDERER_READY` at the end of init means a slow `restoreSession()` delays the tool opening. Acceptable; the window is already visible.
- Rollback: the feature is additive behind a flag nobody passes by default. Reverting the `second-instance` and protocol-callback changes restores current behaviour exactly.
