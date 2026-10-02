/// <reference types="jest" />

import { BrowserView, BrowserWindow, dialog } from "electron";
import { ToolWindowManager } from "../../../../src/main/managers/toolWindowManager";

function createManager() {
    const mainWindow = new BrowserWindow();
    const connectionsManager = { getConnectionById: jest.fn((id: string) => ({ id, url: `https://${id}.example` })) };
    const terminalManager = { closeToolInstanceTerminals: jest.fn() };
    const toolFilesystemAccessManager = { revokeAllAccess: jest.fn() };
    const toolManager = { getAllTools: jest.fn(() => []) };

    const manager = new ToolWindowManager(
        mainWindow as unknown as import("electron").BrowserWindow,
        {} as any,
        connectionsManager as any,
        {} as any,
        toolManager as any,
        terminalManager as any,
        toolFilesystemAccessManager as any,
    );

    return { manager, mainWindow, connectionsManager, terminalManager, toolFilesystemAccessManager };
}

describe("ToolWindowManager connection slot routing", () => {
    it("routes legacy aliases and arbitrary numeric targets to stable array indexes", () => {
        const { manager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).toolConnectionInfo.set("tool-1", { connectionIds: ["primary-id", "secondary-id", null, "fourth-id"], impersonatedUsers: [null, null, null, null] });

        expect(manager.getConnectionIdByWebContents(view.webContents.id, "primary")).toBe("primary-id");
        expect(manager.getConnectionIdByWebContents(view.webContents.id, "secondary")).toBe("secondary-id");
        expect(manager.getConnectionIdByWebContents(view.webContents.id, 3)).toBe("fourth-id");
        expect(manager.getConnectionIdByWebContents(view.webContents.id, 2)).toBeNull();
        expect(() => manager.getConnectionIdByWebContents(view.webContents.id, -1)).toThrow(RangeError);
        const impersonatedUser = { systemuserid: "00000000-0000-0000-0000-000000000004", fullname: "Fourth Slot User", azureactivedirectoryobjectid: "00000000-0000-0000-0000-000000000004" };
        manager.setImpersonation("tool-1", impersonatedUser, 3);
        expect(manager.getImpersonatedUserByWebContents(view.webContents.id, 3)).toBe(impersonatedUser);
    });

    it("preserves impersonation for unchanged slots and clears only changed slots", async () => {
        const { manager, connectionsManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        const impersonatedUser = { fullname: "Test User", azureactivedirectoryobjectid: "00000000-0000-0000-0000-000000000001" };
        (manager as any).toolConnectionInfo.set("tool-1", {
            connectionIds: ["primary-id", "secondary-id", "third-id"],
            impersonatedUsers: [null, impersonatedUser, impersonatedUser],
        });

        await manager.updateToolConnections("tool-1", ["primary-id", "replacement-id", "third-id"]);

        expect(manager.getImpersonation("tool-1", 1).user).toBeNull();
        expect(manager.getImpersonation("tool-1", 2).user).toBe(impersonatedUser);
        expect(connectionsManager.getConnectionById).toHaveBeenCalledWith("replacement-id");
        expect(view.webContents.send).toHaveBeenCalledWith(
            "toolbox:context",
            expect.objectContaining({
                connectionIds: ["primary-id", "replacement-id", "third-id"],
                connectionUrls: ["https://primary-id.example", "https://replacement-id.example", "https://third-id.example"],
            }),
        );
    });

    it("includes inherited later slots in the inter-tool connection prompt", async () => {
        const { manager, mainWindow } = createManager();
        (manager as any).toolConnectionInfo.set("caller", {
            connectionIds: ["primary-id", "secondary-id", "third-id", "fourth-id"],
            impersonatedUsers: [null, null, null, null],
        });
        const tool = { id: "callee-tool", name: "Callee Tool", version: "1.0.0", features: { connections: { min: 5, max: 5 } } };

        const launch = manager.launchToolWithContext("caller", "callee", tool as any, null, null, {});
        const promptCall = (mainWindow.webContents.send as jest.Mock).mock.calls.find(([channel]) => channel === "tool-window:invocation-prompt-connections");
        expect(promptCall?.[1]).toMatchObject({
            toolName: "Callee Tool",
            minConnections: 5,
            maxConnections: 5,
            inheritedConnectionIds: ["primary-id", "secondary-id", "third-id", "fourth-id", null],
        });

        const requestId = promptCall?.[1].requestId;
        (manager as any).pendingConnectionPrompts.get(requestId).reject(new Error("test cancellation"));
        await expect(launch).rejects.toThrow("Connection selection cancelled: test cancellation");
    });
});

describe("ToolWindowManager prevent-close behavior", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("cancels app close confirmation when user selects Cancel", () => {
        const { manager, mainWindow } = createManager();
        (manager as any).preventCloseTools.add("tool-1");
        (manager as any).toolInstanceNames.set("tool-1", "My Tool");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(0);

        const result = manager.confirmAppCloseIfPrevented(mainWindow as unknown as import("electron").BrowserWindow);

        expect(result).toBe(false);
        expect(manager.hasPreventCloseTools()).toBe(true);
    });

    it("allows app close confirmation and clears prevent-close when user selects Ignore & Close", () => {
        const { manager, mainWindow } = createManager();
        (manager as any).preventCloseTools.add("tool-1");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(1);

        const result = manager.confirmAppCloseIfPrevented(mainWindow as unknown as import("electron").BrowserWindow);

        expect(result).toBe(true);
        expect(manager.hasPreventCloseTools()).toBe(false);
    });

    it("keeps the tool open when close is prevented and user selects Cancel", async () => {
        const { manager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).toolInstanceNames.set("tool-1", "My Tool");
        (manager as any).preventCloseTools.add("tool-1");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(0);

        const result = await manager.closeTool("tool-1");

        expect(result).toBe(false);
        expect((manager as any).toolViews.has("tool-1")).toBe(true);
    });

    it("closes the tool when close is prevented and user selects Ignore & Close", async () => {
        const { manager, terminalManager, toolFilesystemAccessManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).toolInstanceNames.set("tool-1", "My Tool");
        (manager as any).preventCloseTools.add("tool-1");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(1);

        const result = await manager.closeTool("tool-1");

        expect(result).toBe(true);
        expect((manager as any).toolViews.has("tool-1")).toBe(false);
        expect((manager as any).preventCloseTools.has("tool-1")).toBe(false);
        expect(terminalManager.closeToolInstanceTerminals).toHaveBeenCalledWith("tool-1");
        expect(toolFilesystemAccessManager.revokeAllAccess).toHaveBeenCalledWith("tool-1");
    });
});
