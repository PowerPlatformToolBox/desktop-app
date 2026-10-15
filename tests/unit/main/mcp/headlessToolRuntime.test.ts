/// <reference types="jest" />

import { pathToFileURL } from "url";
import type { ConnectionTarget } from "../../../../src/common/connectionSlots";
import type { Connection, ToolManifest } from "../../../../src/common/types";
import { invokeHeadlessTool, type HeadlessInvokeContext, type HeadlessRuntimeServices } from "../../../../src/main/mcp/headlessToolRuntime";

jest.mock("fs", () => ({
    existsSync: jest.fn((filePath: string) => filePath.endsWith("headless.js")),
}));
jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

type SafeConnection = Record<string, unknown> | null;
interface RuntimeGlobals {
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
    const services = {
        connectionsManager: { getConnectionById, getConnections: jest.fn(() => connections) },
        dataverseManager: {
            queryData,
            getAllEntitiesMetadata,
            executeBatch,
            withAdditionalHeaders: jest.fn((_headers: unknown, operation: () => Promise<unknown>) => operation()),
        },
        powerPlatformManager: { request },
    } as unknown as HeadlessRuntimeServices;

    function invoke(overrides: Partial<HeadlessInvokeContext>, operation: (apis: RuntimeGlobals, context: HeadlessInvokeContext) => Promise<Record<string, unknown>>) {
        const context: HeadlessInvokeContext = {
            toolId: manifest.id,
            toolName: "Headless Test",
            invocationMode: "two-way",
            updateProgress: jest.fn(),
            logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            ...overrides,
        };
        mockInvokeHeadless.mockImplementation((_input: unknown, invokeContext: HeadlessInvokeContext) => operation(globalThis as unknown as RuntimeGlobals, invokeContext));
        return invokeHeadlessTool(manifest, {}, context, services);
    }

    beforeEach(() => jest.clearAllMocks());

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
