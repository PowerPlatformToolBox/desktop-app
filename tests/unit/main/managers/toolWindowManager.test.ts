/// <reference types="jest" />

import { BrowserView, BrowserWindow, dialog } from "electron";
import { ToolWindowManager } from "../../../../src/main/managers/toolWindowManager";

function createManager() {
    const mainWindow = new BrowserWindow();
    const terminalManager = { closeToolInstanceTerminals: jest.fn() };
    const toolFilesystemAccessManager = { revokeAllAccess: jest.fn() };
    const toolManager = { getAllTools: jest.fn(() => []) };

    const manager = new ToolWindowManager(
        mainWindow as unknown as import("electron").BrowserWindow,
        {} as any,
        {} as any,
        {} as any,
        toolManager as any,
        terminalManager as any,
        toolFilesystemAccessManager as any,
    );

    return { manager, mainWindow, terminalManager, toolFilesystemAccessManager };
}

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
