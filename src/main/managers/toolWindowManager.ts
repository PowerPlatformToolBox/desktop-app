import { BrowserView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { EVENT_CHANNELS, TOOL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { captureException, captureMessage, logInfo } from "../../common/sentryHelper";
import { LastUsedToolConnectionInfo, Tool } from "../../common/types";
import { ToolBoxEvent } from "../../common/types/events";
import { BrowserviewProtocolManager } from "./browserviewProtocolManager";
import { ConnectionsManager } from "./connectionsManager";
import { SettingsManager } from "./settingsManager";
import { TerminalManager } from "./terminalManager";
import { ToolFileSystemAccessManager } from "./toolFileSystemAccessManager";
import { ToolManager } from "./toolsManager";

/**
 * ToolWindowManager
 *
 * Manages BrowserView instances for each tool, providing true process isolation
 * and independent webPreferences per tool.
 *
 * Key Features:
 * - Each tool runs in its own BrowserView (separate renderer process)
 * - No CSP inheritance from parent window
 * - Direct IPC communication (no postMessage complexity)
 * - Full control over webPreferences including CORS bypass
 * - Clean tool switching by showing/hiding BrowserViews
 */
export class ToolWindowManager {
    private mainWindow: BrowserWindow;
    private browserviewProtocolManager: BrowserviewProtocolManager;
    private connectionsManager: ConnectionsManager;
    private settingsManager: SettingsManager;
    private toolManager: ToolManager;
    private terminalManager: TerminalManager;
    private toolFilesystemAccessManager: ToolFileSystemAccessManager;
    /**
     * Maps tool instanceId (NOT toolId) to BrowserView.
     *
     * Key semantics:
     * - The key is the unique tool instanceId (format: toolId-timestamp-random).
     * - This allows multiple instances of the same toolId to have separate BrowserViews.
     *
     * Naming note:
     * - The property name is `toolViews` for historical reasons, but it is actually
     *   keyed by instanceId, not toolId.
     * - A future refactor may rename this to `instanceViews`; such a change would be
     *   cosmetic only and must be done consistently across all usages.
     */
    private toolViews: Map</* instanceId: string */ string, BrowserView> = new Map();
    private toolConnectionInfo: Map<string, { primaryConnectionId: string | null; secondaryConnectionId: string | null }> = new Map(); // Maps instanceId -> connection info
    // NOTE: Despite the name, this stores the active tool *instanceId* (not the toolId).
    // The property name is retained for backward compatibility; prefer `instanceId` terminology elsewhere.
    private activeToolId: string | null = null;
    private boundsUpdatePending: boolean = false;
    private frameScheduled = false;
    private boundsResponseListener: (event: Electron.IpcMainEvent, bounds: { x: number; y: number; width: number; height: number }) => void;
    private terminalVisibilityListener: () => void;
    private sidebarLayoutListener: () => void;
    private refreshBoundsListener: () => void;
    private focusListener: () => void;
    private showListener: () => void;
    private onActiveToolChanged: ((activeToolId: string | null) => void) | null = null;

    constructor(
        mainWindow: BrowserWindow,
        browserviewProtocolManager: BrowserviewProtocolManager,
        connectionsManager: ConnectionsManager,
        settingsManager: SettingsManager,
        toolManager: ToolManager,
        terminalManager: TerminalManager,
        toolFilesystemAccessManager: ToolFileSystemAccessManager,
    ) {
        this.mainWindow = mainWindow;
        this.browserviewProtocolManager = browserviewProtocolManager;
        this.connectionsManager = connectionsManager;
        this.settingsManager = settingsManager;
        this.toolManager = toolManager;
        this.terminalManager = terminalManager;
        this.toolFilesystemAccessManager = toolFilesystemAccessManager;

        this.boundsResponseListener = (event, bounds) => {
            if (bounds && bounds.width > 0 && bounds.height > 0) {
                this.applyToolViewBounds({
                    x: Math.round(bounds.x),
                    y: Math.round(bounds.y),
                    width: Math.round(bounds.width),
                    height: Math.round(bounds.height),
                });
            } else {
                this.boundsUpdatePending = false;
            }
        };

        this.refreshBoundsListener = () => this.scheduleBoundsUpdate();
        this.focusListener = () => {
            this.refreshBoundsListener();
            setTimeout(() => this.refreshBoundsListener(), 120);
        };
        this.showListener = () => {
            this.refreshBoundsListener();
            setTimeout(() => this.refreshBoundsListener(), 120);
        };
        this.terminalVisibilityListener = () => {
            this.scheduleBoundsUpdate();
        };
        this.sidebarLayoutListener = () => {
            this.scheduleBoundsUpdate();
            setTimeout(() => this.scheduleBoundsUpdate(), 140);
            setTimeout(() => this.scheduleBoundsUpdate(), 280);
        };
        this.setupIpcHandlers();
    }

    /**
     * Remove IPC handlers to allow clean re-registration
     * This is called before setupIpcHandlers to prevent duplicate registration errors
     */
    private removeIpcHandlers(): void {
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.LAUNCH);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SWITCH);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.CLOSE);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.GET_ACTIVE);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.GET_OPEN_TOOLS);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.UPDATE_TOOL_CONNECTION);
    }

    /**
     * Setup IPC handlers for tool window management
     */
    private setupIpcHandlers(): void {
        // Remove existing handlers first to prevent duplicate registration errors
        // This is necessary on macOS where the app doesn't quit when windows are closed
        this.removeIpcHandlers();

        // Launch tool (create BrowserView and load tool)
        // Now accepts instanceId instead of toolId, plus connection IDs
        ipcMain.handle(TOOL_WINDOW_CHANNELS.LAUNCH, async (event, instanceId: string, tool: Tool, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => {
            return this.launchTool(instanceId, tool, primaryConnectionId, secondaryConnectionId);
        });

        // Switch to a different tool
        ipcMain.handle(TOOL_WINDOW_CHANNELS.SWITCH, async (event, instanceId: string) => {
            return this.switchToTool(instanceId);
        });

        // Close a tool
        ipcMain.handle(TOOL_WINDOW_CHANNELS.CLOSE, async (event, instanceId: string) => {
            return this.closeTool(instanceId);
        });

        // Get active instance ID (activeToolId variable now stores instanceId values)
        ipcMain.handle(TOOL_WINDOW_CHANNELS.GET_ACTIVE, async () => {
            return this.activeToolId;
        });

        // Get all open tool IDs (now returns instanceIds)
        ipcMain.handle(TOOL_WINDOW_CHANNELS.GET_OPEN_TOOLS, async () => {
            return Array.from(this.toolViews.keys());
        });

        // Update tool connection
        ipcMain.handle(TOOL_WINDOW_CHANNELS.UPDATE_TOOL_CONNECTION, async (event, instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => {
            return this.updateToolConnection(instanceId, primaryConnectionId, secondaryConnectionId);
        });

        // Restore renderer-provided bounds flow
        ipcMain.on("get-tool-panel-bounds-response", this.boundsResponseListener);

        // Update tool window bounds on common window state changes
        this.mainWindow.on("resize", this.refreshBoundsListener);
        this.mainWindow.on("move", this.refreshBoundsListener);
        this.mainWindow.on("maximize", this.refreshBoundsListener);
        this.mainWindow.on("unmaximize", this.refreshBoundsListener);
        this.mainWindow.on("enter-full-screen", this.refreshBoundsListener);
        this.mainWindow.on("leave-full-screen", this.refreshBoundsListener);
        // macOS app switching restores correct render; emulate by refreshing on focus/show
        this.mainWindow.on("focus", this.focusListener);
        this.mainWindow.on("show", this.showListener);

        // Handle terminal panel visibility changes
        // When terminal is shown/hidden, we need to adjust BrowserView bounds
        ipcMain.on("terminal-visibility-changed", this.terminalVisibilityListener);
        ipcMain.on("sidebar-layout-changed", this.sidebarLayoutListener);

        // Periodic frame scheduling helper
        // Ensures multiple rapid events coalesce into one bounds request per frame
    }

    /**
     * Launch a tool in a new BrowserView
     * Now uses instanceId instead of toolId to support multiple instances
     * @param instanceId Unique instance identifier (format: toolId-timestamp-random)
     * @param tool Tool configuration
     * @param primaryConnectionId Primary connection ID for this instance (passed from frontend)
     * @param secondaryConnectionId Secondary connection ID for multi-connection tools (optional)
     */
    async launchTool(instanceId: string, tool: Tool, primaryConnectionId: string | null, secondaryConnectionId: string | null = null): Promise<boolean> {
        try {
            logInfo(`[ToolWindowManager] Launching tool instance: ${instanceId}`);

            // Extract actual toolId from instanceId (format: toolId-timestamp-random)
            const toolId = instanceId.split("-").slice(0, -2).join("-");

            // Check if this specific instance is already open (shouldn't happen, but safety check)
            if (this.toolViews.has(instanceId)) {
                await this.switchToTool(instanceId);
                return true;
            }

            // Create BrowserView for the tool
            const toolView = new BrowserView({
                webPreferences: {
                    preload: path.join(__dirname, "toolPreloadBridge.js"),
                    contextIsolation: true,
                    nodeIntegration: false,
                    // Disable Electron sandbox for this BrowserView preload so CommonJS require works.
                    // If stronger isolation is needed later, switch to bundling preload without runtime require.
                    sandbox: false,
                    // Disable web security to bypass CORS for external API calls
                    // CSP is still enforced via meta tags in tool HTML
                    webSecurity: false,
                    // Allow tools to load external resources
                    allowRunningInsecureContent: false,
                },
            });

            // Get tool URL from custom protocol using the base toolId
            const toolUrl = this.browserviewProtocolManager.buildToolUrl(toolId);
            logInfo(`[ToolWindowManager] Loading tool from: ${toolUrl}`);

            // Load the tool
            await toolView.webContents.loadURL(toolUrl);

            // Store the view with instanceId as key
            this.toolViews.set(instanceId, toolView);

            // Get connection information for this tool instance
            // Connections are passed from frontend (per-instance), not retrieved from settings
            let connectionUrl: string | null = null;
            let secondaryConnectionUrl: string | null = null;

            let primaryConnectionDetails: LastUsedToolConnectionInfo | undefined;
            let secondaryConnectionDetails: LastUsedToolConnectionInfo | undefined;

            if (primaryConnectionId) {
                // Get the actual connection object to retrieve the URL
                const connection = this.connectionsManager.getConnectionById(primaryConnectionId);
                if (connection) {
                    connectionUrl = connection.url;
                    primaryConnectionDetails = {
                        id: connection.id,
                        name: connection.name,
                        environment: connection.environment,
                        url: connection.url,
                    };
                } else {
                    primaryConnectionDetails = { id: primaryConnectionId };
                }
            }

            // Check if tool has a secondary connection (for multi-connection tools)
            if (secondaryConnectionId) {
                const secondaryConnection = this.connectionsManager.getConnectionById(secondaryConnectionId);
                if (secondaryConnection) {
                    secondaryConnectionUrl = secondaryConnection.url;
                    secondaryConnectionDetails = {
                        id: secondaryConnection.id,
                        name: secondaryConnection.name,
                        environment: secondaryConnection.environment,
                        url: secondaryConnection.url,
                    };
                } else {
                    secondaryConnectionDetails = { id: secondaryConnectionId };
                }
            }

            // Send tool context immediately (don't wait for did-finish-load)
            // The preload script will receive this before the tool code runs
            const toolContext = {
                toolId: tool.id,
                instanceId,
                toolName: tool.name,
                version: tool.version,
                connectionUrl: connectionUrl,
                connectionId: primaryConnectionId,
                secondaryConnectionUrl: secondaryConnectionUrl,
                secondaryConnectionId: secondaryConnectionId,
            };
            toolView.webContents.send("toolbox:context", toolContext);
            logInfo(`[ToolWindowManager] Sent tool context for ${instanceId} with connection: ${connectionUrl ? "yes" : "no"}, secondary: ${secondaryConnectionUrl ? "yes" : "no"}`);

            // Store connection info for this instance so IPC handlers can use it
            this.toolConnectionInfo.set(instanceId, {
                primaryConnectionId: primaryConnectionId,
                secondaryConnectionId: secondaryConnectionId,
            });

            // Show this tool instance
            await this.switchToTool(instanceId);

            // Track tool usage for analytics (async, don't wait for completion)
            this.toolManager.trackToolUsage(toolId).catch((error) => {
                captureMessage(`[ToolWindowManager] Failed to track tool usage asynchronously: ${(error as Error).message}`, "error", {
                    extra: { error },
                });
            });

            // Add to recently used tools list
            this.settingsManager.addLastUsedTool({
                toolId,
                primaryConnection: primaryConnectionDetails,
                secondaryConnection: secondaryConnectionDetails,
            });

            logInfo(`[ToolWindowManager] Tool instance launched successfully: ${instanceId}`);
            return true;
        } catch (error) {
            captureMessage(`[ToolWindowManager] Error launching tool instance ${instanceId}: ${(error as Error).message}`, "error", {
                extra: { error },
            });

            return false;
        }
    }

    /**
     * Switch to a different tool (show its BrowserView)
     * @param instanceId The instance identifier to switch to
     */
    async switchToTool(instanceId: string): Promise<boolean> {
        try {
            const toolView = this.toolViews.get(instanceId);
            if (!toolView) {
                captureMessage(`[ToolWindowManager] Tool instance not found: ${instanceId}`, "error");
                return false;
            }

            // Hide current tool if any
            if (this.activeToolId && this.activeToolId !== instanceId) {
                const currentView = this.toolViews.get(this.activeToolId);
                if (currentView && this.mainWindow.getBrowserView() === currentView) {
                    // Don't remove, just hide by setting another view
                }
            }

            // Show the new tool instance
            this.mainWindow.setBrowserView(toolView);
            // Enable auto-resize for robust behavior on window changes
            try {
                (toolView as any).setAutoResize?.({ width: true, height: true });
            } catch (err) {
                captureMessage(`[ToolWindowManager] Error enabling auto-resize for tool view ${instanceId}: ${err}`, "warning");
            }
            this.activeToolId = instanceId;
            this.invokeActiveToolChangedCallback();

            logInfo(`[ToolWindowManager] Switched to tool instance: ${instanceId}, requesting bounds...`);

            // Request bounds update from renderer
            this.scheduleBoundsUpdate();

            return true;
        } catch (error) {
            captureMessage(`[ToolWindowManager] Error switching to tool instance ${instanceId}: ${(error as Error).message}`, "error", {
                extra: { error },
            });
            return false;
        }
    }

    /**
     * Close a tool (destroy its BrowserView)
     * @param instanceId The instance identifier to close
     */
    async closeTool(instanceId: string): Promise<boolean> {
        try {
            const toolView = this.toolViews.get(instanceId);
            if (!toolView) {
                return false;
            }

            // If this is the active tool instance, clear it from window
            if (this.activeToolId === instanceId) {
                this.mainWindow.setBrowserView(null);
                this.activeToolId = null;
                this.invokeActiveToolChangedCallback();
            }

            // Destroy the BrowserView's web contents
            if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                // @ts-expect-error - destroy method exists but might not be in types
                toolView.webContents.destroy();
            }

            // Remove from maps - also clean up connection info
            this.toolViews.delete(instanceId);
            this.toolConnectionInfo.delete(instanceId);

            // Dispose any terminals created by this tool instance
            this.terminalManager.closeToolInstanceTerminals(instanceId);

            // Revoke filesystem access for this specific tool instance
            this.toolFilesystemAccessManager.revokeAllAccess(instanceId);

            logInfo(`[ToolWindowManager] Tool instance closed: ${instanceId}`);
            return true;
        } catch (error) {
            captureMessage(`[ToolWindowManager] Error closing tool instance ${instanceId}: ${(error as Error).message}`, "error", {
                extra: { error },
            });

            return false;
        }
    }

    /**
     * Get the primary connectionId for a tool instance by its WebContents
     * This is used by IPC handlers to determine which connection to use
     * @param webContentsId The ID of the WebContents making the request
     * @returns The connectionId or null if not found
     */
    getConnectionIdByWebContents(webContentsId: number): string | null {
        // Find the instance that owns this WebContents
        for (const [instanceId, toolView] of this.toolViews.entries()) {
            if (toolView.webContents.id === webContentsId) {
                const connectionInfo = this.toolConnectionInfo.get(instanceId);
                return connectionInfo?.primaryConnectionId || null;
            }
        }
        return null;
    }

    /**
     * Get the secondary connectionId for a tool instance by its WebContents
     * This is used by multi-connection tools
     * @param webContentsId The ID of the WebContents making the request
     * @returns The secondary connectionId or null if not found
     */
    getSecondaryConnectionIdByWebContents(webContentsId: number): string | null {
        // Find the instance that owns this WebContents
        for (const [instanceId, toolView] of this.toolViews.entries()) {
            if (toolView.webContents.id === webContentsId) {
                const connectionInfo = this.toolConnectionInfo.get(instanceId);
                return connectionInfo?.secondaryConnectionId || null;
            }
        }
        return null;
    }

    /**
     * Get the instanceId for a tool instance by its WebContents
     * This is used for per-instance operations like filesystem access control
     * @param webContentsId The ID of the WebContents making the request
     * @returns The instanceId or null if not found (null means it's from main window, not a tool)
     */
    getInstanceIdByWebContents(webContentsId: number): string | null {
        // Find the instance that owns this WebContents
        for (const [instanceId, toolView] of this.toolViews.entries()) {
            if (toolView.webContents.id === webContentsId) {
                return instanceId;
            }
        }
        // Not a tool window - likely the main window
        return null;
    }

    /**
     * Get the toolId for a tool instance by its WebContents
     * This is used for tool-scoped operations
     * @param webContentsId The ID of the WebContents making the request
     * @returns The toolId or null if not found (null means it's from main window, not a tool)
     */
    getToolIdByWebContents(webContentsId: number): string | null {
        const instanceId = this.getInstanceIdByWebContents(webContentsId);
        if (!instanceId) {
            return null;
        }
        // Extract toolId from instanceId (format: toolId-timestamp-random)
        return instanceId.split("-").slice(0, -2).join("-");
    }

    /**
     * Update the bounds of the active tool view to match the tool panel area
     * Bounds are calculated dynamically based on actual DOM element positions
     */
    private scheduleBoundsUpdate(): void {
        if (this.frameScheduled) return;
        this.frameScheduled = true;
        setTimeout(() => {
            this.frameScheduled = false;
            this.updateToolViewBounds();
        }, 16);
    }

    private updateToolViewBounds(): void {
        if (!this.activeToolId || this.boundsUpdatePending) return;
        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView) return;

        try {
            this.boundsUpdatePending = true;
            this.mainWindow.webContents.send("get-tool-panel-bounds-request");
            // Fallback: apply safe content bounds if renderer doesn't respond quickly
            const fallbackTimer = setTimeout(() => {
                try {
                    const content = this.mainWindow.getContentBounds();
                    const safeBounds = {
                        x: 0,
                        y: 0,
                        width: Math.max(1, content.width),
                        height: Math.max(1, content.height),
                    };
                    // Clamp again via apply for consistency
                    this.applyToolViewBounds(safeBounds);
                    // Encourage tool content to reflow
                    toolView.webContents.executeJavaScript("try{window.dispatchEvent(new Event('resize'));}catch(e){}", true).catch(() => {});
                } catch (err) {
                    captureMessage("[ToolWindowManager] Error in fallback bounds update:", "error", { extra: { err } });
                } finally {
                    this.boundsUpdatePending = false;
                }
            }, 300);

            // Cancel fallback if we receive the proper bounds
            (ipcMain as any).once?.("get-tool-panel-bounds-response", () => {
                clearTimeout(fallbackTimer);
            });
        } catch (error) {
            this.boundsUpdatePending = false;
        }
    }

    /**
     * Apply the bounds to the active tool view
     */
    private applyToolViewBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        if (!this.activeToolId) return;

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView) return;

        try {
            // Clamp to window content to avoid out-of-bounds
            const content = this.mainWindow.getContentBounds();
            const clamped = {
                x: Math.max(0, Math.min(bounds.x, content.width - 1)),
                y: Math.max(0, Math.min(bounds.y, content.height - 1)),
                width: Math.max(1, Math.min(bounds.width, Math.max(1, content.width - Math.max(0, bounds.x)))),
                height: Math.max(1, Math.min(bounds.height, Math.max(1, content.height - Math.max(0, bounds.y)))),
            };
            toolView.setBounds(clamped);
            this.boundsUpdatePending = false;
        } catch (error) {
            captureMessage("[ToolWindowManager] Error applying tool view bounds:", "error", { extra: { error } });
        }
    }

    /**
     * Send tool context to a tool via IPC
     */
    private async sendToolContext(toolId: string, tool: Tool): Promise<void> {
        const toolView = this.toolViews.get(toolId);
        if (!toolView) return;

        try {
            // Get active connection (this will be available via IPC call in the tool)
            // We just send basic tool info, tools can query connection via API
            const toolContext = {
                toolId: tool.id,
                toolName: tool.name,
                version: tool.version,
            };

            // Send to tool via IPC
            toolView.webContents.send("toolbox:context", toolContext);
        } catch (error) {
            captureMessage(`[ToolWindowManager] Error sending context to tool ${toolId}: ${(error as Error).message}`, "error", {
                extra: { error },
            });
        }
    }

    /**
     * Update tool connection context
     * Sends updated connection information to a specific tool instance
     */
    async updateToolConnection(instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null): Promise<void> {
        const toolView = this.toolViews.get(instanceId);
        if (!toolView || toolView.webContents.isDestroyed()) {
            captureMessage(`[ToolWindowManager] Tool instance ${instanceId} not found or destroyed`, "warning");
            return;
        }

        // Update stored connection info
        const connectionInfo = this.toolConnectionInfo.get(instanceId);
        if (connectionInfo) {
            connectionInfo.primaryConnectionId = primaryConnectionId;
            if (secondaryConnectionId !== undefined) {
                connectionInfo.secondaryConnectionId = secondaryConnectionId;
            }
        } else {
            this.toolConnectionInfo.set(instanceId, {
                primaryConnectionId,
                secondaryConnectionId: secondaryConnectionId || null,
            });
        }

        // Get connection URLs
        let connectionUrl: string | null = null;
        let secondaryConnectionUrl: string | null = null;

        if (primaryConnectionId) {
            const connection = this.connectionsManager.getConnectionById(primaryConnectionId);
            if (connection) {
                connectionUrl = connection.url;
            }
        }

        if (secondaryConnectionId) {
            const connection = this.connectionsManager.getConnectionById(secondaryConnectionId);
            if (connection) {
                secondaryConnectionUrl = connection.url;
            }
        }

        // Send updated context to the tool FIRST before any events
        // This ensures the context is updated before any event handlers run
        const updatedContext = {
            connectionUrl,
            connectionId: primaryConnectionId,
            secondaryConnectionUrl,
            secondaryConnectionId,
        };

        toolView.webContents.send("toolbox:context", updatedContext);

        // Emit connection:updated event to the tool AFTER context is updated
        // This allows the tool's event handler to call getActiveConnection() and get the updated connection
        const eventPayload = {
            event: ToolBoxEvent.CONNECTION_UPDATED,
            data: { id: primaryConnectionId },
            timestamp: new Date().toISOString(),
        };
        toolView.webContents.send(EVENT_CHANNELS.TOOLBOX_EVENT, eventPayload);

        logInfo(`[ToolWindowManager] Updated connection for tool instance ${instanceId}: primaryConnectionId=${primaryConnectionId}, secondaryConnectionId=${secondaryConnectionId}`);
    }

    /**
     * Cleanup all tool views
     */
    destroy(): void {
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.LAUNCH);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.SWITCH);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.CLOSE);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.GET_ACTIVE);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.GET_OPEN_TOOLS);
        ipcMain.removeHandler(TOOL_WINDOW_CHANNELS.UPDATE_TOOL_CONNECTION);

        if (this.boundsResponseListener) ipcMain.removeListener("get-tool-panel-bounds-response", this.boundsResponseListener);
        if (this.terminalVisibilityListener) ipcMain.removeListener("terminal-visibility-changed", this.terminalVisibilityListener);
        if (this.sidebarLayoutListener) ipcMain.removeListener("sidebar-layout-changed", this.sidebarLayoutListener);

        if (this.refreshBoundsListener) {
            this.mainWindow.removeListener("resize", this.refreshBoundsListener);
            this.mainWindow.removeListener("move", this.refreshBoundsListener);
            this.mainWindow.removeListener("maximize", this.refreshBoundsListener);
            this.mainWindow.removeListener("unmaximize", this.refreshBoundsListener);
            this.mainWindow.removeListener("enter-full-screen", this.refreshBoundsListener);
            this.mainWindow.removeListener("leave-full-screen", this.refreshBoundsListener);
        }

        if (this.focusListener) {
            this.mainWindow.removeListener("focus", this.focusListener);
        }
        if (this.showListener) {
            this.mainWindow.removeListener("show", this.showListener);
        }

        for (const [toolId, toolView] of this.toolViews) {
            try {
                if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                    // @ts-expect-error - destroy method exists but might not be in types
                    toolView.webContents.destroy();
                }
            } catch (error) {
                captureMessage(`[ToolWindowManager] Error destroying tool view ${toolId}: ${(error as Error).message}`, "error", {
                    extra: { error },
                });
            }
        }
        this.toolViews.clear();
        this.toolConnectionInfo.clear();
        this.activeToolId = null;
    }

    /**
     * Forward an event to all open tool windows
     */
    forwardEventToTools(eventPayload: any): void {
        for (const [toolId, toolView] of this.toolViews) {
            try {
                if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                    toolView.webContents.send(EVENT_CHANNELS.TOOLBOX_EVENT, eventPayload);
                }
            } catch (error) {
                captureMessage(`[ToolWindowManager] Error forwarding event to tool ${toolId}: ${(error as Error).message}`, "error", {
                    extra: { error },
                });
            }
        }
    }

    /**
     * Get connection ID for a tool (from settings)
     */
    getToolConnectionId(toolId: string): string | null {
        return this.settingsManager.getToolConnection(toolId);
    }

    /**
     * Open DevTools for the active tool BrowserView
     * Returns true if DevTools were opened, false if no active tool
     */
    openDevToolsForActiveTool(): boolean {
        if (!this.activeToolId) {
            captureMessage("[ToolWindowManager] No active tool to open DevTools for", "warning");
            return false;
        }

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView || !toolView.webContents || toolView.webContents.isDestroyed()) {
            captureMessage(`[ToolWindowManager] Tool view not found or destroyed: ${this.activeToolId}`, "warning");
            return false;
        }

        try {
            toolView.webContents.openDevTools();
            logInfo(`[ToolWindowManager] Opened DevTools for tool: ${this.activeToolId}`);
            return true;
        } catch (error) {
            captureMessage(`[ToolWindowManager] Error opening DevTools for tool ${this.activeToolId}: ${error}`, "error");
            return false;
        }
    }

    /**
     * Set a callback to be invoked when the active tool changes
     * @param callback Function to call with the new active tool ID (null if no tool is active). Pass null/undefined to clear the callback.
     */
    setOnActiveToolChanged(callback: ((activeToolId: string | null) => void) | null | undefined): void {
        if (callback !== null && callback !== undefined && typeof callback !== "function") {
            captureMessage("[ToolWindowManager] setOnActiveToolChanged called with non-function callback", "warning");
            return;
        }

        this.onActiveToolChanged = callback ?? null;
    }

    /**
     * Invoke the active tool changed callback
     */
    private invokeActiveToolChangedCallback(): void {
        if (this.onActiveToolChanged) {
            this.onActiveToolChanged(this.activeToolId);
        }
    }

    /**
     * Get the active tool ID
     */
    getActiveToolId(): string | null {
        return this.activeToolId;
    }

    /**
     * Get the bounds of the active tool's BrowserView
     * @returns The bounds of the active tool's BrowserView, or null if no tool is active
     */
    getActiveToolBounds(): { x: number; y: number; width: number; height: number } | null {
        if (!this.activeToolId) {
            return null;
        }

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView) {
            return null;
        }

        try {
            return toolView.getBounds();
        } catch (error) {
            // Normalize error and capture with full context
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            captureException(normalizedError, {
                tags: {
                    component: "ToolWindowManager",
                    method: "getActiveToolBounds",
                },
                extra: {
                    activeToolId: this.activeToolId,
                    errorMessage: normalizedError.message,
                },
            });
            return null;
        }
    }

    /**
     * Get the active tool's repository URL
     * @returns The repository URL of the currently active tool, or null if no tool is active or no repository is defined
     */
    getActiveToolRepositoryUrl(): string | null {
        if (!this.activeToolId) {
            return null;
        }

        // Extract toolId from instanceId (format: toolId-timestamp-random)
        const toolId = this.activeToolId.split("-").slice(0, -2).join("-");
        const tool = this.toolManager.getTool(toolId);

        return tool?.repository || null;
    }
}
