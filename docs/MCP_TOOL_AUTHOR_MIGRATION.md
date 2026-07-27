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

## What to test in MCP Inspector

1. Open the MCP Inspector and connect to the PPTB MCP server.
2. Run `list-tools` and confirm the tool appears.
3. Confirm the tool description shows supported modes and the default mode.
4. Invoke the tool with no `__pptb` block and confirm the default mode is used.
5. Invoke the tool with `__pptb.mode = "one-way"` and confirm the call is accepted immediately.
6. Invoke the tool with `__pptb.mode = "two-way"` and confirm the returned payload matches the declared schema.
7. Try an unsupported mode and confirm the server returns a deterministic error.

## Common mistakes

- Declaring `invokable: true` without a matching `invocation.prefill`/`returnTopic` shape.
- Claiming support for `one-way` when the tool still needs a return payload.
- Using `agents.timeoutMS` that is too short for a real user flow.
- Returning fields that are not part of `returnTopic` for two-way flows.

## Related docs

- [MCP Implementation](MCP_IMPLEMENTATION.md)
- [Inter-Tool Invocation](INTER_TOOL_INVOCATION.md)
