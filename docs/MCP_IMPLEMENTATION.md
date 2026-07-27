# MCP Implementation

This document covers how Power Platform ToolBox exposes tools to external automation agents through the built-in MCP server.

## Table of Contents

- [MCP Implementation](#mcp-implementation)
    - [Table of Contents](#table-of-contents)
    - [Overview](#overview)
    - [Agent Contract](#agent-contract)
    - [MCP Invocation Envelope](#mcp-invocation-envelope)
    - [Mode Semantics](#mode-semantics)
    - [Execution Mode Semantics](#execution-mode-semantics)
    - [Tool Runtime Context](#tool-runtime-context)
    - [Implementation Notes](#implementation-notes)
    - [Validation and Troubleshooting](#validation-and-troubleshooting)

## Overview

External automation agents can invoke selected PPTB tools through the MCP server. PPTB supports windowed execution and now includes a headless execution contract for unattended flows.

## Agent Contract

To expose a tool to MCP, add a top-level `agents` section in `pptb.config.json`.

```json
{
    "invocation": {
        "version": "1.0.0",
        "capabilities": ["entity-picker"],
        "prefill": {
            "properties": {
                "entityName": { "type": "string" },
                "allowMultiSelect": { "type": "boolean" }
            }
        },
        "returnTopic": {
            "properties": {
                "selectedId": { "type": "string" },
                "selectedName": { "type": "string" }
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

Field summary:

- `agents.version`: required semantic version for the agent contract.
- `agents.invokable`: required to expose the tool to MCP.
- `agents.modes`: supported invocation modes.
- `agents.defaultMode`: fallback mode when the agent does not specify one.
- `agents.timeoutMS`: timeout hint for two-way calls.

## MCP Invocation Envelope

MCP callers can pass PPTB-specific invocation metadata under `arguments.__pptb`.

```json
{
    "entityName": "account",
    "__pptb": {
        "mode": "two-way",
        "timeoutMs": 60000
    }
}
```

Supported metadata:

- `mode`: `"one-way"` or `"two-way"`.
- `executionMode`: `"windowed"` or `"headless"`.
- `timeoutMs`: positive number in milliseconds.
- `authToken`: optional caller-provided token for headless execution contexts.
- `connectionName`: optional saved PPTB connection name. MCP resolves and refreshes tokens server-side when possible.

## Mode Semantics

- `two-way`: MCP waits for the callee to call `returnData(...)` and validates the result against `returnTopic`.
- `one-way`: MCP returns an immediate accepted response and does not wait for a payload from the callee.

## Execution Mode Semantics

- `windowed`: existing BrowserView launch behavior.
- `headless`: MCP returns a job acknowledgement with `jobId` and `jobStatusPath`.

For headless + invocation `mode`:

- `headless` + `two-way`: MCP waits for job completion and returns the final tool payload directly (schema-aligned) when successful.
- `headless` + `one-way`: MCP returns immediate acceptance metadata (`jobId`, `statusUrl`) and callers poll status endpoints as needed.

Headless runtime contract:

- Tool package must expose `invokeHeadless(input, context)` from a discovered entry file.
- Entry discovery order:
    1. `agents.headlessEntry` in `pptb.config.json`
    2. `dist/headless.js`
    3. `headless.js`
    4. `package.json.main`
- `invokeHeadless` must return a JSON object payload matching `returnTopic` when two-way semantics are expected.

Example headless acceptance payload:

```json
{
    "status": "accepted",
    "executionMode": "headless",
    "mode": "two-way",
    "jobId": "f5a79f96-3d4f-4f60-a151-4d2d3069f2ef",
    "jobStatusPath": "/mcp/jobs/f5a79f96-3d4f-4f60-a151-4d2d3069f2ef",
    "statusUrl": "/mcp/jobs/f5a79f96-3d4f-4f60-a151-4d2d3069f2ef/status",
    "jobStatus": "pending",
    "timeoutMs": 120000,
    "hasAuthToken": true,
    "authSource": "provided-token",
    "connectionName": "optional-when-using-connection-name"
}
```

Job status endpoint:

- `GET /mcp/jobs/{jobId}` or `GET /mcp/jobs/{jobId}/status` (requires `X-MCP-Auth-Token`)
- Returns job state (`pending`, `in_progress`, `completed`, `failed`) and result/error fields when available.

Headless `context` shape passed to `invokeHeadless`:

```json
{
    "toolId": "tool-id",
    "toolName": "friendly-name",
    "invocationMode": "one-way|two-way",
    "authToken": "optional-token",
    "updateProgress": "function(percent, message)",
    "logger": {
        "info": "function(message)",
        "error": "function(message)"
    }
}
```

### Headless API Access

Headless tools run under Node.js, so they do not get a real browser DOM. Tool code should therefore avoid assuming that `document` exists, but it may still use PPTB APIs through a compatibility global installed by the headless runtime.

This is additive compatibility, not a rename. Existing browser-based tools can continue to use `window.toolboxAPI`, `window.dataverseAPI`, and `window.powerplatformAPI` unchanged.

The three PPTB globals are available on `globalThis` in headless mode, matching the same names used in browser-based tools:

| Global             | Headless                      | Windowed                  | Purpose                                                    |
| ------------------ | ----------------------------- | ------------------------- | ---------------------------------------------------------- |
| `toolboxAPI`       | `globalThis.toolboxAPI`       | `window.toolboxAPI`       | Connections, utils, settings, terminal, events, invocation |
| `dataverseAPI`     | `globalThis.dataverseAPI`     | `window.dataverseAPI`     | All Dataverse CRUD, FetchXML, metadata, execute            |
| `powerplatformAPI` | `globalThis.powerplatformAPI` | `window.powerplatformAPI` | Power Platform admin endpoints                             |

For headless tools that need Dataverse or Power Platform access, the MCP invocation should also carry a `connectionName` so the runtime can resolve the correct saved connection before the tool runs.

Example headless entry that matches the public API surface:

```typescript
export async function invokeHeadless(input: Record<string, unknown>, context: { toolName: string; invocationMode: "one-way" | "two-way" }) {
    // toolboxAPI – connections, utils, settings, terminal, events, invocation
    const connection = await toolboxAPI.connections.getActiveConnection();

    // dataverseAPI – exposed separately, same as window.dataverseAPI in windowed mode
    const topAccounts = await dataverseAPI.queryData("accounts?$select=name&$top=5");

    return {
        toolName: context.toolName,
        invocationMode: context.invocationMode,
        connectionName: connection?.name ?? null,
        rows: topAccounts.value ?? [],
    };
}
```

The globals are installed directly on `globalThis`, so tool code written for windowed execution (`window.dataverseAPI.queryData(...)`) continues to work unchanged because `window` is aliased to `globalThis` by the headless runtime.

## Tool Runtime Context

When a tool is launched by MCP, `toolboxAPI.invocation.getLaunchContext()` returns the prefill data. If present, invocation metadata is attached under `__pptb`.

```json
{
    "entityName": "account",
    "__pptb": {
        "source": "mcp",
        "mode": "two-way",
        "correlationId": "mcp-...",
        "timeoutMs": 60000,
        "expectsResponse": true
    }
}
```

## Implementation Notes

Current implementation points:

- MCP server entry point: [src/main/mcp/mcpServer.ts](../src/main/mcp/mcpServer.ts)
- Agent tool registry: [src/main/mcp/agentToolRegistry.ts](../src/main/mcp/agentToolRegistry.ts)
- Invocation context bridge: [src/main/toolPreloadBridge.ts](../src/main/toolPreloadBridge.ts)
- Logging: [src/main/mcp/agentInvocationLogger.ts](../src/main/mcp/agentInvocationLogger.ts)

The runtime currently:

- Validates agent eligibility from `agents`.
- Validates input against the tool's `prefill` schema.
- Validates output against `returnTopic` for two-way calls.
- Logs mode, correlation id, and result outcome.

## Validation and Troubleshooting

- Run `pnpm run build` after changing MCP-related TypeScript or docs.
- If a tool does not appear in MCP discovery, confirm `agents.invokable` is `true`.
- If a call fails schema validation, compare the payload against `prefill` or `returnTopic`.
- If a call times out, adjust `agents.timeoutMS` or the per-call `__pptb.timeoutMs` hint.
- Use MCP Inspector as the manual test harness for this feature area.
- Verify that `list-tools` shows the supported modes and that `call-tool` returns the expected one-way or two-way response.
- Check that invocation logs redact connection-related identifiers and sensitive payload fields.
