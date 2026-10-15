/// <reference types="jest" />

import { pathToFileURL } from "url";
import type { ConnectionTarget } from "../../../../src/common/connectionSlots";
import type { Connection, ToolManifest } from "../../../../src/common/types";
import type { FinanceOperationsAPI } from "../../../../src/common/financeOperationsApi";
import { invokeHeadlessTool, type HeadlessInvokeContext, type HeadlessRuntimeServices } from "../../../../src/main/mcp/headlessToolRuntime";

jest.mock("fs", () => ({
    existsSync: jest.fn((filePath: string) => filePath.endsWith("headless.js")),
}));
jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

type SafeConnection = Record<string, unknown> | null;
interface RuntimeGlobals {
    financeOperationsAPI: FinanceOperationsAPI;
    toolboxAPI: {
        getToolContext: () => Promise<Record<string, unknown>>;
        connections: {
            getConnections: () => Promise<SafeConnection[]>;
            getConnection: (target: ConnectionTarget) => Promise<SafeConnection>;
            getActiveConnection: () => Promise<SafeConnection>;
            getSecondaryConnection: () => Promise<SafeConnection>;
        };
    };
    dataverseAPI: {
        queryData: (query: string, target?: ConnectionTarget) => Promise<unknown>;
        getAllEntitiesMetadata: (columns?: string[], target?: ConnectionTarget) => Promise<unknown>;
        executeBatch: (requests: Array<{ method: "GET"; url: string }>, target?: ConnectionTarget) => Promise<unknown>;
    };
    powerplatformAPI: {
        PowerApps: {
            Get: (relativePath: string, target?: ConnectionTarget) => Promise<unknown>;
        };
    };
}

const manifest = { id: "headless-test", installPath: "/headless-test" } as ToolManifest;
const entryUrl = pathToFileURL("/headless-test/headless.js").href;
const mockInvokeHeadless = jest.fn();
jest.doMock(entryUrl, () => ({ invokeHeadless: mockInvokeHeadless }), { virtual: true });

describe("headless runtime connection slots", () => {
    const connections = Array.from({ length: 4 }, (_, index) => ({
        id: `conn-${index}`,
        name: `Environment ${index}`,
        url: `https://env${index}.crm.dynamics.com`,
        accessToken: `secret-${index}`,
    })) as Connection[];
    const getConnectionById = jest.fn((id: string) => connections.find((connection) => connection.id === id) ?? null);
    const queryData = jest.fn().mockResolvedValue({ ok: true });
    const getAllEntitiesMetadata = jest.fn().mockResolvedValue([]);
    const executeBatch = jest.fn().mockResolvedValue([]);
    const request = jest.fn().mockResolvedValue({ ok: true });
    const financeRequest = jest.fn().mockResolvedValue({ status: 200, headers: {}, body: { value: [] } });
    const services = {
        connectionsManager: { getConnectionById, getConnections: jest.fn(() => connections) },
        dataverseManager: {
            queryData,
            getAllEntitiesMetadata,
            executeBatch,
            withAdditionalHeaders: jest.fn((_headers: unknown, operation: () => Promise<unknown>) => operation()),
        },
        powerPlatformManager: { request },
        financeOperationsManager: { request: financeRequest },
    } as unknown as HeadlessRuntimeServices;

    function invoke(
        overrides: Partial<HeadlessInvokeContext>,
        operation: (apis: RuntimeGlobals, context: HeadlessInvokeContext) => Promise<Record<string, unknown>>,
        features?: ToolManifest["features"],
    ) {
        const context: HeadlessInvokeContext = {
            toolId: manifest.id,
            toolName: "Headless Test",
            invocationMode: "two-way",
            updateProgress: jest.fn(),
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            ...overrides,
        };
        mockInvokeHeadless.mockImplementation((_input: unknown, invokeContext: HeadlessInvokeContext) => operation(globalThis as unknown as RuntimeGlobals, invokeContext));
        return invokeHeadlessTool(features ? { ...manifest, features } : manifest, {}, context, services);
    }

    beforeEach(() => jest.clearAllMocks());

    const typedFeatures: ToolManifest["features"] = {
        connections: { slots: [{ label: "Optional source", required: false }, { label: "Required accounts" }, { label: "Optional audit", required: false }] },
    };

    it("normalizes explicit named assignments and serialized null token holes before executing", async () => {
        const overrides = JSON.parse(JSON.stringify({ connectionNames: [null, "Environment 1"], authTokens: [undefined, "callback-token"] }));
        await invoke(
            overrides,
            async ({ toolboxAPI, dataverseAPI }, context) => {
                expect(context.connectionIds).toEqual([null, "conn-1", null]);
                expect(context.connectionNames).toEqual([null, "Environment 1", null]);
                expect(context.authTokens).toEqual([null, "callback-token", null]);
                expect(context.connectionId).toBeUndefined();
                expect(await toolboxAPI.getToolContext()).toMatchObject({ connectionIds: [null, "conn-1", null], connectionNames: [null, "Environment 1", null], connectionId: null });
                await dataverseAPI.queryData("accounts", 1);
                return {};
            },
            typedFeatures,
        );
        expect(queryData).toHaveBeenCalledWith("conn-1", "accounts");
    });

    it.each([
        [{ connectionIds: ["conn-0"] }, "Required accounts"],
        [{ connectionIds: [null, "deleted"] }, "Required accounts"],
        [{ connectionIds: [null, null], connectionNames: [null, "Environment 1"] }, "Required accounts"],
        [{ authToken: "token-only" }, "Required accounts"],
        [{ connectionUrls: [null, "https://untrusted.example"], authTokens: [null, "token-only"] }, "Required accounts"],
        [{ connectionIds: [null, "conn-1", null, null] }, "at most 3"],
    ])("rejects invalid explicit contexts before installing globals: %j", async (overrides, message) => {
        const previousApi = (globalThis as unknown as RuntimeGlobals).toolboxAPI;
        await expect(invoke(overrides, async () => ({}), typedFeatures)).rejects.toThrow(message);
        expect(mockInvokeHeadless).not.toHaveBeenCalled();
        expect(queryData).not.toHaveBeenCalled();
        expect((globalThis as unknown as RuntimeGlobals).toolboxAPI).toBe(previousApi);
    });

    it("rejects a product allowed elsewhere when it is assigned to the wrong explicit slot", async () => {
        await expect(
            invoke({ connectionIds: ["conn-0", "conn-1"] }, async () => ({}), { connections: { slots: [{}, { label: "Customers", connectionTypes: ["financeOperations"] }] } }),
        ).rejects.toThrow("slot 2 (Customers)");
        expect(mockInvokeHeadless).not.toHaveBeenCalled();
    });

    it("supports all-optional explicit slots without identity and rejects undeclared API targets", async () => {
        await invoke(
            {},
            async ({ toolboxAPI, dataverseAPI }, context) => {
                expect(context.connectionIds).toEqual([null]);
                expect(await toolboxAPI.connections.getConnections()).toEqual([null]);
                await expect(dataverseAPI.queryData("accounts", 1)).rejects.toThrow("No connection");
                return {};
            },
            { connections: { slots: [{ required: false }] } },
        );
        expect(queryData).not.toHaveBeenCalled();
    });

    it("rejects incompatible assigned slots before executing a headless tool", async () => {
        getConnectionById.mockReturnValueOnce({ ...connections[0], connectionType: "financeOperations" });
        await expect(invoke({ connectionIds: ["conn-0"] }, async () => ({}))).rejects.toThrow("not compatible");
        expect(mockInvokeHeadless).not.toHaveBeenCalled();
        expect(queryData).not.toHaveBeenCalled();
    });

    it("accepts a declared F&O slot and returns safe product metadata", async () => {
        const previousFeatures = manifest.features;
        const previousType = connections[0].connectionType;
        manifest.features = { connections: 1, connectionTypes: ["financeOperations"] };
        connections[0].connectionType = "financeOperations";
        try {
            await invoke({ connectionIds: ["conn-0"] }, async ({ toolboxAPI }) => {
                const connection = await toolboxAPI.connections.getConnection(0);
                expect(connection).toMatchObject({ connectionType: "financeOperations" });
                expect(connection).not.toHaveProperty("accessToken");
                return {};
            });
            expect(mockInvokeHeadless).toHaveBeenCalled();
        } finally {
            manifest.features = previousFeatures;
            connections[0].connectionType = previousType;
        }
    });

    it("routes F&O through indexed slots, denies unapproved headers, and restores globals", async () => {
        const previousFeatures = manifest.features;
        const previousType = connections[2].connectionType;
        const previousApi = (globalThis as unknown as RuntimeGlobals).financeOperationsAPI;
        manifest.features = { connections: 3, connectionTypes: ["dataverse", "financeOperations"] };
        connections[2].connectionType = "financeOperations";
        try {
            await invoke({ connectionIds: ["conn-0", null, "conn-2"] }, async ({ financeOperationsAPI }) => {
                await expect(financeOperationsAPI.queryData("Rows", { connectionTarget: 2 })).resolves.toEqual({ value: [] });
                await expect(financeOperationsAPI.queryData("Rows", { connectionTarget: 1 })).rejects.toThrow();
                await expect(financeOperationsAPI.queryData("Rows", { connectionTarget: 2, headers: { Prefer: "return=minimal" } })).rejects.toThrow("prior desktop consent");
                return {};
            });
            expect(financeRequest).toHaveBeenCalledTimes(1);
            expect(financeRequest).toHaveBeenCalledWith("conn-2", "GET", "Rows", undefined, { connectionTarget: 2, headers: {} });
            expect((globalThis as unknown as RuntimeGlobals).financeOperationsAPI).toBe(previousApi);
        } finally {
            manifest.features = previousFeatures;
            connections[2].connectionType = previousType;
        }
    });

    it("routes numeric slots 2+ and secondary through the actual runtime APIs", async () => {
        await invoke({ connectionIds: connections.map((connection) => connection.id) }, async ({ toolboxAPI, dataverseAPI, powerplatformAPI }) => {
            expect(await toolboxAPI.connections.getConnection(2)).toMatchObject({ id: "conn-2" });
            expect(await toolboxAPI.connections.getConnection("secondary")).toMatchObject({ id: "conn-1" });
            expect(await toolboxAPI.connections.getActiveConnection()).toMatchObject({ id: "conn-0" });
            expect(await toolboxAPI.connections.getSecondaryConnection()).toMatchObject({ id: "conn-1" });
            expect(await toolboxAPI.connections.getConnections()).toEqual(connections.map((connection) => expect.objectContaining({ id: connection.id })));
            expect(await toolboxAPI.connections.getConnection(2)).not.toHaveProperty("accessToken");
            await dataverseAPI.queryData("accounts", 2);
            await dataverseAPI.queryData("contacts", "secondary");
            await dataverseAPI.getAllEntitiesMetadata([], 3);
            await dataverseAPI.executeBatch([{ method: "GET", url: "accounts" }], 2);
            await powerplatformAPI.PowerApps.Get("apps", 3);
            await powerplatformAPI.PowerApps.Get("apps", "secondary");
            return {};
        });
        expect(queryData.mock.calls).toEqual([
            ["conn-2", "accounts"],
            ["conn-1", "contacts"],
        ]);
        expect(getAllEntitiesMetadata).toHaveBeenCalledWith("conn-3", []);
        expect(executeBatch).toHaveBeenCalledWith("conn-2", expect.any(Array));
        expect(request.mock.calls.map((call) => call[0])).toEqual(["conn-3", "conn-1"]);
    });

    it("preserves null gaps and does not resolve them from names or legacy primary", async () => {
        await invoke(
            { connectionIds: ["conn-0", null, "conn-2"], connectionNames: ["Environment 0", "Environment 1", "Environment 2"], connectionId: "conn-1" },
            async ({ toolboxAPI, dataverseAPI, powerplatformAPI }) => {
                expect(await toolboxAPI.connections.getConnections()).toEqual([expect.objectContaining({ id: "conn-0" }), null, expect.objectContaining({ id: "conn-2" })]);
                expect(await toolboxAPI.connections.getSecondaryConnection()).toBeNull();
                expect(await toolboxAPI.connections.getConnection(3)).toBeNull();
                await expect(dataverseAPI.queryData("accounts", "secondary")).rejects.toThrow("slot 1 (secondary)");
                await expect(powerplatformAPI.PowerApps.Get("apps", 3)).rejects.toThrow("slot 3 (3)");
                await dataverseAPI.queryData("accounts", 2);
                return {};
            },
        );
        expect(queryData).toHaveBeenCalledTimes(1);
        expect(queryData).toHaveBeenCalledWith("conn-2", "accounts");
        expect(request).not.toHaveBeenCalled();
    });

    it.each([null, "deleted-connection"])("does not replace an unresolved primary ID (%s) with a supplied name or legacy ID", async (connectionId) => {
        await invoke({ connectionIds: [connectionId, null, "conn-2"], connectionNames: ["Environment 0"], connectionId: "conn-0" }, async ({ toolboxAPI, dataverseAPI, powerplatformAPI }) => {
            expect(await toolboxAPI.connections.getActiveConnection()).toBeNull();
            expect(await toolboxAPI.connections.getConnection(2)).toMatchObject({ id: "conn-2" });
            await expect(dataverseAPI.queryData("accounts")).rejects.toThrow("slot 0 (primary)");
            await expect(powerplatformAPI.PowerApps.Get("apps")).rejects.toThrow("slot 0 (primary)");
            return {};
        });
        expect(queryData).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it.each([-1, 0.5, NaN, Infinity, "tertiary"])("rejects invalid target %s without invoking managers", async (target) => {
        await invoke({ connectionIds: ["conn-0", "conn-1", "conn-2"] }, async ({ toolboxAPI, dataverseAPI, powerplatformAPI }) => {
            // Startup validates assignments; invalid API targets must do no further lookups.
            getConnectionById.mockClear();
            const invalidTarget = target as ConnectionTarget;
            await expect(toolboxAPI.connections.getConnection(invalidTarget)).rejects.toThrow("Invalid connection target");
            await expect(dataverseAPI.queryData("accounts", invalidTarget)).rejects.toThrow("Invalid connection target");
            await expect(powerplatformAPI.PowerApps.Get("apps", invalidTarget)).rejects.toThrow("Invalid connection target");
            return {};
        });
        expect(queryData).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
        expect(getConnectionById).not.toHaveBeenCalled();
    });

    it.each([{}, { connectionIds: [] }, { connectionNames: [] }])("supports zero slots: %j", async (arrays) => {
        const legacy = Object.keys(arrays).length ? { connectionId: "conn-0", connectionName: "Environment 0" } : {};
        await invoke({ ...legacy, ...arrays }, async ({ toolboxAPI, dataverseAPI, powerplatformAPI }) => {
            expect(await toolboxAPI.connections.getConnections()).toEqual([]);
            expect(await toolboxAPI.connections.getActiveConnection()).toBeNull();
            expect(await toolboxAPI.connections.getSecondaryConnection()).toBeNull();
            expect(await toolboxAPI.getToolContext()).toMatchObject({ connectionIds: [], connectionNames: [], connectionUrls: [], connectionId: null });
            await expect(dataverseAPI.queryData("accounts")).rejects.toThrow("slot 0 (primary)");
            await expect(powerplatformAPI.PowerApps.Get("apps", 2)).rejects.toThrow("slot 2 (2)");
            return {};
        });
        expect(queryData).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it("exposes array context with authoritative primary aliases and preserves invocation fields", async () => {
        const arrays = {
            connectionIds: ["conn-0", null, "conn-2"],
            connectionNames: ["Environment 0", "", "Environment 2"],
            connectionUrls: [connections[0].url, null, connections[2].url],
            authTokens: ["token-0", undefined, "token-2"],
        };
        await invoke({ ...arrays, connectionId: "stale", connectionName: "stale", connectionUrl: "stale", authToken: "stale" }, async ({ toolboxAPI }, context) => {
            expect(context).toMatchObject(arrays);
            const publicContext = await toolboxAPI.getToolContext();
            expect(publicContext).toMatchObject({
                connectionIds: arrays.connectionIds,
                connectionNames: arrays.connectionNames,
                connectionUrls: arrays.connectionUrls,
                connectionId: "conn-0",
                connectionName: "Environment 0",
                connectionUrl: connections[0].url,
            });
            expect(publicContext).not.toHaveProperty("authToken");
            expect(publicContext).not.toHaveProperty("authTokens");
            return {};
        });
    });

    it("resolves indexed names when IDs are absent without using legacy values", async () => {
        await invoke({ connectionNames: [" environment 0 ", "missing", "ENVIRONMENT 2"], connectionId: "conn-1" }, async ({ toolboxAPI, dataverseAPI }) => {
            expect(await toolboxAPI.connections.getConnections()).toEqual([expect.objectContaining({ id: "conn-0" }), null, expect.objectContaining({ id: "conn-2" })]);
            await dataverseAPI.queryData("accounts", 2);
            return {};
        });
        expect(queryData).toHaveBeenCalledWith("conn-2", "accounts");
    });

    it.each([{ connectionId: "conn-0" }, { connectionName: " ENVIRONMENT 0 " }])("retains legacy primary lookup only when arrays are absent: %j", async (legacy) => {
        await invoke({ ...legacy, connectionUrl: connections[0].url, authToken: "legacy-token" }, async ({ toolboxAPI, dataverseAPI }) => {
            expect(await toolboxAPI.connections.getActiveConnection()).toMatchObject({ id: "conn-0" });
            expect(await toolboxAPI.connections.getSecondaryConnection()).toBeNull();
            expect(await toolboxAPI.connections.getConnection(2)).toBeNull();
            expect(await toolboxAPI.getToolContext()).toMatchObject({ ...legacy, connectionUrl: connections[0].url });
            await dataverseAPI.queryData("accounts");
            await expect(dataverseAPI.queryData("accounts", 2)).rejects.toThrow("slot 2 (2)");
            return {};
        });
        expect(queryData).toHaveBeenCalledTimes(1);
        expect(queryData).toHaveBeenCalledWith("conn-0", "accounts");
    });
});
