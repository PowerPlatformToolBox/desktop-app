import { BrowserWindow } from "electron";
import * as path from "path";
import type { Tool } from "../../../../src/common/types";
import { BrowserviewProtocolManager } from "../../../../src/main/managers/browserviewProtocolManager";
import { ToolWindowManager } from "../../../../src/main/managers/toolWindowManager";

jest.mock("electron", () => {
    const mocks = jest.requireActual("../../../__mocks__/electron");
    let nextId = 100;
    return {
        ...mocks,
        BrowserView: class extends mocks.BrowserView {
            constructor() {
                super();
                Object.assign(this.webContents, { id: nextId++, setZoomLevel: jest.fn() });
            }
        },
    };
});

describe("ToolWindowManager loaded identity", () => {
    function createManager() {
        const mainWindow = new BrowserWindow();
        Object.assign(mainWindow.webContents, { getZoomLevel: jest.fn(() => 0) });
        const protocol = new BrowserviewProtocolManager({} as never, {} as never);
        const settings = { addLastUsedTool: jest.fn() };
        const manager = new ToolWindowManager(
            mainWindow,
            protocol,
            { getConnectionById: jest.fn() } as never,
            settings as never,
            { trackToolUsage: jest.fn(() => Promise.resolve()) } as never,
            { closeToolInstanceTerminals: jest.fn() } as never,
            { revokeAllAccess: jest.fn() } as never,
        );
        jest.spyOn(manager, "switchToTool").mockResolvedValue(true);
        return { manager, protocol, settings };
    }

    it.each([
        ["local", { localPath: "/local/tool" }],
        ["registry", {}],
        ["npm", { npmPackageName: "trusted-ui" }],
    ])("captures %s source and version from the actual launch object without refreshing an existing instance", async (_source, fields) => {
        const { manager, protocol } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, ...fields };
        const sourcePath = protocol.getToolBaseDirectory(tool)!;
        await expect(manager.launchTool("tool-a-123-abc", tool, null)).resolves.toBe(true);
        const view = manager.getToolViews().get("tool-a-123-abc")!;
        const identity = manager.getLoadedToolIdentityByWebContents(view.webContents.id);
        expect(identity).toEqual({ toolId: "tool-a", toolName: "Tool A", toolVersion: "1.0.0", sourcePath: path.resolve(sourcePath) });
        expect(Object.isFrozen(identity)).toBe(true);
        tool.version = "2.0.0";
        tool.localPath = "/replacement";
        await manager.launchTool("tool-a-123-abc", tool, null);
        expect(manager.getLoadedToolIdentityByWebContents(view.webContents.id)).toBe(identity);
        expect(manager.getToolIdentityByWebContents(view.webContents.id)).toEqual({ toolId: "tool-a", toolName: "Tool A" });
        await expect(manager.closeTool("tool-a-123-abc")).resolves.toBe(true);
        expect(manager.getLoadedToolIdentityByWebContents(view.webContents.id)).toBeNull();
        await expect(manager.launchTool("tool-a-125-new", tool, null)).resolves.toBe(true);
        const recreated = manager.getToolViews().get("tool-a-125-new")!;
        expect(manager.getLoadedToolIdentityByWebContents(recreated.webContents.id)).toMatchObject({ toolVersion: "2.0.0", sourcePath: path.resolve("/replacement") });
        await manager.closeTool("tool-a-125-new");
    });

    it("fully closes the registered instance when launch fails after loading", async () => {
        const { manager, settings } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, localPath: "/local/tool" };
        settings.addLastUsedTool.mockImplementation(() => {
            throw new Error("Launch failed");
        });
        await expect(manager.launchTool("tool-a-123-abc", tool, null)).resolves.toBe(false);
        expect(manager.getToolViews().has("tool-a-123-abc")).toBe(false);
        expect(manager.getPrimaryConnectionIdByInstance("tool-a-123-abc")).toBeNull();
    });

    it("cleans up destroyed senders and all-view teardown while preserving another instance", async () => {
        const { manager } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, localPath: "/local/tool" };
        await manager.launchTool("tool-a-123-abc", tool, null);
        await manager.launchTool("tool-a-124-def", tool, null);
        const first = manager.getToolViews().get("tool-a-123-abc")!;
        const second = manager.getToolViews().get("tool-a-124-def")!;
        const destroyed = (first.webContents.on as jest.Mock).mock.calls.find(([event]) => event === "destroyed")?.[1];
        expect(destroyed).toBeDefined();
        destroyed();
        expect(manager.getLoadedToolIdentityByWebContents(first.webContents.id)).toBeNull();
        expect(manager.getLoadedToolIdentityByWebContents(second.webContents.id)).not.toBeNull();
        (manager as unknown as { closeAllToolViews(): void }).closeAllToolViews();
        expect(manager.getLoadedToolIdentityByWebContents(second.webContents.id)).toBeNull();
        expect(manager.getLoadedToolIdentityByWebContents(-1)).toBeNull();
    });
});
