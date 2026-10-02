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

`connections` accepts an integer from 0 to 10 (an exact count), or `{ "min"?: number, "max"?: number }`. In object form, `min` defaults to 1 and `max` defaults to the resolved `min`. Therefore `{ "max": 5 }` means 1–5, `{ "min": 2 }` means exactly 2, `{ "min": 0 }` means 0, and `{ "min": 0, "max": 1 }` means 0–1. The tool must be coded to use the range it declares; the UI never allows more than `max` slots.

`multiConnection` and `connectionRequirement` remain accepted for old tools and are resolved by one compatibility helper. They cannot be combined with `connections`. The validator warns when legacy fields are used; runtime use remains silent. Existing manifests require no changes.

### Complete Declaration Matrix

The resolved range is `{ min, max }`: the first `min` slots must be assigned before launch; the user may assign additional slots up to `max`. Slot 0 is Primary; slot 1 is Secondary; later slots are numbered from 3. A blank feature declaration (or no `features` object) keeps the historic default of one required connection.

#### Modern declaration: `features.connections`

Modern `connections` is mutually exclusive with both legacy connection fields. `min` and `max` must be integers from 0 through 10, and resolved `min` cannot exceed `max`.

| Declaration                              | Resolved range | Meaning / capability                                                                   |
| ---------------------------------------- | -------------: | -------------------------------------------------------------------------------------- |
| No `features` declaration                |            1–1 | Existing default: one required connection.                                             |
| `"connections": 0`                       |            0–0 | New: connectionless tool. Launch without a connection picker; connection UI is hidden. |
| `"connections": 1`                       |            1–1 | Exactly one required connection.                                                       |
| `"connections": 2`                       |            2–2 | Exactly two required connections.                                                      |
| `"connections": 10`                      |          10–10 | New upper boundary: ten required connections.                                          |
| `"connections": {}`                      |            1–1 | Object defaults preserve the ordinary one-required-connection case.                    |
| `"connections": { "min": 1 }`            |            1–1 | One required; no extra slots.                                                          |
| `"connections": { "max": 5 }`            |            1–5 | New: one required plus up to four optional additional slots.                           |
| `"connections": { "min": 2 }`            |            2–2 | Exactly two required.                                                                  |
| `"connections": { "min": 0 }`            |            0–0 | New: connectionless tool, equivalent in behavior to numeric zero.                      |
| `"connections": { "min": 0, "max": 1 }`  |            0–1 | New: optional single connection; launch without one, attach one later.                 |
| `"connections": { "min": 0, "max": 5 }`  |            0–5 | New: launch connectionless, optionally use up to five connections.                     |
| `"connections": { "min": 1, "max": 5 }`  |            1–5 | New: one required plus up to four optional connections.                                |
| `"connections": { "min": 3, "max": 5 }`  |            3–5 | New: three required plus up to two optional connections.                               |
| `"connections": { "min": 0, "max": 10 }` |           0–10 | Full flexibility: connectionless launch through ten assigned connections.              |

#### Legacy declaration: `multiConnection` + `connectionRequirement`

Omitted legacy fields use `multiConnection: "none"` and `connectionRequirement: "required"` as defaults. All accepted combinations resolve as follows:

| `multiConnection` | `connectionRequirement` | Resolved range | Legacy behavior                                                       |
| ----------------- | ----------------------- | -------------: | --------------------------------------------------------------------- |
| omitted           | omitted                 |            1–1 | Default single required connection.                                   |
| omitted           | `"required"`            |            1–1 | Single required connection.                                           |
| omitted           | `"optional"`            |            0–1 | Connection optional; can launch without one and attach one later.     |
| `"none"`          | omitted                 |            1–1 | Single required connection.                                           |
| `"none"`          | `"required"`            |            1–1 | Single required connection.                                           |
| `"none"`          | `"optional"`            |            0–1 | Connection optional; can launch without one.                          |
| `"optional"`      | omitted                 |            1–2 | Primary required; secondary optional.                                 |
| `"optional"`      | `"required"`            |            1–2 | Primary required; secondary optional.                                 |
| `"optional"`      | `"optional"`            |            0–2 | Both primary and secondary optional; launches with neither.           |
| `"required"`      | omitted                 |            2–2 | Primary and secondary both required.                                  |
| `"required"`      | `"required"`            |            2–2 | Primary and secondary both required.                                  |
| `"required"`      | `"optional"`            |            0–2 | Legacy resolver permits launch with neither; both slots are optional. |

#### Invalid combinations

| Declaration                                                 | Result           | Reason                                                                                                      |
| ----------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `connections` together with `multiConnection`               | Validation error | Modern and legacy connection vocabularies cannot be mixed.                                                  |
| `connections` together with `connectionRequirement`         | Validation error | Modern and legacy connection vocabularies cannot be mixed.                                                  |
| `connections: -1`, `connections: 1.5`, or `connections: 11` | Validation error | Exact counts must be integers in 0–10.                                                                      |
| `{ "min": 3, "max": 2 }`                                    | Validation error | Minimum exceeds maximum.                                                                                    |
| `{ "max": 11 }` or `{ "min": -1 }`                          | Validation error | Bounds must be integers in 0–10.                                                                            |
| `{ "maxx": 2 }`                                             | Validation error | The object accepts only `min` and `max`.                                                                    |
| `features: {}`                                              | Validation error | Without modern `connections`, legacy `multiConnection` remains required when a features object is supplied. |

#### New capabilities compared with legacy declarations

Legacy declarations can express at most two connections. The modern field adds exact zero, exact counts through ten, ranges with independently required and optional slots, and a connectionless tool that may accept connections later. Existing `"primary"`/`"secondary"` API targets and legacy manifests continue to work; numeric targets and runtime routing beyond slot 1 are enabled in PR 4.

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

### [x] PR 3 — Status-bar squares and connection management

**Status:** Complete. The user manually verified the status-bar features. The primary status stays in place and assigned secondary slots render as environment-coloured square buttons with accessible names, token-expiry state, and impersonation indicators. Click opens the slot-scoped picker; right-click exposes Change, Clear, and impersonation actions. Secondary updates persist through the existing settings API, tab subtext summarizes extra names, and full names are in its tooltip. Further runtime slots will be exposed when PR 4 adds the N-slot API.

- Keep the primary status display in place. Render each filled non-primary slot as a numbered, clickable, environment-coloured square on the right.
- Clicking a square opens a picker scoped to that slot; add Change/Clear/Impersonate actions, token-expiry and impersonation markers, keyboard navigation, and accessible names.
- Update tab subtext/tooltip, impersonation state, and the tab menu to use “Manage Connections…”. Hide connection UI for max 0.

**Unit tests:** `tests/unit/renderer/statusBarSquares.test.ts` covers square numbering, Production color-token mapping, expiry state, impersonation summary, and accessible labels. Context-menu, picker-routing, persistence, and arrow-key interaction assertions remain automated-test follow-up, not a blocker after manual verification.

**E2E tests:** existing `tests/e2e/multiConnectionModal.spec.ts` checks the accessible square-toolbar container and zero-connection footer hiding. A fixture-backed secondary assignment is still needed to automate square change/clear, expiry, impersonation, and arrow-key interactions. Screen-reader speech remains a manual VoiceOver check.

### [ ] PR 4 — Runtime support for more than two slots

**Status:** Runtime implementation is present in the working tree, but PR 4 remains open until the missing API-routing/privacy tests below are added and the Supabase schema prerequisite is confirmed. Do not mark complete based only on the modal-cap E2E.

- Generalize per-instance connection and impersonation state to arrays.
- Add slot-array IPC and preload APIs while retaining all old primary/secondary APIs.
- Route Dataverse operations by string or numeric target; report missing/out-of-range slots clearly.
- Extend `packages/types/toolboxAPI.d.ts`, `dataverseAPI.d.ts`, and `powerplatformAPI.d.ts` with array
  APIs and numeric `ConnectionTarget`, preserving old fields and string aliases for backward compatibility.
- Read the new `connections` field from `tool_release_features`; deploy the database column before releasing this PR. Validate registry values defensively and fall back to legacy values when malformed.
- Add a Sentry breadcrumb with the resolved min/max and filled count only; never include connection identifiers.

**Already implemented and verified in the working tree:** per-instance arrays, indexed connection/impersonation lookup, array context updates, numeric targets across the Dataverse and Power Platform IPC surfaces, tool-facing `getConnections()` / `getConnection(target)`, array-aware invocation inheritance, registry mapping with legacy fallback, and a breadcrumb containing only min/max/filled count. `tests/unit/common/connectionSlots.test.ts`, `tests/unit/main/managers/toolWindowManager.test.ts`, and `tests/unit/main/managers/toolRegistryManager.test.ts` cover target normalization, later-slot routing and impersonation, connection updates, invocation prompt inheritance, and registry mapping. `tests/e2e/multiConnectionModal.spec.ts` covers the four-slot selector cap and zero-connection launch.

**Remaining unit tests required:**

- Add focused tests for the tool preload bridge: `connections.getConnections()` preserves null gaps and legacy two-field context; `connections.getConnection(3)` returns slot 4; negative/fractional targets reject.
- Add main IPC routing tests proving a Dataverse operation applies impersonation from the selected slot, while `getSystemUsers` and Power Platform requests route to the selected later numeric slot. Include legacy `"secondary"` routing and clear errors for an unassigned/out-of-range slot.
- Add no-connection API tests proving Dataverse and Power Platform requests reject with a useful missing-connection error when the tool has no assigned slot.
- Add a Sentry breadcrumb test asserting its custom data contains `minConnections`, `maxConnections`, and `filledConnectionCount` only, with no connection IDs or URLs.
- Extend invocation coverage through a successful prompt response: verify selected arrays reach the callee launch and `CALLEE_TOOL_OPENED`, while cancellation still rejects and releases the pending invocation state.

**Remaining E2E tests required:** add `tests/e2e/nConnectionSupport.spec.ts` or extend the existing connection spec. Use a deterministic fixture and local/mock data; do not require live Supabase, real credentials, or external Dataverse calls.

- Preserve the existing four-slot hard-cap and zero-connection-launch checks.
- Assign at least four deterministic connection IDs without interactive authentication, then have the fixture tool call `toolboxAPI.connections.getConnection(3)` and a Dataverse/Power Platform API method with target `3`. Assert slot 4 is selected, not the primary or secondary connection.
- Verify legacy `"secondary"` still selects slot 1 and negative/fractional plus unassigned high indexes fail clearly.
- Call a Dataverse API from a connectionless fixture and assert the returned error explains that no connection is assigned.
- Exercise inter-tool launch with inherited later slots: confirm the prompt shows the declared min/max, selected connection IDs are positionally preserved, and the callee receives the full array.

**Database artifact required before release:** add or deploy the `connections` column on `tool_release_features` using the table's established JSON/JSONB convention, and confirm the Supabase relation query `tool_release_features(connections)` returns it. No migration for this column is currently present in this repository. Verify one valid range and one malformed value against the deployed shape; the client must use the legacy catalog fields when the modern value is malformed or unavailable.

**Completion gate:** all remaining tests above pass; run focused and full unit suites, the new/updated E2E suite, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, and `git diff --check`. Record the schema deployment/verification separately from the code merge. Latest working-tree checks before the remaining tests were 352 unit tests passed, 5 connection-modal E2E tests passed, and build/lint passed; the lint and build emit existing toolchain/chunk warnings only.

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
