# Connection slot definitions implementation plan

Status: implementation and the automated E2E matrix are complete. Explicit slots work through UI launch, runtime switching, inter-tool prompts, session restoration, supported installation routes and windowed/headless MCP. Product labels appear in connection lists, pickers, slot summaries, tool tabs/status, search, recent cards and native recent menus. The mixed example declares Dataverse target 0 and F&O target 1; separate legacy coverage retains either-order behavior. The temporary runtime gate has been removed after migrating supported routes to per-slot enforcement. Desktop release 1.3.0 is selected and the example declares minAPI 1.3.0. Actual older-app acceptance, external intake support, package publication and live acceptance remain pending. Named automated coverage and exact results are recorded in the [E2E coverage inventory](CONNECTION_SLOT_E2E_COVERAGE.md).

Phase 1 verification (2026-10-14): 120 targeted unit/type/validator tests passed; the validation package build, app type checks, and Vite Electron build passed; all 23 tests in the existing multi-connection, F&O, connection-edge-case, and mixed-example Electron suites passed. These are foundation/regression results, not completion of the new-slot E2E matrix below.

Phase 2 verification (2026-10-14): 201 distinct targeted unit/type/validator tests passed across the foundation, registry, tool runtime, tool loading, and session suites. All 24 connection Electron tests passed, including `connectionSlotRuntime.spec.ts`, which reloads an explicit-slot installed manifest and exercises real IPC launch, reassignment, and remembered-assignment writes. Rejected requests preserve assignments and send no tool-context update notifications. Existing connection edge cases, cold restart, count/range selection, and mixed-product reads remain passing. App type checks and the Electron build passed. Typed-picker, typed session-restoration interaction, installation UI, and MCP/headless E2E coverage remain pending.

## Work checklist

Phase 3 verification (2026-10-14): **212 targeted tests and 33 connection Electron tests passed**, plus app type checks and the Electron build. `connectionSlotPicker.spec.ts` adds nine UI scenarios: required typed slots, optional holes/escaped labels, a single required slot, all-optional launch, ten required slots, same-name product labels/search, narrow dark keyboard interaction, inter-tool prompts, and restoration after a slot product changes. Runtime replacement and recent-card/native-menu reopening preserve slot indexes. Light and narrow dark picker screenshots were inspected. These results cover the implemented picker/labeling stage; they do not complete the entire E2E matrix or MCP/headless acceptance.

Phase 4 verification (2026-10-14): **285 distinct targeted unit/type/validator/runtime/protocol tests and 35 connection Electron tests passed**, plus app type checks and the Electron build. The 15-suite targeted run passed 284 tests; the subsequent protocol run passed all 27 tests after adding one expired-F&O-session case. The protocol integration suite covers typed schemas, null holes, trailing padding, ordered windowed assignments, missing/wrong-product assignments, token-only typed rejection, unknown/ambiguous names, expired authentication, legacy singular/string-array/token inputs and actual runtime API routing. Direct runtime tests additionally cover stale IDs, authoritative null IDs, serialized null token holes and rejection before globals are installed. `connectionSlotMcp.spec.ts` executes actual on-disk headless entries through the Electron MCP server, validates Dataverse/F&O request URLs and saved authentication, confirms no requests for rejected inputs, and verifies the actual windowed purpose-labeled picker retains `[null, F&O, null]`. This completes MCP/headless implementation acceptance; the wider scenario matrix and live verification remain pending.

Phase 5 verification (2026-10-14): **All 36 connection Electron tests passed**, including the migrated actual mixed example and separate legacy either-order routing test. The example's picker enforces both required purposes/products, queries use fixed targets 0/1, and compatible reassignment reaches different Dataverse and F&O environment URLs with the corresponding saved authentication. Independent failures on either side preserve the other result; swapped, same-product and missing-required assignments are rejected without changing IDs or issuing requests. The rendered example screenshot was inspected. App type checks, validation-package build and Electron build passed; the actual example slot contract passed both local validator entry points, and three documented typed-slot manifests passed validation. The author guide, N-connection contract reference, types README, inter-tool/MCP guidance and manual testing instructions now describe the opt-in contract and unchanged default/fallback. No release version/minAPI or package publication is claimed; the full scenario matrix and live smoke test remain pending.

Last reviewed: **2026-10-14**. **Complete** means implemented and verified for the stated scope; it does not mean committed, published, or released. **Partial** means some implementation or coverage exists but the item's acceptance checks are unfinished. **Pending** means the item has not been delivered. Only complete items are checked. Update this checklist and the verification evidence after each implementation stage.

Phase 6 verification (2026-10-14): **46 additional Electron cases** close the automated scenario gaps: 26 default/integer/range/legacy declarations, seven actual cold restarts, seven typed/default/optional/Power Platform/invocation/impersonation workflows, four connection-management/authentication workflows and two installation workflows. Existing MCP tests additionally exercise singular/array/token inputs, connectionless calls, ambiguous names and expired sessions. The complete suite executed **121 tests** (120 initial passes; one closed-window discovery race in the new test helper was fixed and its restart case passed the focused retry and `--last-failed`). There are no skipped or unresolved failing scenarios. The actual marketplace Install-button case also passed a focused run after its UI assertion was added. **286 targeted tests**, application and strict E2E type checks, and the Electron build passed. Long-purpose, light and narrow dark picker screenshots were inspected. The declaration matrix exposed count/range reassignment retaining excess slots; runtime now bounds these arrays exactly as launch already does, while explicit excess assignments remain atomic rejections. All named mappings and external-boundary qualifications are in the [coverage inventory](CONNECTION_SLOT_E2E_COVERAGE.md).

| Plan area | Current status |
| --- | --- |
| 1. Contract, types, validation, resolver | Complete |
| 2. Registry and installation metadata | Partial — supported repository loading/install routes and marketplace UI verified; external intake support pending |
| 3. Main-process enforcement and persistence | Complete — runtime, remembered assignments and typed cold-restoration/manifest-change scenarios verified |
| 4. Picker, runtime controls, purpose and product labels | Complete — automated scenario matrix, marketplace summaries and representative rendering verified |
| 5. MCP and headless invocation | Complete — protocol, actual headless entry/API routing and windowed picker verified |
| 6. Example migration, author documentation and release compatibility | Partial — typed example and author/manual/MCP documentation complete; 1.3.0 selected; actual older-app acceptance and publication pending |
| 7. Full verification and live acceptance | Partial — automated matrix and full-suite execution complete; live acceptance pending |

### Contract and shared logic

- [x] **Complete:** Add public/internal explicit-slot types while retaining integer, min/max and legacy declarations.
- [x] **Complete:** Validate slot defaults, bounds, products, required status, labels, conflicting declarations and invalid shapes in both package validators.
- [x] **Complete:** Normalize ordered requirements and validate draft/complete assignments without compacting optional holes.
- [x] **Complete:** Verify existing default/fallback behavior and reject malformed slots instead of falling back.
- [x] **Complete:** Migrate supported launch consumers to per-slot enforcement before removing the temporary count-only gate.

### Metadata and runtime enforcement

- [x] **Complete:** Preserve native/serialized catalog slots and package slots over stale catalog counts.
- [x] **Complete:** Retain stricter minimum API and Power Platform API requirements when merging explicit-slot metadata.
- [x] **Complete:** Validate explicit metadata during installed/local/npm tool loading and reject malformed definitions.
- [x] **Complete:** Enforce required indexes, products and bounds before main-process launch or reassignment; preserve state on rejection.
- [x] **Complete:** Enforce inherited/overridden invocation assignments and revalidate prompt results before recording invocation state.
- [x] **Complete:** Validate remembered-assignment writes, including legacy primary/secondary setters.
- [x] **Complete:** Revalidate saved IDs against current slot requirements before session authentication.
- [x] **Complete:** Verify session restoration and remembered assignments end to end after typed product/required/order/length changes, removal and authentication failure, including actual cold restarts.
- [x] **Complete:** Verify supported local, npm and downloaded archive installation routes end to end, including marketplace installation UI, persisted package-slot precedence and malformed metadata rejection. The external package-manager process is simulated; the repository's archive extractor supports tar/gzip, not a separate ZIP route.
- [ ] **Pending:** Confirm external catalog storage and intake validation support the new object.

### Picker and connection labeling

- [x] **Complete:** Pass normalized slot definitions through picker options and invocation prompts.
- [x] **Complete:** Render fixed explicit slots with correct required/optional status and per-slot product filtering.
- [x] **Complete:** Enforce confirmation for arbitrary required indexes; clear optional slots without removing or shifting them.
- [x] **Complete:** Show the selected slot's purpose label in the dialog, preserving it through search/filtering and updating it when switching slots.
- [x] **Complete:** Apply purpose labels and slot-specific requirements to single-slot selection, runtime switching, invocation and restoration.
- [x] **Complete:** Standardize Dataverse/F&O product labels across management/sidebar lists, both pickers, assigned summaries, runtime controls, global search, recent cards and native recent menus.
- [x] **Complete:** Preserve ordered optional holes when reopening from recent cards or native recent menus; refresh recent cards when returning home.
- [x] **Complete:** Verify marketplace typed summaries, empty states, purpose/product accessible text and representative narrow/light/dark/long-label rendering.
- [x] **Complete:** Complete the automated picker and labeling matrix while retaining count/range controls, optional holes, required indexes, cancellation and reopening.

### MCP, example and release

- [x] **Complete:** Migrate MCP schema/parsing, lookup and context arrays to preserve optional null holes, including JSON serialization. This implementation runs headless entries in-process; there is no MCP headless worker serialization boundary to migrate.
- [x] **Complete:** Enforce typed assignments in windowed/headless invocation and retain legacy singular/string-array names and callback-only token input behavior.
- [x] **Complete:** Add real-protocol/headless routing and failure coverage for explicit slots, plus Electron MCP tests executing actual disk entries and the windowed picker.
- [x] **Complete:** Convert the mixed example to two typed required slots and update queries/instructions/tests to declared-order behavior. Keep a separate count-declaration either-order API-routing regression.
- [x] **Complete:** Update author guides, the existing N-connection plan contract reference, types-package README, manual testing and inter-tool/MCP migration documentation with defaults, null holes, purpose/product labels, runtime reassignment and release dependencies.
- [x] **Complete:** Select desktop release **1.3.0** for connection slots (user approved); set the app version and mixed example's `features.minAPI` to **1.3.0**.
- [ ] **Partial:** Verify older-app compatibility gates. The user reported **all six tests passing** in `tests/unit/main/managers/versionManager.test.ts`, covering older app versions, prerelease/stable boundaries, stale catalog minimums and legacy compatibility. This models version boundaries in the current implementation; actual older-app acceptance remains pending.
- [x] **Complete:** Verify the example after setting desktop version and `minAPI` to **1.3.0**. The user reported **both tests passing** in `tests/e2e/mixedConnectionExample.spec.ts` (9.8 seconds): typed declared-order enforcement/compatible reassignment and legacy either-order routing. No separate build result was supplied.
- [ ] **Partial:** Prepare types/validator packages: `@pptb/types` **1.3.0** matches the app version as required by existing CI; `@pptb/validate` **1.1.0** adds the slot contract. Types uses `workspace:*` so local validation resolves this workspace validator and pnpm packing converts the published dependency to **1.1.0**. The user reported **59 tests passing across two suites** (`validatePackageJsonConnections.test.ts` and `toolManifestTypes.test.ts`), verifying validator behavior and the public manifest feature types. No separate package-build result was supplied. Packed metadata verification and publication remain upstream release preparation. Lockfile regeneration encountered the existing unavailable `prettier@^3.9.10` dependency; only the workspace-validator lock entries were updated manually.
- [ ] **Pending — upstream-owned:** Marketplace/catalog intake, actual older-app acceptance, publication and remaining release preparation will be completed on the upstream branch, as requested by the user. Publish the validator before types so its dependency is available.
- [x] **Complete:** Remove the remaining runtime gate after UI, main-process and MCP/headless routes enforce explicit slots.

### Verification and delivery

- [x] **Complete:** Pass the current 212 targeted unit/type/validator/renderer checks, type checks and builds.
- [x] **Complete:** Pass the current 33 connection Electron tests, including explicit runtime IPC enforcement and nine picker/labeling/restoration scenarios.
- [x] **Complete:** Pass the Phase 4 targeted checks (285 distinct tests), type checks, build, and all 35 connection Electron tests, including real MCP/headless and windowed picker scenarios.
- [x] **Complete:** Pass all 36 Phase 5 connection Electron tests, including typed-example migration and legacy either-order API routing; pass type checks, validation-package/Electron builds and example/documented-slot contract validation; inspect the rendered example.
- [x] **Complete:** Map every automated E2E scenario group below to named tests in `docs/CONNECTION_SLOT_E2E_COVERAGE.md`, recording external-boundary simulations and separate release/live dependencies.
- [x] **Complete:** Deliver the missing default/boundary/range/legacy combination, typed variants, management, restoration, installation and MCP cases.
- [x] **Complete:** Execute all 121 Electron tests with no skipped scenarios; fix and verify the single test-helper timing failure with a focused retry and `--last-failed`. All scenarios are verified; exact run/retry results are recorded above.
- [x] **Complete:** Inspect current picker rendering in light/dark themes and narrow layouts; verify keyboard selection and purpose/product accessible text. Repeat after any further UI changes.
- [ ] **Pending:** Complete and record the live mixed Dataverse/F&O smoke test.
- [x] **Complete:** Commit the implementation plan (`8dc428b`).
- [x] **Complete:** Commit the current foundation, runtime, picker, connection labeling, example, and test changes as an implementation checkpoint. Remaining stages retain their statuses below.
- [x] **Complete:** Commit the MCP/headless, typed-example/documentation and E2E-matrix implementation checkpoint. Release preparation remains separate.
- [ ] **Pending:** Publish/release when implementation, verification and release dependencies are complete.

## Outcome

Allow a tool to declare the product types and required status of each connection slot. A mixed tool can require Dataverse in slot 0 and Finance & Operations in slot 1, and PPTB enforces that declaration before launching or changing the tool's connections.

Existing integer, range, and legacy declarations retain their current behavior. No saved-connection migration or new connection-target API is required.

The existing integer and `{ min, max }` model remains the default and fallback connection behavior. Explicit `slots` are opt-in: when no slot definitions are supplied, use the current count/range resolver and picker behavior. Do not require existing tools to declare slots or infer typed slots from their assigned connections.

## Manifest contract

```json
{
    "features": {
        "connections": {
            "slots": [
                {
                    "label": "Dataverse accounts",
                    "connectionTypes": ["dataverse"],
                    "required": true
                },
                {
                    "label": "F&O customers",
                    "connectionTypes": ["financeOperations"],
                    "required": true
                }
            ]
        }
    }
}
```

Supported forms:

| Form | Behavior |
| --- | --- |
| `connections: 2` | Exactly two required connections. |
| `connections: { min: 0, max: 10 }` | Existing range behavior; the first `min` slots are required. |
| `connections: { slots: [...] }` | Fixed ordered slot definitions, each with its own types and required status. |
| Existing legacy fields or omitted connections | Existing compatibility defaults and behavior. |

Rules for the new form:

- `slots` contains 1–10 objects. Use the existing `connections: 0` form for a connectionless tool.
- Array order is the zero-based API target index. Labels are presentation text, not identifiers.
- `label` is optional. If supplied, require a nonempty trimmed string and render it as text. Otherwise use the existing Primary/Secondary/Connection N fallback.
- `connectionTypes` defaults to `["dataverse"]`. If supplied, it must be a nonempty, unique array of supported products.
- `required` defaults to `true` and must be a boolean if supplied.
- Required slots may appear after optional slots. Filling a different slot never satisfies a required slot.
- Optional slots remain at their declared indexes when unassigned. Clearing a slot produces `null`; it does not remove the slot or shift later connections.
- `slots` cannot be combined with `min`, `max`, tool-level `features.connectionTypes`, or the legacy connection fields. Reject unknown keys rather than silently interpreting them.
- Tool-level `features.connectionTypes` continues to apply to integer/range and legacy declarations.
- Preserve the existing tool-wide Power Platform API restriction. Validate explicit slot types against it; an F&O slot must not bypass that restriction.
- Preserve current duplicate-connection assignment policy. Do not introduce a new uniqueness rule as part of this feature.

Default/fallback resolution order:

1. A valid `connections: { slots: [...] }` declaration opts into explicit-slot behavior.
2. Otherwise, an integer or `{ min, max }` declaration uses the existing behavior and defaults unchanged (`min` defaults to 1; `max` defaults to the resolved `min`).
3. When `connections` is omitted, use the existing legacy-field compatibility rules; with no connection requirement fields, default to one required connection.

Fallback applies to absent slot definitions, not invalid ones. A supplied but malformed `slots` declaration must fail validation rather than silently falling back to count/range behavior.

## 1. Types, validation, and a shared resolver

Extend the union in `packages/types/toolManifest.d.ts`, the internal `src/common/types/tool.ts` declaration, and the validator's package types. Add a public slot-definition interface with the fields above.

Update `packages/validation/src/validate.ts` and the maintained validator entry in `packages/lib/validate.js`. Check defaults, boundaries, invalid shapes, unsupported products, conflicting forms, and unknown keys. Keep existing validation behavior for integer/range and legacy declarations.

Introduce one normalized connection-requirements resolver in `src/common/connectionSlots.ts`. Its result should include whether the declaration is explicit, the effective minimum/maximum, and ordered normalized slot definitions. For count/range declarations, synthesize slot definitions using current types and the existing required-prefix rule. For explicit definitions, derive minimum as the number of required slots and maximum as the array length.

Retain `resolveConnectionSlots()` as a compatibility wrapper for consumers that only need counts. Counts are insufficient to enforce explicit definitions: all assignment validation must use the ordered slots.

Implementation staging is complete: `resolveConnectionSlots()` now returns count summaries for all valid forms; enforcement uses `resolveConnectionRequirements()` and the shared assignment validator. `packages/validation/src/connectionSlots.ts` is the validation source; `packages/lib/connectionSlots.js` is its CommonJS mirror generated by the validation-package TypeScript build with source maps disabled. Regenerate that mirror after changing the source, and retain parity tests for both package-validator entry points.

The main-process, renderer and MCP launch/invocation paths now use `resolveConnectionRequirements()`. Explicit-slot assignments are validated before authentication, view creation, headless execution or context changes. Count/range and legacy behavior remains the default and fallback.

Extend `src/common/connectionCompatibility.ts` with slot-aware checks and a shared assignment validator. Support two explicit validation purposes: validate populated assignments while assembling a selection, and validate a complete configuration before committing it. Reject extra slots, missing saved connections, wrong products, and unfilled required indexes. Normalize omitted optional entries to `null` without compaction. Keep previous count/range runtime behavior where it differs, rather than accidentally tightening it.

Acceptance: an optional slot 0 followed by required slot 1 is accepted with `[null, validConnectionId]`, and rejected with `[validConnectionId, null]`.

## 2. Registry and installation metadata

Extend `getValidConnectionsFeature()` and `mapSupabaseToolRow()` in `src/main/managers/toolRegistryManager.ts` to recognize slot objects, including serialized JSON. Reject malformed explicit declarations instead of falling back to legacy requirements.

Review installed-feature precedence. The current installer prefers registry features and only fills missing product types from `package.json`; stale catalog counts could therefore discard package slot definitions. Preserve and validate the installed package's explicit slot contract, and define how catalog/package disagreement is surfaced. Avoid producing a hybrid manifest containing both slot types and catalog-level product types.

Verify local development loading, ZIP/npm installation, JSON registries, and Supabase mappings preserve the same contract. Catalog publication/ingestion changes outside this repository are a release dependency: confirm the registry's `connections` storage can carry the object and that intake validation accepts it.

Acceptance: a package with explicit slots retains those slots after installation, even when older catalog metadata contains only a count.

## 3. Main-process enforcement and persistence

Apply the shared assignment validator to launch, runtime reassignment, inherited inter-tool connections, and invocation overrides in `src/main/managers/toolWindowManager.ts` and the relevant IPC boundaries in `src/main/index.ts`.

Validate before authentication, view creation, settings writes, or notifications. A rejected reassignment must leave the previous connections, impersonation state, and tool context unchanged. For explicit definitions, require an atomic valid assignment when updating required slots.

Preserve Dataverse-only impersonation and the existing API-manager product guards. A populated F&O slot cannot retain Dataverse impersonation.

Revalidate remembered assignments and restored sessions against the currently installed manifest. Invalid assignments should lead to the appropriate connection picker before launch; do not silently swap products, compact slots, or reuse an incompatible saved connection. Clear obsolete assignments beyond a shortened declaration when building the new selection, without modifying the manifest's remaining slot indexes.

The existing saved ID arrays remain sufficient. No label or product needs to be copied into settings because the installed manifest supplies those requirements.

Acceptance: wrong-product assignments cannot bypass the picker through IPC, session restoration, or inter-tool invocation.

## 4. Connection picker and runtime controls

Pass normalized slot requirements through the modal options and invocation prompt payloads in `src/common/types/api.ts`, `src/renderer/modules/connectionManagement.ts`, and `src/renderer/modules/toolManagement.ts`.

Update `src/renderer/modals/selectMultiConnection/view.ts` and `controller.ts`:

- Render every explicitly declared slot with its label, product choices, and required/optional badge.
- Show the selected slot's author-defined `label` prominently in the connection-selection dialog heading or instruction, including the single-connection picker opened for that slot. For example, display **Choose a connection for F&O customers**, so the user understands its purpose before selecting a connection. Keep that purpose visible while searching/filtering, and update it when the selected slot changes. Use the existing Primary/Secondary/Connection N fallback when no label is supplied; do not replace the purpose label with the selected connection's name or product badge.
- Filter available connections for the selected slot, retaining credential and Power Platform API filters.
- Enable confirmation only when every required index has a compatible assignment.
- Clear optional assignments without removing their rows. Explicit definitions have no add/remove-slot controls.
- Preserve the existing dynamic add/remove behavior for count/range tools.
- Explain an empty filtered list and provide a clear path to configure a compatible connection.
- Escape author-provided labels in generated markup and use them in accessible control names.

Apply the same slot-specific filters and labels to single-slot explicit tools and runtime connection switching. Update marketplace requirement summaries without treating the count of required slots as a required prefix.

Acceptance: the mixed example's Dataverse slot offers only Dataverse connections and its F&O slot offers only F&O connections; confirmation stays disabled until both are assigned.

Acceptance: selecting the **Dataverse accounts** or **F&O customers** slot displays that purpose in the connection-selection dialog. The same label is shown during launch, invocation prompts, restoration, and runtime reassignment, including a single explicit-slot tool.

### Consistent product labels wherever connections are listed

Add a visible connection-product label to every connection list, selector, and assigned-connection summary. Users should be able to distinguish equally named Dataverse and F&O connections without inspecting their URLs. Keep labels visible even when a list is filtered to one product.

Use **Dataverse** and **F&O** consistently. Provide **Dynamics 365 Finance & Operations** as the expanded accessible description/tooltip for F&O. Product, environment, authentication method, and required/optional status are separate information; none should substitute for the product label. Distinguish a slot's allowed products from the product of its actual assigned connection.

Audit and update these surfaces:

| Surface | Intended presentation |
| --- | --- |
| Connections sidebar/management lists | Product badge beside existing connection metadata. Preserve and standardize the badges already present. |
| Single-connection picker | Product badge on every selectable connection row. |
| Multi-connection picker | Product badge on each available connection row and each populated slot summary; allowed-product text on unassigned explicit slots. |
| Runtime connection switching | Product label alongside the connection name in selection menus and assigned-connection summaries. |
| Tool tab/status summaries | Include product in the connection summary and accessible text/tooltip where the compact layout cannot display the full connection description. |
| Invocation and session-restoration selection | Use the same labeled picker and slot summaries as ordinary launch. |
| Import selection/review surfaces, where individual connections are listed | Include product when the source provides it; normalize legacy records consistently before labeling. |

Centralize product-to-label formatting rather than embedding different strings in each renderer/template. Resolve the product from connection metadata using the existing discriminator/default rules, never from the connection name or hostname. Legacy records without a product discriminator display Dataverse; invalid explicit products must not silently receive a Dataverse label.

Use readable text as the primary distinction. Color or icons may supplement it. Preserve label visibility with long names, narrow layouts, light/dark themes, and keyboard/screen-reader navigation. Add the visible product terms and expanded F&O name to existing text search where appropriate, while retaining dedicated type filters.

Acceptance: two connections with the same name and different products remain distinguishable in the sidebar, both pickers, populated slot summaries, and runtime switching UI. Reassignment refreshes the displayed product along with the connection name.

## 5. MCP and headless invocation

Update `src/main/mcp/mcpServer.ts`, `headlessToolRuntime.ts`, and their invocation/context types to use the same normalized requirements and assignment validation.

Explicit optional holes require a representation that preserves indexes. Extend `__pptb.connectionNames` to accept `string | null` entries for explicit-slot tools, for example `[null, "F&O production"]`. Preserve existing string-array and singular `connectionName` behavior for old tools. Treat a singular name as slot 0; do not infer or reorder a connection from its product.

Update schema generation, argument parsing, connection-name lookup, IDs/URLs/auth-token arrays, and any serialization boundaries together. The current MCP runtime executes entries in-process rather than a worker; there is no separate worker payload. Keep placeholders through every stage, authenticate only populated slots, and validate product identity using saved connection records. Retain legacy callback-only token support for tools requiring at most one connection; an explicit slot must not pass a product check merely because a token was supplied.

Windowed invocation may open the picker for missing required assignments. Headless invocation must reject them with the missing slot's label/index. Neither path may accept a connection incompatible with its assigned slot.

Acceptance: a headless tool with optional slot 0 and required F&O slot 1 receives the F&O connection at target 1 when invoked with `[null, "F&O production"]`.

## 6. Example, documentation, and release compatibility

Convert `examples/dataverse-finance-operations/package.json` to two typed required slots. Update its UI instructions and README: slot order is now declared by the tool, so users no longer choose either order. Use explicit targets 0 and 1 in its API calls; keep useful error handling for failed reads.

Update `docs/N_CONNECTION_TOOL_AUTHOR_GUIDE.md`, the existing N-connection plan's contract reference, F&O manual testing instructions, and MCP author guidance. Document defaults, optional holes, runtime reassignment, and migration from tool-level types.

Set the example's minimum supported API/app version to the actual release introducing slots. Coordinate `@pptb/types`, `@pptb/validate`, the app's version gate, and registry intake support. Older applications do not understand slots; compatibility with old tools does not imply new manifests work on old applications. Publishing is a separate release action.

## 7. Verification and completion criteria

Extend existing suites rather than duplicating their coverage:

| Area | Required checks |
| --- | --- |
| Types and validator | All three forms; defaults; 1/10-slot boundaries; invalid keys/types; forbidden combinations; legacy compatibility. |
| Shared resolver | Optional-before-required; multiple allowed products; Dataverse default; stable indexes and nulls. |
| Main process | Valid launch/update; missing required slot; wrong product; extra slot; atomic rejection; inheritance; impersonation guards. |
| Registry and settings | Native/serialized slots; package retention; stale catalog features; restore after manifest changes. |
| Picker | Purpose label in the selection dialog and updates when changing slots; labels persist during search/filtering; fallback labels and escaping; per-slot filtering; optional clear; required confirmation; single explicit slot; count/range regression. |
| Product labels | Same-name mixed-product connections; legacy Dataverse default; labels in filtered lists and assigned slots; accessible F&O expansion; search; reassignment; light/dark and narrow layouts. |
| MCP/headless | Schema/argument compatibility; named connections in declared order; null holes; incompatible products; missing required slots; API routing. |
| Mixed example | Real preload/IPC/API-manager routing to Dataverse slot 0 and F&O slot 1; independent failures; wrong-slot reassignment rejected. |

### Required E2E regression matrix

E2E coverage is a completion requirement for both existing connection behavior and the new explicit-slot form. Inventory current coverage, map each scenario below to a named test, and add missing tests. Do not consider a scenario covered solely by a resolver or validator unit test. Use parameterized fixtures for declaration variants and representative workflow tests for their effects; avoid multiplying every unrelated setting into a full Cartesian product.

| Scenario group | Required E2E scenarios and assertions |
| --- | --- |
| Existing default and integer declarations | No features, omitted `connections`, exact counts 0, 1, 2, and 10. Confirm absent slots use the existing default/fallback behavior, correct picker/connectionless launch, required-slot confirmation, maximum enforcement, and unchanged Primary/Secondary/numeric targeting. |
| Existing range declarations | Empty object/defaults; min-only and max-only defaults; ranges 0–1, 0–3, 1–2, 3–4, and 0–10. Cover zero-assignment launch, required prefixes, adding/removing optional slots, bounds, sparse assignment arrays, and runtime changes. |
| Legacy declarations | Parameterize every supported `multiConnection`/`connectionRequirement` combination, including omitted fields. Assert expected required/optional behavior and unchanged single/multi-picker selection. |
| Existing product compatibility | Legacy/undeclared Dataverse default; Dataverse-only; F&O-only; mixed product declarations on integer/range tools; Power Platform API restrictions. Assert available products and rejection of incompatible direct assignments. |
| Connection management | Add/edit Dataverse and F&O connections; supported authentication choices and validation; test-connection success/failure; import/export and incomplete credentials; search/sort/type filters and reset; token expiry/refresh and failed authentication; deletion while assigned versus unassigned. Existing behavior must remain intact. |
| Explicit-slot declarations | One slot; two typed required slots; 10 slots; omitted field defaults; multiple allowed types within a slot; all-required, all-optional, and mixed required/optional definitions. Assert fixed rows, per-slot filtering, no add/remove controls, and correct confirmation state. |
| Required slots at arbitrary indexes | Optional slot before a required slot and holes between required slots. A populated optional slot cannot satisfy a missing required slot. Launch with `[null, validId]` where permitted and verify target 1 stays target 1. |
| Purpose labels | Author label in the dialog heading/instructions, slot rail, single-slot picker, and runtime switch dialog. Changing slots updates the purpose; filtering/searching preserves it. Verify missing-label fallbacks, long labels, and escaped markup. |
| Product labels | Same-name Dataverse/F&O connections remain distinguishable across lists, pickers, assigned-slot summaries, and switching. Verify labels in product-filtered lists, legacy Dataverse defaults, accessible F&O descriptions, and updates after reassignment. |
| Selection lifecycle | Assign, replace, clear optional, attempt to clear required, cancel, and reopen. Cancel must not commit draft changes; confirmation must commit the correctly ordered IDs and impersonation state. Cover empty compatible lists and incomplete credentials. |
| Runtime enforcement | Valid reassignment; wrong product in a slot; missing required assignment; extra slots; stale/deleted connection IDs. Exercise the real IPC update path and assert rejection leaves IDs, tool context, saved state, and event notifications unchanged. |
| Impersonation | Dataverse selection/clearing; F&O hides/rejects impersonation; mixed-type slot changing from Dataverse to F&O clears incompatible impersonation. Other slots' impersonation remains attached to their original indexes. |
| Remembered assignments and sessions | Reopen a tool and restart/restore a session with valid slots and null holes. Repeat after a connection is removed or a manifest changes types, required status, order, or length. Invalid restored state must prompt correctly rather than launch with silently remapped connections. |
| Invocation entry points | Ordinary tool launch, local development loading, inter-tool inheritance and overrides, invocation prompts, and windowed MCP. Verify the same per-slot rules and purpose labels on every path. |
| Headless MCP | Exercise the actual MCP protocol and headless runtime with named connections, null holes, legacy singular/array inputs, wrong products, missing required slots, and ambiguous/missing names. Assert stable targets and useful slot-specific errors; mocked resolver calls alone are insufficient. |
| Installed metadata | Load/install the actual package through supported local and package/registry paths. Verify explicit requirements survive catalog serialization and stale count-only metadata, and the resulting picker uses them. Invalid/conflicting slot declarations fail clearly rather than falling back. |
| API routing | Run the actual mixed example through real preload, IPC handlers, and API managers. Assert each request's environment, product API, target, and authentication context; cover independent failures and compatible reassignment. Include optional-hole numeric targeting and existing primary/secondary aliases. |
| Presentation and accessibility | Light/dark themes, narrow layout, long/same-name connections, keyboard selection/confirmation/cancel, and accessible purpose/product labels. Use interaction assertions plus rendered screenshots; color alone cannot distinguish products. |

Extend `tests/e2e/multiConnectionModal.spec.ts`, `financeOperations.spec.ts`, `connectionEdgeCases.spec.ts`, and `mixedConnectionExample.spec.ts`, adding focused slot-definition/session/invocation suites where needed. The example's former either-order expectation has been replaced by **typed mixed example enforces declared order and routes compatible reassignment**. The separate **existing mixed-product count declarations still route both APIs in either slot order** test retains legacy tool-wide mixed coverage through actual preload/IPC/API-manager routing.

Use isolated saved connections/tools/settings for each test. Stub authentication and external HTTP at their boundaries while retaining real Electron UI, preload, IPC, persistence, and API routing. Confirm requests and notifications rather than relying only on visible success text. Persistence/restore tests must actually reopen/restart the application; API-routing tests must execute within the tool view.

For MCP, retain and extend real-protocol coverage in `tests/unit/main/mcp/mcpConnections.integration.test.ts` and runtime integration for slot holes. Although that existing file resides under `unit`, track it as protocol integration coverage, separately from Electron UI E2E and live-environment verification. `tests/e2e/connectionSlotMcp.spec.ts` executes actual on-disk headless entries through the Electron MCP server, API managers and HTTP request construction, and opens the actual windowed invocation picker.

Run type checks, validation-package build, targeted unit/integration suites, and the complete Electron E2E suite for final feature acceptance. Build the Electron app before E2E execution, avoiding unrelated repository-wide formatting changes. During development, run the relevant connection suites first. Record the scenario-to-test mapping, results, and any unrelated baseline failures; no required connection/slot scenario may remain skipped or untested at completion.

Complete a live mixed-tool smoke test with user-provided environments after automated checks: read both systems, change to another compatible connection, and confirm each query still reaches the correct environment. Record live results separately from simulated HTTP coverage.

Suggested delivery order: (1) contract/resolver/validator, (2) metadata and main-process enforcement, (3) picker and restoration, (4) MCP/headless support, (5) example/docs and release verification. Land these as one coordinated feature or keep incomplete paths gated until every launch route supports the new contract. No release is complete while a supported route still validates explicit slots using counts alone.
