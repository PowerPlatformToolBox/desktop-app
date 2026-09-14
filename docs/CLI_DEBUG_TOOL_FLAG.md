# CLI `--debug-tool` Flag

> Status: **Implemented**

`--debug-tool <path>` mounts a built local tool and opens it in Power Platform ToolBox. Re-running the command against an open tool closes and relaunches that tool without creating another app instance.

## Invocation

Invoke the installed executable directly; there is no `pptb` PATH shim.

```powershell
& "$env:LOCALAPPDATA\Programs\Power Platform ToolBox\Power Platform ToolBox.exe" --debug-tool .
```

```powershell
& "$env:LOCALAPPDATA\Programs\Power Platform ToolBox\Power Platform ToolBox.exe" `
    --debug-tool . --debug-tool-connection "Contoso Dev" --devtools
```

| Flag                      | Value                       | Behavior                                                                                                                              |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--debug-tool`            | Tool project root           | Accepts `--debug-tool <path>` and `--debug-tool=<path>`. Relative paths use the calling process's working directory. `~` is expanded. |
| `--debug-tool-connection` | Connection ID or exact name | Optional. An unresolved or ambiguous explicit value aborts the launch.                                                                |
| `--devtools`              | None                        | Opens detached DevTools for the exact launched tool instance.                                                                         |

The tool project must contain a readable `package.json` with a `name` and a built `dist/index.html`. PPTB does not install dependencies, run lifecycle scripts, or build the tool.

Unknown switches are ignored. A flag expecting a value does not consume another switch as its value. The last occurrence of each supported flag wins.

## Trust

Before mounting, PPTB canonicalizes the folder with `fs.realpathSync.native()` and reads its package identity. The first launch for a given authorization shows a trust prompt containing:

- the canonical folder path;
- package name, display name, and version;
- the effective connection and environment, when present.

Trust is keyed by canonical path, exact package name, and the final primary/secondary connection tuple. A tuple with no connections is represented as its own authorization. Therefore:

- different folders with the same package name do not share trust;
- changing the package name invalidates existing trust;
- trusting a folder for one primary/secondary combination does not authorize another combination;
- existing grants are listed and revocable under **Consent Review > Trusted Local Folders**.

Reading identity for the prompt parses JSON only. Nothing from the folder executes before trust is granted.

## Launch Behavior

### Cold launch

Launch arguments are parsed before `app.whenReady()`. The request remains buffered until the renderer sends `app:renderer-ready`, after all renderer listeners and session restoration are complete.

### Warm launch

The second process forwards its command line and working directory through Electron's `second-instance` event. The running app focuses its window and resolves relative paths against the second process's working directory.

Warm requests are limited to three in five seconds. Accepted requests are serialized in the renderer so trust prompts and reload operations cannot race.

### Reload

The canonical package identity determines a local tool ID containing a canonical-path hash. This avoids registry and CSP identity collisions between folders sharing a package name.

For an already open tool, PPTB completes connection selection, CSP consent, authentication, and trust first. It creates the replacement BrowserView, then closes every matching old instance and verifies that each actually closed before committing renderer state. A close guard, pinned tab, or `PreventClose` veto closes the replacement and preserves the old instance.

### Connections

1. An explicit connection is resolved by ID first, then exact case-insensitive name.
2. An unresolved or ambiguous explicit connection aborts the launch.
3. Without the flag, the connection stored for the path-scoped local tool ID is used.
4. The normal connection picker runs before trust when a required primary or secondary connection is missing.
5. Existing tokens are reused; expired tokens use the refresh-only flow. The CLI path never starts interactive OAuth on its own.
6. If a selected connection cannot be refreshed silently, the launch aborts and asks the user to reconnect it.

The effective connection is included in the trust authorization before the tool is mounted.

### Debug UI and notifications

The Debug sidebar is revealed for the current session without changing the persisted `showDebugMenu` setting.

Every result is reported in-app. Success includes the canonical path. Invalid paths, malformed package metadata, missing build output, declined trust, close vetoes, and launch failures do not prevent PPTB itself from starting.

## Security Model

A mounted local tool is privileged. It runs in a `BrowserView` with the tool preload bridge and can receive APIs for Dataverse, Power Platform, filesystem, terminal, and inter-tool invocation according to the existing tool host contract.

The CLI path adds these controls:

- canonical path validation before identity or loading;
- component-aware protected-system-directory checks;
- canonical, component-aware containment for every `pptb-webview://` asset request;
- top-level navigation restricted to the tool's isolated `pptb-webview://` origin;
- per-folder, per-package, primary/secondary connection-tuple trust;
- request-correlated trust modal responses;
- serialized launch requests;
- path-scoped local tool IDs;
- sanitized telemetry using `basename#hash`, error names, and non-sensitive state only.

Raw paths and detailed load errors appear only in local notifications. Logger calls must not receive raw paths, working directories, argv, connection names, or raw error messages.

The protected-directory denylist does not cover user-writable locations such as `%TEMP%` or the user profile. The explicit trust prompt is the authorization boundary for those locations.

## Limitations

- The launching process exits after forwarding to an existing instance, so its exit code does not report whether the tool loaded.
- There is no file watching or hot reload; rerun the command after rebuilding.
- There is no Node debugger attachment; `--devtools` opens Chromium DevTools.
- PPTB does not install or build the tool.

## Implementation Map

| File                                                        | Responsibility                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/main/launchArgs.ts`                                    | Argument parsing, path resolution, sanitized path descriptions      |
| `src/main/managers/debugToolLaunchManager.ts`               | Cold buffering and warm request limiting                            |
| `src/main/managers/rendererReadyGate.ts`                    | Delivery after renderer readiness                                   |
| `src/main/managers/settingsManager.ts`                      | Canonical, connection-bound trust grants                            |
| `src/main/managers/toolsManager.ts`                         | Canonical validation, identity probing, path-scoped IDs, mounting   |
| `src/main/managers/toolWindowManager.ts`                    | BrowserView launch, navigation guards, exact-instance DevTools      |
| `src/main/managers/browserviewProtocolManager.ts`           | Canonical asset containment and isolated tool origin                |
| `src/renderer/modules/debugToolLaunch.ts`                   | Serialized trust, reload, connection, launch, and notification flow |
| `src/renderer/modules/debugToolTrustModal.ts`               | Request-correlated trust modal                                      |
| `src/renderer/modules/toolManagement.ts`                    | Explicit launch success/cancellation result                         |
| `src/renderer/modules/cspConsentReviewSidebarManagement.ts` | Trusted local folder review and revocation                          |
