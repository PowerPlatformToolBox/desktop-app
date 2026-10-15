/// <reference types="jest" />

import type { Connection } from "../../../../src/common/types";
import Store from "electron-store";
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

    describe("connection products", () => {
        const finops = () => makeConnection({
            connectionType: "financeOperations", url: "https://example.operations.dynamics.com/data/",
            authenticationType: "clientSecret", clientId: "app-id", tenantId: "tenant-id", clientSecret: "secret",
        });

        it("migrates stored legacy records once without changing secrets or identity", () => {
            manager.addConnection(makeConnection({ clientSecret: "already-stored-secret", category: "Existing" }));
            const storage = (manager as unknown as { store: Store<{ connections: Connection[] }> }).store;
            const legacy = { ...storage.get("connections")[0] };
            delete legacy.connectionType;
            const get = jest.spyOn(Store.prototype, "get").mockReturnValue([legacy]);
            const set = jest.spyOn(Store.prototype, "set");
            try {
                new ConnectionsManager();
                const writes = set.mock.calls as unknown as Array<[string, Connection[]]>;
                const migrated = writes.find(([, records]) => Array.isArray(records) && records[0]?.connectionType === "dataverse")?.[1];
                expect(migrated).toBeDefined();
                expect(migrated![0]).toMatchObject({ id: legacy.id, category: "Existing", clientSecret: legacy.clientSecret, connectionType: "dataverse" });
                // Reuse the encrypted persisted output to exercise a second startup.
                get.mockReturnValue(migrated!);
                set.mockClear();
                new ConnectionsManager();
                expect(set).not.toHaveBeenCalled();
            } finally {
                get.mockRestore();
                set.mockRestore();
            }
        });

        it("persists a discriminator for legacy Dataverse connections", () => {
            manager.addConnection(makeConnection());
            expect(manager.getConnectionById("conn-1")?.connectionType).toBe("dataverse");
            expect(manager.exportConnections().connections[0].connectionType).toBe("dataverse");
        });

        it("round-trips F&O exports with normalized URLs and incomplete credentials", () => {
            manager.addConnection(finops());
            const exported = manager.exportConnections();
            expect(exported.connections[0]).toMatchObject({ connectionType: "financeOperations", url: "https://example.operations.dynamics.com" });
            expect(exported.connections[0]).not.toHaveProperty("clientSecret");
            const importedManager = new ConnectionsManager();
            expect(importedManager.importConnections(exported).imported).toBe(1);
            expect(importedManager.getConnections()[0]).toMatchObject({ connectionType: "financeOperations", hasIncompleteCredentials: true });
        });

        it("rejects invalid imported product/auth combinations without discarding valid entries", () => {
            const result = manager.importConnections({ version: 1, connections: [
                { ...finops(), connectionType: "unknown" },
                { ...finops(), authenticationType: "usernamePassword" },
                { ...finops(), powerPlatformAccessToken: "untrusted-token" },
                makeConnection({ id: "valid" }),
            ] });
            expect(result).toMatchObject({ imported: 1, skipped: 3 });
            expect(manager.getConnections()[0].connectionType).toBe("dataverse");
        });

        it("validates writes and prevents changing a connection's product", () => {
            manager.addConnection(makeConnection());
            expect(() => manager.updateConnection("conn-1", finops())).toThrow("creating a new connection");
            expect(() => manager.addConnection({ ...finops(), enabledForPowerPlatformAPI: true })).toThrow("Power Platform API");
            expect(manager.getConnections()).toHaveLength(1);
        });
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
        it("retains tokens for display edits and clears them after authentication edits", () => {
            manager.addConnection(makeConnection({ accessToken: "token", tokenExpiry: "2030-01-01", msalAccountId: "account" }));
            manager.updateConnection("conn-1", { name: "Renamed" });
            expect(manager.getConnectionById("conn-1")?.accessToken).toBe("token");
            manager.updateConnection("conn-1", { clientId: "new-app" });
            expect(manager.getConnectionById("conn-1")).toMatchObject({ name: "Renamed", clientId: "new-app", accessToken: undefined, tokenExpiry: undefined, msalAccountId: undefined });
        });
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
});
