## Plan: Fully Unattended MCP Tool Execution (Headless Entry)

This plan adds a pure Node.js headless execution path for MCP-driven tool calls, while reusing the existing MCP and invocation architecture and avoiding duplicate runtime pathways.

### Scope

- Add a CLI/headless entrypoint that runs without Electron UI.
- Add a headless execution mode to MCP call flow.
- Require explicit tool opt-in using `invocation.headless: true` in `pptb.config.json`.
- Reuse existing registry, schema conversion, connection/auth, and invocation logging where possible.
- Validate using MCP Inspector.

### Non-Goals

- No automatic conversion of UI tools to headless execution.
- No replacement of existing windowed invocation behavior.
- No streaming transport in v1 (polling only for long-running jobs).

### Phase 1: CLI Foundation

1. Create `src/cli/index.ts`, `src/cli/constants.ts`, `src/cli/utils.ts`.
1. Add `bin` entry in `package.json` for `pptb-cli`.
1. Add dedicated build target (`tsconfig.cli.json`) and compile `dist/cli/index.js`.
1. Keep implementation minimal and safe until headless manager is introduced.

### Phase 2: MCP Protocol Extension

1. Extend MCP request envelope with `executionMode: "headless"`.
1. Keep existing default behavior as `windowed` for backward compatibility.
1. Define response model for async job-based execution (`jobId`, `statusUrl`, `status`).

### Phase 3: Headless Invocation Runtime

1. Add `headlessToolInvocationManager` to run and track headless jobs.
1. Enforce opt-in: only tools with `invocation.headless: true` are callable in headless mode.
1. Add deterministic timeout handling and status transitions.

### Phase 4: Auth and Connection Strategy

1. Do not expose `connectionId` externally.
1. Accept caller-provided auth token in MCP request metadata/body or connection name that is created in PPTB.
1. If auth token is provided, inject token into a constrained headless tool API surface.
1. If connection name is provided, authenticate using existing connection and inject token into headless tool API surface.

### Phase 5: Progress and Status

1. Implement polling endpoint for long-running executions.
1. Return progress metadata and final result via status endpoint.
1. Keep transport stateless and MCP Inspector-friendly.

### Phase 6: Documentation

1. Update `docs/MCP_IMPLEMENTATION.md` with headless request/response contract.
1. Add dedicated net-new doc under `docs/` describing architecture changes.
1. Add author guidance for implementing `invokeHeadless(...)` in tools.

### Phase 7: Validation (Manual validation)

1. Start headless server via CLI.
1. Validate `list-tools` includes headless-eligible tools only.
1. Validate `call-tool` with `executionMode=headless`.
1. Validate status polling, timeout, and error paths.
1. Confirm existing windowed mode remains unchanged.

### Reuse Map (No Duplication)

- Reuse: `src/main/mcp/agentToolRegistry.ts` for tool discovery.
- Reuse: `src/main/mcp/schemaConverter.ts` for schema consistency.
- Reuse: `src/main/mcp/agentInvocationLogger.ts` for audit trail.
- Reuse: `src/main/mcp/mcpServer.ts` as primary request router (extended, not duplicated).
- Reuse: existing invocation metadata patterns and correlation IDs.

### Deliverables

- CLI/headless bootstrap scaffold.
- Headless execution manager.
- MCP protocol extension for headless mode.
- Polling endpoint for progress and results.
- Net-new implementation documentation.
- Manual verification checklist for MCP Inspector.
