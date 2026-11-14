import path from "path";
import { gzipSync } from "zlib";
import { expect, test } from "./fixtures";

test("raw binary and HTTP error metadata survive real IPC and contextBridge", async ({ electronApp, window }) => {
    await expect(window.locator(".app-container")).toBeVisible();
    const source = "name,value\nsample,123\n";
    const gzip = gzipSync(source);
    const bytes = Array.from(gzip);
    const preload = path.resolve(__dirname, "../../dist/main/toolPreloadBridge.js");
    const toolWindowReady = electronApp.waitForEvent("window");
    await electronApp.evaluate(
        async ({ BrowserWindow, ipcMain }, { preload, bytes }) => {
            // Stub the host transport, not IPC or contextBridge. No live credentials or service requests.
            ipcMain.removeHandler("powerplatform.requestRaw");
            ipcMain.handle("powerplatform.requestRaw", (_event, _category, _method, path) => ({
                status: path === "error" ? 429 : 200,
                headers: { "content-type": "application/gzip", "retry-after": "5", location: "https://api.powerplatform.com/analytics/downloads/123" },
                body: new Uint8Array(bytes),
            }));
            const toolWindow = new BrowserWindow({
                show: false,
                webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false },
            });
            await toolWindow.loadURL("about:blank");
        },
        { preload, bytes },
    );
    const toolWindow = await toolWindowReady;
    await toolWindow.waitForLoadState("domcontentloaded");
    try {
        const result = await toolWindow.evaluate(async () => {
            const response = await window.powerplatformAPI.Analytics.Raw.Get("download");
            const decompressed = await new Response(new Blob([new Uint8Array(response.body)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
            let failure: Record<string, unknown> | undefined;
            try {
                await window.powerplatformAPI.Analytics.Raw.Get("error");
            } catch (error) {
                const httpError = error as PowerPlatformAPI.HttpError;
                failure = {
                    name: httpError.name,
                    status: httpError.status,
                    message: httpError.message,
                    retryAfter: httpError.headers["retry-after"],
                    bytes: Array.from(httpError.body),
                };
            }
            return { bytes: Array.from(response.body), isUint8Array: response.body instanceof Uint8Array, decompressed, failure };
        });
        expect(result).toEqual({
            bytes,
            isUint8Array: true,
            decompressed: source,
            failure: { name: "PowerPlatformHttpError", status: 429, message: "HTTP 429", retryAfter: "5", bytes },
        });
    } finally {
        await toolWindow.close();
    }
});
