import { BrowserView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { EVENT_CHANNELS, TOOL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { Tool } from "../../common/types";
import { BrowserviewProtocolManager } from "./browserviewProtocolManager";
import { ConnectionsManager } from "./connectionsManager";
import { SettingsManager } from "./settingsManager";

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
    private toolViews: Map<string, BrowserView> = new Map(); // Maps instanceId -> BrowserView
    private toolConnectionInfo: Map<string, { primaryConnectionId: string | null; secondaryConnectionId: string | null }> = new Map(); // Maps instanceId -> connection info
    private activeToolId: string | null = null; // Stores instanceId (not toolId)
    private boundsUpdatePending: boolean = false;
    private frameScheduled = false;

    constructor(mainWindow: BrowserWindow, browserviewProtocolManager: BrowserviewProtocolManager, connectionsManager: ConnectionsManager, settingsManager: SettingsManager) {
        this.mainWindow = mainWindow;
        this.browserviewProtocolManager = browserviewProtocolManager;
        this.connectionsManager = connectionsManager;
        this.settingsManager = settingsManager;
        this.setupIpcHandlers();
    }

    /**
     * Setup IPC handlers for tool window management
     */
    private setupIpcHandlers(): void {
        // Launch tool (create BrowserView and load tool)
        // Now accepts instanceId instead of toolId
        ipcMain.handle(TOOL_WINDOW_CHANNELS.LAUNCH, async (event, instanceId: string, tool: Tool) => {
            return this.launchTool(instanceId, tool);
        });

        // Switch to a different tool
        ipcMain.handle(TOOL_WINDOW_CHANNELS.SWITCH, async (event, instanceId: string) => {
            return this.switchToTool(instanceId);
        });

        // Close a tool
        ipcMain.handle(TOOL_WINDOW_CHANNELS.CLOSE, async (event, instanceId: string) => {
            return this.closeTool(instanceId);
        });

        // Get active tool ID (now returns instanceId)
        ipcMain.handle(TOOL_WINDOW_CHANNELS.GET_ACTIVE, async () => {
            return this.activeToolId;
        });

        // Get all open tool IDs (now returns instanceIds)
        ipcMain.handle(TOOL_WINDOW_CHANNELS.GET_OPEN_TOOLS, async () => {
            return Array.from(this.toolViews.keys());
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
     * @param instanceId Unique instance identifier (e.g., "toolId-timestamp-random")
     * @param tool Tool metadata
     */
    async launchTool(instanceId: string, tool: Tool): Promise<boolean> {
        try {
            console.log(`[ToolWindowManager] Launching tool instance: ${instanceId}`);

            // Extract actual toolId from instanceId (format: toolId-timestamp-random)
            const toolId = instanceId.split('-').slice(0, -2).join('-');

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
            // Note: Connections are per-instance, but settings store per-toolId
            // This is a limitation we're accepting for now
            const toolConnectionId = this.settingsManager.getToolConnection(toolId);
            let connectionUrl: string | null = null;
            let connectionId: string | null = null;
            let secondaryConnectionUrl: string | null = null;
            let secondaryConnectionId: string | null = null;
            
            if (toolConnectionId) {
                // Tool has a specific connection assigned
                const connection = this.connectionsManager.getConnectionById(toolConnectionId);
                if (connection) {
                    connectionUrl = connection.url;
                    connectionId = toolConnectionId;
                }
            } else {
                // Fall back to global active connection
                const activeConnection = this.connectionsManager.getActiveConnection();
                if (activeConnection) {
                    connectionUrl = activeConnection.url;
                    connectionId = activeConnection.id;
                }
            }

            // Check if tool has a secondary connection (for multi-connection tools)
            const secondaryToolConnectionId = this.settingsManager.getToolSecondaryConnection(toolId);
            if (secondaryToolConnectionId) {
                const secondaryConnection = this.connectionsManager.getConnectionById(secondaryToolConnectionId);
                if (secondaryConnection) {
                    secondaryConnectionUrl = secondaryConnection.url;
                    secondaryConnectionId = secondaryToolConnectionId;
                }
            }

            // Send tool context immediately (don't wait for did-finish-load)
            // The preload script will receive this before the tool code runs
            const toolContext = {
                toolId: tool.id,
                toolName: tool.name,
                version: tool.version,
                connectionUrl: connectionUrl,
                connectionId: connectionId,
                secondaryConnectionUrl: secondaryConnectionUrl,
                secondaryConnectionId: secondaryConnectionId,
            };
            toolView.webContents.send("toolbox:context", toolContext);
            console.log(`[ToolWindowManager] Sent tool context for ${instanceId} with connection:`, connectionUrl ? "yes" : "no", "secondary:", secondaryConnectionUrl ? "yes" : "no");

            // Store connection info for this instance so IPC handlers can use it
            this.toolConnectionInfo.set(instanceId, {
                primaryConnectionId: connectionId,
                secondaryConnectionId: secondaryConnectionId,
            });

            // Show this tool instance
            await this.switchToTool(instanceId);

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

            // Remove from map
            this.toolViews.delete(instanceId);

            console.log(`[ToolWindowManager] Tool instance closed: ${instanceId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error closing tool instance ${instanceId}:`, error);
            return false;
        }
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
     * Update connection context for a specific tool
     * Called when a tool's connection is changed
     */
    async updateToolConnection(toolId: string, connectionId: string | null): Promise<void> {
        const toolView = this.toolViews.get(toolId);
        if (!toolView || toolView.webContents.isDestroyed()) {
            return;
        }

        let connectionUrl: string | null = null;
        
        if (connectionId) {
            const connection = this.connectionsManager.getConnectionById(connectionId);
            if (connection) {
                connectionUrl = connection.url;
            }
        }

        // Send updated connection context to the tool
        toolView.webContents.send("toolbox:connection-changed", {
            connectionUrl: connectionUrl,
            connectionId: connectionId,
        });
        
        console.log(`[ToolWindowManager] Updated connection for tool ${toolId}:`, connectionUrl ? "connected" : "disconnected");
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
