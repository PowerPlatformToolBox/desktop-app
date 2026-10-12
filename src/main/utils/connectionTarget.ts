import type { ConnectionTarget } from "../../common/connectionSlots";

export interface ToolConnectionLookup {
    getConnectionIdByWebContents(webContentsId: number, target?: ConnectionTarget): string | null;
}

export function resolveToolConnectionForRequest(manager: ToolConnectionLookup | null | undefined, webContentsId: number, target?: ConnectionTarget): string {
    const connectionId = manager?.getConnectionIdByWebContents(webContentsId, target);
    if (connectionId) return connectionId;

    const targetLabel = target === "secondary" ? "secondary connection" : typeof target === "number" ? `connection slot ${target + 1}` : "connection";
    throw new Error(`No ${targetLabel} found for this tool instance. Please ensure the tool is connected to an environment.`);
}
