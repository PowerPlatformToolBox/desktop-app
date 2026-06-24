## Plan: MCP Agentic Tool Invocation in PPTB

Enable reliable MCP-driven invocation for PPTB tools with explicit one-way and two-way contracts, while reusing existing invocation plumbing. The recommended approach is to keep current windowed execution for v1, add explicit invocation mode semantics at the MCP boundary, tighten schema and security validation, and publish a clear tool-author contract plus migration guide.

**Steps**

1. Phase 1: Lock scope and invocation model

- Define supported MCP invocation modes and map to PPTB behavior.
  Mode A: One-way (fire-and-forget) returns immediate accepted response and does not wait for tool return payload.
  Mode B: Two-way (request-response) waits for tool return payload via existing invocation return path.
- Set defaults and compatibility.
  Default to two-way for existing tools.
  If mode is omitted but tool declares no return schema, treat as one-way.
- Declare v1 constraints.
  Keep execution windowed only for now.
  No streaming partial results in v1.
  No parallel nested invocations from a single MCP request in v1.

2. Phase 2: Extend contracts and shared types

- Extend invocation contract in type definitions used by tools and host.
  Add optional mode capabilities in InvocationConfig so each tool can declare allowed agent invocation modes and expected timeout behavior.
- Extend MCP request contract in server code.
  Add invocation metadata fields in MCP tool input envelope (for example mode and optional timeout), while preserving backward compatibility with existing prefill schema.
- Extend schema conversion and registry output.
  Expose mode support and return expectations in MCP tool descriptions and input schema hints so agents can choose one-way vs two-way correctly.

3. Phase 3: Main-process orchestration changes

- Add MCP invocation mode routing in McpServerManager.
  One-way path: validate input, launch tool, return accepted result quickly, log correlation id.
  Two-way path: validate input, launch tool, await returnData result, return structured payload.
- Reuse ToolWindowManager launch-with-context pipeline.
  Pass a normalized invocation context including source mcp, mode, correlation id, caller metadata, and timeout envelope.
- Add timeout and cancellation guardrails.
  Two-way: enforce per-request timeout and deterministic timeout response.
  One-way: optional launch timeout only.
- Add stronger input and output validation.
  Validate MCP input against converted prefill schema before launch.
  For two-way mode, validate return payload against returnTopic before responding.

4. Phase 4: Security, auditability, and policy

- Harden tool eligibility checks.
  Require invocation.agentInvokable true and explicit support for requested mode.
  Reject mode mismatches with actionable errors.
- Expand audit logging.
  Log mode, tool id, correlation id, duration, outcome, schema-validation result, and timeout/cancel reasons.
- Redaction policy.
  Ensure sensitive connection-related fields are redacted from invocation logs and MCP error surfaces.

5. Phase 5: Tool runtime surface and compatibility helpers

- Keep existing tool runtime APIs as primary contract.
  Tools continue to use getLaunchContext and returnData.
- Add optional invocation metadata to launch context.
  Include source, mode, correlation id, requested timeout, and expectsResponse boolean so tools can branch behavior safely.
- Add optional helper semantics.
  If mode is one-way, returnData is optional and ignored for MCP response lifecycle.
  If mode is two-way, returnData remains required for successful completion.

6. Phase 6: Documentation and tool-author rollout

- Update inter-tool and MCP docs with normative behavior.
  Document exact one-way and two-way semantics, error codes, timeout behavior, and compatibility rules.
- Publish tool-author migration guide.
  Provide minimal manifest and runtime changes required per mode, plus test checklist.
- Add validation guidance.
  Extend docs and validator messaging so tool authors get warnings for inconsistent invocation declarations.

7. Phase 7: Verification via MCP Inspector

- External harness.
  Use MCP Inspector to exercise list-tools and call-tool flows instead of adding a repository test runner for this phase.
- Manual checks.
  Verify one-way and two-way behavior, unsupported mode errors, and timeout handling with MCP Inspector.
- Regression checks.
  Existing inter-tool invocation from toolboxAPI remains unchanged.
- Build gates.
  Run typecheck, lint, and build before merge.

**Relevant files**

- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/mcp/mcpServer.ts — add MCP mode routing, timeout handling, validation orchestration, and response shaping.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/mcp/agentToolRegistry.ts — enrich exposed agent tool metadata with supported invocation modes and constraints.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/mcp/schemaConverter.ts — include mode-related schema hints and compatibility mapping.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/mcp/agentInvocationLogger.ts — add correlation-rich, redacted mode-aware logs.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/managers/toolWindowManager.ts — pass normalized invocation context and enforce launch/return lifecycle constraints.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/main/toolPreloadBridge.ts — ensure invocation context metadata reaches tools without breaking existing API.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/src/common/ipc/channels.ts — add any new channel constants only if needed for explicit mode/timeout signaling.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/packages/types/pptbConfig.d.ts — extend InvocationConfig with mode support declarations and optional timeout policy fields.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/packages/types/toolboxAPI.d.ts — document/extend invocation context typing for source and mode metadata.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/docs/INTER_TOOL_INVOCATION.md — add MCP normative section for one-way and two-way.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/docs/IMPLEMENTATION_CHECKLIST.md — add rollout and validation checklist for agentic invocation readiness.
- /Users/danish/SourceCode/GitHub/PowerPlatformToolBox/desktop-app/README.md — link to tool-author guidance and MCP enablement overview.

**Verification**

1. Type and lint gates
   Run pnpm run typecheck and pnpm run lint.
1. Build gate
   Run pnpm run build.
1. MCP discovery verification
   Call MCP list-tools and verify only tools with agentInvokable true appear and mode metadata is present.
1. One-way invocation verification
   Invoke a one-way-enabled tool through MCP, confirm immediate accepted response, confirm tool launch and completion in logs.
1. Two-way invocation verification
   Invoke a two-way-enabled tool through MCP with valid input, confirm returned payload is schema-valid and surfaced to MCP caller.
1. Negative-path verification
   Attempt mode not supported by tool, invalid prefill shape, and timeout scenario; confirm deterministic error codes and redacted logs.
1. Regression verification
   Run an existing tool-to-tool invocation flow from UI to ensure legacy launchTool behavior remains intact.

**Decisions**

- Included scope: MCP-triggered one-way and two-way invocation semantics, schema validation hardening, logging, and tool-author contract updates.
- Excluded scope: headless execution mode, streaming partial responses, generalized workflow orchestration across multiple tools, and non-windowed runtime.
- Compatibility rule: existing tools continue to work without changes; new declaration fields are optional with safe defaults.

**Tool-side changes required**

1. Manifest updates
   Each tool that should be MCP-callable keeps invocation.agentInvokable true and declares supported invocation mode(s) plus accurate prefill and returnTopic schemas.
1. Runtime handling for one-way tools
   Tool reads launch context and performs action without assuming caller waits for return data. returnData may be omitted unless needed for local flow.
1. Runtime handling for two-way tools
   Tool must call returnData with payload matching returnTopic schema before completing user flow.
1. Connection assumptions
   Tools must not assume inherited secondary connection unless declared and selected; handle nulls explicitly.
1. Validation hygiene
   Tool output should remain stable and schema-aligned; avoid returning ad-hoc fields not in returnTopic for two-way flows.
1. UX behavior
   Because v1 is windowed, tools should render minimal actionable UI for agent-driven launches and auto-complete where safe.

**Further Considerations**

1. Decide whether one-way MCP responses should be pure accepted acknowledgements or include lightweight launch metadata such as correlation id and started timestamp. Recommendation: include correlation id for observability.
2. Decide timeout defaults globally vs per-tool override in manifest. Recommendation: global default with optional per-tool override.
3. Decide whether to treat missing returnTopic as implicit one-way eligibility. Recommendation: allow only when tool explicitly declares one-way support to avoid ambiguity.
