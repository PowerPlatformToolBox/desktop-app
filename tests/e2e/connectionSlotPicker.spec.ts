import type { ElectronApplication, Page } from "playwright";
import { writeFileSync } from "fs";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function sessionIds(window: Page, id: string): Promise<Array<string | null> | undefined> {
    return window.evaluate((id) => JSON.parse(localStorage.getItem("toolbox-session") ?? "{}").openTools?.find((entry: any) => entry.toolId === id)?.connectionIds, id);
}

async function picker(app: ElectronApplication, selector = "#connection-slot-rail"): Promise<Page> {
    let page: Page | undefined;
    await expect
        .poll(async () => {
            for (const candidate of app.windows())
                if (await candidate.locator(selector).count()) {
                    page = candidate;
                    return true;
                }
            return false;
        })
        .toBe(true);
    return page!;
}

async function launch(window: Page, app: ElectronApplication, id: string, selector?: string): Promise<Page> {
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) await window.locator('[data-sidebar="tools"]').click();
    if (!(await window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${id}"]`).isVisible())) await window.locator('[data-sidebar="tools"]').click();
    await window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${id}"]`).click();
    return picker(app, selector);
}

async function select(modal: Page, slot: number, id: string): Promise<void> {
    await modal.locator(`[data-slot-row="${slot}"] .connection-slot-button`).click();
    await modal.locator(`.connect-button[data-connection-id="${id}"]`).click();
    await expect(modal.locator(`[data-slot-row="${slot}"] .connection-slot-connected-check`)).toBeVisible();
}

test("typed slots show purpose and product filters during launch and reassignment", async ({ electronApp, window }, testInfo) => {
    const modal = await launch(window, electronApp, "e2e-typed-connections");
    await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
    await expect(modal.locator("#add-connection-slot-btn")).toHaveCount(0);
    await expect(modal.locator("#connection-slot-purpose")).toHaveText("Choose a connection for Dataverse accounts");
    await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(4);
    await expect(modal.locator("#slot-connection-list .connection-product-badge")).toHaveText(["Dataverse", "Dataverse", "Dataverse", "Dataverse"]);
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
    await select(modal, 0, "e2e-dev-connection");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
    await modal.locator('[data-slot-row="1"] .connection-slot-button').click();
    await expect(modal.locator("#connection-slot-purpose")).toHaveText("Choose a connection for F&O customers");
    await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(1);
    await expect(modal.locator("#slot-connection-list .connection-product-badge")).toHaveText("F&O");
    await expect(modal.locator("#slot-connection-list .connection-product-badge")).toHaveAttribute("aria-label", "Dynamics 365 Finance & Operations");
    await modal.locator("#multi-connection-search").fill("no matching record");
    await expect(modal.locator("#connection-slot-purpose")).toContainText("F&O customers");
    await expect(modal.locator(".empty-state")).toContainText("compatible connection");
    await modal.locator("#multi-connection-search").fill("finance & operations");
    await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(1);
    await modal.locator("#multi-connection-search").fill("");
    await select(modal, 1, "e2e-finops");
    await expect(modal.locator('[data-slot-row="1"] .connection-product-badge')).toHaveText("F&O");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    const screenshotPath = testInfo.outputPath("typed-picker.png");
    writeFileSync(screenshotPath, await modal.screenshot());
    await testInfo.attach("typed-picker", { path: screenshotPath, contentType: "image/png" });
    await modal.locator("#confirm-multi-connection-btn").click();
    const tab = window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Typed Connections" });
    await expect(tab).toBeVisible();
    await expect(tab.locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development · Dataverse / E2E Finance Operations · F&O");
    await expect.poll(() => sessionIds(window, "e2e-typed-connections")).toEqual(["e2e-dev-connection", "e2e-finops"]);
    const square = window.locator('#connection-slot-squares [data-slot-index="1"]');
    await expect(square).toHaveAttribute("title", /F&O customers/);
    await square.click();
    const change = await picker(electronApp, "#connections-list-container");
    await expect(change.locator("h3")).toHaveText("Choose a connection for F&O customers");
    await expect(change.locator(".connection-item")).toHaveCount(1);
    await expect(change.locator("#clear-selected-connection-btn")).toHaveCount(0);
    await change.locator("#cancel-select-connection-btn").click();
    expect(await sessionIds(window, "e2e-typed-connections")).toEqual(["e2e-dev-connection", "e2e-finops"]);
    const alternateId = await window.evaluate(async () => {
        const original = await window.toolboxAPI.connections.getById("e2e-finops");
        await window.toolboxAPI.connections.add({ ...original!, id: "e2e-finops-reporting", name: "F&O reporting" });
        return (await window.toolboxAPI.connections.getAll()).find((connection) => connection.name === "F&O reporting")!.id;
    });
    await square.click();
    const replace = await picker(electronApp, "#connections-list-container");
    await expect(replace.locator("h3")).toHaveText("Choose a connection for F&O customers");
    await replace.locator(`.connection-item[data-connection-id="${alternateId}"]`).click();
    await replace.locator("#connect-selected-connection-btn").click();
    await expect.poll(() => sessionIds(window, "e2e-typed-connections")).toEqual(["e2e-dev-connection", alternateId]);
    expect(await window.evaluate(() => window.toolboxAPI.getToolConnectionSlots("e2e-typed-connections"))).toEqual(["e2e-dev-connection", alternateId]);
    await expect(tab.locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development · Dataverse / F&O reporting · F&O");
});

test("optional holes keep required indexes and author labels are escaped", async ({ electronApp, window }) => {
    const modal = await launch(window, electronApp, "e2e-typed-optional");
    await expect(modal.locator("[data-slot-row]")).toHaveCount(3);
    await expect(modal.locator("#connection-slot-purpose")).toContainText('Accounts </script><img src=x onerror="window.slotLabelInjected=true">');
    expect(await modal.evaluate(() => (window as any).slotLabelInjected)).toBeUndefined();
    await expect(modal.locator('[data-slot-row="0"] img')).toHaveCount(0);
    await select(modal, 0, "e2e-dev-connection");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
    await select(modal, 1, "e2e-finops");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    await modal.locator('[data-slot-row="0"] [data-clear-slot="0"]').click();
    await expect(modal.locator("[data-slot-row]")).toHaveCount(3);
    await expect(modal.locator('[data-slot-row="1"]')).toContainText("E2E Finance Operations");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    await modal.locator('[data-slot-row="2"] .connection-slot-button').click();
    await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(5);
    await modal.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed Optional");
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
    expect(await window.evaluate(() => window.toolboxAPI.getOpenToolWindows())).toHaveLength(1);
    expect((await window.evaluate(() => window.toolboxAPI.getUserSettings())).lastUsedTools).toEqual(expect.arrayContaining([expect.objectContaining({ toolId: "e2e-typed-optional" })]));
    await window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Typed Optional" }).locator(".tool-tab-close").click();
    await expect(window.locator("#home-view")).toBeVisible();
    const recent = window.locator("#recently-used-tools-list .quick-tool-item").filter({ hasText: "E2E Typed Optional" });
    await expect(recent.locator(".quick-tool-connection")).toContainText("E2E Finance Operations · F&O");
    await recent.click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed Optional");
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
    await window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Typed Optional" }).locator(".tool-tab-close").click();
    await expect
        .poll(() =>
            electronApp.evaluate(({ Menu }) => {
                const findRecent = (items: any[]): any => {
                    for (const item of items) {
                        if (item.label === "Open Recent") return item.submenu;
                        const nested = item.submenu && findRecent(item.submenu.items);
                        if (nested) return nested;
                    }
                };
                return findRecent(Menu.getApplicationMenu()?.items ?? [])?.items.map((item: any) => item.label) ?? [];
            }),
        )
        .toContain("E2E Typed Optional (E2E Finance Operations · F&O)");
    await electronApp.evaluate(({ Menu }) => {
        const openRecent = (items: any[]): boolean => {
            for (const item of items) {
                if (item.label === "E2E Typed Optional (E2E Finance Operations · F&O)") {
                    item.click();
                    return true;
                }
                if (item.submenu && openRecent(item.submenu.items)) return true;
            }
            return false;
        };
        if (!openRecent(Menu.getApplicationMenu()?.items ?? [])) throw new Error("Recent menu entry missing");
    });
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
    await window.evaluate(() => window.toolboxAPI.setSetting("restoreSessionOnStartup", true));
    await window.reload();
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed Optional", { timeout: 15_000 });
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
});

test("one explicit required slot shows its purpose in the single picker", async ({ electronApp, window }) => {
    const modal = await launch(window, electronApp, "e2e-typed-single", "#connections-list-container");
    await expect(modal.locator("h3")).toHaveText("Choose a connection for F&O customer lookup");
    await expect(modal.locator(".connection-item")).toHaveCount(1);
    await expect(modal.locator(".connection-product-badge")).toHaveText("F&O");
    await modal.locator('.connection-item[data-connection-id="e2e-finops"]').click();
    await modal.locator("#connect-selected-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed Single");
});

test("all optional slots can launch unassigned and preserve fixed rows", async ({ electronApp, window }) => {
    const modal = await launch(window, electronApp, "e2e-typed-all-optional");
    await expect(modal.locator("[data-slot-row]")).toHaveCount(1);
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    await modal.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed All Optional");
    await expect.poll(() => sessionIds(window, "e2e-typed-all-optional")).toEqual([null]);
});

test("ten explicit required slots enforce the final required index", async ({ electronApp, window }) => {
    const modal = await launch(window, electronApp, "e2e-typed-ten");
    await expect(modal.locator("[data-slot-row]")).toHaveCount(10);
    for (let slot = 0; slot < 9; slot++) await select(modal, slot, "e2e-dev-connection");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
    await select(modal, 9, "e2e-dev-connection");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    await modal.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Typed Ten");
    await expect.poll(() => sessionIds(window, "e2e-typed-ten")).toEqual(Array(10).fill("e2e-dev-connection"));
});

test("same-name connections retain distinct product labels in the sidebar and both pickers", async ({ electronApp, window }) => {
    await window.evaluate(async () => {
        for (const id of ["e2e-dev-connection", "e2e-finops"]) await window.toolboxAPI.connections.update(id, { name: "Shared customer environment" });
    });
    await window.locator('[data-sidebar="connections"]').click();
    const rows = window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "Shared customer environment" });
    await expect(rows).toHaveCount(2);
    expect((await rows.locator(".connection-product-badge").allTextContents()).sort()).toEqual(["Dataverse", "F&O"]);
    await window.locator("#global-search-btn").click();
    await window.locator("#global-search-input").fill("Shared customer environment");
    const searchRows = window.locator(".global-search-item").filter({ hasText: "Shared customer environment" });
    await expect(searchRows).toHaveCount(2);
    expect((await searchRows.locator(".global-search-item-desc").allTextContents()).some((text) => text.startsWith("F&O"))).toBe(true);
    expect((await searchRows.locator(".global-search-item-desc").allTextContents()).some((text) => text.startsWith("Dataverse"))).toBe(true);
    await window.locator("#global-search-close-btn").click();
    const single = await launch(window, electronApp, "e2e-typed-single", "#connections-list-container");
    await expect(single.locator(".connection-name")).toHaveText("Shared customer environment");
    await expect(single.locator(".connection-product-badge")).toHaveText("F&O");
    await single.locator("#cancel-select-connection-btn").click();
    const mixed = await launch(window, electronApp, "e2e-mixed-connections");
    await expect(mixed.locator('[data-connection-id="e2e-dev-connection"] .connection-product-badge')).toHaveText("Dataverse");
    await expect(mixed.locator('[data-connection-id="e2e-finops"] .connection-product-badge')).toHaveText("F&O");
    await mixed.locator("#cancel-select-multi-connection-btn").click();
});

test("a narrow dark picker retains purpose labels and supports keyboard selection", async ({ electronApp, window }, testInfo) => {
    await window.evaluate(() => {
        document.body.classList.add("dark-theme");
        document.body.classList.remove("light-theme");
    });
    const modal = await launch(window, electronApp, "e2e-typed-optional");
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        for (const candidate of BrowserWindow.getAllWindows()) {
            if (await candidate.webContents.executeJavaScript('Boolean(document.getElementById("connection-slot-rail"))')) candidate.setContentSize(640, 640);
        }
    });
    await expect.poll(() => modal.evaluate(() => window.innerWidth)).toBe(640);
    const required = modal.locator('[data-slot-row="1"] .connection-slot-button');
    await required.focus();
    await required.press("Enter");
    await expect(modal.locator("#connection-slot-purpose")).toHaveText("Choose a connection for Required F&O customers");
    const connect = modal.locator('.connect-button[data-connection-id="e2e-finops"]');
    await connect.focus();
    await connect.press("Enter");
    await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
    expect(await modal.locator("#connection-slot-rail").evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
    const screenshotPath = testInfo.outputPath("typed-picker-dark-narrow.png");
    writeFileSync(screenshotPath, await modal.screenshot());
    await testInfo.attach("typed-picker-dark-narrow", { path: screenshotPath, contentType: "image/png" });
    await modal.locator("#confirm-multi-connection-btn").focus();
    await modal.locator("#confirm-multi-connection-btn").press("Enter");
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
});

test("invocation prompts show slot purposes and keep an explicitly cleared inherited optional slot empty", async ({ electronApp, window }) => {
    const source = await launch(window, electronApp, "e2e-invocation-caller");
    await source.locator("#add-connection-slot-btn").click();
    await select(source, 0, "e2e-dev-connection");
    await source.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E Invocation Caller");
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        for (const main of BrowserWindow.getAllWindows())
            for (const view of main.getBrowserViews()) {
                if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-invocation-caller E2E fixture")')) {
                    await view.webContents.executeJavaScript('window.toolboxAPI.invocation.launchTool("e2e-typed-optional").catch(() => {}); true;');
                    return;
                }
            }
        throw new Error("Caller tool missing");
    });
    const modal = await picker(electronApp);
    await expect(modal.locator('[data-slot-row="0"]')).toContainText("E2E Development");
    await modal.locator('[data-clear-slot="0"]').click();
    await modal.locator('[data-slot-row="1"] .connection-slot-button').click();
    await expect(modal.locator("#connection-slot-purpose")).toHaveText("Choose a connection for Required F&O customers");
    await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(1);
    await select(modal, 1, "e2e-finops");
    await modal.locator("#confirm-multi-connection-btn").click();
    const callee = window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Typed Optional" });
    await expect(callee).toBeVisible();
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
    await callee.locator(".tool-tab-close").click();
});

test("restoration after a slot product changes prompts before authenticating the incompatible saved assignment", async ({ electronApp, window }) => {
    const initial = await launch(window, electronApp, "e2e-typed-optional");
    await select(initial, 1, "e2e-finops");
    await initial.locator("#confirm-multi-connection-btn").click();
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-finops", null]);
    await electronApp.evaluate(({ ipcMain }) => {
        const fs = process.getBuiltinModule("fs");
        const path = process.getBuiltinModule("path");
        const manifestPath = path.join(process.env.PPTB_TEST_TOOLS_DIRECTORY!, "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.tools.find((tool: any) => tool.id === "e2e-typed-optional").features = {
            connections: {
                slots: [
                    { label: "Optional comparison", required: false },
                    { label: "Required Dataverse accounts" },
                    { label: "Optional F&O customers", required: false, connectionTypes: ["financeOperations"] },
                ],
            },
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        (globalThis as any).typedRestoreAuthenticationIds = [];
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async (_event, id) => {
            (globalThis as any).typedRestoreAuthenticationIds.push(id);
        });
    });
    await window.evaluate(async () => {
        await window.toolboxAPI.loadTool("e2e-typed-optional");
        await window.toolboxAPI.setSetting("restoreSessionOnStartup", true);
    });
    await window.reload();
    const restored = await picker(electronApp);
    expect(await electronApp.evaluate(() => (globalThis as any).typedRestoreAuthenticationIds)).toEqual([]);
    await expect(restored.locator('[data-slot-row="1"]')).toContainText("Not selected");
    await expect(restored.locator('[data-slot-row="2"]')).toContainText("Not selected");
    await restored.locator('[data-slot-row="1"] .connection-slot-button').click();
    await expect(restored.locator("#connection-slot-purpose")).toHaveText("Choose a connection for Required Dataverse accounts");
    await expect(restored.locator("#slot-connection-list .connection-item")).toHaveCount(4);
    await select(restored, 1, "e2e-dev-connection");
    await restored.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => sessionIds(window, "e2e-typed-optional")).toEqual([null, "e2e-dev-connection", null]);
});
