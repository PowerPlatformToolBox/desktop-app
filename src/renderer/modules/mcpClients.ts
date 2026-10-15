import type { McpClientConfigStatus, McpServerAPI } from "../../common/types";

interface McpClientDefinition {
    id: McpClientConfigStatus["client"];
    name: string;
    configure: keyof Pick<McpServerAPI, "configureClaudeDesktop" | "configureVSCode">;
    disconnect: keyof Pick<McpServerAPI, "disconnectClaudeDesktop" | "disconnectVSCode">;
}

export const MCP_CLIENTS: readonly McpClientDefinition[] = [
    { id: "claude-desktop", name: "Claude Desktop", configure: "configureClaudeDesktop", disconnect: "disconnectClaudeDesktop" },
    { id: "vscode", name: "Visual Studio Code", configure: "configureVSCode", disconnect: "disconnectVSCode" },
];

export function getMcpClientPresentation(status: McpClientConfigStatus["status"]): { label: string; action: string; canDisconnect: boolean } {
    switch (status) {
        case "connected":
            return { label: "Configured", action: "Reconnect", canDisconnect: true };
        case "invalid":
            return { label: "Needs attention", action: "Repair", canDisconnect: true };
        default:
            return { label: "Not configured", action: "Connect", canDisconnect: false };
    }
}
