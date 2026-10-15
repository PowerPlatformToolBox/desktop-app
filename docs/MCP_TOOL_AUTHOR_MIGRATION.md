# MCP Tool Author Migration Guide

This guide is for tool authors who want their PPTB tool to be callable by external MCP clients.

## What changed

PPTB now exposes an explicit `agents` contract in `pptb.config.json`.

- `invocation` remains the contract for PPTB-to-PPTB tool launching.
- `agents` is the contract for MCP-based external automation.
- Both contracts can coexist in the same tool.

## Minimal manifest changes

Add an `agents` section next to `invocation`.

```json
{
    "invocation": {
        "version": "1.0.0",
        "prefill": {
            "properties": {
                "entityName": { "type": "string" }
            }
        },
        "returnTopic": {
            "properties": {
                "selectedId": { "type": "string" }
            }
        }
    },
    "agents": {
        "version": "1.0.0",
        "invokable": true,
        "modes": ["one-way", "two-way"],
        "defaultMode": "two-way",
        "timeoutMS": 12000
    }
}
```

Guidance:

- Set `invokable: true` only when the tool is ready to be called by external agents.
- Use `modes` to list the invocation styles the tool can actually support.
- Keep `defaultMode` aligned with the most reliable call path.
- Increase `timeoutMS` for slower two-way flows.

## Runtime expectations

- `one-way` calls should accept the launch and complete quickly.
- `two-way` calls should eventually return data via the normal tool return path.
- `toolboxAPI.invocation.getLaunchContext()` should still be used for local tool state.
- `toolboxAPI.invocation.returnData()` remains the handoff mechanism for returning values.

## Explicit connection slots

Integer, `{ min, max }`, and legacy connection declarations remain the default/fallback. Tools can opt into fixed typed slots in `package.json`:

```json
{
    "features": {
        "connections": {
            "slots": [
                { "label": "Optional accounts", "required": false },
                { "label": "F&O customers", "connectionTypes": ["financeOperations"] }
            ]
        }
    }
}
```

Call this tool with `__pptb.connectionNames: [null, "F&O production"]`. Index 1 stays target 1; `null` leaves the optional slot unassigned. Omitted trailing optional entries are padded with nulls. Slot labels describe purpose and are not connection names. A missing product defaults to Dataverse; `required` defaults to true.

MCP advertises nullable names and each slot's purpose, products and required status for explicit declarations. Names match saved connections case-insensitively after trimming; missing or ambiguous names fail. `connectionName` always assigns slot 0 and must match the first array entry when both fields are supplied. No path infers order from products.

Headless calls reject missing required assignments and wrong products before authentication or execution. Windowed calls can open the purpose-labeled picker for missing required assignments. Callback tokens do not satisfy explicit required slots or establish product identity. Existing single-connection callback-only tools can continue using `authToken` without a saved name; built-in product APIs still need saved credentials.

Use `financeOperationsAPI.queryData("CustomersV3?$top=5", { connectionTarget: 1 })` for the declared F&O slot. IDs, names, URLs and callback token arrays preserve holes; `toolboxAPI.connections.getConnections()` returns null for empty slots. Public tool context and connection metadata omit tokens. Count/range/legacy tools continue using string-only name arrays and the existing numeric and primary/secondary aliases.

Slots require the coordinated app/types/validator release described in the [implementation plan](CONNECTION_SLOT_DEFINITIONS_IMPLEMENTATION_PLAN.md). Its minimum supported API version is still a release dependency; do not claim compatibility with older apps that only understand counts/ranges.

## What to test in MCP Inspector

1. Open the MCP Inspector and connect to the PPTB MCP server.
2. Run `list-tools` and confirm the tool appears.
3. Confirm the tool description shows supported modes and the default mode.
4. Invoke the tool with no `__pptb` block and confirm the default mode is used.
5. Invoke the tool with `__pptb.mode = "one-way"` and confirm the call is accepted immediately.
6. Invoke the tool with `__pptb.mode = "two-way"` and confirm the returned payload matches the declared schema.
7. Try an unsupported mode and confirm the server returns a deterministic error.
8. For explicit slots, invoke with a leading null and a required later connection, and verify API requests still use the declared target index.
9. Try wrong products, missing required slots, token-only typed input, and unknown/ambiguous saved names; confirm useful errors without opening a headless picker.

## Common mistakes

- Declaring `invokable: true` without a matching `invocation.prefill`/`returnTopic` shape.
- Claiming support for `one-way` when the tool still needs a return payload.
- Using `agents.timeoutMS` that is too short for a real user flow.
- Returning fields that are not part of `returnTopic` for two-way flows.

## Related docs

- [MCP Implementation](MCP_IMPLEMENTATION.md)
- [Inter-Tool Invocation](INTER_TOOL_INVOCATION.md)
