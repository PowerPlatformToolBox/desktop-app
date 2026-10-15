import { isConnection, normalizeConnection, normalizeFinanceOperationsUrl, resolveConnectionType, type Connection } from "../../../src/common/types/connection";
import { isConnectionCompatible, resolveSupportedConnectionTypes } from "../../../src/common/connectionCompatibility";

const legacy: Connection = {
    id: "legacy", name: "Legacy", url: "https://org.crm.dynamics.com", environment: "Dev",
    authenticationType: "interactive", createdAt: "2026-10-07T00:00:00Z",
};
const finops: Connection = {
    ...legacy, connectionType: "financeOperations", url: "https://example.operations.dynamics.com/data/",
    clientId: "app-id", tenantId: "tenant-id",
};

describe("connection product contracts", () => {
    it("normalizes legacy records without changing the input and is idempotent", () => {
        const normalized = normalizeConnection(legacy);
        expect(normalized).toEqual({ ...legacy, connectionType: "dataverse" });
        expect(normalizeConnection(normalized)).toEqual(normalized);
        expect(legacy.connectionType).toBeUndefined();
    });

    it.each([null, "unknown", 0, ""])("rejects an explicit invalid product %p", (type) => {
        expect(() => resolveConnectionType(type)).toThrow("Invalid connection type");
        expect(isConnection({ ...legacy, connectionType: type })).toBe(false);
    });

    it("accepts existing connection-string records consistently with import validation", () => {
        expect(isConnection({ ...legacy, authenticationType: "connectionString" })).toBe(true);
    });

    it.each(["", "/", "/data", "/data/"])("normalizes service root suffix %s", (suffix) => {
        expect(normalizeFinanceOperationsUrl(`https://example.operations.dynamics.com${suffix}`)).toBe("https://example.operations.dynamics.com");
    });

    it.each([
        "http://example.com", "https://user:secret@example.com", "https://example.com?x=1",
        "https://example.com#fragment", "https://example.com/data/Customers", "https://example.com/Metadata",
        "https://example.com/a/../data", "https://example.com\\data", "https://example.com/%64ata",
        "https://example.com/data//",
    ])("rejects an invalid F&O root %s", (url) => {
        expect(() => normalizeFinanceOperationsUrl(url)).toThrow();
    });

    it.each(["usernamePassword", "connectionString"] as const)("rejects F&O auth %s", (authenticationType) => {
        expect(() => normalizeConnection({ ...finops, authenticationType })).toThrow("authentication only");
    });

    it.each([
        { clientId: undefined }, { tenantId: " " }, { enabledForPowerPlatformAPI: true },
        { powerPlatformAccessToken: "token" }, { scopesForPowerPlatformAPI: [] },
    ])("rejects invalid F&O configuration %p", (overrides) => {
        expect(isConnection({ ...finops, ...overrides })).toBe(false);
    });

    it("normalizes F&O URLs and allows incomplete secret exports", () => {
        expect(normalizeConnection({ ...finops, authenticationType: "clientSecret" })).toMatchObject({
            connectionType: "financeOperations", url: "https://example.operations.dynamics.com",
        });
    });

    it("defaults old tools to Dataverse and permits explicitly declared mixed types", () => {
        expect(resolveSupportedConnectionTypes()).toEqual(["dataverse"]);
        expect(isConnectionCompatible(legacy)).toBe(true);
        expect(isConnectionCompatible(finops)).toBe(false);
        expect(isConnectionCompatible(finops, { connectionTypes: ["dataverse", "financeOperations"] })).toBe(true);
    });

    it("restricts Power Platform tools to enabled Dataverse client-secret connections", () => {
        const features = { connectionTypes: ["dataverse", "financeOperations"] as const, enabledForPowerPlatformAPI: true };
        const mutableFeatures = { ...features, connectionTypes: [...features.connectionTypes] };
        expect(isConnectionCompatible({ ...finops, authenticationType: "clientSecret" }, mutableFeatures)).toBe(false);
        expect(isConnectionCompatible({ ...legacy, authenticationType: "clientSecret", enabledForPowerPlatformAPI: true }, mutableFeatures)).toBe(true);
        expect(isConnectionCompatible({ ...legacy, enabledForPowerPlatformAPI: true }, mutableFeatures)).toBe(false);
    });
});
