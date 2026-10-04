/// <reference types="jest" />

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { McpServerManager, parseInvocationMeta } from "../../../../src/main/mcp/mcpServer";

jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
        mkdir: jest.fn(),
        writeFile: jest.fn(),
    },
}));

jest.mock("os", () => ({
    __esModule: true,
    default: {
        homedir: jest.fn(),
    },
}));

function createManager(): McpServerManager {
    const settingsManager = {
        getMcpAccessToken: jest.fn().mockReturnValue("expected-token"),
    } as any;

    return new McpServerManager(7339, "127.0.0.1", settingsManager, { on: jest.fn() } as any, { on: jest.fn() } as any);
}

function getClientConfigPaths(): { claudePath: string; vscodePath: string } {
    if (process.platform === "darwin") {
        return {
            claudePath: path.join("/test-home", "Library", "Application Support", "Claude", "claude_desktop_config.json"),
            vscodePath: path.join("/test-home", "Library", "Application Support", "Code", "User", "mcp.json"),
        };
    }

    if (process.platform === "win32") {
        const appDataDir = process.env.APPDATA || path.join("/test-home", "AppData", "Roaming");
        return {
            claudePath: path.join(appDataDir, "Claude", "claude_desktop_config.json"),
            vscodePath: path.join(appDataDir, "Code", "User", "mcp.json"),
        };
    }

    return {
        claudePath: path.join("/test-home", ".config", "Claude", "claude_desktop_config.json"),
        vscodePath: path.join("/test-home", ".config", "Code", "User", "mcp.json"),
    };
}

describe("McpServerManager client configuration status", () => {
    const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

    beforeEach(() => {
        jest.clearAllMocks();
        (os.homedir as jest.Mock).mockReturnValue("/test-home");
    });

    it("reports connected, not configured, and invalid client configs", async () => {
        const manager = createManager();
        const { claudePath, vscodePath } = getClientConfigPaths();

        mockedReadFile.mockImplementation(async (filePath) => {
            if (filePath === claudePath) {
                return JSON.stringify({
                    mcpServers: {
                        pptb: {
                            command: "npx",
                            args: ["-y", "mcp-remote", "http://127.0.0.1:7339/mcp", "--header", "X-MCP-Auth-Token: expected-token"],
                        },
                    },
                });
            }
            if (filePath === vscodePath) {
                return JSON.stringify({ servers: { pptb: { type: "http", url: "http://wrong/mcp" } } });
            }
            throw Object.assign(new Error("Not found"), { code: "ENOENT" });
        });

        await expect(manager.getClientConfigStatuses()).resolves.toEqual([
            { client: "claude-desktop", status: "connected", filePath: claudePath },
            { client: "vscode", status: "invalid", filePath: vscodePath },
        ]);

        mockedReadFile.mockImplementation(async (filePath) => {
            if (filePath === vscodePath) {
                return JSON.stringify({
                    servers: {
                        pptb: {
                            headers: { "X-MCP-Auth-Token": "expected-token" },
                            url: "http://127.0.0.1:7339/mcp",
                            type: "http",
                        },
                    },
                });
            }
            throw Object.assign(new Error("Not found"), { code: "ENOENT" });
        });
        await expect(manager.getClientConfigStatuses()).resolves.toEqual([
            { client: "claude-desktop", status: "not-configured", filePath: claudePath },
            { client: "vscode", status: "connected", filePath: vscodePath },
        ]);

        mockedReadFile.mockRejectedValue(Object.assign(new Error("Not found"), { code: "ENOENT" }));
        await expect(manager.getClientConfigStatuses()).resolves.toEqual([
            { client: "claude-desktop", status: "not-configured", filePath: claudePath },
            { client: "vscode", status: "not-configured", filePath: vscodePath },
        ]);
    });
});

describe("McpServerManager headless auth resolution", () => {
    function setupNamedConnections() {
        const manager = createManager();
        const connections = Array.from({ length: 3 }, (_, index) => ({
            id: `conn-${index}`,
            name: `Environment ${index}`,
            url: `https://env${index}.example.test`,
            authenticationType: "interactive",
            accessToken: `token-${index}`,
            tokenExpiry: new Date(Date.now() + 300_000).toISOString(),
        }));
        const connectionsManager = { getConnections: jest.fn(() => connections), updateConnectionTokens: jest.fn() };
        const authManager = { authenticateInteractive: jest.fn(), authenticateClientSecret: jest.fn(), acquireTokenSilently: jest.fn() };
        (manager as any).connectionsManager = connectionsManager;
        (manager as any).authManager = authManager;
        return { manager, connections, connectionsManager, authManager };
    }

    it("parses trimmed positional names and retains the singular primary alias", () => {
        expect(parseInvocationMeta({ __pptb: { connectionNames: [" Source ", "Target"], connectionName: "source" } })).toMatchObject({
            connectionNames: ["Source", "Target"],
            connectionName: "source",
        });
        expect(parseInvocationMeta({ __pptb: { connectionNames: [] } })).toEqual({ connectionNames: [] });
        expect(() => parseInvocationMeta({ __pptb: { connectionNames: ["Source"], connectionName: "Different" } })).toThrow("must match");
    });

    it.each(["Source", [""], [1], null])("rejects malformed connectionNames %p", (connectionNames) => {
        expect(() => parseInvocationMeta({ __pptb: { connectionNames } })).toThrow("array of non-empty");
    });

    it("resolves three names in order and preserves legacy primary fields", async () => {
        const { manager } = setupNamedConnections();
        const resolved = await (manager as any).resolveInvocationConnections(
            { connectionNames: ["environment 2", "Environment 0", "Environment 1"] },
            { name: "Sample", features: { connections: 3 } },
            true,
        );
        expect(resolved).toMatchObject({
            connectionIds: ["conn-2", "conn-0", "conn-1"],
            connectionUrls: ["https://env2.example.test", "https://env0.example.test", "https://env1.example.test"],
            authTokens: ["token-2", "token-0", "token-1"],
            connectionId: "conn-2",
            authToken: "token-2",
        });
        expect(await (manager as any).resolveInvocationConnections({ connectionName: "Environment 1" }, { name: "Legacy", features: { multiConnection: "none" } }, true)).toMatchObject({
            connectionIds: ["conn-1"],
            connectionId: "conn-1",
        });
    });

    it.each([
        [{ connectionNames: ["Missing"] }, { connections: 1 }, "No saved connection"],
        [{ connectionNames: ["Environment 0"] }, { connections: 3 }, "requires at least 3"],
        [{ connectionNames: ["Environment 0"] }, { connections: 0 }, "does not accept connections"],
        [{ connectionNames: ["Environment 0", "Environment 1", "Environment 2"] }, { connections: 2 }, "at most 2"],
    ])("rejects invalid named assignments before authentication", async (meta, features, message) => {
        const { manager, authManager, connectionsManager } = setupNamedConnections();
        await expect((manager as any).resolveInvocationConnections(meta, { name: "Sample", features }, true)).rejects.toThrow(message);
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
        expect(connectionsManager.updateConnectionTokens).not.toHaveBeenCalled();
    });

    it("rejects ambiguous names and never starts interactive authentication in headless mode", async () => {
        const { manager, connections, authManager } = setupNamedConnections();
        connections.push({ ...connections[0], id: "duplicate" });
        await expect((manager as any).resolveInvocationConnections({ connectionNames: ["Environment 0"] }, { name: "Sample", features: { connections: 1 } }, true)).rejects.toThrow(
            "Multiple connections",
        );
        connections.pop();
        connections[0].accessToken = "";
        await expect((manager as any).resolveInvocationConnections({ connectionNames: ["Environment 0"] }, { name: "Sample", features: { connections: 1 } }, true)).rejects.toThrow(
            "requires interactive sign-in",
        );
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("allows empty connectionless headless calls and resolves windowed names without authenticating", async () => {
        const { manager, authManager } = setupNamedConnections();
        expect(await (manager as any).resolveInvocationConnections({}, { name: "Zero", features: { connections: 0 } }, true)).toMatchObject({ connectionIds: [], source: "none" });
        expect(await (manager as any).resolveInvocationConnections({ connectionNames: ["Environment 2"] }, { name: "Windowed", features: { connections: 3 } }, false)).toMatchObject({
            connectionIds: ["conn-2"],
        });
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("retains named primary identity with an explicit token override and authenticates later slots normally", async () => {
        const { manager, authManager } = setupNamedConnections();
        const resolved = await (manager as any).resolveInvocationConnections(
            { connectionNames: ["Environment 0", "Environment 1"], authToken: "provided-token" },
            { name: "Sample", features: { connections: 2 } },
            true,
        );
        expect(resolved).toMatchObject({ source: "provided-token", connectionIds: ["conn-0", "conn-1"], authToken: "provided-token", authTokens: ["provided-token", "token-1"] });
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("does not let a callback token bypass authentication of the saved connection used by global APIs", async () => {
        const { manager, connections, authManager } = setupNamedConnections();
        connections[0].accessToken = "";
        await expect(
            (manager as any).resolveInvocationConnections({ connectionNames: ["Environment 0"], authToken: "provided-token" }, { name: "Sample", features: { connections: 1 } }, true),
        ).rejects.toThrow("requires interactive sign-in");
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("acquires and stores client-secret tokens without interactive prompts", async () => {
        const { manager, connections, authManager, connectionsManager } = setupNamedConnections();
        connections[0].accessToken = "";
        connections[0].authenticationType = "clientSecret";
        authManager.authenticateClientSecret.mockResolvedValue({ accessToken: "fresh-token", expiresOn: new Date(Date.now() + 300_000) });
        const resolved = await (manager as any).resolveInvocationConnections({ connectionNames: ["Environment 0"] }, { name: "Sample", features: { connections: 1 } }, true);
        expect(resolved.authTokens).toEqual(["fresh-token"]);
        expect(connectionsManager.updateConnectionTokens).toHaveBeenCalledWith("conn-0", expect.objectContaining({ accessToken: "fresh-token" }));
        expect(authManager.authenticateInteractive).not.toHaveBeenCalled();
    });

    it("initiates interactive auth for a named connection when no reusable session exists", async () => {
        const manager = createManager();

        const connection = {
            id: "conn-1",
            name: "Headless Demo",
            url: "https://contoso.crm.dynamics.com",
            authenticationType: "interactive",
        } as any;

        const connectionsManager = {
            getConnections: jest.fn().mockReturnValue([connection]),
            updateConnectionTokens: jest.fn(),
        } as any;

        const authManager = {
            authenticateInteractive: jest.fn().mockResolvedValue({
                accessToken: "sample-access-token",
                expiresOn: new Date(Date.now() + 60_000),
                msalAccountId: "account-1",
            }),
            acquireTokenSilently: jest.fn(),
            refreshAccessToken: jest.fn(),
            authenticateClientSecret: jest.fn(),
            authenticateUsernamePassword: jest.fn(),
        } as any;

        (manager as any).connectionsManager = connectionsManager;
        (manager as any).authManager = authManager;

        const result = await (manager as any).resolveHeadlessAuthContext({ connectionName: "Headless Demo" });

        expect(authManager.authenticateInteractive).toHaveBeenCalledWith(connection);
        expect(connectionsManager.updateConnectionTokens).toHaveBeenCalledWith(connection.id, {
            accessToken: "sample-access-token",
            refreshToken: undefined,
            expiresOn: expect.any(Date),
            msalAccountId: "account-1",
        });
        expect(result).toMatchObject({
            authToken: "sample-access-token",
            source: "connection-name",
            connectionName: "Headless Demo",
            connectionId: "conn-1",
            connectionUrl: "https://contoso.crm.dynamics.com",
        });
    });
});
