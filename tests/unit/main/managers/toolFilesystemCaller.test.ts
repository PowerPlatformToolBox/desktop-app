import { BrowserView, BrowserWindow } from "electron";
import type { Tool } from "../../../../src/common/types";
import { BrowserviewProtocolManager } from "../../../../src/main/managers/browserviewProtocolManager";
import { ToolFileSystemAccessManager } from "../../../../src/main/managers/toolFileSystemAccessManager";
import { ToolWindowManager } from "../../../../src/main/managers/toolWindowManager";
import { authorizeFilesystemCaller } from "../../../../src/main/utilities/filesystemAuthorization";

let mockLoadURL: ((view: BrowserView) => Promise<void>) | undefined;

jest.mock("electron", () => {
    const mocks = jest.requireActual("../../../__mocks__/electron");
    let nextId = 200;
    return {
        ...mocks,
        BrowserView: class extends mocks.BrowserView {
            constructor() {
                super();
                Object.assign(this.webContents, {
                    id: nextId++,
                    setZoomLevel: jest.fn(),
                    loadURL: jest.fn(() => mockLoadURL?.(this as unknown as BrowserView) ?? Promise.resolve()),
                });
            }
        },
    };
});

describe("Filesystem caller authorization boundary", () => {
    const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 1 }, localPath: "/local/tool" };
    const instanceId = "tool-a-123-abc";
    const protectedPath = "/private/native-worker-approvals.json";

    function createManager() {
        const mainWindow = new BrowserWindow();
        Object.assign(mainWindow.webContents, { id: 1, getZoomLevel: jest.fn(() => 0) });
        const access = new ToolFileSystemAccessManager();
        const manager = new ToolWindowManager(
            mainWindow,
            new BrowserviewProtocolManager({} as never, {} as never),
            { getConnectionById: jest.fn(() => ({ id: "connection-a", name: "A", url: "https://example.test" })) } as never,
            { addLastUsedTool: jest.fn() } as never,
            { trackToolUsage: jest.fn(() => Promise.resolve()) } as never,
            { closeToolInstanceTerminals: jest.fn() } as never,
            access,
        );
        jest.spyOn(manager, "switchToTool").mockResolvedValue(true);
        return { manager, access, mainWindow };
    }

    afterEach(() => {
        mockLoadURL = undefined;
    });

    it("allows only the exact live main sender without tool path validation", () => {
        const { manager, access, mainWindow } = createManager();
        const validate = jest.spyOn(access, "validateAccess");
        expect(authorizeFilesystemCaller(mainWindow.webContents, mainWindow.webContents, manager, access, protectedPath)).toBeNull();
        expect(validate).not.toHaveBeenCalled();
        const impostor = { id: mainWindow.webContents.id, isDestroyed: () => false };
        expect(() => authorizeFilesystemCaller(impostor, mainWindow.webContents, manager, access, protectedPath)).toThrow("not a recognized tool");
    });

    it.each(["readText", "readBinary", "exists", "stat", "readDirectory", "writeText", "createDirectory", "saveFile", "selectPath"])(
        "rejects an unknown sender for %s before filesystem work or permission selection",
        (operation) => {
            const { manager, access, mainWindow } = createManager();
            const sender = { id: 999, isDestroyed: () => false };
            const filesystemWork = jest.fn();
            const targetPath = operation === "saveFile" || operation === "selectPath" ? undefined : protectedPath;
            expect(() => {
                authorizeFilesystemCaller(sender, mainWindow.webContents, manager, access, targetPath);
                filesystemWork();
            }).toThrow("not a recognized tool");
            expect(filesystemWork).not.toHaveBeenCalled();
            expect(() => authorizeFilesystemCaller(sender, null, null, access, targetPath)).toThrow("not a recognized tool");
        },
    );

    it("recognizes and validates a tool during loadURL before context delivery", async () => {
        const { manager, access, mainWindow } = createManager();
        const validate = jest.spyOn(access, "validateAccess");
        mockLoadURL = async (view) => {
            expect(view.webContents.send).not.toHaveBeenCalled();
            expect(manager.getInstanceIdByWebContents(view.webContents.id)).toBe(instanceId);
            expect(manager.getLoadedToolIdentityByWebContents(view.webContents.id)).toMatchObject({ toolVersion: "1.0.0", sourcePath: "/local/tool" });
            expect(manager.getToolIdentityByWebContents(view.webContents.id)).toEqual({ toolId: tool.id, toolName: tool.name });
            expect(manager.getConnectionIdByWebContents(view.webContents.id)).toBe("connection-a");
            expect(() => authorizeFilesystemCaller(view.webContents, mainWindow.webContents, manager, access, protectedPath)).toThrow("Access denied");
            expect(validate).toHaveBeenCalledWith(instanceId, protectedPath);
            expect(authorizeFilesystemCaller(view.webContents, mainWindow.webContents, manager, access)).toBe(instanceId);
            access.grantAccess(instanceId, "/selected/output.txt");
            expect(authorizeFilesystemCaller(view.webContents, mainWindow.webContents, manager, access, "/selected/output.txt")).toBe(instanceId);
        };
        await expect(manager.launchTool(instanceId, tool, "connection-a")).resolves.toBe(true);
        await manager.closeTool(instanceId);
        expect(access.getAllowedPaths(instanceId)).toEqual([]);
    });

    it("removes early ownership, identity, connections and grants when loadURL rejects", async () => {
        const { manager, access, mainWindow } = createManager();
        let earlyView: BrowserView | undefined;
        mockLoadURL = async (view) => {
            earlyView = view;
            access.grantAccess(instanceId, "/selected/output.txt");
            throw new Error("Navigation failed");
        };
        await expect(manager.launchTool(instanceId, tool, "connection-a")).resolves.toBe(false);
        expect(earlyView).toBeDefined();
        expect(manager.getToolViews().has(instanceId)).toBe(false);
        expect(manager.getLoadedToolIdentityByWebContents(earlyView!.webContents.id)).toBeNull();
        expect(manager.getConnectionIdByWebContents(earlyView!.webContents.id)).toBeNull();
        expect(access.getAllowedPaths(instanceId)).toEqual([]);
        expect((earlyView!.webContents as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
        expect(() => authorizeFilesystemCaller(earlyView!.webContents, mainWindow.webContents, manager, access)).toThrow("not a recognized tool");
        mockLoadURL = undefined;
        await expect(manager.launchTool(instanceId, tool, "connection-a")).resolves.toBe(true);
        const replacement = manager.getToolViews().get(instanceId)!;
        const oldDestroyed = (earlyView!.webContents.on as jest.Mock).mock.calls.find(([event]) => event === "destroyed")![1];
        oldDestroyed();
        expect(authorizeFilesystemCaller(replacement.webContents, mainWindow.webContents, manager, access)).toBe(instanceId);
        await manager.closeTool(instanceId);
    });

    it("does not restore ownership or grants when a view is destroyed during loading", async () => {
        const { manager, access, mainWindow } = createManager();
        mockLoadURL = async (view) => {
            access.grantAccess(instanceId, "/selected/output.txt");
            const destroyed = (view.webContents.on as jest.Mock).mock.calls.find(([event]) => event === "destroyed")![1];
            destroyed();
            expect(manager.getToolViews().has(instanceId)).toBe(false);
            expect(manager.getLoadedToolIdentityByWebContents(view.webContents.id)).toBeNull();
            expect(manager.getConnectionIdByWebContents(view.webContents.id)).toBeNull();
            expect(access.getAllowedPaths(instanceId)).toEqual([]);
            expect(() => authorizeFilesystemCaller(view.webContents, mainWindow.webContents, manager, access)).toThrow("not a recognized tool");
        };
        await expect(manager.launchTool(instanceId, tool, "connection-a")).resolves.toBe(false);
        expect(manager.getToolViews().has(instanceId)).toBe(false);
    });

    it("rejects destroyed senders even if they were trusted main", () => {
        const { manager, access, mainWindow } = createManager();
        jest.spyOn(mainWindow.webContents, "isDestroyed").mockReturnValue(true);
        expect(() => authorizeFilesystemCaller(mainWindow.webContents, mainWindow.webContents, manager, access)).toThrow("destroyed");
    });
});
