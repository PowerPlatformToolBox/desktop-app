import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import type { ToolManifest } from "../../../../src/common/types";
import { invokeHeadlessTool } from "../../../../src/main/mcp/headlessToolRuntime";
import { McpServerManager } from "../../../../src/main/mcp/mcpServer";

jest.mock("../../../../src/main/mcp/headlessToolRuntime", () => ({ invokeHeadlessTool: jest.fn() }));
jest.mock("../../../../src/main/mcp/agentInvocationLogger", () => ({ logInvocation: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

describe("MCP positional connections over HTTP", () => {
    let directory: string;
    let manager: McpServerManager;
    let client: Client;
    const launchToolWithContext = jest.fn().mockResolvedValue({ completed: true });
    const connections = Array.from({ length: 3 }, (_, index) => ({
        id: `conn-${index}`,
        name: `Environment ${index}`,
        url: `https://env${index}.example.test`,
        authenticationType: "interactive",
        accessToken: `token-${index}`,
        tokenExpiry: new Date(Date.now() + 300_000).toISOString(),
    }));

    it("rejects incompatible named connections before authentication and invocation", async () => {
        (manager as any).connectionsManager = { getConnections: () => [{ ...connections[0], connectionType: "financeOperations" }] };
        const authenticateInteractive = jest.fn();
        (manager as any).authManager = { authenticateInteractive };
        const response = await client.callTool({ name: "legacy", arguments: { __pptb: { executionMode: "headless", connectionName: "Environment 0" } } });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response.content)).toContain("not compatible");
        expect(authenticateInteractive).not.toHaveBeenCalled();
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-mcp-connections-"));
        const manifests = [
            { id: "multi", name: "Multi", features: { connections: { min: 2, max: 3 } } },
            { id: "legacy", name: "Legacy", features: { multiConnection: "none" } },
            { id: "zero", name: "Zero", features: { connections: 0 } },
            {
                id: "typed",
                name: "Typed",
                features: {
                    connections: {
                        slots: [
                            { label: "Optional accounts", required: false },
                            { label: "F&O customers", connectionTypes: ["financeOperations"] },
                            { label: "Optional audit", required: false },
                        ],
                    },
                },
            },
            { id: "optional", name: "Optional", features: { connections: { slots: [{ required: false }] } } },
        ].map((tool) => {
            const installPath = path.join(directory, tool.id);
            fs.mkdirSync(installPath);
            fs.writeFileSync(
                path.join(installPath, "pptb.config.json"),
                JSON.stringify({
                    agents: { invokable: true, executionModes: ["windowed", "headless"], modes: ["two-way", "one-way"], defaultMode: "two-way" },
                    invocation: { prefill: { type: "object", properties: {} }, returnTopic: { type: "object", properties: {} } },
                }),
            );
            return { ...tool, version: "1.0.0", description: "Integration fixture", installPath, installedAt: "2026-10-04", source: "registry" } as ToolManifest;
        });
        const registry = {
            on: jest.fn(),
            getInstalledTools: jest.fn(async () => manifests),
            getInstalledManifestSync: jest.fn((id: string) => manifests.find((tool) => tool.id === id) ?? null),
        };
        const tools = { on: jest.fn(), getAllTools: jest.fn(() => []), getTool: jest.fn((id: string) => manifests.find((tool) => tool.id === id)) };
        manager = new McpServerManager(0, "127.0.0.1", { getMcpAccessToken: () => "integration-token" } as any, registry as any, tools as any);
        (manager as any).connectionsManager = {
            getConnections: () => connections,
            getConnectionById: (id: string) => connections.find((connection) => connection.id === id) ?? null,
            updateConnectionTokens: jest.fn(),
        };
        (manager as any).authManager = { authenticateInteractive: jest.fn() };
        manager.setToolWindowManager({ launchToolWithContext } as any);
        (invokeHeadlessTool as jest.Mock).mockImplementation(async (_manifest, _input, context) => ({ ids: context.connectionIds }));
        await manager.start();
        const server = (manager as unknown as { httpServer: Server }).httpServer;
        const port = (server.address() as AddressInfo).port;
        client = new Client({ name: "connection-tests", version: "1.0.0" });
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { "x-mcp-auth-token": "integration-token" } } }));
    });

    afterEach(async () => {
        await client?.close();
        await manager?.stop();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it("advertises positional names and hands them to windowed launch in order", async () => {
        const listed = await client.listTools();
        const meta = listed.tools.find((tool) => tool.name === "multi")!.inputSchema.properties!.__pptb as { properties: Record<string, unknown> };
        expect(meta.properties.connectionNames).toMatchObject({ type: "array", items: { type: "string" }, maxItems: 10 });
        const response = await client.callTool({ name: "multi", arguments: { __pptb: { executionMode: "windowed", connectionNames: ["Environment 2", "Environment 0", "Environment 1"] } } });
        expect(response.isError).not.toBe(true);
        expect(launchToolWithContext.mock.calls[0][8]).toEqual(["conn-2", "conn-0", "conn-1"]);
    });

    it("hands arrays and primary aliases to headless execution", async () => {
        const response = await client.callTool({ name: "multi", arguments: { __pptb: { executionMode: "headless", connectionNames: ["Environment 2", "Environment 0", "Environment 1"] } } });
        expect(response.isError).not.toBe(true);
        expect(invokeHeadlessTool).toHaveBeenCalledWith(
            expect.anything(),
            {},
            expect.objectContaining({
                connectionIds: ["conn-2", "conn-0", "conn-1"],
                authTokens: ["token-2", "token-0", "token-1"],
                connectionId: "conn-2",
                authToken: "token-2",
            }),
            expect.anything(),
        );
    });

    it("advertises typed purposes and nullable entries only for explicit slots", async () => {
        const listed = await client.listTools();
        const meta = listed.tools.find((tool) => tool.name === "typed")!.inputSchema.properties!.__pptb as { properties: Record<string, unknown> };
        expect(meta.properties.connectionNames).toMatchObject({ items: { type: ["string", "null"] }, maxItems: 3 });
        expect(JSON.stringify(meta.properties.connectionNames)).toContain("1: F&O customers (financeOperations; required)");
    });

    function useFinanceConnection() {
        const saved = [connections[0], { ...connections[1], connectionType: "financeOperations" }, connections[2]];
        (manager as any).connectionsManager = {
            getConnections: () => saved,
            getConnectionById: (id: string) => saved.find((connection) => connection.id === id) ?? null,
            updateConnectionTokens: jest.fn(),
        };
        return saved;
    }

    it("preserves leading and trailing nulls through headless authentication and context", async () => {
        useFinanceConnection();
        const response = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "headless", connectionNames: [null, " Environment 1 "] } } });
        expect(response.isError).not.toBe(true);
        expect(invokeHeadlessTool).toHaveBeenCalledWith(
            expect.anything(),
            {},
            expect.objectContaining({
                connectionIds: [null, "conn-1", null],
                connectionNames: [null, "Environment 1", null],
                connectionUrls: [null, connections[1].url, null],
                authTokens: [null, "token-1", null],
                connectionId: undefined,
                authToken: undefined,
            }),
            expect.anything(),
        );
    });

    it("rejects an expired required F&O session without interactive sign-in or execution", async () => {
        const saved = useFinanceConnection();
        saved[1].accessToken = "";
        const response = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "headless", connectionNames: [null, "Environment 1"] } } });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response.content)).toContain("requires interactive sign-in");
        expect((manager as any).authManager.authenticateInteractive).not.toHaveBeenCalled();
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    it.each([false, true])("executes the actual headless runtime with a leading optional hole: %s", async (includePrimary) => {
        useFinanceConnection();
        const entry = path.join(directory, "typed", "headless.js");
        fs.writeFileSync(entry, "// headless integration entry");
        const financeRequest = jest.fn().mockResolvedValue({ status: 200, headers: {}, body: { value: [{ CustomerAccount: "C001" }] } });
        const queryData = jest.fn().mockResolvedValue({ value: [{ name: "Account 1" }] });
        (manager as any).financeOperationsManager = { request: financeRequest };
        (manager as any).dataverseManager = { queryData, withAdditionalHeaders: (_headers: unknown, operation: () => Promise<unknown>) => operation() };
        jest.doMock(
            pathToFileURL(entry).href,
            () => ({
                invokeHeadless: async (_input: unknown, context: any) => {
                    const runtime = globalThis as any;
                    const publicContext = await runtime.toolboxAPI.getToolContext();
                    const saved = await runtime.toolboxAPI.connections.getConnections();
                    const customers = await runtime.financeOperationsAPI.queryData("CustomersV3?$top=1", { connectionTarget: "secondary" });
                    const accounts = saved[0] ? await runtime.dataverseAPI.queryData("accounts?$top=1", "primary") : null;
                    return { ids: context.connectionIds, names: publicContext.connectionNames, saved, customers, accounts };
                },
            }),
            { virtual: true },
        );
        (invokeHeadlessTool as jest.Mock).mockImplementation(jest.requireActual("../../../../src/main/mcp/headlessToolRuntime").invokeHeadlessTool);
        const response = await client.callTool({
            name: "typed",
            arguments: { __pptb: { executionMode: "headless", mode: "two-way", connectionNames: [includePrimary ? "Environment 0" : null, "Environment 1"] } },
        });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toMatchObject({
            ids: [includePrimary ? "conn-0" : null, "conn-1", null],
            names: [includePrimary ? "Environment 0" : null, "Environment 1", null],
            customers: { value: [{ CustomerAccount: "C001" }] },
            saved: [includePrimary ? { id: "conn-0", connectionType: "dataverse" } : null, { id: "conn-1", connectionType: "financeOperations" }, null],
        });
        expect(JSON.stringify(response.content)).not.toContain("token-1");
        expect(financeRequest).toHaveBeenCalledWith("conn-1", "GET", "CustomersV3?$top=1", undefined, { connectionTarget: "secondary", headers: {} });
        if (includePrimary) expect(queryData).toHaveBeenCalledWith("conn-0", "accounts?$top=1");
        else expect(queryData).not.toHaveBeenCalled();
    });

    it("passes incomplete typed windowed assignments to the picker without authentication", async () => {
        useFinanceConnection();
        const response = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "windowed", connectionNames: ["Environment 0"] } } });
        expect(response.isError).not.toBe(true);
        expect(launchToolWithContext.mock.calls[0][8]).toEqual(["conn-0", null, null]);
        expect((manager as any).authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("passes complete typed windowed assignments in declared order and rejects a wrong product", async () => {
        useFinanceConnection();
        const valid = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "windowed", connectionNames: [null, "Environment 1"] } } });
        expect(valid.isError).not.toBe(true);
        expect(launchToolWithContext.mock.calls[0][8]).toEqual([null, "conn-1", null]);
        launchToolWithContext.mockClear();
        const invalid = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "windowed", connectionNames: [null, "Environment 0"] } } });
        expect(invalid.isError).toBe(true);
        expect(JSON.stringify(invalid.content)).toContain("F&O customers");
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    it.each([
        [{ connectionNames: [null, "Environment 0"] }, "F&O customers"],
        [{ connectionNames: ["Environment 0"] }, "F&O customers"],
        [{ connectionName: "Environment 1" }, "Optional accounts"],
        [{ authToken: "caller-token" }, "F&O customers"],
        [{ connectionNames: [null, "Unknown"] }, "No saved connection"],
        [{ connectionNames: [null, "Environment 1", null, null] }, "at most 3"],
    ])("rejects invalid typed assignments before execution: %j", async (metadata, message) => {
        useFinanceConnection();
        const response = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "headless", ...metadata } } });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response.content)).toContain(message);
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
        expect(launchToolWithContext).not.toHaveBeenCalled();
        expect((manager as any).authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("allows an empty all-optional explicit tool and preserves legacy token-only calls", async () => {
        expect((await client.callTool({ name: "optional", arguments: { __pptb: { executionMode: "headless" } } })).isError).not.toBe(true);
        expect((invokeHeadlessTool as jest.Mock).mock.calls[0][2].connectionIds).toEqual([null]);
        expect((await client.callTool({ name: "legacy", arguments: { __pptb: { executionMode: "headless", authToken: "callback-token" } } })).isError).not.toBe(true);
        expect((invokeHeadlessTool as jest.Mock).mock.calls[1][2]).toMatchObject({ authToken: "callback-token", connectionIds: undefined });
    });

    it("rejects legacy null placeholders and ambiguous typed names", async () => {
        const legacy = await client.callTool({ name: "multi", arguments: { __pptb: { executionMode: "headless", connectionNames: [null, "Environment 1"] } } });
        expect(legacy.isError).toBe(true);
        (manager as any).connectionsManager = { getConnections: () => [connections[0], { ...connections[0], id: "duplicate" }] };
        const ambiguous = await client.callTool({ name: "typed", arguments: { __pptb: { executionMode: "headless", connectionNames: ["Environment 0"] } } });
        expect(JSON.stringify(ambiguous.content)).toContain("Multiple connections");
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
    });

    it.each([
        ["multi", { connectionNames: ["Environment 0"] }, "requires at least 2"],
        ["multi", { connectionNames: ["Environment 0", "Unknown"] }, "No saved connection"],
        ["zero", { connectionNames: ["Environment 0"] }, "does not accept connections"],
        ["multi", { connectionNames: "not-an-array" }, "array of non-empty"],
        ["multi", { connectionNames: ["Environment 0", "Environment 1", "Environment 2", "Environment 0"] }, "at most 3"],
        ["multi", { connectionNames: ["Environment 0", "Environment 1"], connectionName: "Environment 2" }, "must match"],
    ])("rejects invalid metadata for %s without launching or prompting", async (name, metadata, message) => {
        const response = await client.callTool({ name, arguments: { __pptb: { executionMode: "headless", ...metadata } } });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response.content)).toContain(message);
        expect(launchToolWithContext).not.toHaveBeenCalled();
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
    });

    it("keeps singular names compatible and permits connectionless tools", async () => {
        expect((await client.callTool({ name: "legacy", arguments: { __pptb: { executionMode: "headless", connectionName: "Environment 1" } } })).isError).not.toBe(true);
        expect((invokeHeadlessTool as jest.Mock).mock.calls[0][2].connectionIds).toEqual(["conn-1"]);
        expect((await client.callTool({ name: "zero", arguments: { __pptb: { executionMode: "headless", connectionNames: [] } } })).isError).not.toBe(true);
        expect((invokeHeadlessTool as jest.Mock).mock.calls[1][2].connectionIds).toEqual([]);
    });

    it("rejects unknown windowed names before opening any tool or picker", async () => {
        const response = await client.callTool({ name: "multi", arguments: { __pptb: { executionMode: "windowed", connectionNames: ["Environment 0", "Unknown"] } } });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response.content)).toContain("No saved connection");
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    it("reports callback token provenance without returning the token in one-way acceptance", async () => {
        const response = await client.callTool({
            name: "multi",
            arguments: {
                __pptb: {
                    executionMode: "headless",
                    mode: "one-way",
                    connectionNames: ["Environment 0", "Environment 1"],
                    authToken: "caller-secret-token",
                },
            },
        });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toMatchObject({ status: "accepted", authSource: "provided-token", hasAuthToken: true });
        expect(JSON.stringify(response)).not.toContain("caller-secret-token");
    });
});
