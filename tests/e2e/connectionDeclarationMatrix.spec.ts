import type { ToolFeatures } from "../../src/common/types/tool";
import { expect, test } from "./fixtures";
import { assign, clickTool, modalWith, sessionSlots, stubSelectionAuthentication, toolValue } from "./connectionTestHelpers";

const cases: Array<{ name: string; features?: ToolFeatures; min: number; max: number }> = [
    { name: "no features", min: 1, max: 1 },
    { name: "omitted connections", features: { connectionTypes: ["dataverse"] }, min: 1, max: 1 },
    ...[0, 1, 2, 10].map((count) => ({ name: `integer ${count}`, features: { connections: count }, min: count, max: count })),
    { name: "empty range defaults", features: { connections: {} }, min: 1, max: 1 },
    { name: "min-only defaults", features: { connections: { min: 2 } }, min: 2, max: 2 },
    { name: "max-only defaults", features: { connections: { max: 3 } }, min: 1, max: 3 },
    ...[
        [0, 1],
        [0, 3],
        [1, 2],
        [3, 4],
        [0, 10],
    ].map(([min, max]) => ({ name: `range ${min}-${max}`, features: { connections: { min, max } }, min, max })),
];
for (const multiConnection of [undefined, "none", "optional", "required"] as const) {
    for (const connectionRequirement of [undefined, "required", "optional"] as const) {
        const max = multiConnection === "optional" || multiConnection === "required" ? 2 : 1;
        cases.push({
            name: `legacy ${multiConnection ?? "omitted"}/${connectionRequirement ?? "omitted"}`,
            features: { ...(multiConnection ? { multiConnection } : {}), ...(connectionRequirement ? { connectionRequirement } : {}) },
            min: connectionRequirement === "optional" ? 0 : multiConnection === "required" ? 2 : 1,
            max,
        });
    }
}

for (const scenario of cases) {
    test.describe(scenario.name, () => {
        test.use({ multiConnectionData: true, connectionScenario: { features: scenario.features } });
        test("default/fallback picker, required prefix, capacity and numeric aliases remain compatible", async ({ electronApp, window }) => {
            await stubSelectionAuthentication(electronApp);
            await clickTool(window);
            if (scenario.max === 0) {
                await expect(window.locator("#tool-tabs")).toContainText("E2E Scenario");
                await expect(window.locator("#connection-slot-squares button")).toHaveCount(0);
            } else if (scenario.max === 1) {
                // Existing optional-single declarations retain the single picker.
                const modal = await modalWith(electronApp, "#connections-list-container");
                await expect(modal.locator(".connection-product-badge")).toHaveText(["Dataverse", "Dataverse", "Dataverse", "Dataverse"]);
                await modal.locator('.connection-item[data-connection-id="e2e-dev-connection"]').click();
                await modal.locator("#connect-selected-connection-btn").click();
            } else {
                const modal = await modalWith(electronApp);
                await expect(modal.locator("[data-slot-row]")).toHaveCount(scenario.min);
                const confirm = modal.locator("#confirm-multi-connection-btn");
                if (scenario.min) await expect(confirm).toBeDisabled();
                else await expect(confirm).toBeEnabled();
                for (let index = 0; index < scenario.min; index++) {
                    await assign(modal, index);
                    if (index < scenario.min - 1) await expect(confirm).toBeDisabled();
                }
                await expect(confirm).toBeEnabled();
                for (let index = scenario.min; index < scenario.max; index++) {
                    await modal.locator("#add-connection-slot-btn").click();
                    await assign(modal, index);
                }
                await expect(modal.locator("[data-slot-row]")).toHaveCount(scenario.max);
                await expect(modal.locator("#add-connection-slot-btn")).toBeDisabled();
                if (scenario.max > scenario.min) {
                    // Remove capacity again; optional zero-count launch remains possible.
                    for (let index = scenario.max - 1; index >= scenario.min; index--) await modal.locator(`[data-clear-slot="${index}"]`).click();
                    await expect(modal.locator("[data-slot-row]")).toHaveCount(scenario.min);
                }
                await confirm.click();
            }
            await expect(window.locator("#tool-tabs")).toContainText("E2E Scenario");
            const ids = await toolValue<Array<string | null>>(electronApp, "e2e-scenario", "return (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null);");
            expect(ids.filter(Boolean)).toHaveLength(scenario.max === 1 ? 1 : scenario.min);
            expect(
                await toolValue(
                    electronApp,
                    "e2e-scenario",
                    "return { primary: (await toolboxAPI.connections.getConnection('primary'))?.id ?? null, numeric: (await toolboxAPI.connections.getConnection(0))?.id ?? null, secondary: (await toolboxAPI.connections.getConnection('secondary'))?.id ?? null, numericSecondary: (await toolboxAPI.connections.getConnection(1))?.id ?? null };",
                ),
            ).toEqual({ primary: ids[0] ?? null, numeric: ids[0] ?? null, secondary: ids[1] ?? null, numericSecondary: ids[1] ?? null });
            const instanceId = await window.locator("#tool-tabs .tool-tab").getAttribute("data-instance-id");
            expect((await sessionSlots(window))?.filter(Boolean)).toHaveLength(scenario.max === 1 ? 1 : scenario.min);
            {
                // Legacy runtime bounds arrays by truncation; retain that behavior.
                await window.evaluate(({ instanceId, max }) => globalThis.window.toolboxAPI.updateToolConnections(instanceId!, Array(max + 1).fill("e2e-dev-connection")), {
                    instanceId,
                    max: scenario.max,
                });
                expect(await toolValue(electronApp, "e2e-scenario", "return (await toolboxAPI.connections.getConnections()).length;")).toBe(scenario.max);
            }
            if (scenario.min === 0 && scenario.max === 1) {
                await window.evaluate((instanceId) => globalThis.window.toolboxAPI.updateToolConnections(instanceId!, [null]), instanceId);
                expect(await toolValue(electronApp, "e2e-scenario", "return await toolboxAPI.connections.getConnection(0);")).toBeNull();
                await window.evaluate((instanceId) => globalThis.window.toolboxAPI.closeToolWindow(instanceId!), instanceId);
                const tool = await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-scenario"));
                expect(await window.evaluate((tool) => globalThis.window.toolboxAPI.launchToolWindow("e2e-scenario-456-empty", tool, null, null, []), tool)).toBe(true);
                expect(await toolValue(electronApp, "e2e-scenario", "return await toolboxAPI.connections.getConnection(0);")).toBeNull();
            }
        });
    });
}
