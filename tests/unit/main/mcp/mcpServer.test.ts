/// <reference types="jest" />

import { McpServerManager } from "../../../../src/main/mcp/mcpServer";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

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
