import { getMcpClientPresentation, MCP_CLIENTS } from "../../../src/renderer/modules/mcpClients";

describe("MCP client presentation", () => {
    it.each([
        ["connected", "Configured", "Reconnect", true],
        ["invalid", "Needs attention", "Repair", true],
        ["not-configured", "Not configured", "Connect", false],
    ] as const)("presents %s configuration without implying a live connection", (status, label, action, canDisconnect) => {
        expect(getMcpClientPresentation(status)).toEqual({ label, action, canDisconnect });
    });

    it("uses unique client identities and dedicated configuration methods", () => {
        expect(new Set(MCP_CLIENTS.map((client) => client.id)).size).toBe(MCP_CLIENTS.length);
        expect(MCP_CLIENTS).toEqual([
            { id: "claude-desktop", name: "Claude Desktop", configure: "configureClaudeDesktop", disconnect: "disconnectClaudeDesktop" },
            { id: "vscode", name: "Visual Studio Code", configure: "configureVSCode", disconnect: "disconnectVSCode" },
        ]);
    });
});
