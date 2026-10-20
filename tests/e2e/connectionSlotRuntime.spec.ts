import type { ElectronApplication } from "playwright";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function selectedIds(app: ElectronApplication): Promise<Array<string | null>> {
    return app.evaluate(async ({ BrowserWindow }) => {
        for (const main of BrowserWindow.getAllWindows()) {
            for (const view of main.getBrowserViews()) {
                if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-mixed-connections E2E fixture")').catch(() => false)) {
                    return view.webContents.executeJavaScript("(async () => (await window.toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null))()");
                }
            }
        }
        throw new Error("Typed-slot runtime fixture missing");
    });
}

test("explicit slot launch and reassignment enforce types and required indexes through real IPC", async ({ electronApp, window }) => {
    // Exercise the main-process boundary before the picker is migrated. The trusted
    // renderer supplies a Tool payload just as it does for an ordinary launch.
    const instanceId = "e2e-mixed-connections-123-typed";
    const features = {
        connections: {
            slots: [
                { label: "Optional accounts", required: false },
                { label: "F&O customers", connectionTypes: ["financeOperations" as const] },
            ],
        },
    };
    await electronApp.evaluate((_electron, features) => {
        const fs = process.getBuiltinModule("fs");
        const path = process.getBuiltinModule("path");
        const manifestPath = path.join(process.env.PPTB_TEST_TOOLS_DIRECTORY!, "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.tools.find((tool: any) => tool.id === "e2e-mixed-connections").features = features;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    }, features);
    const tool = await window.evaluate(() => window.toolboxAPI.loadTool("e2e-mixed-connections"));
    expect(tool.features).toEqual(features);
    await window.evaluate(() => window.toolboxAPI.setToolConnectionSlots("e2e-mixed-connections", [null, "e2e-finops"]));
    const rememberedBefore = await window.evaluate(() => window.toolboxAPI.getToolConnectionSlots("e2e-mixed-connections"));
    for (const ids of [
        ["e2e-dev-connection", null],
        [null, "e2e-dev-connection"],
        [null, "e2e-finops", "e2e-dev-connection"],
    ]) {
        const error = await window.evaluate(async (ids) => {
            try {
                await window.toolboxAPI.setToolConnectionSlots("e2e-mixed-connections", ids);
                return "";
            } catch (error) {
                return (error as Error).message;
            }
        }, ids);
        expect(error).not.toBe("");
        expect(await window.evaluate(() => window.toolboxAPI.getToolConnectionSlots("e2e-mixed-connections"))).toEqual(rememberedBefore);
    }
    const legacySetterError = await window.evaluate(async () => {
        try {
            await window.toolboxAPI.setToolSecondaryConnection("e2e-mixed-connections", "e2e-dev-connection");
            return "";
        } catch (error) {
            return (error as Error).message;
        }
    });
    expect(legacySetterError).toContain("not compatible");
    expect(await window.evaluate(() => window.toolboxAPI.getToolConnectionSlots("e2e-mixed-connections"))).toEqual(rememberedBefore);
    expect(await window.evaluate(({ instanceId, tool }) => window.toolboxAPI.launchToolWindow(instanceId, tool, null, "e2e-finops", [null, "e2e-finops"]), { instanceId, tool })).toBe(true);
    await expect.poll(() => selectedIds(electronApp)).toEqual([null, "e2e-finops"]);
    await electronApp.evaluate(({ BrowserWindow }) => {
        for (const main of BrowserWindow.getAllWindows())
            for (const view of main.getBrowserViews()) {
                const original = view.webContents.send;
                (globalThis as any).slotRuntimeNotifications = [];
                view.webContents.send = function (...args: any[]) {
                    (globalThis as any).slotRuntimeNotifications.push(args[0]);
                    return original.apply(this, args);
                };
            }
    });
    for (const ids of [
        ["e2e-dev-connection", null],
        [null, "e2e-dev-connection"],
        [null, "removed-id"],
        [null, "e2e-finops", "e2e-dev-connection"],
    ]) {
        const error = await window.evaluate(
            async ({ instanceId, ids }) => {
                try {
                    await window.toolboxAPI.updateToolConnections(instanceId, ids);
                    return "";
                } catch (error) {
                    return (error as Error).message;
                }
            },
            { instanceId, ids },
        );
        expect(error).not.toBe("");
        expect(await selectedIds(electronApp)).toEqual([null, "e2e-finops"]);
        expect(await electronApp.evaluate(() => (globalThis as any).slotRuntimeNotifications)).toEqual([]);
    }
    await window.evaluate(({ instanceId }) => window.toolboxAPI.updateToolConnections(instanceId, ["e2e-dev-connection", "e2e-finops"]), { instanceId });
    expect(await selectedIds(electronApp)).toEqual(["e2e-dev-connection", "e2e-finops"]);
    expect(await electronApp.evaluate(() => (globalThis as any).slotRuntimeNotifications)).toContain("toolbox:context");
    await window.evaluate(({ instanceId }) => window.toolboxAPI.updateToolConnection(instanceId, null), { instanceId });
    expect(await selectedIds(electronApp)).toEqual([null, "e2e-finops"]);

    // Invalid launches must not leave views or open-instance records behind.
    const openBefore = await window.evaluate(() => window.toolboxAPI.getOpenToolWindows());
    expect(
        await window.evaluate(
            async (tool) =>
                window.toolboxAPI.launchToolWindow(
                    "e2e-mixed-connections-456-rejected",
                    {
                        ...tool,
                        features: { connections: { slots: [{}] } },
                    },
                    "e2e-dev-connection",
                    "e2e-finops",
                ),
            tool,
        ),
    ).toBe(false);
    for (const ids of [
        ["e2e-dev-connection", null],
        [null, "e2e-dev-connection"],
        [null, "e2e-finops", "e2e-dev-connection"],
    ]) {
        expect(await window.evaluate(({ tool, ids }) => window.toolboxAPI.launchToolWindow("e2e-mixed-connections-456-rejected", tool, ids[0], ids[1], ids), { tool, ids })).toBe(false);
        expect(await window.evaluate(() => window.toolboxAPI.getOpenToolWindows())).toEqual(openBefore);
    }
});
