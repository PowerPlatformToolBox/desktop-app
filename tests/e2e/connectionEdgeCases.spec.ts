import fs from "fs";
import path from "path";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true, connectionEdgeData: true });

const toolId = "e2e-api-four-connections";
const assignedIds = ["e2e-dev-connection", "e2e-test-connection", "e2e-uat-connection"];
const toolTabs = (window: Page) => window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E API Four Connections" });

async function modalWith(electronApp: ElectronApplication, selector: string): Promise<Page> {
    let result: Page | undefined;
    await expect
        .poll(
            async () => {
                for (const candidate of electronApp.windows()) {
                    if (await candidate.locator(selector).count()) {
                        result = candidate;
                        return true;
                    }
                }
                return false;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    return result!;
}

async function assignConnections(electronApp: ElectronApplication, window: Page): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
    await window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${toolId}"]`).click();
    const modal = await modalWith(electronApp, "#connection-slot-rail");
    for (const [slotIndex, connectionId] of assignedIds.entries()) {
        await modal.locator("#add-connection-slot-btn").click();
        await modal.locator(`.connect-button[data-connection-id="${connectionId}"]`).click();
        await expect(modal.locator(`[data-slot-row="${slotIndex}"] .connection-slot-connected-check`)).toBeVisible();
    }
    await modal.locator("#confirm-multi-connection-btn").click();
    await expect(toolTabs(window)).toHaveCount(1);
    await expect(toolTabs(window).locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development / E2E Test / E2E UAT");
}

test("startup repairs missing IDs on disk without shifting later slots", async ({ electronApp, window }) => {
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    const settings = JSON.parse(fs.readFileSync(path.join(userDataPath, "user-settings.json"), "utf8"));
    expect(settings.toolConnectionSlots[toolId]).toEqual(["e2e-dev-connection", null, "e2e-uat-connection", "e2e-production-connection"]);
    expect(settings.toolSecondaryConnections[toolId]).toBeUndefined();
    expect(await window.evaluate((id) => window.toolboxAPI.getToolConnectionSlots(id), toolId)).toEqual(settings.toolConnectionSlots[toolId]);
});

test("duplicate action and renderer session restore preserve all three connections", async ({ electronApp, window }) => {
    await assignConnections(electronApp, window);
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("show-context-menu");
        ipcMain.handle("show-context-menu", async () => "duplicate-tab");
    });
    await toolTabs(window).first().click({ button: "right" });
    await expect(toolTabs(window)).toHaveCount(2);
    await expect(toolTabs(window).nth(1).locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development / E2E Test / E2E UAT");
    const saved = await window.evaluate(() => JSON.parse(localStorage.getItem("toolbox-session")!).openTools);
    expect(saved.map((entry: { connectionIds: Array<string | null> }) => entry.connectionIds)).toEqual([assignedIds, assignedIds]);
    await window.evaluate(() => window.toolboxAPI.setSetting("restoreSessionOnStartup", true));
    await window.reload();
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
    await expect(toolTabs(window)).toHaveCount(2, { timeout: 15_000 });
    for (const tab of await toolTabs(window).all()) {
        await expect(tab.locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development / E2E Test / E2E UAT");
    }
});

test("duplicate and restore retain a cleared middle slot without shifting the third connection", async ({ electronApp, window }) => {
    await assignConnections(electronApp, window);
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("show-context-menu");
        ipcMain.handle("show-context-menu", async (_event, request: { items: Array<{ id?: string }> }) => (request.items.some((item) => item.id === "clear") ? "clear" : "duplicate-tab"));
    });
    await window.locator('#connection-slot-squares [data-slot-index="1"]').click({ button: "right" });
    await expect(window.locator('#connection-slot-squares [data-slot-index="1"]')).toBeDisabled();
    await toolTabs(window).first().click({ button: "right" });
    await expect(toolTabs(window)).toHaveCount(2);
    const expectedSlots = [assignedIds[0], null, assignedIds[2]];
    await expect
        .poll(() => window.evaluate(() => JSON.parse(localStorage.getItem("toolbox-session")!).openTools.map((entry: { connectionIds: Array<string | null> }) => entry.connectionIds)))
        .toEqual([expectedSlots, expectedSlots]);
    await window.evaluate(() => window.toolboxAPI.setSetting("restoreSessionOnStartup", true));
    await window.reload();
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
    await expect(toolTabs(window)).toHaveCount(2, { timeout: 15_000 });
    await expect
        .poll(() => window.evaluate(() => JSON.parse(localStorage.getItem("toolbox-session")!).openTools.map((entry: { connectionIds: Array<string | null> }) => entry.connectionIds)))
        .toEqual([expectedSlots, expectedSlots]);
});

test("cold app restart restores all three saved slots", async ({ electronApp, window }) => {
    await assignConnections(electronApp, window);
    await window.evaluate(() => window.toolboxAPI.setSetting("restoreSessionOnStartup", true));
    const restartData = await electronApp.evaluate(({ app }) => ({
        userData: app.getPath("userData"),
        registryPath: process.env.PPTB_TEST_REGISTRY_PATH!,
        toolsDirectory: process.env.PPTB_TEST_TOOLS_DIRECTORY!,
    }));
    await electronApp.close();
    const restarted = await electron.launch({
        args: [path.resolve(__dirname, "../../dist/main/index.js"), `--user-data-dir=${restartData.userData}`],
        env: {
            ...process.env,
            NODE_ENV: "test",
            PPTB_DISABLE_AUTO_UPDATE: "1",
            PPTB_TEST_MODE: "1",
            PPTB_TEST_REGISTRY_PATH: restartData.registryPath,
            PPTB_TEST_TOOLS_DIRECTORY: restartData.toolsDirectory,
            SUPABASE_URL: "",
            SUPABASE_ANON_KEY: "",
            AZURE_BLOB_BASE_URL: "",
        },
    });
    try {
        await restarted.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler("set-active-connection");
            ipcMain.handle("set-active-connection", async () => undefined);
        });
        let mainWindow: Page | undefined;
        await expect
            .poll(
                async () => {
                    for (const candidate of restarted.windows()) {
                        if (await candidate.locator(".app-container").count()) {
                            mainWindow = candidate;
                            return true;
                        }
                    }
                    return false;
                },
                { timeout: 15_000 },
            )
            .toBe(true);
        await expect(mainWindow!.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
        await expect(toolTabs(mainWindow!)).toHaveCount(1);
        await expect(toolTabs(mainWindow!).locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development / E2E Test / E2E UAT");
        expect(await mainWindow!.evaluate(() => JSON.parse(localStorage.getItem("toolbox-session")!).openTools[0].connectionIds)).toEqual(assignedIds);
    } finally {
        await restarted.close();
    }
});

test("blocked delete skips confirmation; last close immediately clears footer and permits deletion", async ({ electronApp, window }) => {
    await assignConnections(electronApp, window);
    const instanceId = await toolTabs(window).getAttribute("data-instance-id");
    expect(instanceId).toBeTruthy();
    const savedBeforeDelete = await window.evaluate((id) => window.toolboxAPI.getToolConnectionSlots(id), toolId);
    const rejectedDelete = await window.evaluate(async (id) => {
        try {
            await window.toolboxAPI.connections.delete(id);
            return "deleted";
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }, assignedIds[2]);
    expect(rejectedDelete).toContain("open tools: E2E API Four Connections");
    expect(await window.evaluate((id) => window.toolboxAPI.connections.getById(id), assignedIds[2])).not.toBeNull();
    const confirmations: string[] = [];
    window.on("dialog", async (dialog) => {
        confirmations.push(dialog.message());
        await dialog.accept();
    });
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator(`#sidebar-connections-list [data-action="more"][data-connection-id="${assignedIds[2]}"]`).click();
    await window.locator('[data-menu-action="delete"]').click();
    const blockedPopup = await modalWith(electronApp, "#connection-delete-blocked-close");
    await expect(blockedPopup.locator("main")).toContainText("E2E API Four Connections");
    expect(confirmations).toEqual([]);
    await blockedPopup.locator("#connection-delete-blocked-close").click();
    await toolTabs(window).locator(".tool-tab-close").click();
    await expect(window.locator("#tool-tabs .tool-tab")).toHaveCount(0);
    await expect(window.locator("#connection-slot-squares button")).toHaveCount(0, { timeout: 1_500 });
    await expect(window.locator("#connection-status")).toHaveText("Not Connected", { timeout: 1_500 });
    expect(await window.evaluate((id) => window.toolboxAPI.connections.getDeleteBlocker(id), assignedIds[2])).toBeNull();
    await window.locator(`#sidebar-connections-list [data-action="more"][data-connection-id="${assignedIds[2]}"]`).click();
    await window.locator('[data-menu-action="delete"]').click();
    await expect.poll(() => window.evaluate((id) => window.toolboxAPI.connections.getById(id), assignedIds[2])).toBeNull();
    expect(confirmations).toHaveLength(1);
    expect(await window.evaluate((id) => window.toolboxAPI.getToolConnectionSlots(id), toolId)).toEqual(savedBeforeDelete.map((id) => (id === assignedIds[2] ? null : id)));
});

test("actual package update trims assignments above the new maximum and warns", async ({ electronApp, window }) => {
    const before = ["e2e-dev-connection", null, "e2e-uat-connection", "e2e-production-connection"];
    await window.evaluate(({ id, slots }) => window.toolboxAPI.setToolConnectionSlots(id, slots), { id: toolId, slots: before });
    const updated = await window.evaluate((id) => window.toolboxAPI.updateTool(id), toolId);
    expect(updated.features?.connections).toEqual({ min: 1, max: 2 });
    expect(await window.evaluate((id) => window.toolboxAPI.getToolConnectionSlots(id), toolId)).toEqual([before[0], null]);
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    const settings = JSON.parse(fs.readFileSync(path.join(userDataPath, "user-settings.json"), "utf8"));
    expect(settings.toolConnectionSlots[toolId]).toEqual([before[0], null]);
    await expect
        .poll(async () => {
            for (const candidate of electronApp.windows()) {
                if (await candidate.getByText("Connection Assignments Updated", { exact: true }).count()) return true;
            }
            return false;
        })
        .toBe(true);
    const instanceId = `${toolId}-123-regression`;
    await window.evaluate(({ instanceId, tool, slots }) => window.toolboxAPI.launchToolWindow(instanceId, tool, slots[0], slots[1], slots), { instanceId, tool: updated, slots: before });
    const actualSlots = await electronApp.evaluate(async ({ BrowserWindow }, id) => {
        const mainWindow = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes("Power Platform ToolBox"));
        const view = mainWindow?.getBrowserViews().find((candidate) => candidate.webContents.getURL().includes(id));
        if (!view) throw new Error("Updated tool view not found");
        return view.webContents.executeJavaScript("window.toolboxAPI.getToolContext().then(context => context.connectionIds)");
    }, toolId);
    expect(actualSlots).toEqual([before[0], null]);
});
