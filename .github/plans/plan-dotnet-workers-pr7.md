# PR7: Public Worker API And Local Debug Loop

Status: **Not started**. This is a planning artifact, not authorization to begin
implementation. Start only after a separate user GO checkpoint. PR6 remains the
last completed slice; do not expose native execution through a tool before PR7's
acceptance gates are met.

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

The implementation must decide and document how the developer selects the feed
(for example, an app-owned developer setting or a separate dev-only API). In
either design:

- Only enable local feeds in an unpackaged/development build, behind an explicit
  user action or setting. Default remains nuget.org only.
- Keep the configured feed outside the tool package, tool IPC arguments and
  `pptb.config.json`. A tool must not choose a path or URL, bypass consent, or
  change feed configuration at runtime.
- Test both an app-owned local directory feed containing a packed `.nupkg` and
  the unchanged nuget.org-only marketplace path. Reject file feeds in packaged
  builds, arbitrary HTTPS feeds, source shadowing and inherited `NuGet.Config`.
- Use a fresh package version for each iteration or atomically replace the local
  feed package and invalidate its prepared cache/consent identity. Never resolve
  a floating/latest package.
- Provide a clear missing-SDK/runtime/worker-install error. Installing the npm
  tool or opening a local tool must not itself execute restore or worker code.

## Developer Test Guide

The companion [local-debug guide](../../docs/DOTNET_WORKER_LOCAL_DEBUG.md) is
the runbook to complete alongside the API. It records prerequisites, package
build/feed setup, Load Local Tool flow, smoke tests, failure cases and cleanup.
Keep every step labeled as planned until PR7 implements and verifies it.

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

No PR7 implementation, package/test changes, commits or branches are authorized
by this plan alone.
