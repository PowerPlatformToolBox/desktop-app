import { ConfidentialClientApplication, INetworkModule, PublicClientApplication } from "@azure/msal-node";
import { EventEmitter } from "events";
import * as https from "https";
import { AuthManager } from "../../../../src/main/managers/authManager";
import type { BrowserManager } from "../../../../src/main/managers/browserManager";
import type { ProxyManager } from "../../../../src/main/managers/proxyManager";

jest.mock("@azure/msal-node", () => ({
    PublicClientApplication: jest.fn(),
    ConfidentialClientApplication: jest.fn(),
    LogLevel: { Warning: 2 },
}));
jest.mock("https", () => ({ request: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logError: jest.fn(), logInfo: jest.fn(), logWarn: jest.fn() }));
jest.mock("../../../../src/main/managers/browserManager", () => ({ BrowserManager: jest.fn() }));

describe("Authentication proxy routing", () => {
    const getAgentForUrl = jest.fn();
    let internal: {
        createNetworkClient(): INetworkModule;
        getMsalApp(connectionId: string, clientId: string, tenantId: string): PublicClientApplication;
        getConfidentialApp(connectionId: string, clientId: string, clientSecret: string, tenantId: string): ConfidentialClientApplication;
        makeAuthenticatedRequest(url: string, token: string): Promise<string>;
        makeHttpsRequest(url: string, body: string): Promise<string>;
    };
    let response: EventEmitter & { statusCode: number; headers: Record<string, string | string[]> };
    let request: EventEmitter & { end: jest.Mock; write: jest.Mock; destroy: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        const manager = new AuthManager({} as BrowserManager, { getAgentForUrl } as unknown as ProxyManager);
        internal = manager as unknown as typeof internal;
        getAgentForUrl.mockReturnValue({ proxy: "configured-agent" });
        response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "application/json", "set-cookie": ["first", "second"] } });
        request = Object.assign(new EventEmitter(), { end: jest.fn(), write: jest.fn(), destroy: jest.fn() });
        (https.request as jest.Mock).mockImplementation((...args: unknown[]) => {
            const callback = args[args.length - 1] as (incomingResponse: typeof response) => void;
            callback(response);
            return request;
        });
    });

    it("installs the proxy-aware transport on both MSAL client types", () => {
        internal.getMsalApp("public", "client", "tenant");
        internal.getConfidentialApp("confidential", "client", "secret", "tenant");
        for (const constructor of [PublicClientApplication, ConfidentialClientApplication]) {
            expect(constructor).toHaveBeenCalledWith(
                expect.objectContaining({
                    system: expect.objectContaining({ networkClient: { sendGetRequestAsync: expect.any(Function), sendPostRequestAsync: expect.any(Function) } }),
                }),
            );
        }
    });

    it.each(["GET", "POST"])("routes MSAL %s requests and preserves response metadata", async (method) => {
        const client = internal.createNetworkClient();
        const url = "https://login.microsoftonline.com/tenant/oauth2/v2.0/token";
        const options = { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: method === "POST" ? "code=test-code" : undefined };
        const result = method === "GET" ? client.sendGetRequestAsync(url, options) : client.sendPostRequestAsync(url, options);
        response.emit("data", Buffer.from('{"access_token":"test-token"}'));
        response.emit("end");
        await expect(result).resolves.toEqual({ status: 200, body: { access_token: "test-token" }, headers: { "content-type": "application/json", "set-cookie": "first, second" } });
        expect(https.request).toHaveBeenCalledWith(url, expect.objectContaining({ method, agent: getAgentForUrl.mock.results[0].value, headers: options.headers }), expect.any(Function));
        expect(getAgentForUrl).toHaveBeenCalledWith(url);
        expect(request.end).toHaveBeenCalledWith(options.body);
    });

    it("returns OAuth error responses to MSAL rather than treating them as transport errors", async () => {
        response.statusCode = 400;
        const result = internal.createNetworkClient().sendPostRequestAsync("https://login.microsoftonline.com/token");
        response.emit("data", Buffer.from('{"error":"invalid_grant"}'));
        response.emit("end");
        await expect(result).resolves.toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    });

    it("resolves the current proxy settings on each request", async () => {
        const client = internal.createNetworkClient();
        for (const agent of [{ proxy: "changed-agent" }, undefined]) {
            getAgentForUrl.mockReturnValue(agent);
            const result = client.sendGetRequestAsync("https://login.microsoftonline.com/discovery");
            response.emit("data", Buffer.from("{}"));
            response.emit("end");
            await result;
            expect(https.request).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ agent }), expect.any(Function));
            response.removeAllListeners();
        }
    });

    it("rejects transport errors and destroys stalled requests", async () => {
        const result = internal.createNetworkClient().sendGetRequestAsync("https://login.microsoftonline.com/discovery");
        request.emit("timeout");
        expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: "Authentication network request timed out" }));
        request.emit("error", new Error("proxy unavailable"));
        await expect(result).rejects.toThrow("proxy unavailable");
    });

    it("does not expose response bodies when a proxy returns non-JSON content", async () => {
        response.statusCode = 407;
        const result = internal.createNetworkClient().sendGetRequestAsync("https://login.microsoftonline.com/discovery");
        response.emit("data", Buffer.from("<html>private proxy response</html>"));
        response.emit("end");
        await expect(result).rejects.toThrow("Authentication endpoint returned an invalid JSON response (HTTP 407)");
    });

    it.each(["GET", "POST"])("routes the existing authentication %s helper through the shared proxy manager", async (method) => {
        const url = "https://example.crm.dynamics.com/api/data/v9.2/WhoAmI";
        const result = method === "GET" ? internal.makeAuthenticatedRequest(url, "token") : internal.makeHttpsRequest(url, "body");
        response.emit("data", '{"UserId":"user"}');
        response.emit("end");
        await expect(result).resolves.toBe('{"UserId":"user"}');
        expect(https.request).toHaveBeenCalledWith(expect.objectContaining({ method, agent: getAgentForUrl.mock.results[0].value }), expect.any(Function));
        expect(getAgentForUrl).toHaveBeenCalledWith(url);
    });
});
