import { writeFileSync } from "fs";
import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function exampleScript<T>(app: ElectronApplication, script: string): Promise<T> {
    return app.evaluate(async ({ BrowserWindow }, code) => {
        for (const main of BrowserWindow.getAllWindows()) {
            for (const view of main.getBrowserViews()) {
                if (await view.webContents.executeJavaScript('document.title === "Dataverse + F&O Explorer"').catch(() => false)) {
                    return view.webContents.executeJavaScript(`(async () => { ${code} })()`);
                }
            }
        }
        throw new Error("Mixed connection example view missing");
    }, script) as Promise<T>;
}

async function launchExample(app: ElectronApplication, window: Page, connectionIds: string[]): Promise<string> {
    // Authentication is stubbed; the real preload, IPC handlers, API managers,
    // connection target routing and HTTP request construction remain in use.
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    if (await window.locator("#sidebar").evaluate((element) => element.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
    await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-mixed-explorer"]').click();
    let picker: Page | undefined;
    await expect
        .poll(async () => {
            for (const candidate of app.windows()) {
                if (await candidate.locator("#connection-slot-rail").count()) {
                    picker = candidate;
                    return true;
                }
            }
            return false;
        })
        .toBe(true);
    for (const [slot, id] of connectionIds.entries()) {
        await picker!.locator(`[data-slot-row="${slot}"]`).click();
        await picker!.locator(`.connect-button[data-connection-id="${id}"]`).click();
        await expect(picker!.locator(`[data-slot-row="${slot}"] .connection-slot-connected-check`)).toBeVisible();
    }
    await picker!.locator("#confirm-multi-connection-btn").click();
    await expect(window.locator("#tool-tabs")).toContainText("Dataverse + F&O Explorer");
    await expect.poll(() => exampleScript(app, 'return document.getElementById("run").disabled;')).toBe(false);
    const instanceId = await window.locator("#tool-tabs .tool-tab").filter({ hasText: "Dataverse + F&O Explorer" }).getAttribute("data-instance-id");
    expect(instanceId).toBeTruthy();
    return instanceId!;
}

test("mixed example reads both APIs in either slot order and respects reassignment", async ({ electronApp, window }, testInfo) => {
    await window.evaluate(async () => {
        for (const id of ["e2e-dev-connection", "e2e-finops"]) {
            await window.toolboxAPI.connections.update(id, { accessToken: `test-token-${id}`, tokenExpiry: new Date(Date.now() + 3600000).toISOString() });
        }
    });
    await electronApp.evaluate(() => {
        const https = process.getBuiltinModule("https");
        const { EventEmitter } = process.getBuiltinModule("events");
        (globalThis as any).mixedExampleRequests = [];
        https.request = (input: any, optionsOrCallback: any, callback?: any) => {
            const url = input instanceof URL ? input : new URL(`https://${input.hostname}${input.path}`);
            if (!["dev.crm.dynamics.com", "finops.operations.dynamics.com"].includes(url.hostname)) {
                throw new Error(`Unexpected network request: ${url.hostname}`);
            }
            const options = input instanceof URL ? optionsOrCallback : input;
            const respond = input instanceof URL ? callback : optionsOrCallback;
            const request = new EventEmitter();
            request.setTimeout = () => request;
            request.destroy = (error: Error) => {
                request.emit("error", error);
                request.emit("close");
            };
            request.end = () => {
                (globalThis as any).mixedExampleRequests.push({ host: url.hostname, path: url.pathname + url.search, method: options.method, authorization: options.headers.Authorization });
                const response = new EventEmitter();
                const fail = url.searchParams.has("fail");
                response.statusCode = fail ? 403 : 200;
                response.headers = { "content-type": "application/json" };
                respond(response);
                response.emit(
                    "data",
                    Buffer.from(
                        JSON.stringify(
                            fail
                                ? { error: { message: "Customer access denied" } }
                                : {
                                      value: url.hostname === "dev.crm.dynamics.com" ? [{ name: "Dataverse account", accountnumber: "DV-001" }] : [{ CustomerAccount: "FO-001" }],
                                  },
                        ),
                    ),
                );
                response.emit("end");
                request.emit("close");
            };
            return request;
        };
    });
    const instanceId = await launchExample(electronApp, window, ["e2e-finops", "e2e-dev-connection"]);
    for (const ids of [
        ["e2e-finops", "e2e-dev-connection"],
        ["e2e-dev-connection", "e2e-finops"],
    ]) {
        await window.evaluate(({ instanceId, ids }) => window.toolboxAPI.updateToolConnections(instanceId, ids), { instanceId, ids });
        await exampleScript(electronApp, 'document.getElementById("run").click();');
        await expect.poll(() => exampleScript(electronApp, 'return document.getElementById("status").textContent;')).toBe("Both systems read successfully");
        const results = await exampleScript<any>(
            electronApp,
            `return {
            dataverse: JSON.parse(document.getElementById("dataverse-result").textContent),
            finops: JSON.parse(document.getElementById("finops-result").textContent),
            dataverseConnection: document.getElementById("dataverse-connection").textContent,
            finopsConnection: document.getElementById("finops-connection").textContent,
        };`,
        );
        expect(results.dataverse.value[0].accountnumber).toBe("DV-001");
        expect(results.finops.value[0].CustomerAccount).toBe("FO-001");
        expect(results.dataverseConnection).toContain(`Slot ${ids.indexOf("e2e-dev-connection") + 1}`);
        expect(results.finopsConnection).toContain(`Slot ${ids.indexOf("e2e-finops") + 1}`);
    }
    const screenshot = await electronApp.evaluate(async ({ BrowserWindow }) => {
        for (const main of BrowserWindow.getAllWindows()) {
            for (const view of main.getBrowserViews()) {
                if (await view.webContents.executeJavaScript('document.title === "Dataverse + F&O Explorer"').catch(() => false)) {
                    return (await view.webContents.capturePage()).toPNG().toString("base64");
                }
            }
        }
        throw new Error("Mixed connection example view missing");
    });
    const screenshotPath = testInfo.outputPath("mixed-example.png");
    writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
    await testInfo.attach("mixed-example", { path: screenshotPath, contentType: "image/png" });
    const requests = await electronApp.evaluate(() => (globalThis as any).mixedExampleRequests);
    expect(requests).toHaveLength(4);
    for (const request of requests) {
        expect(request.method).toBe("GET");
        if (request.host === "dev.crm.dynamics.com") {
            expect(request.path).toBe("/api/data/v9.2/accounts?$select=name,accountnumber&$top=5");
            expect(request.authorization).toBe("Bearer test-token-e2e-dev-connection");
        } else {
            expect(request.path).toBe("/data/CustomersV3?$top=5");
            expect(request.authorization).toBe("Bearer test-token-e2e-finops");
        }
    }
    // A failed F&O read must leave the successful Dataverse result visible.
    await exampleScript(electronApp, 'document.getElementById("finops-query").value = "CustomersV3?fail=403"; document.getElementById("run").click();');
    await expect.poll(() => exampleScript(electronApp, 'return document.getElementById("status").textContent;')).toContain("Finished with errors");
    expect(await exampleScript(electronApp, 'return document.getElementById("dataverse-result").textContent;')).toContain("DV-001");
    expect(await exampleScript(electronApp, 'return document.getElementById("finops-result").textContent;')).toContain("Customer access denied");
    // The manifest permits any pair of declared products; the example enforces one of each.
    await window.evaluate(({ instanceId }) => window.toolboxAPI.updateToolConnections(instanceId, ["e2e-dev-connection", "e2e-test-connection"]), { instanceId });
    await exampleScript(electronApp, 'document.getElementById("run").click();');
    await expect.poll(() => exampleScript(electronApp, 'return document.getElementById("status").textContent;')).toContain("needs one Dataverse connection and one F&O");
    expect(await electronApp.evaluate(() => (globalThis as any).mixedExampleRequests.length)).toBe(6);
});
