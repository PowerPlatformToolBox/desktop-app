## Main-Agent Acceptance (2026-10-05)

Status: Completed. Earlier execution limitations below applied to the subagent,
not the main session. The main agent verified the final repairs:

- 91 focused preparation tests passed, including runtime-config review and cleanup
  regressions. Runtime overrides/development configs fail on cold and warm paths.
- Lint's constant-condition/unsafe-finally findings were repaired and lint passed.
- Fresh serial no-cache full Jest: 971 passed, five opt-in PR0 tests skipped.
- Typecheck, lint and production build passed; existing parser/Vite warnings remain.
- Formatting, diagnostics and git diff --check passed. Security follow-up found
  the runtime-policy repairs sound; no remaining PR3 blocker was reported.
- No real NuGet10 restore was executed: SDK10 is absent. Native restore/offline
  compatibility remains PR8; tests use injected commands and real temp files.
- No production preparation caller, worker execution, SDK download, commit or branch.

# PR3: Pinned DotNet Tool Preparation

Checkpoint: GO (explicit checkpoint selection, 2026-10-05).
Status: Implementation written; executable validation and native qualification pending.

## Scope

Internal preparation only, after injected approval. Accept canonical PR1 worker
declaration, sender-resolved tool identity and PR2 discovery selection. Revalidate
discovery, pin SDK in an app-owned workspace, restore exact normalized NuGet
identity from nuget.org, verify command/package/runtime artifacts, isolate CLI
home and packages, and publish atomically with a completion marker last.
Deduplicate concurrent calls and fail closed on filesystem locks, symlinks,
partial state and modified caches. Warm reuse performs no NuGet command.

Own only new DotNet preparation manager/types/utility, focused tests, preparation
documentation and this plan. No shared status, discovery/types, startup, package
or lockfile edits. No API, worker launch, consent UI, sandbox or signing claims.

## Acceptance

Real temporary directories with fake CLI restore exercising approval denial,
SDK mismatch, exact versions, command/runtime verification, restore rollback,
concurrency, cache/config/artifact tampering, symlinks and offline reuse.
Immediately check focused diagnostics after edits. Run focused Jest, Prettier,
typecheck, lint and build when command execution is available. Native .NET 10
qualification and main-agent gates remain pending unless actually executed.

## Execution Log

- Read current PR1 declaration documentation/plan, PR2 types, manager and utility,
  neighboring discovery tests, Jest configuration and package scripts.
- User selected Go for the bounded PR3 implementation. No memory, branch or commit.
- Local hypothesis: a pinned root local manifest plus isolated package/CLI caches
  supports preparation without invoking package commands. Discriminating check:
  fake restore must populate legitimate CLI package and resolver layout; validation
  must reject changed command, version, runtime policy and cache contents.
- Commands executed: none yet. Implementation and verification in progress.

## Implementation Results

- Added src/main/managers/dotnetToolManager.ts: internal approval-first preparation,
  canonical declaration/identity validation, fresh PR2 rediscovery comparison,
  exact pinned SDK check, bounded shell-free NuGet local-tool restore, isolated
  environment/configuration, resolver/package/runtime/deps verification, atomic
  staging publication and last completion marker, rollback and offline cache reuse.
- Added src/common/types/dotnetTool.ts: internal resolved identity, request,
  prepared descriptor and sanitized preparation error codes. No public exports.
- Added src/main/utilities/dotnetToolPreparation.ts: NuGet normalization, stable
  authority encoding/hashes, bounded package XML inspection, relative-path checks
  and binary runtime policy verification. No indirect XML dependency is imported
  and no dependency/package/lock changes are required.
- Added tests/unit/main/managers/dotnetToolManager.test.ts: real temporary folders
  with a fake restore populating isolated NuGet package artifacts, metadata/digests
  and local-tool resolver registry. Covers independent approval, denial before all
  filesystem/probe/cache/network work, exact normalized versions, SDK mismatch,
  changed selection, staging cleanup/retry, marker-write rollback, manifest and
  cache tampering, cold archive/source/settings/deps failures, traversal/symlinks,
  in-memory concurrency, separate managers and non-stealing filesystem locks,
  offline reuse and exact four-policy parity/no stricter binary override.
- Added docs/DOTNET_TOOL_PREPARATION.md: default behavior, internal contracts and
  PR4 descriptor handoff, controlled local package/cache layout, integrity bounds,
  conservative unsupported layouts and native qualification/command limitations.
- Local CLI layout decision: local-tool packages live under NUGET_PACKAGES, with
  DOTNET_CLI_HOME/.dotnet/toolResolverCache/1/<package-id>. Global .store/native
  shims are not substituted for local manifest artifacts. Verified resolver paths
  are relocated from staging to the final directory before publication.
- Archive SHA-512/digest/source checks are distinct from extracted-artifact
  verification. Whole-workspace SHA-256 inventory binds cache contents; this is
  not signing, safe-code proof, sandboxing or protection from same-user tampering.
- All changes stay within the six PR3-owned new files, including this plan.
  No shared status/docs, existing discovery/shared types, package/lock, startup,
  public API, worker process, memory, commit or branch modifications.

## Validation Evidence

- Immediately after each substantive patch, ran focused VS Code get_errors checks
  on the touched production/test slice. Final check reports no diagnostics in all
  four new TypeScript files.
- An editor/Jest diagnostic surfaced TS2322 in two injected discovery mocks;
  repaired the mock result discriminants with literal true. The immediate refresh
  initially retained stale pre-edit Jest text; subsequent focused checks cleared
  it. This is diagnostic evidence, not a claimed Jest pass count.
- Attempted the focused pnpm Jest command through the available Playwright JS
  runner using node:child_process. The runner returned
  ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING before importing or executing a command.
  No pnpm/Jest command was actually executed by this agent. No terminal execution,
  run_task or runTests tool is exposed. No native .NET/NuGet command was invoked.
- Formatting, focused executable tests, typecheck, lint, build and actual native
  .NET 10 restore/offline qualification remain pending with the main agent. No
  native platform/package qualification or production readiness is asserted.

## Pending Main Commands

### PR3 Lint Repair (2026-10-05)

- Changed only the manager and its existing unit test as the implementation slice;
  this entry records execution as required by App Developer mode. No shared code,
  memory, branch or commit changes.
- Replaced the constant digest loop with EOF-driven do/while iteration. Moved
  preparation into an inner operation closure and awaited cleanup in both promise
  outcomes, outside finally. Cleanup failure still takes precedence; completed
  workspaces remain intact, incomplete publication rolls back, and lock cleanup
  remains conditional on ownership with unchanged inode/token checks and order.
- Added six cases covering cold/warm cleanup waiting and rejection, cleanup-error
  precedence over SDK failure, and unchanged short-circuit staging rollback order.
- Ran get_errors immediately after the manager edit and after test additions:
  no diagnostics in either file. No executable commands run; main agent must rerun
  the same focused suite previously reported by the user as 258 passing, plus lint.

### PR3 Reviewer Repair (2026-10-05)

- Reviewed current runtimeconfig validation, cold publication and warm artifact
  verification, and existing manager tests before repair. Scope remains PR3 only.
- Updated src/main/utilities/dotnetToolPreparation.ts to reject all framework-level
  rollForward/applyPatches/rollForwardOnNoCandidateFx fields and explicit top-level
  rollForward combined with either deprecated property, including applyPatches=true.
  Omission remains native Minor, must match the declaration, and is not broadened
  to the declaration's Major default; explicit null is not treated as omission.
- Updated src/main/managers/dotnetToolManager.ts to reject adjacent development
  runtimeconfigs using lstat-based existence detection before cold publication
  and during warm artifact verification, even if cache inventory hashes match.
- Extended tests/unit/main/managers/dotnetToolManager.test.ts with cold/warm
  stricter, matching and broader nested policies, deprecated-property conflicts,
  explicit-null rejection, development runtimeconfigs and omitted-Minor parity.
  Warm fixtures update their inventory hashes and assert resolver verification
  was reached; cold failures assert complete staging rollback.
- Updated docs/DOTNET_TOOL_PREPARATION.md with conservative unsupported-layout
  limits and separate post-repair validation evidence.
- Validation: get_errors immediately after the first production repair and after
  regression additions reported no diagnostics. No terminal/run_task/test-runner
  tool is exposed, so no executable command was run. The user's reported initial
  main-agent 192 passes predate this repair; new regressions still require Jest.
- No PR2 SDK/discovery changes, shared tracker edits, other agent files, app-main
  wiring, commits, branches or memory changes.

```sh
pnpm exec prettier --write src/main/managers/dotnetToolManager.ts src/common/types/dotnetTool.ts src/main/utilities/dotnetToolPreparation.ts tests/unit/main/managers/dotnetToolManager.test.ts
pnpm run test:unit --runInBand --runTestsByPath tests/unit/main/managers/dotnetToolManager.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
```

Before adding a caller, qualify actual pinned .NET 10 local tool restore,
resolver/metadata layout, binary checks, rollback and offline reuse on native
supported platforms. PR4 may consume DotNetPreparedTool but must not treat it as
an execution permit or bypass fresh sender/source/consent/host integrity checks.
