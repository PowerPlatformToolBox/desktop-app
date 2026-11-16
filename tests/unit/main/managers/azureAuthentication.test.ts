import { PublicClientApplication, ConfidentialClientApplication } from "@azure/msal-node";
import * as http from "http";
import { createHash } from "crypto";
import type { Connection } from "../../../../src/common/types";
import { AuthManager } from "../../../../src/main/managers/authManager";
import { BrowserManager } from "../../../../src/main/managers/browserManager";
import type { ProxyManager } from "../../../../src/main/managers/proxyManager";

jest.mock("@azure/msal-node", () => ({
    PublicClientApplication: jest.fn(),
    ConfidentialClientApplication: jest.fn(),
    LogLevel: { Warning: 2 },
}));
jest.mock("../../../../src/common/logger", () => ({ logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() }));
jest.mock("../../../../src/main/managers/browserManager");

const arm = ["https://management.azure.com/.default"];
const graph = ["https://graph.microsoft.com/User.Read"];
const account = { homeAccountId: "selected-account", tenantId: "tenant", username: "user@example.test" };
const otherAccount = { homeAccountId: "other-account", tenantId: "tenant", username: "other@example.test" };

describe("Additional resource authentication", () => {
    let manager: AuthManager;
    let browser: BrowserManager;
    let connection: Connection;
    const silent = jest.fn();
    const byCode = jest.fn();
    const bySecret = jest.fn();
    const authUrl = jest.fn();
    const allAccounts = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        browser = new BrowserManager();
        manager = new AuthManager(browser, { getAgentForUrl: jest.fn() } as unknown as ProxyManager);
        connection = {
            id: "connection",
            name: "Dataverse",
            url: "https://org.crm.dynamics.com",
            environment: "Dev",
            authenticationType: "interactive",
            createdAt: "",
            clientId: "connection-client-id",
            tenantId: "tenant",
            msalAccountId: account.homeAccountId,
        };
        (PublicClientApplication as jest.Mock).mockImplementation(() => ({
            acquireTokenSilent: silent,
            getTokenCache: () => ({ getAllAccounts: allAccounts }),
            getAuthCodeUrl: authUrl,
            acquireTokenByCode: byCode,
        }));
        (ConfidentialClientApplication as jest.Mock).mockImplementation(() => ({ acquireTokenByClientCredential: bySecret }));
        allAccounts.mockResolvedValue([otherAccount, account]);
        silent.mockResolvedValue({ accessToken: "resource-token" });
        bySecret.mockResolvedValue({ accessToken: "application-token" });
        byCode.mockResolvedValue({ accessToken: "interactive-token", account });
    });

    it("uses the exact Dataverse account and separately acquires each audience", async () => {
        const signal = new AbortController().signal;
        await expect(manager.acquireAzureToken(connection, arm, false, false, signal)).resolves.toBe("resource-token");
        expect(silent).toHaveBeenLastCalledWith(expect.objectContaining({ account, scopes: arm, forceRefresh: false, authority: "https://login.microsoftonline.com/tenant" }));
        await manager.acquireAzureToken(connection, graph, false, true, signal);
        expect(silent).toHaveBeenLastCalledWith(expect.objectContaining({ account, scopes: graph, forceRefresh: true }));
        expect(PublicClientApplication).toHaveBeenCalledWith(
            expect.objectContaining({
                auth: { clientId: "connection-client-id", authority: "https://login.microsoftonline.com/tenant" },
                system: expect.objectContaining({ networkClient: expect.any(Object) }),
            }),
        );
        expect(browser.openBrowserWithProfile).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent renewal and does not fall back to another cached user", async () => {
        const signal = new AbortController().signal;
        await Promise.all([manager.acquireAzureToken(connection, arm, false, false, signal), manager.acquireAzureToken(connection, arm, false, false, signal)]);
        expect(silent).toHaveBeenCalledTimes(1);
        allAccounts.mockResolvedValue([otherAccount]);
        await expect(manager.acquireAzureToken(connection, arm, false, false, signal)).rejects.toMatchObject({ code: "notConnected" });
    });

    it("returns only safe selected-account metadata and does not claim a persisted token is a cached sign-in", async () => {
        await expect(manager.getAzureAccount(connection)).resolves.toEqual({ accountId: account.homeAccountId, tenantId: "tenant", displayName: "user@example.test" });
        allAccounts.mockResolvedValue([]);
        await expect(manager.getAzureAccount(connection)).resolves.toBeNull();
        expect(silent).not.toHaveBeenCalled();
    });

    it("does not bypass MFA/Conditional Access with username/password fallback", async () => {
        silent.mockRejectedValue({ errorCode: "interaction_required" });
        connection.authenticationType = "usernamePassword";
        await expect(manager.acquireAzureToken(connection, arm, false, false, new AbortController().signal)).rejects.toMatchObject({ code: "interactionRequired" });
        expect(browser.openBrowserWithProfile).not.toHaveBeenCalled();
    });

    it("reuses host credentials for application authentication with resource-specific .default scopes", async () => {
        connection.authenticationType = "clientSecret";
        connection.clientSecret = "host-secret";
        await manager.acquireAzureToken(connection, graph, false, true, new AbortController().signal);
        expect(bySecret).toHaveBeenCalledWith({ scopes: ["https://graph.microsoft.com/.default"], skipCache: true });
        expect(ConfidentialClientApplication).toHaveBeenCalledWith(
            expect.objectContaining({ auth: { clientId: connection.clientId, clientSecret: "host-secret", authority: "https://login.microsoftonline.com/tenant" } }),
        );
    });

    it("invalidates both client caches when registration or tenant changes", async () => {
        const signal = new AbortController().signal;
        await manager.acquireAzureToken(connection, arm, false, false, signal);
        manager.invalidateConnection(connection.id);
        connection.tenantId = "new-tenant";
        await manager.acquireAzureToken(connection, arm, false, false, signal);
        expect(PublicClientApplication).toHaveBeenCalledTimes(2);
        expect(PublicClientApplication).toHaveBeenLastCalledWith(expect.objectContaining({ auth: expect.objectContaining({ authority: "https://login.microsoftonline.com/new-tenant" }) }));
    });

    async function callback(url: string): Promise<{ status: number | undefined; text: string }> {
        return new Promise((resolve, reject) => {
            http.get(url, (response) => {
                let text = "";
                response.on("data", (chunk: Buffer) => {
                    text += chunk.toString();
                });
                response.on("end", () => resolve({ status: response.statusCode, text }));
            }).on("error", reject);
        });
    }

    it("uses a bound loopback listener, rejects bad state and redeems an S256 PKCE code for the same account", async () => {
        silent.mockRejectedValue({ errorCode: "interaction_required" });
        let parameters: { redirectUri: string; state: string; codeChallenge: string; codeChallengeMethod: string };
        authUrl.mockImplementation(async (request: typeof parameters) => {
            parameters = request;
            return `https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?redirect_uri=${encodeURIComponent(request.redirectUri)}`;
        });
        (browser.openBrowserWithProfile as jest.Mock).mockImplementation(async () => {
            const invalid = await callback(`${parameters.redirectUri}/?code=fake&state=wrong`);
            expect(invalid.status).toBe(400);
            expect(byCode).not.toHaveBeenCalled();
            await callback(`${parameters.redirectUri}/?code=valid&state=${parameters.state}`);
        });
        const token = await manager.acquireAzureToken(connection, arm, true, false, new AbortController().signal);
        expect(token).toBe("interactive-token");
        const request = byCode.mock.calls[0][0];
        expect(request).toMatchObject({ code: "valid", scopes: arm });
        expect(parameters!.codeChallengeMethod).toBe("S256");
        expect(createHash("sha256").update(request.codeVerifier).digest("base64url")).toBe(parameters!.codeChallenge);
        expect(parameters!.state.length).toBeGreaterThan(32);
    });

    it("rejects account changes during explicit consent", async () => {
        silent.mockRejectedValue({ errorCode: "interaction_required" });
        authUrl.mockImplementation(async (request: { redirectUri: string; state: string }) => {
            return `${request.redirectUri}/?code=valid&state=${request.state}`;
        });
        byCode.mockResolvedValue({ accessToken: "wrong-user-token", account: otherAccount });
        (browser.openBrowserWithProfile as jest.Mock).mockImplementation(async (url: string) => {
            await callback(url);
        });
        await expect(manager.acquireAzureToken(connection, arm, true, false, new AbortController().signal)).rejects.toMatchObject({ code: "authenticationFailed" });
    });

    it("cancels the loopback listener without leaking authentication artifacts", async () => {
        silent.mockRejectedValue({ errorCode: "interaction_required" });
        const abort = new AbortController();
        authUrl.mockResolvedValue("https://login.microsoftonline.com/");
        (browser.openBrowserWithProfile as jest.Mock).mockImplementation(async () => {
            abort.abort({ name: "AzureApiError", code: "cancelled", message: "Cancelled" });
        });
        await expect(manager.acquireAzureToken(connection, arm, true, false, abort.signal)).rejects.toMatchObject({ code: "cancelled" });
    });
});
