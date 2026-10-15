import type { Connection } from "../../../../src/common/types";
import { FinanceOperationsManager } from "../../../../src/main/managers/financeOperationsManager";
import type { AuthManager } from "../../../../src/main/managers/authManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";
import { FinanceOperationsHttpError, financeOperationsHttp } from "../../../../src/main/utilities/financeOperationsHttp";

jest.mock("../../../../src/main/utilities/financeOperationsHttp", () => ({
    ...jest.requireActual("../../../../src/main/utilities/financeOperationsHttp"),
    financeOperationsHttp: jest.fn(),
}));

describe("FinanceOperationsManager authentication and replay", () => {
    const connection: Connection = { id: "erp", name: "ERP", connectionType: "financeOperations", url: "https://erp.example/data/", environment: "Test", authenticationType: "clientSecret", clientId: "app", clientSecret: "secret", tenantId: "tenant", createdAt: "2026-10-07", accessToken: "saved", tokenExpiry: new Date(Date.now() + 3600000).toISOString() };
    const authenticateClientSecret = jest.fn().mockResolvedValue({ accessToken: "renewed", expiresOn: new Date() });
    const acquireTokenSilently = jest.fn().mockResolvedValue({ accessToken: "silent", expiresOn: new Date() });
    const updateConnectionTokens = jest.fn();
    const getConnectionById = jest.fn(() => ({ ...connection }));
    const manager = new FinanceOperationsManager({ getConnectionById, updateConnectionTokens } as unknown as ConnectionsManager, { authenticateClientSecret, acquireTokenSilently } as unknown as AuthManager);
    const http = financeOperationsHttp as jest.Mock;
    beforeEach(() => { jest.clearAllMocks(); getConnectionById.mockImplementation(() => ({ ...connection })); http.mockResolvedValue({ status: 200, headers: {}, body: { value: [] } }); });
    it("reuses an unexpired token with the normalized OData URL", async () => {
        await manager.request("erp", "GET", "Customers?$top=1");
        expect(authenticateClientSecret).not.toHaveBeenCalled();
        expect(http.mock.calls[0][0].href).toBe("https://erp.example/data/Customers?$top=1");
        expect(http.mock.calls[0][2]).toBe("saved");
    });
    it("allows longer metadata downloads and honors explicit timeouts", async () => {
        await manager.request("erp", "GET", "$metadata");
        expect(http.mock.calls[0][5]).toBe(120_000);
        await manager.request("erp", "GET", "Customers");
        expect(http.mock.calls[1][5]).toBe(30_000);
        await manager.request("erp", "GET", "$metadata", undefined, { timeoutMs: 10_000 });
        expect(http.mock.calls[2][5]).toBe(10_000);
    });
    it("forces client-secret renewal once after GET 401", async () => {
        http.mockRejectedValueOnce(new FinanceOperationsHttpError("expired", 401));
        await manager.request("erp", "GET", "Customers");
        expect(authenticateClientSecret).toHaveBeenCalledWith(expect.objectContaining({ url: "https://erp.example" }), undefined, true, true);
        expect(http).toHaveBeenCalledTimes(2);
        expect(updateConnectionTokens).toHaveBeenCalledWith("erp", expect.objectContaining({ accessToken: "renewed" }));
    });
    it("never replays writes", async () => {
        http.mockRejectedValueOnce(new FinanceOperationsHttpError("expired", 401));
        await expect(manager.request("erp", "POST", "Customers", {})).rejects.toMatchObject({ status: 401 });
        expect(http).toHaveBeenCalledTimes(1);
        expect(authenticateClientSecret).not.toHaveBeenCalled();
    });
    it("uses silent interactive renewal without starting a browser", async () => {
        getConnectionById.mockReturnValue({ ...connection, authenticationType: "interactive", tokenExpiry: "2000-01-01" });
        await manager.request("erp", "GET", "Customers");
        expect(acquireTokenSilently).toHaveBeenCalledWith(expect.anything(), false);
        expect(authenticateClientSecret).not.toHaveBeenCalled();
    });
    it("rejects invalid product, URL and timeout before token acquisition", async () => {
        getConnectionById.mockReturnValue({ ...connection, accessToken: undefined });
        await expect(manager.request("erp", "GET", "https://other.example/data/Customers")).rejects.toThrow("selected environment");
        await expect(manager.request("erp", "GET", "Customers", undefined, { timeoutMs: 0 })).rejects.toThrow("timeout");
        getConnectionById.mockReturnValue({ ...connection, connectionType: "dataverse" });
        await expect(manager.request("erp", "GET", "Customers")).rejects.toThrow("requires a Finance");
        expect(http).not.toHaveBeenCalled();
        expect(authenticateClientSecret).not.toHaveBeenCalled();
    });
});
