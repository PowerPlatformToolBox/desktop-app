import { BrowserView, BrowserWindow, ipcMain } from "electron";
import { TOOL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { logError, logInfo, logWarn } from "../../common/logger";
import { SettingsManager } from "./settingsManager";

/** Timeout (ms) before giving up on a secondary-bounds response from the renderer. */
const SECONDARY_BOUNDS_TIMEOUT_MS = 300;

/** Minimum allowed divider ratio (20% left panel). */
const SPLIT_MIN_RATIO = 0.2;
/** Maximum allowed divider ratio (80% left panel). */
const SPLIT_MAX_RATIO = 0.8;
/** Default divider ratio when none has been persisted. */
const SPLIT_DEFAULT_RATIO = 0.5;

/**
 * SplitLayoutManager
 *
 * Manages the split-view display layout for the main window: holds two BrowserView
 * instances simultaneously (primary left, secondary right), updates their bounds
 * independently, and persists the divider position via SettingsManager.
 *
 * Design intent: this is purely a display/layout concern.  Tool lifecycle (launch,
 * invocation, close) remains in ToolWindowManager; only BrowserView positioning and
 * split-state management live here.
 */
export class SplitLayoutManager {
    private readonly mainWindow: BrowserWindow;
    private readonly settingsManager: SettingsManager;
    /** Retrieve the BrowserView for a given tool instanceId, or undefined if not found. */
    private readonly getView: (instanceId: string) => BrowserView | undefined;
    /** Retrieve the instanceId of the currently active (primary) tool. */
    private readonly getActiveToolId: () => string | null;
    /** Called whenever the split-view state changes so the caller can re-schedule bounds updates. */
    private readonly onBoundsNeeded: () => void;

    /** The instanceId of the secondary (right-panel) tool, or null when not in split view. */
    private _secondaryToolId: string | null = null;

    private secondaryBoundsUpdatePending = false;

    /** Bound listener stored so we can remove it on dispose. */
    private readonly secondaryBoundsResponseListener: (event: Electron.IpcMainEvent, bounds: { x: number; y: number; width: number; height: number }) => void;

    constructor(
        mainWindow: BrowserWindow,
        settingsManager: SettingsManager,
        getView: (instanceId: string) => BrowserView | undefined,
        getActiveToolId: () => string | null,
        onBoundsNeeded: () => void,
    ) {
        this.mainWindow = mainWindow;
        this.settingsManager = settingsManager;
        this.getView = getView;
        this.getActiveToolId = getActiveToolId;
        this.onBoundsNeeded = onBoundsNeeded;

        this.secondaryBoundsResponseListener = (_event, bounds) => {
            if (bounds && bounds.width > 0 && bounds.height > 0) {
                const zoomFactor = this.mainWindow.webContents.getZoomFactor();
                this.applySecondaryBounds({
                    x: Math.round(bounds.x * zoomFactor),
                    y: Math.round(bounds.y * zoomFactor),
                    width: Math.round(bounds.width * zoomFactor),
                    height: Math.round(bounds.height * zoomFactor),
                });
            } else {
                this.secondaryBoundsUpdatePending = false;
            }
        };

        ipcMain.on("get-secondary-tool-panel-bounds-response", this.secondaryBoundsResponseListener);
    }

    // ── Public state ──────────────────────────────────────────────────────────

    /** Whether split view is currently active. */
    get isActive(): boolean {
        return this._secondaryToolId !== null;
    }

    /** The instanceId of the secondary (right-panel) tool, or null when not in split view. */
    get secondaryToolId(): string | null {
        return this._secondaryToolId;
    }

    // ── IPC registration ──────────────────────────────────────────────────────

    /**
     * Register all split-view IPC handlers.
     * Should be called once during application initialisation.
     */
    registerIpcHandlers(): void {
        ipcMain.handle(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SET, async (_event, secondaryInstanceId: string) => {
            return this.activate(secondaryInstanceId);
        });

        ipcMain.handle(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_CLOSE, async () => {
            return this.deactivate();
        });

        ipcMain.handle(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SWITCH_SECONDARY, async (_event, newSecondaryInstanceId: string) => {
            return this.switchSecondary(newSecondaryInstanceId);
        });

        ipcMain.handle(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_GET_DIVIDER_RATIO, async () => {
            return this.getSavedDividerRatio();
        });

        ipcMain.handle(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SAVE_DIVIDER_RATIO, async (_event, ratio: number) => {
            this.saveDividerRatio(ratio);
        });
    }

    /**
     * Remove all split-view IPC handlers and listeners.
     * Should be called when the manager is disposed.
     */
    removeIpcHandlers(): void {
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SET);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_CLOSE);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SWITCH_SECONDARY);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_GET_DIVIDER_RATIO);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_SAVE_DIVIDER_RATIO);
        ipcMain.removeListener("get-secondary-tool-panel-bounds-response", this.secondaryBoundsResponseListener);
    }

    // ── Layout actions ────────────────────────────────────────────────────────

    /**
     * Activate split view: show the given secondary tool alongside the current
     * primary tool.  Both BrowserViews are attached to the window simultaneously.
     */
    activate(secondaryInstanceId: string): boolean {
        try {
            const primaryInstanceId = this.getActiveToolId();
            if (!primaryInstanceId) {
                logWarn("[SplitLayoutManager] Cannot activate split view: no active primary tool");
                return false;
            }
            if (secondaryInstanceId === primaryInstanceId) {
                logWarn("[SplitLayoutManager] Cannot split view: secondary is the same tool as primary");
                return false;
            }

            const primaryView = this.getView(primaryInstanceId);
            const secondaryView = this.getView(secondaryInstanceId);
            if (!primaryView || !secondaryView) {
                logError("[SplitLayoutManager] BrowserView(s) missing for split-view activation");
                return false;
            }

            // Detach all current views, then re-attach primary + secondary together.
            this.clearAttachedViews();
            this.mainWindow.addBrowserView(primaryView);
            this.mainWindow.addBrowserView(secondaryView);

            this._secondaryToolId = secondaryInstanceId;
            this.notifyStateChanged();
            this.onBoundsNeeded();

            logInfo(`[SplitLayoutManager] Activated — primary: ${primaryInstanceId}, secondary: ${secondaryInstanceId}`);
            return true;
        } catch (error) {
            logError("[SplitLayoutManager] Error activating split view", error);
            return false;
        }
    }

    /**
     * Deactivate split view and return to single-panel layout.
     * The primary tool's view is re-attached so it fills the full panel.
     */
    deactivate(): boolean {
        try {
            if (!this._secondaryToolId) return false;

            const secondaryView = this.getView(this._secondaryToolId);
            if (secondaryView) {
                try {
                    this.mainWindow.removeBrowserView(secondaryView);
                } catch (_e) {
                    // ignore removal errors
                }
            }

            this._secondaryToolId = null;
            this.secondaryBoundsUpdatePending = false;

            // Re-set the primary view so it fills the entire panel again.
            const primaryId = this.getActiveToolId();
            if (primaryId) {
                const primaryView = this.getView(primaryId);
                if (primaryView) {
                    this.mainWindow.setBrowserView(primaryView);
                }
            }

            this.notifyStateChanged();
            this.onBoundsNeeded();

            logInfo("[SplitLayoutManager] Deactivated");
            return true;
        } catch (error) {
            logError("[SplitLayoutManager] Error deactivating split view", error);
            return false;
        }
    }

    /**
     * Switch the tool shown in the secondary (right) panel without changing the
     * primary tool.
     */
    switchSecondary(newSecondaryInstanceId: string): boolean {
        try {
            const primaryInstanceId = this.getActiveToolId();
            if (newSecondaryInstanceId === primaryInstanceId) {
                logWarn("[SplitLayoutManager] Cannot use the same tool as both primary and secondary");
                return false;
            }

            const newSecondaryView = this.getView(newSecondaryInstanceId);
            if (!newSecondaryView) {
                logError(`[SplitLayoutManager] New secondary tool not found: ${newSecondaryInstanceId}`);
                return false;
            }

            if (this._secondaryToolId) {
                const oldSecondaryView = this.getView(this._secondaryToolId);
                if (oldSecondaryView) {
                    try {
                        this.mainWindow.removeBrowserView(oldSecondaryView);
                    } catch (_e) {
                        // ignore removal errors
                    }
                }
            }

            this._secondaryToolId = newSecondaryInstanceId;
            this.mainWindow.addBrowserView(newSecondaryView);

            this.notifyStateChanged();
            this.onBoundsNeeded();

            logInfo(`[SplitLayoutManager] Secondary switched to: ${newSecondaryInstanceId}`);
            return true;
        } catch (error) {
            logError("[SplitLayoutManager] Error switching secondary tool", error);
            return false;
        }
    }

    /**
     * Called by ToolWindowManager when the active (primary) tool changes.
     * Re-attaches primary + secondary views in the correct order.
     *
     * Returns true if split view remains active, or false if the secondary view
     * was missing (split view auto-exits in that case).
     */
    onPrimaryChanged(newPrimaryInstanceId: string): boolean {
        if (!this._secondaryToolId) return false;

        const primaryView = this.getView(newPrimaryInstanceId);
        const secondaryView = this.getView(this._secondaryToolId);

        if (!secondaryView) {
            // Secondary was closed externally — exit split view.
            this._secondaryToolId = null;
            this.notifyStateChanged();
            return false;
        }

        if (!primaryView) return false;

        this.clearAttachedViews();
        this.mainWindow.addBrowserView(primaryView);
        this.mainWindow.addBrowserView(secondaryView);
        return true;
    }

    /**
     * Called by ToolWindowManager when a tool is closed.
     * If the closed tool was in the secondary panel, split view is deactivated.
     */
    onToolClosed(closedInstanceId: string): void {
        if (this._secondaryToolId !== closedInstanceId) return;

        const view = this.getView(closedInstanceId);
        if (view) {
            try {
                this.mainWindow.removeBrowserView(view);
            } catch (_e) {
                // ignore removal errors
            }
        }
        this._secondaryToolId = null;
        this.secondaryBoundsUpdatePending = false;
        this.notifyStateChanged();
    }

    /**
     * Reset split-view state without sending BrowserView commands.
     * Used during full renderer re-initialisation (closeAllToolViews) where the
     * caller already clears all views.
     */
    reset(): void {
        this._secondaryToolId = null;
        this.secondaryBoundsUpdatePending = false;
        this.notifyStateChanged();
    }

    // ── Bounds management ─────────────────────────────────────────────────────

    /**
     * Schedule a secondary-panel bounds update.  The renderer is asked for the
     * current position of the secondary panel DOM element, and the response is
     * used to position the BrowserView.
     */
    scheduleSecondaryBoundsUpdate(): void {
        if (!this._secondaryToolId || this.secondaryBoundsUpdatePending) return;
        if (!this.getView(this._secondaryToolId)) return;

        try {
            this.secondaryBoundsUpdatePending = true;
            this.mainWindow.webContents.send("get-secondary-tool-panel-bounds-request");
            const fallbackTimer = setTimeout(() => {
                this.secondaryBoundsUpdatePending = false;
            }, SECONDARY_BOUNDS_TIMEOUT_MS);
            ipcMain.once("get-secondary-tool-panel-bounds-response", () => {
                clearTimeout(fallbackTimer);
            });
        } catch (error) {
            logError("[SplitLayoutManager] Failed to send secondary-bounds request to renderer", error);
            this.secondaryBoundsUpdatePending = false;
        }
    }

    // ── Divider ratio persistence ─────────────────────────────────────────────

    /** Return the persisted divider ratio, or the default if none has been saved. */
    getSavedDividerRatio(): number {
        return this.settingsManager.getSetting("splitDividerRatio") ?? SPLIT_DEFAULT_RATIO;
    }

    /** Persist the given divider ratio, clamped to the allowed range. */
    saveDividerRatio(ratio: number): void {
        const clamped = Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio));
        this.settingsManager.setSetting("splitDividerRatio", clamped);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private applySecondaryBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        if (!this._secondaryToolId) return;
        const secondaryView = this.getView(this._secondaryToolId);
        if (!secondaryView) return;

        try {
            const content = this.mainWindow.getContentBounds();
            const clamped = {
                x: Math.max(0, Math.min(bounds.x, content.width - 1)),
                y: Math.max(0, Math.min(bounds.y, content.height - 1)),
                width: Math.max(1, Math.min(bounds.width, Math.max(1, content.width - Math.max(0, bounds.x)))),
                height: Math.max(1, Math.min(bounds.height, Math.max(1, content.height - Math.max(0, bounds.y)))),
            };
            secondaryView.setBounds(clamped);
        } catch (error) {
            logError("[SplitLayoutManager] Error applying secondary bounds", error);
        } finally {
            this.secondaryBoundsUpdatePending = false;
        }
    }

    private clearAttachedViews(): void {
        const attached = this.mainWindow.getBrowserViews?.();
        if (attached) {
            for (const v of attached) {
                try {
                    this.mainWindow.removeBrowserView(v);
                } catch (_e) {
                    // ignore removal errors
                }
            }
        } else {
            try {
                this.mainWindow.setBrowserView(null);
            } catch (_e) {
                // ignore errors when clearing current view
            }
        }
    }

    private notifyStateChanged(): void {
        this.mainWindow.webContents.send(TOOL_WINDOW_CHANNELS.SPLIT_VIEW_CHANGED, {
            active: this._secondaryToolId !== null,
            secondaryInstanceId: this._secondaryToolId,
        });
    }
}
