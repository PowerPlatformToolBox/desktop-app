import fs from "fs";
import path from "path";
import { expect, test } from "./fixtures";
import { clickTool, modalWith } from "./connectionTestHelpers";

test.use({ multiConnectionData: true });

test("connection-string parsing and XrmToolBox import retain Dataverse defaults and incomplete-credential warnings", async ({ electronApp, window }) => {
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator("#sidebar-add-connection-btn").click();
    const modal = await modalWith(electronApp, "#connection-type");
    await modal.locator("#connection-name").fill("Connection string fixture");
    await modal.locator("#connection-authentication-type").selectOption("connectionString");
    await modal
        .locator("#connection-string-input")
        .fill("AuthType=ClientSecret;Url=https://string.crm.dynamics.com;ClientId=11111111-1111-1111-1111-111111111111;ClientSecret=test-only-secret;TenantId=22222222-2222-2222-2222-222222222222");
    await modal.locator("#confirm-connection-btn").click();
    await expect(window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "Connection string fixture" }).locator(".connection-product-badge")).toHaveText("Dataverse");
    expect((await window.evaluate(() => globalThis.window.toolboxAPI.connections.getAll())).find((connection) => connection.name === "Connection string fixture")).toMatchObject({
        authenticationType: "clientSecret",
        url: "https://string.crm.dynamics.com",
    });
    const userData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    const file = path.join(userData, "xtb-fixture.xml");
    fs.writeFileSync(
        file,
        `<CrmConnections><Connections>
        <ConnectionDetail><ConnectionName>XTB OAuth fixture</ConnectionName><WebApplicationUrl>https://xtb.crm.dynamics.com/</WebApplicationUrl><NewAuthType>OAuth</NewAuthType><EnvironmentHighlightingInfo><Text>PROD</Text></EnvironmentHighlightingInfo></ConnectionDetail>
        <ConnectionDetail><ConnectionName>XTB incomplete fixture</ConnectionName><OriginalUrl>https://xtb-secret.crm.dynamics.com</OriginalUrl><NewAuthType>ClientSecret</NewAuthType><AzureAdAppId>11111111-1111-1111-1111-111111111111</AzureAdAppId><TenantId>22222222-2222-2222-2222-222222222222</TenantId></ConnectionDetail>
        <ConnectionDetail><ConnectionName>XTB unsupported certificate</ConnectionName><OriginalUrl>https://certificate.crm.dynamics.com</OriginalUrl><NewAuthType>Certificate</NewAuthType></ConnectionDetail>
    </Connections></CrmConnections>`,
    );
    await electronApp.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await window.locator("#sidebar-import-connections-btn").click();
    const source = await modalWith(electronApp, "#card-xtb");
    await source.locator("#card-xtb").click();
    await source.locator("#confirm-import-source-btn").click();
    const imported = window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "XTB" });
    await expect(imported).toHaveCount(2);
    await expect(imported.locator(".connection-product-badge")).toHaveText(["Dataverse", "Dataverse"]);
    await expect(imported.filter({ hasText: "XTB incomplete fixture" }).locator(".connection-warning-badge")).toContainText("Incomplete");
    const records = await window.evaluate(() => globalThis.window.toolboxAPI.connections.getAll());
    expect(records.find((connection) => connection.name === "XTB OAuth fixture")).toMatchObject({ connectionType: "dataverse", environment: "Production", authenticationType: "interactive" });
    expect(records.some((connection) => connection.name === "XTB unsupported certificate")).toBe(false);
});

test("Dataverse add/edit preserves supported authentication options, validates fields and keeps product labels", async ({ electronApp, window }) => {
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator("#sidebar-add-connection-btn").click();
    const modal = await modalWith(electronApp, "#connection-type");
    expect(await modal.locator("#connection-authentication-type option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([
        "interactive",
        "clientSecret",
        "usernamePassword",
        "connectionString",
    ]);
    await modal.locator("#connection-name").fill("UI Dataverse Sandbox");
    await modal.locator("#connection-url").fill("https://sandbox.crm.dynamics.com");
    await modal.locator("#connection-authentication-type").selectOption("clientSecret");
    await modal.locator("#confirm-connection-btn").click();
    await expect(modal.locator("#connection-test-feedback")).not.toBeEmpty();
    await modal.locator("#connection-client-id").fill("11111111-1111-1111-1111-111111111111");
    await modal.locator("#connection-client-secret").fill("test-only-secret");
    await modal.locator("#connection-tenant-id-cs").fill("22222222-2222-2222-2222-222222222222");
    await modal.locator("#confirm-connection-btn").click();
    const row = window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "UI Dataverse Sandbox" });
    await expect(row.locator(".connection-product-badge")).toHaveText("Dataverse");
    await row.locator('[data-action="more"]').click();
    await window.locator('[data-menu-action="edit"]').click();
    const edit = await modalWith(electronApp, "#connection-type");
    await expect(edit.locator("#connection-type")).toBeDisabled();
    await edit.locator("#connection-authentication-type").selectOption("usernamePassword");
    await edit.locator("#connection-username-up").fill("fixture@example.test");
    await edit.locator("#connection-password").fill("test-only-password");
    await edit.locator("#confirm-connection-btn").click();
    await expect
        .poll(() => window.evaluate(async () => (await globalThis.window.toolboxAPI.connections.getAll()).find((connection) => connection.name === "UI Dataverse Sandbox")?.authenticationType))
        .toBe("usernamePassword");
    expect((await window.evaluate(() => globalThis.window.toolboxAPI.connections.exportConnections())).connections.find((connection) => connection.name === "UI Dataverse Sandbox")).not.toHaveProperty(
        "password",
    );
});

test("JSON import/export, incomplete credentials, product search/sort/filter reset and duplicate imports remain compatible", async ({ electronApp, window }) => {
    const userData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    const importFile = path.join(userData, "import-fixture.json");
    const exportedFile = path.join(userData, "export-fixture.json");
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        connections: [
            {
                name: "Imported shared",
                environment: "Dev",
                url: "https://import.crm.dynamics.com",
                authenticationType: "clientSecret",
                clientId: "11111111-1111-1111-1111-111111111111",
                tenantId: "22222222-2222-2222-2222-222222222222",
            },
            {
                name: "Imported shared",
                environment: "Dev",
                connectionType: "financeOperations",
                url: "https://import.operations.dynamics.com/data/",
                authenticationType: "clientSecret",
                clientId: "11111111-1111-1111-1111-111111111111",
                tenantId: "22222222-2222-2222-2222-222222222222",
            },
        ],
    };
    fs.writeFileSync(importFile, JSON.stringify(payload));
    await electronApp.evaluate(
        ({ dialog }, files) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.importFile] });
            dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.exportedFile });
        },
        { importFile, exportedFile },
    );
    await window.locator('[data-sidebar="connections"]').click();
    await window.locator("#sidebar-import-connections-btn").click();
    const source = await modalWith(electronApp, "#card-pptb");
    await source.locator("#card-pptb").click();
    await source.locator("#confirm-import-source-btn").click();
    const rows = window.locator("#sidebar-connections-list .connection-item-pptb").filter({ hasText: "Imported shared" });
    await expect(rows).toHaveCount(2);
    expect((await rows.locator(".connection-product-badge").allTextContents()).sort()).toEqual(["Dataverse", "F&O"]);
    const imported = await window.evaluate(async () => (await globalThis.window.toolboxAPI.connections.getAll()).filter((connection) => connection.name === "Imported shared"));
    expect(imported.find((connection) => connection.connectionType === "financeOperations")?.url).toBe("https://import.operations.dynamics.com");
    expect(imported.every((connection) => !connection.clientSecret && !connection.accessToken)).toBe(true);
    const duplicate = await window.evaluate((payload) => globalThis.window.toolboxAPI.connections.importConnections(payload), payload);
    // Imports deliberately retain duplicates, assigning independent IDs.
    expect(duplicate.imported).toBe(2);
    expect(duplicate.skipped).toBe(0);
    const copies = await window.evaluate(async () => (await globalThis.window.toolboxAPI.connections.getAll()).filter((connection) => connection.name === "Imported shared"));
    expect(new Set(copies.map((connection) => connection.id)).size).toBe(4);
    await window.locator("#connections-search-input").fill("Imported shared");
    await window.locator("#connections-filter-btn").click();
    await window.locator("#connections-sort-select").selectOption("name-desc");
    await window.locator("#connections-type-filter").selectOption("financeOperations");
    await expect(window.locator("#sidebar-connections-list .connection-item-pptb")).toHaveCount(2);
    await window.locator("#connections-filter-clear-btn").click();
    await window.locator("#connections-search-input").fill("");
    await window.locator("#sidebar-export-connections-btn").click();
    await expect.poll(() => fs.existsSync(exportedFile)).toBe(true);
    const exported = JSON.parse(fs.readFileSync(exportedFile, "utf8"));
    expect(exported.connections.filter((connection: any) => connection.name === "Imported shared")).toHaveLength(4);
    for (const connection of exported.connections) {
        expect(connection).not.toHaveProperty("clientSecret");
        expect(connection).not.toHaveProperty("accessToken");
        expect(connection).not.toHaveProperty("refreshToken");
    }
    const missingSecret = await window.evaluate(async (id) => {
        try {
            await globalThis.window.toolboxAPI.connections.authenticate(id);
            return "";
        } catch (error) {
            return (error as Error).message;
        }
    }, imported.find((connection) => connection.connectionType === "financeOperations")!.id);
    expect(missingSecret).toContain("Client Secret");
    await clickTool(window, "e2e-typed-single");
    const picker = await modalWith(electronApp, "#connections-list-container");
    await expect(picker.locator(".connection-name")).not.toContainText(["Imported shared"]);
    await picker.locator("#cancel-select-connection-btn").click();
});

test("real token refresh and test-connection handlers preserve saved state on transport/authentication failures", async ({ electronApp, window }) => {
    await electronApp.evaluate(() => {
        const https: any = process.getBuiltinModule("https");
        const { EventEmitter } = process.getBuiltinModule("events");
        const original = https.request;
        (globalThis as any).connectionAuthFixture = { failToken: false, failProbe: false, requests: [] };
        https.request = (input: any, optionsOrCallback: any, callback?: any) => {
            const url = input instanceof URL ? input : typeof input === "string" ? new URL(input) : new URL(`https://${input.hostname}${input.path}`);
            if (!["login.microsoftonline.com", "auth.operations.dynamics.com", "auth.crm.dynamics.com"].includes(url.hostname)) return original(input, optionsOrCallback, callback);
            const options = input instanceof URL || typeof input === "string" ? optionsOrCallback : input;
            const respond = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
            const request: any = new EventEmitter();
            let body = "";
            request.write = (chunk: any) => {
                body += chunk;
                return true;
            };
            request.setTimeout = () => request;
            request.destroy = (error: Error) => request.emit("error", error);
            request.end = (chunk?: any) => {
                if (chunk) body += chunk;
                process.nextTick(() => {
                    const state = (globalThis as any).connectionAuthFixture;
                    state.requests.push({ host: url.hostname, path: url.pathname, scope: new URLSearchParams(body).get("scope"), method: options?.method });
                    const response: any = new EventEmitter();
                    response.headers = { "content-type": "application/json" };
                    const token = url.pathname.endsWith("/token");
                    const probe = url.hostname.endsWith("dynamics.com");
                    response.statusCode = token && state.failToken ? 400 : probe && state.failProbe ? 403 : 200;
                    const tenant = "22222222-2222-2222-2222-222222222222";
                    const authority = `https://login.microsoftonline.com/${tenant}`;
                    const result = token
                        ? state.failToken
                            ? { error: "invalid_grant", error_description: "Fixture credentials rejected" }
                            : { access_token: "fixture-renewed-token", token_type: "Bearer", expires_in: 3600, ext_expires_in: 3600, scope: new URLSearchParams(body).get("scope") }
                        : probe
                        ? state.failProbe
                            ? { error: { message: "Fixture permission denied" } }
                            : { value: [] }
                        : url.pathname.includes("discovery/instance")
                        ? {
                              tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`,
                              metadata: [{ preferred_network: "login.microsoftonline.com", preferred_cache: "login.microsoftonline.com", aliases: ["login.microsoftonline.com", "login.windows.net"] }],
                          }
                        : {
                              authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
                              token_endpoint: `${authority}/oauth2/v2.0/token`,
                              issuer: `${authority}/v2.0`,
                              jwks_uri: `${authority}/discovery/v2.0/keys`,
                              end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
                          };
                    if (respond) respond(response);
                    else request.emit("response", response);
                    response.emit("data", Buffer.from(JSON.stringify(result)));
                    response.emit("end");
                    request.emit("close");
                });
            };
            return request;
        };
    });
    const original = await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-dev-connection"));
    await window.evaluate(async (original) => {
        await globalThis.window.toolboxAPI.connections.add({
            ...original!,
            id: "e2e-renewal",
            name: "Renewal fixture",
            url: "https://auth.crm.dynamics.com",
            accessToken: "expired-fixture-token",
            refreshToken: "fixture-refresh",
            tokenExpiry: new Date(0).toISOString(),
        });
    }, original);
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.isTokenExpired("e2e-renewal"))).toBe(true);
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.refreshToken("e2e-renewal"))).toEqual({ success: true });
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.isTokenExpired("e2e-renewal"))).toBe(false);
    const refreshed = await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-renewal"));
    await electronApp.evaluate(() => {
        (globalThis as any).connectionAuthFixture.failToken = true;
    });
    const failedRefresh = await window.evaluate(async () => {
        try {
            await globalThis.window.toolboxAPI.connections.refreshToken("e2e-renewal");
            return "";
        } catch (error) {
            return (error as Error).message;
        }
    });
    expect(failedRefresh).toContain("Fixture credentials rejected");
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-renewal"))).toEqual(refreshed);
    await electronApp.evaluate(() => {
        (globalThis as any).connectionAuthFixture.failToken = false;
    });
    const finance = {
        ...original!,
        id: "e2e-auth-finance",
        name: "Finance auth fixture",
        connectionType: "financeOperations" as const,
        url: "https://auth.operations.dynamics.com",
        authenticationType: "clientSecret" as const,
        clientId: "11111111-1111-1111-1111-111111111111",
        tenantId: "22222222-2222-2222-2222-222222222222",
        clientSecret: "test-only-secret",
    };
    await window.evaluate((finance) => globalThis.window.toolboxAPI.connections.add(finance), finance);
    const beforeProbe = await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-auth-finance"));
    expect(await window.evaluate((finance) => globalThis.window.toolboxAPI.connections.test(finance), finance)).toEqual({ success: true });
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-auth-finance"))).toEqual(beforeProbe);
    await electronApp.evaluate(() => {
        (globalThis as any).connectionAuthFixture.failProbe = true;
    });
    const denied = await window.evaluate((finance) => globalThis.window.toolboxAPI.connections.test(finance), finance);
    expect(denied.success).toBe(false);
    expect(denied.error).toContain("F&O access was denied");
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.getById("e2e-auth-finance"))).toEqual(beforeProbe);
    await electronApp.evaluate(() => {
        (globalThis as any).connectionAuthFixture.failProbe = false;
    });
    await window.evaluate(() => globalThis.window.toolboxAPI.connections.update("e2e-auth-finance", { tokenExpiry: new Date(0).toISOString() }));
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.isTokenExpired("e2e-auth-finance"))).toBe(true);
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.refreshToken("e2e-auth-finance"))).toEqual({ success: true });
    expect(await window.evaluate(() => globalThis.window.toolboxAPI.connections.isTokenExpired("e2e-auth-finance"))).toBe(false);
    const requests = await electronApp.evaluate(() => (globalThis as any).connectionAuthFixture.requests);
    expect(requests.some((request: any) => request.scope === "https://auth.operations.dynamics.com/.default")).toBe(true);
    expect(requests.some((request: any) => request.scope === "https://auth.crm.dynamics.com/.default")).toBe(true);
});
