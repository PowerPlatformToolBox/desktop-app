import type { ToolFeatures } from "../../src/common/types/tool";
import { expect, test } from "./fixtures";
import { assign, clickTool, modalWith, sessionSlots, stubSelectionAuthentication, toolValue } from "./connectionTestHelpers";

const variants: Array<{ name: string; features: ToolFeatures; ids: Array<string | null>; labels: string[] }> = [
    { name: "omitted slot field defaults", features: { connections: { slots: [{}, {}] } }, ids: ["e2e-dev-connection", "e2e-test-connection"], labels: ["Primary", "Secondary"] },
    {
        name: "multiple allowed products",
        features: {
            connections: {
                slots: [
                    { label: "Either product", connectionTypes: ["dataverse", "financeOperations"] },
                    { label: "Optional accounts", required: false },
                ],
            },
        },
        ids: ["e2e-finops", null],
        labels: ["Either product", "Optional accounts"],
    },
    {
        name: "holes between required indexes and long purpose",
        features: {
            connections: {
                slots: [
                    { label: "Required source accounts" },
                    { required: false },
                    { label: "Customer comparison purpose " + "with a long description ".repeat(8), connectionTypes: ["financeOperations"] },
                    { required: false },
                ],
            },
        },
        ids: ["e2e-dev-connection", null, "e2e-finops", null],
        labels: ["Required source accounts", "Secondary", "Customer comparison purpose", "Connection 4"],
    },
    { name: "multiple all-optional slots", features: { connections: { slots: [{ required: false }, { required: false }] } }, ids: [null, null], labels: ["Primary", "Secondary"] },
];
for (const variant of variants) {
    test.describe(variant.name, () => {
        test.use({ multiConnectionData: true, connectionScenario: { features: variant.features } });
        test("fixed rows, defaults, filtering, cancel and reopening preserve declared indexes", async ({ electronApp, window }, testInfo) => {
            await stubSelectionAuthentication(electronApp);
            await clickTool(window);
            let modal = await modalWith(electronApp);
            await expect(modal.locator("[data-slot-row]")).toHaveCount(variant.ids.length);
            await expect(modal.locator("#add-connection-slot-btn")).toHaveCount(0);
            for (const [index, label] of variant.labels.entries()) await expect(modal.locator(`[data-slot-row="${index}"]`)).toContainText(label);
            if (variant.name === "multiple allowed products") {
                await expect(modal.locator("#slot-connection-list .connection-product-badge")).toHaveCount(5);
                await assign(modal, 0, "e2e-finops");
                await assign(modal, 1, "e2e-dev-connection");
                await modal.locator('[data-clear-slot="1"]').click();
                await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
            } else for (const [index, id] of variant.ids.entries()) if (id) await assign(modal, index, id);
            if (variant.name.startsWith("holes between")) {
                expect(await modal.locator("#connection-slot-purpose").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
                const screenshot = testInfo.outputPath("long-purpose.png");
                await modal.screenshot({ path: screenshot });
                await testInfo.attach("long-purpose", { path: screenshot, contentType: "image/png" });
            }
            // Cancel by keyboard; draft assignments must not be remembered or launched.
            await modal.locator("#cancel-select-multi-connection-btn").focus();
            await modal.locator("#cancel-select-multi-connection-btn").press("Enter");
            expect(await window.evaluate(() => globalThis.window.toolboxAPI.getOpenToolWindows())).toEqual([]);
            expect((await window.evaluate(() => globalThis.window.toolboxAPI.getToolConnectionSlots("e2e-scenario")))?.filter(Boolean) ?? []).toEqual([]);
            await clickTool(window);
            modal = await modalWith(electronApp);
            for (const [index, id] of variant.ids.entries())
                if (id) {
                    await assign(modal, index, id);
                    const requiredAfter = variant.ids.slice(index + 1).some(Boolean);
                    if (requiredAfter) await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
                }
            await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
            await modal.locator("#confirm-multi-connection-btn").click();
            await expect.poll(() => sessionSlots(window)).toEqual(variant.ids);
            expect(await toolValue(electronApp, "e2e-scenario", "return (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null);")).toEqual(variant.ids);
        });
    });
}

test.describe("Power Platform restrictions", () => {
    test.use({ multiConnectionData: true, connectionScenario: { features: { connections: { slots: [{ label: "Power Platform administration" }] }, enabledForPowerPlatformAPI: true } } });
    test("single typed picker offers only enabled Dataverse client-secret records and rejects direct bypass", async ({ electronApp, window }) => {
        await stubSelectionAuthentication(electronApp);
        await window.evaluate(async () => {
            const original = await globalThis.window.toolboxAPI.connections.getById("e2e-dev-connection");
            await globalThis.window.toolboxAPI.connections.add({
                ...original!,
                id: "e2e-platform-enabled",
                name: "Platform enabled",
                authenticationType: "clientSecret",
                clientId: "test-client",
                clientSecret: "test-secret",
                tenantId: "test-tenant",
                enabledForPowerPlatformAPI: true,
            });
            await globalThis.window.toolboxAPI.connections.add({
                ...original!,
                id: "e2e-platform-disabled",
                name: "Platform disabled",
                authenticationType: "clientSecret",
                clientId: "test-client",
                clientSecret: "test-secret",
                tenantId: "test-tenant",
                enabledForPowerPlatformAPI: false,
            });
        });
        await clickTool(window);
        const modal = await modalWith(electronApp, "#connections-list-container");
        await expect(modal.locator(".connection-item")).toHaveCount(1);
        await expect(modal.locator(".connection-item")).toContainText("Platform enabled");
        await modal.locator("#cancel-select-connection-btn").click();
        const tool = await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-scenario"));
        for (const id of ["e2e-finops", "e2e-dev-connection", "e2e-platform-disabled"]) {
            expect(await window.evaluate(({ tool, id }) => globalThis.window.toolboxAPI.launchToolWindow("e2e-scenario-123-rejected", tool, id, null, [id]), { tool, id })).toBe(false);
        }
        expect(await window.evaluate(() => globalThis.window.toolboxAPI.getOpenToolWindows())).toEqual([]);
    });
});

test.describe("typed invocation and impersonation", () => {
    test.use({
        multiConnectionData: true,
        connectionScenario: { features: { connections: { slots: [{ label: "Flexible source", connectionTypes: ["dataverse", "financeOperations"] }, { label: "Comparison accounts" }] } } },
    });
    test("runtime replacement clears only the changed slot's impersonation and rejects F&O impersonation", async ({ electronApp, window }) => {
        const tool = await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-scenario"));
        const instanceId = "e2e-scenario-123-impersonation";
        expect(
            await window.evaluate(
                ({ tool, instanceId }) => globalThis.window.toolboxAPI.launchToolWindow(instanceId, tool, "e2e-dev-connection", "e2e-test-connection", ["e2e-dev-connection", "e2e-test-connection"]),
                { tool, instanceId },
            ),
        ).toBe(true);
        const user = { systemuserid: "00000000-0000-0000-0000-000000000001", fullname: "Fixture user", azureactivedirectoryobjectid: "00000000-0000-0000-0000-000000000002" };
        await window.evaluate(
            async ({ instanceId, user }) => {
                await globalThis.window.toolboxAPI.setToolImpersonation(instanceId, user, 0);
                await globalThis.window.toolboxAPI.setToolImpersonation(instanceId, user, 1);
            },
            { instanceId, user },
        );
        await window.evaluate((instanceId) => globalThis.window.toolboxAPI.updateToolConnections(instanceId, ["e2e-finops", "e2e-test-connection"]), instanceId);
        expect(await window.evaluate((instanceId) => globalThis.window.toolboxAPI.getToolImpersonation(instanceId, 0), instanceId)).toEqual({ user: null });
        expect(await window.evaluate((instanceId) => globalThis.window.toolboxAPI.getToolImpersonation(instanceId, 1), instanceId)).toEqual({ user });
        const rejected = await window.evaluate(
            async ({ instanceId, user }) => {
                try {
                    await globalThis.window.toolboxAPI.setToolImpersonation(instanceId, user, 0);
                    return "";
                } catch (error) {
                    return (error as Error).message;
                }
            },
            { instanceId, user },
        );
        expect(rejected).toContain("Dataverse");
        await window.evaluate((instanceId) => globalThis.window.toolboxAPI.resetToolImpersonation(instanceId, 1), instanceId);
        expect(await window.evaluate((instanceId) => globalThis.window.toolboxAPI.getToolImpersonation(instanceId, 1), instanceId)).toEqual({ user: null });
    });

    test("inter-tool overrides preserve explicit nulls and reject wrong products and excess slots before launch", async ({ electronApp, window }) => {
        const caller = await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-invocation-caller"));
        expect(
            await window.evaluate(
                (tool) =>
                    globalThis.window.toolboxAPI.launchToolWindow("e2e-invocation-caller-123-source", tool, "e2e-dev-connection", "e2e-test-connection", ["e2e-dev-connection", "e2e-test-connection"]),
                caller,
            ),
        ).toBe(true);
        for (const ids of [
            [null, "e2e-dev-connection"],
            [null, "e2e-finops", null, "e2e-dev-connection"],
        ]) {
            const error = await toolValue<string>(
                electronApp,
                "e2e-invocation-caller",
                `try { await toolboxAPI.invocation.launchTool("e2e-typed-optional", {}, { noReturn: true, connectionIds: ${JSON.stringify(
                    ids,
                )} }); return ""; } catch (error) { return error.message; }`,
            );
            expect(error).not.toBe("");
            expect(await window.evaluate(() => globalThis.window.toolboxAPI.getOpenToolWindows())).toHaveLength(1);
        }
        await toolValue(
            electronApp,
            "e2e-invocation-caller",
            'toolboxAPI.invocation.launchTool("e2e-typed-optional", {}, { noReturn: true, connectionIds: [null, "e2e-finops", null] }).catch(error => { window.invocationOverrideError = error.message; }); return true;',
        );
        await expect
            .poll(() => toolValue(electronApp, "e2e-typed-optional", "return (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null);").catch(() => null))
            .toEqual([null, "e2e-finops", null]);
    });
});
