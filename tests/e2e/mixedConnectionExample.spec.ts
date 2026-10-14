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
        await expect(picker!.locator("#connection-slot-purpose")).toContainText(slot === 0 ? "Dataverse accounts" : "F&O customers");
        await expect(picker!.locator(`.connect-button[data-connection-id="${slot === 0 ? "e2e-finops" : "e2e-dev-connection"}"]`)).toHaveCount(0);
        await expect(picker!.locator("#confirm-multi-connection-btn")).toBeDisabled();
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

test.beforeEach(async ({ electronApp, window }) => {
    await window.evaluate(async () => {
        const finance = (await window.toolboxAPI.connections.getAll()).find((connection) => connection.id === "e2e-finops")!;
        await window.toolboxAPI.connections.add({ ...finance, id: "e2e-finops-alt", name: "E2E F&O Alternate", url: "https://alternate.operations.dynamics.com" });
        for (const id of ["e2e-dev-connection", "e2e-test-connection", "e2e-finops", "e2e-finops-alt"]) {
            await window.toolboxAPI.connections.update(id, { accessToken: `test-token-${id}`, tokenExpiry: new Date(Date.now() + 3600000).toISOString() });
        }
    });
    await electronApp.evaluate(() => {
        const https = process.getBuiltinModule("https");
        const { EventEmitter } = process.getBuiltinModule("events");
        (globalThis as any).mixedExampleRequests = [];
        https.request = (input: any, optionsOrCallback: any, callback?: any) => {
            const url = input instanceof URL ? input : new URL(`https://${input.hostname}${input.path}`);
            if (!["dev.crm.dynamics.com", "test.crm.dynamics.com", "finops.operations.dynamics.com", "alternate.operations.dynamics.com"].includes(url.hostname)) {
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
                                ? { error: { message: url.hostname.endsWith("crm.dynamics.com") ? "Account access denied" : "Customer access denied" } }
                                : {
                                      value: url.hostname.endsWith("crm.dynamics.com") ? [{ name: "Dataverse account", accountnumber: "DV-001" }] : [{ CustomerAccount: "FO-001" }],
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
});

test("typed mixed example enforces declared order and routes compatible reassignment", async ({ electronApp, window }, testInfo) => {
    const instanceId = await launchExample(electronApp, window, ["e2e-dev-connection", "e2e-finops"]);
    for (const ids of [
        ["e2e-dev-connection", "e2e-finops"],
        ["e2e-test-connection", "e2e-finops-alt"],
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
        expect(results.dataverseConnection).toContain("Dataverse accounts");
        expect(results.dataverseConnection).toContain("Slot 1");
        expect(results.finopsConnection).toContain("F&O customers");
        expect(results.finopsConnection).toContain("Slot 2");
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
    expect(requests.map((request: any) => request.host).sort()).toEqual(["alternate.operations.dynamics.com", "dev.crm.dynamics.com", "finops.operations.dynamics.com", "test.crm.dynamics.com"]);
    for (const request of requests) {
        expect(request.method).toBe("GET");
        if (request.host.endsWith("crm.dynamics.com")) {
            expect(request.path).toBe("/api/data/v9.2/accounts?$select=name,accountnumber&$top=5");
            expect(request.authorization).toBe(request.host === "dev.crm.dynamics.com" ? "Bearer test-token-e2e-dev-connection" : "Bearer test-token-e2e-test-connection");
        } else {
            expect(request.path).toBe("/data/CustomersV3?$top=5");
            expect(request.authorization).toBe(request.host === "finops.operations.dynamics.com" ? "Bearer test-token-e2e-finops" : "Bearer test-token-e2e-finops-alt");
        }
    }
    // A failed F&O read must leave the successful Dataverse result visible.
    await exampleScript(electronApp, 'document.getElementById("finops-query").value = "CustomersV3?fail=403"; document.getElementById("run").click();');
    await expect.poll(() => exampleScript(electronApp, 'return document.getElementById("status").textContent;')).toContain("Finished with errors");
    expect(await exampleScript(electronApp, 'return document.getElementById("dataverse-result").textContent;')).toContain("DV-001");
    expect(await exampleScript(electronApp, 'return document.getElementById("finops-result").textContent;')).toContain("Customer access denied");
    // A failed Dataverse read must also leave the successful F&O result visible.
    await exampleScript(
        electronApp,
        'document.getElementById("finops-query").value = "CustomersV3?$top=5"; document.getElementById("dataverse-query").value = "accounts?fail=403"; document.getElementById("run").click();',
    );
    await expect.poll(() => exampleScript(electronApp, 'return document.getElementById("status").textContent;')).toContain("Finished with errors");
    expect(await exampleScript(electronApp, 'return document.getElementById("finops-result").textContent;')).toContain("FO-001");
    expect(await exampleScript(electronApp, 'return document.getElementById("dataverse-result").textContent;')).toContain("Account access denied");
    const requestsBeforeRejection = await electronApp.evaluate(() => (globalThis as any).mixedExampleRequests);
    for (const ids of [
        ["e2e-finops", "e2e-dev-connection"],
        ["e2e-dev-connection", "e2e-test-connection"],
        [null, "e2e-finops"],
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
        expect(error).toContain("slot");
        expect(await exampleScript(electronApp, "return (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null);")).toEqual([
            "e2e-test-connection",
            "e2e-finops-alt",
        ]);
        expect(await electronApp.evaluate(() => (globalThis as any).mixedExampleRequests)).toEqual(requestsBeforeRejection);
    }
    expect(requestsBeforeRejection).toHaveLength(8);
});

test("existing mixed-product count declarations still route both APIs in either slot order", async ({ electronApp, window }) => {
    const tool = await window.evaluate(() => window.toolboxAPI.loadTool("e2e-mixed-connections"));
    expect(tool.features).toEqual({ connections: 2, connectionTypes: ["dataverse", "financeOperations"] });
    const instanceId = "e2e-mixed-connections-legacy-routing";
    expect(
        await window.evaluate(({ tool, instanceId }) => window.toolboxAPI.launchToolWindow(instanceId, tool, "e2e-finops", "e2e-dev-connection", ["e2e-finops", "e2e-dev-connection"]), {
            tool,
            instanceId,
        }),
    ).toBe(true);
    for (const ids of [
        ["e2e-finops", "e2e-dev-connection"],
        ["e2e-dev-connection", "e2e-finops"],
    ]) {
        await window.evaluate(({ instanceId, ids }) => window.toolboxAPI.updateToolConnections(instanceId, ids), { instanceId, ids });
        const result = await electronApp.evaluate(async ({ BrowserWindow }) => {
            for (const main of BrowserWindow.getAllWindows())
                for (const view of main.getBrowserViews()) {
                    if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-mixed-connections E2E fixture")').catch(() => false)) {
                        return view.webContents.executeJavaScript(`(async () => {
                        const connections = await toolboxAPI.connections.getConnections();
                        const dataverseTarget = connections.findIndex(connection => (connection?.connectionType ?? "dataverse") === "dataverse");
                        const financeTarget = connections.findIndex(connection => connection?.connectionType === "financeOperations");
                        const accounts = await dataverseAPI.queryData("accounts?$top=1", dataverseTarget);
                        const customers = await financeOperationsAPI.queryData("CustomersV3?$top=1", { connectionTarget: financeTarget });
                        return { ids: connections.map(connection => connection?.id ?? null), dataverseTarget, financeTarget, accounts, customers };
                    })()`);
                    }
                }
            throw new Error("Legacy mixed-product fixture missing");
        });
        expect(result).toMatchObject({
            ids,
            dataverseTarget: ids.indexOf("e2e-dev-connection"),
            financeTarget: ids.indexOf("e2e-finops"),
            accounts: { value: [{ accountnumber: "DV-001" }] },
            customers: { value: [{ CustomerAccount: "FO-001" }] },
        });
    }
    const requests = await electronApp.evaluate(() => (globalThis as any).mixedExampleRequests);
    expect(requests).toHaveLength(4);
    for (const request of requests) {
        expect(request.method).toBe("GET");
        expect(request).toMatchObject(
            request.host === "dev.crm.dynamics.com"
                ? { host: "dev.crm.dynamics.com", path: "/api/data/v9.2/accounts?$top=1", authorization: "Bearer test-token-e2e-dev-connection" }
                : { host: "finops.operations.dynamics.com", path: "/data/CustomersV3?$top=1", authorization: "Bearer test-token-e2e-finops" },
        );
    }
});
