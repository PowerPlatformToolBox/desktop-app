/// <reference types="jest" />

import { BrowserView, BrowserWindow } from "electron";
import { SPLIT_LAYOUT_CHANNELS } from "../../../../src/common/ipc/channels";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";
import { SPLIT_DIVIDER_WIDTH, SplitLayoutManager } from "../../../../src/main/managers/splitLayoutManager";

// electron and electron-store are replaced by manual mocks in tests/__mocks__/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock BrowserView registered in the shared toolViews map. */
function makeBrowserView(): InstanceType<typeof BrowserView> {
    return new BrowserView();
}

/**
 * Create a BrowserWindow mock instance.
 * The module-level mock class is re-instantiated so jest.fn() counters are fresh.
 */
function makeMainWindow(): InstanceType<typeof BrowserWindow> {
    return new BrowserWindow();
}

interface TestContext {
    mainWindow: InstanceType<typeof BrowserWindow>;
    settingsManager: SettingsManager;
    toolViews: Map<string, InstanceType<typeof BrowserView>>;
    manager: SplitLayoutManager;
}

function buildContext(): TestContext {
    const mainWindow = makeMainWindow();
    const settingsManager = new SettingsManager();
    const toolViews = new Map<string, InstanceType<typeof BrowserView>>();
    const manager = new SplitLayoutManager(mainWindow as unknown as import("electron").BrowserWindow, settingsManager, toolViews as unknown as Map<string, import("electron").BrowserView>);
    return { mainWindow, settingsManager, toolViews, manager };
}

/** Register a BrowserView in the toolViews map under the given id and return it. */
function registerView(toolViews: Map<string, InstanceType<typeof BrowserView>>, id: string): InstanceType<typeof BrowserView> {
    const view = makeBrowserView();
    toolViews.set(id, view);
    return view;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SplitLayoutManager", () => {
    let ctx: TestContext;

    beforeEach(() => {
        ctx = buildContext();
    });

    // -----------------------------------------------------------------------
    // Initial state
    // -----------------------------------------------------------------------
    describe("initial state", () => {
        it("is not active after construction", () => {
            expect(ctx.manager.isActive).toBe(false);
        });

        it("getState() returns an inactive snapshot with empty groups", () => {
            const state = ctx.manager.getState();
            expect(state.isActive).toBe(false);
            expect(state.leftGroup).toEqual([]);
            expect(state.rightGroup).toEqual([]);
            expect(state.activeLeftInstanceId).toBeNull();
            expect(state.activeRightInstanceId).toBeNull();
            expect(state.focusedPane).toBe("left");
        });

        it("restores a valid persisted ratio from settings", () => {
            ctx.settingsManager.setSetting("splitDividerRatio", 0.65);
            // Rebuild manager so constructor picks up the persisted value
            const mgr = new SplitLayoutManager(
                ctx.mainWindow as unknown as import("electron").BrowserWindow,
                ctx.settingsManager,
                ctx.toolViews as unknown as Map<string, import("electron").BrowserView>,
            );
            expect(mgr.getState().ratio).toBe(0.65);
        });

        it("falls back to 0.5 for out-of-range persisted ratio", () => {
            ctx.settingsManager.setSetting("splitDividerRatio", 0.05); // below MIN (0.15)
            const mgr = new SplitLayoutManager(
                ctx.mainWindow as unknown as import("electron").BrowserWindow,
                ctx.settingsManager,
                ctx.toolViews as unknown as Map<string, import("electron").BrowserView>,
            );
            expect(mgr.getState().ratio).toBe(0.5);
        });
    });

    // -----------------------------------------------------------------------
    // activate()
    // -----------------------------------------------------------------------
    describe("activate()", () => {
        it("activates split mode with two distinct instance ids", () => {
            registerView(ctx.toolViews, "tool-a");
            registerView(ctx.toolViews, "tool-b");
            const result = ctx.manager.activate("tool-a", "tool-b");
            expect(result).toBe(true);
            expect(ctx.manager.isActive).toBe(true);
        });

        it("sets left and right groups to single-item arrays", () => {
            ctx.manager.activate("tool-a", "tool-b");
            const state = ctx.manager.getState();
            expect(state.leftGroup).toEqual(["tool-a"]);
            expect(state.rightGroup).toEqual(["tool-b"]);
        });

        it("sets both active ids on activation", () => {
            ctx.manager.activate("tool-a", "tool-b");
            const state = ctx.manager.getState();
            expect(state.activeLeftInstanceId).toBe("tool-a");
            expect(state.activeRightInstanceId).toBe("tool-b");
        });

        it("sets focusedPane to 'left' on activation", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.getState().focusedPane).toBe("left");
        });

        it("returns false when both instance ids are the same", () => {
            const result = ctx.manager.activate("tool-a", "tool-a");
            expect(result).toBe(false);
            expect(ctx.manager.isActive).toBe(false);
        });

        it("notifies the renderer after activation", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.objectContaining({ isActive: true }));
        });
    });

    // -----------------------------------------------------------------------
    // deactivate()
    // -----------------------------------------------------------------------
    describe("deactivate()", () => {
        beforeEach(() => {
            ctx.manager.activate("tool-a", "tool-b");
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
        });

        it("deactivates split mode", () => {
            ctx.manager.deactivate();
            expect(ctx.manager.isActive).toBe(false);
        });

        it("clears all groups and active ids", () => {
            ctx.manager.deactivate();
            const state = ctx.manager.getState();
            expect(state.leftGroup).toEqual([]);
            expect(state.rightGroup).toEqual([]);
            expect(state.activeLeftInstanceId).toBeNull();
            expect(state.activeRightInstanceId).toBeNull();
        });

        it("resets focusedPane to 'left'", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.deactivate();
            expect(ctx.manager.getState().focusedPane).toBe("left");
        });

        it("returns false when not active", () => {
            ctx.manager.deactivate(); // first deactivate
            const result = ctx.manager.deactivate(); // second call
            expect(result).toBe(false);
        });

        it("notifies the renderer after deactivation", () => {
            ctx.manager.deactivate();
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.objectContaining({ isActive: false }));
        });
    });

    // -----------------------------------------------------------------------
    // getPaneForInstance()
    // -----------------------------------------------------------------------
    describe("getPaneForInstance()", () => {
        it("returns null when split is not active", () => {
            expect(ctx.manager.getPaneForInstance("tool-a")).toBeNull();
        });

        it("returns 'left' for a member of the left group", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.getPaneForInstance("tool-a")).toBe("left");
        });

        it("returns 'right' for a member of the right group", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.getPaneForInstance("tool-b")).toBe("right");
        });

        it("returns null for an id not in any group", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.getPaneForInstance("tool-c")).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // isInstanceInSplit()
    // -----------------------------------------------------------------------
    describe("isInstanceInSplit()", () => {
        it("returns false when not active", () => {
            expect(ctx.manager.isInstanceInSplit("tool-a")).toBe(false);
        });

        it("returns true for left-pane members", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.isInstanceInSplit("tool-a")).toBe(true);
        });

        it("returns true for right-pane members", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.isInstanceInSplit("tool-b")).toBe(true);
        });

        it("returns false for tools not in split", () => {
            ctx.manager.activate("tool-a", "tool-b");
            expect(ctx.manager.isInstanceInSplit("tool-c")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // addToolToFocusedPane()
    // -----------------------------------------------------------------------
    describe("addToolToFocusedPane()", () => {
        beforeEach(() => {
            ctx.manager.activate("tool-a", "tool-b");
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
        });

        it("adds a new tool to the left pane when focusedPane is 'left'", () => {
            ctx.manager.setFocusedPane("left");
            ctx.manager.addToolToFocusedPane("tool-c");
            expect(ctx.manager.getState().leftGroup).toContain("tool-c");
        });

        it("adds a new tool to the right pane when focusedPane is 'right'", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-c");
            expect(ctx.manager.getState().rightGroup).toContain("tool-c");
        });

        it("makes the newly added tool the active one in its pane", () => {
            ctx.manager.setFocusedPane("left");
            ctx.manager.addToolToFocusedPane("tool-c");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-c");
        });

        it("makes the newly added right-pane tool active", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-c");
            expect(ctx.manager.getState().activeRightInstanceId).toBe("tool-c");
        });

        it("does not duplicate an instance already in the pane", () => {
            ctx.manager.setFocusedPane("left");
            ctx.manager.addToolToFocusedPane("tool-a"); // tool-a is already in left group
            const leftGroup = ctx.manager.getState().leftGroup;
            expect(leftGroup.filter((id) => id === "tool-a")).toHaveLength(1);
        });

        it("does nothing when split is not active", () => {
            const inactiveCtx = buildContext();
            inactiveCtx.manager.addToolToFocusedPane("tool-x");
            expect(inactiveCtx.manager.getState().leftGroup).toEqual([]);
        });

        it("notifies the renderer after adding a tool", () => {
            ctx.manager.addToolToFocusedPane("tool-c");
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.any(Object));
        });
    });

    // -----------------------------------------------------------------------
    // setActiveInPane()
    // -----------------------------------------------------------------------
    describe("setActiveInPane()", () => {
        beforeEach(() => {
            ctx.manager.activate("tool-a", "tool-b");
            ctx.manager.addToolToFocusedPane("tool-c"); // tool-c in left group
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
        });

        it("switches the active tool in the left pane", () => {
            ctx.manager.setActiveInPane("left", "tool-a");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-a");
        });

        it("switches the active tool in the right pane", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-d");
            ctx.manager.setActiveInPane("right", "tool-b");
            expect(ctx.manager.getState().activeRightInstanceId).toBe("tool-b");
        });

        it("updates focusedPane to the pane being switched", () => {
            ctx.manager.setFocusedPane("left");
            ctx.manager.setActiveInPane("right", "tool-b");
            expect(ctx.manager.getState().focusedPane).toBe("right");
        });

        it("returns false when the instance is not in the target pane", () => {
            // tool-b is in the right pane, not left
            const result = ctx.manager.setActiveInPane("left", "tool-b");
            expect(result).toBe(false);
        });

        it("returns true on success", () => {
            const result = ctx.manager.setActiveInPane("left", "tool-c");
            expect(result).toBe(true);
        });

        it("notifies the renderer on success", () => {
            ctx.manager.setActiveInPane("left", "tool-c");
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.any(Object));
        });
    });

    // -----------------------------------------------------------------------
    // setFocusedPane()
    // -----------------------------------------------------------------------
    describe("setFocusedPane()", () => {
        it("updates the focusedPane to 'right'", () => {
            ctx.manager.setFocusedPane("right");
            expect(ctx.manager.focusedPane).toBe("right");
        });

        it("updates the focusedPane back to 'left'", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.setFocusedPane("left");
            expect(ctx.manager.focusedPane).toBe("left");
        });

        it("notifies the renderer", () => {
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
            ctx.manager.setFocusedPane("right");
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.objectContaining({ focusedPane: "right" }));
        });
    });

    // -----------------------------------------------------------------------
    // setRatio()
    // -----------------------------------------------------------------------
    describe("setRatio()", () => {
        it("accepts a valid ratio within bounds", () => {
            ctx.manager.setRatio(0.6);
            expect(ctx.manager.getState().ratio).toBe(0.6);
        });

        it("clamps values below MIN_RATIO (0.15) to 0.15", () => {
            ctx.manager.setRatio(0.05);
            expect(ctx.manager.getState().ratio).toBe(0.15);
        });

        it("clamps values above MAX_RATIO (0.85) to 0.85", () => {
            ctx.manager.setRatio(0.99);
            expect(ctx.manager.getState().ratio).toBe(0.85);
        });

        it("persists the clamped ratio to settings", () => {
            ctx.manager.setRatio(0.7);
            expect(ctx.settingsManager.getSetting("splitDividerRatio")).toBe(0.7);
        });

        it("persists clamped value — not raw input", () => {
            ctx.manager.setRatio(0.0);
            expect(ctx.settingsManager.getSetting("splitDividerRatio")).toBe(0.15);
        });

        it("notifies the renderer", () => {
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
            ctx.manager.setRatio(0.6);
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.objectContaining({ ratio: 0.6 }));
        });
    });

    // -----------------------------------------------------------------------
    // moveToPane()
    // -----------------------------------------------------------------------
    describe("moveToPane()", () => {
        beforeEach(() => {
            ctx.manager.activate("tool-a", "tool-b");
        });

        it("moves a tool from the left pane to the right pane", () => {
            // Add a second tool to left so the pane won't become empty after the move
            ctx.manager.addToolToFocusedPane("tool-c");
            ctx.manager.moveToPane("tool-a", "right");
            const state = ctx.manager.getState();
            expect(state.rightGroup).toContain("tool-a");
            expect(state.leftGroup).not.toContain("tool-a");
        });

        it("moves a tool from the right pane to the left pane", () => {
            // Add a second tool to right so the pane won't become empty after the move
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-d");
            ctx.manager.moveToPane("tool-b", "left");
            const state = ctx.manager.getState();
            expect(state.leftGroup).toContain("tool-b");
            expect(state.rightGroup).not.toContain("tool-b");
        });

        it("makes the moved tool the active one in the target pane", () => {
            // Add a second tool to right so the pane stays alive
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-d");
            ctx.manager.moveToPane("tool-b", "left");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-b");
        });

        it("updates focusedPane to the target pane", () => {
            // Add a second tool to left so the pane stays alive after moving tool-a
            ctx.manager.addToolToFocusedPane("tool-c");
            ctx.manager.moveToPane("tool-a", "right");
            expect(ctx.manager.getState().focusedPane).toBe("right");
        });

        it("returns false when the instance is not in any group", () => {
            const result = ctx.manager.moveToPane("tool-unknown", "right");
            expect(result).toBe(false);
        });

        it("returns true without changing state when already in target pane", () => {
            const result = ctx.manager.moveToPane("tool-a", "left");
            expect(result).toBe(true);
            expect(ctx.manager.getState().leftGroup).toContain("tool-a");
        });

        it("deactivates split when moving the only tool out of the left pane", () => {
            // left has only tool-a; move it to right → left becomes empty → deactivate
            ctx.manager.moveToPane("tool-a", "right");
            expect(ctx.manager.isActive).toBe(false);
        });

        it("deactivates split when moving the only tool out of the right pane", () => {
            // right has only tool-b; move it to left → right becomes empty → deactivate
            ctx.manager.moveToPane("tool-b", "left");
            expect(ctx.manager.isActive).toBe(false);
        });

        it("updates the source pane's activeId to the previous item when active tool is moved", () => {
            // Add tool-c to left first, make it active
            ctx.manager.addToolToFocusedPane("tool-c"); // left: [tool-a, tool-c], active=tool-c
            // Move tool-c to right — activeLeftId should fall back to tool-a
            ctx.manager.moveToPane("tool-c", "right");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-a");
        });

        it("returns true after a successful move", () => {
            // Add another tool to left so the pane won't be empty after move
            ctx.manager.addToolToFocusedPane("tool-c");
            const result = ctx.manager.moveToPane("tool-a", "right");
            expect(result).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // handleToolClosed()
    // -----------------------------------------------------------------------
    describe("handleToolClosed()", () => {
        beforeEach(() => {
            ctx.manager.activate("tool-a", "tool-b");
        });

        it("does nothing when split is not active", () => {
            const inactiveCtx = buildContext();
            inactiveCtx.manager.handleToolClosed("tool-x"); // should not throw
            expect(inactiveCtx.manager.isActive).toBe(false);
        });

        it("does nothing for a tool not in any group", () => {
            ctx.manager.handleToolClosed("tool-unknown");
            expect(ctx.manager.isActive).toBe(true);
        });

        it("removes a closed tool from the left group", () => {
            // Add a second tool to left so it won't collapse
            ctx.manager.addToolToFocusedPane("tool-c");
            ctx.manager.handleToolClosed("tool-a");
            expect(ctx.manager.getState().leftGroup).not.toContain("tool-a");
        });

        it("removes a closed tool from the right group", () => {
            // Add a second tool to right so it won't collapse
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-d");
            ctx.manager.handleToolClosed("tool-b");
            expect(ctx.manager.getState().rightGroup).not.toContain("tool-b");
        });

        it("deactivates split when the left group becomes empty", () => {
            // left has only tool-a; closing it collapses split
            ctx.manager.handleToolClosed("tool-a");
            expect(ctx.manager.isActive).toBe(false);
        });

        it("deactivates split when the right group becomes empty", () => {
            // right has only tool-b; closing it collapses split
            ctx.manager.handleToolClosed("tool-b");
            expect(ctx.manager.isActive).toBe(false);
        });

        it("updates activeLeftId to the previous item when the active left tool is closed", () => {
            ctx.manager.addToolToFocusedPane("tool-c"); // left: [tool-a, tool-c], active=tool-c
            ctx.manager.handleToolClosed("tool-c");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-a");
        });

        it("updates activeRightId when the active right tool is closed", () => {
            ctx.manager.setFocusedPane("right");
            ctx.manager.addToolToFocusedPane("tool-d"); // right: [tool-b, tool-d], active=tool-d
            ctx.manager.handleToolClosed("tool-d");
            expect(ctx.manager.getState().activeRightInstanceId).toBe("tool-b");
        });

        it("does not change activeLeftId when a non-active left tool is closed", () => {
            ctx.manager.addToolToFocusedPane("tool-c"); // left: [tool-a, tool-c], active=tool-c
            ctx.manager.handleToolClosed("tool-a"); // close non-active left tool
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-c");
        });

        it("notifies the renderer after closing a tool (no collapse)", () => {
            ctx.manager.addToolToFocusedPane("tool-c"); // ensure left group stays non-empty
            (ctx.mainWindow.webContents.send as jest.Mock).mockClear();
            ctx.manager.handleToolClosed("tool-a");
            expect(ctx.mainWindow.webContents.send).toHaveBeenCalledWith(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, expect.any(Object));
        });
    });

    // -----------------------------------------------------------------------
    // getState() snapshot immutability
    // -----------------------------------------------------------------------
    describe("getState() snapshot immutability", () => {
        it("returns a copy of the group arrays, not live references", () => {
            ctx.manager.activate("tool-a", "tool-b");
            const state = ctx.manager.getState();
            // Mutating the snapshot should not affect internal state
            state.leftGroup.push("intruder");
            expect(ctx.manager.getState().leftGroup).toEqual(["tool-a"]);
        });

        it("reflects the most-recent active tool after setActiveInPane", () => {
            ctx.manager.activate("tool-a", "tool-b");
            ctx.manager.addToolToFocusedPane("tool-c");
            ctx.manager.setActiveInPane("left", "tool-a");
            expect(ctx.manager.getState().activeLeftInstanceId).toBe("tool-a");
        });
    });

    // -----------------------------------------------------------------------
    // applyLayout() — bounds calculation
    // -----------------------------------------------------------------------
    describe("applyLayout()", () => {
        it("calls setBounds on both active BrowserViews", () => {
            const leftView = registerView(ctx.toolViews, "tool-a");
            const rightView = registerView(ctx.toolViews, "tool-b");
            ctx.manager.activate("tool-a", "tool-b");

            const bounds = { x: 0, y: 40, width: 1000, height: 600 };
            ctx.manager.applyLayout(bounds);

            expect(leftView.setBounds).toHaveBeenCalledTimes(1);
            expect(rightView.setBounds).toHaveBeenCalledTimes(1);
        });

        it("left pane width + divider + right pane width equals total width", () => {
            const leftView = registerView(ctx.toolViews, "tool-a");
            const rightView = registerView(ctx.toolViews, "tool-b");
            ctx.manager.activate("tool-a", "tool-b");
            ctx.manager.setRatio(0.5);

            const bounds = { x: 0, y: 40, width: 1000, height: 600 };
            ctx.manager.applyLayout(bounds);

            const leftCall = (leftView.setBounds as jest.Mock).mock.calls[0][0] as { width: number };
            const rightCall = (rightView.setBounds as jest.Mock).mock.calls[0][0] as { width: number };

            expect(leftCall.width + SPLIT_DIVIDER_WIDTH + rightCall.width).toBe(bounds.width);
        });

        it("skips layout when BrowserViews are not in the toolViews map", () => {
            // Don't register views
            ctx.manager.activate("tool-a", "tool-b");
            // applyLayout should not throw even with missing views
            expect(() => ctx.manager.applyLayout({ x: 0, y: 0, width: 800, height: 600 })).not.toThrow();
        });

        it("does nothing when split is not active", () => {
            registerView(ctx.toolViews, "tool-a");
            ctx.manager.applyLayout({ x: 0, y: 0, width: 800, height: 600 }); // should not throw
        });
    });

    // -----------------------------------------------------------------------
    // SPLIT_DIVIDER_WIDTH export
    // -----------------------------------------------------------------------
    describe("SPLIT_DIVIDER_WIDTH", () => {
        it("is exported and is a positive integer", () => {
            expect(SPLIT_DIVIDER_WIDTH).toBeGreaterThan(0);
            expect(Number.isInteger(SPLIT_DIVIDER_WIDTH)).toBe(true);
        });
    });
});
