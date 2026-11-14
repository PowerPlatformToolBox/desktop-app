import { EventEmitter } from "events";
import * as https from "https";
import { PassThrough } from "stream";
import { gzipSync, gunzipSync } from "zlib";
import { createPowerPlatformRawClient } from "../../../../src/common/powerplatformApi";
import type { Connection } from "../../../../src/common/types";
import type { AuthManager } from "../../../../src/main/managers/authManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";
import { PowerPlatformManager, type PowerPlatformCategory } from "../../../../src/main/managers/powerplatformManager";
import type { ProxyManager } from "../../../../src/main/managers/proxyManager";

jest.mock("https", () => ({ request: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logError: jest.fn(), logWarn: jest.fn() }));

const requestMock = jest.mocked(https.request);
const operationUrl = "https://api.powerplatform.com/analytics/operations/123?api-version=2024-10-01";
const downloadUrl = "https://api.powerplatform.com/analytics/downloads/123?api-version=2024-10-01";

describe("Power Platform raw and parsed requests", () => {
    let connection: Connection;
    const connections = {
        getConnectionById: jest.fn(() => connection),
        updatePowerPlatformTokens: jest.fn(),
        isPowerPlatformTokenExpired: jest.fn(() => false),
        clearConnectionTokens: jest.fn(),
    };
    const auth = {
        hasAccountInCache: jest.fn().mockResolvedValue(true),
        acquirePowerPlatformToken: jest.fn(),
        authenticateClientSecret: jest.fn(),
        refreshAccessToken: jest.fn(),
    };
    const getAgentForUrl = jest.fn();
    let manager: PowerPlatformManager;

    function respond(status: number, body: Buffer | string = "", headers: Record<string, string | string[]> = {}): void {
        requestMock.mockImplementation((_options: unknown, callback?: unknown) => {
            const response = Object.assign(new PassThrough(), { statusCode: status, headers });
            (callback as (res: typeof response) => void)(response);
            const request = Object.assign(new EventEmitter(), {
                write: jest.fn(),
                end: jest.fn(() => {
                    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
                    response.write(bytes.subarray(0, 3));
                    response.end(bytes.subarray(3));
                }),
            });
            return request as unknown as ReturnType<typeof https.request>;
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        connection = {
            id: "connection-1",
            name: "Test",
            url: "https://test.crm.dynamics.com",
            environment: "Dev",
            createdAt: "2026-01-01",
            authenticationType: "interactive",
            powerPlatformAccessToken: "host-only-test-token",
            powerPlatformTokenExpiry: "2099-01-01",
        };
        manager = new PowerPlatformManager(connections as unknown as ConnectionsManager, auth as unknown as AuthManager, { getAgentForUrl } as unknown as ProxyManager);
        respond(200, "{}");
    });

    function rawClient(category: PowerPlatformCategory = "Analytics") {
        return createPowerPlatformRawClient((method, path, body, headers, _target, options) => manager.requestRaw(connection.id, category, method, path, body, headers, options));
    }

    it("preserves empty 202 responses and normalizes header access", async () => {
        respond(202, "", { Location: operationUrl, "Retry-After": "5", "Content-Type": "application/json" });
        const response = await rawClient().Post("exports?api-version=2024-10-01", { format: "csv" });
        expect(response).toEqual({ status: 202, headers: { location: operationUrl, "retry-after": "5", "content-type": "application/json" }, body: new Uint8Array() });
        expect(getAgentForUrl).toHaveBeenCalledWith("https://api.powerplatform.com/analytics/exports?api-version=2024-10-01");
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                hostname: "api.powerplatform.com",
                method: "POST",
                headers: expect.objectContaining({ authorization: "Bearer host-only-test-token" }),
            }),
            expect.any(Function),
        );
    });

    it("polls a running operation with Retry-After", async () => {
        respond(200, '{"status":"Running"}', { "retry-after": "Fri, 13 Nov 2026 23:00:00 GMT" });
        const response = await rawClient().Get(operationUrl);
        expect(JSON.parse(new TextDecoder().decode(response.body))).toEqual({ status: "Running" });
        expect(response.headers["retry-after"]).toBe("Fri, 13 Nov 2026 23:00:00 GMT");
    });

    it("preserves a succeeded operation's download Location", async () => {
        respond(200, '{"status":"Succeeded"}', { location: downloadUrl });
        expect((await rawClient().Get(operationUrl)).headers.location).toBe(downloadUrl);
    });

    it("preserves multi-chunk gzip file bytes without Content-Encoding", async () => {
        const csv = "name,value\nUnicode,é\nBinary,255";
        const compressed = gzipSync(csv);
        respond(200, compressed, { "content-type": "application/gzip" });
        const response = await rawClient().Get(downloadUrl);
        expect(response.body.constructor).toBe(Uint8Array);
        expect(Buffer.from(response.body)).toEqual(compressed);
        expect(gunzipSync(response.body).toString()).toBe(csv);
        expect(response.headers["content-encoding"]).toBeUndefined();
    });

    it.each([401, 403, 404, 429, 500, 503])("rejects HTTP %i with status, headers, API details and bytes", async (status) => {
        const body = '{"error":{"code":"ApiFailure","message":"Request cannot complete","details":[{"code":"Detail"}]}}';
        respond(status, body, { "retry-after": "10", "x-request-id": "request-123" });
        await expect(rawClient().Get("exports")).rejects.toEqual({
            name: "PowerPlatformHttpError",
            message: "ApiFailure: Request cannot complete",
            code: "ApiFailure",
            status,
            headers: { "retry-after": "10", "x-request-id": "request-123" },
            body: new Uint8Array(Buffer.from(body)),
        });
    });

    it("retains non-JSON error bytes and does not follow redirects", async () => {
        respond(302, "redirect body", { location: "https://untrusted.example/download" });
        await expect(rawClient().Get("exports")).rejects.toMatchObject({ status: 302, message: "HTTP 302", headers: { location: "https://untrusted.example/download" } });
        expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        "http://api.powerplatform.com/analytics/exports",
        "https://api.powerplatform.com.evil.example/analytics/exports",
        "https://api.powerplatform.com@evil.example/analytics/exports",
        "https://user:password@api.powerplatform.com/analytics/exports",
        "https://api.powerplatform.com:444/analytics/exports",
        "https://api.powerplatform.com/governance/exports",
        "https://api.powerplatform.com/analytics-other/exports",
        "https://api.powerplatform.com/analytics/exports#fragment",
        "//evil.example/analytics/exports",
        "../governance/exports",
        "exports/../../governance",
        "exports/%2e%2e/%2e%2e/governance",
        "%252e%252e/governance",
        "exports%2f..%2fgovernance",
        "exports\\..\\governance",
        "https://api.powerplatform.com/analytics/../governance",
        "https://api.powerplatform.com/analytics/%invalid",
    ])("rejects untrusted or ambiguous target before authentication: %s", async (path) => {
        await expect(rawClient().Get(path)).rejects.toThrow("Power Platform");
        expect(auth.acquirePowerPlatformToken).not.toHaveBeenCalled();
        expect(connections.getConnectionById).not.toHaveBeenCalled();
        expect(requestMock).not.toHaveBeenCalled();
    });

    it.each(["Authorization", "authorization", "HOST", "Proxy-Authorization", "Content-Length", "Transfer-Encoding", "Connection"])("protects the %s request header", async (name) => {
        await expect(rawClient().Get("exports", undefined, { [name]: "override" })).rejects.toThrow("host-managed");
        expect(requestMock).not.toHaveBeenCalled();
    });

    it("allows custom Accept and preserves useful repeated response headers", async () => {
        respond(200, "", { "x-detail": ["first", "second"] });
        const response = await rawClient().Get("?api-version=2024-10-01", undefined, { Accept: "application/gzip" });
        expect(response.headers["x-detail"]).toBe("first, second");
        expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ accept: "application/gzip" }) }), expect.any(Function));
    });

    it("rejects invalid categories and methods before token acquisition", async () => {
        await expect(manager.requestRaw(connection.id, "toString" as PowerPlatformCategory, "GET")).rejects.toThrow("category");
        await expect(manager.requestRaw(connection.id, "Analytics", "CONNECT")).rejects.toThrow("method");
        expect(connections.getConnectionById).not.toHaveBeenCalled();
    });

    it("requires delegated user authentication on report routes without disabling unrelated app-only requests", async () => {
        connection.authenticationType = "clientSecret";
        await expect(rawClient("CopilotStudio").Post("licensing/reports/export?api-version=2024-10-01")).rejects.toThrow("delegated");
        await expect(rawClient("CopilotStudio").Post("licensing/%72eports/export")).rejects.toThrow("delegated");
        await expect(rawClient().Get(operationUrl, undefined, undefined, { requireDelegatedAuthentication: true })).rejects.toThrow("delegated");
        expect(requestMock).not.toHaveBeenCalled();
        await expect(rawClient().Get("exports")).resolves.toMatchObject({ status: 200 });
        await expect(manager.request(connection.id, "Analytics", "GET", "exports")).resolves.toEqual({});
    });

    it("refreshes delegated user tokens with the existing MSAL flow", async () => {
        connection.msalAccountId = "account";
        const expiresOn = new Date("2099-01-01");
        auth.acquirePowerPlatformToken.mockResolvedValue({ accessToken: "refreshed-user-token", expiresOn, scopes: ["https://api.powerplatform.com/.default"] });
        await rawClient().Get("exports", undefined, undefined, { requireDelegatedAuthentication: true });
        expect(auth.acquirePowerPlatformToken).toHaveBeenCalledWith(connection);
        expect(connections.updatePowerPlatformTokens).toHaveBeenCalledWith(connection.id, {
            accessToken: "refreshed-user-token",
            expiresOn,
            scopesForPowerPlatformAPI: ["https://api.powerplatform.com/.default"],
        });
    });

    it("retains client-secret refresh for unrelated APIs", async () => {
        connection.authenticationType = "clientSecret";
        connection.powerPlatformAccessToken = undefined;
        const expiresOn = new Date("2099-01-01");
        auth.authenticateClientSecret.mockResolvedValue({ accessToken: "refreshed-app-token", expiresOn });
        await rawClient().Get("exports");
        expect(auth.authenticateClientSecret).toHaveBeenCalledWith(connection, ["https://api.powerplatform.com/.default"], true);
    });

    it.each([
        [200, '{"value":[1]}', { value: [1] }],
        [200, "plain response", "plain response"],
        [202, "", {}],
        [204, "   ", {}],
    ])("preserves parsed response behavior for HTTP %i body %s", async (status, body, expected) => {
        respond(status, body);
        await expect(manager.request(connection.id, "Analytics", "GET", "exports")).resolves.toEqual(expected);
    });

    it("preserves legacy API error messages", async () => {
        respond(403, '{"error":{"code":"Forbidden","message":"Permission required"}}');
        await expect(manager.request(connection.id, "Analytics", "GET", "exports")).rejects.toThrow("Forbidden: Permission required");
    });

    it("surfaces authentication failure without sending an HTTP request", async () => {
        connection.msalAccountId = "account";
        auth.acquirePowerPlatformToken.mockRejectedValueOnce(new Error("Cannot acquire token"));
        await expect(rawClient().Get("exports")).rejects.toThrow("Authentication expired");
        expect(requestMock).not.toHaveBeenCalled();
    });

    it.each(["error", "aborted"])("rejects incomplete response streams on %s", async (event) => {
        requestMock.mockImplementation((_options: unknown, callback?: unknown) => {
            const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
            (callback as (res: typeof response) => void)(response);
            return Object.assign(new EventEmitter(), {
                end: () => response.emit(event, new Error("Partial response")),
            }) as unknown as ReturnType<typeof https.request>;
        });
        await expect(rawClient().Get("exports")).rejects.toThrow(event === "error" ? "stream failed" : "aborted");
    });

    it("rejects network failures without reflecting sensitive transport messages", async () => {
        requestMock.mockImplementation(() => {
            const request = Object.assign(new EventEmitter(), {
                end: () => request.emit("error", new Error("Sensitive transport detail")),
            });
            return request as unknown as ReturnType<typeof https.request>;
        });
        await expect(rawClient().Get("exports")).rejects.toThrow("Power Platform network request failed.");
    });
});
