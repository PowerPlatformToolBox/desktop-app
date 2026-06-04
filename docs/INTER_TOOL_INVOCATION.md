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
    - [2.3 Connection auto-inheritance and overrides](#23-connection-auto-inheritance-and-overrides)
    - [2.4 Tag-based capability discovery](#24-tag-based-capability-discovery)
    - [2.5 Complete caller example](#25-complete-caller-example)
4. [End-to-End Scenario: FXS "Send To" Flyout](#end-to-end-scenario-fxs-send-to-flyout)
5. [Lifecycle and Behaviour](#lifecycle-and-behaviour)
6. [Validation and Tooling](#validation-and-tooling)
7. [Troubleshooting](#troubleshooting)

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
                                           ← PPTB auto-closes callee window
```

Key properties of the feature:

- **Promise-based**: `invocation.launchTool()` returns a `Promise` that resolves when the callee calls `returnData()`, or resolves to `null` if the callee closes without returning data.
- **Isolated windows**: the callee opens in its own BrowserView, just like a normally launched tool.
- **Auto-close callee**: after the callee calls `returnData()`, PPTB **automatically closes the callee window** — the callee does not need to close itself.
- **Connection auto-inheritance**: the callee automatically inherits the caller's active FXS connection (can be overridden via `options`).
- **One-at-a-time**: only one active callee per caller is supported in this phase. A second `launchTool` call while a callee is active rejects with `"A callee invocation is already in progress"`.
- **Optional contract**: the callee declares the shape of its prefill data and return value in `pptb.config.json`; this is validated by `pptb-validate` but is not enforced at runtime.
- **Tag-based capability discovery**: callee tools declare capability tags; caller tools can discover matching installed tools by tag.
- **Shell-level "Return to Caller" banner**: PPTB injects a dismissable banner in the callee window so the user can return to the caller at any time — even before `returnData` is called.
- **Graceful degradation**: both the prefill data and the return value are plain JSON objects (`Record<string, unknown>`), so missing fields degrade gracefully.

---

## Part 1 – Callee (the tool that accepts invocations)

### 1.1 Declaring the invocation contract (`pptb.config.json`)

Create a file named `pptb.config.json` in the **root of your tool package** (next to `package.json`). This file declares:

| Field | Required | Description |
|-------|----------|-------------|
| `invocation.version` | **Yes** (when `invocation` is present) | Semantic version of your invocation contract (e.g. `"1.0.0"`). Bump this when the shape of `prefill` or `returnTopic` changes. |
| `invocation.capabilities` | No | Array of capability tag strings (e.g. `["entity-picker"]`). Used by callers to discover this tool. |
| `invocation.prefill` | No | JSON-schema-style object describing the data a caller can pass in. |
| `invocation.prefill.properties` | No | Map of property names to `{ type?, enum?, items? }` descriptors. |
| `invocation.returnTopic` | No | JSON-schema-style object describing the data your tool returns to its caller. |
| `invocation.returnTopic.properties` | No | Map of property names to `{ type?, enum?, items? }` descriptors. |

**Example `pptb.config.json`:**

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
// PPTB automatically closes this window after delivering the result.
```

**Signature:**

```typescript
returnData(returnData: Record<string, unknown>): Promise<void>
```

- Resolves the `Promise` that the caller is awaiting in `invocation.launchTool()`.
- **PPTB automatically closes the callee window** after the result has been delivered to the caller — the callee does **not** need to close itself.
- If the tool was **not** launched by another tool, this call is a **no-op** – it is safe to call unconditionally.

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
                // PPTB will auto-close this window after returnData completes
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
            // Send the selection back; PPTB auto-closes this window
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
        noReturn?: boolean;
    },
): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `targetToolId` | `string` | The npm package name of the tool to launch (e.g. `"@my-org/entity-picker"`). Must be installed. |
| `prefillData` | `Record<string, unknown>` | Optional data to pre-populate the callee's state. Shape should match the callee's `invocation.prefill` schema. |
| `options.primaryConnectionId` | `string \| null` | Override the primary Dataverse connection for the callee. Omit to auto-inherit the caller's active FXS connection. |
| `options.secondaryConnectionId` | `string \| null` | Override the secondary Dataverse connection for the callee. Omit to let PPTB prompt for it when the callee is a multi-connection tool. |
| `options.noReturn` | `boolean` | When `true`, signals that the caller does not expect the callee to return data. The "Return to [Caller]" banner is suppressed entirely for the callee. The invocation lifecycle is otherwise identical — the Promise still resolves with `null` when the callee closes. |

**Return value:** A `Promise` that resolves with the `Record<string, unknown>` passed to `returnData()` by the callee, or `null` if:
- the callee closes without calling `returnData`, or
- the user clicks the "Return to [this tool]" banner before the callee calls `returnData`.

> **Important:** Only one callee per caller is active at a time. Calling `launchTool` a second time while a callee is still active throws `"A callee invocation is already in progress"`.

> **Important:** The target tool must be **installed** in PPTB. If the tool is not found, `launchTool` throws an error.

> **Multi-connection auto-prompt:** If the callee tool declares `features.multiConnection: "required"` or `"optional"` in its manifest and no `options.secondaryConnectionId` is provided, PPTB automatically opens the multi-connection selector before launching the callee. If the user cancels the selector, `launchTool` throws `"Connection selection cancelled"`.

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
    // User dismissed the picker without selecting – no change needed
}
```

Always check for `null` before using the result. The `Promise` resolves to `null` in two scenarios:

1. The user closes the callee tool window without calling `returnData`.
2. The user clicks the **"Return to [CallerTool]"** banner before the callee calls `returnData`.

---

### 2.3 Connection auto-inheritance and overrides

By default, the callee **automatically inherits the caller's active FXS connection**. No additional configuration is needed:

```typescript
// Callee receives the same primary connection as this tool automatically
const result = await toolboxAPI.invocation.launchTool(
    "@my-org/entity-picker",
    { entityName: "account" },
);
```

To override with a specific connection, pass `options.primaryConnectionId`:

```typescript
const result = await toolboxAPI.invocation.launchTool(
    "@my-org/solution-importer",
    { solutionName: "MySolution" },
    { primaryConnectionId: specificConnectionId },
);
```

Pass `null` to launch the callee with no connection:

```typescript
const result = await toolboxAPI.invocation.launchTool(
    "@my-org/entity-picker",
    {},
    { primaryConnectionId: null },
);
```

---

### 2.4 Tag-based capability discovery

Discover installed tools that support a given capability by querying their declared `capabilities` tags:

```typescript
const pickers = await toolboxAPI.invocation.findToolsByCapability("entity-picker");
// pickers: Tool[] — all installed tools with "entity-picker" in their capabilities

if (pickers.length > 0) {
    const picker = pickers[0] as { id: string };
    const result = await toolboxAPI.invocation.launchTool(picker.id, { entityName: "account" });
}
```

**Signature:**

```typescript
findToolsByCapability(tag: string): Promise<unknown[]>
```

Returns an array of matching installed `Tool` objects (empty array if none found).

---

### 2.5 Complete caller example

```typescript
async function openEntityPicker(entityName: string) {
    let result: unknown;

    try {
        result = await toolboxAPI.invocation.launchTool(
            "@my-org/entity-picker",
            { entityName, allowMultiSelect: false },
            // primaryConnectionId omitted → callee inherits this tool's FXS connection
        );
    } catch (err) {
        // Tool not installed, already has an active callee, or launch failed
        await toolboxAPI.utils.showNotification({
            title: "Cannot open picker",
            body: err instanceof Error ? err.message : String(err),
            type: "error",
        });
        return;
    }

    if (result === null) {
        // User dismissed the picker (closed window or clicked "Return to Caller" banner)
        return;
    }

    const { selectedId, selectedName } = result as { selectedId: string; selectedName: string };
    setSelectedRecord(selectedId, selectedName);
}
```

---

## End-to-End Scenario: FXS "Send To" Flyout

This section illustrates a concrete real-world scenario where **FetchXML Studio (FXS)** exposes a "Send To ▾" flyout button that lets users push the current FetchXML query directly into another installed tool — such as **DRB** (DataRows Builder) or **DMS** (DataMigration Studio) — without expecting a return value.

### Scenario summary

| Step | What happens |
|------|--------------|
| 1 | User composes a FetchXML query in FXS. |
| 2 | User clicks the **"Send To ▾"** flyout button in FXS. |
| 3 | PPTB queries all installed tools that declare the `"fetchxml"` capability — both DRB and DMS qualify. The flyout lists them as options. |
| 4 | User selects **DMS**. |
| 5 | PPTB opens DMS, inheriting FXS's active Dataverse connection as the primary connection. |
| 6 | If DMS requires a **secondary connection** (e.g. it is a multi-connection tool for cross-environment migration), PPTB automatically shows the **multi-connection selector** before launching DMS — the user picks the second connection. |
| 7 | DMS opens pre-populated with the FetchXML from step 1. |
| 8 | A **"Return to FXS"** banner appears at the top of the DMS window with a note: _"nothing will be returned to caller"_ — because FXS only sends data; it does not await a result. |
| 9 | The user continues in DMS independently. Clicking **"Return to FXS"** in the banner simply closes DMS and switches back to FXS (the Promise on the FXS side resolves with `null`). |

---

### Step 1 – Callee tools declare the `"fetchxml"` capability

Both DRB and DMS include the following in their `pptb.config.json`:

**DRB `pptb.config.json`**

```json
{
    "invocation": {
        "version": "1.0.0",
        "capabilities": ["fetchxml"],
        "prefill": {
            "properties": {
                "fetchXml": { "type": "string" }
            }
        }
    }
}
```

**DMS `pptb.config.json`** — DMS is a multi-connection tool so it has no `returnTopic`; it uses the FetchXML purely as input.

```json
{
    "invocation": {
        "version": "1.0.0",
        "capabilities": ["fetchxml"],
        "prefill": {
            "properties": {
                "fetchXml": { "type": "string" }
            }
        }
    }
}
```

> DMS's multi-connection requirement is declared in the standard tool manifest (`pptb.package.json`):
>
> ```json
> { "features": { "multiConnection": "required" } }
> ```
>
> PPTB detects this at launch time and automatically prompts the user to select a secondary connection when none is available from the caller.

---

### Step 2 – FXS builds its "Send To" flyout from discovered tools

FXS calls `findToolsByCapability` on startup to discover all installed `fetchxml`-capable tools, then renders a flyout button for each one:

```typescript
// fxs/index.ts  — called during tool initialisation
async function setupSendToFlyout() {
    // Discover all installed tools that accept fetchxml
    const fetchXmlTools = await toolboxAPI.invocation.findToolsByCapability("fetchxml");

    // Render one "Send to [ToolName]" item in the flyout for each discovered tool
    renderSendToFlyout(fetchXmlTools as Array<{ id: string; name: string }>);
}
```

---

### Step 3 – User selects DMS; FXS launches it with `noReturn: true`

When the user picks "Send to DMS" from the flyout, FXS calls `launchTool` with `noReturn: true` to signal that it does not expect DMS to return data:

```typescript
// fxs/index.ts
async function sendCurrentQueryToTool(targetToolId: string) {
    const currentFetchXml = getEditorContent(); // e.g. "<fetch>…</fetch>"

    try {
        // noReturn: true → DMS will NOT call returnData back to FXS.
        // The Promise resolves with null when DMS closes or the user clicks "Return to FXS".
        await toolboxAPI.invocation.launchTool(
            targetToolId,
            { fetchXml: currentFetchXml },
            {
                // primaryConnectionId omitted → FXS's active connection is inherited by DMS
                // secondaryConnectionId omitted → PPTB shows multi-connection selector if DMS requires it
                noReturn: true,
            },
        );
        // Execution reaches here once DMS is closed (or user clicks "Return to FXS").
        // No result data to process.
    } catch (err) {
        // Tool not installed, connection selection cancelled, or already has an active callee.
        toolboxAPI.utils.showNotification({
            title: "Send To failed",
            body: err instanceof Error ? err.message : String(err),
            type: "error",
        });
    }
}
```

**What PPTB does behind the scenes:**

1. Looks up the DMS tool manifest.
2. Detects that DMS has `features.multiConnection: "required"` and no secondary connection was provided → opens the **multi-connection selector modal** in the PPTB shell. The user selects the target environment connection.
3. Launches DMS with FXS's primary connection and the user-selected secondary connection.
4. Pre-populates DMS with `{ fetchXml: "…" }`.
5. Because `noReturn: true` was set, **no "Return to FXS" banner is shown** in the DMS window.

---

### Step 4 – DMS reads the prefill data and uses it

DMS starts normally and reads the FetchXML from its launch context:

```typescript
// dms/index.ts
async function main() {
    const ctx = await toolboxAPI.invocation.getLaunchContext();

    if (ctx) {
        // Launched by FXS (or another tool) with a fetchXml payload
        const fetchXml = ctx.fetchXml as string | undefined;
        if (fetchXml) {
            loadQueryIntoEditor(fetchXml);
        }
        // DMS does NOT call returnData — FXS launched it with noReturn: true.
        // The user works in DMS independently; closing DMS resolves FXS's Promise with null.
    } else {
        // Standalone launch — show empty editor
        renderEmptyEditor();
    }
}

main();
```

> **Note:** DMS does not need to detect `noReturn` explicitly. The behaviour is the same as any other invocation: if `returnData` is never called and the tool is closed, the caller's Promise resolves with `null`. The `noReturn` flag only suppresses the banner — it does not change the invocation lifecycle.

---

### Step 5 – DMS closes; FXS Promise resolves

Because `noReturn: true` was set, no banner is shown in the DMS window. The user works in DMS and closes it normally (or closes the tab). PPTB resolves FXS's Promise with `null`.

| Action | Result |
|--------|--------|
| Close DMS tab normally | DMS is closed; FXS Promise resolves with `null`. |

---

### Full sequence diagram

```
FXS (Caller)                        PPTB Shell                       DMS (Callee)
────────────                         ──────────                       ────────────
findToolsByCapability("fetchxml")
  → [DRB, DMS]

User clicks "Send to DMS"
launchTool("dms", { fetchXml },
  { noReturn: true })
        │
        ▼
                            DMS needs secondary connection
                            → show multi-connection selector
                            ← user picks target env
                                    │
                                    ▼
                            Launch DMS (primary = FXS conn,
                                       secondary = user pick)
                            No banner shown (noReturn: true)
                                    │
                                    ▼
                                                         getLaunchContext()
                                                           → { fetchXml: "…" }
                                                         loadQueryIntoEditor(fetchXml)
                                                         // user works in DMS …

User closes DMS tab normally
        ◄──────────────────────────────────────────────
Promise resolves (null)     DMS closed
// No result to process
```

---

Understanding the full lifecycle helps when reasoning about edge cases:

```
Caller tool calls invocation.launchTool(...)
        │
        ▼
One-at-a-time check: rejects if caller already has an active callee
        │
        ▼
PPTB main process creates a new BrowserView for the callee
FXS connection auto-inherited from caller (unless overridden)
        │
        ▼
Callee loads, receives toolContext with:
  • toolId, instanceId
  • callerInstanceId  ← present only for invocations
  • prefillData       ← the object passed by the caller
  • connectionId      ← auto-inherited from caller's FXS connection
        │
        ▼
PPTB injects "Return to [CallerToolName]" banner in the callee window
(skipped if launchTool was called with noReturn: true)
        │
        ▼
Callee calls getLaunchContext()  →  returns prefillData
        │
        ▼ (user interacts with callee UI)
        │
    ┌───┴──────────────────────────────────────┐──────────────────────────┐
    │                                          │                          │
    ▼                                          ▼                          ▼
Callee calls returnData(...)      User closes callee window    User clicks "Return to Caller"
    │                                          │                  banner button
    ▼                                          ▼                          │
PPTB sends result to caller       PPTB sends null to caller              ▼
PPTB auto-closes callee window                │                PPTB sends null to caller
    │                                         │                PPTB auto-closes callee window
    └──────────────────┬──────────────────────┘──────────────────────────┘
                       │
                       ▼
        Caller's Promise resolves (returnData value OR null)
```

**Key points:**

- The callee opens in its **own window** (BrowserView) and is visible as a separate tab in the PPTB tool panel.
- The caller's `launchTool()` Promise **never rejects** under normal operation – it always resolves (possibly with `null`). Rejections only occur if the target tool is not installed, if the caller already has an active callee, or if the launch itself fails.
- **Auto-close**: after `returnData` is called, PPTB automatically closes the callee window. The callee does **not** need to close itself.
- **Banner early-return**: if the user clicks the "Return to [CallerToolName]" banner before the callee calls `returnData`, the caller's Promise resolves with `null` and the callee window is closed. This is treated the same as closing the window.
- **Banner dismiss (✕)**: clicking the dismiss button hides the banner for the session but does **not** end the invocation. The callee stays open and can still call `returnData` normally.
- **One-at-a-time**: only one active callee per caller is allowed. A second `launchTool` call from the same caller while a callee is active rejects with `"A callee invocation is already in progress"`.
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
- `invocation.capabilities` (when present) is an array of non-empty strings.
- `invocation.prefill.properties` values are valid JSON-schema property descriptors.
- `invocation.returnTopic.properties` values are valid JSON-schema property descriptors.

### TypeScript types

The `@pptb/types` package ships type definitions for the entire invocation API:

```typescript
// All methods live on toolboxAPI.invocation
toolboxAPI.invocation.getLaunchContext()            // Promise<Record<string, unknown> | null>
toolboxAPI.invocation.returnData(data)              // Promise<void>  (auto-closes callee after call)
toolboxAPI.invocation.launchTool(...)               // Promise<unknown>
toolboxAPI.invocation.findToolsByCapability(tag)    // Promise<unknown[]>
```

For the shape of `pptb.config.json`, import from the bundled declaration file:

```typescript
import type { PPTBConfig, InvocationConfig } from "@pptb/types/pptbConfig";
```

---

## Troubleshooting

### `launchTool` throws "Tool not found"

The target tool is not installed. Ask the user to install it from the PPTB Marketplace, or check that the `targetToolId` matches the exact npm package name (`name` field in the tool's `package.json`).

### `launchTool` throws "A callee invocation is already in progress"

Your tool already has an active callee open. Wait for the current invocation to resolve (or reject) before calling `launchTool` again. Only one callee per caller is supported in this phase.

### `getLaunchContext()` returns `null` when expecting prefill data

The tool was opened by the user directly rather than via `launchTool`. Ensure the caller is using `toolboxAPI.invocation.launchTool()` and not the standard tool launch mechanism.

### Caller `Promise` resolves with `null` unexpectedly

One of the following occurred:
1. The callee window was closed by the user before `returnData()` was called.
2. The user clicked the "Return to [CallerTool]" banner button before the callee called `returnData()`.

Both scenarios are by design — always handle the `null` case in the caller.

### Changes to `pptb.config.json` are not picked up

Capabilities and the invocation contract are read when a tool is **installed**. If you change `pptb.config.json` in a locally-loaded development tool, reload or reinstall the tool in PPTB.

### `returnData` appears to do nothing

Confirm that `getLaunchContext()` returned a non-null value first. If `getLaunchContext()` returns `null`, `returnData` is a no-op because the tool was not launched by another tool.

### `findToolsByCapability` returns an empty array

No installed tools declare the queried capability tag in their `pptb.config.json`. Check that the target tool's `pptb.config.json` has the correct tag in `invocation.capabilities` and was reinstalled after the change.

---

## References

- [`packages/toolboxAPI.d.ts`](../packages/toolboxAPI.d.ts) – Full TypeScript type definitions for the invocation API (`InvocationAPI`)
- [`packages/pptbConfig.d.ts`](../packages/pptbConfig.d.ts) – Type definitions for `pptb.config.json` (`PPTBConfig`, `InvocationConfig`)
- [`packages/README.md`](../packages/README.md) – Developer guide for the `@pptb/types` package, including the API reference
- [`src/main/managers/toolWindowManager.ts`](../src/main/managers/toolWindowManager.ts) – Host-side implementation (`launchToolWithContext`, `resolveInvocation`, `activeCallees`)
- [`src/main/toolPreloadBridge.ts`](../src/main/toolPreloadBridge.ts) – Preload-side implementation of the `invocation` namespace

