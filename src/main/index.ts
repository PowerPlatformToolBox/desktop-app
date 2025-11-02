import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import * as path from "path";
import { ToolBoxAPI } from "../api/toolboxAPI";
import { ToolBoxEvent } from "../types";
import { AuthManager } from "./managers/authManager";
import { AutoUpdateManager } from "./managers/autoUpdateManager";
import { ConnectionsManager } from "./managers/connectionsManager";
import { DataverseManager } from "./managers/dataverseManager";
import { SettingsManager } from "./managers/settingsManager";
import { TerminalManager } from "./managers/terminalManager";
import { ToolManager } from "./managers/toolsManager";

class ToolBoxApp {
    private mainWindow: BrowserWindow | null = null;
    private settingsManager: SettingsManager;
    private connectionsManager: ConnectionsManager;
    private toolManager: ToolManager;
    private api: ToolBoxAPI;
    private autoUpdateManager: AutoUpdateManager;
    private authManager: AuthManager;
    private terminalManager: TerminalManager;
    private dataverseManager: DataverseManager;

    constructor() {
        this.settingsManager = new SettingsManager();
        this.connectionsManager = new ConnectionsManager();
        this.api = new ToolBoxAPI();
        this.toolManager = new ToolManager(path.join(app.getPath("userData"), "tools"));
        this.autoUpdateManager = new AutoUpdateManager();
        this.authManager = new AuthManager();
        this.terminalManager = new TerminalManager();
        this.dataverseManager = new DataverseManager(this.connectionsManager, this.authManager);

        this.setupEventListeners();
        this.setupIpcHandlers();
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(): void {
        // Listen to tool manager events
        this.toolManager.on("tool:loaded", (tool) => {
            this.api.emitEvent(ToolBoxEvent.TOOL_LOADED, tool);
        });

        this.toolManager.on("tool:unloaded", (tool) => {
            this.api.emitEvent(ToolBoxEvent.TOOL_UNLOADED, tool);
        });

        // Forward ALL ToolBox events to renderer process
        const eventTypes = [
            ToolBoxEvent.TOOL_LOADED,
            ToolBoxEvent.TOOL_UNLOADED,
            ToolBoxEvent.CONNECTION_CREATED,
            ToolBoxEvent.CONNECTION_UPDATED,
            ToolBoxEvent.CONNECTION_DELETED,
            ToolBoxEvent.SETTINGS_UPDATED,
            ToolBoxEvent.NOTIFICATION_SHOWN,
            ToolBoxEvent.TERMINAL_CREATED,
            ToolBoxEvent.TERMINAL_CLOSED,
            ToolBoxEvent.TERMINAL_OUTPUT,
            ToolBoxEvent.TERMINAL_COMMAND_COMPLETED,
            ToolBoxEvent.TERMINAL_ERROR,
        ];

        eventTypes.forEach((eventType) => {
            this.api.on(eventType, (payload) => {
                if (this.mainWindow) {
                    this.mainWindow.webContents.send("toolbox-event", payload);
                }
            });
        });

        // Listen to terminal manager events
        this.terminalManager.on("terminal:created", (terminal) => {
            this.api.emitEvent(ToolBoxEvent.TERMINAL_CREATED, terminal);
        });

        this.terminalManager.on("terminal:closed", (data) => {
            this.api.emitEvent(ToolBoxEvent.TERMINAL_CLOSED, data);
        });

        this.terminalManager.on("terminal:output", (data) => {
            this.api.emitEvent(ToolBoxEvent.TERMINAL_OUTPUT, data);
        });

        this.terminalManager.on("terminal:command:completed", (result) => {
            this.api.emitEvent(ToolBoxEvent.TERMINAL_COMMAND_COMPLETED, result);
        });

        this.terminalManager.on("terminal:error", (data) => {
            this.api.emitEvent(ToolBoxEvent.TERMINAL_ERROR, data);
        });

        // Listen to auto-update events
        this.autoUpdateManager.on("update-available", (info) => {
            this.api.showNotification({
                title: "Update Available",
                body: `Version ${info.version} is available for download.`,
                type: "info",
            });
        });

        this.autoUpdateManager.on("update-downloaded", (info) => {
            this.api.showNotification({
                title: "Update Ready",
                body: `Version ${info.version} has been downloaded and will be installed on restart.`,
                type: "success",
            });
        });

        this.autoUpdateManager.on("update-error", (error) => {
            this.api.showNotification({
                title: "Update Error",
                body: `Failed to check for updates: ${error.message}`,
                type: "error",
            });
        });
    }

    /**
     * Set up IPC handlers for communication with renderer
     */
    private setupIpcHandlers(): void {
        // Settings handlers
        ipcMain.handle("get-user-settings", () => {
            return this.settingsManager.getUserSettings();
        });

        ipcMain.handle("update-user-settings", (_, settings) => {
            this.settingsManager.updateUserSettings(settings);
            this.api.emitEvent(ToolBoxEvent.SETTINGS_UPDATED, settings);
        });

        ipcMain.handle("get-setting", (_, key) => {
            return this.settingsManager.getSetting(key);
        });

        ipcMain.handle("set-setting", (_, key, value) => {
            this.settingsManager.setSetting(key, value);
        });

        // Connection handlers
        ipcMain.handle("add-connection", (_, connection) => {
            this.connectionsManager.addConnection(connection);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_CREATED, connection);
        });

        ipcMain.handle("update-connection", (_, id, updates) => {
            this.connectionsManager.updateConnection(id, updates);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, updates });
        });

        ipcMain.handle("delete-connection", (_, id) => {
            this.connectionsManager.deleteConnection(id);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_DELETED, { id });
        });

        ipcMain.handle("get-connections", () => {
            return this.connectionsManager.getConnections();
        });

        ipcMain.handle("set-active-connection", async (_, id) => {
            const connection = this.connectionsManager.getConnections().find((c) => c.id === id);
            if (!connection) {
                throw new Error("Connection not found");
            }

            // Authenticate based on the authentication type
            try {
                let authResult: { accessToken: string; refreshToken?: string; expiresOn: Date };

                switch (connection.authenticationType) {
                    case "interactive":
                        authResult = await this.authManager.authenticateInteractive(connection, this.mainWindow || undefined);
                        break;
                    case "clientSecret":
                        authResult = await this.authManager.authenticateClientSecret(connection);
                        break;
                    case "usernamePassword":
                        authResult = await this.authManager.authenticateUsernamePassword(connection);
                        break;
                    default:
                        throw new Error("Invalid authentication type");
                }

                // Set the connection as active with tokens
                this.connectionsManager.setActiveConnection(id, {
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    expiresOn: authResult.expiresOn,
                });

                this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, isActive: true });
            } catch (error) {
                throw new Error(`Authentication failed: ${(error as Error).message}`);
            }
        });

        // Test connection handler
        ipcMain.handle("test-connection", async (_, connection) => {
            try {
                await this.authManager.testConnection(connection, this.mainWindow || undefined);
                return { success: true };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        });

        ipcMain.handle("get-active-connection", () => {
            return this.connectionsManager.getActiveConnection();
        });

        ipcMain.handle("disconnect-connection", () => {
            this.connectionsManager.disconnectActiveConnection();
        });

        // Tool handlers
        ipcMain.handle("get-all-tools", () => {
            return this.toolManager.getAllTools();
        });

        ipcMain.handle("get-tool", (_, toolId) => {
            return this.toolManager.getTool(toolId);
        });

        ipcMain.handle("load-tool", async (_, packageName) => {
            return await this.toolManager.loadTool(packageName);
        });

        ipcMain.handle("unload-tool", (_, toolId) => {
            this.toolManager.unloadTool(toolId);
        });

        ipcMain.handle("install-tool", async (_, packageName) => {
            await this.toolManager.installTool(packageName);
            const tool = await this.toolManager.loadTool(packageName);
            this.settingsManager.addInstalledTool(packageName);
            return tool;
        });

        ipcMain.handle("uninstall-tool", async (_, packageName, toolId) => {
            this.toolManager.unloadTool(toolId);
            await this.toolManager.uninstallTool(packageName);
            this.settingsManager.removeInstalledTool(packageName);
        });

        ipcMain.handle("get-latest-tool-version", async (_, packageName) => {
            return await this.toolManager.getLatestVersion(packageName);
        });

        ipcMain.handle("update-tool", async (_, packageName) => {
            await this.toolManager.updateTool(packageName);
            const tool = await this.toolManager.loadTool(packageName);
            return tool;
        });

        ipcMain.handle("get-tool-webview-html", (_, packageName) => {
            return this.toolManager.getToolWebviewHtml(packageName);
        });

        ipcMain.handle("get-tool-context", (_, packageName, connectionUrl) => {
            return this.toolManager.getToolContext(packageName, connectionUrl);
        });

        // Tool settings handlers
        ipcMain.handle("get-tool-settings", (_, toolId) => {
            return this.settingsManager.getToolSettings(toolId);
        });

        ipcMain.handle("update-tool-settings", (_, toolId, settings) => {
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        // Context-aware tool settings handlers (for toolboxAPI)
        ipcMain.handle("tool-settings-get-all", (_, toolId) => {
            return this.settingsManager.getToolSettings(toolId) || {};
        });

        ipcMain.handle("tool-settings-get", (_, toolId, key) => {
            const settings = this.settingsManager.getToolSettings(toolId);
            return settings ? settings[key] : undefined;
        });

        ipcMain.handle("tool-settings-set", (_, toolId, key, value) => {
            const settings = this.settingsManager.getToolSettings(toolId) || {};
            settings[key] = value;
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        ipcMain.handle("tool-settings-set-all", (_, toolId, settings) => {
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        // Notification handler
        ipcMain.handle("show-notification", (_, options) => {
            this.api.showNotification(options);
        });

        // Clipboard handler
        ipcMain.handle("copy-to-clipboard", (_, text) => {
            this.api.copyToClipboard(text);
        });

        // Save file handler
        ipcMain.handle("save-file", async (_, defaultPath, content) => {
            return await this.api.saveFile(defaultPath, content);
        });

        // Get current theme handler
        ipcMain.handle("get-current-theme", () => {
            const settings = this.settingsManager.getUserSettings();
            return settings.theme || "system";
        });

        // Event history handler
        ipcMain.handle("get-event-history", (_, limit) => {
            return this.api.getEventHistory(limit);
        });

        // Open external URL handler
        ipcMain.handle("open-external", async (_, url) => {
            await shell.openExternal(url);
        });

        // Terminal handlers
        ipcMain.handle("create-terminal", async (_, toolId, options) => {
            return await this.terminalManager.createTerminal(toolId, options);
        });

        ipcMain.handle("execute-terminal-command", async (_, terminalId, command) => {
            return await this.terminalManager.executeCommand(terminalId, command);
        });

        ipcMain.handle("close-terminal", (_, terminalId) => {
            this.terminalManager.closeTerminal(terminalId);
        });

        ipcMain.handle("get-terminal", (_, terminalId) => {
            return this.terminalManager.getTerminal(terminalId);
        });

        ipcMain.handle("get-tool-terminals", (_, toolId) => {
            return this.terminalManager.getToolTerminals(toolId);
        });

        ipcMain.handle("get-all-terminals", () => {
            return this.terminalManager.getAllTerminals();
        });

        ipcMain.handle("set-terminal-visibility", (_, terminalId, visible) => {
            this.terminalManager.setTerminalVisibility(terminalId, visible);
        });

        // Auto-update handlers
        ipcMain.handle("check-for-updates", async () => {
            await this.autoUpdateManager.checkForUpdates();
        });

        ipcMain.handle("download-update", async () => {
            await this.autoUpdateManager.downloadUpdate();
        });

        ipcMain.handle("quit-and-install", () => {
            this.autoUpdateManager.quitAndInstall();
        });

        ipcMain.handle("get-app-version", () => {
            return this.autoUpdateManager.getCurrentVersion();
        });

        // Dataverse API handlers
        ipcMain.handle("dataverse.create", async (_, entityLogicalName: string, record: Record<string, unknown>) => {
            try {
                return await this.dataverseManager.create(entityLogicalName, record);
            } catch (error) {
                throw new Error(`Dataverse create failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.retrieve", async (_, entityLogicalName: string, id: string, columns?: string[]) => {
            try {
                return await this.dataverseManager.retrieve(entityLogicalName, id, columns);
            } catch (error) {
                throw new Error(`Dataverse retrieve failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.update", async (_, entityLogicalName: string, id: string, record: Record<string, unknown>) => {
            try {
                await this.dataverseManager.update(entityLogicalName, id, record);
                return { success: true };
            } catch (error) {
                throw new Error(`Dataverse update failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.delete", async (_, entityLogicalName: string, id: string) => {
            try {
                await this.dataverseManager.delete(entityLogicalName, id);
                return { success: true };
            } catch (error) {
                throw new Error(`Dataverse delete failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.retrieveMultiple", async (_, fetchXml: string) => {
            try {
                return await this.dataverseManager.retrieveMultiple(fetchXml);
            } catch (error) {
                throw new Error(`Dataverse retrieveMultiple failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(
            "dataverse.execute",
            async (
                _,
                request: {
                    entityName?: string;
                    entityId?: string;
                    operationName: string;
                    operationType: "action" | "function";
                    parameters?: Record<string, unknown>;
                },
            ) => {
                try {
                    return await this.dataverseManager.execute(request);
                } catch (error) {
                    throw new Error(`Dataverse execute failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle("dataverse.fetchXmlQuery", async (_, fetchXml: string) => {
            try {
                return await this.dataverseManager.fetchXmlQuery(fetchXml);
            } catch (error) {
                throw new Error(`Dataverse fetchXmlQuery failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.getEntityMetadata", async (_, entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) => {
            try {
                return await this.dataverseManager.getEntityMetadata(entityLogicalName, searchByLogicalName, selectColumns);
            } catch (error) {
                throw new Error(`Dataverse getEntityMetadata failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.getAllEntitiesMetadata", async () => {
            try {
                return await this.dataverseManager.getAllEntitiesMetadata();
            } catch (error) {
                throw new Error(`Dataverse getAllEntitiesMetadata failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.getEntityRelatedMetadata", async (_, entityLogicalName: string, relatedPath: string, selectColumns?: string[]) => {
            try {
                return await this.dataverseManager.getEntityRelatedMetadata(entityLogicalName, relatedPath, selectColumns);
            } catch (error) {
                throw new Error(`Dataverse getEntityRelatedMetadata failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.getSolutions", async (_, selectColumns: string[]) => {
            try {
                return await this.dataverseManager.getSolutions(selectColumns);
            } catch (error) {
                throw new Error(`Dataverse getSolutions failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle("dataverse.queryData", async (_, odataQuery: string) => {
            try {
                return await this.dataverseManager.queryData(odataQuery);
            } catch (error) {
                throw new Error(`Dataverse queryData failed: ${(error as Error).message}`);
            }
        });
    }

    /**
     * Create application menu
     */
    private createMenu(): void {
        const isMac = process.platform === "darwin";

        const template: any[] = [
            // App menu (macOS only)
            ...(isMac
                ? [
                      {
                          label: app.name,
                          submenu: [
                              { role: "about" },
                              { type: "separator" },
                              { role: "services" },
                              { type: "separator" },
                              { role: "hide" },
                              { role: "hideOthers" },
                              { role: "unhide" },
                              { type: "separator" },
                              { role: "quit" },
                          ],
                      },
                  ]
                : []),

            // File menu
            {
                label: "File",
                submenu: [isMac ? { role: "close" } : { role: "quit" }],
            },

            // Edit menu
            {
                label: "Edit",
                submenu: [
                    { role: "undo" },
                    { role: "redo" },
                    { type: "separator" },
                    { role: "cut" },
                    { role: "copy" },
                    { role: "paste" },
                    ...(isMac
                        ? [
                              { role: "pasteAndMatchStyle" },
                              { role: "delete" },
                              { role: "selectAll" },
                              { type: "separator" },
                              {
                                  label: "Speech",
                                  submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
                              },
                          ]
                        : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
                ],
            },

            // View menu
            {
                label: "View",
                submenu: [
                    { role: "reload" },
                    { role: "forceReload" },
                    {
                        label: "Toggle Developer Tools",
                        accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.toggleDevTools();
                            }
                        },
                    },
                    { type: "separator" },
                    {
                        label: "Show Home Page",
                        accelerator: isMac ? "Command+H" : "Ctrl+H",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.send("show-home-page");
                            }
                        },
                    },
                    { type: "separator" },
                    { role: "resetZoom" },
                    { role: "zoomIn" },
                    { role: "zoomOut" },
                    { type: "separator" },
                    { role: "togglefullscreen" },
                ],
            },

            // Window menu
            {
                label: "Window",
                submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }] : [{ role: "close" }])],
            },

            // Help menu
            {
                role: "help",
                submenu: [
                    {
                        label: "Learn More",
                        click: async () => {
                            await shell.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app");
                        },
                    },
                    {
                        label: "Documentation",
                        click: async () => {
                            await shell.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app#readme");
                        },
                    },
                    { type: "separator" },
                    {
                        label: "Toggle Developer Tools",
                        accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.toggleDevTools();
                            }
                        },
                    },
                ],
            },
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    /**
     * Create the main application window
     */
    private createWindow(): void {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, "preload.js"),
                webviewTag: true, // Enable webview tag
            },
            title: "Power Platform Tool Box",
            icon: path.join(__dirname, "../../assets/icon.png"),
        });

        // Set the main window for auto-updater
        this.autoUpdateManager.setMainWindow(this.mainWindow);

        // Create the application menu
        this.createMenu();

        // Load the index.html
        this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

        // Open DevTools in development
        if (process.env.NODE_ENV === "development") {
            this.mainWindow.webContents.openDevTools();
        }

        this.mainWindow.on("closed", () => {
            this.mainWindow = null;
        });
    }

    /**
     * Initialize the application
     */
    async initialize(): Promise<void> {
        // Set app user model ID for Windows notifications
        if (process.platform === "win32") {
            app.setAppUserModelId("com.powerplatform.toolbox");
        }

        await app.whenReady();
        this.createWindow();

        // Load all installed tools
        const installedTools = this.settingsManager.getInstalledTools();
        if (installedTools.length > 0) {
            await this.toolManager.loadInstalledTools(installedTools);
        }

        // Check if auto-update is enabled
        const autoUpdate = this.settingsManager.getSetting("autoUpdate");
        if (autoUpdate) {
            // Enable automatic update checks every 6 hours
            this.autoUpdateManager.enableAutoUpdateChecks(6);
        }

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") {
                app.quit();
            }
        });

        app.on("before-quit", () => {
            // Clean up update checks
            this.autoUpdateManager.disableAutoUpdateChecks();
        });
    }
}

// Create and initialize the application
const toolboxApp = new ToolBoxApp();
toolboxApp.initialize().catch(console.error);
