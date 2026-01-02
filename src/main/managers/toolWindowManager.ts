import { BrowserView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { EVENT_CHANNELS, TOOL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { Tool } from "../../common/types";
import { ToolBoxEvent } from "../../common/types/events";
import { BrowserviewProtocolManager } from "./browserviewProtocolManager";
import { ConnectionsManager } from "./connectionsManager";
import { SettingsManager } from "./settingsManager";
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

    constructor(mainWindow: BrowserWindow, browserviewProtocolManager: BrowserviewProtocolManager, connectionsManager: ConnectionsManager, settingsManager: SettingsManager, toolManager: ToolManager) {
        this.mainWindow = mainWindow;
        this.browserviewProtocolManager = browserviewProtocolManager;
        this.connectionsManager = connectionsManager;
        this.settingsManager = settingsManager;
        this.toolManager = toolManager;
        this.setupIpcHandlers();
    }

    /**
     * Setup IPC handlers for tool window management
     */
    private setupIpcHandlers(): void {
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
        ipcMain.on("get-tool-panel-bounds-response", (event, bounds) => {
            if (bounds && bounds.width > 0 && bounds.height > 0) {
                this.applyToolViewBounds(bounds);
            } else {
                this.boundsUpdatePending = false;
            }
        });

        // Update tool window bounds on common window state changes
        const refresh = () => this.scheduleBoundsUpdate();
        this.mainWindow.on("resize", refresh);
        this.mainWindow.on("move", refresh);
        this.mainWindow.on("maximize", refresh);
        this.mainWindow.on("unmaximize", refresh);
        this.mainWindow.on("enter-full-screen", refresh);
        this.mainWindow.on("leave-full-screen", refresh);
        // macOS app switching restores correct render; emulate by refreshing on focus/show
        this.mainWindow.on("focus", () => {
            // Immediate refresh, plus a small follow-up to catch post-focus layout
            refresh();
            setTimeout(() => refresh(), 120);
        });
        this.mainWindow.on("show", () => {
            refresh();
            setTimeout(() => refresh(), 120);
        });

        // Handle terminal panel visibility changes
        // When terminal is shown/hidden, we need to adjust BrowserView bounds
        ipcMain.on("terminal-visibility-changed", () => {
            this.scheduleBoundsUpdate();
        });
        ipcMain.on("sidebar-layout-changed", () => {
            // Sidebar animations can change bounds over a short period.
            // Burst a couple of requests to capture final geometry.
            this.scheduleBoundsUpdate();
            setTimeout(() => this.scheduleBoundsUpdate(), 120);
        });

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
            console.log(`[ToolWindowManager] Launching tool instance: ${instanceId}`);

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
            console.log(`[ToolWindowManager] Loading tool from: ${toolUrl}`);

            // Load the tool
            await toolView.webContents.loadURL(toolUrl);

            // Store the view with instanceId as key
            this.toolViews.set(instanceId, toolView);

            // Get connection information for this tool instance
            // Connections are passed from frontend (per-instance), not retrieved from settings
            let connectionUrl: string | null = null;
            let secondaryConnectionUrl: string | null = null;

            if (primaryConnectionId) {
                // Get the actual connection object to retrieve the URL
                const connection = this.connectionsManager.getConnectionById(primaryConnectionId);
                if (connection) {
                    connectionUrl = connection.url;
                }
            }

            // Check if tool has a secondary connection (for multi-connection tools)
            if (secondaryConnectionId) {
                const secondaryConnection = this.connectionsManager.getConnectionById(secondaryConnectionId);
                if (secondaryConnection) {
                    secondaryConnectionUrl = secondaryConnection.url;
                }
            }

            // Send tool context immediately (don't wait for did-finish-load)
            // The preload script will receive this before the tool code runs
            const toolContext = {
                toolId: tool.id,
                toolName: tool.name,
                version: tool.version,
                connectionUrl: connectionUrl,
                connectionId: primaryConnectionId,
                secondaryConnectionUrl: secondaryConnectionUrl,
                secondaryConnectionId: secondaryConnectionId,
            };
            toolView.webContents.send("toolbox:context", toolContext);
            console.log(`[ToolWindowManager] Sent tool context for ${instanceId} with connection:`, connectionUrl ? "yes" : "no", "secondary:", secondaryConnectionUrl ? "yes" : "no");

            // Store connection info for this instance so IPC handlers can use it
            this.toolConnectionInfo.set(instanceId, {
                primaryConnectionId: primaryConnectionId,
                secondaryConnectionId: secondaryConnectionId,
            });

            // Show this tool instance
            await this.switchToTool(instanceId);

            // Track tool usage for analytics (async, don't wait for completion)
            this.toolManager.trackToolUsage(toolId).catch((error) => {
                console.error(`[ToolWindowManager] Failed to track tool usage asynchronously:`, error);
            });

            console.log(`[ToolWindowManager] Tool instance launched successfully: ${instanceId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error launching tool instance ${instanceId}:`, error);
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
                console.error(`[ToolWindowManager] Tool instance not found: ${instanceId}`);
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
                console.log(err);
            }
            this.activeToolId = instanceId;

            console.log(`[ToolWindowManager] Switched to tool instance: ${instanceId}, requesting bounds...`);

            // Request bounds update from renderer
            this.scheduleBoundsUpdate();

            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error switching to tool instance ${instanceId}:`, error);
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
            }

            // Destroy the BrowserView's web contents
            if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                // @ts-expect-error - destroy method exists but might not be in types
                toolView.webContents.destroy();
            }

            // Remove from maps - also clean up connection info
            this.toolViews.delete(instanceId);
            this.toolConnectionInfo.delete(instanceId);

            console.log(`[ToolWindowManager] Tool instance closed: ${instanceId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error closing tool instance ${instanceId}:`, error);
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
                    console.error("[ToolWindowManager] Error in fallback bounds update:", err);
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
            console.error("[ToolWindowManager] Error applying tool view bounds:", error);
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
            console.error(`[ToolWindowManager] Error sending context to tool ${toolId}:`, error);
        }
    }

    /**
     * Update tool connection context
     * Sends updated connection information to a specific tool instance
     */
    async updateToolConnection(instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null): Promise<void> {
        const toolView = this.toolViews.get(instanceId);
        if (!toolView || toolView.webContents.isDestroyed()) {
            console.warn(`[ToolWindowManager] Tool instance ${instanceId} not found or destroyed`);
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

        console.log(`[ToolWindowManager] Updated connection for tool instance ${instanceId}:`, { primaryConnectionId, secondaryConnectionId });
    }

    /**
     * Cleanup all tool views
     */
    destroy(): void {
        for (const [toolId, toolView] of this.toolViews) {
            try {
                if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                    // @ts-expect-error - destroy method exists but might not be in types
                    toolView.webContents.destroy();
                }
            } catch (error) {
                console.error(`[ToolWindowManager] Error destroying tool view ${toolId}:`, error);
            }
        }
        this.toolViews.clear();
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
                console.error(`[ToolWindowManager] Error forwarding event to tool ${toolId}:`, error);
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
            console.warn("[ToolWindowManager] No active tool to open DevTools for");
            return false;
        }

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView || !toolView.webContents || toolView.webContents.isDestroyed()) {
            console.warn(`[ToolWindowManager] Tool view not found or destroyed: ${this.activeToolId}`);
            return false;
        }

        try {
            toolView.webContents.openDevTools();
            console.log(`[ToolWindowManager] Opened DevTools for tool: ${this.activeToolId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error opening DevTools for tool ${this.activeToolId}:`, error);
            return false;
        }
    }

    /**
     * Get the active tool ID
     */
    getActiveToolId(): string | null {
        return this.activeToolId;
    }
}
