# .NET Worker Delivery Tracker

This is the implementation tracker for issue #493. PR numbers below identify
planned delivery slices, not opened GitHub pull requests. PR0 and PR1, including
the approved platform and transport contract revision, and PR2 through PR6 are implemented and verified.
The consolidated author/developer guide is [DOTNET_WORKERS.md](DOTNET_WORKERS.md).
Internal contracts and qualification limits are collected in
[DOTNET_WORKERS_ENGINEERING.md](DOTNET_WORKERS_ENGINEERING.md).
PR7 has added the typed tool-preload API and internal broker path, but remains
in progress until the real .NET 10 local-package smoke and all acceptance gates
pass. Native consent administration remains main-window-only.

## Status

| Slice | Status                    | Dependencies       | Deliverable and completion gate                                                                                                                                                                                    |
| ----- | ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR0   | Completed (bounded probe) | None               | Real SQL 4 CDS DLL, reverse callback, concurrent requests, cancellation, progress, errors and EOF exit tested. See [PR0 evidence](DOTNET_WORKERS_ENGINEERING.md#compatibility-probe-pr0) for compatibility limits. |
| PR1   | Completed                 | PR0                | Platform aliases/all and implicit transport verified. Public manifest types, registry/npm/local loading and persisted metadata remain metadata-only, with strict validation and canonical Major default.           |
| PR2   | Completed                 | PR1                | Installed SDK/runtime discovery with deterministic .NET 10 SDK selection and declared runtime policy resolution; missing SDK, runtime-only, all four policies and incompatible architecture/config tests.          |
| PR3   | Completed                 | PR1, PR2           | Pinned NuGet preparation, controlled source/manifest, atomic cache and rollback; concurrency, version/command verification and offline tests.                                                                      |
| PR4   | Completed                 | PR0, PR1           | Internal process/transport manager; framing, backpressure, bounded queues, early messages, malformed input and shutdown tests. No public launch path.                                                              |
| PR5   | Completed                 | PR1                | Trusted native-execution consent and review/revoke UI; deny, fingerprint changes, duplicate prompts and self-approval rejection tests.                                                                             |
| PR6   | Completed                 | PR2, PR3, PR4, PR5 | Internal broker, sender-derived ownership, targeted events and full lifecycle; foreign-handle, denial, close/crash/revoke/update/uninstall/quit tests.                                                             |
| PR7   | In progress               | PR6                | Public preload API, browser-compatible RPC adapter and author example; Electron callback flow, disposal, SDK guidance, public-type tests, and developer-only local NuGet feed for unpublished worker iteration.    |
| PR8   | Not started               | PR7                | .NET 10 and declared platform qualification, packaged-app checks, migration docs and coordinated release of app/types/validator.                                                                                   |

## Runtime Declaration Decision (2026-10-05)

Each worker declares its executable target framework, minimum runtime version and
one of four PPTB roll-forward values. PR1 implements declaration metadata only,
not a worker execution API:

```json
{
    "workers": {
        "engine": {
            "kind": "dotnet-tool",
            "packageId": "Contoso.SqlWorker",
            "packageVersion": "1.4.2",
            "command": "contoso-sql-worker",
            "dotnet": {
                "targetFramework": "net8.0",
                "minimumRuntimeVersion": "8.0.0",
                "rollForward": "Major"
            },
            "platforms": ["windows-x64", "macos-arm64"]
        }
    }
}
```

The approved PR1 amendment accepts required, non-empty, unique platform arrays
containing `all`, `windows-x64`, `windows-arm64`, `macos-x64`, `macos-arm64`,
`linux-x64` or `linux-arm64`. `all` must appear alone and stays `["all"]` in
canonical metadata. It denotes the versioned officially supported PPTB platform
matrix; future expansion requires qualification before enabling existing packages.
Old `win-*`/`osx-*` RIDs and unknown values are rejected. Author declarations and
normalized metadata have no `transport` field; an explicit field is rejected as
an unknown key. PPTB still defines `jsonrpc-stdio-v1` internally for the future
startup handshake. PR1 added no resolver; internal PR2 discovery is described in
the declaration document and remains disconnected from production execution.

| PPTB value | Runtime selection                                                                                                                                                                                                             | Native .NET mapping |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `Disable`  | Exact requested version, including patch; fail if absent.                                                                                                                                                                     | `Disable`           |
| `Latest`   | Highest available compatible major, minor and patch at or above the requirement.                                                                                                                                              | `LatestMajor`       |
| `Minor`    | Prefer requested major/minor with its latest eligible patch; otherwise select the next available minor within that major and its latest patch. Never advance to a higher major.                                               | `Minor`             |
| `Major`    | Prefer requested major/minor with its latest eligible patch, even when newer majors exist. If absent, try the next minor in that major, then the next higher available major and its lowest eligible minor with latest patch. | `Major`             |

For requirement `8.0.0`, with runtimes `8.0.12` and `10.0.1` installed:
`Disable` fails, `Latest` selects `10.0.1`, and `Minor`/`Major` select `8.0.12`.
With only `10.0.1` installed, `Disable`/`Minor` fail and `Latest`/`Major` select
`10.0.1`. `Major` is a preference for the requested runtime line, not a promise
to use its exact minimum patch; exact patch selection belongs to `Disable`.

Only these four case-sensitive values are accepted. `rollForward` is optional
and defaults to `Major` when omitted. Explicit `null`, empty strings and unknown
values are invalid, not defaults. Normalize omission to `Major` before runtime
selection, package-policy validation and consent fingerprinting, so omission and
explicit `Major` have identical effective behavior. Show the effective policy
in consent and diagnostics. The default must not override a stricter binary
policy; package-policy mismatches still fail validation. `LatestPatch`,
`LatestMinor` and `LatestMajor` are not author-facing PPTB values. `Latest` must
be translated to `LatestMajor` before interacting with .NET, never forwarded
literally as a native runtime option. No policy selects a runtime below the
minimum or treats an installed SDK as proof that the needed runtime exists.

The target framework describes the worker executable, not the shared core DLL.
PR1 validates a supported console target framework and matching major/minor
runtime requirement; PR3 verifies these against the restored package's runtime
configuration. A declaration may not lower the binary's minimum requirement or
silently broaden its roll-forward policy. Authors must configure their worker
runtime settings consistently (using the native policy mapping) and test any
higher-major compatibility they permit. Resolve mismatches before execution.

PPTB owns SDK selection for package installation: initially a compatible .NET 10
SDK. Authors do not declare `sdkMajor`. This replaces the earlier proposal that
all workers must target `net10.0`; a supported `net8.0` worker can run on runtime
10 when its declared and packaged policy permits it. Runtime 8 installation is
not mandatory in that case. v1 supports `Microsoft.NETCore.App` console workers;
Desktop/ASP.NET shared frameworks and self-contained workers remain out of scope.

PR1 tests omission normalizes to `Major`, explicit `Major` is equivalent, and
invalid values are rejected. PR2 tests all policies with exact, patched, missing, same-major fallback and
higher-major inventories; include multiple higher majors to distinguish `Major`
from `Latest`, minimum-patch rejection and architecture mismatch. PR3 checks
package/config consistency, and PR8 qualifies actual runtime combinations.
Production launch policy is still unimplemented; PR0's net8.0 fixture is unchanged.

## Completion Rules

1. Change one slice to `In progress` when work begins. Parallel independent slices
   are permitted after their dependencies are completed.
2. Include focused tests and documentation in that slice, not a later hardening PR.
3. Record the executed command, result, environment and remaining limitations below.
4. Mark `Completed` only after its acceptance gate passes. A partial result stays
   `In progress` or `Blocked`, with the missing gate documented.
5. Review the completed slice before starting a dependent slice. Never expose
   renderer-callable native execution before PR6's consent and lifecycle gates.
6. Keep `dotnet` blocked in the existing terminal API throughout these changes.

## PR0 Evidence

- Date: 2026-10-04.
- Host: macOS arm64; SDK 9.0.203 builds the `net8.0` fixture using installed .NET 8.
- Candidate library: `MarkMpn.Sql4Cds.Engine` 10.5.1, not a replacement toy engine.
- Transport: `StreamJsonRpc` 2.25.29 and `vscode-jsonrpc` 8.2.1 with Content-Length
  framing. NuGet dependency closures are recorded in project lock files.
- Command: `pnpm run test:dotnet-probe`; five tests passed.
- Existing unit suite: 426 tests passed through VS Code's test runner; the opt-in
  probe does not add an SDK prerequisite to that suite.
- `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` passed. Lint reports
  the existing TypeScript/parser compatibility warning; Vite reports existing
  chunk/import warnings.
- Local `dotnet pack` succeeded. Package inspection confirmed `Core.dll`,
  `MarkMpn.Sql4Cds.Engine.dll`, `Worker.dll` and `DotnetToolSettings.xml` are present.
- Read-only code review found no blocking defects or production API exposure.
- Callback originates inside SQL 4 CDS's organization-locale lookup during
  connection construction. The host supplies simulated data, not live Dataverse.
- No credentials are passed to the worker. Worker startup uses a limited explicit
  environment; this is not an OS sandbox.
- General account/contact FetchXML, metadata and SDK message serialization remain
  unresolved. They require an author-owned service adapter before a real SQL tool.
- .NET 10, Windows and Linux have not been qualified. Do not infer support from
  this probe or advertise these targets as verified.
- Cancellation is checked while awaiting a callback; subsequent responsiveness
  is verified by ping. Active-query cancellation, another SQL query after
  cancellation and EOF during an outstanding query remain additional checks.
- The sample core targets .NET 8. This proves architectural separation, not binary
  compatibility with a .NET Framework-based XrmToolBox host.
- SDK acquisition, runtime discovery, user consent and production IPC are not part
  of PR0. The probe is explicitly developer-invoked, not shipped as an API.

## PR1 Evidence

### Original Baseline (2026-10-05)

The following dated results apply to the original contract, before the platform
and transport amendment. They are retained as historical evidence, not proof
that the revised contract passes validation.

- Date: 2026-10-05, macOS workspace. See the [declaration contract](DOTNET_WORKERS_ENGINEERING.md#declaration-and-discovery-pr1-pr2)
  and [execution log](../.github/plans/plan-dotnet-workers-pr1.md).
- Canonical worker declarations validate package/version/command, console TFM,
  minimum runtime, platform list and transport. Omitted rollForward becomes Major.
- Registry/npm/local loading and restart metadata are covered. Rejected development
  reloads invalidate stale metadata; uninstall respects source ownership. Registry
  updates stage and validate before replacing files, with rollback tests.
- Focused Jest checks: 150 tests passed through VS Code's test runner. Full unit
  suite after final formatting: 531 tests passed; the opt-in PR0 suite remains skipped.
- Validator package build, desktop typecheck, lint and production build passed.
  Existing TypeScript/parser and Vite chunk/import warnings remain.
- Touched TypeScript files formatted with repository Prettier settings; diagnostics
  and git diff --check are clean. Follow-up read-only review found no blockers.
- No native worker launch, SDK discovery, NuGet restore, consent or execution API
  is implemented. Accepting a TFM/RID in declarations is not platform qualification.
- No commit, branch creation, package publication or guessed API release version.

### Contract Amendment (2026-10-05)

- User approved the PR1-only platform aliases/`all` contract and removal of
  author-facing transport. Validator/public types and canonical metadata updated;
  registry/npm/local readers continue to use the authoritative validator.
- Regression coverage added for every alias, literal `all`, `all` combinations
  in either order, old/unknown RIDs, duplicates, forbidden explicit transport,
  canonical data and registry/npm/local manifest/restart roundtrips. Persisted
  transport and legacy platform metadata are rejected rather than migrated.
- Focused VS Code `get_errors` diagnostics found no errors in changed TypeScript
  files or the shared metadata boundary. This is diagnostic evidence only.
- Main-agent verification: 143 focused declaration/metadata tests passed; after
  formatting, the full unit suite passed 569 tests. Ordinary unit discovery still
  skips the opt-in PR0 process probe.
- Validator package build, lint and production build (including desktop typecheck
  and CLI compilation) passed. Existing parser/Vite warnings remain. The four
  touched TypeScript files were formatted with repository Prettier settings.
- PR0 wire protocol/fixture and runtime policy remain unchanged. No SDK acquisition,
  runtime/platform resolver, worker API/execution, publication, commit or branch.

## PR2 Evidence

- Date: 2026-10-05; explicit Go checkpoint selected. See the
  [execution log](../.github/plans/plan-dotnet-workers-pr2.md) and
  [discovery decisions/PR3 handoff](DOTNET_WORKERS_ENGINEERING.md#declaration-and-discovery-pr1-pr2).
- Added internal typed discovery results, pure platform/listing/version/policy
  helpers and an injectable main-process discovery manager. No startup wiring,
  worker process, API, IPC/preload, consent, NuGet, download or global.json writes.
- Tests in `tests/unit/dotnetDiscovery.test.ts` cover all four runtime policies,
  stable .NET 10 SDK selection, SDK CLI runtime config, platform/RID matrix,
  native architecture, host isolation, candidate fallback, bounded probes,
  malformed output/arguments and conflicting ambient SDK/global.json information.
  They have no real SDK/network prerequisite and do not touch the PR0 fixture.
- Focused `get_errors` checks report no errors in all four new TypeScript files.
  One IDE-reported test fixture failure (undefined activating a default RID) was
  repaired and the same focused diagnostics rerun clear. This is IDE diagnostic
  evidence only, not a claimed complete Jest run or command acceptance gate.
- Main-agent focused Jest: 138 tests passed. Full unit suite after formatting
  and repairs: 707 passed. Tests do not require an installed SDK or network.
- Desktop typecheck, lint and production build (including CLI compilation) passed.
  Initial lint control-character regex errors were fixed without weakening path
  validation. Existing TypeScript/parser and Vite warnings remain.
- Real macOS arm64 discovery returned SDK_NOT_FOUND for the approved native host,
  consistent with only SDKs 8/9 being installed. The alternate x64 host diagnostic
  timed out within the configured bound; it did not change the native-host error.
  No .NET 10 was acquired, so successful SDK 10 selection is fixture-tested only.
- Review identified that --info can exit nonzero when an ambient SDK cannot start.
  Bounded native stdout is now retained for ordinary numeric exit failures, then
  validated normally. Missing SDK CLI runtimes receive the structured error.
  Follow-up review found no blockers. Files formatted and git diff --check passed.
- Native platform and package
  qualification remain PR8; alternate host roots/system drives and musl are not
  promised. Diagnostic discovery does not establish worker execution permission.

## PR3 Evidence

- Date: 2026-10-05. [Execution log](../.github/plans/plan-dotnet-workers-pr3.md)
  and [preparation contract](DOTNET_WORKERS_ENGINEERING.md#package-preparation-pr3).
- 91 focused tests passed: approval-before-I/O, pinned SDK/config/source, exact
  package/command/runtime verification, concurrent preparation, filesystem locks,
  rollback, cleanup failures, integrity checks and warm offline reuse.
- Runtime-policy review fixes reject nested framework overrides, conflicting
  legacy properties and adjacent development runtimeconfigs, on cold and warm paths.
- Default restore is internal and approval-gated; no production caller is wired.
  Real .NET 10/NuGet restore was not executed because SDK 10 is absent. Tests use
  injected commands and real temporary filesystem artifacts. Native qualification
  and actual downloaded-package compatibility remain PR8 gates.

## PR4 Evidence

- Date: 2026-10-05. [Execution log](../.github/plans/plan-dotnet-workers-pr4.md)
  and [transport contract](DOTNET_WORKERS_ENGINEERING.md#process-transport-pr4).
- 111 focused fake-child tests passed: owner isolation, initialize handshake,
  UTF-8 framing/limits, backpressure, ordered delivery, early subscriptions,
  error/exit/EOF/timeout behavior and bounded process-tree cleanup.
- Review regressions cover sparse-array rejection before JSON serialization and
  observed-exit rechecking immediately before deferred tree termination.
- vscode-jsonrpc 8.2.1 moved to production dependencies. No app startup, IPC or
  public API constructs this manager. OS-native tree-kill behavior and packaged
  transport execution remain PR8 qualification; fixtures do not prove OS sandboxing.

## PR5 Evidence

- Date: 2026-10-05. [Execution log](../.github/plans/plan-dotnet-workers-pr5.md)
  and [consent contract](DOTNET_WORKERS_ENGINEERING.md#consent-and-broker-pr5-pr6).
- 62 focused tests passed for consent, live identity and filesystem boundary:
  main-only authority, canonical fingerprints, persistence, denial, deduplication,
  revocation races, timeout/disposal and immutable launch identity.
- Security fixes bind consent to the loaded tool version/source and register
  ownership before page execution. All filesystem channels reject unknown senders;
  failed early loads clean up ownership/grants. Follow-up security review found
  no remaining blockers in these boundaries.
- Five Chromium/Playwright tests passed against the actual consent module and
  built styles: focus/Escape, allow-once/save failure, review/revoke, narrow mobile
  and desktop dark theme. Both screenshots inspected for framing and overflow.
  Consent API responses are mocked in this browser fixture; complete packaged
  Electron workflow and OS-platform checks remain later gates.

## Combined PR3-PR5 Verification

- Fresh serial no-cache Jest run: 52 suites passed; 971 tests passed, five opt-in
  PR0 tests skipped. The editor runner's cached renderer-global failure disappeared
  in the fresh process without modifying the unrelated test or its declarations.
- Desktop typecheck, lint and production build (renderer/main/preloads/CLI) passed.
  Existing parser/Vite warnings remain. Files formatted with repository settings;
  diagnostics and git diff --check passed. No .NET runtime or SDK was acquired;
  Chromium was installed solely to run browser UI validation.
- No Git commits/branches, worker/public launch API or PR6 implementation.

## PR6 Evidence

- Date: 2026-10-05. [Execution log](../.github/plans/plan-dotnet-workers-pr6.md)
  and [broker contract](DOTNET_WORKERS_ENGINEERING.md#consent-and-broker-pr5-pr6).
- Internal sender-derived broker connects allow-once/persistent consent leases,
  source snapshots, native discovery, pinned preparation and framed transport.
  Live authority is rechecked through asynchronous preparation and before spawn.
  Revocation cancels affected launches/workers; messages remain owner-scoped.
- Review regressions cover terminal reservation cleanup, preparation cleanup
  failure barriers, inherited-pipe stop verification, all replacement-install
  paths, restart/update ordering and preserved close-confirmation registrations.
  External view destruction settles invocation promises and cleans instance resources.
- Restore executor now waits for observed child close after cancellation. A
  callback or parent exit alone cannot release rollback/mutation barriers.
  Unverified stop retains stage/lock and broker authority for trusted resolution.
- Focused orchestration run passed 272 tests; actual app lifecycle/quit/broker
  follow-up passed 58 tests. Final preparation rerun passed 106 tests.
- Full serial unit command: 55 suites, 1,067 tests passed; five opt-in PR0 tests
  skipped. Five existing consent browser tests passed. Desktop typecheck, lint,
  production build and final diagnostics passed; existing parser/Vite warnings remain.
- Files formatted, git diff --check passed. Follow-up security review found no
  remaining blockers after cancellation, mutation and shutdown repairs.
- No actual SDK10/NuGet/worker launch was used for these tests. Packaged Electron
  close/navigation/updater behavior and native process-tree qualification remain
  PR8 gates. No public preload/start IPC API, Git commit/branch or PR7 changes.

## Next Checkpoint

PR6 acceptance gates passed. PR7 is in progress: the tool-scoped preload API,
browser RPC adapter, local UI/C# example and developer-feed isolation are
implemented. Full unit tests (1,087 passed, five optional PR0 tests skipped),
typecheck, lint, production build and sample UI build passed. The remaining PR7
acceptance blocker is packing/restoring/running the `net10.0` sample worker against the local
feed; this environment has only .NET 8/9 SDKs. See the [PR7 plan](../.github/plans/plan-dotnet-workers-pr7.md)
and [local-debug workflow](DOTNET_WORKERS.md#local-debug-with-an-unpublished-package).
Do not mark PR7 completed
or claim C# interoperability until the real local-package smoke passes.
Do not claim a complete Dataverse proxy or cross-platform compatibility from these
metadata changes. Retain the organization-locale
fixture as the cheap full-duplex regression test. Carry the remaining real-query
adapter and platform checks into the author example and PR8 qualification gates.
