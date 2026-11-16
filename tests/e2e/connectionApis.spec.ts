import type { ElectronApplication, Page } from "playwright";
import fs from "fs";
import path from "path";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function openSelector(window: Page, electronApp: ElectronApplication, id: string, multiple = false): Promise<Page> {
    if (await window.locator("#sidebar").evaluate((sidebar) => sidebar.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
    const ready = electronApp.waitForEvent("window");
    await window.locator(`.tool-item-pptb[data-tool-id="${id}"]`).click();
    const modal = await ready;
    await expect(modal.locator(multiple ? "#slot-connection-list" : "#connections-list-container")).toBeVisible();
    return modal;
}

test("single selector uses compact badges and warns without blocking connections", async ({ electronApp, window }, testInfo) => {
    const modal = await openSelector(window, electronApp, "e2e-required-apis-single");
    const banner = modal.locator("#power-platform-api-info");
    await expect(banner).toHaveText("Required APIs: PP, ARM, Graph. Choose connections with matching tags.");
    const cards = modal.locator(".connection-item");
    const all = cards.filter({ hasText: "E2E Development" });
    await expect(all.locator(".power-platform-api-badge")).toHaveText("PP, ARM, Graph");
    await expect(all.locator(".power-platform-api-badge")).toHaveAttribute("title", /Power Platform API, Azure Resource Manager API, Microsoft Graph API/);
    await all.locator(".power-platform-api-badge").focus();
    await expect(all.locator(".power-platform-api-badge")).toBeFocused();
    expect(await modal.locator(".modal-body").evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
    await modal.screenshot({ path: testInfo.outputPath("api-selector.png") });
    const ppOnly = cards.filter({ hasText: "E2E Test" });
    await expect(ppOnly.locator(".power-platform-api-badge")).toHaveText("PP");
    await ppOnly.click();
    await expect(banner).toHaveText("Selected connection missing: ARM, Graph.");
    await expect(modal.locator("#connect-selected-connection-btn")).toBeEnabled();
    await all.click();
    await expect(banner).toContainText("Required APIs: PP, ARM, Graph.");
    await expect(cards.filter({ hasText: "E2E Production" }).locator(".power-platform-api-badge")).toHaveCount(0);
    await expect(cards.filter({ hasText: "E2E UAT" }).locator(".power-platform-api-badge")).toHaveText("ARM, Graph");
});

test("multi selector preserves API flags and updates warnings for assigned slots", async ({ electronApp, window }) => {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    const modal = await openSelector(window, electronApp, "e2e-required-apis-multi", true);
    const banner = modal.locator("#power-platform-api-info-multi");
    await expect(banner).toContainText("Required APIs: PP, ARM, Graph.");
    await expect(modal.locator('[data-connection-id="e2e-dev-connection"] .power-platform-api-badge')).toHaveText("PP, ARM, Graph");
    await modal.locator('.connect-button[data-connection-id="e2e-test-connection"]').click();
    await expect(banner).toHaveText("Selected connection missing: ARM, Graph.");
    await modal.locator('.connect-button[data-connection-id="e2e-dev-connection"]').click();
    await expect(banner).toContainText("Required APIs: PP, ARM, Graph.");
});

test("legacy PP requirement remains visible and optional ARM does not become required", async ({ electronApp, window }) => {
    const modal = await openSelector(window, electronApp, "e2e-legacy-api");
    await expect(modal.locator("#power-platform-api-info")).toHaveText("Required APIs: PP. Choose connections with matching tags.");
});

test("tools with no required APIs have no banner", async ({ electronApp, window }) => {
    const modal = await openSelector(window, electronApp, "e2e-single-connection");
    await expect(modal.locator("#power-platform-api-info")).toBeHidden();
});

test("the host honors features.apis from the loaded manifest and rejects conflicts", async ({ electronApp, window }) => {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    const modal = await openSelector(window, electronApp, "e2e-required-apis-single");
    await modal.locator('.connection-item[data-connection-id="e2e-dev-connection"]').click();
    await modal.locator("#connect-selected-connection-btn").click();
    await expect(window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Required APIs Single" })).toHaveCount(1);
    const states = await electronApp.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes("Power Platform ToolBox"));
        for (const view of main?.getBrowserViews() ?? []) {
            if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-required-apis-single E2E fixture")')) {
                return view.webContents.executeJavaScript("Promise.all([window.azureAPI.arm.getConnectionState(), window.azureAPI.graph.getConnectionState()])");
            }
        }
        throw new Error("Tool view not found");
    });
    expect(states).toEqual([expect.objectContaining({ configured: true, connectionId: "e2e-dev-connection" }), expect.objectContaining({ configured: true, connectionId: "e2e-dev-connection" })]);
    const userData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    const manifestPath = path.join(userData, "tools", "e2e-required-apis-single", "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.features.enabledForPowerPlatformAPI = false;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const conflict = await electronApp.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes("Power Platform ToolBox"));
        for (const view of main?.getBrowserViews() ?? []) {
            if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-required-apis-single E2E fixture")')) {
                return view.webContents.executeJavaScript("window.azureAPI.arm.getConnectionState().catch(error => error)");
            }
        }
        throw new Error("Tool view not found");
    });
    expect(conflict).toMatchObject({ name: "AzureApiError", code: "capabilityDenied", message: expect.stringContaining("conflicting") });
});
