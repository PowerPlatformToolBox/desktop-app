import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import type { ToolManifest } from "../../../../src/common/types";
import { CONNECTION_SELECTION_INSTRUCTIONS } from "../../../../src/main/mcp/headlessInputRequirements";
import { invokeHeadlessTool } from "../../../../src/main/mcp/headlessToolRuntime";
import { McpServerManager } from "../../../../src/main/mcp/mcpServer";

jest.mock("../../../../src/main/mcp/headlessToolRuntime", () => ({ invokeHeadlessTool: jest.fn() }));
jest.mock("../../../../src/main/mcp/agentInvocationLogger", () => ({ logInvocation: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logError: jest.fn() }));

interface TestConnection {
    id: string;
    name: string;
    url: string;
    environment: string;
    authenticationType: string;
    accessToken?: string;
    tokenExpiry?: string;
    clientSecret?: string;
    msalAccountId?: string;
}

function textOf(response: Awaited<ReturnType<Client["callTool"]>>): string {
    return (response.content as Array<{ type: string; text?: string }>).map((item) => item.text ?? "").join("\n");
}

function payloadOf(response: Awaited<ReturnType<Client["callTool"]>>): Record<string, any> {
    const text = textOf(response);
    return JSON.parse(text.slice(text.indexOf("\n{") + 1));
}

describe("MCP agent-driven headless input flow", () => {
    let directory: string;
    let manager: McpServerManager;
    let client: Client;
    let connections: TestConnection[];
    const launchToolWithContext = jest.fn().mockResolvedValue({ done: true });
    const authManager = {
        authenticateInteractive: jest.fn(),
        authenticateClientSecret: jest.fn(),
        authenticateUsernamePassword: jest.fn(),
        acquireTokenSilently: jest.fn(),
        refreshAccessToken: jest.fn(),
    };
    const connectionsManager = {
        getConnections: jest.fn(() => connections),
        updateConnectionTokens: jest.fn((id: string, tokens: { accessToken: string; expiresOn: Date }) => {
            const connection = connections.find((candidate) => candidate.id === id)!;
            connection.accessToken = tokens.accessToken;
            connection.tokenExpiry = tokens.expiresOn.toISOString();
        }),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        const future = new Date(Date.now() + 600_000).toISOString();
        connections = [
            { id: "conn-dev", name: "Contoso Dev", url: "https://dev.example.test", environment: "Dev", authenticationType: "interactive", accessToken: "dev-token", tokenExpiry: future },
            { id: "conn-prod", name: "Contoso Prod", url: "https://prod.example.test", environment: "Production", authenticationType: "interactive" },
            { id: "conn-uat", name: "Contoso UAT", url: "https://uat.example.test", environment: "UAT", authenticationType: "clientSecret", clientSecret: "super-secret" },
        ];
        authManager.authenticateInteractive.mockImplementation(async (connection: TestConnection) => ({
            accessToken: `${connection.id}-interactive`,
            expiresOn: new Date(Date.now() + 600_000),
            msalAccountId: "account",
        }));
        authManager.authenticateClientSecret.mockImplementation(async (connection: TestConnection) => ({ accessToken: `${connection.id}-secret`, expiresOn: new Date(Date.now() + 600_000) }));

        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-mcp-agent-flow-"));
        const fixtures = [
            {
                id: "single",
                name: "Single",
                features: { connections: 1 },
                agents: { invokable: true, headless: true, executionModes: ["windowed", "headless"], defaultExecutionMode: "windowed", modes: ["two-way"] },
                prefill: {
                    type: "object",
                    properties: {
                        entityName: { type: "string", required: true, title: "Table", description: "Logical name of the table" },
                        top: { type: "number" },
                    },
                },
            },
            {
                id: "compare",
                name: "Compare",
                features: { connections: { min: 2, max: 2 } },
                agents: { invokable: true, headless: true, modes: ["two-way"] },
                prefill: { type: "object", properties: {} },
            },
            {
                id: "windowonly",
                name: "Window Only",
                features: { connections: 1 },
                agents: { invokable: true, modes: ["two-way"] },
                prefill: { type: "object", properties: { entityName: { type: "string", required: true } } },
            },
        ];
        const manifests = fixtures.map((fixture) => {
            const installPath = path.join(directory, fixture.id);
            fs.mkdirSync(installPath);
            fs.writeFileSync(
                path.join(installPath, "pptb.config.json"),
                JSON.stringify({ agents: fixture.agents, invocation: { prefill: fixture.prefill, returnTopic: { type: "object", properties: {} } } }),
            );
            return {
                id: fixture.id,
                name: fixture.name,
                features: fixture.features,
                version: "1.0.0",
                description: "Agent flow fixture",
                installPath,
                installedAt: "2026-10-16",
                source: "registry",
            } as ToolManifest;
        });
        const registry = {
            on: jest.fn(),
            getInstalledTools: jest.fn(async () => manifests),
            getInstalledManifestSync: jest.fn((id: string) => manifests.find((tool) => tool.id === id) ?? null),
        };
        const tools = { on: jest.fn(), getAllTools: jest.fn(() => []), getTool: jest.fn((id: string) => manifests.find((tool) => tool.id === id)) };
        manager = new McpServerManager(0, "127.0.0.1", { getMcpAccessToken: () => "flow-token" } as any, registry as any, tools as any);
        (manager as any).connectionsManager = connectionsManager;
        (manager as any).authManager = authManager;
        manager.setToolWindowManager({ launchToolWithContext } as any);
        (invokeHeadlessTool as jest.Mock).mockImplementation(async (_manifest, input, context) => ({ input, names: context.connectionNames, tokens: context.authTokens }));
        await manager.start();
        const port = ((manager as unknown as { httpServer: Server }).httpServer.address() as AddressInfo).port;
        client = new Client({ name: "agent-flow-tests", version: "1.0.0" });
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { "x-mcp-auth-token": "flow-token" } } }));
    });

    afterEach(async () => {
        await client?.close();
        await manager?.stop();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it("advertises built-in connection tools and headless-first execution", async () => {
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["pptb_list_connections", "pptb_authenticate_connections", "single", "compare", "window-only"]));
        const single = tools.find((tool) => tool.name === "single")!;
        expect(single.description).toContain("defaultExecutionMode: headless");
        expect(single.description).toContain("connections: 1");
        expect(JSON.stringify(single.inputSchema)).toContain("only as a backup");
        expect((single.inputSchema.properties as any).entityName).toMatchObject({ title: "Table", description: "Logical name of the table" });
        expect(tools.find((tool) => tool.name === "window-only")!.description).toContain("defaultExecutionMode: windowed");
    });

    it("requires a chat connection picker in initialization and every connection-dependent tool description", async () => {
        expect(client.getInstructions()).toBe(CONNECTION_SELECTION_INSTRUCTIONS);
        const { tools } = await client.listTools();
        for (const name of ["pptb_list_connections", "single", "compare", "window-only"]) {
            expect(tools.find((tool) => tool.name === name)!.description).toContain(CONNECTION_SELECTION_INSTRUCTIONS);
        }
        expect(CONNECTION_SELECTION_INSTRUCTIONS).toContain("wait for the user's explicit selection");
        expect(CONNECTION_SELECTION_INSTRUCTIONS).toContain("even if only one connection exists or connections are already signed-in");
        expect(CONNECTION_SELECTION_INSTRUCTIONS).toContain("Never choose, probe, or iterate through other connections");
        expect(CONNECTION_SELECTION_INSTRUCTIONS).toContain("If the user cancels or has not selected a connection, stop");
        expect(tools.find((tool) => tool.name === "pptb_authenticate_connections")!.description).toContain('skip connections whose authStatus is "signed-in"');
    });

    it("lists connections with environment and auth status but never IDs or secrets", async () => {
        const response = await client.callTool({ name: "pptb_list_connections", arguments: {} });
        expect(response.structuredContent).toEqual({
            nextSteps: [CONNECTION_SELECTION_INSTRUCTIONS],
            connections: [
                { name: "Contoso Dev", environment: "Dev", url: "https://dev.example.test", authenticationType: "interactive", authStatus: "signed-in" },
                { name: "Contoso Prod", environment: "Production", url: "https://prod.example.test", authenticationType: "interactive", authStatus: "sign-in-required" },
                { name: "Contoso UAT", environment: "UAT", url: "https://uat.example.test", authenticationType: "clientSecret", authStatus: "refreshable" },
            ],
        });
        const serialized = JSON.stringify(response);
        for (const secret of ["conn-dev", "dev-token", "super-secret"]) {
            expect(serialized).not.toContain(secret);
        }
        const filtered = await client.callTool({ name: "pptb_list_connections", arguments: { environment: "production" } });
        expect((filtered.structuredContent as any).connections.map((connection: { name: string }) => connection.name)).toEqual(["Contoso Prod"]);
    });

    it("still requires a picker when the only saved connection is already authenticated", async () => {
        connections = [connections[0]];
        const listed = await client.callTool({ name: "pptb_list_connections", arguments: {} });
        expect(listed.structuredContent).toMatchObject({
            connections: [{ name: "Contoso Dev", authStatus: "signed-in" }],
            nextSteps: [CONNECTION_SELECTION_INSTRUCTIONS],
        });
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("uses only the picked signed-in connection without authenticating or probing other environments", async () => {
        const response = await client.callTool({ name: "single", arguments: { entityName: "account", __pptb: { connectionNames: ["Contoso Dev"] } } });
        expect(response.isError).not.toBe(true);
        expect(invokeHeadlessTool).toHaveBeenCalledTimes(1);
        expect((invokeHeadlessTool as jest.Mock).mock.calls[0][2]).toMatchObject({ connectionIds: ["conn-dev"], connectionNames: ["Contoso Dev"], authTokens: ["dev-token"] });
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
        expect(authManager.authenticateClientSecret).not.toHaveBeenCalled();
        expect(authManager.authenticateUsernamePassword).not.toHaveBeenCalled();
        expect(authManager.acquireTokenSilently).not.toHaveBeenCalled();
        expect(authManager.refreshAccessToken).not.toHaveBeenCalled();
    });

    it("defaults to headless and returns connections plus missing parameters in one input_required response", async () => {
        const response = await client.callTool({ name: "single", arguments: {} });
        expect(response.isError).toBe(true);
        expect(textOf(response)).toContain("ACTION REQUIRED");
        const payload = payloadOf(response);
        expect(payload).toMatchObject({ status: "input_required", tool: "single", executionMode: "headless" });
        expect(payload.requirements.parameters).toEqual([{ name: "entityName", type: "string", title: "Table", description: "Logical name of the table" }]);
        expect(payload.requirements.connections).toMatchObject({ minConnections: 1, maxConnections: 1, slots: [{ index: 0, label: "Primary", required: true }] });
        expect(payload.requirements.connections.availableConnections.map((connection: { name: string; environment: string }) => [connection.name, connection.environment])).toEqual([
            ["Contoso Dev", "Dev"],
            ["Contoso Prod", "Production"],
            ["Contoso UAT", "UAT"],
        ]);
        expect(payload.nextSteps.join(" ")).toContain("pptb_authenticate_connections");
        expect(payload.nextSteps.join(" ")).toContain("wait for the user's explicit selection");
        expect(payload.nextSteps.join(" ")).toContain("Never choose, probe, or iterate through other connections");
        expect(payload.nextSteps.join(" ")).toContain('"windowed"');
        expect(JSON.stringify(response)).not.toContain("dev-token");
        expect(invokeHeadlessTool).not.toHaveBeenCalled();
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    it("asks the agent to authenticate instead of opening a browser, then runs after agent-requested sign-in", async () => {
        const first = await client.callTool({ name: "single", arguments: { entityName: "account", __pptb: { connectionNames: ["Contoso Prod"] } } });
        expect(first.isError).toBe(true);
        const payload = payloadOf(first);
        expect(payload.requirements.connections).toBeUndefined();
        expect(payload.requirements.authentication.connections).toEqual([
            expect.objectContaining({ name: "Contoso Prod", environment: "Production", reason: expect.stringContaining("requires interactive sign-in") }),
        ]);
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();

        const auth = await client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: ["Contoso Prod"] } });
        expect(auth.isError).toBe(false);
        expect(auth.structuredContent).toEqual({
            allAuthenticated: true,
            results: [{ name: "Contoso Prod", environment: "Production", authenticationType: "interactive", status: "authenticated" }],
        });
        expect(authManager.authenticateInteractive).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(auth)).not.toContain("conn-prod-interactive");

        const retry = await client.callTool({ name: "single", arguments: { entityName: "account", __pptb: { connectionNames: ["Contoso Prod"] } } });
        expect(retry.isError).not.toBe(true);
        expect(retry.structuredContent).toEqual({ input: { entityName: "account" }, names: ["Contoso Prod"], tokens: ["conn-prod-interactive"] });
        expect(launchToolWithContext).not.toHaveBeenCalled();
    });

    it("requires every slot of a multi-connection tool and authenticates all of them", async () => {
        const first = await client.callTool({ name: "compare", arguments: { __pptb: { connectionNames: ["Contoso Dev"] } } });
        const payload = payloadOf(first);
        expect(payload.messages).toContain("Tool 'Compare' requires at least 2 named connections; received 1.");
        expect(payload.requirements.connections.slots).toEqual([
            { index: 0, label: "Primary", required: true, assignedConnectionName: "Contoso Dev" },
            { index: 1, label: "Secondary", required: true },
        ]);

        const unauthenticated = await client.callTool({ name: "compare", arguments: { __pptb: { connectionNames: ["Contoso Prod", "Missing Env"] } } });
        const unauthenticatedPayload = payloadOf(unauthenticated);
        expect(unauthenticatedPayload.requirements.connections.unknownConnectionNames).toEqual(["Missing Env"]);
        expect(unauthenticatedPayload.requirements.authentication.connections.map((connection: { name: string }) => connection.name)).toEqual(["Contoso Prod"]);

        const auth = await client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: ["Contoso Prod", "Contoso UAT", "contoso prod"] } });
        expect((auth.structuredContent as any).results.map((result: { name: string; status: string }) => [result.name, result.status])).toEqual([
            ["Contoso Prod", "authenticated"],
            ["Contoso UAT", "authenticated"],
        ]);

        const retry = await client.callTool({ name: "compare", arguments: { __pptb: { connectionNames: ["Contoso Prod", "Contoso UAT"] } } });
        expect(retry.isError).not.toBe(true);
        expect(retry.structuredContent).toMatchObject({ names: ["Contoso Prod", "Contoso UAT"], tokens: ["conn-prod-interactive", "conn-uat-secret"] });
    });

    it("reports per-connection authentication failures without throwing", async () => {
        authManager.authenticateInteractive.mockRejectedValueOnce(new Error("User cancelled sign-in"));
        const response = await client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: ["Contoso Prod", "Nope"] } });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({
            allAuthenticated: false,
            results: [
                { name: "Contoso Prod", status: "failed", error: "User cancelled sign-in" },
                { name: "Nope", status: "not-found" },
            ],
        });
        expect((await client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: [] } })).isError).toBe(true);
    });

    it("shares one in-flight browser sign-in across concurrent authentication requests", async () => {
        let finishSignIn: () => void = () => undefined;
        authManager.authenticateInteractive.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSignIn = () => resolve({ accessToken: "shared-token", expiresOn: new Date(Date.now() + 600_000) });
                }),
        );
        const calls = [
            client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: ["Contoso Prod"] } }),
            client.callTool({ name: "pptb_authenticate_connections", arguments: { connectionNames: ["Contoso Prod"] } }),
        ];
        await new Promise((resolve) => setTimeout(resolve, 100));
        finishSignIn();
        const results = await Promise.all(calls);
        expect(results.map((result) => (result.structuredContent as any).allAuthenticated)).toEqual([true, true]);
        expect(authManager.authenticateInteractive).toHaveBeenCalledTimes(1);
    });

    it("asks for missing parameters in windowed mode but lets the tool UI pick connections", async () => {
        const missing = await client.callTool({ name: "window-only", arguments: {} });
        const payload = payloadOf(missing);
        expect(payload).toMatchObject({ executionMode: "windowed", requirements: { parameters: [{ name: "entityName", type: "string" }] } });
        expect(payload.requirements.connections).toBeUndefined();
        expect(payload.nextSteps.join(" ")).not.toContain("Backup only");
        expect(launchToolWithContext).not.toHaveBeenCalled();

        const launched = await client.callTool({ name: "window-only", arguments: { entityName: "account" } });
        expect(launched.isError).not.toBe(true);
        expect(launchToolWithContext).toHaveBeenCalledTimes(1);
    });

    it("still rejects type errors directly instead of asking the user", async () => {
        const response = await client.callTool({ name: "single", arguments: { entityName: 42, __pptb: { connectionNames: ["Contoso Dev"] } } });
        expect(response.isError).toBe(true);
        expect(textOf(response)).toContain("Input validation failed: $.entityName: expected string");
        expect(textOf(response)).not.toContain("ACTION REQUIRED");
    });
});
