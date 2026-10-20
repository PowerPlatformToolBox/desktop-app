import fs from "fs";
import path from "path";
import { _electron as electron, type Page } from "playwright";
import type { ToolFeatures } from "../../src/common/types/tool";
import { expect, test } from "./fixtures";
import { assign, clickTool, modalWith, sessionSlots, stubSelectionAuthentication, toolValue } from "./connectionTestHelpers";

const initialFeatures: ToolFeatures = {
    connections: {
        slots: [
            { label: "Optional accounts", required: false },
            { label: "Required customers", connectionTypes: ["financeOperations"] },
            { label: "Optional comparison", required: false },
        ],
    },
};
const scenarios: Array<{ name: string; features: ToolFeatures; expected: Array<string | null>; missing?: number; replacement?: string; deleted?: boolean }> = [
    { name: "valid typed holes", features: initialFeatures, expected: [null, "e2e-finops", "e2e-test-connection"] },
    {
        name: "changed product",
        features: { connections: { slots: [{ required: false }, { label: "Required new accounts" }, { required: false }] } },
        expected: [null, "e2e-dev-connection", "e2e-test-connection"],
        missing: 1,
        replacement: "e2e-dev-connection",
    },
    {
        name: "changed required status",
        features: { connections: { slots: [{ label: "Newly required accounts" }, { label: "Required customers", connectionTypes: ["financeOperations"] }, { required: false }] } },
        expected: ["e2e-dev-connection", "e2e-finops", "e2e-test-connection"],
        missing: 0,
        replacement: "e2e-dev-connection",
    },
    {
        name: "changed slot order",
        features: { connections: { slots: [{ label: "Moved customers", connectionTypes: ["financeOperations"] }, { required: false }, { required: false }] } },
        expected: ["e2e-finops", null, "e2e-test-connection"],
        missing: 0,
        replacement: "e2e-finops",
    },
    {
        name: "shorter declaration",
        features: { connections: { slots: [{ required: false }, { label: "Required customers", connectionTypes: ["financeOperations"] }] } },
        expected: [null, "e2e-finops"],
    },
    {
        name: "longer declaration",
        features: {
            connections: {
                slots: [
                    ...(initialFeatures.connections as { slots: Array<{ label?: string; connectionTypes?: ("dataverse" | "financeOperations")[]; required?: boolean }> }).slots,
                    { label: "New required comparison" },
                ],
            },
        },
        expected: [null, "e2e-finops", "e2e-test-connection", "e2e-dev-connection"],
        missing: 3,
        replacement: "e2e-dev-connection",
    },
    { name: "removed required connection", features: initialFeatures, expected: [null, "e2e-finops-alternate", "e2e-test-connection"], missing: 1, replacement: "e2e-finops-alternate", deleted: true },
];

for (const scenario of scenarios) {
    test.describe(scenario.name, () => {
        test.use({ multiConnectionData: true, connectionScenario: { features: initialFeatures } });
        test("cold restart revalidates saved assignments without product remapping or compaction", async ({ electronApp, window }) => {
            await stubSelectionAuthentication(electronApp);
            if (scenario.deleted)
                await window.evaluate(async () => {
                    const original = await globalThis.window.toolboxAPI.connections.getById("e2e-finops");
                    await globalThis.window.toolboxAPI.connections.add({ ...original!, id: "e2e-finops-alternate", name: "Alternate customers" });
                });
            await clickTool(window);
            const picker = await modalWith(electronApp);
            await assign(picker, 1, "e2e-finops");
            await assign(picker, 2, "e2e-test-connection");
            await picker.locator("#confirm-multi-connection-btn").click();
            await expect.poll(() => sessionSlots(window)).toEqual([null, "e2e-finops", "e2e-test-connection"]);
            await window.evaluate(async () => {
                await globalThis.window.toolboxAPI.setToolConnectionSlots("e2e-scenario", [null, "e2e-finops", "e2e-test-connection"]);
                await globalThis.window.toolboxAPI.setSetting("restoreSessionOnStartup", true);
            });
            const environment = await electronApp.evaluate(({ app }) => ({
                userData: app.getPath("userData"),
                registry: process.env.PPTB_TEST_REGISTRY_PATH!,
                tools: process.env.PPTB_TEST_TOOLS_DIRECTORY!,
            }));
            await electronApp.close();
            const manifestFile = path.join(environment.tools, "manifest.json");
            const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
            manifest.tools.find((tool: any) => tool.id === "e2e-scenario").features = scenario.features;
            fs.writeFileSync(manifestFile, JSON.stringify(manifest));
            fs.writeFileSync(path.join(environment.tools, "e2e-scenario", "package.json"), JSON.stringify({ name: "e2e-scenario", version: "1.0.0", features: scenario.features }));
            if (scenario.deleted) {
                const connectionsFile = path.join(environment.userData, "connections.json");
                const data = JSON.parse(fs.readFileSync(connectionsFile, "utf8"));
                data.connections = data.connections.filter((connection: any) => connection.id !== "e2e-finops");
                fs.writeFileSync(connectionsFile, JSON.stringify(data));
            }
            const restarted = await electron.launch({
                args: [path.resolve(__dirname, "../../dist/main/index.js"), `--user-data-dir=${environment.userData}`],
                env: {
                    ...process.env,
                    NODE_ENV: "test",
                    PPTB_DISABLE_AUTO_UPDATE: "1",
                    PPTB_TEST_MODE: "1",
                    PPTB_TEST_REGISTRY_PATH: environment.registry,
                    PPTB_TEST_TOOLS_DIRECTORY: environment.tools,
                    SUPABASE_URL: "",
                    SUPABASE_ANON_KEY: "",
                    AZURE_BLOB_BASE_URL: "",
                },
            });
            try {
                await stubSelectionAuthentication(restarted);
                let main: Page | undefined;
                await expect
                    .poll(async () => {
                        for (const candidate of restarted.windows())
                            if (await candidate.locator(".app-container").count()) {
                                main = candidate;
                                return true;
                            }
                        return false;
                    })
                    .toBe(true);
                if (scenario.missing !== undefined) {
                    const restore = await modalWith(restarted);
                    const authenticated = await restarted.evaluate(() => (globalThis as any).selectionAuthIds);
                    if (scenario.name === "changed product" || scenario.name === "changed slot order" || scenario.deleted) expect(authenticated).not.toContain("e2e-finops");
                    await expect(restore.locator(`[data-slot-row="${scenario.missing}"]`)).toContainText("Not selected");
                    await expect(restore.locator("#confirm-multi-connection-btn")).toBeDisabled();
                    await restore.locator(`[data-slot-row="${scenario.missing}"] .connection-slot-button`).click();
                    await expect(restore.locator("#connection-slot-purpose")).toContainText(
                        (scenario.features.connections as { slots: Array<{ label?: string }> }).slots[scenario.missing].label ?? "Required customers",
                    );
                    await assign(restore, scenario.missing, scenario.replacement!);
                    await restore.locator("#confirm-multi-connection-btn").click();
                }
                await expect(main!.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30000 });
                await expect.poll(() => sessionSlots(main!)).toEqual(scenario.expected);
                expect(await toolValue(restarted, "e2e-scenario", "return (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null);")).toEqual(scenario.expected);
                // Remember the corrected choices through the real settings boundary;
                // session restoration itself does not opt users into saving choices.
                await main!.evaluate((ids) => globalThis.window.toolboxAPI.setToolConnectionSlots("e2e-scenario", ids), scenario.expected);
                expect(await main!.evaluate(() => globalThis.window.toolboxAPI.getToolConnectionSlots("e2e-scenario"))).toEqual(scenario.expected);
                if (scenario.name === "valid typed holes") {
                    await main!.evaluate(async () => {
                        const original = await globalThis.window.toolboxAPI.connections.getById("e2e-finops");
                        await globalThis.window.toolboxAPI.connections.add({ ...original!, id: "e2e-finops-recovered", name: "Recovered customers" });
                    });
                    await restarted.evaluate(({ ipcMain }) => {
                        ipcMain.removeHandler("set-active-connection");
                        ipcMain.handle("set-active-connection", async (_event, id) => {
                            if (id === "e2e-finops") throw new Error("Fixture session authentication failed");
                        });
                    });
                    await main!.reload();
                    const recovery = await modalWith(restarted);
                    await expect(recovery.locator('[data-slot-row="1"]')).toContainText("Not selected");
                    await expect(recovery.locator('[data-slot-row="2"]')).toContainText("E2E Test");
                    await assign(recovery, 1, "e2e-finops-recovered");
                    await recovery.locator("#confirm-multi-connection-btn").click();
                    await expect.poll(() => sessionSlots(main!)).toEqual([null, "e2e-finops-recovered", "e2e-test-connection"]);
                }
            } finally {
                await restarted.close();
            }
        });
    });
}
