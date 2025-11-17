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

        // Update tool window bounds when parent window resizes
        this.mainWindow.on("resize", () => {
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

            // Show this tool
            await this.switchToTool(toolId);

            // Send tool context to the tool after it loads
            toolView.webContents.once("did-finish-load", () => {
                this.sendToolContext(toolId, tool);
            });

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
            this.updateToolViewBounds();

            this.activeToolId = toolId;

            console.log(`[ToolWindowManager] Switched to tool: ${toolId}`);
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
                // @ts-ignore - destroy method exists but might not be in types
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
     */
    private updateToolViewBounds(): void {
        if (!this.activeToolId) return;

        const toolView = this.toolViews.get(this.activeToolId);
        if (!toolView) return;

        const bounds = this.mainWindow.getBounds();
        
        // Calculate tool panel area (this should match your UI layout)
        // Adjust these values based on your actual layout:
        // - Subtract top bar height (e.g., 50px for header)
        // - Subtract left sidebar width (e.g., 200px for sidebar)
        const toolPanelBounds = {
            x: 200, // Left sidebar width
            y: 50,  // Top bar height
            width: bounds.width - 200,  // Remaining width
            height: bounds.height - 50, // Remaining height
        };

        toolView.setBounds(toolPanelBounds);
    }

    /**
     * Send tool context to a tool via IPC
     */
    private async sendToolContext(toolId: string, tool: Tool): Promise<void> {
        const toolView = this.toolViews.get(toolId);
        if (!toolView) return;

        try {
            // Get tool context (this should come from your context provider)
            const toolContext = {
                toolId: tool.id,
                toolName: tool.name,
                version: tool.version,
                // Add connection info, etc.
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
                    // @ts-ignore - destroy method exists but might not be in types
                    toolView.webContents.destroy();
                }
            } catch (error) {
                console.error(`[ToolWindowManager] Error destroying tool view ${toolId}:`, error);
            }
        }
        this.toolViews.clear();
        this.activeToolId = null;
    }
}
