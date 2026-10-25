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
    - [Agent-Driven Input Flow](#agent-driven-input-flow)
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
- `connectionNames`: saved PPTB connection names in slot order. Index 0 is primary, 1 is secondary, and 2+ addresses additional slots. Names are matched case-insensitively after trimming; unknown or ambiguous names are rejected.
- `connectionName`: legacy slot-0 alias. When both fields are supplied, it must match `connectionNames[0]`; the array is authoritative (including an empty array).

For example, a tool declaring `features.connections: { "min": 2, "max": 3 }` can be invoked with:

```json
{
    "__pptb": {
        "executionMode": "headless",
        "mode": "two-way",
        "connectionNames": ["Development", "Test", "Production"]
    }
}
```

The server rejects more names than the declared maximum, names supplied to a zero-connection tool, and ambiguous names. Headless calls never open a connection picker or a browser sign-in. When names are missing, unknown, or need an interactive sign-in, the server returns an `input_required` response so the agent can ask the user (see [Agent-Driven Input Flow](#agent-driven-input-flow)). Cached tokens, silent refresh, client-secret and username/password authentication are used automatically. `authToken` overrides the primary token in the `invokeHeadless` callback context only. Global Dataverse/Power Platform APIs use the saved connection's credentials, which are authenticated independently. A callback token does not identify a saved connection, satisfy a missing required slot, or replace saved credentials. Windowed calls can prompt for missing required slots in the tool UI.

Headless tools use `toolboxAPI.connections.getConnections()` or `getConnection(2)` to access later slots, and pass the same zero-based numeric target to Dataverse or Power Platform APIs. Legacy `"primary"` / `"secondary"` targets remain supported. Metadata returned by `getToolContext()` contains slot IDs/names/URLs, not tokens.

## Mode Semantics

- `two-way`: MCP waits for the callee to call `returnData(...)` and validates the result against `returnTopic`.
- `one-way`: MCP returns an immediate accepted response and does not wait for a payload from the callee.

## Execution Mode Semantics

When `__pptb.executionMode` is omitted, `headless` is used whenever the tool lists it in `agents.executionModes` (or sets `agents.headless: true`). `windowed` is only a backup: it is used when the tool does not support headless or when the caller explicitly requests it. `agents.defaultExecutionMode` is currently ignored and may be removed in a future release.

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

### Headless Tool Logs

Headless invocations now capture tool messages into the live job record so the MCP Server page can drill into an invocation and show its runtime output.

The supported logging surface is the `context.logger` object passed to `invokeHeadless(...)`:

```typescript
export async function invokeHeadless(
    input: Record<string, unknown>,
    context: { logger: { debug(message: string): void; info(message: string): void; warn(message: string): void; error(message: string): void } },
) {
    context.logger.info("Starting headless work");
    context.logger.warn("Using fallback data source");
    context.logger.error("Something failed");
}
```

These messages are stored with the job, surfaced in the MCP Server detail pane, and kept bounded so the log history does not grow without limit.

## Agent-Driven Input Flow

Headless execution is fully agent-driven: PPTB never opens a window, picker, or browser sign-in from a tool call. Instead, anything the user still has to provide is returned to the agent in a single `input_required` response.

### Built-in MCP tools

| Tool                            | Purpose                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pptb_list_connections`         | Lists saved connections: `name`, `environment` (`Dev`/`Test`/`UAT`/`Production`), `url`, `authenticationType`, `authStatus`, optional `category`. Optional `environment` filter. Never returns IDs, secrets, or tokens.                                                  |
| `pptb_authenticate_connections` | Authenticates `connectionNames` (max 10). Cached/silent/client-secret/username-password paths run first; `interactive` connections open a browser sign-in on the user's machine. Returns per-connection `status` (`authenticated`, `failed`, `not-found`), never tokens. |

`authStatus` values: `signed-in` (valid cached token), `refreshable` (PPTB can get a token without the user), `sign-in-required` (call `pptb_authenticate_connections`), `incomplete-credentials` (fix the connection in the PPTB app).

Concurrent sign-in requests for the same connection share one browser flow. If a client times out while the user signs in, PPTB still stores the token; call `pptb_list_connections` to confirm `authStatus` before retrying.

### `input_required` response

Returned as an MCP error result (`isError: true`) so clients do not validate it against the tool's `outputSchema` and agents treat it as a correctable step. The text starts with `ACTION REQUIRED (not a failure)`, numbered next steps, then a JSON payload:

```json
{
    "status": "input_required",
    "tool": "compare-solutions",
    "executionMode": "headless",
    "messages": ["Tool 'Compare Solutions' requires at least 2 named connections; received 1.", "Missing required parameter(s): solutionName."],
    "requirements": {
        "connections": {
            "minConnections": 2,
            "maxConnections": 2,
            "slots": [
                { "index": 0, "label": "Primary", "required": true, "assignedConnectionName": "Contoso Dev" },
                { "index": 1, "label": "Secondary", "required": true }
            ],
            "providedConnectionNames": ["Contoso Dev"],
            "unknownConnectionNames": [],
            "availableConnections": [
                { "name": "Contoso Prod", "environment": "Production", "url": "https://prod.crm.dynamics.com", "authenticationType": "interactive", "authStatus": "sign-in-required" }
            ]
        },
        "authentication": {
            "connections": [{ "name": "Contoso Dev", "environment": "Dev", "authenticationType": "interactive", "reason": "Connection 'Contoso Dev' requires interactive sign-in. ..." }]
        },
        "parameters": [{ "name": "solutionName", "type": "string", "title": "Solution", "description": "Unique name of the solution" }]
    },
    "nextSteps": ["..."]
}
```

- `connections` appears when required slots are missing or names are unknown. Headless only; windowed calls let the tool UI pick connections.
- `authentication` lists selected connections that need a browser sign-in (or whose non-interactive authentication failed).
- `parameters` lists missing required `prefill` properties in both execution modes, with `title`/`description`/`enum` from `pptb.config.json`. Object/array parameters include their `schema`. Type errors are still rejected directly.

### Typical agent loop

1. Before invoking a connection-dependent tool for a new task, call `pptb_list_connections`. Always show a connection picker in the agent chat (using the client's user-input/selection UI when available), with each connection's name, environment, and URL. Wait for the user's explicit selection, even when only one connection exists or connections are already signed in. Authentication status must never be used to choose an environment.
2. For only the user-picked connections, skip authentication when `authStatus` is `signed-in`; otherwise call `pptb_authenticate_connections` and wait for success. Multi-connection tools need every selected slot authenticated. If the user cancels or has not made a selection, stop without authenticating or invoking the tool.
3. Invoke the requested tool with only the user-picked names in `__pptb.connectionNames` in slot order, plus the parameter values. If the result is `input_required`, collect the missing inputs without silently choosing a connection.
4. Keep the selection for follow-up calls and retries within the same task. Never probe or iterate through other connections to locate a record, including after an empty result or error. To change environments, show the picker again and wait for a new user selection.
5. Backup only: if the user prefers the PPTB UI, retry with `__pptb.executionMode: "windowed"`.

This workflow is advertised through MCP initialization instructions, connection-dependent tool descriptions and connection-name schemas, the `nextSteps` returned by `pptb_list_connections`, and `input_required` guidance. Chat selection is performed by the MCP client: the server cannot independently verify that a caller-supplied connection name came from a user interaction. Clients must honor this contract; it is not a server-enforced approval boundary.

Tool authors can improve the prompts agents show by adding `title` and `description` to `invocation.prefill` properties.

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
- In the PPTB renderer, the MCP Server page now refreshes live and supports drilling into a selected invocation to inspect the captured job logs, progress, result, and error state.
