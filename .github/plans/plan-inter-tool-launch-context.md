# Plan: Inter-Tool Launch Context

## Request summary

Enable tools to programmatically launch other installed tools, pass typed "prefill" data into them,
and receive a return value when the callee finishes.  The feature follows the VS Code Extension Host
pattern already used for tool isolation, routing all communication through the Electron IPC bridge
so no tool ever has direct access to another tool's process.

## Goals

- Tool A can call `toolboxAPI.invocation.launchTool(targetToolId, prefillData?)` and receive back
  whatever data the callee returns.
- Tool B reads caller-supplied data via `toolboxAPI.invocation.getLaunchContext()` and signals
  completion via `toolboxAPI.invocation.returnData(result)`.
- If Tool B is closed before calling `returnData`, the caller receives `null` (no hang).
- Tools declare their invocation contract in an optional `pptb.config.json` (validated by
  `pptb-validate` CLI) so callers know exactly what shape of data to pass and expect back.
- The existing `launchTool()` renderer entry-point is extended non-breakingly (new optional fields).

## Non-goals

- Cross-instance communication outside the launch/return lifecycle (use the Events API for that).
- Auto-closing the callee after `returnData` (the callee manages its own lifecycle).
- Schema-level runtime type checking of `prefillData` / `returnData` at IPC boundaries.

## Assumptions / Open questions

- Tools must be already installed; `launchTool` in the preload bridge looks up the tool manifest via
  the existing `TOOL_CHANNELS.GET_TOOL` IPC channel.
- `callerInstanceId` is derived from the calling tool's own `toolContext.instanceId`; it is always
  set when `toolboxAPI.invocation.launchTool` is called from a tool window.
- Connection IDs for the callee default to `null` when not supplied; the caller can override them
  via `options.primaryConnectionId` / `options.secondaryConnectionId`.

## Acceptance criteria

- [ ] `toolboxAPI.invocation.launchTool("@scope/tool", { key: "value" })` opens the target tool,
      passes the data, and returns the data supplied by `returnData()`.
- [ ] If the callee is closed without calling `returnData`, the caller's Promise resolves with `null`.
- [ ] `toolboxAPI.invocation.getLaunchContext()` returns `null` when no inter-tool context is
      present (standalone tool launch).
- [ ] `toolboxAPI.invocation.returnData({...})` is a no-op when the tool was not launched by another
      tool.
- [ ] `pptb-validate` validates `pptb.config.json` when present alongside `package.json`.
- [ ] `InvocationAPI` is exported from `packages/toolboxAPI.d.ts` with full JSDoc.
- [ ] `packages/README.md` has caller/callee examples and an API reference entry.
- [ ] `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass with 0 errors.

## Triage

Type: **High-risk**

Rationale:

- Changes span IPC channels (new handlers), the preload bridge (new surface exposed to tool
  windows), and the main-process ToolWindowManager (new Promise-based invocation lifecycle).
- Any mistake in the preload bridge or IPC handler could expose unintended cross-tool data access.

## Participants (mesh)

- Product Manager (gateway)
- Data Architect (IPC schema, types)
- Tech Designer (preload bridge, ToolWindowManager lifecycle)
- App Developer (implementation)
- Code Reviewer
- Security Reviewer

## Plan (drafted by agents)

### Product Manager (Orchestrator)

- Scope confirmed: 7 implementation parts, high-risk triage, requires explicit APPROVED before coding.
- Acceptance criteria locked above.

### Data Architect

**Part 1 — `pptb.config.json` schema & validation**
- Add `packages/pptbConfig.d.ts` — TypeScript types for `PPTBConfig`, `InvocationConfig`,
  `JsonSchemaObject` and `JsonSchemaProperty`.
- Update `packages/lib/validate.js` — add `validatePPTBConfig(config)` function that checks:
  - `invocation.version` is required and must be a valid semver string.
  - `invocation.prefill` (optional) must be a `JsonSchemaObject` with valid `properties`.
  - `invocation.returnTopic` (optional) must be a `JsonSchemaObject` with valid `properties`.
  - Unknown root keys emit warnings (not errors).
- Update `packages/bin/pptb-validate.js` — auto-discover `pptb.config.json` in the same directory
  as `package.json` and call `validatePPTBConfig` when found; report results in the same
  human-readable / `--json` output format.

**Part 2 — IPC Channels**
- Add to `TOOL_WINDOW_CHANNELS` in `src/common/ipc/channels.ts`:
  - `LAUNCH_WITH_CONTEXT: "tool-window:launch-with-context"`
  - `RETURN_INVOCATION_DATA: "tool-window:return-invocation-data"`

### Tech Designer

**Part 3 — Main Process: ToolWindowManager**

New private field:
```ts
private pendingInvocations: Map<
    string, // calleeInstanceId
    {
        callerInstanceId: string;
        prefillData: Record<string, unknown>;
        resolve: (data: unknown) => void;
        reject: (reason: unknown) => void;
    }
> = new Map();
```

New / updated methods in `src/main/managers/toolWindowManager.ts`:

- `launchTool(instanceId, tool, primaryConnectionId, secondaryConnectionId, prefillData?)` —
  optional 5th parameter; when `pendingInvocations` has an entry for `instanceId` the context
  message (`toolbox:context`) includes `callerInstanceId` and `prefillData`.
- `launchToolWithContext(callerInstanceId, calleeInstanceId, tool, primaryConnectionId,
  secondaryConnectionId, prefillData)` — stores pending invocation entry then delegates to
  `launchTool`; returns a Promise resolved by `resolveInvocation`.
- `resolveInvocation(calleeInstanceId, returnData)` — pops the pending entry, sends
  `toolbox:invocation-result` IPC push to the caller BrowserView (if still alive), resolves the
  Promise.
- `closeTool(instanceId)` — if a pending invocation exists for this instance, resolve it with
  `null` and send `toolbox:invocation-result` to the caller (prevents hang).

IPC handlers to add in `setupIpcHandlers()` / `removeIpcHandlers()` / `destroy()`:
- `LAUNCH_WITH_CONTEXT` → `launchToolWithContext(...)`
- `RETURN_INVOCATION_DATA` → `resolveInvocation(...)`

**Part 4 — Tool Preload Bridge**

Import `TOOL_CHANNELS` and `TOOL_WINDOW_CHANNELS` in `src/main/toolPreloadBridge.ts`.

New `toolboxAPI.invocation` namespace exposed via `contextBridge.exposeInMainWorld`:

```ts
invocation: {
    getLaunchContext(): Promise<Record<string, unknown> | null>
    returnData(returnData: Record<string, unknown>): Promise<void>
    launchTool(
        targetToolId: string,
        prefillData?: Record<string, unknown>,
        options?: { primaryConnectionId?: string | null; secondaryConnectionId?: string | null }
    ): Promise<unknown>
}
```

- `getLaunchContext` reads `toolContext.prefillData`; returns `null` when the field is absent,
  `null`, `undefined`, or not a plain object.  Uses explicit `=== null || === undefined` guard
  (not truthiness check) to correctly handle empty-object `{}` prefill data.
- `returnData` invokes `RETURN_INVOCATION_DATA` with the caller's `instanceId` and the payload.
- `launchTool` fetches the target tool manifest via `TOOL_CHANNELS.GET_TOOL`, generates a callee
  `instanceId` with `targetToolId-Date.now()-randomSuffix`, then calls `LAUNCH_WITH_CONTEXT`.

**Part 5 — Renderer**

`src/renderer/modules/toolManagement.ts`:
- Extend `LaunchToolOptions` with two new optional fields:
  - `prefillData?: Record<string, unknown>`
  - `callerInstanceId?: string`
- In `launchTool()`, when `options.callerInstanceId` is set call
  `window.toolboxAPI.launchToolWithContext(callerInstanceId, instanceId, tool,
  primaryConnectionId, secondaryConnectionId ?? null, options.prefillData ?? {})` instead of the
  standard `launchToolWindow` path.

`src/main/preload.ts`:
- Expose `launchToolWithContext(callerInstanceId, calleeInstanceId, tool, primaryConnectionId,
  secondaryConnectionId, prefillData)` → `ipcRenderer.invoke(LAUNCH_WITH_CONTEXT, ...)`.

`src/common/types/api.ts`:
- Add `launchToolWithContext(...)` to the renderer `ToolboxAPI` type.

### App Developer

*(see Execution log below)*

### Critic

- Empty-object `{}` prefill data must not be rejected by `getLaunchContext` — use explicit
  `=== null || === undefined` guard, not `!prefillData`.
- Extra blank lines between method definitions in `toolWindowManager.ts` should match the
  surrounding code style.
- `.DS_Store` must remain in `.gitignore`.

## Checkpoint

Status: **APPROVED**

- [x] Scope and acceptance criteria confirmed
- [x] Critic reviewed
- [x] User approved plan (required for high-risk)

---

## Execution log (only after GO/APPROVED)

### App Developer

**Part 1 — pptb.config.json schema & validation**

- `packages/pptbConfig.d.ts` — created; exports `JsonSchemaProperty`, `JsonSchemaObject`,
  `InvocationConfig`, `PPTBConfig`.
- `packages/lib/validate.js` — `validatePPTBConfig(config)` added; validates `invocation.version`
  (semver), `prefill` and `returnTopic` (JSON-schema objects).
- `packages/bin/pptb-validate.js` — auto-discovers `pptb.config.json` alongside `package.json`;
  calls `validatePPTBConfig`; results included in human-readable and `--json` output.

**Part 2 — IPC Channels**

- `src/common/ipc/channels.ts` — `LAUNCH_WITH_CONTEXT` and `RETURN_INVOCATION_DATA` added to
  `TOOL_WINDOW_CHANNELS`.

**Part 3 — ToolWindowManager**

- `pendingInvocations` private map added.
- `launchTool` signature extended with optional `prefillData` param; tool context message includes
  `callerInstanceId` + `prefillData` when a pending invocation exists.
- `launchToolWithContext` method added (stores pending entry, delegates to `launchTool`, returns
  Promise).
- `resolveInvocation` method added (pops pending entry, pushes `toolbox:invocation-result` to
  caller BrowserView, resolves Promise).
- `closeTool` extended: if a pending invocation exists for the closing instance, resolve its
  Promise with `null` and notify the caller BrowserView.
- `setupIpcHandlers` / `removeIpcHandlers` / `destroy` updated for both new channels.

**Part 4 — Tool Preload Bridge**

- `src/main/toolPreloadBridge.ts` imports `TOOL_CHANNELS` and `TOOL_WINDOW_CHANNELS`.
- `toolboxAPI.invocation` namespace added: `getLaunchContext`, `returnData`, `launchTool`.
- `getLaunchContext` uses explicit `=== null || === undefined` guard (Critic fix applied).

**Part 5 — Renderer**

- `LaunchToolOptions` extended with `prefillData` and `callerInstanceId`.
- `launchTool()` routes through `launchToolWithContext` when `callerInstanceId` is present.
- `preload.ts` exposes `launchToolWithContext` method.
- `src/common/types/api.ts` — `launchToolWithContext` added to renderer API type.

**Part 6 — Public type definitions**

- `packages/toolboxAPI.d.ts` — `InvocationAPI` interface added with full JSDoc including
  caller/callee usage examples; `API` interface updated to include `invocation: InvocationAPI`.

**Part 7 — Documentation**

- `packages/README.md` — new **Inter-Tool Invocation** section added (table of contents,
  caller/callee examples, `pptb.config.json` contract guidance); **Invocation** entry added to
  the API Reference section.

### Code Reviewer

- Issue: `!prefillData` truthiness check rejects valid empty-object `{}`.
  Fix: changed to `prefillData === null || prefillData === undefined`.
- Issue: extra blank line between `resolveInvocation` and `switchToTool` method definitions.
  Fix: blank line removed.
- Issue: `.DS_Store` removed from `.gitignore` (pre-existing regression on the branch).
  Fix: entry restored.
- All other review comments: no further issues raised.

### Security Reviewer

- CodeQL scan: 0 alerts.
- No new attack surface introduced: `prefillData` and `returnData` are plain JSON objects
  serialised over Electron's existing IPC bridge; no new Node.js APIs are exposed to tool windows.

---

## Files changed

| File | Change |
|------|--------|
| `src/common/ipc/channels.ts` | Add `LAUNCH_WITH_CONTEXT`, `RETURN_INVOCATION_DATA` to `TOOL_WINDOW_CHANNELS` |
| `src/main/managers/toolWindowManager.ts` | `pendingInvocations` map; `launchToolWithContext`; `resolveInvocation`; `launchTool` prefill param; `closeTool` null-resolve on close |
| `src/main/toolPreloadBridge.ts` | `toolboxAPI.invocation` namespace; import `TOOL_CHANNELS`, `TOOL_WINDOW_CHANNELS` |
| `src/main/preload.ts` | Expose `launchToolWithContext` to renderer |
| `src/renderer/modules/toolManagement.ts` | Extend `LaunchToolOptions`; route through `launchToolWithContext` |
| `src/common/types/api.ts` | Add `launchToolWithContext` to renderer API type |
| `packages/toolboxAPI.d.ts` | Add `InvocationAPI` interface; update `API` interface |
| `packages/README.md` | Inter-tool invocation section + API reference entry |
| `packages/pptbConfig.d.ts` | New file — TypeScript types for `pptb.config.json` |
| `packages/lib/validate.js` | `validatePPTBConfig` function |
| `packages/bin/pptb-validate.js` | Auto-discover and validate `pptb.config.json` |
| `.gitignore` | Restored `.DS_Store` entry |

## Validation steps

- `pnpm run typecheck` — 0 errors ✅
- `pnpm run lint` — 0 errors ✅
- `pnpm run build` — succeeds ✅
- CodeQL Security Scan — 0 alerts ✅

## Risks & rollback

- **IPC handler conflicts**: new channels are added to both `setupIpcHandlers`/`removeIpcHandlers`
  and `destroy`; duplicate-registration risk is mitigated by always calling `removeHandler` before
  `handle`.
- **Hanging caller Promise**: mitigated by the `closeTool` null-resolve path.
- **Prefill data size**: no size limit is enforced at IPC level; very large objects could slow IPC.
  Mitigated by documenting that `prefillData` should contain identifiers/configs, not large
  payloads.
- **Rollback**: all changes are additive (new channels, new methods, new API namespace).  The
  existing `LAUNCH` channel and `launchToolWindow` path are untouched.  Reverting this PR requires
  only removing the new symbols; no migration is needed.
