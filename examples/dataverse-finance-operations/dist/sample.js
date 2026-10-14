const runButton = document.getElementById("run");
const status = document.getElementById("status");

// Slots are zero-based. Never assume that the first slot is Dataverse.
async function resolveTargets() {
    const connections = await window.toolboxAPI.connections.getConnections();
    const dataverse = [];
    const finops = [];
    connections.forEach((connection, slot) => {
        if (!connection) return;
        // Legacy connections without a product discriminator are Dataverse.
        const type = connection.connectionType ?? "dataverse";
        if (type === "dataverse") dataverse.push({ connection, slot });
        if (type === "financeOperations") finops.push({ connection, slot });
    });
    for (const [product, matches] of [
        ["dataverse", dataverse],
        ["finops", finops],
    ]) {
        document.getElementById(`${product}-connection`).textContent =
            matches.length === 1
                ? `${matches[0].connection.name} · Slot ${matches[0].slot + 1} · ${matches[0].connection.url}`
                : `Select exactly one ${product === "dataverse" ? "Dataverse" : "F&O"} connection.`;
    }
    if (connections.length !== 2 || dataverse.length !== 1 || finops.length !== 1) {
        throw new Error("This example needs one Dataverse connection and one F&O connection. Change the tool connections, then try again.");
    }
    return { dataverse: dataverse[0].slot, finops: finops[0].slot };
}

async function readProduct(product, operation) {
    const output = document.getElementById(`${product}-result`);
    const progress = document.getElementById(`${product}-status`);
    output.textContent = "Loading…";
    progress.textContent = "Reading one page…";
    try {
        const result = await operation();
        output.textContent = JSON.stringify(result, null, 2);
        progress.textContent = `Read ${result.value.length} record(s)${result["@odata.nextLink"] ? " · More pages available" : ""}`;
        return true;
    } catch (error) {
        output.textContent = [error.message || String(error), error.status && `HTTP ${error.status}`, error.requestId && `Request ID: ${error.requestId}`].filter(Boolean).join("\n");
        progress.textContent = "Request failed";
        return false;
    }
}

runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    const inputs = [...document.querySelectorAll("input")];
    inputs.forEach((input) => (input.disabled = true));
    status.textContent = "Reading both systems…";
    try {
        // Re-read slots on every run so connection reassignment is respected.
        const targets = await resolveTargets();
        const dataverseQuery = document.getElementById("dataverse-query").value.trim();
        const finopsQuery = document.getElementById("finops-query").value.trim();
        if (!dataverseQuery || !finopsQuery) throw new Error("Enter a query for each system.");
        const results = await Promise.all([
            readProduct("dataverse", () => window.dataverseAPI.queryData(dataverseQuery, targets.dataverse)),
            readProduct("finops", () => window.financeOperationsAPI.queryData(finopsQuery, { connectionTarget: targets.finops })),
        ]);
        status.textContent = results.every(Boolean) ? "Both systems read successfully" : "Finished with errors · See the individual results";
    } catch (error) {
        status.textContent = error.message || String(error);
    } finally {
        runButton.disabled = false;
        inputs.forEach((input) => (input.disabled = false));
    }
});

resolveTargets()
    .then(() => {
        status.textContent = "Ready to read both systems";
    })
    .catch((error) => {
        status.textContent = error.message || String(error);
    })
    .finally(() => {
        // Allow retry after fixing the selected connections.
        runButton.disabled = false;
    });
