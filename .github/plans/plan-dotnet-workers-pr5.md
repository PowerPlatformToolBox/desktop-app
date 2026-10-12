# PR5 Native Worker Consent

## Main-Agent Acceptance (2026-10-05)

Status: Completed. The main agent executed the acceptance gates after repairs:

- 62 focused consent/identity/filesystem tests passed. Follow-up security review
  found no remaining blocker in loaded identity, early loading or main-only IPC.
- Five Chromium Playwright checks passed for prompt focus/Escape, save-error
  recovery, review/revoke, mobile framing and desktop dark theme. Screenshots
  inspected. Fixture uses the real module/styles with mocked consent API responses;
  full packaged Electron workflow is not claimed.
- Fresh serial no-cache Jest: 971 passed, five opt-in PR0 tests skipped. A stale
  editor-runner global-type failure passed in a fresh process without source edits.
- Typecheck, lint and production build passed; formatting, diagnostics and
  git diff --check passed. Existing parser/Vite warnings remain.
- Chromium installed for browser validation only; no .NET/SDK/package download or
  worker launch. Native revocation/launch integration remains PR6, qualification PR8.
- No commits or branches. See tracker for combined acceptance evidence.

Checkpoint: APPROVED (explicit user selection, 2026-10-05).

## Scope

Implement native-worker consent policy and trusted main-window UI only. No execution,
downloads, dependency changes, shared tracker edits, PR2 edits, or agent files.
Owned shared files: settings manager/types, main index/preload/channels/type exports,
renderer consent review/initialization/styles, minimal consent wiring only.

## Acceptance

- Resolve identity and canonical worker metadata internally; never trust renderer authority.
- SHA-256 snapshot binds tool/version/worker, normalized declaration, nuget.org,
  protocol and platform matrix version 1. Local config changes require fresh consent.
- Trusted UI only; deduplicated multi-owner prompts; bounded cleanup; fail closed on
  mutation, revocation, caller/UI destruction, timeout and disposal.
- Explicit same-user native-code warning, no sandbox or silent-install implication.
- Sanitized private approvals, review/revoke UI and targeted internal revocation event.
- Mocked unit coverage for spoofing, decisions, normalization, changes and races.

## Validation

Focused Jest manager test, TypeScript checks, lint and build where executable tools
are available. GUI verification manual if no Electron GUI test path is available.

## Execution Log

- Read existing header consent, settings, review UI, worker metadata and identity contracts.
- Implementation started after approval. No agent messaging tool is available; scoped
  edits preserve concurrent work. Command execution availability will be recorded.
- Added canonical consent types and manager, private SettingsManager store, guarded
  main IPC and main-only preload methods; no authorize call site or execution path.
- Added textContent-based native disclosure modal and Consent Review section, with
  minimal initialization/style wiring; no shared tool API or tool preload changes.
- Added mocked manager tests and a pure Node disclosure test, plus
  docs/DOTNET_WORKERS_ENGINEERING.md consent/broker sections with the PR6 lifecycle/event handoff.
- get_errors checked each implementation slice. Editor test diagnostics exposed
  a missing record fingerprint and a Node/renderer ambient-type mismatch; both
  were repaired. Sass @use ordering was also corrected after a targeted check.
- No terminal/run_task tool is available. Attempted the focused pnpm Jest command
  through the Playwright Node tool, but it cannot use dynamic imports or require;
  neither attempt started pnpm. Direct Jest/typecheck/lint/build execution remains
  pending. Editor test diagnostics may reflect asynchronous/stale background runs.
- Decision: store approval records separately rather than exposing authority through
  generic UserSettings; no shared settings type change is needed. Native local
  config fingerprinting uses all canonical native declaration fields, never paths.
- GUI modal verification remains manual; no jsdom, dependencies, processes,
  downloads, shared tracker, PR2/new agent files, memory, commits or branches changed.
- Latest focused get_errors result: no diagnostics in the manager, unit test or
  native modal. This is not a claim that the direct Jest command passed.
- Final storage tightening: the private store uses fingerprint dictionary keys,
  rejecting key/record mismatches before canonical row sanitation. Final shared
  wiring diagnostic pass also returned no errors.

### PR5 Security Finding Follow-Up (2026-10-05)

- Restricted follow-up to launch-bound native-consent identity. No PR3/PR4,
  shared tracker, dependencies, documentation, memory or commit changes.
- ToolWindowManager freezes actual launch-object ID/name/version and the source
  directory computed by the existing protocol manager before loading. A separate
  WebContents getter preserves existing Dataverse identity clients. No registry
  metadata refresh or repeat launch of an existing instance changes the binding.
- Bound identities are removed on close, destroyed WebContents, failed launch
  and all-view teardown. Recreated instances capture a new identity.
- The default index resolver delegates to a side-effect-free-import helper. It
  rejects current tool ID/version/source or live package version mismatches before
  live declaration validation; stale v1 renderers cannot acquire v2 authorization.
- Same-version local declaration changes remain live-validated and fingerprinted:
  valid changes require fresh consent, invalid changes cannot reuse cached grants.
- Added tests/unit/main/managers/nativeWorkerIdentity.test.ts and
  tests/unit/main/managers/toolWindowLoadedIdentity.test.ts for cached v2 approval,
  stale v1 sender, disk-only changes, source changes, update during a prompt,
  malicious declarations after approval, actual mocked launches and cleanup.
- Validation performed: focused get_errors immediately after each code edit.
  Production files and resolver tests returned no diagnostics. Editor reported an
  earlier npm getter-test expectation failure; the assertion now uses the existing
  protocol calculation, but a subsequent diagnostic still showed the old expected
  value. A later editor Jest report exposed a private-field intersection typing
  error in the fixture; replaced the prototype fixture with normal construction.
  A fresh executable test run is needed to confirm the final suite result.
- No terminal/run_task tool is available in this session. No pnpm command was run,
  and the reported initial 192 passing tests are not claimed as post-fix evidence.
  Pending focused command: pnpm exec jest --runInBand --runTestsByPath
  tests/unit/main/managers/nativeWorkerConsentManager.test.ts
  tests/unit/main/managers/nativeWorkerIdentity.test.ts
  tests/unit/main/managers/toolWindowLoadedIdentity.test.ts
  tests/unit/main/managers/toolWindowManager.test.ts.
  Full typecheck/lint/build also remain pending for this follow-up.

### Filesystem Caller Blocker Follow-Up (2026-10-05)

- User requested the smallest owning filesystem/early-launch slice under the approved
  PR5 checkpoint. No protocol-manager, dependency, shared tracker, agent, memory,
  commit or branch changes.
- Added src/main/utilities/filesystemCaller.ts: only the exact live main WebContents
  is unrestricted; all other senders require recognized live tool ownership, with
  path validation for direct access. Unknown or destroyed callers fail closed.
- src/main/index.ts routes all nine filesystem channels through the guard before
  work or dialogs. Save/select permission requests reject unknown callers and
  recheck ownership before granting the selected path. No delete channel exists.
- src/main/managers/toolWindowManager.ts registers view, frozen loaded identity,
  display name and connection IDs before loadURL. Failed launches use forced close;
  destroyed views remove ownership/grants, and closed loads cannot restore maps.
  Existing protocol source calculation and prior launch-bound identity work remain.
- Added tests/unit/main/managers/toolFilesystemCaller.test.ts for exact main trust,
  unknown direct/dialog callers, missing owners, validation during fake loadURL
  before context, failed-load cleanup/retry, stale destroy callbacks, destruction
  during loading and destroyed main senders. Updated the failed-launch assertion in
  tests/unit/main/managers/toolWindowLoadedIdentity.test.ts to require full cleanup.
- Validation: focused get_errors immediately after each code slice. Production
  files and the existing identity test have no diagnostics. The editor Jest report
  exposed two new fixture type errors; both were corrected, but the last report
  still displayed pre-edit source. A fresh run remains necessary.
- No terminal/run_task tool is available. No direct pnpm command was run; earlier
  reported 239 passing main tests are not post-change evidence. Pending command:
  pnpm exec jest --runInBand --runTestsByPath
  tests/unit/main/managers/toolFilesystemCaller.test.ts
  tests/unit/main/managers/toolWindowLoadedIdentity.test.ts
  tests/unit/main/managers/toolWindowManager.test.ts
  tests/unit/main/managers/nativeWorkerConsentManager.test.ts
  tests/unit/main/managers/nativeWorkerIdentity.test.ts.
  pnpm run typecheck, pnpm run lint, pnpm run build and Electron GUI verification
  remain manual. Changed files: the helper, index, ToolWindowManager, the two tests,
  and this required plan execution log only.

### Scoped Source Organization (2026-10-05)

- Checkpoint: APPROVED by explicit user scope and acceptance criteria in chat.
- Read current source and PR5 edits before changing them. Renamed the helper to
  src/main/utilities/filesystemAuthorization.ts and authorizeFilesystemCaller,
  updating main IPC and the existing toolFilesystemCaller.test.ts suite name and
  calls. Exact-main/known-instance recognition still delegates path checks to
  ToolFileSystemAccessManager; no manager or low-level filesystem behavior changed.
- Grouped these five files under src/renderer/modules/consent/: cspExceptionModal.ts,
  dataverseHeaderConsentModal.ts, nativeWorkerConsentModal.ts, sentryConsentModal.ts
  and consentReviewManagement.ts. Updated common/modals/parent-module imports,
  initialization.ts, toolManagement.ts, the closeAllTools unit mock, the native
  consent manager test import and the e2e source-read path. APIs and markup remain
  unchanged; no modal merge, UI separation or broad restructuring.
- Updated docs/DOTNET_WORKERS_ENGINEERING.md and the current source tree in
  .github/copilot-instructions.md. Historical execution entries retain old names;
  current paths are recorded here and below. Shared tracker remains main-agent-owned.
- Validation: focused get_errors immediately after the helper rename and consent
  move; all touched TypeScript files and tests returned no diagnostics. No terminal
  or run_task tool is available. Attempted read-only git status/diff through the
  Playwright Node runner; dynamic import failed before any command executed.
- Main agent verified and deleted all six original copies with standalone patches;
  true moves are complete, with no compatibility exports or stale live imports.
- Main-agent validation: 52 focused tests passed; full serial Jest passed 971 tests
  with five opt-in probe tests skipped. The five consent browser tests passed at
  the new path. Typecheck, lint, production build and git diff --check passed;
  existing toolchain warnings remain.
- Dependencies and exact vscode-jsonrpc 8.2.1 pin unchanged. No main worker/runtime
  moves, shared tracker edits, memory, commits or branches.

### Files Changed

- .github/plans/plan-dotnet-workers-pr5.md
- src/common/types/nativeWorkerConsent.ts
- src/common/types/index.ts
- src/common/ipc/channels.ts
- src/main/managers/nativeWorkerConsentManager.ts
- src/main/managers/settingsManager.ts
- src/main/index.ts
- src/main/preload.ts
- src/main/utilities/filesystemAuthorization.ts
- src/renderer/modules/consent/cspExceptionModal.ts
- src/renderer/modules/consent/dataverseHeaderConsentModal.ts
- src/renderer/modules/consent/nativeWorkerConsentModal.ts
- src/renderer/modules/consent/sentryConsentModal.ts
- src/renderer/modules/consent/consentReviewManagement.ts
- src/renderer/modules/initialization.ts
- src/renderer/modules/toolManagement.ts
- src/renderer/styles.scss
- tests/unit/main/managers/toolFilesystemCaller.test.ts
- tests/unit/main/managers/nativeWorkerConsentManager.test.ts
- tests/unit/renderer/closeAllTools.test.ts
- tests/e2e/nativeWorkerConsent.test.ts
- docs/DOTNET_WORKERS_ENGINEERING.md
- .github/copilot-instructions.md
