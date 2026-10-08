# PR7: Public Worker API And Local Debug Loop

Status: **In progress**. User explicitly started PR7 on 2026-10-05. PR6 is
complete. This implementation must not be considered accepted until its security,
local-feed, API, lifecycle, test and build gates below pass. Do not expose native
execution beyond the reviewed tool-scoped API described here.

## Scope

- Expose a narrow, typed, per-tool-instance `toolboxAPI.workers` API through the
  'tool preload: start a declared worker, subscribe to messages, send JSON-RPC
  messages, observe lifecycle/diagnostics, and stop/dispose. No arbitrary
  executable, command, feed, working directory, environment or identity input.
- Install message listeners before starting and preserve PR4's bounded early
  message handling, owner checks, backpressure and disposal semantics.
- Provide a browser-compatible RPC client adapter and an author example showing
  the `platform/initialize` handshake, request/response, reverse Dataverse
  callback through `dataverseAPI`, progress, cancellation and shutdown.
- Add a developer-only workflow for an unpublished .NET worker package so an
  author can iterate with PPTB's Load Local Tool flow. This needs a trusted,
  explicit developer configuration for a local NuGet feed. The source must be
  resolved and validated in the main process, never supplied by tool renderer
  code. Do not relax the marketplace/registry nuget.org-only policy or accept an
  arbitrary feed from `pptb.config.json`.
- Bind preparation/cache identity and native consent to the effective source and
  exact package ID/version. Changing feed or package bytes must not reuse stale
  approval or cache artifacts.
- Keep SDK/runtime discovery, package/runtime verification, consent and process
  ownership delegated to PR2-PR6. Do not add a terminal bypass, token forwarding,
  query replay, MCP/headless execution or implicit runtime/package installation.

## Local Debug Source Design Gate

PR3 currently fixes NuGet restore to nuget.org. Therefore a locally loaded npm
tool cannot currently test an unpublished `.nupkg`; publishing every worker edit
to nuget.org is not an acceptable development loop. PR7 must design and test an
explicit local-only source mode before claiming local debug support.

The feed is selected using `PPTB_DOTNET_LOCAL_NUGET_FEED` in the main-process
launch environment. Local packages are admitted only if the app is unpackaged and
the main-process bundle contains the build-time `PPTB_DEVELOPER_BUILD=1` marker
injected exclusively for Vite development mode. No app setting or tool IPC can
change the feed. In this design:

- Only enable local feeds when both conditions hold: the app is unpackaged and
  the main-process bundle contains the build-time `PPTB_DEVELOPER_BUILD=1`
  marker injected only by Vite development mode. An arbitrary unpackaged
  production bundle is insufficient. Default remains nuget.org only.
- Keep the configured feed outside the tool package, tool IPC arguments and
  `pptb.config.json`. A tool must not choose a path or URL, bypass consent, or
  change feed configuration at runtime.
- Test both an app-owned local directory feed containing a packed `.nupkg` and
  the unchanged nuget.org-only marketplace path. Reject file feeds in packaged
  builds, arbitrary HTTPS feeds, source shadowing and inherited `NuGet.Config`.
- Use a fresh package version for each iteration or atomically replace the local
  feed package and invalidate its prepared cache/consent identity. Never resolve
  a floating/latest package.
- Test that npm-debug-installed tools, as well as registry/marketplace tools,
  remain nuget.org-only with the developer feed configured. Only `Load Local
Tool` identities may resolve the worker from the developer feed.
- Provide a clear missing-SDK/runtime/worker-install error. Installing the npm
  tool or opening a local tool must not itself execute restore or worker code.

## Developer Test Guide

The [local-debug workflow](../../docs/DOTNET_WORKERS.md#local-debug-with-an-unpublished-package)
is the runbook to complete alongside the API. Internal feed restrictions and
qualification limits are in the [engineering reference](../../docs/DOTNET_WORKERS_ENGINEERING.md#pr7-local-feed-and-qualification).
Update planned steps as implementation and real local-package tests pass.

## Acceptance Gates

1. Pure API tests: missing declaration, unknown worker ID, spoofed owner,
   duplicate start, subscribe-before-start ordering, message validation,
   disposal/unsubscribe, exit/error and bounded callbacks.
2. Local `.nupkg` smoke: build/pack a console adapter that references the shared
   core, place the exact pinned version in the trusted developer feed, load its
   npm UI with Load Local Tool, approve consent, start, complete the initialize
   handshake, issue one operation, perform a reverse callback, receive its result,
   cancel and stop. No credentials are sent to the process.
3. Security/source tests: local feeds rejected in packaged builds and for
   marketplace packages; source mutation invalidates cache/consent; unsupported
   versions, TFM, runtime policy, RID or protocol fail before worker launch.
4. Lifecycle tests: close local tool, crash/navigate renderer, revoke consent,
   edit package/declaration, failed prepare, worker crash, explicit app quit and
   tray hide. No auto-replay and unrelated tool instances remain unaffected.
5. Unit, typecheck, lint, build and targeted Playwright/Electron workflow pass.
   Native .NET 10 and OS/architecture certification remains PR8; PR7 must not
   imply cross-platform support based on a single developer machine.

## Explicitly Out Of Scope

- Public/private arbitrary feeds for marketplace tools or end users.
- Automatically downloading/installing/updating a .NET SDK or runtime.
- A public raw byte-stream/ChildProcess API, shell/terminal access, arbitrary
  process launch, bearer-token forwarding, or full LSP client.
- Worker startup on normal npm install, tool open, app launch, MCP or headless
  invocation. Only an explicit declared-worker `start` after consent may prepare
  and launch the worker.

The user authorized PR7 on 2026-10-05. Current implementation and validation state
follows; PR7 remains In progress until the local .NET 10 smoke and all gates pass.

## Execution Log: Local Feed And Config Slice (2026-10-05)

Checkpoint: User selected **Go** for the local-feed/config slice. Overall PR7
remains **In progress**; the tool API, RPC adapter/example, lifecycle acceptance
and packaged end-to-end smoke test are not complete.

Files changed:

- `src/common/types/dotnetTool.ts`, `src/common/types/nativeWorkerConsent.ts`
- `src/main/managers/settingsManager.ts`, `src/main/managers/nativeWorkerConsentManager.ts`, `src/main/managers/dotnetToolManager.ts`, `src/main/managers/workerBrokerManager.ts`
- `src/main/utilities/dotnetLocalFeed.ts`, `src/main/utilities/nativeWorkerIdentity.ts`, `src/main/index.ts`
- `src/renderer/modules/consent/nativeWorkerConsentModal.ts`
- `tests/unit/main/managers/settingsManager.test.ts`, `tests/unit/main/managers/nativeWorkerConsentManager.test.ts`, `tests/unit/main/managers/nativeWorkerIdentity.test.ts`, `tests/unit/main/managers/dotnetToolManager.test.ts`, `tests/unit/main/utilities/dotnetLocalFeed.test.ts`
- the local-debug section in `docs/DOTNET_WORKERS.md`

Decisions and behavior:

- Persist the developer feed path in a separate app-owned `electron-store`, not
  in `UserSettings`; it is therefore absent from the generic user-settings
  payload and the tool preload. The existing main-app settings bridge uses one
  dedicated key guarded by exact main-window sender identity. Packaged builds
  cannot read or change this setting.
- Local feed selection is explicit in Consent Review and applies only to tools
  loaded with `localPath` (Load Local Tool). Marketplace/registry tools retain
  nuget.org as their only package source.
- Accept only absolute canonical flat directories with no symlink path/entries;
  require the exact pinned `.nupkg`. NuGet config clears inherited sources,
  maps only the declared package ID to the local feed, and maps dependencies to
  nuget.org. Preparation verifies the restored archive against the selected
  package SHA-512.
- Include source kind, canonical directory and package hash in consent identity
  and preparation/cache authority. A changed path or package byte sequence
  cannot reuse the previous approval or prepared cache.
- To avoid the API agent's public API surface, no worker channels, preload
  methods, or `ToolboxAPI` contracts were added. `index.ts` changes are limited
  to the main-window settings-key guard and source resolution callbacks.

Validation:

- VS Code diagnostics (`get_errors`) on all changed implementation and test
  files: no errors found after the final edits.
- Added focused Jest coverage for app-settings isolation, feed path/package
  validation, flat-feed and symlink rejection, marketplace source isolation,
  consent source fingerprinting, local NuGet source mapping, and package-byte
  cache invalidation. The Jest command itself was not available to run from the
  current tool interface; `pnpm run typecheck`, `pnpm run lint`, and
  `pnpm run build` also remain to be run by the workspace task runner.

### Environment Configuration Refinement

The follow-up implementation request selected a process environment variable
instead of the earlier main-app settings UI. `PPTB_DOTNET_LOCAL_NUGET_FEED` is
read only by the main process, only for `tool.localPath` identities, and is
rejected in packaged builds. Registry/marketplace identities remain nuget.org
only. Removed the persisted developer setting and consent-review feed editor;
the preparation manager independently re-resolves the configured feed before
accepting a local source. Final validation evidence is recorded below.

Files changed for this refinement:

- `src/main/utilities/dotnetLocalFeed.ts`, `src/main/utilities/nativeWorkerIdentity.ts`
- `src/main/managers/dotnetToolManager.ts`, `src/main/managers/settingsManager.ts`, `src/main/index.ts`
- `src/common/types/dotnetTool.ts`, `src/renderer/modules/consent/nativeWorkerConsentModal.ts`
- `tests/unit/main/utilities/dotnetLocalFeed.test.ts`, `tests/unit/main/managers/nativeWorkerIdentity.test.ts`, `tests/unit/main/managers/dotnetToolManager.test.ts`, `tests/unit/main/managers/settingsManager.test.ts`
- the local-debug section in `docs/DOTNET_WORKERS.md`

Validation:

- `get_errors` on all changed implementation and test files: no errors.
- Workspace search for the removed persisted setting key and accessors: no
  remaining references.
- Jest, `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` were not
  executable from this session because the available task interface exposes
  task-output retrieval but no task/terminal start operation. Run those checks
  before merging; the overall PR7 acceptance gates remain open.
- No preload, IPC channel, public toolbox API, tool-window ownership, or shared
  status-tracker files were changed. The consent decision/authorization logic is
  unchanged; only the obsolete renderer feed-configuration section was removed.

### Public API, RPC Example And Developer-Build Gate (2026-10-05)

- PR7 tool API exposes `toolboxAPI.workers.start/send/onMessage/onExit/stop/dispose`
  through tool preload and sender-bound main IPC. The preload transport subscribes
  before tool script execution and buffers bounded early events. Main IPC derives
  identity from actual WebContents; no arbitrary process options are accepted.
- Browser adapter uses `vscode-jsonrpc/browser`. The HTML UI, worker manifest,
  C# console tool and referenced Core project are now co-located in the sibling
  `sample-tools/new/html-sample` repository. The sample handles initialize, a
  reverse FetchXML callback via `dataverseAPI`, progress, cancellation and
  shutdown; its Core is a bridge example.
- Local feeds require the app to be unpackaged AND its main bundle to carry
  `PPTB_DEVELOPER_BUILD=1`, injected only for Vite development mode. The explicit
  feed path is `PPTB_DOTNET_LOCAL_NUGET_FEED`, read only in the main process and
  only for `tool.localPath` identities. NuGet source mapping routes exact worker
  ID to local feed and dependencies to nuget.org. Missing local package cannot
  fall back. Registry, marketplace and npm-debug workers remain nuget.org-only.
  Consent binds canonical feed path and package SHA-512.
- The sample's seven `npm test` cases exercise its browser RPC adapter, fake
  worker and reverse Dataverse callback. The sample remains a standalone npm
  package outside the desktop app workspace.
- Focused API5, RPC4, bridge example1, local feed/identity/preparation124, and
  settings53 passed in separate runs. RPC connection disposal on transport exit
  was added after the cancellation/exit regression surfaced; RPC4 and bridge1
  passed afterward.
- `npm --prefix ../sample-tools/new/html-sample test` and `npm --prefix
../sample-tools/new/html-sample run pack:worker` pass. The local package
  installs and completes the `jsonrpc-stdio-v1` initialize handshake; generated
  feed artifacts are ignored by the sample repository.
- Final root run: `pnpm run test:unit --runInBand --no-cache` passed 59 suites,
  1,087 tests, with five optional PR0 tests skipped. `pnpm run typecheck`,
  `pnpm run lint`, and `pnpm run build` passed; existing parser/Vite warnings remain.
- One C# callback message DTO now explicitly maps JSON `value` to `Value`. Public
  API/event ordering and example guide reviewed. Consent displays local feed path
  and package hash. Developer-source tests reject unpackaged production builds,
  marketplace/registry/npm-debug identities, arbitrary feeds, missing packages and
  source-content changes.
- `dotnet --list-sdks` reports 8.0.100/8.0.403/9.0.203, no .NET10. The C#
  `net10.0` project has not been packed/restored/run, so the local NuGet smoke is
  not complete. No SDK was installed. Keep PR7 in progress until available-host
  tests pass and this external runtime limitation is explicitly handled in the
  acceptance decision; do not claim real worker interoperability from fake tests.
