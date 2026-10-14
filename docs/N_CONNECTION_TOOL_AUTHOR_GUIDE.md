# Connection Slots for Tool Authors

## Declare Your Range

Declare `features.connections` in the tool's package manifest, not in `pptb.config.json`. The existing integer and `{ min, max }` forms remain the default and fallback behavior when explicit `slots` are absent. Counts must be integers from 0 through 10. A number declares an exact count; a min/max object declares a range. Existing tools do not need to adopt slots.

```json
{ "features": { "connections": 3 } }
```

```json
{ "features": { "connections": { "min": 0, "max": 3 } } }
```

```json
{ "features": { "connections": { "min": 1, "max": 4 } } }
```

```json
{ "features": { "connections": 0 } }
```

These examples declare exactly three, zero to three, one to four, and no connections respectively. In object form, omitted `min` defaults to 1; omitted `max` defaults to the resolved minimum. `min` cannot exceed `max`. Without a connection declaration the runtime retains the historic one-required-connection default.

The first `min` slots must be assigned. A multi-slot range with no initial assignments opens the selector; when `min` is zero the user can confirm without assigning anything. Exact zero skips selection and hides connection controls. Declaring optional capacity means your tool must handle missing connections explicitly.

## Declare Supported Connection Types

For integer/range and legacy declarations, `features.connectionTypes` declares the products a tool supports independently of its connection count. Omission preserves Dataverse-only behavior for existing tools. The array must be non-empty, unique, and contain only `"dataverse"` and `"financeOperations"`.

```json
{
    "features": {
        "connections": { "min": 1, "max": 3 },
        "connectionTypes": ["dataverse", "financeOperations"]
    }
}
```

A mixed declaration allows either product in any slot. Check the safe connection getter's `connectionType` before choosing an API; older hosts can omit the field, which means Dataverse. A mismatched assignment fails compatibility validation. Tools requiring `enabledForPowerPlatformAPI` can use only enabled Dataverse client-secret connections.

F&O authentication and `window.financeOperationsAPI` are available in the local `finops-connection` build. See the [manual testing and API guide](FINANCE_OPERATIONS_MANUAL_TESTING.md). Set `features.minAPI` to the first supporting desktop release when that version is finalized; no supporting release has been published yet.

## Declare Fixed Typed Slots

Opt into `features.connections.slots` when each connection has a specific purpose or product. Array order defines zero-based API targets:

```json
{
    "features": {
        "connections": {
            "slots": [
                { "label": "Dataverse accounts", "connectionTypes": ["dataverse"], "required": true },
                { "label": "F&O customers", "connectionTypes": ["financeOperations"], "required": true }
            ]
        }
    }
}
```

The picker displays the selected slot's purpose while searching/filtering, offers only compatible products, and requires every required index. Runtime switching uses the same purpose and product rules. Connections display **Dataverse** or **F&O** product labels independently of purpose; F&O has the expanded accessible description **Dynamics 365 Finance & Operations**.

- Declare 1–10 slots. Use the existing `connections: 0` form for a connectionless tool.
- `label` is optional. A supplied label must be nonempty after trimming; it is rendered as text. Omission uses Primary, Secondary, then Connection N. Labels describe purpose and are not saved connection names or API identifiers.
- `connectionTypes` defaults to `["dataverse"]`. A supplied array must be nonempty, unique, and contain only supported products. A slot can allow both products.
- `required` defaults to `true`. Optional slots can appear before or between required slots.
- Slots have fixed rows with no add/remove controls. Clearing an optional slot leaves `null` at its original index; required slots cannot be cleared. An all-optional definition can launch with every slot empty.
- Do not combine `slots` with `min`, `max`, tool-level `connectionTypes`, or either legacy connection field. Unknown keys and malformed slots fail validation; they never fall back to counts/ranges.
- `enabledForPowerPlatformAPI` remains a tool-wide restriction: all explicit slots must allow only Dataverse, and populated assignments must be enabled Dataverse client-secret connections.

For example, `slots: [{ required: false }, { label: "F&O customers", connectionTypes: ["financeOperations"] }]` accepts `[null, financeConnectionId]`. Filling slot 0 does not satisfy required slot 1. Make requests to the declared index:

```typescript
const accounts = await window.dataverseAPI.queryData("accounts?$top=5", 0);
const customers = await window.financeOperationsAPI.queryData("CustomersV3?$top=5", { connectionTarget: 1 });
```

See the [mixed example](../examples/dataverse-finance-operations/README.md) for concurrent reads and independent error handling. Typed manifests require the coordinated supporting desktop/types/validator release; the release version and example's corresponding `minAPI` remain pending in the [implementation checklist](CONNECTION_SLOT_DEFINITIONS_IMPLEMENTATION_PLAN.md). Use the local updated packages for development and set the actual supporting `minAPI` before publication.

## Address Slots

API targets are zero-based: 0 is primary, 1 is secondary, and 2 is the third connection. The legacy strings `"primary"` and `"secondary"` remain valid aliases for indexes 0 and 1.

```typescript
const slots = await window.toolboxAPI.connections.getConnections();
const third = await window.toolboxAPI.connections.getConnection(2);

if (third) {
    const result = await window.dataverseAPI.queryData("accounts?$select=name&$top=5", 2);
}
```

```typescript
const connection = await window.toolboxAPI.connections.getConnection(2);
if (connection?.enabledForPowerPlatformAPI) {
    const result = await window.powerplatformAPI.PowerApps.Get("apps", 2);
}
```

For count/range tools, `getConnections()` returns assigned slots and null gaps, not necessarily an array padded to the declared maximum. Explicit-slot tools preserve the full fixed declaration length, including trailing optional nulls. `getConnection(target)` returns null for an unassigned slot. Invalid negative or fractional targets reject; API requests requiring an unassigned connection fail with a missing-slot error. Connection metadata does not contain authentication tokens.

Never compact the slot array before routing requests: `[A, null, C]` means C is still at index 2. The displayed footer numbers are one-based, so square 3 corresponds to API target 2. Count/range unused capacity is shown as a muted addable square. Fixed optional slots remain at their declared indexes and can be reassigned through Manage Connections.

## Migrate Existing Tools

Existing manifests and primary/secondary APIs continue to work without changes. Runtime legacy resolution is silent; the package validator warns about deprecated declarations.

| Legacy declaration                                                    | Modern equivalent                     |
| --------------------------------------------------------------------- | ------------------------------------- |
| `multiConnection: "none"`                                             | `connections: 1`                      |
| `multiConnection: "optional"`                                         | `connections: { "min": 1, "max": 2 }` |
| `multiConnection: "required"`                                         | `connections: 2`                      |
| `multiConnection: "none", connectionRequirement: "optional"`          | `connections: { "min": 0, "max": 1 }` |
| Either multi-connection mode with `connectionRequirement: "optional"` | `connections: { "min": 0, "max": 2 }` |

Remove both `multiConnection` and `connectionRequirement` when adopting `connections`; mixing vocabularies is invalid. `connections.getSecondaryConnection()` is deprecated but still supported. Prefer `getConnection("secondary")`, `getConnection(1)`, or `(await getConnections())[1]`. The array method is asynchronous; do not index its Promise.

To migrate a tool-wide mixed declaration to explicit slots, replace the count/range with ordered slot definitions and move product choices into each slot; remove tool-level `connectionTypes`. Update queries to use the declared targets instead of discovering/reordering by product. Revalidate remembered assignments when types, required status, order or length change; PPTB prompts for missing required indexes and rejects wrong-product assignments. Saved arrays are reused without compaction or automatic product-based remapping. Existing tools that keep count/range declarations retain their existing selection behavior.

Validate your complete manifest before publishing:

```bash
pnpm exec pptb-validate package.json --skip-url-checks
```

## Invoke Another Tool

Tool-to-tool invocation inherits the full caller array, preserving positions. To supply a different array:

```typescript
const context = await window.toolboxAPI.getToolContext();
const result = await window.toolboxAPI.invocation.launchTool("target-tool-package", { entityName: "account" }, { connectionIds: [...(context.connectionIds ?? [])] });
```

Legacy primary/secondary overrides affect only slots 0/1; null behaves like omission and inherits those slots. In an explicit `connectionIds` array, null is authoritative and clears that optional index. The target's declared maximum bounds inherited launch context; an explicit override exceeding the maximum is rejected. Missing required indexes trigger the windowed selector and wrong-product assignments are rejected. Count/range optional targets with capacity also open selection when no connections are inherited, and allow confirmation without assignments when min is zero; all-optional explicit targets can launch empty. See [Inter-Tool Invocation](INTER_TOOL_INVOCATION.md) for result handling.

## MCP and Headless Calls

MCP callers use saved names instead of internal IDs, under `arguments.__pptb`:

```json
{
    "__pptb": {
        "executionMode": "headless",
        "connectionNames": ["Development", "Test", "Production"]
    }
}
```

Names are trimmed and matched case-insensitively. Unknown or ambiguous names, excessive counts, and names for a zero-connection tool are rejected. `connectionName` remains the slot-0 alias; if both fields are supplied it must match the first array entry. Headless named calls must satisfy required assignments and never open a picker or initiate fresh interactive sign-in. Legacy callback-only tools requiring at most one connection may use `authToken` without a saved name. Authenticate interactive saved connections first. Global APIs use saved credentials; a caller token overrides only the headless callback's primary token, not global API authentication, and cannot establish product identity or satisfy explicit required slots. See [MCP Implementation](MCP_IMPLEMENTATION.md).

Count/range/legacy MCP `connectionNames` entries remain nonempty strings forming a dense prefix starting at slot 0. Explicit-slot tools additionally accept null entries: `[null, "F&O production"]` preserves the F&O connection at target 1. Omitted trailing optional slots are padded with nulls. MCP schemas advertise slot purposes, types and required status. Windowed MCP may prompt for missing required indexes; headless MCP rejects them with the missing slot's label. See the [MCP migration guide](MCP_TOOL_AUTHOR_MIGRATION.md#explicit-connection-slots).

## Lifecycle and Release Checks

Duplicate Tab and session restore preserve all slots; Duplicate with New Connection opens selection instead. Failed restore authentication nulls only the failed slot. Authentication during restore is limited to two concurrent operations. Old sessions that never saved a third slot cannot recover it automatically.

Deletion is blocked while an open tool uses a connection. Once deletion is allowed, saved references become null without reindexing. Startup also repairs already-missing IDs. Tool updates trim saved assignments above a reduced maximum and warn when assigned connections are removed; missing required slots remain empty so launch can prompt.

Explicit remembered/session assignments are revalidated against the current manifest before authentication. Deleted or incompatible IDs become null in place, obsolete trailing capacity is trimmed, and missing required indexes open the purpose-labeled picker. Rejected reassignment preserves the current connections, impersonation and tool context. Impersonation applies only to Dataverse; a mixed-type slot changed to F&O clears incompatible impersonation.

Before releasing a tool, exercise exact-zero and optional launches, all required slots, a cleared middle slot, numeric routing to later slots, duplicate/restart, and inter-tool or headless invocation if supported. Do not record connection IDs, names, URLs, or tokens in connection-slot telemetry; use only minimum, maximum, and filled count.

For explicit slots also verify arbitrary required indexes, per-slot product filtering, purpose labels during launch/switch/restore, optional null holes, wrong-product and missing-required rejection, and declared-order API routing. Older apps do not understand typed slot manifests. Set `features.minAPI` to the actual supporting release and use compatible published types/validator packages before marketplace intake; local implementation does not establish publication or older-app compatibility.
