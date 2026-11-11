import { toToolSafeConnection, toToolSafeConnectionUpdates } from "../../../src/common/utils/toolSafeConnection";

describe("tool-safe connection projection", () => {
    const connection = { id: "c1", name: "Test", url: "https://org.crm.dynamics.com", environment: "Dev" };

    it("preserves the preload's safe metadata while removing credentials", () => {
        expect(toToolSafeConnection({ ...connection, clientSecret: "secret", password: "password", futureSecret: "secret" })).toEqual(connection);
    });

    it.each([null, undefined, [], "connection", {}, { ...connection, id: 1 }, { ...connection, environment: "invalid" }])("returns null for invalid full connections: %j", (data) => {
        expect(toToolSafeConnection(data)).toBeNull();
    });

    it("permits partial metadata updates and copies scope arrays", () => {
        const scopes = ["scope"];
        const result = toToolSafeConnectionUpdates({ name: "Renamed", scopesForPowerPlatformAPI: scopes, password: "secret" });
        expect(result).toEqual({ name: "Renamed", scopesForPowerPlatformAPI: ["scope"] });
        expect(result.scopesForPowerPlatformAPI).not.toBe(scopes);
    });
});
