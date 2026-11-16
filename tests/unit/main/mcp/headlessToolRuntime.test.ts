/// <reference types="jest" />

import { pathToFileURL } from "url";
import * as fs from "fs";
import type { AzureAPI } from "../../../../src/common/azureApi";
import { azureError } from "../../../../src/common/azureApi";
import type { AzureCaller } from "../../../../src/main/managers/azureApiManager";
import type { ConnectionTarget } from "../../../../src/common/connectionSlots";
import type { Connection, ToolManifest } from "../../../../src/common/types";
import { invokeHeadlessTool, type HeadlessInvokeContext, type HeadlessRuntimeServices } from "../../../../src/main/mcp/headlessToolRuntime";
import type { createPowerPlatformRawClient } from "../../../../src/common/powerplatformApi";

jest.mock("fs", () => ({
    existsSync: jest.fn((filePath: string) => filePath.endsWith("headless.js")),
    statSync: jest.fn(() => ({ size: 500 })),
    readFileSync: jest.fn(),
}));
jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

type SafeConnection = Record<string, unknown> | null;
interface RuntimeGlobals {
    azureAPI: AzureAPI.API;
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
            Raw: ReturnType<typeof createPowerPlatformRawClient>;
        };
    };
}

const manifest = { id: "headless-test", version: "1.0.0", installPath: "/headless-test" } as ToolManifest;
const entryUrl = pathToFileURL("/headless-test/headless.js").href;
const mockInvokeHeadless = jest.fn();
jest.doMock(entryUrl, () => ({ invokeHeadless: mockInvokeHeadless }), { virtual: true });

describe("headless runtime connection slots", () => {
    const connections = Array.from({ length: 4 }, (_, index) => ({
        id: `conn-${index}`,
        name: `Environment ${index}`,
        url: `https://env${index}.crm.dynamics.com`,
        accessToken: `secret-${index}`,
        enabledForAzureAPI: true,
        enabledForGraphAPI: true,
    })) as Connection[];
    const getConnectionById = jest.fn((id: string) => connections.find((connection) => connection.id === id) ?? null);
    const queryData = jest.fn().mockResolvedValue({ ok: true });
    const getAllEntitiesMetadata = jest.fn().mockResolvedValue([]);
    const executeBatch = jest.fn().mockResolvedValue([]);
    const request = jest.fn().mockResolvedValue({ ok: true });
    const requestRaw = jest.fn();
    const azureInvoke = jest.fn();
    const azureCancel = jest.fn();
    const disposeOwner = jest.fn();
    const unsubscribe = jest.fn();
    const subscribeOwner = jest.fn().mockReturnValue(unsubscribe);
    const services = {
        connectionsManager: { getConnectionById, getConnections: jest.fn(() => connections) },
        dataverseManager: {
            queryData,
            getAllEntitiesMetadata,
            executeBatch,
            withAdditionalHeaders: jest.fn((_headers: unknown, operation: () => Promise<unknown>) => operation()),
        },
        powerPlatformManager: { request, requestRaw },
        azureApiManager: { invoke: azureInvoke, cancel: azureCancel, disposeOwner, subscribeOwner },
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

    beforeEach(() => {
        jest.clearAllMocks();
        azureInvoke.mockReset().mockResolvedValue({ status: 200, headers: {}, data: { value: [] } });
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ version: manifest.version, features: { apis: { arm: {}, graph: { scopes: ["Reports.Read.All"] } } } }));
        (fs.statSync as jest.Mock).mockReturnValue({ size: 500 });
    });

    it("exposes the shared ARM/Graph client and routes all operations to assigned slots without approval", async () => {
        await invoke({ connectionIds: connections.map((connection) => connection.id) }, async ({ azureAPI, toolboxAPI }) => {
            expect((globalThis as unknown as { window: RuntimeGlobals }).window.azureAPI).toBe(azureAPI);
            await azureAPI.arm.getConnectionState(2);
            await azureAPI.graph.authenticate({ connectionTarget: "secondary" });
            await azureAPI.arm.listSubscriptions({ connectionTarget: 3 });
            await azureAPI.graph.Get("/v1.0/reports/getTeamsUserActivityUserDetail(period='D7')");
            await azureAPI.arm.queryCosts("/subscriptions/00000000-0000-0000-0000-000000000001", {
                type: "ActualCost",
                timeframe: "MonthToDate",
                dataset: { granularity: "Daily" },
            });
            await azureAPI.arm.checkCostAccess("/subscriptions/00000000-0000-0000-0000-000000000001");
            await azureAPI.arm.nextPage("opaque", { connectionTarget: 2 });
            await azureAPI.cancelRequest("request-1");
            const stop = azureAPI.onConnectionChanged(jest.fn());
            stop();
            expect(await toolboxAPI.connections.getConnection(2)).not.toHaveProperty("accessToken");
            expect(await toolboxAPI.connections.getConnection(2)).toMatchObject({ enabledForAzureAPI: true, enabledForGraphAPI: true });
            return {};
        });
        expect(azureInvoke.mock.calls.map(([caller, action, resource]) => [caller.connectionId, action, resource])).toEqual([
            ["conn-2", "state", "arm"],
            ["conn-1", "authenticate", "graph"],
            ["conn-3", "get", "arm"],
            ["conn-0", "get", "graph"],
            ["conn-0", "costs", "arm"],
            ["conn-0", "checkCosts", "arm"],
            ["conn-2", "next", "arm"],
        ]);
        const caller: AzureCaller = azureInvoke.mock.calls[0][0];
        expect(caller).toMatchObject({ headless: true, permissions: { arm: true, graph: ["Reports.Read.All"] } });
        expect(caller.owner).toBeLessThan(0);
        expect(azureCancel).toHaveBeenCalledWith(caller.owner, "request-1");
        expect(disposeOwner).toHaveBeenCalledWith(caller.owner);
        expect(caller.isCurrent()).toBe(false);
        expect(unsubscribe).toHaveBeenCalled();
    });

    it("uses installed declarations rather than cached metadata and rejects malformed or changed manifests", async () => {
        await invoke({ connectionId: "conn-0" }, async ({ azureAPI }) => {
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ version: manifest.version, features: { apis: { graph: { scopes: ["User.Read"] } } } }));
            await azureAPI.graph.Get("/v1.0/me");
            expect(azureInvoke.mock.calls[0][0].permissions).toEqual({ graph: ["User.Read"] });
            for (const packageJson of [
                { version: "changed" },
                { version: manifest.version, features: { azure: { arm: true } } },
                { version: manifest.version, features: { apis: { graph: { scopes: ["User.ReadWrite.All"] } } } },
            ]) {
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(packageJson));
                await expect(azureAPI.arm.listSubscriptions()).rejects.toMatchObject({ code: "capabilityDenied" });
            }
            (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 * 1024 + 1 });
            await expect(azureAPI.arm.listSubscriptions()).rejects.toMatchObject({ code: "capabilityDenied" });
            return {};
        });
        expect(azureInvoke).toHaveBeenCalledTimes(1);
    });

    it("preserves structured failures and does not fill empty Azure connection slots", async () => {
        await invoke({ connectionIds: ["conn-0", null, "conn-2"] }, async ({ azureAPI }) => {
            await expect(azureAPI.arm.listSubscriptions({ connectionTarget: "secondary" })).rejects.toMatchObject({ code: "notConnected" });
            const error = azureError("throttled", "Retry later", { status: 429, retryAfterMs: 5000, requestId: "safe-id" });
            azureInvoke.mockRejectedValue(error);
            await expect(azureAPI.arm.listSubscriptions({ connectionTarget: 2 })).rejects.toEqual(error);
            return {};
        });
        expect(azureInvoke).toHaveBeenCalledTimes(1);
    });

    it("restores prior globals and invalidates retained Azure clients after execution", async () => {
        const scope = globalThis as unknown as Record<string, unknown>;
        const previous = scope.azureAPI;
        let retained: AzureAPI.API | undefined;
        try {
            scope.azureAPI = { sentinel: true };
            await invoke({ connectionId: "conn-0" }, async ({ azureAPI }) => {
                retained = azureAPI;
                await azureAPI.arm.listSubscriptions();
                return {};
            });
            expect(scope.azureAPI).toEqual({ sentinel: true });
            await expect(retained!.arm.listSubscriptions()).rejects.toMatchObject({ code: "cancelled" });
        } finally {
            scope.azureAPI = previous;
        }
    });

    it("disposes Azure requests when the headless job deadline expires", async () => {
        await invoke({ connectionId: "conn-0", timeoutMs: 5 }, async ({ azureAPI }) => {
            await azureAPI.arm.listSubscriptions();
            const caller: AzureCaller = azureInvoke.mock.calls[0][0];
            await new Promise((resolve) => setTimeout(resolve, 15));
            expect(caller.isCurrent()).toBe(false);
            expect(disposeOwner).toHaveBeenCalledWith(caller.owner);
            await expect(azureAPI.graph.Get("/v1.0/me")).rejects.toMatchObject({ code: "cancelled" });
            return {};
        });
    });

    it("cleans up on failure and exposes a clear error if the Azure host service is unavailable", async () => {
        const scope = globalThis as unknown as Record<string, unknown>;
        const previous = scope.azureAPI;
        await expect(
            invoke({ connectionId: "conn-0" }, async ({ azureAPI }) => {
                await azureAPI.arm.listSubscriptions();
                throw azureError("accessDenied", "Azure access denied");
            }),
        ).rejects.toThrow("Azure access denied");
        expect(scope.azureAPI).toBe(previous);
        expect(disposeOwner).toHaveBeenCalled();
        mockInvokeHeadless.mockImplementation(async () => {
            const api = (globalThis as unknown as RuntimeGlobals).azureAPI;
            await expect(api.arm.listSubscriptions()).rejects.toMatchObject({ code: "notConfigured" });
            return {};
        });
        await invokeHeadlessTool(
            manifest,
            {},
            { toolId: manifest.id, toolName: "Headless Test", invocationMode: "two-way", updateProgress: jest.fn(), logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
            {},
        );
    });

    it("provides raw response and error parity through the headless runtime", async () => {
        const response = { status: 200, headers: { "content-type": "application/gzip" }, body: new Uint8Array([31, 139, 255, 0]) };
        requestRaw.mockResolvedValue(response);
        await invoke({ connectionIds: connections.map((connection) => connection.id) }, async ({ powerplatformAPI }) => {
            const options = { requireDelegatedAuthentication: true };
            expect(await powerplatformAPI.PowerApps.Raw.Get("exports", 2, undefined, options)).toEqual(response);
            expect(requestRaw).toHaveBeenLastCalledWith("conn-2", "PowerApps", "GET", "exports", undefined, undefined, options);
            requestRaw.mockResolvedValue({ ...response, status: 403, body: new TextEncoder().encode('{"message":"Forbidden"}') });
            await expect(powerplatformAPI.PowerApps.Raw.Get("exports", "secondary")).rejects.toMatchObject({ name: "PowerPlatformHttpError", status: 403, message: "Forbidden" });
            return {};
        });
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
