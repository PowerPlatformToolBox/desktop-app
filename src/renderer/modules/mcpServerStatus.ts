import { McpServerStatus } from "../../common/types";

export interface McpServerStatusPresentation {
    label: string;
    title: string;
}

export function getMcpServerStatusPresentation(status: McpServerStatus, error?: string): McpServerStatusPresentation {
    switch (status) {
        case "running":
            return { label: "Running", title: "MCP Server: Running" };
        case "stopped":
            return { label: "Stopped", title: "MCP Server: Stopped" };
        case "error":
            return { label: "Error", title: error ? `MCP Server: Error — ${error}` : "MCP Server: Error" };
        case "starting":
        default:
            return { label: "Checking status", title: "MCP Server: Checking status" };
    }
}

export function updateMcpActivityStatus(status: McpServerStatus, error?: string): void {
    const button = document.getElementById("mcp-btn");
    if (!button) {
        return;
    }

    const presentation = getMcpServerStatusPresentation(status, error);
    button.dataset.mcpStatus = status;
    button.title = presentation.title;
    button.setAttribute("aria-label", presentation.title);
}
