/// <reference types="jest" />

import { BrowserView, BrowserWindow, dialog, ipcMain } from "electron";
import { TOOL_WINDOW_CHANNELS } from "../../../../src/common/ipc/channels";
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
    it("rejects an incompatible launch before creating a view", async () => {
        const { manager, connectionsManager } = createManager();
        connectionsManager.getConnectionById.mockReturnValue({ id: "finops", name: "F&O", connectionType: "financeOperations", url: "https://finops.example" } as any);
        await expect(manager.launchTool("legacy-123-abc", { id: "legacy", name: "Legacy" } as any, "finops")).resolves.toBe(false);
        expect((manager as any).toolViews.size).toBe(0);
    });

    it("rejects incompatible reassignment without changing existing slots or notifying the tool", async () => {
        const { manager, connectionsManager } = createManager();
        const view = new BrowserView();
        const original = { connectionIds: ["primary-id", null, "third-id"], impersonatedUsers: [null, null, null] };
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).toolConnectionInfo.set("tool-1", original);
        connectionsManager.getConnectionById.mockReturnValue({ id: "finops", name: "F&O", connectionType: "financeOperations", url: "https://finops.example" } as any);
        await expect(manager.updateToolConnections("tool-1", ["finops"])).rejects.toThrow("not compatible");
        expect((manager as any).toolConnectionInfo.get("tool-1")).toBe(original);
        expect(view.webContents.send).not.toHaveBeenCalled();
    });

    it("allows declared mixed types without compacting slots and rejects F&O impersonation", async () => {
        const { manager, connectionsManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).toolConnectionFeatures.set("tool-1", { connections: 3, connectionTypes: ["dataverse", "financeOperations"] });
        connectionsManager.getConnectionById.mockImplementation((id) => ({ id, name: id, url: `https://${id}.example`, connectionType: id === "finops" ? "financeOperations" : "dataverse" }) as any);
        await manager.updateToolConnections("tool-1", ["primary-id", null, "finops"]);
        expect((manager as any).toolConnectionInfo.get("tool-1").connectionIds).toEqual(["primary-id", null, "finops"]);
        expect(() => manager.setImpersonation("tool-1", { azureactivedirectoryobjectid: "00000000-0000-0000-0000-000000000001" } as any, 2)).toThrow("requires a Dataverse connection");
    });

    it("applies the Power Platform API restriction before reassignment", async () => {
        const { manager } = createManager();
        (manager as any).toolViews.set("tool-1", new BrowserView());
        (manager as any).toolConnectionFeatures.set("tool-1", { enabledForPowerPlatformAPI: true });
        await expect(manager.updateToolConnections("tool-1", ["primary-id"])).rejects.toThrow("not compatible");
    });

    it("rejects an inherited incompatible connection before prompting or launching the callee", async () => {
        const { manager, mainWindow, connectionsManager } = createManager();
        (manager as any).toolConnectionInfo.set("caller", { connectionIds: ["finops"], impersonatedUsers: [null] });
        connectionsManager.getConnectionById.mockReturnValue({ id: "finops", name: "F&O", connectionType: "financeOperations", url: "https://finops.example" } as any);
        const launch = jest.spyOn(manager, "launchTool");
        await expect(manager.launchToolWithContext("caller", "callee", { id: "legacy", name: "Legacy", features: { connections: 2 } } as any, null, null, {})).rejects.toThrow("not compatible");
        expect(launch).not.toHaveBeenCalled();
        expect(mainWindow.webContents.send).not.toHaveBeenCalledWith("tool-window:invocation-prompt-connections", expect.anything());
    });
    it("releases connection blockers as soon as a tool closes", async () => {
        const { manager, terminalManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("closing-tool", view);
        (manager as any).toolInstanceNames.set("closing-tool", "Closing Tool");
        (manager as any).toolConnectionInfo.set("closing-tool", {
            connectionIds: ["primary-id", null, "third-id"],
            impersonatedUsers: [null, null, null],
        });
        terminalManager.closeToolInstanceTerminals.mockImplementation(() => {
            expect(manager.getConnectionDeletionBlocker("third-id")).toBeNull();
        });

        expect(manager.getConnectionDeletionBlocker("third-id")).toContain("Closing Tool");
        await expect(manager.closeTool("closing-tool")).resolves.toBe(true);
        expect(manager.getConnectionDeletionBlocker("third-id")).toBeNull();
    });

    it("blocks deletion only while an open tool instance currently uses the connection", () => {
        const { manager } = createManager();
        (manager as any).toolInstanceNames.set("open-tool", "Open Tool");
        (manager as any).toolConnectionInfo.set("open-tool", {
            connectionIds: ["primary-id", null, "third-id"],
            impersonatedUsers: [null, null, null],
        });

        expect(manager.getConnectionDeletionBlocker("third-id")).toContain("Open Tool");
        expect(manager.getConnectionDeletionBlocker("unused-id")).toBeNull();

        (manager as any).toolConnectionInfo.delete("open-tool");
        expect(manager.getConnectionDeletionBlocker("third-id")).toBeNull();
    });

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
        (manager as any).toolConnectionFeatures.set("tool-1", { connections: 3 });
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

    it("bounds count/range reassignment just as launch does without resolving discarded IDs", async () => {
        const { manager, connectionsManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("bounded", view);
        (manager as any).toolConnectionFeatures.set("bounded", { connections: { min: 0, max: 2 } });
        await manager.updateToolConnections("bounded", ["primary-id", null, "discarded-id"]);
        expect((manager as any).toolConnectionInfo.get("bounded").connectionIds).toEqual(["primary-id", null]);
        expect(connectionsManager.getConnectionById).not.toHaveBeenCalledWith("discarded-id");
        expect(view.webContents.send).toHaveBeenCalledWith("toolbox:context", expect.objectContaining({ connectionIds: ["primary-id", null] }));
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
        const responseHandler = (ipcMain.handle as jest.Mock).mock.calls.filter(([channel]) => channel === TOOL_WINDOW_CHANNELS.PROVIDE_INVOCATION_CONNECTIONS).at(-1)?.[1];
        expect(responseHandler).toBeDefined();
        await responseHandler({}, requestId, null);
        await expect(launch).rejects.toThrow("Connection selection cancelled: Connection selection cancelled");
        expect((manager as any).pendingConnectionPrompts.has(requestId)).toBe(false);
    });

    it("passes prompted slot arrays to the callee launch and opened event", async () => {
        const { manager, mainWindow } = createManager();
        (manager as any).toolConnectionInfo.set("caller", {
            connectionIds: ["source-id", null, "third-id", null],
            impersonatedUsers: [null, null, null, null],
        });
        const launchTool = jest.spyOn(manager, "launchTool").mockResolvedValue(true);
        const tool = { id: "callee-tool", name: "Callee Tool", version: "1.0.0", features: { connections: { min: 5, max: 5 } } };
        const launch = manager.launchToolWithContext("caller", "callee", tool as any, null, null, {});
        const promptCall = (mainWindow.webContents.send as jest.Mock).mock.calls.find(([channel]) => channel === "tool-window:invocation-prompt-connections");
        const selectedConnectionIds = ["source-id", "target-id", "third-id", "fourth-id", "fifth-id"];

        (manager as any).pendingConnectionPrompts.get(promptCall[1].requestId).resolve(selectedConnectionIds);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(launchTool).toHaveBeenCalledWith("callee", tool, "source-id", "target-id", {}, selectedConnectionIds);
        expect(mainWindow.webContents.send).toHaveBeenCalledWith("tool-window:callee-tool-opened", expect.objectContaining({ calleeInstanceId: "callee", connectionIds: selectedConnectionIds }));

        manager.resolveInvocation("callee", { completed: true });
        await expect(launch).resolves.toEqual({ completed: true });
    });

    it("prompts for optional inter-tool slots when no connections are inherited", async () => {
        const { manager, mainWindow } = createManager();
        (manager as any).toolConnectionInfo.set("caller", { connectionIds: [null, null, null], impersonatedUsers: [null, null, null] });
        jest.spyOn(manager, "launchTool").mockResolvedValue(true);
        const tool = { id: "optional-callee", name: "Optional Callee", version: "1.0.0", features: { connections: { min: 0, max: 3 } } };

        const launch = manager.launchToolWithContext("caller", "optional-callee-instance", tool as any, null, null, {});
        const promptCall = (mainWindow.webContents.send as jest.Mock).mock.calls.find(([channel]) => channel === "tool-window:invocation-prompt-connections");
        expect(promptCall?.[1]).toMatchObject({ minConnections: 0, maxConnections: 3 });
        (manager as any).pendingConnectionPrompts.get(promptCall[1].requestId).resolve([null, null, null]);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(manager.launchTool).toHaveBeenCalledWith("optional-callee-instance", tool, null, null, {}, [null, null, null]);
        manager.resolveInvocation("optional-callee-instance", null);
        await expect(launch).resolves.toBeNull();
    });
});

describe("ToolWindowManager explicit slot enforcement", () => {
    const features = {
        connections: {
            slots: [
                { label: "Optional accounts", required: false },
                { label: "F&O customers", connectionTypes: ["financeOperations" as const] },
            ],
        },
    };
    function explicitManager() {
        const result = createManager();
        (result.mainWindow.webContents as any).getZoomLevel = jest.fn(() => 0);
        result.connectionsManager.getConnectionById.mockImplementation((id) =>
            id === "missing" ? undefined : ({ id, name: id, url: `https://${id}.example`, connectionType: id === "fo" ? "financeOperations" : "dataverse" } as any),
        );
        (result.manager as any).settingsManager.addLastUsedTool = jest.fn();
        (result.manager as any).toolManager.trackToolUsage = jest.fn().mockResolvedValue(undefined);
        (result.manager as any).browserviewProtocolManager = { getToolBaseDirectory: jest.fn(() => null), buildToolUrl: jest.fn(() => "about:blank") };
        jest.spyOn(result.manager, "switchToTool").mockResolvedValue(true);
        return result;
    }

    it("launches with an optional first slot and required later slot, preserving context and saved indexes", async () => {
        const { manager } = explicitManager();
        await expect(manager.launchTool("typed-123-abc", { id: "typed", name: "Typed", features } as any, null, "fo", undefined, [null, "fo"])).resolves.toBe(true);
        const view = (manager as any).toolViews.get("typed-123-abc");
        expect(view.webContents.send).toHaveBeenCalledWith("toolbox:context", expect.objectContaining({ connectionIds: [null, "fo"], connectionUrls: [null, "https://fo.example"] }));
        expect((manager as any).settingsManager.addLastUsedTool).toHaveBeenCalledWith(expect.objectContaining({ connections: [null, expect.objectContaining({ id: "fo" })] }));
    });
    it("rejects an extra secondary alias rather than discarding it for a single explicit slot", async () => {
        const { manager } = explicitManager();
        const tool = { id: "typed", name: "Typed", features: { connections: { slots: [{}] } } } as any;
        await expect(manager.launchTool("typed-123-abc", tool, "dv", "fo")).resolves.toBe(false);
        await expect(manager.launchToolWithContext("caller", "callee", tool, "dv", "fo", {})).rejects.toThrow("at most 1");
        expect((manager as any).toolViews.size).toBe(0);
    });

    it.each([
        ["dv", null],
        [null, "dv"],
        [null, "missing"],
        [null, "fo", "dv"],
    ])("rejects invalid explicit launch %p before view creation or saved-state changes", async (...ids) => {
        const { manager } = explicitManager();
        await expect(manager.launchTool("typed-123-abc", { id: "typed", name: "Typed", features } as any, null, null, undefined, ids as any)).resolves.toBe(false);
        expect((manager as any).toolViews.size).toBe(0);
        expect((manager as any).browserviewProtocolManager.getToolBaseDirectory).not.toHaveBeenCalled();
        expect((manager as any).settingsManager.addLastUsedTool).not.toHaveBeenCalled();
    });

    it.each([
        ["dv", null],
        [null, "dv"],
        [null, "missing"],
        [null, "fo", "dv"],
    ])("rejects reassignment %p atomically", async (...ids) => {
        const { manager } = explicitManager();
        const view = new BrowserView();
        const user = { fullname: "Existing user" };
        const previous = { connectionIds: ["dv", "fo"], impersonatedUsers: [user, null] };
        (manager as any).toolViews.set("typed", view);
        (manager as any).toolConnectionFeatures.set("typed", features);
        (manager as any).toolConnectionInfo.set("typed", previous);
        await expect(manager.updateToolConnections("typed", ids as any)).rejects.toThrow();
        expect((manager as any).toolConnectionInfo.get("typed")).toBe(previous);
        expect(view.webContents.send).not.toHaveBeenCalled();
    });

    it("allows clearing an optional slot without shifting a required F&O assignment", async () => {
        const { manager } = explicitManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("typed", view);
        (manager as any).toolConnectionFeatures.set("typed", features);
        (manager as any).toolConnectionInfo.set("typed", { connectionIds: ["dv", "fo"], impersonatedUsers: [{ fullname: "User" }, null] });
        await manager.updateToolConnection("typed", null);
        expect((manager as any).toolConnectionInfo.get("typed")).toEqual({ connectionIds: [null, "fo"], impersonatedUsers: [null, null] });
        expect(view.webContents.send).toHaveBeenCalledWith("toolbox:context", expect.objectContaining({ connectionIds: [null, "fo"] }));
        expect(() => manager.setImpersonation("typed", { fullname: "User" } as any, 1)).toThrow("requires a Dataverse connection");
    });

    it("prompts for the actual required index and rejects an invalid prompt result before recording invocation state", async () => {
        const { manager, mainWindow } = explicitManager();
        (manager as any).toolConnectionInfo.set("caller", { connectionIds: ["dv", null], impersonatedUsers: [null, null] });
        const launch = jest.spyOn(manager, "launchTool");
        const result = manager.launchToolWithContext("caller", "callee", { id: "typed", name: "Typed", features } as any, null, null, {});
        const prompt = (mainWindow.webContents.send as jest.Mock).mock.calls.find(([channel]) => channel === TOOL_WINDOW_CHANNELS.INVOCATION_PROMPT_CONNECTIONS)?.[1];
        expect(prompt).toMatchObject({ minConnections: 1, maxConnections: 2, inheritedConnectionIds: ["dv", null], features });
        (manager as any).pendingConnectionPrompts.get(prompt.requestId).resolve(["dv", "dv"]);
        await expect(result).rejects.toThrow("not compatible with slot 2");
        expect(launch).not.toHaveBeenCalled();
        expect((manager as any).pendingInvocations.size).toBe(0);
        expect((manager as any).activeCallees.size).toBe(0);
    });

    it("passes valid inherited holes through invocation without prompting", async () => {
        const { manager, mainWindow } = explicitManager();
        (manager as any).toolConnectionInfo.set("caller", { connectionIds: [null, "fo", "obsolete"], impersonatedUsers: [null, null, null] });
        const launchTool = jest.spyOn(manager, "launchTool").mockResolvedValue(true);
        const tool = { id: "typed", name: "Typed", features } as any;
        const result = manager.launchToolWithContext("caller", "callee", tool, null, null, {});
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(launchTool).toHaveBeenCalledWith("callee", tool, null, "fo", {}, [null, "fo"]);
        expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(TOOL_WINDOW_CHANNELS.INVOCATION_PROMPT_CONNECTIONS, expect.anything());
        manager.resolveInvocation("callee", { ok: true });
        await expect(result).resolves.toEqual({ ok: true });
    });
});

describe("ToolWindowManager prevent-close behavior", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("canceled close preserves workers and does not call the disposal hook", async () => {
        const { manager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).loadedToolIdentities.set("tool-1", { toolId: "actual-tool", toolName: "Tool", toolVersion: "1.0.0", sourcePath: "/tool" });
        (manager as any).preventCloseTools.add("tool-1");
        const dispose = jest.fn(async () => undefined);
        manager.setOnOwnerDisposing(dispose);
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(0);
        await expect(manager.closeTool("tool-1")).resolves.toBe(false);
        expect(dispose).not.toHaveBeenCalled();
    });

    it("confirmed close waits for actual owner shutdown before destroying or clearing state", async () => {
        const { manager, terminalManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).loadedToolIdentities.set("tool-1", { toolId: "actual-tool", toolName: "Tool", toolVersion: "1.0.0", sourcePath: "/tool" });
        let finish!: () => void;
        const dispose = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        manager.setOnOwnerDisposing(dispose);
        const closing = manager.closeTool("tool-1");
        expect(dispose).toHaveBeenCalledWith({ toolId: "actual-tool", instanceId: "tool-1" });
        expect((manager as any).toolViews.has("tool-1")).toBe(true);
        expect(terminalManager.closeToolInstanceTerminals).not.toHaveBeenCalled();
        finish();
        await expect(closing).resolves.toBe(true);
    });

    it("failed owner stop leaves the view and unrelated cleanup untouched", async () => {
        const { manager, terminalManager } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).loadedToolIdentities.set("tool-1", { toolId: "actual-tool", toolName: "Tool", toolVersion: "1.0.0", sourcePath: "/tool" });
        manager.setOnOwnerDisposing(async () => {
            throw new Error("process still alive");
        });
        await expect(manager.closeTool("tool-1")).resolves.toBe(false);
        expect((manager as any).toolViews.has("tool-1")).toBe(true);
        expect(terminalManager.closeToolInstanceTerminals).not.toHaveBeenCalled();
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

    it("allows app close confirmation without clearing prevent-close before shutdown commits", () => {
        const { manager, mainWindow } = createManager();
        (manager as any).preventCloseTools.add("tool-1");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValue(1);

        const result = manager.confirmAppCloseIfPrevented(mainWindow as unknown as import("electron").BrowserWindow);

        expect(result).toBe(true);
        expect(manager.hasPreventCloseTools()).toBe(true);
    });

    it("prompts afresh after confirmed app close fails to stop workers", async () => {
        const { manager, mainWindow } = createManager();
        const view = new BrowserView();
        (manager as any).toolViews.set("tool-1", view);
        (manager as any).loadedToolIdentities.set("tool-1", { toolId: "actual-tool", toolName: "Tool", toolVersion: "1.0.0", sourcePath: "/tool" });
        (manager as any).preventCloseTools.add("tool-1");
        (dialog.showMessageBoxSync as jest.Mock).mockReturnValueOnce(1).mockReturnValueOnce(0);
        expect(manager.confirmAppCloseIfPrevented(mainWindow)).toBe(true);
        manager.setOnOwnerDisposing(async () => {
            throw new Error("still alive");
        });
        await expect(manager.closeTool("tool-1", { force: true })).resolves.toBe(false);
        expect(manager.confirmAppCloseIfPrevented(mainWindow)).toBe(false);
        expect(dialog.showMessageBoxSync).toHaveBeenCalledTimes(2);
        expect(manager.hasPreventCloseTools()).toBe(true);
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
