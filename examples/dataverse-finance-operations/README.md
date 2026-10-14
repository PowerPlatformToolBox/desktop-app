# Dataverse + F&O Explorer

A read-only desktop example that queries both products in one tool session. No build or dependency installation is needed.

1. Start Power Platform ToolBox and save a Dataverse connection and an F&O connection.
2. Open **Debug → Local Development → Browse**, select `examples/dataverse-finance-operations`, and click **Load Tool**.
3. Select one connection of each product in the two-slot picker. Either order works.
4. Click **Read both systems**. The defaults read five Dataverse accounts and five F&O `CustomersV3` records. Change the queries if your environments use different collections or permissions.

The manifest declares two required slots and allows both products. `connectionTypes` applies to the whole tool, so the picker also permits two connections of the same product. The example detects that configuration and asks for one of each before sending requests.

`dist/sample.js` discovers the product in each slot using `toolboxAPI.connections.getConnections()`. Legacy connections without `connectionType` count as Dataverse. It then passes the zero-based slot explicitly to each API:

```js
window.dataverseAPI.queryData(dataverseQuery, targets.dataverse);
window.financeOperationsAPI.queryData(finopsQuery, { connectionTarget: targets.finops });
```

Slots are resolved again on each read to respect reassignment. Requests run concurrently and report failures separately, so one failed system does not hide the other's result. Output uses text content rather than rendering server data as HTML.

The tool reads one page from each system. It does not match, synchronize, or modify records. The Electron regression test loads this actual example and exercises both slot orders through the real preload/IPC/API managers with simulated HTTP responses; live credentials and environments are still needed for a live smoke test.
