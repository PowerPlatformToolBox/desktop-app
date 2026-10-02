# N-Connection Support Plan

This plan tracks the delivery of N-connection support for tools, including the Solution Transfer use case from issue #554. Each phase is intended to be a separate, independently reviewable PR. Mark a phase complete when its code, tests, and verification are complete; merge/deployment status is tracked separately.

## Manifest Contract

New tools use one feature field:

```json
{
    "features": {
        "connections": { "min": 1, "max": 5 }
    }
}
```

`connections` accepts an integer from 0 to 10 (an exact count), or `{ "min"?: number, "max"?: number }`. In object form, `min` defaults to 1 and `max` defaults to `min`. Thus `{ "max": 5 }` means 1 to 5, `{ "min": 2 }` means exactly 2, and `0` means the tool never needs a connection. `{ "min": 0, "max": 1 }` means an optional single connection.

`multiConnection` and `connectionRequirement` remain accepted for old tools and are resolved by one compatibility helper. They cannot be combined with `connections`. The validator warns when legacy fields are used; runtime use remains silent. Existing manifests require no changes.

| Legacy declaration                                                 | Resolved range |
| ------------------------------------------------------------------ | -------------: |
| No feature declaration                                             |            1–1 |
| `multiConnection: "none"`                                          |            1–1 |
| `multiConnection: "none"`, `connectionRequirement: "optional"`     |            0–1 |
| `multiConnection: "optional"`                                      |            1–2 |
| `multiConnection: "optional"`, `connectionRequirement: "optional"` |            0–2 |
| `multiConnection: "required"`                                      |            2–2 |

Runtime targets preserve the old names: `"primary"` and `"secondary"`; numeric targets address slots from zero (0 = primary, 1 = secondary, 2+ = additional slots). Maximum count is 10 and is capped by the tool declaration. Cleared/deleted slots stay null and indices are not compacted.

## PR Phases

### [x] PR 1 — Manifest contract, resolver, validator

**Status:** Implemented in the working tree; not yet merged.

- Add `ToolFeatures.connections` and the shared legacy-aware slot resolver.
- Add/export `ToolPackageFeatures` from `@pptb/types` for the tool `package.json` features contract;
  keep legacy connection properties typed as deprecated.
- Add/export a `@pptb/types` package-manifest feature declaration type for `features.connections`;
  keep `multiConnection` and `connectionRequirement` as deprecated compatibility properties.
- Validate integer/object forms, range `0 <= min <= max <= 10`, unknown object keys, and exclusivity with legacy fields.
- Keep the mirrored TypeScript and JavaScript validators in sync; warn for legacy-only declarations.
- Document the author-facing field and show a connection summary in marketplace Tool Details.

**Unit tests:** `tests/unit/common/connectionSlots.test.ts`; `tests/unit/validation/validatePackageJsonConnections.test.ts`; `tests/unit/types/toolManifestTypes.test.ts` verifies the declaration is exported by the package entry point.

**Types package:** add a focused package-manifest type declaration (for example `ToolPackageFeatures`
in `packages/types/toolManifest.d.ts`, exported from `packages/types/index.d.ts`). This describes the
`package.json` `features` object; it is separate from `pptb.config.json`'s invocation schema.

**E2E tests:** `tests/e2e/toolMaturity.spec.ts` asserts modern ranges, legacy resolution, zero connections, and the undeclared 1-connection default.

**Checks:** focused Jest 43/43 passed; modified Playwright spec 7/7 passed; typecheck, build, validation package build, lint, and `git diff --check` passed. Full unit run had 331 tests pass and one unrelated compile failure in `tests/unit/renderer/closeAllTools.test.ts` (`window.toolboxAPI` is missing from that test's `Window` type).

### [x] PR 2 — Slot storage and selection modal

**Status:** Complete. The user manually verified restart persistence and authenticated connection assignment. Automated coverage for those flows remains a follow-up, not a blocker for proceeding to PR 3.

- Add `toolConnectionSlots[toolId]` as the canonical stored array; lazily migrate old primary/secondary keys.
- Keep legacy getters/setters and keys for slots 0/1 so downgrade remains safe.
- Replace the two-column picker with a slot rail and existing connection list; support add, clear, required-slot confirmation, double-click assignment, and the existing connection filters.
- Route launch selection using the resolver: max 0 launches without a picker, max 1 uses the single picker, otherwise use the slot rail.

**Unit tests:** `tests/unit/main/managers/settingsManager.test.ts` covers migration, legacy dual-writes, arrays, and recent-use compatibility; `tests/unit/renderer/connectionModalDoubleClick.test.ts` covers slot markup/controller options and double-click wiring. Focused automated tests for `toolManagement.launchTool` remain outstanding.

**E2E tests:** `tests/e2e/multiConnectionModal.spec.ts` covers rendering seeded saved connections in the rail, required slots, optional add/clear at max, legacy single-picker behavior, and zero-connection launch. Authenticated connection assignment and persisted selection after restart were manually verified by the user but do not yet have automated E2E coverage.

**Current checks:** focused PR 2 unit tests pass (54/54); typecheck, lint, and build pass; slot-rail Playwright E2E passes (4/4), including the populated-list regression. Max greater than two is explicitly deferred with a notification until PR 4 provides array-based runtime routing.

### [ ] PR 3 — Status-bar squares and connection management

- Keep the primary status display in place. Render each filled non-primary slot as a numbered, clickable, environment-coloured square on the right.
- Clicking a square opens a picker scoped to that slot; add Change/Clear/Impersonate actions, token-expiry and impersonation markers, keyboard navigation, and accessible names.
- Update tab subtext/tooltip, impersonation state, and the tab menu to use “Manage Connections…”. Hide connection UI for max 0.

**Unit tests:** add `tests/unit/renderer/statusBarSquares.test.ts`; extend tool tab/impersonation tests.

**E2E tests:** add `tests/e2e/statusBarConnections.spec.ts` for changing and clearing slots, markers, keyboard operation, and the zero-connection UI. Screen-reader speech is a manual VoiceOver check.

### [ ] PR 4 — Runtime support for more than two slots

- Generalize per-instance connection and impersonation state to arrays.
- Add slot-array IPC and preload APIs while retaining all old primary/secondary APIs.
- Route Dataverse operations by string or numeric target; report missing/out-of-range slots clearly.
- Extend `packages/types/toolboxAPI.d.ts`, `dataverseAPI.d.ts`, and `powerplatformAPI.d.ts` with array
  APIs and numeric `ConnectionTarget`, preserving old fields and string aliases for backward compatibility.
- Read the new `connections` field from `tool_release_features`; deploy the database column before releasing this PR. Validate registry values defensively and fall back to legacy values when malformed.
- Add a Sentry breadcrumb with the resolved min/max and filled count only; never include connection identifiers.

**Unit tests:** extend tool window, Dataverse, registry mapping, invocation prompt, and telemetry tests.

**E2E tests:** add `tests/e2e/nConnectionSupport.spec.ts` using a deterministic fixture tool and local/mock data. Cover the hard cap, slot target routing, legacy `"secondary"`, invalid indices, no-connection API rejection, and inter-tool invocation.

### [ ] PR 5 — Deletion, downgrade, restore, and auth edge cases

- On connection deletion, null references across all tools without shifting indices; reconcile missing references at startup.
- On tool update, truncate assignments beyond the new max and warn; leave missing required slots empty so launch prompts.
- Generalize session restore and duplicate-tab behavior to the full slot array.
- Bound silent-auth concurrency during restore.

**Unit tests:** extend connection/settings/tools manager tests and add restore/concurrency coverage.

**E2E tests:** add `tests/e2e/connectionEdgeCases.spec.ts` for visible slot gaps, downgrade, restart, and duplicate-tab behavior.

### [ ] PR 6 — MCP multi-connection invocation

- Add `connectionNames?: string[]`, mapped positionally to slots. Keep singular `connectionName` as the slot-0 compatibility alias.
- Return explicit errors for unknown names, too few required connections, and names supplied to a zero-connection tool. Headless invocation does not prompt.

**Unit/integration tests:** extend MCP server and headless invocation manager tests. Use protocol integration/manual verification unless the existing Playwright harness can start an MCP client.

### [ ] PR 7 — Tool-author and release documentation

- Update the tool type README, inter-tool invocation docs, logging guidance, and changelog/release notes.
- Add a focused author guide with examples for exact counts, optional connections, and ranges.

**Tests:** no new runtime tests; validate documentation examples with the PR 1 validator fixtures and run the full regression suites.

## Verification Gate for Every PR

- Focused Jest tests for the changed slice, then `pnpm run test:unit`.
- Focused Playwright specs for changed UI, then `pnpm run test:e2e`. Keep E2E deterministic; no live Supabase or real credentials.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`; rebuild `packages/validation` when its source changes.
- Existing tools using only legacy fields continue to behave without manifest edits.
- Ship to Insider before promoting to stable.
