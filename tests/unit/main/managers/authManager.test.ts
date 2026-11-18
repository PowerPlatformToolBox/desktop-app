import { ConfidentialClientApplication, INetworkModule, PublicClientApplication } from "@azure/msal-node";
import { EventEmitter } from "events";
import * as https from "https";
import type { Connection } from "../../../../src/common/types";
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

const ENVIRONMENT_TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_TENANT = "11111111-2222-3333-4444-555555555555";

function accessTokenFor(tenantId: string): string {
    return `header.${Buffer.from(JSON.stringify({ tid: tenantId })).toString("base64url")}.signature`;
}

function guestConnection(overrides: Partial<Connection> = {}): Connection {
    return {
        id: "test",
        name: "Guest",
        url: "https://org.crm.dynamics.com/",
        environment: "Dev",
        authenticationType: "interactive",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("Guest environment authority", () => {
    const getAgentForUrl = jest.fn(() => ({ proxy: "configured-agent" }));
    let manager: AuthManager;
    let internal: {
        parseEnvironmentTenant(header: string | string[] | undefined): string | undefined;
        resolveAuthorityTenant(connection: Connection): Promise<{ authorityTenant: string; environmentTenant?: string }>;
        getMsalApp(connectionId: string, clientId: string, tenantId: string): PublicClientApplication;
        assertEnvironmentToken(accessToken: string, environmentTenant?: string): boolean;
    };
    let tokenTenant = ENVIRONMENT_TENANT;

    beforeEach(() => {
        jest.clearAllMocks();
        tokenTenant = ENVIRONMENT_TENANT;
        manager = new AuthManager({} as BrowserManager, { getAgentForUrl } as unknown as ProxyManager);
        internal = manager as unknown as typeof internal;
        (https.request as jest.Mock).mockImplementation((options: { path?: string }, callback: (response: EventEmitter) => void) => {
            const response = Object.assign(new EventEmitter(), {
                statusCode: 200,
                headers: {} as Record<string, string>,
                resume: jest.fn(),
            });
            const request = Object.assign(new EventEmitter(), { end: jest.fn(), write: jest.fn(), destroy: jest.fn() });
            if (options.path?.includes("WhoAmI")) {
                response.statusCode = 401;
                response.headers["www-authenticate"] = `Bearer authorization_uri=https://login.microsoftonline.com/${ENVIRONMENT_TENANT}/oauth2/authorize, resource_id=https://org.crm.dynamics.com/`;
                callback(response);
                return request;
            }
            callback(response);
            process.nextTick(() => {
                response.emit("data", JSON.stringify({ access_token: accessTokenFor(tokenTenant), expires_in: 3600 }));
                response.emit("end");
            });
            return request;
        });
    });

    it("reads the environment tenant from a quoted or bare authorization challenge", () => {
        expect(internal.parseEnvironmentTenant('Bearer authorization_uri="https://login.microsoftonline.com/tenant-guid/oauth2/authorize"')).toBe("tenant-guid");
        expect(internal.parseEnvironmentTenant(["Bearer authorization_uri=https://login.microsoftonline.com/from-array/oauth2/authorize"])).toBe("from-array");
        expect(internal.parseEnvironmentTenant("Bearer authorization_uri=https://login.microsoftonline.com/organizations/oauth2/authorize")).toBeUndefined();
        expect(internal.parseEnvironmentTenant(undefined)).toBeUndefined();
    });

    it("uses the discovered environment tenant when the connection tenant is empty or an alias", async () => {
        await expect(internal.resolveAuthorityTenant(guestConnection())).resolves.toEqual({
            authorityTenant: ENVIRONMENT_TENANT,
            environmentTenant: ENVIRONMENT_TENANT,
        });
        await expect(internal.resolveAuthorityTenant(guestConnection({ tenantId: "organizations" }))).resolves.toEqual({
            authorityTenant: ENVIRONMENT_TENANT,
            environmentTenant: ENVIRONMENT_TENANT,
        });
        expect(https.request).toHaveBeenCalledTimes(1);
        expect(getAgentForUrl).toHaveBeenCalledWith("https://org.crm.dynamics.com/api/data/v9.2/WhoAmI");
    });

    it("keeps an explicit tenant as the authority", async () => {
        await expect(internal.resolveAuthorityTenant(guestConnection({ tenantId: OTHER_TENANT }))).resolves.toEqual({
            authorityTenant: OTHER_TENANT,
            environmentTenant: ENVIRONMENT_TENANT,
        });
    });

    it("replaces the cached public client when the authority changes", () => {
        internal.getMsalApp("test", "client", "organizations");
        internal.getMsalApp("test", "client", ENVIRONMENT_TENANT);
        expect(PublicClientApplication).toHaveBeenCalledTimes(2);
        expect(PublicClientApplication).toHaveBeenLastCalledWith(expect.objectContaining({ auth: expect.objectContaining({ authority: `https://login.microsoftonline.com/${ENVIRONMENT_TENANT}` }) }));
    });

    it("refreshes through the discovered tenant and rejects a home-directory token", async () => {
        const refreshed = await manager.refreshAccessToken(guestConnection({ tenantId: "common" }), "refresh-token");
        expect(refreshed.accessToken).toBe(accessTokenFor(ENVIRONMENT_TENANT));
        const tokenRequest = (https.request as jest.Mock).mock.calls.map((call) => call[0]).find((options) => String(options.path).includes("/token"));
        expect(tokenRequest.path).toBe(`/${ENVIRONMENT_TENANT}/oauth2/v2.0/token`);

        tokenTenant = OTHER_TENANT;
        await expect(manager.refreshAccessToken(guestConnection({ id: "other", tenantId: OTHER_TENANT }), "refresh-token")).rejects.toThrow(
            `Signed in to the wrong directory. This environment is in tenant ${ENVIRONMENT_TENANT}.`,
        );
        const explicitRequest = (https.request as jest.Mock).mock.calls
            .map((call) => call[0])
            .filter((options) => String(options.path).includes("/token"))
            .at(-1);
        expect(explicitRequest.path).toBe(`/${OTHER_TENANT}/oauth2/v2.0/token`);
        await expect(manager.refreshAccessToken(guestConnection({ id: "mismatch" }), "refresh-token")).rejects.toThrow("Signed in to the wrong directory");
        await expect(manager.refreshAccessToken(guestConnection({ id: "mismatch-permission" }), "refresh-token")).rejects.not.toThrow("You do not have permission");
    });

    it("reports a directory match without treating a missing tenant claim as a mismatch", () => {
        expect(internal.assertEnvironmentToken(accessTokenFor(ENVIRONMENT_TENANT), ENVIRONMENT_TENANT)).toBe(true);
        expect(internal.assertEnvironmentToken("not-a-jwt", ENVIRONMENT_TENANT)).toBe(false);
        expect(() => internal.assertEnvironmentToken(accessTokenFor(OTHER_TENANT), ENVIRONMENT_TENANT)).toThrow("Signed in to the wrong directory");
    });
});
