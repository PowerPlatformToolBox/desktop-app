# Dataverse + F&O Explorer

A read-only desktop example that queries both products in one tool session. No build or dependency installation is needed.

1. Start Power Platform ToolBox and save a Dataverse connection and an F&O connection.
2. Open **Debug → Local Development → Browse**, select `examples/dataverse-finance-operations`, and click **Load Tool**.
3. Choose a Dataverse connection for **Dataverse accounts** (slot 1) and an F&O connection for **F&O customers** (slot 2). The picker shows each slot's purpose, filters by its product, and requires both assignments.
4. Click **Read both systems**. The defaults read five Dataverse accounts and five F&O `CustomersV3` records. Change the queries if your environments use different collections or permissions.

The manifest opts into two fixed typed required slots. Launch and runtime reassignment reject wrong products, missing assignments and extra slots. Existing integer and `{ min, max }` declarations remain the default/fallback for other tools; they can still allow either product in any slot through tool-level `connectionTypes`.

`dist/sample.js` reads connection metadata using `toolboxAPI.connections.getConnections()` to display current names/URLs and defensively check the declared order. It passes fixed zero-based targets to each API:

```js
window.dataverseAPI.queryData(dataverseQuery, 0);
window.financeOperationsAPI.queryData(finopsQuery, { connectionTarget: 1 });
```

Connection names/URLs are refreshed on each read to respect compatible reassignment. Targets retain their declared indexes. Requests run concurrently and report failures separately, so one failed system does not hide the other's result. Output uses text content rather than rendering server data as HTML.

The tool reads one page from each system. It does not match, synchronize, or modify records. The Electron regression test loads this actual example and exercises declared-order routing, compatible reassignment, independent errors and wrong-slot rejection through the real preload/IPC/API managers with simulated HTTP responses. Separate legacy count-declaration coverage retains either-order behavior. Live credentials and environments are still needed for a live smoke test.

Use the local `finops-connection` build containing connection slots. The release introducing slots and the example's corresponding `features.minAPI` are still unassigned; this development example must receive that minimum before release. The updated types and validator packages have not been published. See the [author guide](../../docs/N_CONNECTION_TOOL_AUTHOR_GUIDE.md) and [release checklist](../../docs/CONNECTION_SLOT_DEFINITIONS_IMPLEMENTATION_PLAN.md).
