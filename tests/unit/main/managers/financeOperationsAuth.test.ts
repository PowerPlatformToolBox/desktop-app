import type { Connection } from "../../../../src/common/types";
import { AuthManager } from "../../../../src/main/managers/authManager";
import type { BrowserManager } from "../../../../src/main/managers/browserManager";
import { financeOperationsHttp } from "../../../../src/main/utilities/financeOperationsHttp";

const mockCredential = jest.fn();
const mockSilent = jest.fn();
const mockConfidential = jest.fn();
const mockPublic = jest.fn();
const mockAuthCodeUrl = jest.fn().mockResolvedValue("https://login.example/authorize");
jest.mock("@azure/msal-node", () => ({
    LogLevel: { Warning: 2 },
    ConfidentialClientApplication: function (config: unknown) { mockConfidential(config); return { acquireTokenByClientCredential: mockCredential }; },
    PublicClientApplication: function (config: unknown) { mockPublic(config); return { getAuthCodeUrl: mockAuthCodeUrl, acquireTokenSilent: mockSilent, getTokenCache: () => ({ getAllAccounts: async () => [{ homeAccountId: "account" }] }) }; },
}));
jest.mock("../../../../src/main/utilities/financeOperationsHttp", () => ({ ...jest.requireActual("../../../../src/main/utilities/financeOperationsHttp"), financeOperationsHttp: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logWarn: jest.fn(), logInfo: jest.fn(), logError: jest.fn() }));

describe("F&O authentication", () => {
    const connection: Connection = { id: "erp", name: "ERP", connectionType: "financeOperations", url: "https://erp.example/data/", environment: "Test", authenticationType: "clientSecret", clientId: "app", clientSecret: "secret", tenantId: "tenant", createdAt: "2026-10-07" };
    let auth: AuthManager;
    beforeEach(() => {
        jest.clearAllMocks(); auth = new AuthManager({} as BrowserManager);
        mockCredential.mockResolvedValue({ accessToken: "app-token", expiresOn: new Date() });
        mockSilent.mockResolvedValue({ accessToken: "user-token", expiresOn: new Date() });
        (financeOperationsHttp as jest.Mock).mockResolvedValue({ status: 200, headers: {}, body: { value: [] } });
    });
    it("requests the root resource and probes /data rather than WhoAmI", async () => {
        await expect(auth.testConnection(connection)).resolves.toBe(true);
        expect(mockCredential).toHaveBeenCalledWith({ scopes: ["https://erp.example/.default"], skipCache: false });
        expect((financeOperationsHttp as jest.Mock).mock.calls[0][0].href).toBe("https://erp.example/data/");
        expect(mockConfidential).toHaveBeenCalledWith(expect.objectContaining({ auth: { clientId: "app", clientSecret: "secret", authority: "https://login.microsoftonline.com/tenant" } }));
    });
    it("uses the explicit desktop registration and loopback redirect for interactive sign-in", async () => {
        const internals = auth as unknown as {
            findAvailablePort: () => Promise<number>;
            listenForAuthCodeAndValidate: (...args: unknown[]) => Promise<{ accessToken: string; expiresOn: Date }>;
        };
        jest.spyOn(internals, "findAvailablePort").mockResolvedValue(12345);
        jest.spyOn(internals, "listenForAuthCodeAndValidate").mockImplementation(async (...args) => {
            await (args[6] as (token: string) => Promise<void>)("user-token");
            return { accessToken: "user-token", expiresOn: new Date() };
        });
        await auth.authenticateInteractive({ ...connection, authenticationType: "interactive" });
        expect(mockAuthCodeUrl).toHaveBeenCalledWith({ scopes: ["https://erp.example/.default"], redirectUri: "http://localhost:12345" });
        expect(mockPublic).toHaveBeenCalledWith(expect.objectContaining({ auth: { clientId: "app", authority: "https://login.microsoftonline.com/tenant" } }));
        expect((financeOperationsHttp as jest.Mock).mock.calls[0][0].pathname).toBe("/data/");
    });
    it("forwards forced refresh to both MSAL flows", async () => {
        await auth.authenticateClientSecret(connection, undefined, true, true);
        expect(mockCredential).toHaveBeenCalledWith(expect.objectContaining({ skipCache: true }));
        await auth.acquireTokenSilently({ ...connection, authenticationType: "interactive" }, true);
        expect(mockSilent).toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true, scopes: ["https://erp.example/.default"] }));
    });
    it("creates a new confidential cache after credential edits", async () => {
        await auth.authenticateClientSecret(connection, undefined, true);
        await auth.authenticateClientSecret({ ...connection, clientSecret: "replacement" }, undefined, true);
        expect(mockConfidential).toHaveBeenCalledTimes(2);
        auth.clearConnectionCache(connection.id);
        await auth.authenticateClientSecret(connection, undefined, true);
        expect(mockConfidential).toHaveBeenCalledTimes(3);
    });
    it("rejects an invalid service document during authentication", async () => {
        (financeOperationsHttp as jest.Mock).mockResolvedValue({ status: 200, headers: {}, body: { UserId: "dataverse" } });
        await expect(auth.authenticateClientSecret(connection)).rejects.toThrow("Invalid F&O OData service document");
    });
});
