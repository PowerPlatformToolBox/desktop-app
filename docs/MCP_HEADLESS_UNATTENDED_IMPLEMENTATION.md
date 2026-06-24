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
- Only tools explicitly declaring `invocation.headless: true` are eligible.
- A job-based response model returns `jobId` and status endpoint for polling.
- Authentication token is supplied by MCP client request metadata/body (no external `connectionId` exposure).

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
