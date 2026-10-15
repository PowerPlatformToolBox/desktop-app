import { AuthManager } from "../../../../src/main/managers/authManager";
import type { BrowserManager } from "../../../../src/main/managers/browserManager";
import { DataverseManager } from "../../../../src/main/managers/dataverseManager";
import { PowerPlatformManager } from "../../../../src/main/managers/powerplatformManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";
import type { Connection } from "../../../../src/common/types/connection";

const finops: Connection = {
    id: "finops", name: "F&O", connectionType: "financeOperations", url: "https://example.operations.dynamics.com",
    environment: "Dev", authenticationType: "clientSecret", createdAt: "2026-10-07T00:00:00Z",
    clientId: "app-id", clientSecret: "secret", tenantId: "tenant-id", accessToken: "existing-token",
};

describe("connection product guards", () => {
    it("rejects F&O in both existing API managers before attempting authentication", async () => {
        const authenticateClientSecret = jest.fn();
        const auth = { authenticateClientSecret } as unknown as AuthManager;
        const connections = { getConnectionById: () => finops } as unknown as ConnectionsManager;
        await expect(new DataverseManager(connections, auth).queryData("finops", "accounts")).rejects.toThrow("requires a Dataverse connection");
        await expect(new PowerPlatformManager(connections, auth).request("finops", "EnvironmentManagement", "GET")).rejects.toThrow("requires a Dataverse connection");
        expect(authenticateClientSecret).not.toHaveBeenCalled();
    });

    it("keeps Dataverse-only authentication methods blocked for F&O", async () => {
        const auth = new AuthManager({} as BrowserManager);
        const requests = [
            () => auth.authenticateUsernamePassword(finops),
            () => auth.acquirePowerPlatformToken(finops),
            () => auth.refreshAccessToken(finops, "refresh-token"),
        ];
        for (const request of requests) {
            await expect(request()).rejects.toThrow("requires a Dataverse connection");
        }
    });
});
