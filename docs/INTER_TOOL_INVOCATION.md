# Inter-Tool Invocation

This document covers the **Inter-Tool Invocation** feature of Power Platform ToolBox (PPTB). It is split into two parts:

- **[Part 1 – Callee](#part-1--callee-the-tool-that-accepts-invocations)** – For tool developers whose tool _receives_ a launch request from another tool.
- **[Part 2 – Caller](#part-2--caller-the-tool-that-launches-other-tools)** – For tool developers whose tool _initiates_ a launch request against another tool.

---

## Table of Contents

1. [Overview](#overview)
2. [Part 1 – Callee (the tool that accepts invocations)](#part-1--callee-the-tool-that-accepts-invocations)
    - [1.1 Declaring the invocation contract (`pptb.config.json`)](#11-declaring-the-invocation-contract-pptbconfigjson)
    - [1.2 Reading the launch context](#12-reading-the-launch-context)
    - [1.3 Returning data to the caller](#13-returning-data-to-the-caller)
    - [1.4 Handling standalone vs. invoked modes](#14-handling-standalone-vs-invoked-modes)
    - [1.5 Complete callee example](#15-complete-callee-example)
3. [Part 2 – Caller (the tool that launches other tools)](#part-2--caller-the-tool-that-launches-other-tools)
    - [2.1 Launching a tool with prefill data](#21-launching-a-tool-with-prefill-data)
    - [2.2 Handling the return value](#22-handling-the-return-value)
    - [2.3 Connection overrides](#23-connection-overrides)
    - [2.4 Complete caller example](#24-complete-caller-example)
4. [Lifecycle and Behaviour](#lifecycle-and-behaviour)
5. [Validation and Tooling](#validation-and-tooling)
6. [Troubleshooting](#troubleshooting)

---

## Overview

Inter-Tool Invocation lets one installed PPTB tool **launch another installed tool**, pass structured data to pre-populate its state (_prefill data_), and optionally **receive a result** back when the launched tool finishes.

```
Tool A (Caller)                            Tool B (Callee)
──────────────                             ───────────────
invocation.launchTool(                     invocation.getLaunchContext()
  "@my-org/entity-picker",      ─────►       → { entityName: "account" }
  { entityName: "account" }
)                                          // user picks a record …

        ◄──────────────────────────────    invocation.returnData(
result                                       { selectedId: "a1b2c3",
= { selectedId: "a1b2c3",                    selectedName: "Contoso" }
  selectedName: "Contoso" }               )
```

Key properties of the feature:

- **Promise-based**: `invocation.launchTool()` returns a `Promise` that resolves when the callee calls `returnData()`, or resolves to `null` if the callee closes without returning data.
- **Isolated windows**: the callee opens in its own BrowserView, just like a normally launched tool.
- **Optional contract**: the callee declares the shape of its prefill data and return value in `pptb.config.json`; this is validated by `pptb-validate` but is not enforced at runtime.
- **Graceful degradation**: both the prefill data and the return value are plain JSON objects (`Record<string, unknown>`), so missing fields degrade gracefully.

---

## Part 1 – Callee (the tool that accepts invocations)

### 1.1 Declaring the invocation contract (`pptb.config.json`)

Create a file named `pptb.config.json` in the **root of your tool package** (next to `package.json`). This file declares:

| Field | Required | Description |
|-------|----------|-------------|
| `invocation.version` | **Yes** (when `invocation` is present) | Semantic version of your invocation contract (e.g. `"1.0.0"`). Bump this when the shape of `prefill` or `returnTopic` changes. |
| `invocation.prefill` | No | JSON-schema-style object describing the data a caller can pass in. |
| `invocation.prefill.properties` | No | Map of property names to `{ type?, enum?, items? }` descriptors. |
| `invocation.returnTopic` | No | JSON-schema-style object describing the data your tool returns to its caller. |
| `invocation.returnTopic.properties` | No | Map of property names to `{ type?, enum?, items? }` descriptors. |

**Example `pptb.config.json`:**

```json
{
    "invocation": {
        "version": "1.0.0",
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
    }
}
```

Supported `type` values: `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"`.  
Use `"enum"` to restrict a string property to a fixed set of values.  
Use `"items"` to describe the element type of an array property.

> **Tip:** Run `pptb-validate` in your tool directory to validate both `package.json` and `pptb.config.json` before publishing.

---

### 1.2 Reading the launch context

When your tool starts, call `toolboxAPI.invocation.getLaunchContext()` to find out whether it was launched by another tool and to read the prefill data the caller provided.

```typescript
const ctx = await toolboxAPI.invocation.getLaunchContext();

if (ctx !== null) {
    // Tool was launched via inter-tool invocation
    const entityName = ctx.entityName as string;
    // … use prefill data to set up your UI …
} else {
    // Tool was opened normally by the user
}
```

**Signature:**

```typescript
getLaunchContext(): Promise<Record<string, unknown> | null>
```

- Returns the prefill data object when the tool was invoked by another tool.
- Returns `null` when the tool was opened directly by the user (not via invocation).
- All values are `unknown`; cast or validate them before use.

---

### 1.3 Returning data to the caller

Once the user completes their task (e.g. selects a record, fills a form), call `toolboxAPI.invocation.returnData()` to send the result back to the caller tool.

```typescript
await toolboxAPI.invocation.returnData({
    selectedId: "a1b2c3d4-...",
    selectedName: "Contoso Ltd.",
});
```

**Signature:**

```typescript
returnData(returnData: Record<string, unknown>): Promise<void>
```

- Resolves the `Promise` that the caller is awaiting in `invocation.launchTool()`.
- If the tool was **not** launched by another tool, this call is a **no-op** – it is safe to call unconditionally.
- After calling `returnData`, it is your tool's responsibility to close its own window or update its UI as appropriate.

---

### 1.4 Handling standalone vs. invoked modes

A well-behaved callee works in both modes:

| Mode | `getLaunchContext()` returns | Expected behaviour |
|------|-----------------------------|--------------------|
| Standalone (normal launch) | `null` | Show full UI, no pre-populated state |
| Invoked by another tool | `Record<string, unknown>` | Pre-populate UI from the context, show a "confirm / return" action |

```typescript
async function initTool() {
    const ctx = await toolboxAPI.invocation.getLaunchContext();

    if (ctx) {
        // Invoked mode: pre-fill and show a compact picker UI
        renderPickerUI({
            entityName: ctx.entityName as string,
            allowMultiSelect: (ctx.allowMultiSelect as boolean) ?? false,
            onConfirm: async (selection) => {
                await toolboxAPI.invocation.returnData(selection);
            },
        });
    } else {
        // Standalone mode: show the full explorer UI
        renderFullExplorerUI();
    }
}
```

---

### 1.5 Complete callee example

The following is a minimal but complete callee implementation for an entity-picker tool.

**`pptb.config.json`**

```json
{
    "invocation": {
        "version": "1.0.0",
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
    }
}
```

**`index.ts`**

```typescript
async function main() {
    const ctx = await toolboxAPI.invocation.getLaunchContext();

    if (ctx) {
        // Invoked by another tool – show a targeted picker
        const entityName = (ctx.entityName as string) ?? "account";
        const records = await loadRecords(entityName);

        renderPicker(records, async (selected) => {
            // Send the selection back and let the caller handle closing / next steps
            await toolboxAPI.invocation.returnData({
                selectedId: selected.id,
                selectedName: selected.name,
            });
        });
    } else {
        // Standalone – show the full entity browser
        renderFullBrowser();
    }
}

main();
```

---

## Part 2 – Caller (the tool that launches other tools)

### 2.1 Launching a tool with prefill data

Use `toolboxAPI.invocation.launchTool()` to open another installed tool and pass it prefill data.

```typescript
const result = await toolboxAPI.invocation.launchTool(
    "@my-org/entity-picker",           // npm package name of the target tool
    { entityName: "account" },         // prefill data (must match callee's prefill schema)
);
```

**Signature:**

```typescript
launchTool(
    targetToolId: string,
    prefillData?: Record<string, unknown>,
    options?: {
        primaryConnectionId?: string | null;
        secondaryConnectionId?: string | null;
    },
): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `targetToolId` | `string` | The npm package name of the tool to launch (e.g. `"@my-org/entity-picker"`). Must be installed. |
| `prefillData` | `Record<string, unknown>` | Optional data to pre-populate the callee's state. Shape should match the callee's `invocation.prefill` schema. |
| `options.primaryConnectionId` | `string | null` | Override the primary Dataverse connection for the callee. |
| `options.secondaryConnectionId` | `string | null` | Override the secondary Dataverse connection for the callee. |

**Return value:** A `Promise` that resolves with the `Record<string, unknown>` passed to `returnData()` by the callee, or `null` if the callee closes without returning data.

> **Important:** The target tool must be **installed** in PPTB. If the tool is not found, `launchTool` throws an error.

---

### 2.2 Handling the return value

```typescript
const result = await toolboxAPI.invocation.launchTool(
    "@my-org/entity-picker",
    { entityName: "contact" },
);

if (result !== null) {
    const { selectedId, selectedName } = result as { selectedId: string; selectedName: string };
    // Use the selection returned by the callee
    populateField("regardingobjectid", selectedId, selectedName);
} else {
    // User closed the picker without making a selection – no change needed
}
```

Always check for `null` before using the result. The `Promise` resolves to `null` in two scenarios:

1. The user closes the callee tool window without calling `returnData`.
2. The callee explicitly calls `returnData({})` with an empty object (treat as cancelled if you expect specific fields).

---

### 2.3 Connection overrides

By default, the callee inherits no connection from the caller. Pass `options.primaryConnectionId` or `options.secondaryConnectionId` to forward a specific Dataverse connection:

```typescript
const connections = await toolboxAPI.connections.getActiveConnection();

const result = await toolboxAPI.invocation.launchTool(
    "@my-org/solution-importer",
    { solutionName: "MySolution" },
    { primaryConnectionId: connections?.id ?? null },
);
```

---

### 2.4 Complete caller example

```typescript
async function openEntityPicker(entityName: string) {
    let result: unknown;

    try {
        result = await toolboxAPI.invocation.launchTool(
            "@my-org/entity-picker",
            { entityName, allowMultiSelect: false },
        );
    } catch (err) {
        // Tool not installed or launch failed
        await toolboxAPI.utils.showNotification({
            title: "Cannot open picker",
            body: err instanceof Error ? err.message : String(err),
            type: "error",
        });
        return;
    }

    if (result === null) {
        // User dismissed the picker
        return;
    }

    const { selectedId, selectedName } = result as { selectedId: string; selectedName: string };
    setSelectedRecord(selectedId, selectedName);
}
```

---

## Lifecycle and Behaviour

Understanding the full lifecycle helps when reasoning about edge cases:

```
Caller tool calls invocation.launchTool(...)
        │
        ▼
PPTB main process creates a new BrowserView for the callee
        │
        ▼
Callee loads, receives toolContext with:
  • toolId, instanceId
  • callerInstanceId  ← present only for invocations
  • prefillData       ← the object passed by the caller
        │
        ▼
Callee calls getLaunchContext()  →  returns prefillData
        │
        ▼ (user interacts with callee UI)
        │
    ┌───┴────────────────────────┐
    │                            │
    ▼                            ▼
Callee calls returnData(...)  Callee window is closed
    │                            │
    ▼                            ▼
PPTB sends result to caller   PPTB sends null to caller
    │                            │
    └───────────────┬────────────┘
                    │
                    ▼
    Caller's Promise resolves  (returnData value OR null)
```

**Key points:**

- The callee opens in its **own window** (BrowserView) and is visible as a separate tab in the PPTB tool panel.
- The caller's `launchTool()` Promise **never rejects** under normal operation – it always resolves (possibly with `null`). Rejections only occur if the target tool is not installed or if the launch itself fails due to a system error.
- It is the callee's responsibility to **close its own window** after calling `returnData`, if appropriate for the UX. PPTB does not close the callee automatically.
- A callee that never calls `returnData` will keep the caller's Promise pending until the callee window is closed by the user.

---

## Validation and Tooling

### `pptb-validate`

Run `pptb-validate` from your tool directory to validate both `package.json` and `pptb.config.json`:

```bash
npx pptb-validate
# or, if you have the @pptb/types package installed locally:
./node_modules/.bin/pptb-validate
```

The validator checks:

- `invocation.version` is present and a valid semver string.
- `invocation.prefill.properties` values are valid JSON-schema property descriptors.
- `invocation.returnTopic.properties` values are valid JSON-schema property descriptors.

### TypeScript types

The `@pptb/types` package ships type definitions for the entire invocation API:

```typescript
// The three methods live on toolboxAPI.invocation
toolboxAPI.invocation.getLaunchContext()   // Promise<Record<string, unknown> | null>
toolboxAPI.invocation.returnData(data)     // Promise<void>
toolboxAPI.invocation.launchTool(...)      // Promise<unknown>
```

For the shape of `pptb.config.json`, import from the bundled declaration file:

```typescript
import type { PPTBConfig, InvocationConfig } from "@pptb/types/pptbConfig";
```

---

## Troubleshooting

### `launchTool` throws "Tool not found"

The target tool is not installed. Ask the user to install it from the PPTB Marketplace, or check that the `targetToolId` matches the exact npm package name (`name` field in the tool's `package.json`).

### `getLaunchContext()` returns `null` when expecting prefill data

The tool was opened by the user directly rather than via `launchTool`. Ensure the caller is using `toolboxAPI.invocation.launchTool()` and not the standard tool launch mechanism.

### Caller `Promise` resolves with `null` unexpectedly

The callee window was closed by the user (or programmatically) before `returnData()` was called. This is by design – always handle the `null` case in the caller.

### Changes to `pptb.config.json` are not picked up

Restart the tool or reload it in PPTB. The config file is read at install/load time; changes during development require a reload.

### `returnData` appears to do nothing

Confirm that `getLaunchContext()` returned a non-null value first. If `getLaunchContext()` returns `null`, `returnData` is a no-op because the tool was not launched by another tool.

---

## References

- [`packages/toolboxAPI.d.ts`](../packages/toolboxAPI.d.ts) – Full TypeScript type definitions for the invocation API (`InvocationAPI` interface)
- [`packages/pptbConfig.d.ts`](../packages/pptbConfig.d.ts) – Type definitions for `pptb.config.json` (`PPTBConfig`, `InvocationConfig`)
- [`packages/README.md`](../packages/README.md) – Developer guide for the `@pptb/types` package, including the API reference
- [`src/main/managers/toolWindowManager.ts`](../src/main/managers/toolWindowManager.ts) – Host-side implementation (`launchToolWithContext`, `resolveInvocation`)
- [`src/main/toolPreloadBridge.ts`](../src/main/toolPreloadBridge.ts) – Preload-side implementation of the `invocation` namespace
