# PR2 Installed .NET Discovery

Checkpoint: **GO**, explicitly selected by the user on 2026-10-05.

## Scope

- Internal discovery manager, shared result/error types and pure parsers/platform/runtime selectors.
- Stable installed 10.x SDK only; same validated native host for SDK and runtime.
- All four declared policies, native LatestMajor mapping, strict argument validation.
- Approved absolute OS-standard hosts only; bounded diagnostic execFile calls with sanitized environment.
- Injectable OS/filesystem/probe tests with no installed SDK or network prerequisite.
- Preserve PR1, user edits, PR0 fixtures and terminal blocking. No worker launch, download,
  NuGet, package preparation, consent, IPC, preload or public API. No branch or commit.
- Return exact SDK configuration for PR3's future controlled workspace; write no global.json.

## Gates

1. Focused Jest: `pnpm run test:unit --runInBand tests/unit/dotnetDiscovery.test.ts`.
   Then ordinary full unit suite: `pnpm run test:unit --runInBand` (no PR0 probe).
2. `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`.
3. Formatting with repository Prettier settings and `git diff --check`.
4. Main-agent review of diagnostics, deterministic host/architecture selection and pending evidence.

## Execution Log

- Read current tracker, declaration contract, validator, public/shared types, Jest config and scripts.
- No configured dotnet-host abstraction found in the targeted main-process search; no new renderer path input.
- Updated tracker to In progress before implementation.
- Terminal/task execution is not exposed to this agent. Main-agent command gates remain pending;
  this is not a claim about tools available to other agents or the user.
- Candidate policy: standard installation roots, fixed priority, realpath validation, native-only;
  no PATH search, no emulation promise, no merging inventories between hosts.
- Implemented files:
    - `src/common/types/dotnetWorker.ts`: internal data/error/pin types, no public API export.
    - `src/main/utilities/dotnetDiscovery.ts`: matrix v1, native architecture, strict listings,
      stable versions, SDK selection/config validation and four worker policies.
    - `src/main/managers/dotnetDiscoveryManager.ts`: `DotNetDiscoveryManager` with
      `DotNetDiscoveryAdapter`, injected discovery, filesystem checks,
      absolute execFile diagnostics, timeouts/forced termination, output/config bounds,
      isolated environment, deterministic candidate fallback and sanitized failures.
    - `tests/unit/dotnetDiscovery.test.ts`: SDK/network-independent adapter fixtures and
      suites `.NET runtime policy selection`, `.NET listings and host info`,
      `platform matrix v1`, `internal .NET discovery manager`.
    - `docs/DOTNET_WORKERS_ENGINEERING.md`: discovery decisions and PR3 artifact requirements.
    - `docs/DOTNET_WORKERS_STATUS.md`: In progress and pending evidence.
    - This plan: checkpoint, gates and execution record.
- Focused `get_errors` run immediately after every substantive edit. All four new
  TypeScript files currently report no errors. One IDE test diagnostic exposed the
  fixture's undefined/default RID behavior; explicit null fixed it and the same
  check was rerun clear. No full Jest execution is inferred from those diagnostics.
- Read official Microsoft CLI/global.json references: unqualified listings are
  architecture-scoped to the invoked host; SDK selection is distinct from runtime
  selection; exact SDK pin with disable/allowPrerelease false/paths $host$ is returned.
- Selected SDK compatibility additionally requires its installed runtime config
  and same-host 10.0 runtime. Highest stable 10.0 SDK >=10.0.100 is selected;
  broken selected SDK/config fails this host rather than silently downgrading.
- SDK info/global.json/base path does not control inventory selection. Cwd is the
  volume root; no global.json is created. PR3 must verify the actual SDK in its own
  trusted pinned workspace before package work, and revalidate the discovery snapshot.
- Native OS detection uses Node machine identity plus Apple CPU identity under Rosetta.
  Only portable Linux glibc RIDs and fixed standard roots are admitted. Custom roots,
  alternate Windows system drives, musl and actual platform qualification are deferred.
- Targeted source search found no console logging, worker spawn, IPC or global.json
  write in the new manager. No existing source managers or PR0 fixtures were edited.
- Commands executed: none through this agent. CLI tests, Prettier, typecheck, lint,
  build and git diff --check are pending main-agent execution, not failed or passed.

## Evidence

Completed following main-agent verification below. Earlier command limitations
applied to the implementation subagent only. No commit, branch, SDK acquisition,
package changes or worker execution were performed.

## Final Verification (2026-10-05)

- First focused run: 132 tests passed. Reviewer found a real --info behavior gap:
  ambient SDK startup can fail while useful native host stdout is returned.
- Retained bounded stdout only for numeric nonzero --info exits without kill or
  signal, leaving all output/architecture checks intact. Six regressions added;
  focused rerun passed 138 tests. Follow-up read-only review found no blockers.
- Applied repository Prettier settings to new TypeScript files.
- Lint initially rejected three control-character regexes. Replaced them with
  character-code checks; same lint task passed afterward.
- Full unit suite after final repairs/formatting: 707 passed, 0 failed.
- Desktop typecheck and production build passed, including Vite and CLI compilation.
  Existing TypeScript/parser and Vite chunk/import warnings remain.
- Real default-adapter discovery on macOS arm64 returned SDK_NOT_FOUND for the
  native host; this machine has SDK8/9 but not10. Alternate x64 host probe timed
  out within its bound. No download or installation attempted. Successful10 SDK
  selection is fixture-tested, not a claim of native10/platform qualification.
- git diff --check passed. Tracker marked PR2 Completed; PR3 not started.

## Naming Amendment (2026-10-05)

- Naming-only: internal PascalCase types/class now use `DotNet`; camelCase helpers
  use `DotNet`/`dotNet`. Updated declarations, imports and usages in
  `src/common/types/dotnetWorker.ts`, `src/main/utilities/dotnetDiscovery.ts`,
  `src/main/managers/dotnetDiscoveryManager.ts` and `tests/unit/dotnetDiscovery.test.ts`.
- Updated the current `DotNetDiscoveryManager` reference in
  `docs/DOTNET_WORKERS_ENGINEERING.md` and execution-log class/interface names here.
- Preserved existing user edits, behavior, filenames/module paths, JSON `dotnet`,
  command paths, `DOTNET` constants/environment, package/protocol names and upstream
  `DotnetToolSettings.xml`. Validator-local `dotnet` remains configuration-oriented.
- Evidence: immediate focused `get_errors` reported no errors in all four touched
  TypeScript files. Workspace symbol search found no remaining old in-scope code
  names. No terminal commands or tests were executed by this agent; command/task
  execution tools are not exposed. No memory writes, commits or branches.
- Main-agent verification after the rename: 138 focused discovery tests passed;
  pnpm run typecheck, pnpm run lint and git diff --check passed. The existing
  TypeScript/parser warning remains. No behavior changes or production build
  rerun were needed for this identifier-only amendment.
