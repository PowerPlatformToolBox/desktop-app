/// <reference types="jest" />

import { McpServerManager } from "../../../../src/main/mcp/mcpServer";

describe("McpServerManager headless auth resolution", () => {
    it("initiates interactive auth for a named connection when no reusable session exists", async () => {
        const settingsManager = {
            getMcpAccessToken: jest.fn().mockReturnValue("expected-token"),
        } as any;

        const manager = new McpServerManager(7339, "127.0.0.1", settingsManager, { on: jest.fn() } as any, { on: jest.fn() } as any);

        const connection = {
            id: "conn-1",
            name: "Headless Demo",
            url: "https://contoso.crm.dynamics.com",
            authenticationType: "interactive",
        } as any;

        const connectionsManager = {
            getConnections: jest.fn().mockReturnValue([connection]),
            updateConnectionTokens: jest.fn(),
        } as any;

        const authManager = {
            authenticateInteractive: jest.fn().mockResolvedValue({
                accessToken: "sample-access-token",
                expiresOn: new Date(Date.now() + 60_000),
                msalAccountId: "account-1",
            }),
            acquireTokenSilently: jest.fn(),
            refreshAccessToken: jest.fn(),
            authenticateClientSecret: jest.fn(),
            authenticateUsernamePassword: jest.fn(),
        } as any;

        (manager as any).connectionsManager = connectionsManager;
        (manager as any).authManager = authManager;

        const result = await (manager as any).resolveHeadlessAuthContext({ connectionName: "Headless Demo" });

        expect(authManager.authenticateInteractive).toHaveBeenCalledWith(connection);
        expect(connectionsManager.updateConnectionTokens).toHaveBeenCalledWith(connection.id, {
            accessToken: "sample-access-token",
            refreshToken: undefined,
            expiresOn: expect.any(Date),
            msalAccountId: "account-1",
        });
        expect(result).toMatchObject({
            authToken: "sample-access-token",
            source: "connection-name",
            connectionName: "Headless Demo",
            connectionId: "conn-1",
            connectionUrl: "https://contoso.crm.dynamics.com",
        });
    });
});
