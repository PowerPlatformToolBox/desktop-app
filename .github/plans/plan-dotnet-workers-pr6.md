# PR6 Internal Worker Broker

## Main-Agent Acceptance (2026-10-05)

Status: Completed. Earlier subagent tooling limitations below do not describe
the main session. The final reviewed implementation passed executable gates:

- Initial broker/quit tests passed, then reviews found lifecycle and cancellation
  gaps. Repairs and targeted regressions were implemented before acceptance.
- Focused orchestration tests: 272 passed. Actual app lifecycle, quit and broker
  follow-up: 58 passed. Final restore/preparation suite: 106 passed.
- Full pnpm run test:unit --runInBand: 55 suites, 1,067 tests passed, five opt-in
  PR0 tests skipped. Five consent Playwright tests passed against built styles.
- Desktop typecheck and production build passed. Lint's single prefer-const
  finding was repaired and lint rerun passed. Existing parser/Vite warnings remain.
- Formatted touched files with project settings; final diagnostics and
  git diff --check passed. Actual helper names are appWorkerLifecycle.ts and
  tests/unit/appWorkerLifecycle.test.ts, not the anticipated workerInstallMutation
  filenames in the first formatting command (that command was corrected).
- Follow-up review verified live launch authority, mutation gates, cleanup
  quarantine, terminal-state release and observed restore close. No blockers remain.
- No actual .NET10 acquisition, NuGet restore, worker execution, publication,
  Git commits/branches or public worker launch exposure. Native/package/platform
  and actual Electron/updater qualification remain later gates. PR7 not started.

Checkpoint: GO. User explicitly requested startPR6 with scope and acceptance criteria on 2026-10-05.

## Scope

- Connect sender-derived installed/live identities, native consent, DotNet discovery, approved preparation and immutable process launch descriptors through an internal broker.
- Preserve allow-once approval; recheck approval epoch and live source at async boundaries, cancel preparation on revocation or owner disposal.
- Authorize handles and message subscriptions by actual tool instance. No renderer-callable launch handlers or preload API (PR7).
- Await owner shutdown for close, crash, destruction and navigation; stop affected tools before update/uninstall and block concurrent starts during mutation.
- Explicit quit waits for confirmation and worker shutdown before committing other cleanup. Canceled close/quit and tray background behavior preserve workers.
- Inject all subsystems in focused tests; no SDK acquisition, real NuGet commands, commits or branches.

## Validation

Focused broker, consent, preparation, transport and lifecycle tests; legacy terminal and tool-window tests; full unit suite; pnpm run typecheck, pnpm run lint, pnpm run build. Use IDE diagnostics when execution tools are unavailable and report outstanding command gates honestly.

## Execution Log

- Read current consent, preparation, transport, tracker and historical session plan. Historical plans are not current implementation evidence.
- Marked PR6 In progress before substantive implementation. Local hypothesis: a live approval lease plus cancellation at preparation boundaries prevents revoked/changed sources from reaching restore or launch without requiring persistent consent.

- Added `src/main/managers/workerBrokerManager.ts` and `src/main/utilities/workerQuit.ts`.
- Modified index wiring, ToolWindowManager lifecycle hooks, NativeWorkerConsentManager live leases/cancellation, DotNetDiscoveryManager probe controls, DotNetToolManager command/publication checks, WorkerProcessManager final launch hook/deferred handshake deadline/verified stop, nativeWorkerIdentity source hashing, and internal dotnetTool cancellation error type.
- Added broker and quit tests; extended consent, preparation, process, loaded-identity, native-identity and tool-close regressions. Existing terminal block/preload/public API files are untouched.
- Added the broker contract to docs/DOTNET_WORKERS_ENGINEERING.md; minimally updated PR3/4/5 handoffs and tracker. No memory writes, commits, branches, SDK installation or real NuGet execution.
- Every substantive patch followed by focused get_errors. Two fixture typing errors were repaired and the same checks rerun clear. Final diagnostics pending below; no Jest pass count claimed.
- Attempted focused command execution through the available Playwright process tool. Dynamic import failed with ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING; CommonJS failed with require is not defined. Both failed before pnpm started. No usable terminal/run_task/runTests tool is exposed in this session.
- Decisions: exact WebContents object membership; preparation fingerprint combines reviewed consent and actual installed-source bytes/path; allow-once lease does not require persistence; per-owner cancellation avoids shared cancellation authority; fail destructive mutation on unobserved exit; no public event channels or launch handlers; protocol deadline begins after preparation for broker calls only.
- Final diagnostic sweep surfaced externally populated Jest failures for an overloaded fs.lstat fixture and legacy startup error expectations. Replaced the overloaded mock with a fail-if-called Promise<never> fixture; specific startup codes are now broker-only opt-in, retaining legacy STARTUP_FAILED defaults. Focused get_errors rerun reports clean production sources but still repeats pre-edit test messages (including the removed mock expression). These stale test diagnostics cannot be refreshed with the available tools. A fresh focused Jest run is mandatory; do not claim all tests or all editor diagnostics clear.

## Pending Command Gates

### Lifecycle Review Repairs (2026-10-05)

- User approved index/ToolWindowManager/workerQuit lifecycle-only repairs. Broker/transport are owned by another agent; tracker is owned by the main agent. No edits to those files, consent/preparation/filesystem implementation, memory, or Git commits.
- Changed `src/main/index.ts`, `src/main/managers/toolWindowManager.ts`, `src/main/utilities/workerQuit.ts`; added `src/main/utilities/appWorkerLifecycle.ts`. Extended `tests/unit/workerQuit.test.ts`, `tests/unit/main/managers/toolWindowManager.test.ts`, `tests/unit/main/managers/toolWindowLoadedIdentity.test.ts`; added `tests/unit/appWorkerLifecycle.test.ts`.
- Registry install/reinstall, prerelease and debug install now validate exact live main-window sender before lookup and again inside mutation gates. Canonical identities come from loaded tools/installed manifests and registry entries for new registry installs. Npm writes gate actual `npm-<sanitized-package-name>` loaded identity plus all existing package-matched IDs in deterministic order before package writes. Reject arbitrary npm sources/aliases/options. Debug installs do not require catalog availability. Uninstall resolves main-owned target without renderer arbitrary-ID fallback. Existing update gate retained.
- Restart/relaunch and updater actions share confirmation, awaited broker stop and cleanup. Successful stop commits shutdown; cleanup errors are logged and still run the shutdown action. Precommit stop failure restores `isQuitting` and requires fresh confirmation. Reentrant before-quit stays blocked until committed cleanup settles. Updater's next-turn install runs before a next-turn fallback quit, preventing an updater no-op from freezing an already shut-down application.
- App-close confirmation no longer clears prevent-close registrations. Only committed window finalization clears them. Shared idempotent finalizer handles explicit close, external destruction and all-view teardown: resolves pending invocation results with null, releases active callees, detaches active/split views, closes terminals, revokes filesystem access and clears maps. In-flight owner disposal is deduplicated; explicit close preserves live state on stop failure, whereas already-destroyed views finalize immediately and await/log worker disposal failure.
- Validation actions: focused `get_errors` after every substantive edit; final sweep reports no errors for all eight touched production/test files. Earlier stale external test diagnostics for the generic Jest mock and direct `WebContents.destroy` expressions cleared after the typed adapters and final refresh. IDE diagnostics are not a verified executable test result.
- No terminal/run_task/runTests command tool is exposed for this repair session. No pnpm/Jest/typecheck/lint/build/Prettier command executed and no test pass count claimed. Main agent must run focused suites and command gates below; this log does not mark PR6 complete.

Additional focused commands for this slice:

```sh
pnpm exec prettier --write src/main/index.ts src/main/managers/toolWindowManager.ts src/main/utilities/workerQuit.ts src/main/utilities/appWorkerLifecycle.ts tests/unit/workerQuit.test.ts tests/unit/appWorkerLifecycle.test.ts tests/unit/main/managers/toolWindowManager.test.ts tests/unit/main/managers/toolWindowLoadedIdentity.test.ts
pnpm run test:unit --runInBand --runTestsByPath tests/unit/workerQuit.test.ts tests/unit/appWorkerLifecycle.test.ts tests/unit/main/managers/toolWindowManager.test.ts tests/unit/main/managers/toolWindowLoadedIdentity.test.ts
```

Run from workspace root using the main agent's command/test tools:

```sh
pnpm exec prettier --write src/main/index.ts src/main/managers/workerBrokerManager.ts src/main/managers/workerProcessManager.ts src/main/managers/nativeWorkerConsentManager.ts src/main/managers/dotnetDiscoveryManager.ts src/main/managers/dotnetToolManager.ts src/main/managers/toolWindowManager.ts src/main/utilities/nativeWorkerIdentity.ts src/main/utilities/workerQuit.ts src/common/types/dotnetTool.ts tests/unit/main/managers/workerBrokerManager.test.ts tests/unit/main/managers/workerProcessManager.test.ts tests/unit/main/managers/nativeWorkerConsentManager.test.ts tests/unit/main/managers/dotnetToolManager.test.ts tests/unit/main/managers/toolWindowManager.test.ts tests/unit/main/managers/toolWindowLoadedIdentity.test.ts tests/unit/main/managers/nativeWorkerIdentity.test.ts tests/unit/workerQuit.test.ts
pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/workerBrokerManager.test.ts tests/unit/workerQuit.test.ts tests/unit/main/managers/nativeWorkerConsentManager.test.ts tests/unit/main/managers/nativeWorkerIdentity.test.ts tests/unit/main/managers/dotnetToolManager.test.ts tests/unit/main/managers/workerProcessManager.test.ts tests/unit/main/managers/toolWindowManager.test.ts tests/unit/main/managers/toolWindowLoadedIdentity.test.ts tests/unit/main/managers/toolFilesystemCaller.test.ts tests/unit/dotnetDiscovery.test.ts tests/unit/main/managers/terminalManager.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:unit --runInBand --no-cache
git diff --check
```

No real SDK/NuGet qualification commands should be run for PR6. Review actual
Electron close/navigation/tray/quit and injected test results before completion.
All-unit legacy compatibility is a pending gate, not verified in this session.

## Broker/Process Review Repair (2026-10-05)

- Scope explicitly approved by the user: broker and WorkerProcessManager only, their tests, minimal WORKER_BROKER documentation and this append. Index/window/quit remain owned by the other agent. Shared tracker, memory, dependencies, public APIs and commits are untouched.
- Changed `src/main/managers/workerBrokerManager.ts`, `src/main/managers/workerProcessManager.ts`, `tests/unit/main/managers/workerBrokerManager.test.ts`, `tests/unit/main/managers/workerProcessManager.test.ts`, `docs/DOTNET_WORKERS_ENGINEERING.md`, and this plan. No workerProcess type changes were needed.
- Added internal owner/handle terminal subscription. Ready-then-exit/error launches are removed only after verified cleanup; lease/request/preparation/subscription references are released. Explicit restart is allowed, never automatic restart or replay. Subscription removers remain safe after record disposal.
- Verified cleanup requires settled preparation, observed parent exit and stdout/stderr EOF/close. Live tree-kill dispatch must succeed, with bounded post-dispatch exit verification. Preserve the deferred-kill race guard: no old PID/group signal after observed exit. Failed tree dispatch, open inherited pipes or rollback failure retain slots/handles, including after failed owner disposal; mutation and shutdown remain blocked.
- Canceled preparation must settle before destructive work. Expected cancellation/startup rejection is separate from `WORKSPACE_INVALID` rollback failure, which propagates and retains quarantine. Broker cleanup is serialized per launch and supports retry when missing closure evidence later arrives, without discarding failure evidence.
- Added seven process regressions: inherited-pipe quarantine/no old-PID kill/record-limit retention; both-output EOF acceptance; pending live tree-kill result; successful dispatch without exit; delayed exit after successful dispatch; canceled preparation settlement with failed rollback; scoped terminal subscription/disposal. Amended the failed-tree-kill regression to require quarantine even after parent exit/pipe closure. Fake ordinary exits now model closed output pipes; teardown settles intentionally quarantined cases without treating them as verified.
- Added nine broker regression cases: ready-then-exit/crash/error explicit restart with no replay (three cases); intentional stop/restart; owner-close quarantine retaining mutation/shutdown blockers; canceled preparation settlement; aborted rollback failure; spontaneous rollback failure; preparation timeout and settlement-only cleanup retry. Fake broker exits now close output pipes; shutdown failure is expected explicitly only in permanent-quarantine tests.
- First substantive edit was followed immediately by focused IDE diagnostics; each subsequent substantive patch was checked likewise. Initial test diagnostics contained reported Jest failures; the final focused diagnostics reported no errors in both touched test files. Production diagnostics have remained clear. This is not a fresh Jest execution or pass-count claim.
- Available command probe: Playwright process sandbox returned `process: undefined`, `require: undefined`, so pnpm cannot be launched through it. No terminal/run_task/test-execution tool is exposed. No executable test, formatter, typecheck, lint or build command was run by this repair agent; those remain required main-agent gates.

Exact focused repair command:

```sh
pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/workerBrokerManager.test.ts tests/unit/main/managers/workerProcessManager.test.ts
```

Then format the two managers and two tests with project Prettier, run the broader
PR6 command gates above, and retain actual OS process-tree qualification for PR8.

### Final Diagnostic Delta

- A later sweep again reported `WorkerBrokerManager > failed verified stop prevents update or uninstall while a child may still be alive` with `STOP_UNVERIFIED`. Extended successful-tree verification to include queued pipe-close events after observed exit, and made that regression explicitly await pipe-close delivery and assert a subsequent mutation succeeds.
- The same reported Jest failure remains in IDE diagnostics after these repairs; no fresh Jest execution is available to establish whether it persists. Do not treat the earlier clear diagnostic snapshot as final acceptance. Both manager files and the process test file currently report no IDE errors; the broker regression remains a required fresh-run gate. No passing suite count is claimed.

## Exact Restore Close Blocker Repair (2026-10-05)

- User explicitly scoped this repair to the default preparation executor, cleanup error contract, broker retention, adapter-level tests and relevant documentation. Existing GO checkpoint applies. No index/window/quit edits, memory writes, commits, dependencies, real native commands or SDK/NuGet execution.
- Changed `src/main/managers/dotnetToolManager.ts`, `src/common/types/dotnetTool.ts`, `src/main/managers/workerBrokerManager.ts`, and the single preparation-failure recognition condition in `src/main/managers/workerProcessManager.ts`. Extended the three corresponding manager test suites and updated `docs/DOTNET_WORKERS_ENGINEERING.md`.
- Local hypothesis: Node can deliver an abort callback before child close, and its AbortSignal termination does not honor the configured kill signal; callback settlement therefore allowed premature rollback. The discriminating regression supplies a mocked execFile-returned ChildProcess EventEmitter/streams, delivers an early callback and parent exit, and requires preparation/mutation to remain pending until close.
- Default adapter now retains ChildProcess, strips raw signal and timeout from Node options, and owns abort/timeout termination with configured SIGKILL. No graceful restore phase is attempted. Ordinary callback success/failure also requires observed close before settlement. Command deadlines remain 5 seconds for SDK check and 120 seconds for restore, with an additional 5-second close-verification bound. Output limits and redacted errors remain unchanged. Named executor export is internal to its owning module, not a public toolbox API.
- `RESTORE_STOP_UNVERIFIED` survives cancellation precedence, retains the owned stage and filesystem lock, and propagates alongside `WORKSPACE_INVALID` through broker and process cleanup. Mutation/shutdown and subsequent exact-workspace preparation remain blocked. No automatic late-close recovery or forced stale-lock deletion: restart alone cannot prove process termination; trusted manual resolution is required. Indefinitely pending injected executors retain the broker blocker after bounded preparation cleanup timeout.
- Added mocked adapter regressions for already-aborted and abort-at-return races, early AbortError callback versus exit/close, normal callback/close ordering, timeout and max-buffer failures, bounded missing-close errors, retained stage/lock and future-prepare rejection. Added adapter-backed broker mutation waiting, and parameterized spontaneous/aborted cleanup and process-record retention for the new code. No test executes a native command. Preparation timer fixtures install fake timers before creating command deadlines.
- Validation performed: focused `get_errors` after each substantive patch, with no errors reported in the checked production/test files. No terminal/run_task/runTests execution tool is exposed. No Jest, pnpm formatter, typecheck, lint or build command was run by this repair agent. The user's initial 189 passing tests precede this repair and are not acceptance evidence for the new cases. Main agent owns fresh executable validation and final review; this log does not mark PR6 complete.

Focused main-agent gates for this repair:

```sh
pnpm exec prettier --write src/main/managers/dotnetToolManager.ts src/common/types/dotnetTool.ts src/main/managers/workerBrokerManager.ts src/main/managers/workerProcessManager.ts tests/unit/main/managers/dotnetToolManager.test.ts tests/unit/main/managers/workerBrokerManager.test.ts tests/unit/main/managers/workerProcessManager.test.ts
pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/dotnetToolManager.test.ts tests/unit/main/managers/workerBrokerManager.test.ts tests/unit/main/managers/workerProcessManager.test.ts
pnpm run typecheck
pnpm run lint
git diff --check
```

Retain the broader PR6 build/full-unit gates and PR8 native process-tree qualification.
