import { BrowserView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { Tool } from "../../types";
import { WebviewProtocolManager } from "./webviewProtocolManager";

/**
 * ToolWindowManager
 * 
 * Manages BrowserView instances for each tool, providing true process isolation
 * and independent webPreferences per tool. Similar to VS Code's extension host.
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
    private webviewProtocolManager: WebviewProtocolManager;
    private toolViews: Map<string, BrowserView> = new Map();
    private activeToolId: string | null = null;
    private boundsUpdatePending: boolean = false;

    constructor(mainWindow: BrowserWindow, webviewProtocolManager: WebviewProtocolManager) {
        this.mainWindow = mainWindow;
        this.webviewProtocolManager = webviewProtocolManager;
        this.setupIpcHandlers();
    }

    /**
     * Setup IPC handlers for tool window management
     */
    private setupIpcHandlers(): void {
        // Launch tool (create BrowserView and load tool)
        ipcMain.handle("tool-window:launch", async (event, toolId: string, tool: Tool) => {
            return this.launchTool(toolId, tool);
        });

        // Switch to a different tool
        ipcMain.handle("tool-window:switch", async (event, toolId: string) => {
            return this.switchToTool(toolId);
        });

        // Close a tool
        ipcMain.handle("tool-window:close", async (event, toolId: string) => {
            return this.closeTool(toolId);
        });

        // Get active tool ID
        ipcMain.handle("tool-window:get-active", async () => {
            return this.activeToolId;
        });

        // Get all open tool IDs
        ipcMain.handle("tool-window:get-open-tools", async () => {
            return Array.from(this.toolViews.keys());
        });

        // Handle tool panel bounds response from renderer
        ipcMain.on("get-tool-panel-bounds-response", (event, bounds) => {
            if (bounds && bounds.width > 0 && bounds.height > 0) {
                console.log("[ToolWindowManager] Received bounds from renderer:", bounds);
                this.applyToolViewBounds(bounds);
            } else {
                console.warn("[ToolWindowManager] Invalid bounds received:", bounds);
                this.boundsUpdatePending = false;
            }
        });

        // Update tool window bounds when parent window resizes
        this.mainWindow.on("resize", () => {
            this.updateToolViewBounds();
        });
        
        // Handle terminal panel visibility changes
        // When terminal is shown/hidden, we need to adjust BrowserView bounds
        ipcMain.on("terminal-visibility-changed", (event, isVisible: boolean) => {
            console.log("[ToolWindowManager] Terminal visibility changed:", isVisible);
            // Request updated bounds from renderer to account for terminal space
            this.updateToolViewBounds();
        });
    }

    /**
     * Launch a tool in a new BrowserView
     */
    async launchTool(toolId: string, tool: Tool): Promise<boolean> {
        try {
            console.log(`[ToolWindowManager] Launching tool: ${toolId}`);

            // If tool is already open, just switch to it
            if (this.toolViews.has(toolId)) {
                await this.switchToTool(toolId);
                return true;
            }

            // Create BrowserView for the tool
            const toolView = new BrowserView({
                webPreferences: {
                    preload: path.join(__dirname, "toolPreloadBridge.js"),
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                    // Disable web security to bypass CORS for external API calls
                    // CSP is still enforced via meta tags in tool HTML
                    webSecurity: false,
                    // Allow tools to load external resources
                    allowRunningInsecureContent: false,
                },
            });

            // Get tool URL from custom protocol
            const toolUrl = this.webviewProtocolManager.buildToolUrl(toolId);
            console.log(`[ToolWindowManager] Loading tool from: ${toolUrl}`);

            // Load the tool
            await toolView.webContents.loadURL(toolUrl);

            // Store the view
            this.toolViews.set(toolId, toolView);

            // Send tool context immediately (don't wait for did-finish-load)
            // The preload script will receive this before the tool code runs
            const toolContext = {
                toolId: tool.id,
                toolName: tool.name,
                version: tool.version,
            };
            toolView.webContents.send("toolbox:context", toolContext);
            console.log(`[ToolWindowManager] Sent tool context for ${toolId}`);

            // Show this tool
            await this.switchToTool(toolId);

            console.log(`[ToolWindowManager] Tool launched successfully: ${toolId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error launching tool ${toolId}:`, error);
            return false;
        }
    }

    /**
     * Switch to a different tool (show its BrowserView)
     */
    async switchToTool(toolId: string): Promise<boolean> {
        try {
            const toolView = this.toolViews.get(toolId);
            if (!toolView) {
                console.error(`[ToolWindowManager] Tool not found: ${toolId}`);
                return false;
            }

            // Hide current tool if any
            if (this.activeToolId && this.activeToolId !== toolId) {
                const currentView = this.toolViews.get(this.activeToolId);
                if (currentView && this.mainWindow.getBrowserView() === currentView) {
                    // Don't remove, just hide by setting another view
                }
            }

            // Show the new tool
            this.mainWindow.setBrowserView(toolView);
            this.activeToolId = toolId;

            console.log(`[ToolWindowManager] Switched to tool: ${toolId}, requesting bounds...`);
            
            // Request bounds update (with a small delay to ensure renderer is ready)
            setTimeout(() => {
                this.updateToolViewBounds();
            }, 100);

            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error switching to tool ${toolId}:`, error);
            return false;
        }
    }

    /**
     * Close a tool (destroy its BrowserView)
     */
    async closeTool(toolId: string): Promise<boolean> {
        try {
            const toolView = this.toolViews.get(toolId);
            if (!toolView) {
                return false;
            }

            // If this is the active tool, clear it from window
            if (this.activeToolId === toolId) {
                this.mainWindow.setBrowserView(null);
                this.activeToolId = null;
            }

            // Destroy the BrowserView's web contents
            if (toolView.webContents && !toolView.webContents.isDestroyed()) {
                // @ts-expect-error - destroy method exists but might not be in types
                toolView.webContents.destroy();
            }

            // Remove from map
            this.toolViews.delete(toolId);

            console.log(`[ToolWindowManager] Tool closed: ${toolId}`);
            return true;
        } catch (error) {
            console.error(`[ToolWindowManager] Error closing tool ${toolId}:`, error);
            return false;
        }
    }

    /**
     * Update the bounds of the active tool view to match the tool panel area
     * Bounds are calculated dynamically based on actual DOM element positions
     */
    private updateToolViewBounds(): void {
        if (!this.activeToolId || this.boundsUpdatePending) return;

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView) return;

        try {
            // Request bounds from renderer
            this.boundsUpdatePending = true;
            this.mainWindow.webContents.send("get-tool-panel-bounds-request");
            
            // Reset pending flag after timeout
            setTimeout(() => {
                this.boundsUpdatePending = false;
            }, 1000);
        } catch (error) {
            console.error("[ToolWindowManager] Error requesting tool view bounds:", error);
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
            console.log("[ToolWindowManager] Applying bounds to tool view:", bounds);
            toolView.setBounds(bounds);
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
                    toolView.webContents.send("toolbox-event", eventPayload);
                }
            } catch (error) {
                console.error(`[ToolWindowManager] Error forwarding event to tool ${toolId}:`, error);
            }
        }
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
