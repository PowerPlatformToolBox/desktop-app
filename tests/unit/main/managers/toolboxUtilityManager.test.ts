import { ToolBoxEvent } from "../../../../src/common/types";
import { ToolBoxUtilityManager } from "../../../../src/main/managers/toolboxUtilityManager";

const metadata = {
    id: "connection-1",
    name: "Development",
    url: "https://org.crm.dynamics.com",
    environment: "Dev",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-02T00:00:00.000Z",
    isActive: false,
    category: "Team",
    environmentColor: "#123456",
    categoryColor: "#654321",
    enabledForPowerPlatformAPI: true,
    scopesForPowerPlatformAPI: ["user_impersonation"],
};

const credentials = {
    authenticationType: "clientSecret",
    clientId: "private-client",
    clientSecret: "private-secret",
    tenantId: "private-tenant",
    username: "private-user",
    password: "private-password",
    accessToken: "private-access-token",
    refreshToken: "private-refresh-token",
    tokenExpiry: "private-token-expiry",
    msalAccountId: "private-account",
    browserProfile: "private-profile",
    powerPlatformAccessToken: "private-power-platform-token",
    powerPlatformTokenExpiry: "private-power-platform-expiry",
    connectionString: "private-connection-string",
    futureCredential: { value: "private-future-secret" },
};

describe("ToolBoxUtilityManager connection events", () => {
    let manager: ToolBoxUtilityManager;

    beforeEach(() => {
        manager = new ToolBoxUtilityManager();
    });

    it.each([
        [ToolBoxEvent.CONNECTION_CREATED, { ...metadata, ...credentials }, metadata],
        [ToolBoxEvent.CONNECTION_UPDATED, { id: metadata.id, updates: { ...metadata, ...credentials }, ...credentials }, { id: metadata.id, updates: metadata }],
        [ToolBoxEvent.CONNECTION_DELETED, { id: metadata.id, ...credentials }, { id: metadata.id }],
    ])("sanitizes %s before notifying every subscriber and retaining history", (event, data, expected) => {
        const firstTool = jest.fn();
        const secondTool = jest.fn();
        manager.subscribe(event, firstTool);
        manager.subscribe(event, secondTool);

        manager.emitEvent(event, data);

        const expectedPayload = { event, data: expected, timestamp: expect.any(String) };
        expect(firstTool).toHaveBeenCalledWith(expectedPayload);
        expect(secondTool).toHaveBeenCalledWith(expectedPayload);
        expect(manager.getEventHistory()).toEqual([expectedPayload]);
        expect(manager.getEventHistory(1)).toEqual([expectedPayload]);
        for (const payload of [firstTool.mock.calls[0][0], secondTool.mock.calls[0][0], ...manager.getEventHistory()]) {
            expect(JSON.stringify(payload)).not.toContain("private-");
        }
    });

    it("preserves credential-only change notifications without credentials", () => {
        manager.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: metadata.id, updates: credentials });

        expect(manager.getEventHistory()[0].data).toEqual({ id: metadata.id, updates: {} });
    });

    it.each([{ isActive: true }, { isActive: false }, { tokenRefreshed: true }])("preserves status notifications: %j", (status) => {
        manager.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: metadata.id, ...status, ...credentials });

        expect(manager.getEventHistory()[0].data).toEqual({ id: metadata.id, ...status });
    });

    it("does not mutate or retain references to the original connection or updates", () => {
        const connection = { ...metadata, ...credentials, scopesForPowerPlatformAPI: ["original-scope"] };
        manager.emitEvent(ToolBoxEvent.CONNECTION_CREATED, connection);
        manager.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: metadata.id, updates: connection });
        expect(connection.clientSecret).toBe(credentials.clientSecret);
        expect(connection.futureCredential).toEqual(credentials.futureCredential);

        connection.name = "Changed";
        connection.scopesForPowerPlatformAPI.push("private-injected-scope");
        const history = manager.getEventHistory();
        const expected = { ...metadata, scopesForPowerPlatformAPI: ["original-scope"] };
        expect(history[0].data).toEqual(expected);
        expect(history[1].data).toEqual({ id: metadata.id, updates: expected });
    });

    it("rejects nested values in allowlisted fields instead of copying them", () => {
        manager.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, {
            id: metadata.id,
            updates: { name: credentials, scopesForPowerPlatformAPI: [credentials], enabledForPowerPlatformAPI: credentials },
        });

        expect(manager.getEventHistory()[0].data).toEqual({ id: metadata.id, updates: {} });
    });

    it.each([
        [ToolBoxEvent.CONNECTION_CREATED, null],
        [ToolBoxEvent.CONNECTION_CREATED, { ...metadata, environment: "invalid" }],
        [ToolBoxEvent.CONNECTION_UPDATED, { id: metadata.id, updates: null }],
        [ToolBoxEvent.CONNECTION_UPDATED, { id: credentials }],
        [ToolBoxEvent.CONNECTION_DELETED, undefined],
    ])("rejects malformed %s events before emission or retention", (event, data) => {
        const listener = jest.fn();
        manager.subscribe(event, listener);

        expect(() => manager.emitEvent(event, data)).toThrow();
        expect(listener).not.toHaveBeenCalled();
        expect(manager.getEventHistory()).toEqual([]);
    });

    it("preserves unrelated event payloads and history operations", () => {
        const options = { title: "Test", body: "Notification" };
        const listener = jest.fn();
        manager.subscribe(ToolBoxEvent.NOTIFICATION_SHOWN, listener);
        manager.showNotification(options);
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ data: options }));
        manager.unsubscribe(ToolBoxEvent.NOTIFICATION_SHOWN, listener);
        manager.showNotification(options);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(manager.getEventHistory()).toHaveLength(2);
        expect(manager.getEventHistory(1)).toHaveLength(1);
        manager.clearEventHistory();
        expect(manager.getEventHistory()).toEqual([]);
    });
});
