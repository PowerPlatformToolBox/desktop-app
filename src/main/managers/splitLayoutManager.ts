import { BrowserView, BrowserWindow, ipcMain } from "electron";
import { SPLIT_LAYOUT_CHANNELS } from "../../common/ipc/channels";
import { logError, logInfo, logWarn } from "../../common/logger";
import { SplitLayoutState } from "../../common/types/api";
import { SettingsManager } from "./settingsManager";

/** Pixel width of the gap kept between the two pane BrowserViews for the divider. */
export const SPLIT_DIVIDER_WIDTH = 4;

const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/**
 * SplitLayoutManager
 *
 * Manages a VS Code-style split-pane layout.  Each pane is a *group* of tool
 * instances (tabs); only one tool per pane is visible at a time (the active one).
 *
 * Design constraints:
 *  - Does NOT create or destroy BrowserViews — that is ToolWindowManager's job.
 *  - Does NOT touch the inter-tool invocation / return flow.
 *  - Is purely a display concern: it repositions existing BrowserViews using
 *    `addBrowserView` so both active pane views are visible simultaneously.
 */
export class SplitLayoutManager {
    private mainWindow: BrowserWindow;
    private settingsManager: SettingsManager;
    /** Shared reference to ToolWindowManager's internal view map (live reference). */
    private toolViews: Map<string, BrowserView>;

    private _isActive = false;
    /** Ordered list of instanceIds in the left pane group. */
    private leftGroup: string[] = [];
    /** Ordered list of instanceIds in the right pane group. */
    private rightGroup: string[] = [];
    /** Currently visible (active) tool in the left pane. */
    private activeLeftId: string | null = null;
    /** Currently visible (active) tool in the right pane. */
    private activeRightId: string | null = null;
    /** Which pane receives newly opened tools. */
    private _focusedPane: "left" | "right" = "left";
    private ratio: number = DEFAULT_RATIO;

    /** Last full bounds received from the renderer, used to re-apply on ratio / pane changes. */
    private lastKnownFullBounds: { x: number; y: number; width: number; height: number } | null = null;

    constructor(mainWindow: BrowserWindow, settingsManager: SettingsManager, toolViews: Map<string, BrowserView>) {
        this.mainWindow = mainWindow;
        this.settingsManager = settingsManager;
        this.toolViews = toolViews;

        // Restore persisted divider ratio
        const savedRatio = settingsManager.getSetting("splitDividerRatio");
        if (typeof savedRatio === "number" && savedRatio >= MIN_RATIO && savedRatio <= MAX_RATIO) {
            this.ratio = savedRatio;
        }

        this.setupIpcHandlers();
    }

    // ─── Public Getters ───────────────────────────────────────────────────────

    get isActive(): boolean {
        return this._isActive;
    }

    get focusedPane(): "left" | "right" {
        return this._focusedPane;
    }

    // ─── IPC ─────────────────────────────────────────────────────────────────

    private removeIpcHandlers(): void {
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.ACTIVATE);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.DEACTIVATE);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.SET_RATIO);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.GET_STATE);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.SWITCH_PANE);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.MOVE_TO_PANE);
        ipcMain.removeHandler(SPLIT_LAYOUT_CHANNELS.FOCUS_PANE);
    }

    private setupIpcHandlers(): void {
        this.removeIpcHandlers();

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.ACTIVATE, async (_event, leftInstanceId: string, rightInstanceId: string) => {
            return this.activate(leftInstanceId, rightInstanceId);
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.DEACTIVATE, async () => {
            return this.deactivate();
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.SET_RATIO, async (_event, ratio: number) => {
            return this.setRatio(ratio);
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.GET_STATE, async () => {
            return this.getState();
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.SWITCH_PANE, async (_event, pane: "left" | "right", instanceId: string) => {
            return this.setActiveInPane(pane, instanceId);
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.MOVE_TO_PANE, async (_event, instanceId: string, targetPane: "left" | "right") => {
            return this.moveToPane(instanceId, targetPane);
        });

        ipcMain.handle(SPLIT_LAYOUT_CHANNELS.FOCUS_PANE, async (_event, pane: "left" | "right") => {
            this.setFocusedPane(pane);
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    getState(): SplitLayoutState {
        return {
            isActive: this._isActive,
            leftGroup: [...this.leftGroup],
            rightGroup: [...this.rightGroup],
            activeLeftInstanceId: this.activeLeftId,
            activeRightInstanceId: this.activeRightId,
            focusedPane: this._focusedPane,
            ratio: this.ratio,
        };
    }

    /** Returns which pane the instance belongs to, or null if not in split. */
    getPaneForInstance(instanceId: string): "left" | "right" | null {
        if (!this._isActive) return null;
        if (this.leftGroup.includes(instanceId)) return "left";
        if (this.rightGroup.includes(instanceId)) return "right";
        return null;
    }

    /** Returns true if the given instanceId is in either pane group (backward compat). */
    isInstanceInSplit(instanceId: string): boolean {
        return this.getPaneForInstance(instanceId) !== null;
    }

    /**
     * Activate split mode with one tool per pane to start.
     * Each instance becomes a one-entry group; both BrowserViews shown immediately.
     */
    activate(leftInstanceId: string, rightInstanceId: string): boolean {
        if (leftInstanceId === rightInstanceId) {
            logWarn("[SplitLayoutManager] Cannot split the same instance into both panes");
            return false;
        }

        this._isActive = true;
        this.leftGroup = [leftInstanceId];
        this.rightGroup = [rightInstanceId];
        this.activeLeftId = leftInstanceId;
        this.activeRightId = rightInstanceId;
        this._focusedPane = "left";

        logInfo(`[SplitLayoutManager] Activated: left=${leftInstanceId}, right=${rightInstanceId}, ratio=${this.ratio}`);

        if (this.lastKnownFullBounds) {
            this.applyLayout(this.lastKnownFullBounds);
        }

        this.notifyRenderer();
        return true;
    }

    /**
     * Deactivate split mode.  All BrowserViews are cleared;
     * ToolWindowManager restores the surviving tool via the STATE_CHANGED path.
     */
    deactivate(): boolean {
        if (!this._isActive) return false;

        this._isActive = false;
        this.leftGroup = [];
        this.rightGroup = [];
        this.activeLeftId = null;
        this.activeRightId = null;
        this._focusedPane = "left";

        // Clear all BrowserViews so ToolWindowManager can re-attach via setBrowserView()
        this.clearAllBrowserViews();

        logInfo("[SplitLayoutManager] Deactivated");
        this.notifyRenderer();
        return true;
    }

    /** Update the divider ratio and reposition both panes. Persisted to settings. */
    setRatio(ratio: number): void {
        const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
        this.ratio = clamped;
        this.settingsManager.setSetting("splitDividerRatio", clamped);

        if (this._isActive && this.lastKnownFullBounds) {
            this.applyLayout(this.lastKnownFullBounds);
        }

        this.notifyRenderer();
    }

    /**
     * Make instanceId the active (visible) tool in the given pane.
     * The instance must already be in that pane's group.
     * Also updates focusedPane so future tools open to this pane.
     */
    setActiveInPane(pane: "left" | "right", instanceId: string): boolean {
        const group = pane === "left" ? this.leftGroup : this.rightGroup;
        if (!group.includes(instanceId)) {
            logWarn(`[SplitLayoutManager] setActiveInPane: ${instanceId} not in ${pane} group`);
            return false;
        }
        if (pane === "left") {
            this.activeLeftId = instanceId;
        } else {
            this.activeRightId = instanceId;
        }
        this._focusedPane = pane;

        if (this.lastKnownFullBounds) {
            this.applyLayout(this.lastKnownFullBounds);
        }
        this.notifyRenderer();
        return true;
    }

    /**
     * Add a new tool to the focused pane and make it active there.
     * Called by ToolWindowManager when a new tool opens while split is active.
     */
    addToolToFocusedPane(instanceId: string): void {
        if (!this._isActive) return;

        if (this._focusedPane === "left") {
            if (!this.leftGroup.includes(instanceId)) {
                this.leftGroup.push(instanceId);
            }
            this.activeLeftId = instanceId;
        } else {
            if (!this.rightGroup.includes(instanceId)) {
                this.rightGroup.push(instanceId);
            }
            this.activeRightId = instanceId;
        }

        logInfo(`[SplitLayoutManager] Added ${instanceId} to focused ${this._focusedPane} pane`);
        if (this.lastKnownFullBounds) {
            this.applyLayout(this.lastKnownFullBounds);
        }
        this.notifyRenderer();
    }

    /**
     * Move instanceId from its current group to targetPane.
     * If the source group becomes empty, split is collapsed.
     */
    moveToPane(instanceId: string, targetPane: "left" | "right"): boolean {
        const sourcePane = this.getPaneForInstance(instanceId);
        if (!sourcePane) {
            logWarn(`[SplitLayoutManager] moveToPane: ${instanceId} not in any group`);
            return false;
        }
        if (sourcePane === targetPane) return true;

        // Remove from source group
        if (sourcePane === "left") {
            this.leftGroup = this.leftGroup.filter((id) => id !== instanceId);
            if (this.activeLeftId === instanceId) {
                this.activeLeftId = this.leftGroup[this.leftGroup.length - 1] ?? null;
            }
        } else {
            this.rightGroup = this.rightGroup.filter((id) => id !== instanceId);
            if (this.activeRightId === instanceId) {
                this.activeRightId = this.rightGroup[this.rightGroup.length - 1] ?? null;
            }
        }

        // Add to target group and make it active
        if (targetPane === "left") {
            this.leftGroup.push(instanceId);
            this.activeLeftId = instanceId;
        } else {
            this.rightGroup.push(instanceId);
            this.activeRightId = instanceId;
        }
        this._focusedPane = targetPane;

        // If the source group is now empty, collapse to single-pane
        const sourceEmpty = sourcePane === "left" ? this.leftGroup.length === 0 : this.rightGroup.length === 0;
        if (sourceEmpty) {
            logInfo(`[SplitLayoutManager] Source pane (${sourcePane}) empty after move — collapsing`);
            this.deactivate();
            return true;
        }

        logInfo(`[SplitLayoutManager] Moved ${instanceId}: ${sourcePane} → ${targetPane}`);
        if (this.lastKnownFullBounds) {
            this.applyLayout(this.lastKnownFullBounds);
        }
        this.notifyRenderer();
        return true;
    }

    /** Set which pane receives newly opened tools. */
    setFocusedPane(pane: "left" | "right"): void {
        this._focusedPane = pane;
        this.notifyRenderer();
    }

    /**
     * Called by ToolWindowManager when any tool closes.
     * Removes from its group; collapses split if the group becomes empty.
     */
    handleToolClosed(instanceId: string): void {
        if (!this._isActive) return;

        const inLeft = this.leftGroup.includes(instanceId);
        const inRight = this.rightGroup.includes(instanceId);
        if (!inLeft && !inRight) return;

        if (inLeft) {
            this.leftGroup = this.leftGroup.filter((id) => id !== instanceId);
            if (this.activeLeftId === instanceId) {
                this.activeLeftId = this.leftGroup[this.leftGroup.length - 1] ?? null;
            }
        } else {
            this.rightGroup = this.rightGroup.filter((id) => id !== instanceId);
            if (this.activeRightId === instanceId) {
                this.activeRightId = this.rightGroup[this.rightGroup.length - 1] ?? null;
            }
        }

        if (this.leftGroup.length === 0 || this.rightGroup.length === 0) {
            logInfo(`[SplitLayoutManager] Pane group empty after closing ${instanceId} — collapsing`);
            this.deactivate();
        } else {
            if (this.lastKnownFullBounds) {
                this.applyLayout(this.lastKnownFullBounds);
            }
            this.notifyRenderer();
        }
    }

    /**
     * Apply the side-by-side layout using the currently active tools for each pane.
     * Hides all inactive BrowserViews so only the two active ones are visible.
     * @param fullBounds The full content bounds of the tool-panel-content element
     *                   as reported by the renderer (CSS pixels, window-relative).
     */
    applyLayout(fullBounds: { x: number; y: number; width: number; height: number }): void {
        if (!this._isActive || !this.activeLeftId || !this.activeRightId) return;

        this.lastKnownFullBounds = fullBounds;

        const leftView = this.toolViews.get(this.activeLeftId);
        const rightView = this.toolViews.get(this.activeRightId);

        if (!leftView || !rightView) {
            logWarn("[SplitLayoutManager] Active BrowserViews not found — cannot apply layout");
            return;
        }

        if (leftView.webContents.isDestroyed() || rightView.webContents.isDestroyed()) {
            logWarn("[SplitLayoutManager] Active BrowserViews are destroyed — skipping layout");
            return;
        }

        try {
            const totalWidth = fullBounds.width;
            const halfDivider = Math.floor(SPLIT_DIVIDER_WIDTH / 2);
            const splitPoint = Math.floor(totalWidth * this.ratio);

            const leftWidth = Math.max(1, splitPoint - halfDivider);
            const rightStartX = fullBounds.x + splitPoint + (SPLIT_DIVIDER_WIDTH - halfDivider);
            const rightWidth = Math.max(1, totalWidth - splitPoint - (SPLIT_DIVIDER_WIDTH - halfDivider));

            // addBrowserView is additive — both active views are shown simultaneously.
            this.mainWindow.addBrowserView(leftView);
            this.mainWindow.addBrowserView(rightView);

            leftView.setBounds({
                x: fullBounds.x,
                y: fullBounds.y,
                width: leftWidth,
                height: Math.max(1, fullBounds.height),
            });

            rightView.setBounds({
                x: rightStartX,
                y: fullBounds.y,
                width: rightWidth,
                height: Math.max(1, fullBounds.height),
            });

            // Hide all inactive BrowserViews (tools not currently the active pane view)
            for (const [id, view] of this.toolViews) {
                if (id !== this.activeLeftId && id !== this.activeRightId) {
                    try {
                        this.mainWindow.removeBrowserView(view);
                    } catch {
                        // ignore individual removal errors
                    }
                }
            }

            logInfo(`[SplitLayoutManager] Layout: left=${this.activeLeftId}(w=${leftWidth}), right=${this.activeRightId}(x=${rightStartX},w=${rightWidth}), ratio=${this.ratio}`);
        } catch (err) {
            logError("[SplitLayoutManager] Error applying layout", err);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private clearAllBrowserViews(): void {
        try {
            const views = this.mainWindow.getBrowserViews?.() ?? [];
            for (const view of views) {
                try {
                    this.mainWindow.removeBrowserView(view);
                } catch {
                    // ignore individual removal errors
                }
            }
        } catch (err) {
            logWarn("[SplitLayoutManager] Error clearing BrowserViews", err);
        }
    }

    private notifyRenderer(): void {
        try {
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(SPLIT_LAYOUT_CHANNELS.STATE_CHANGED, this.getState());
            }
        } catch (err) {
            logWarn("[SplitLayoutManager] Error sending state to renderer", err);
        }
    }
}
