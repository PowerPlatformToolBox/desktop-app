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
        const terminals = { closeToolInstanceTerminals: jest.fn() };
        const filesystem = { revokeAllAccess: jest.fn() };
        const manager = new ToolWindowManager(
            mainWindow,
            protocol,
            { getConnectionById: jest.fn() } as never,
            settings as never,
            { trackToolUsage: jest.fn(() => Promise.resolve()) } as never,
            terminals as never,
            filesystem as never,
        );
        jest.spyOn(manager, "switchToTool").mockResolvedValue(true);
        return { manager, protocol, settings, mainWindow, terminals, filesystem };
    }

    it.each(["external-destroy", "close"])("fully finalizes %s exactly once and resolves pending invocation with null", async (cause) => {
        const { manager, mainWindow, terminals, filesystem } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, localPath: "/local/tool" };
        await manager.launchTool("tool-a-123-abc", tool, null);
        await manager.launchTool("tool-a-124-def", tool, null);
        const first = manager.getToolViews().get("tool-a-123-abc")!;
        const second = manager.getToolViews().get("tool-a-124-def")!;
        const destroyedListener = (first.webContents.on as jest.Mock).mock.calls.find(([event]) => event === "destroyed")![1];
        const destroy = (first.webContents as unknown as { destroy: jest.Mock }).destroy;
        let destructionCleanup: Promise<void> | undefined;
        destroy.mockImplementation(() => {
            (first.webContents.isDestroyed as jest.Mock).mockReturnValue(true);
            destructionCleanup = destroyedListener();
        });
        const changed = jest.fn();
        manager.setOnActiveToolChanged(changed);
        const split = { handleToolClosed: jest.fn() };
        manager.setSplitLayoutManager(split as never);
        (manager as any).activeToolId = "tool-a-123-abc";
        (manager as any).preventCloseTools.add("tool-a-123-abc");
        let resolveInvocation!: (data: unknown) => void;
        const result = new Promise((resolve) => {
            resolveInvocation = resolve;
        });
        (manager as any).pendingInvocations.set("tool-a-123-abc", { callerInstanceId: "tool-a-124-def", resolve: resolveInvocation, resolved: false });
        (manager as any).activeCallees.set("tool-a-124-def", "tool-a-123-abc");
        let finish!: () => void;
        const dispose = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        manager.setOnOwnerDisposing(dispose);
        let closing: Promise<boolean> | undefined;
        if (cause === "close") closing = manager.closeTool("tool-a-123-abc", { force: true });
        else destroy();
        expect(dispose).toHaveBeenCalledTimes(1);
        if (cause === "close") {
            expect(destroy).not.toHaveBeenCalled();
            expect(manager.getToolViews().has("tool-a-123-abc")).toBe(true);
        } else {
            await expect(result).resolves.toBeNull();
            expect(manager.getToolViews().has("tool-a-123-abc")).toBe(false);
        }
        finish();
        if (closing) await expect(closing).resolves.toBe(true);
        await destructionCleanup;
        await expect(result).resolves.toBeNull();
        expect((manager as any).pendingInvocations.size).toBe(0);
        expect((manager as any).activeCallees.size).toBe(0);
        expect(manager.hasPreventCloseTools()).toBe(false);
        expect(changed).toHaveBeenCalledTimes(1);
        expect(mainWindow.removeBrowserView).toHaveBeenCalledWith(first);
        expect(terminals.closeToolInstanceTerminals).toHaveBeenCalledTimes(1);
        expect(filesystem.revokeAllAccess).toHaveBeenCalledTimes(1);
        expect(split.handleToolClosed).toHaveBeenCalledTimes(1);
        expect(second.webContents.send).toHaveBeenCalledWith("toolbox:invocation-result", { calleeInstanceId: "tool-a-123-abc", returnData: null });
        expect(manager.getLoadedToolIdentityByWebContents(second.webContents.id)).not.toBeNull();
        await destroyedListener();
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(changed).toHaveBeenCalledTimes(1);
        expect(terminals.closeToolInstanceTerminals).toHaveBeenCalledTimes(1);
    });

    it("external destruction during close joins disposal and settles invocations even when worker stop fails", async () => {
        const { manager, terminals, filesystem } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, localPath: "/local/tool" };
        await manager.launchTool("tool-a-123-abc", tool, null);
        const view = manager.getToolViews().get("tool-a-123-abc")!;
        const destroyed = (view.webContents.on as jest.Mock).mock.calls.find(([event]) => event === "destroyed")![1];
        let fail!: (error: Error) => void;
        const dispose = jest.fn(
            () =>
                new Promise<void>((_resolve, reject) => {
                    fail = reject;
                }),
        );
        manager.setOnOwnerDisposing(dispose);
        const result = jest.fn();
        (manager as any).pendingInvocations.set("tool-a-123-abc", { callerInstanceId: "caller", resolve: result, resolved: false });
        (manager as any).activeCallees.set("caller", "tool-a-123-abc");
        terminals.closeToolInstanceTerminals.mockImplementation(() => {
            throw new Error("terminal cleanup failed");
        });
        const closing = manager.closeTool("tool-a-123-abc");
        (view.webContents.isDestroyed as jest.Mock).mockReturnValue(true);
        const destroyedCleanup = destroyed();
        expect(result).toHaveBeenCalledWith(null);
        expect(filesystem.revokeAllAccess).toHaveBeenCalledTimes(1);
        expect(dispose).toHaveBeenCalledTimes(1);
        fail(new Error("worker stop failed"));
        await expect(closing).resolves.toBe(false);
        await destroyedCleanup;
        expect(manager.getToolViews().size).toBe(0);
        expect((manager as any).activeCallees.size).toBe(0);
        expect(result).toHaveBeenCalledTimes(1);
        expect(terminals.closeToolInstanceTerminals).toHaveBeenCalledTimes(1);
    });

    it.each(["destroyed", "render-process-gone", "did-start-navigation", "will-redirect"])("disposes the actual owner on %s without stopping another instance", async (eventName) => {
        const { manager } = createManager();
        const tool: Tool = { id: "tool-a", name: "Tool A", version: "1.0.0", description: "", features: { connections: 0 }, localPath: "/local/tool" };
        const dispose = jest.fn(async () => undefined);
        manager.setOnOwnerDisposing(dispose);
        await manager.launchTool("tool-a-123-abc", tool, null);
        await manager.launchTool("tool-a-124-def", tool, null);
        const first = manager.getToolViews().get("tool-a-123-abc")!;
        const second = manager.getToolViews().get("tool-a-124-def")!;
        const listener = (first.webContents.on as jest.Mock).mock.calls.find(([event]) => event === eventName)![1];
        const event = { preventDefault: jest.fn() };
        if (eventName === "did-start-navigation") listener(event, "tool://initial", false, true);
        listener(event, "https://replacement.test", false, true);
        for (let index = 0; index < 8; index++) await new Promise<void>((resolve) => setImmediate(resolve));
        expect(dispose).toHaveBeenCalledWith({ toolId: "tool-a", instanceId: "tool-a-123-abc" });
        expect(dispose).not.toHaveBeenCalledWith({ toolId: "tool-a", instanceId: "tool-a-124-def" });
        expect(manager.getLoadedToolIdentityByWebContents(first.webContents.id)).toBeNull();
        expect(manager.getLoadedToolIdentityByWebContents(second.webContents.id)).not.toBeNull();
        await manager.closeTool("tool-a-124-def");
    });

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
