# PR4 Internal Managed Worker Transport

## Main-Agent Acceptance (2026-10-05)

Status: Completed. The earlier subagent tool limitations do not apply to this
verified main-agent result:

- 111 focused transport tests passed after sparse-array and deferred-kill review
  regressions. Framing, handshake, ownership, queues and stop states are covered.
- vscode-jsonrpc 8.2.1 moved into production dependencies and lockfile updated.
- Fresh serial no-cache full Jest: 971 passed, five opt-in PR0 tests skipped.
- Typecheck, lint and production build passed; formatted files and diagnostics
  are clean. Existing parser/Vite warnings remain; git diff --check passed.
- No startup/IPC/public launch path. OS-native process-tree termination and real
  packaged transport qualification remain PR8. No PR0 changes or Git operations.

Checkpoint: **GO**, selected by the user on 2026-10-05 after reviewing the
PR4-only scope and acceptance criteria in chat.

## Scope

- Internal owner-authorized, one-worker-per-declaration-per-instance manager.
- Injected trusted preparation and launch, immutable private launch descriptors.
- Bounded UTF-8 Content-Length framing using vscode-jsonrpc 8.2.1 behind a
  pre-reader byte gate, bounded ordered writes and early-message delivery.
- Platform initialize handshake, fail-stop lifecycle and bounded tree cleanup.
- Fake-child unit tests and internal API/limitations documentation.
- Only new PR4 files; no PR0/PR1/PR2 edits, shared tracker, dependency edits,
  main startup, renderer, IPC, memory, branch or commit operations.

## Validation

Immediately check touched TypeScript with get_errors after each substantive
edit. Main-agent executable gates:

```sh
pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/workerProcessManager.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm exec prettier --check src/common/types/workerProcess.ts src/main/utilities/workerStdio.ts src/main/managers/workerProcessManager.ts tests/unit/main/managers/workerProcessManager.test.ts
git diff --check
```

## Execution Log

- Read PR0 protocol documentation, current PR1/PR2 plans, declaration/discovery
  contracts, Jest configuration, neighboring tests and installed jsonrpc reader
  implementation. No changes to those files.
- Local hypothesis: the library's pre-validation buffer and asynchronous decode
  queue need an upstream bounded frame gate. Fragmented oversized-header/body
  and burst tests are the discriminating checks.
- Added this GO artifact and private internal contracts.
- Runtime dependency handoff: main agent must move vscode-jsonrpc 8.2.1 from
  devDependencies to dependencies before production wiring/shipping. No dependency
  file is edited by PR4.
- No terminal, run_task or runTests tool is exposed in this session. Executable
  validation is pending main; editor diagnostics are not test execution.
- Implemented only these new owned files:
    - src/common/types/workerProcess.ts
    - src/main/utilities/workerStdio.ts
    - src/main/managers/workerProcessManager.ts
    - tests/unit/main/managers/workerProcessManager.test.ts
    - docs/DOTNET_WORKERS_ENGINEERING.md process-transport section
    - This plan artifact.
- Reader admission is bounded before library buffering; only one frame at a
  time reaches its async decoder. Incoming envelopes and UTF-8 are strict,
  outbound payloads are bounded immutable snapshots, and queues have count/bytes.
- Private factory is responsible for declared-ID lookup, consent/fingerprint,
  package/runtime revalidation and abortable preparation. No concurrent PR3
  descriptor shape is assumed; PR6 supplies that adapter.
- Platform initialization is intentionally required of production workers.
  PR0 fixture readiness was not changed. Only initialize is host-correlated;
  cancellation and domain envelopes are forwarded without query replay.
- Stderr is completely redacted with capped counts; no telemetry or console use.
- Tree termination uses host-captured PID only, POSIX detached groups or fixed
  Windows taskkill. Failed/unconfirmed kill quarantines the slot until exit.
- Focused get_errors checks ran after every substantive TypeScript edit. Source
  diagnostics were clear. The test view exposed TS2353 on an inline shutdown
  notification; replaced it with an explicitly typed WorkerRpcMessage. The next
  diagnostic retained the obsolete expression, so it is not recorded as a
  test pass or authoritative post-fix compilation result.
- Added fake-timer microtask, abrupt pipe-close and default launch/tree-kill
  regressions during local review. No real child or native SDK was launched.
- The external test view refreshed with Missing initialize request failures.
  A narrow installed-library read showed both reader and writer semaphores use
  setImmediate, which the fake timers had paused. Updated the fake harness to
  leave setImmediate/clearImmediate real and flush event-loop turns without
  advancing deadline timers. Immediate get_errors still showed the preceding
  failure set; a new focused main-agent Jest run is required. No passing test
  count is inferred from editor diagnostics or external test activity.
- Commands executed by this agent: none. Pending main-agent gates are the
  focused Jest command, Prettier formatting/check, typecheck, lint, production
  build, full unit regression suite as appropriate, and git diff --check.
- PR4 is implemented but executable acceptance and production dependency move
  remain pending. PR3/PR5 files, shared tracker, dependencies, main/index.ts,
  existing shared types, PR2 and PR0 were not edited.

### Two Reviewer Findings Follow-Up (2026-10-05)

- Scope restricted to workerStdio.ts, workerProcessManager.ts, the existing
  workerProcessManager.test.ts suite and this execution log. No shared tracker,
  package, unrelated files, memory, branch or commit changes.
- Array preflight now checks a minimum byte cost against the remaining budget
  before index traversal or Object.keys allocation. Each dense index and array
  structural bytes consume the shared budget; missing own indices and enumerable
  non-index properties are rejected before JSON.stringify.
- Added serialization-spy regressions for new Array(100000000) as params and
  inside objects/arrays, with an Object.keys spy guarding the huge array too.
  Added holes masked by non-index keys, dense arrays with extra properties,
  cumulative nested dense-array budget and valid frozen nested-array coverage.
- Deferred force callback rechecks exitSeen and cleaned immediately before
  killTree. Fake-child regression synchronously advances the stop timer, emits
  exit before the deferred callback executes, and checks no kill, settled stop
  and an exited snapshot without a forced-stop failure.
- Focused get_errors ran immediately after the code/test patch for all three
  touched TypeScript files: no diagnostics reported. No executable runner is
  exposed in this session; no commands, Jest, formatting, lint, typecheck or
  build gates were run. The user's earlier 192 passing tests do not validate
  these new regressions. Required next gate:
  `pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/workerProcessManager.test.ts`.
