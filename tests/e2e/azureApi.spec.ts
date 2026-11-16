import path from "path";
import { expect, test } from "./fixtures";

test("Azure denies unregistered senders and preserves structured errors through real IPC/contextBridge", async ({ electronApp, window }) => {
    await expect(window.locator(".app-container")).toBeVisible();
    const preload = path.resolve(__dirname, "../../dist/main/toolPreloadBridge.js");
    const ready = electronApp.waitForEvent("window");
    await electronApp.evaluate(async ({ BrowserWindow }, preload) => {
        const tool = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false } });
        await tool.loadURL("about:blank");
    }, preload);
    const tool = await ready;
    await tool.waitForLoadState("domcontentloaded");
    try {
        const denied = await tool.evaluate(async () => {
            try {
                await window.azureAPI.arm.getConnectionState();
                return null;
            } catch (error) {
                return error;
            }
        });

        expect(denied).toMatchObject({ name: "AzureApiError", code: "capabilityDenied" });
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler("azure:invoke");
            ipcMain.handle("azure:invoke", () => ({
                ok: false,
                error: { name: "AzureApiError", code: "throttled", status: 429, message: "Wait", headers: { "retry-after": "7" }, retryAfterMs: 7000, requestId: "safe-request" },
            }));
        });
        const throttled = await tool.evaluate(async () => {
            try {
                await window.azureAPI.graph.Get("/v1.0/me");
                return null;
            } catch (error) {
                return error;
            }
        });
        expect(throttled).toEqual({ name: "AzureApiError", code: "throttled", status: 429, message: "Wait", headers: { "retry-after": "7" }, retryAfterMs: 7000, requestId: "safe-request" });
        expect(await tool.evaluate(() => "azure" in window.toolboxAPI)).toBe(false);
    } finally {
        await tool.close();
    }
});

test("connection submission requires a client ID for each additional API and authentication type", async ({ electronApp, window }) => {
    await window.locator('[data-sidebar="connections"]').click();
    const ready = electronApp.waitForEvent("window");
    await window.locator("#sidebar-add-connection-btn").click();
    const modal = await ready;
    await expect(modal.locator("#connection-name")).toBeVisible();
    for (const flag of ["enabledForPowerPlatformAPI", "enabledForAzureAPI", "enabledForGraphAPI"]) {
        for (const authenticationType of ["interactive", "usernamePassword", "connectionString", "clientSecret"]) {
            const payload = {
                name: "Missing application",
                url: "https://org.crm.dynamics.com",
                authenticationType,
                username: "user@example.com",
                password: "test-placeholder",
                clientSecret: "test-placeholder",
                tenantId: "11111111-1111-4111-8111-111111111111",
                connectionString: "AuthType=OAuth;Url=https://org.crm.dynamics.com;",
                [flag]: true,
            };
            const feedback = modal.locator("#connection-test-feedback");
            await modal.evaluate((payload) => {
                const feedback = document.getElementById("connection-test-feedback");
                if (feedback) feedback.textContent = "";
                Reflect.get(window, "modalBridge").send("add-connection:submit", payload);
            }, payload);
            await expect(feedback).toContainText(authenticationType === "clientSecret" ? "Client ID, Client Secret, and Tenant ID are required" : "when any additional API is enabled");
            await expect(feedback).toContainText("Client ID");
        }
    }
    await modal.close();
});
