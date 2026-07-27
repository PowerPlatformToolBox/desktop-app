# MCP Headless Unattended Execution - Net New Change

## What is New

This change introduces a **headless entry path** for MCP-based tool execution so automation clients can invoke tools without opening Electron windows.

## Why This Exists

Current MCP integration launches windowed tool instances and depends on UI interaction. For unattended automation and CI workflows, that model is not sufficient.

## Net New Components

- `src/cli/index.ts`: Node.js CLI entry for headless operation.
- `src/cli/constants.ts`: CLI defaults and exit codes.
- `src/cli/utils.ts`: argument parsing, env loading, and command helpers.
- `tsconfig.cli.json`: dedicated TypeScript compile target for CLI output.
- `package.json` updates:
    - `bin.pptb-cli` mapped to `dist/cli/index.js`
    - `build:cli` script
    - `build` now compiles CLI artifact after Electron build

## Runtime Behavior (Current Stage)

This initial implementation stage provides the CLI scaffold and build integration. Headless tool execution orchestration and MCP routing extensions are implemented in subsequent phases.

## Target Behavior (Next Stages)

- MCP `call-tool` accepts `executionMode: "headless"`.
- Only tools explicitly declaring `agents.headless: true` are eligible.
- A job-based response model returns `jobId` and status endpoint for polling.
- Authentication supports either caller-provided token (`authToken`) or server-side resolution from saved `connectionName` (no external `connectionId` exposure).

## Headless Runtime Globals

Headless tool entrypoints run in Node.js and should not assume a DOM. The runtime should install a browser-compatible compatibility layer before importing the tool module so existing tool code can still reach PPTB APIs.

This is additive compatibility: it does not replace or deprecate `window.toolboxAPI`, `window.dataverseAPI`, or `window.powerplatformAPI` in the browser-based tool runtime.

The headless loader installs the following globals on `globalThis` — the same names used in the BrowserView preload:

| Global             | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `window`           | Alias for `globalThis` (backwards compatibility)           |
| `toolboxAPI`       | Connections, utils, settings, terminal, events, invocation |
| `dataverseAPI`     | All Dataverse CRUD, FetchXML, metadata, execute            |
| `powerplatformAPI` | Power Platform admin endpoints                             |

Tool authors use the **same identifiers** they already use in windowed mode. No code changes are required in an existing tool if it accesses the APIs via their top-level names.

### Example: Node-safe tool entry

```typescript
export async function invokeHeadless(input: Record<string, unknown>, context: { toolId: string; toolName: string; invocationMode: "one-way" | "two-way" }) {
    // toolboxAPI – connections, utils, settings (same name as window.toolboxAPI)
    const connection = await toolboxAPI.connections.getActiveConnection();

    // dataverseAPI – separate top-level global (same as window.dataverseAPI)
    const result = await dataverseAPI.queryData("accounts?$select=name&$top=3");

    // powerplatformAPI – separate top-level global (same as window.powerplatformAPI)
    const envList = await powerplatformAPI.EnvironmentManagement.Get("environments?api-version=2021-04-01");

    return {
        toolId: context.toolId,
        toolName: context.toolName,
        connectionName: connection?.name ?? null,
        records: result.value ?? [],
        environments: envList,
    };
}
```

### Windowed tool with an opt-in headless entrypoint

A tool that already has a windowed UI can add a dedicated `dist/headless.js` entry with zero changes to its main code:

```typescript
// dist/headless.ts – compiled alongside the normal browser entry
export async function invokeHeadless(input: Record<string, unknown>, context: { toolId: string; toolName: string; invocationMode: "one-way" | "two-way" }) {
    // dataverseAPI and toolboxAPI are available here exactly as in window context
    const accounts = await dataverseAPI.fetchXmlQuery(`
        <fetch top="10"><entity name="account"><attribute name="name"/></entity></fetch>
    `);
    return { accounts: accounts.value };
}
```

Declare the entry in `pptb.config.json`:

```json
{
    "agents": {
        "headless": true,
        "headlessEntry": "dist/headless.js"
    }
}
```

When the tool needs Dataverse or Power Platform access, the MCP caller must include a saved `connectionName` so the runtime can resolve the right connection before the module runs.

## Reused Existing Architecture

The headless implementation is designed to extend (not duplicate) existing architecture:

- Tool discovery and eligibility: `agentToolRegistry`
- Schema alignment: `schemaConverter`
- Invocation audit trail: `agentInvocationLogger`
- MCP protocol entrypoint: `mcpServer`

## Verification Approach

Testing is performed using MCP Inspector:

1. Start headless entry (`pptb-cli serve ...`).
1. Verify tool discovery includes only headless-capable tools when requested.
1. Validate headless invocation success and failure paths.
1. Validate timeout and progress polling contract.

## Compatibility Guarantees

- Existing windowed MCP/tool invocation flow remains unchanged.
- Existing UI-driven and inter-tool invocation behavior is preserved.
- Headless mode is opt-in per tool and does not alter non-headless tools.

## Configs

### Claude Desktop

```json
{
    "mcpServers": {
        "pptb": {
            "command": "npx",
            "args": ["-y", "mcp-remote", "http://127.0.0.1:7339"],
            "env": {
                "MCP_REMOTE_HEADERS": "{\"X-MCP-Auth-Token\":\"YOUR_TOKEN\"}"
            }
        }
    }
}
```
