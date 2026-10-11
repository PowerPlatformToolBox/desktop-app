import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
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

    beforeEach(async () => {
        jest.clearAllMocks();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-mcp-connections-"));
        const manifests = [
            { id: "multi", name: "Multi", features: { connections: { min: 2, max: 3 } } },
            { id: "legacy", name: "Legacy", features: { multiConnection: "none" } },
            { id: "zero", name: "Zero", features: { connections: 0 } },
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
        (manager as any).connectionsManager = { getConnections: () => connections, updateConnectionTokens: jest.fn() };
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
