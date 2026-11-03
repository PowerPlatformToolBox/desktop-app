/// <reference types="jest" />

import type { Connection } from "../../../../src/common/types";
import { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";

// electron and electron-store are mocked via tests/__mocks__/

/** Helper: create a minimal valid DataverseConnection object */
function makeConnection(overrides: Partial<Connection> = {}): Connection {
    return {
        id: "conn-1",
        name: "Test Connection",
        url: "https://org.crm.dynamics.com",
        environment: "Dev",
        authenticationType: "interactive",
        ...overrides,
    } as Connection;
}

describe("ConnectionsManager", () => {
    let manager: ConnectionsManager;

    beforeEach(() => {
        manager = new ConnectionsManager();
    });

    // -----------------------------------------------------------------------
    // addConnection / getConnections
    // -----------------------------------------------------------------------
    describe("addConnection / getConnections", () => {
        it("starts with no connections", () => {
            expect(manager.getConnections()).toHaveLength(0);
        });

        it("adds a connection and retrieves it", () => {
            const conn = makeConnection();
            manager.addConnection(conn);
            const stored = manager.getConnections();
            expect(stored).toHaveLength(1);
            expect(stored[0].id).toBe("conn-1");
            expect(stored[0].name).toBe("Test Connection");
        });

        it("decrypts sensitive fields on retrieval (mock passthrough)", () => {
            const conn = makeConnection({ clientSecret: "secret-value" });
            manager.addConnection(conn);
            const retrieved = manager.getConnections()[0];
            expect(retrieved.clientSecret).toBe("secret-value");
        });
    });

    // -----------------------------------------------------------------------
    // getConnectionById
    // -----------------------------------------------------------------------
    describe("getConnectionById", () => {
        it("returns the matching connection", () => {
            manager.addConnection(makeConnection({ id: "abc" }));
            const found = manager.getConnectionById("abc");
            expect(found).not.toBeNull();
            expect(found!.id).toBe("abc");
        });

        it("returns null for unknown id", () => {
            expect(manager.getConnectionById("no-such-id")).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // updateConnection
    // -----------------------------------------------------------------------
    describe("updateConnection", () => {
        it("updates an existing connection field", () => {
            manager.addConnection(makeConnection({ id: "c1", name: "Old Name" }));
            manager.updateConnection("c1", { name: "New Name" });
            const updated = manager.getConnectionById("c1");
            expect(updated!.name).toBe("New Name");
        });

        it("does nothing for unknown id", () => {
            // Should not throw
            expect(() => manager.updateConnection("missing", { name: "x" })).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // deleteConnection
    // -----------------------------------------------------------------------
    describe("deleteConnection", () => {
        it("removes a connection by id", () => {
            manager.addConnection(makeConnection({ id: "del-me" }));
            manager.deleteConnection("del-me");
            expect(manager.getConnectionById("del-me")).toBeNull();
        });

        it("does not throw for unknown id", () => {
            expect(() => manager.deleteConnection("ghost")).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // exportConnections
    // -----------------------------------------------------------------------
    describe("exportConnections", () => {
        it("exports all connections when no ids provided", () => {
            manager.addConnection(makeConnection({ id: "e1", name: "Conn A" }));
            manager.addConnection(makeConnection({ id: "e2", name: "Conn B" }));
            const exported = manager.exportConnections();
            expect(exported.version).toBe(1);
            expect(exported.connections).toHaveLength(2);
        });

        it("exports only specified connections", () => {
            manager.addConnection(makeConnection({ id: "e1", name: "Conn A" }));
            manager.addConnection(makeConnection({ id: "e2", name: "Conn B" }));
            const exported = manager.exportConnections(["e1"]);
            expect(exported.connections).toHaveLength(1);
            expect(exported.connections[0].name).toBe("Conn A");
        });

        it("strips secret fields from export", () => {
            manager.addConnection(makeConnection({ id: "e1", clientSecret: "s3cr3t", accessToken: "tok3n" }));
            const exported = manager.exportConnections(["e1"]);
            const conn = exported.connections[0];
            expect(conn.clientSecret).toBeUndefined();
            expect(conn.accessToken).toBeUndefined();
        });

        it("includes exportedAt timestamp", () => {
            manager.addConnection(makeConnection());
            const exported = manager.exportConnections();
            expect(typeof exported.exportedAt).toBe("string");
            expect(new Date(exported.exportedAt).getTime()).not.toBeNaN();
        });
    });

    // -----------------------------------------------------------------------
    // importConnections
    // -----------------------------------------------------------------------
    describe("importConnections", () => {
        const validPayload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            connections: [
                {
                    id: "imp-1",
                    name: "Imported Conn",
                    url: "https://org.crm.dynamics.com",
                    environment: "Dev",
                    authenticationType: "interactive",
                },
            ],
        };

        it("imports a valid payload", () => {
            const result = manager.importConnections(validPayload);
            expect(result.imported).toBe(1);
            expect(result.skipped).toBe(0);
            expect(manager.getConnectionById("imp-1")).not.toBeNull();
        });

        it("throws for non-object payload", () => {
            expect(() => manager.importConnections("bad")).toThrow("Invalid import file");
        });

        it("throws for unsupported version", () => {
            expect(() => manager.importConnections({ version: 99, connections: [] })).toThrow("Unsupported export version");
        });

        it("throws for empty connections array", () => {
            expect(() => manager.importConnections({ version: 1, connections: [] })).toThrow("no connections");
        });

        it("skips connections with invalid environment", () => {
            const payload = {
                ...validPayload,
                connections: [
                    {
                        id: "bad-env",
                        name: "Bad Env",
                        url: "https://org.crm.dynamics.com",
                        environment: "Staging", // invalid
                        authenticationType: "interactive",
                    },
                ],
            };
            const result = manager.importConnections(payload);
            expect(result.skipped).toBe(1);
            expect(result.imported).toBe(0);
        });

        it("skips connections with missing required fields", () => {
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                connections: [{ id: "missing-fields" }],
            };
            const result = manager.importConnections(payload);
            expect(result.skipped).toBe(1);
        });

        it("warns for clientSecret auth type with missing clientSecret", () => {
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                connections: [
                    {
                        id: "cs-1",
                        name: "CS Conn",
                        url: "https://org.crm.dynamics.com",
                        environment: "Production",
                        authenticationType: "clientSecret",
                        // no clientSecret provided
                    },
                ],
            };
            const result = manager.importConnections(payload);
            expect(result.imported).toBe(1);
            expect(result.warnings.some((w) => w.includes("clientSecret"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Extension-provided (external) connections
    // -----------------------------------------------------------------------
    describe("external connection source", () => {
        const externalId = "ext:my-ext/data8:client%2Fconn";
        let authenticate: jest.Mock;

        function makeExternal(): Connection {
            return makeConnection({ id: externalId, name: "Client / Conn", authenticationType: "external", providerId: "my-ext/data8", providerName: "Data8", readOnly: true });
        }

        beforeEach(() => {
            authenticate = jest.fn(async () => ({ accessToken: "provider-token", expiresOn: new Date(Date.now() + 60 * 60 * 1000) }));
            manager.setExternalConnectionSource({
                getConnections: () => [makeExternal()],
                getConnectionById: (id: string) => (id === externalId ? makeExternal() : null),
                authenticate,
            });
        });

        it("appends external connections after local connections", () => {
            manager.addConnection(makeConnection({ id: "local-1" }));
            expect(manager.getConnections().map((c) => c.id)).toEqual(["local-1", externalId]);
            expect(manager.getLocalConnections().map((c) => c.id)).toEqual(["local-1"]);
        });

        it("rejects adding, deleting or editing provider-owned fields", () => {
            expect(() => manager.addConnection(makeExternal())).toThrow();
            expect(() => manager.deleteConnection(externalId)).toThrow();
            expect(() => manager.updateConnection(externalId, { name: "Renamed" })).toThrow();
        });

        it("allows local customisation of editable fields", () => {
            manager.updateConnection(externalId, { environmentColor: "#ff0000" });
            expect(manager.getConnectionById(externalId)!.environmentColor).toBe("#ff0000");
        });

        it("excludes external connections from export", () => {
            manager.addConnection(makeConnection({ id: "local-1" }));
            const exported = manager.exportConnections();
            expect(exported.connections).toHaveLength(1);
        });

        it("authenticates through the provider and caches the token in memory", async () => {
            const first = await manager.getExternalAccessToken(externalId);
            expect(first.accessToken).toBe("provider-token");
            expect(authenticate).toHaveBeenCalledWith(externalId, "connect", undefined);
            expect(manager.getConnectionById(externalId)!.accessToken).toBe("provider-token");

            await manager.getExternalAccessToken(externalId);
            expect(authenticate).toHaveBeenCalledTimes(1);
        });

        it("asks the provider to refresh when the cached token is about to expire", async () => {
            manager.updateConnectionTokens(externalId, { accessToken: "old", expiresOn: new Date(Date.now() + 60 * 1000) });
            const result = await manager.getExternalAccessToken(externalId);
            expect(authenticate).toHaveBeenCalledWith(externalId, "refresh", undefined);
            expect(result.accessToken).toBe("provider-token");
        });

        it("passes the resolved tool context to the provider when a resolver is set", async () => {
            const toolContext = { toolId: "fetchxml-studio", toolName: "FetchXML Studio", toolVersion: "1.0.0", instanceId: "fetchxml-studio-123-abc" };
            manager.setToolContextResolver((id) => (id === externalId ? toolContext : null));

            await manager.getExternalAccessToken(externalId);
            expect(authenticate).toHaveBeenCalledWith(externalId, "connect", toolContext);

            await manager.authenticateExternalConnection(externalId, "refresh");
            expect(authenticate).toHaveBeenCalledWith(externalId, "refresh", toolContext);
        });

        it("always calls the provider when explicitly authenticating", async () => {
            await manager.authenticateExternalConnection(externalId, "connect");
            await manager.authenticateExternalConnection(externalId, "connect");
            expect(authenticate).toHaveBeenCalledTimes(2);
        });

        it("clears cached tokens", async () => {
            await manager.getExternalAccessToken(externalId);
            manager.clearConnectionTokens(externalId);
            expect(manager.getConnectionById(externalId)!.accessToken).toBeUndefined();
        });

        it("rejects unknown external connections", async () => {
            await expect(manager.getExternalAccessToken("ext:my-ext/data8:missing")).rejects.toThrow();
        });
    });
});
