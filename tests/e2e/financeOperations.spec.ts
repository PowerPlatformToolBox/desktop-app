import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

test("filters connection products and clears the selection", async ({ window }) => {
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator("#connections-filter-btn").click();
    await window.locator("#connections-type-filter").selectOption("financeOperations");
    const rows = window.locator("#sidebar-connections-list .connection-item-pptb");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("F&O");
    await window.locator("#connections-type-filter").selectOption("dataverse");
    await expect(rows).toHaveCount(4);
    await window.locator("#connections-filter-clear-btn").click();
    await expect(window.locator("#connections-type-filter")).toHaveValue("");
    await expect(rows).toHaveCount(5);
});

async function modalWith(app: ElectronApplication, selector: string): Promise<Page> {
    let page: Page | undefined;
    await expect.poll(async () => {
        for (const candidate of app.windows()) {
            if (await candidate.locator(selector).count()) { page = candidate; return true; }
        }
        return false;
    }).toBe(true);
    return page!;
}

test("adds and edits F&O through the regular connection UI", async ({ electronApp, window }) => {
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator("#sidebar-add-connection-btn").click();
    const modal = await modalWith(electronApp, "#connection-type");
    await modal.locator("#connection-type").selectOption("financeOperations");
    await expect(modal.locator("#finance-operations-help")).toBeVisible();
    await expect(modal.locator("#power-platform-api-wrapper")).toBeHidden();
    await expect(modal.locator("#test-connection-btn")).toBeVisible();
    await expect(modal.locator("#connection-optional-client-id-label")).toHaveText("Client ID (Required)");
    await modal.locator("#connection-name").fill("UI F&O Sandbox");
    await modal.locator("#connection-url").fill("https://sandbox.operations.dynamics.com/data/");
    await modal.locator("#confirm-connection-btn").click();
    await expect(modal.locator("#connection-test-feedback")).toContainText("requires a client ID and tenant ID");
    await modal.locator("#connection-optional-client-id").fill("11111111-1111-1111-1111-111111111111");
    await modal.locator("#connection-tenant-id").fill("22222222-2222-2222-2222-222222222222");
    await expect(modal.locator("#configure-app-btn")).toBeHidden();
    await modal.locator("#confirm-connection-btn").click();
    const row = window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "UI F&O Sandbox" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("F&O");
    const saved = await window.evaluate(async () => (await window.toolboxAPI.connections.getAll()).find((connection) => connection.name === "UI F&O Sandbox"));
    expect(saved).toMatchObject({ connectionType: "financeOperations", url: "https://sandbox.operations.dynamics.com", authenticationType: "interactive", enabledForPowerPlatformAPI: false });
    await row.locator('[data-action="more"]').click();
    await window.locator('[data-menu-action="edit"]').click();
    const edit = await modalWith(electronApp, "#connection-type");
    await expect(edit.locator("#connection-type")).toHaveValue("financeOperations");
    await expect(edit.locator("#connection-type")).toBeDisabled();
    await edit.locator("#connection-authentication-type").selectOption("clientSecret");
    await edit.locator("#connection-client-id").fill("11111111-1111-1111-1111-111111111111");
    await edit.locator("#connection-tenant-id-cs").fill("22222222-2222-2222-2222-222222222222");
    await edit.locator("#connection-client-secret").fill("test-only-secret");
    await edit.locator("#confirm-connection-btn").click();
    await expect.poll(() => window.evaluate(async () => (await window.toolboxAPI.connections.getAll()).find((connection) => connection.name === "UI F&O Sandbox")?.authenticationType)).toBe("clientSecret");
});

test("F&O-only picker hides Dataverse impersonation", async ({ electronApp, window }) => {
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) await window.locator('[data-sidebar="tools"]').click();
    await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-finops-connection"]').click();
    const picker = await modalWith(electronApp, "#connections-list-container");
    await expect(picker.locator(".connection-item")).toHaveCount(1);
    await expect(picker.locator(".impersonate-checkbox-row")).toBeHidden();
    await picker.close();
});

test("switching a mixed slot to F&O clears Dataverse impersonation", async ({ electronApp, window }) => {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) await window.locator('[data-sidebar="tools"]').click();
    await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-mixed-connections"]').click();
    const picker = await modalWith(electronApp, "#connection-slot-rail");
    await picker.locator('.slot-impersonate-checkbox[data-connection-id="e2e-dev-connection"]').check();
    await expect(picker.locator('[data-slot-row="0"] .connection-slot-impersonation-icon')).toBeVisible();
    await picker.locator('.connect-button[data-connection-id="e2e-finops"]').click();
    await expect(picker.locator('[data-slot-row="0"] .connection-slot-connected-check')).toBeVisible();
    await expect(picker.locator('[data-slot-row="0"] .connection-slot-impersonation-icon')).toHaveCount(0);
    await picker.locator("#cancel-select-multi-connection-btn").click();
});

test("tool facade reads service document and XML through the real IPC handler", async ({ electronApp, window }) => {
    await window.evaluate(() => window.toolboxAPI.connections.update("e2e-finops", { accessToken: "e2e-only-token", tokenExpiry: new Date(Date.now() + 3600000).toISOString() }));
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
        const https = process.getBuiltinModule("https");
        const { EventEmitter } = process.getBuiltinModule("events");
        const originalRequest = https.request;
        https.request = (url: URL, options: unknown, callback: (response: unknown) => void) => {
            if (url.hostname !== "finops.operations.dynamics.com") return originalRequest(url, options, callback);
            const request = new EventEmitter();
            request.destroy = (error: Error) => { request.emit("error", error); request.emit("close"); };
            request.end = () => {
                const response = new EventEmitter();
                response.statusCode = url.searchParams.has("fail") ? 429 : 200; response.headers = { "retry-after": "10", "x-ms-request-id": "e2e-trace" };
                callback(response);
                response.emit("data", Buffer.from(url.searchParams.has("fail") ? '{"error":{"message":"throttled"}}' : url.pathname.endsWith("/$metadata") ? "<Edmx />" : '{"value":[{"name":"CustomersV3","kind":"EntitySet","url":"CustomersV3"}]}'));
                response.emit("end"); request.emit("close");
            };
            return request;
        };
    });
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) await window.locator('[data-sidebar="tools"]').click();
    await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-finops-connection"]').click();
    const picker = await modalWith(electronApp, "#connections-list-container");
    await picker.locator('.connection-item[data-connection-id="e2e-finops"]').click();
    await picker.locator("#connect-selected-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("E2E F&O Connection");
    const result = await electronApp.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes("Power Platform ToolBox"))!;
        for (const view of main.getBrowserViews()) {
            if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-finops-connection E2E fixture")')) {
                return view.webContents.executeJavaScript(`(async () => {
                    const document = await window.financeOperationsAPI.getServiceDocument();
                    const metadata = await window.financeOperationsAPI.getMetadata();
                    let rejected;
                    try { await window.financeOperationsAPI.queryData("https://other.example/data/CustomersV3"); } catch (error) { rejected = error.message; }
                    let httpError;
                    try { await window.financeOperationsAPI.queryData("CustomersV3?fail=429"); } catch (error) { httpError = { status: error.status, requestId: error.requestId, retryAfter: error.retryAfter }; }
                    return { document, metadata, rejected, httpError };
                })()`);
            }
        }
        throw new Error("F&O tool view missing");
    });
    expect(result).toMatchObject({ document: { value: [{ name: "CustomersV3" }] }, metadata: "<Edmx />" });
    expect(result.rejected).toContain("selected environment");
    expect(result.httpError).toEqual({ status: 429, requestId: "e2e-trace", retryAfter: "10" });
});
