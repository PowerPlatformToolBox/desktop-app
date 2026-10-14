import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

test.beforeEach(async ({ electronApp, window }) => {
    await electronApp.evaluate(() => {
        const fs = process.getBuiltinModule("fs");
        const path = process.getBuiltinModule("path");
        for (const id of ["e2e-typed-optional", "e2e-single-connection", "e2e-no-connection"]) {
            const directory = path.join(process.env.PPTB_TEST_TOOLS_DIRECTORY!, id);
            fs.writeFileSync(
                path.join(directory, "pptb.config.json"),
                JSON.stringify({
                    agents: { invokable: true, executionModes: ["windowed", "headless"], modes: ["one-way", "two-way"], headlessEntry: "dist/headless.cjs" },
                    invocation: { prefill: { type: "object", properties: {} }, returnTopic: { type: "object", properties: {} } },
                }),
            );
            fs.writeFileSync(
                path.join(directory, "dist", "headless.cjs"),
                `
                exports.invokeHeadless = async (input, context) => {
                    const tool = await toolboxAPI.getToolContext();
                    const saved = await toolboxAPI.connections.getConnections();
                    const result = { ids: tool.connectionIds, names: tool.connectionNames, urls: tool.connectionUrls, saved };
                    if (context.connectionIds && context.connectionIds[1]) result.customers = await financeOperationsAPI.queryData("CustomersV3?$top=1", { connectionTarget: 1 });
                    if (context.connectionIds && context.connectionIds[0]) result.accounts = await dataverseAPI.queryData("accounts?$top=1", "primary");
                    if (!context.connectionIds) result.callbackTokenPresent = !!context.authToken;
                    return result;
                };
            `,
            );
        }
        const https: any = process.getBuiltinModule("https");
        const { EventEmitter } = process.getBuiltinModule("events");
        const originalRequest = https.request;
        (globalThis as any).slotMcpRequests = [];
        https.request = (input: any, optionsOrCallback: any, callback?: any) => {
            const url = input instanceof URL ? input : new URL(`https://${input.hostname}${input.path}`);
            if (!["dev.crm.dynamics.com", "finops.operations.dynamics.com"].includes(url.hostname)) return originalRequest(input, optionsOrCallback, callback);
            const options = input instanceof URL ? optionsOrCallback : input;
            const respond = input instanceof URL ? callback : optionsOrCallback;
            const request: any = new EventEmitter();
            request.setTimeout = () => request;
            request.destroy = (error: Error) => request.emit("error", error);
            request.end = () => {
                (globalThis as any).slotMcpRequests.push({ host: url.hostname, path: url.pathname + url.search, authorization: options.headers.Authorization });
                const response: any = new EventEmitter();
                response.statusCode = 200;
                response.headers = { "content-type": "application/json" };
                respond(response);
                response.emit("data", Buffer.from(JSON.stringify({ value: url.hostname === "dev.crm.dynamics.com" ? [{ name: "MCP account" }] : [{ CustomerAccount: "MCP-001" }] })));
                response.emit("end");
                request.emit("close");
            };
            return request;
        };
    });
    await window.evaluate(async () => {
        for (const id of ["e2e-dev-connection", "e2e-finops"]) {
            await globalThis.window.toolboxAPI.connections.update(id, { accessToken: `mcp-test-${id}`, tokenExpiry: new Date(Date.now() + 3600000).toISOString() });
        }
        await globalThis.window.toolboxAPI.loadTool("e2e-typed-optional");
        await globalThis.window.toolboxAPI.loadTool("e2e-single-connection");
    });
});

test("MCP executes real headless entries with null slots and routes both product APIs", async ({ electronApp, window }) => {
    const details = await window.evaluate(() => globalThis.window.toolboxAPI.mcpServer.start());
    const client = new Client({ name: "pptb-slot-e2e", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${details.address}/mcp`), { requestInit: { headers: { [details.authHeaderName]: details.authHeaderValue } } }));
        const listed = await client.listTools();
        const typed = listed.tools.find((tool) => tool.name === "e2e-typed-optional")!;
        expect(JSON.stringify(typed.inputSchema)).toContain('"type":["string","null"]');
        expect(JSON.stringify(typed.inputSchema)).toContain("Required F&O customers");
        for (const primary of [null, "E2E Development"]) {
            const response = await client.callTool({ name: typed.name, arguments: { __pptb: { executionMode: "headless", mode: "two-way", connectionNames: [primary, "E2E Finance Operations"] } } });
            expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
            expect(response.structuredContent).toMatchObject({
                ids: [primary ? "e2e-dev-connection" : null, "e2e-finops", null],
                names: [primary, "E2E Finance Operations", null],
                customers: { value: [{ CustomerAccount: "MCP-001" }] },
            });
            expect(JSON.stringify(response.structuredContent)).not.toContain("mcp-test-");
        }
        const requests = await electronApp.evaluate(() => (globalThis as any).slotMcpRequests);
        expect(requests).toEqual([
            { host: "finops.operations.dynamics.com", path: "/data/CustomersV3?$top=1", authorization: "Bearer mcp-test-e2e-finops" },
            { host: "finops.operations.dynamics.com", path: "/data/CustomersV3?$top=1", authorization: "Bearer mcp-test-e2e-finops" },
            { host: "dev.crm.dynamics.com", path: "/api/data/v9.2/accounts?$top=1", authorization: "Bearer mcp-test-e2e-dev-connection" },
        ]);
        for (const metadata of [
            { connectionNames: [null, "E2E Development"] },
            { connectionName: "E2E Finance Operations" },
            { connectionNames: ["E2E Development"] },
            { authToken: "token-only" },
            { connectionNames: [null, "Missing environment"] },
        ]) {
            const rejected = await client.callTool({ name: typed.name, arguments: { __pptb: { executionMode: "headless", mode: "two-way", ...metadata } } });
            expect(rejected.isError).toBe(true);
            expect(await electronApp.evaluate(() => (globalThis as any).slotMcpRequests)).toEqual(requests);
        }
        const legacy = await client.callTool({ name: "e2e-single-connection", arguments: { __pptb: { executionMode: "headless", mode: "two-way", authToken: "callback-only" } } });
        expect(legacy.isError, JSON.stringify(legacy.content)).not.toBe(true);
        expect(legacy.structuredContent).toMatchObject({ callbackTokenPresent: true });
        for (const metadata of [{ connectionName: " E2E Development " }, { connectionNames: ["E2E Development"] }]) {
            const named = await client.callTool({ name: "e2e-single-connection", arguments: { __pptb: { executionMode: "headless", mode: "two-way", ...metadata } } });
            expect(named.isError, JSON.stringify(named.content)).not.toBe(true);
            expect(named.structuredContent).toMatchObject({ ids: ["e2e-dev-connection"], accounts: { value: [{ name: "MCP account" }] } });
        }
        const zero = await client.callTool({ name: "e2e-no-connection", arguments: { __pptb: { executionMode: "headless", mode: "two-way", connectionNames: [] } } });
        expect(zero.isError).not.toBe(true);
        expect(zero.structuredContent).toMatchObject({ ids: [], saved: [] });
        const countBeforeFailures = await electronApp.evaluate(() => (globalThis as any).slotMcpRequests.length);
        await window.evaluate(async () => {
            const finance = await globalThis.window.toolboxAPI.connections.getById("e2e-finops");
            await globalThis.window.toolboxAPI.connections.add({ ...finance!, id: "e2e-ambiguous-finance" });
        });
        const ambiguous = await client.callTool({ name: typed.name, arguments: { __pptb: { executionMode: "headless", mode: "two-way", connectionNames: [null, "E2E Finance Operations"] } } });
        expect(ambiguous.isError).toBe(true);
        expect(JSON.stringify(ambiguous.content)).toContain("Multiple connections");
        await window.evaluate(async () => {
            await globalThis.window.toolboxAPI.connections.delete("e2e-ambiguous-finance");
            await globalThis.window.toolboxAPI.connections.update("e2e-finops", { accessToken: "expired", tokenExpiry: new Date(0).toISOString() });
        });
        const expired = await client.callTool({ name: typed.name, arguments: { __pptb: { executionMode: "headless", mode: "two-way", connectionNames: [null, "E2E Finance Operations"] } } });
        expect(expired.isError).toBe(true);
        expect(JSON.stringify(expired.content)).toContain("requires interactive sign-in");
        expect(await electronApp.evaluate(() => (globalThis as any).slotMcpRequests.length)).toBe(countBeforeFailures);
    } finally {
        await client.close();
        await window.evaluate(() => globalThis.window.toolboxAPI.mcpServer.stop());
    }
});

test("windowed MCP opens the purpose-labeled picker and preserves the optional leading hole", async ({ electronApp, window }) => {
    const details = await window.evaluate(() => globalThis.window.toolboxAPI.mcpServer.start());
    const client = new Client({ name: "pptb-windowed-slot-e2e", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${details.address}/mcp`), { requestInit: { headers: { [details.authHeaderName]: details.authHeaderValue } } }));
        const response = await client.callTool({ name: "e2e-typed-optional", arguments: { __pptb: { executionMode: "windowed", mode: "one-way" } } });
        expect(response.isError).not.toBe(true);
        let picker = window;
        await expect
            .poll(async () => {
                for (const candidate of electronApp.windows())
                    if (await candidate.locator("#connection-slot-rail").count()) {
                        picker = candidate;
                        return true;
                    }
                return false;
            })
            .toBe(true);
        await picker.locator('[data-slot-row="1"]').click();
        await expect(picker.locator("#connection-slot-purpose")).toContainText("Required F&O customers");
        await expect(picker.locator("#confirm-multi-connection-btn")).toBeDisabled();
        await expect(picker.locator('.connect-button[data-connection-id="e2e-dev-connection"]')).toHaveCount(0);
        await picker.locator('.connect-button[data-connection-id="e2e-finops"]').click();
        await picker.locator("#confirm-multi-connection-btn").click();
        await expect
            .poll(() =>
                electronApp.evaluate(async ({ BrowserWindow }) => {
                    for (const main of BrowserWindow.getAllWindows())
                        for (const view of main.getBrowserViews()) {
                            if (await view.webContents.executeJavaScript('document.body.innerText.includes("e2e-typed-optional E2E fixture")').catch(() => false)) {
                                return view.webContents.executeJavaScript("(async () => (await toolboxAPI.connections.getConnections()).map(connection => connection?.id ?? null))()");
                            }
                        }
                    return null;
                }),
            )
            .toEqual([null, "e2e-finops", null]);
    } finally {
        await client.close();
        await window.evaluate(() => globalThis.window.toolboxAPI.mcpServer.stop());
    }
});
