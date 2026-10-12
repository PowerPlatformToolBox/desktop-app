# PR1: Worker Declaration Metadata

Checkpoint: GO, explicitly authorized in chat on 2026-10-05 by the user's
"Implement PR1 fully" / "start PR1" request with scope and acceptance criteria.
Implementation status: Original baseline completed; approved contract revision
implemented, with new executable acceptance gates pending the main-agent test runner.

## Approved Scope

- Strict top-level worker declarations and canonical default Major policy.
- Public config types and desktop metadata, without any execution API.
- Registry/npm/local loading, minAPI compatibility and persisted declarations.
- Focused Jest coverage and schema/security-limit documentation.
- Preserve PR0, existing changes and terminal blocks; no commit or branch.

## Approved Contract Revision (2026-10-05)

Explicitly approved by the user's implementation request in chat. Revise ONLY
platform declarations and author-facing transport; keyed worker IDs, dotnet-tool,
package/version/command, TFM/minimum runtime and optional default Major policy
remain unchanged.

- `platforms` remains a required, non-empty, unique array. Allowed values: `all`,
  `windows-x64`, `windows-arm64`, `macos-x64`, `macos-arm64`, `linux-x64`,
  `linux-arm64`. Reject old win/osx RIDs, unknown values, empty arrays and duplicates.
- `all` must appear alone and normalize as `["all"]`, not expand. It denotes
  the versioned officially supported PPTB platform matrix; future expansion must
  be qualified before enabling existing packages. No platform resolver or matrix
  runtime implementation is in scope; PR2 is not started.
- Remove `transport` from author/normalized types, allowed fields, canonical
  metadata and positive examples/fixtures. Explicit transport fails strict
  unknown-key validation. `jsonrpc-stdio-v1` remains PPTB-defined internally for
  the future startup handshake; do not change PR0 wire protocol/fixture code.
- Add focused alias/all/legacy/duplicate/transport and canonical metadata/restart
  regression coverage using existing infrastructure. Preserve dated baseline
  evidence; new evidence stays pending until executed. No SDK, APIs, execution,
  commits, branches or memory writes.

## Acceptance Gates

Focused validator/loading/persistence/terminal Jest checks, validator package
build, desktop typecheck, lint, build and existing unit regression suite.
No SDK/probe rerun is required for this metadata-only slice.

## Execution Log

2026-10-05, macOS workspace:

- Read the current user-edited tracker and session specification before editing.
- Added strict validation and canonical declarations to the shared validator.
  NuGet versions accept 1-4 numeric segments, not npm-only semver. Unknown worker
  options, invalid policies, paths, whitespace, ranges and unsupported TFMs/RIDs
  fail closed. Explicit and omitted Major normalize identically.
- Exported author/normalized types; added workers to common ToolMetadata, inherited
  by runtime tools, registry entries and installed manifests.
- Added a shared desktop worker reader using the authoritative validator and
  packaged minAPI. Wired actual registry installation plus npm/local readers;
  errors occur outside their legacy invocation catch-and-ignore blocks.
- Registry minAPI must agree with worker package minAPI; missing registry minAPI
  falls back to package metadata. Npm/local tools use VersionManager compatibility.
- Added worker-bearing npm/local manifest persistence and source-aware restart
  loading. Persist before publishing success; revalidate persisted metadata and
  isolate malformed entries. Worker-free development tools do not gain persistence.
- Widened desktop tsconfig rootDir to the workspace to import authoritative
  validator source without duplication or a stale generated dependency. Vite
  retains existing output paths; CLI retains its explicit src/cli rootDir.
- Added focused declaration and all-source loading/restart/minAPI tests.
  Regression cases also cover removed declarations, malformed JSON, absent registry
  minAPI and deterministic ordering without modifying input. No PR0 fixture,
  terminal block, IPC, preload API or native process implementation changed.
- Added declaration details to docs/DOTNET_WORKERS.md and validation details to
  docs/DOTNET_WORKERS_ENGINEERING.md; updated the current delivery tracker.
- Files changed: packages/validation/src/{validate,index,cli}.ts,
  packages/types/pptbConfig.d.ts, src/common/types/tool.ts,
  src/main/utilities/workerMetadata.ts,
  src/main/managers/{toolsManager,toolRegistryManager}.ts, tsconfig.json,
  tests/unit/validation/workers.test.ts,
  tests/unit/main/managers/workerMetadata.test.ts,
  docs/{DOTNET_WORKERS_STATUS,DOTNET_WORKER_DECLARATIONS}.md and this log.

## Validation Evidence

### Focused Reviewer Repairs (2026-10-05)

- Read current plan, worker reader, install/uninstall/reload implementations and
  neighboring tests before applying focused repairs. No commit, branch, memory
  write, PR0 change or unrelated documentation edit.
- Registry install now downloads/extracts to a unique temporary sibling directory,
  validates metadata there, then renames the existing directory to a backup and
  promotes the staged directory. Promotion or manifest-write failure restores the
  old directory and manifest bytes. Failed downloads/validation remove staged
  files and archives; successful replacement removes obsolete installed files.
- Development uninstall uses persisted source ownership or localPath, not package
  identity. Npm/local uninstall removes persisted manifests; local uninstall keeps
  both its source files and any separately installed npm package intact.
- Failed npm/local worker-source revalidation removes matching cached/persisted
  metadata without deleting source files, including malformed config/package JSON.
- Worker-bearing config validation now passes the complete config and package.json
  to validatePPTBConfig. The workers-only persisted metadata helper is unchanged.
  No execution API, preload/IPC capability or worker process was enabled.
- Files changed in this repair pass: src/main/utilities/workerMetadata.ts,
  src/main/managers/{toolsManager,toolRegistryManager}.ts,
  tests/unit/main/managers/{workerMetadata,toolRegistryManager}.test.ts and this log.
- Added 25 table-expanded regression cases in workerMetadata.test.ts covering
  agents/version parity across all sources; same-manager/restart rejection for
  invalid workers/minAPI/config JSON/package JSON; loaded/restarted source-owned
  uninstall; worker-free local uninstall; rejected registry downloads/validation;
  injected rename/manifest-write rollback and successful binary replacement.
  Registry fixtures copy actual files into the requested staging directory.
- Ran focused VS Code get_errors diagnostics after each substantive edit.
  Production-file diagnostics were clean. Refreshed Jest diagnostics cleared the
  neighboring registry fixture error and exposed TS2352 in the deliberately invalid
  agents fixture; repaired its cast through unknown. Subsequent Jest diagnostics
  exposed non-configurable fs namespace getters in the two fault-injection spies;
  switched those spies to jest.requireActual("fs"). The final focused get_errors
  check returned no errors in both regression files. This is diagnostic evidence,
  not a separately invoked Jest command or proof that all acceptance gates passed.
- No runTests, terminal execution or run_task tool is exposed in this session.
  No pnpm/Prettier/Jest/build command was run for these repairs. The user reports
  the earlier baseline passed 103 focused tests, desktop typecheck and validator
  build; those results do not validate the new repairs. Status remains In progress.
- Pending: project Prettier on the touched repair files, then the focused Jest
  command below, validator build, desktop typecheck/lint/build and full unit suite.

- Attempted focused pnpm Jest execution through the available JavaScript runner.
  Both Node module-loading approaches were rejected by its environment before
  commands executed. No terminal/runTests/run_task execution tool is exposed.
- Retrieved configured typecheck/lint/build task output: each returned
  "Terminal not found". No task success is claimed.
- VS Code diagnostics surfaced a Jest table typing error and missing Tool import;
  repaired both. Latest focused get_errors check reported no errors for validator,
  managers and both new test files. This is not proof that Jest/build/lint passed.
- No SDK, NuGet network, worker process, package publication, commit or branch.
- Final focused diagnostics reported no errors in the changed TypeScript files.
  Active terminal command detection was unavailable, so no external command result
  could be recovered to satisfy the executable gates.
- Prettier execution, focused/full Jest, validator package build and desktop
  typecheck/lint/build remain unexecuted. PR1 must not be marked Completed yet.

## Acceptance Commands

```sh
pnpm run test:unit --runInBand --runTestsByPath tests/unit/validation/workers.test.ts tests/unit/validation/validatePPTBConfig.test.ts tests/unit/main/managers/workerMetadata.test.ts tests/unit/main/managers/toolsManager.test.ts tests/unit/main/managers/toolRegistryManager.test.ts tests/unit/main/managers/terminalManager.test.ts
pnpm --dir packages/validation run build
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:unit --runInBand
```

## Final Verification (2026-10-05)

Historical verification of the original PR1 baseline, before the contract revision:

The earlier tool limitations above applied to the implementation subagents, not
the main session. The main agent executed the acceptance gates after the repairs:

- Focused Jest via runTests: 150 passed, 0 failed, including worker declarations,
  worker metadata/lifecycle, neighboring tool managers and terminal restrictions.
- Full existing unit suite via runTests after formatting: 531 passed, 0 failed.
  The opt-in PR0 process probe remains skipped by ordinary unit discovery.
- pnpm --dir packages/validation run build passed after final formatting.
- pnpm run typecheck passed; pnpm run build passed, including a second typecheck,
  Vite main/renderer/preload builds and CLI compilation.
- pnpm run lint passed with the existing TypeScript/parser support warning.
- Project Prettier applied to touched TypeScript files; focused editor diagnostics
  and git diff --check are clean. Existing Vite chunk/import warnings remain.
- Follow-up read-only code review found the four reported lifecycle/validation
  defects repaired and no remaining blockers within this metadata-only slice.
- Delivery tracker updated to Completed. No process API, SDK/NuGet acquisition,
  publication, commit, branch creation or PR2 implementation performed.

## Contract Revision Execution Log (2026-10-05)

- Read current validator, public config types, package public exports/CLI,
  shared ToolMetadata and worker reader, both regression files, declarations
  documentation, tracker and this plan before editing. Preserved user changes.
- Targeted searches across tests/docs/plans found old author fixtures in the two
  PR1 regression files and current documentation examples. Native PR0 RID files,
  probe implementation and unrelated transport references were left unchanged.
- Validator now accepts only the approved PPTB aliases, rejects combined `all`,
  keeps deterministic sorting and literal `["all"]`, and rejects transport by
  removing it from the strict allowed-key list. Canonical objects omit transport.
- Both author and normalized type surfaces reflect the revision. Public/CLI
  exports and desktop metadata readers inherit the authoritative declarations;
  no separate platform resolver, migration or internal protocol field was added.
- Files changed: packages/validation/src/validate.ts,
  packages/types/pptbConfig.d.ts, tests/unit/validation/workers.test.ts,
  tests/unit/main/managers/workerMetadata.test.ts,
  docs/DOTNET_WORKERS.md, docs/DOTNET_WORKERS_ENGINEERING.md,
  docs/DOTNET_WORKERS_STATUS.md and this plan.
- Declaration tests cover each alias, all alone, all plus each concrete alias in
  either order, old/unknown RIDs, each duplicate alias, required/empty platforms,
  strict forbidden transport and canonical ordering/no transport.
- Metadata tests roundtrip explicit/all declarations through registry/npm/local
  installation, persistence and restart; forbid declared transport in each source
  and reject persisted transport/legacy platforms. Invalid old metadata is rejected,
  not silently migrated. No test infrastructure was introduced.
- Immediately after the first edit, focused get_errors diagnostics reported no
  errors in validator, public types and declaration tests. After metadata edits,
  diagnostics reported no errors in metadata tests, worker reader and ToolMetadata.
- Commands run for this revision: none. No terminal execution, run_task or
  test-runner tool is exposed. Diagnostics are not executable acceptance evidence.
- Pending main-agent validation: project Prettier on the four touched TypeScript
  files, the existing focused acceptance command above, validator package build,
  desktop typecheck/lint/build, full unit suite and diff whitespace check.
- Matrix version identifier/qualification policy remains a later delivery gate;
  this metadata-only revision does not invent one or claim platform qualification.

## Contract Revision Verification (2026-10-05)

The preceding tool limitations applied only to the implementation subagent.
The main agent executed the revised acceptance gates:

- Focused declaration/metadata runTests: 143 passed, 0 failed.
- Project Prettier applied to the four touched TypeScript files.
- Full unit suite after formatting: 569 passed, 0 failed.
- pnpm --dir packages/validation run build passed.
- pnpm run lint and pnpm run build passed, including desktop typecheck and CLI
  compilation. Existing TypeScript/parser and Vite warnings remain.
- Tracker returned to Completed with original evidence retained separately.
- No PR0 changes, worker execution or PR2 implementation.
