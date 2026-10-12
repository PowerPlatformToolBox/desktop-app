# Connection Slots for Tool Authors

## Declare Your Range

Declare `features.connections` in the tool's package manifest, not in `pptb.config.json`. Values must be integers from 0 through 10. A number declares an exact count; an object declares a range.

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

`getConnections()` returns assigned slots and null gaps, not necessarily an array padded to the declared maximum. `getConnection(target)` returns null for an unassigned slot. Invalid negative or fractional targets reject; API requests requiring an unassigned connection fail with a missing-slot error. Connection metadata does not contain authentication tokens.

Never compact the slot array before routing requests: `[A, null, C]` means C is still at index 2. The displayed footer numbers are one-based, so square 3 corresponds to API target 2. Unused capacity is shown as a muted addable square; explicitly cleared slots remain visible and can be reassigned through Manage Connections.

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

Legacy primary/secondary overrides affect only slots 0/1; null behaves like omission and inherits those slots. The target's declared maximum bounds its launch context; missing required slots trigger the windowed selector. Optional targets with capacity also open selection when no connections are inherited, and allow confirmation without assignments when min is zero. See [Inter-Tool Invocation](INTER_TOOL_INVOCATION.md) for result handling.

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

Names are trimmed and matched case-insensitively. Unknown or ambiguous names, excessive counts, and names for a zero-connection tool are rejected. `connectionName` remains the slot-0 alias; if both fields are supplied it must match the first array entry. Headless calls must supply enough names and never open a picker or initiate fresh interactive sign-in. Authenticate interactive saved connections first. Global APIs use saved credentials; a caller token overrides only the explicit headless callback's primary token, not global API authentication. See [MCP Implementation](MCP_IMPLEMENTATION.md).

MCP `connectionNames` entries must be non-empty strings and form a dense prefix starting at slot 0. They cannot represent null gaps or assign only slot 2 without also supplying slots 0 and 1.

## Lifecycle and Release Checks

Duplicate Tab and session restore preserve all slots; Duplicate with New Connection opens selection instead. Failed restore authentication nulls only the failed slot. Authentication during restore is limited to two concurrent operations. Old sessions that never saved a third slot cannot recover it automatically.

Deletion is blocked while an open tool uses a connection. Once deletion is allowed, saved references become null without reindexing. Startup also repairs already-missing IDs. Tool updates trim saved assignments above a reduced maximum and warn when assigned connections are removed; missing required slots remain empty so launch can prompt.

Before releasing a tool, exercise exact-zero and optional launches, all required slots, a cleared middle slot, numeric routing to later slots, duplicate/restart, and inter-tool or headless invocation if supported. Do not record connection IDs, names, URLs, or tokens in connection-slot telemetry; use only minimum, maximum, and filled count.
