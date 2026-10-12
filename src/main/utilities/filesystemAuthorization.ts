import type { WebContents } from "electron";
import type { ToolFileSystemAccessManager } from "../managers/toolFileSystemAccessManager";
import type { ToolWindowManager } from "../managers/toolWindowManager";

export function authorizeFilesystemCaller(
    sender: Pick<WebContents, "id" | "isDestroyed">,
    mainSender: Pick<WebContents, "id" | "isDestroyed"> | null | undefined,
    tools: Pick<ToolWindowManager, "getInstanceIdByWebContents"> | null | undefined,
    access: Pick<ToolFileSystemAccessManager, "validateAccess">,
    targetPath?: string,
): string | null {
    if (sender.isDestroyed()) throw new Error("Filesystem caller is destroyed");
    if (sender === mainSender) return null;
    const instanceId = tools?.getInstanceIdByWebContents(sender.id);
    if (!instanceId) throw new Error("Filesystem caller is not a recognized tool instance");
    if (targetPath !== undefined) access.validateAccess(instanceId, targetPath);
    return instanceId;
}
