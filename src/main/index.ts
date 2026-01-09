// Initialize Sentry as early as possible in the main process
import * as Sentry from "@sentry/electron/main";
import { getSentryConfig } from "../common/sentry";
import { addBreadcrumb, captureException, captureMessage, initializeSentryHelper, logCheckpoint, setSentryMachineId } from "../common/sentryHelper";

const sentryConfig = getSentryConfig();
if (sentryConfig) {
    Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        release: sentryConfig.release,
        tracesSampleRate: sentryConfig.tracesSampleRate,
        // Enable Sentry logger for structured logging
        enableLogs: true,
        // Capture unhandled promise rejections and console errors
        integrations: [
            Sentry.captureConsoleIntegration({
                levels: ["error", "warn"],
            }),
            // Add HTTP integration for network request tracing
            Sentry.httpIntegration(),
            // Add Node integrations for better context
            Sentry.nodeContextIntegration(),
            Sentry.contextLinesIntegration(),
            Sentry.localVariablesIntegration(),
            Sentry.modulesIntegration(),
        ],
        // Before sending events, add machine ID and additional context
        beforeSend(event) {
            // Ensure machine ID is in tags
            if (!event.tags) {
                event.tags = {};
            }
            event.tags.process = "main";

            // Add platform information
            if (!event.contexts) {
                event.contexts = {};
            }
            event.contexts.os = {
                name: process.platform,
                version: process.getSystemVersion ? process.getSystemVersion() : "unknown",
            };

            return event;
        },
    });

    // Initialize the helper with the Sentry module
    initializeSentryHelper(Sentry);

    captureMessage("[Sentry] Initialized in main process with tracing and logging");
    addBreadcrumb("Main process Sentry initialized", "init", "info");
} else {
    captureMessage("[Sentry] Telemetry disabled - no DSN configured");
}

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import * as path from "path";
import {
    CONNECTION_CHANNELS,
    DATAVERSE_CHANNELS,
    EVENT_CHANNELS,
    MODAL_WINDOW_CHANNELS,
    SETTINGS_CHANNELS,
    TERMINAL_CHANNELS,
    TOOL_CHANNELS,
    UPDATE_CHANNELS,
    UTIL_CHANNELS,
} from "../common/ipc/channels";
import { ModalWindowMessagePayload, ModalWindowOptions, ToolBoxEvent } from "../common/types";
import { AuthManager } from "./managers/authManager";
import { AutoUpdateManager } from "./managers/autoUpdateManager";
import { BrowserviewProtocolManager } from "./managers/browserviewProtocolManager";
import { ConnectionsManager } from "./managers/connectionsManager";
import { DataverseManager } from "./managers/dataverseManager";
import { LoadingOverlayWindowManager } from "./managers/loadingOverlayWindowManager";
import { MachineIdManager } from "./managers/machineIdManager";
import { ModalWindowManager } from "./managers/modalWindowManager";
import { NotificationWindowManager } from "./managers/notificationWindowManager";
import { SettingsManager } from "./managers/settingsManager";
import { TerminalManager } from "./managers/terminalManager";
import { ToolBoxUtilityManager } from "./managers/toolboxUtilityManager";
import { ToolManager } from "./managers/toolsManager";
import { ToolWindowManager } from "./managers/toolWindowManager";

class ToolBoxApp {
    private mainWindow: BrowserWindow | null = null;
    private settingsManager: SettingsManager;
    private machineIdManager: MachineIdManager;
    private connectionsManager: ConnectionsManager;
    private toolManager: ToolManager;
    private browserviewProtocolManager: BrowserviewProtocolManager;
    private toolWindowManager: ToolWindowManager | null = null;
    private notificationWindowManager: NotificationWindowManager | null = null;
    private loadingOverlayWindowManager: LoadingOverlayWindowManager | null = null;
    private modalWindowManager: ModalWindowManager | null = null;
    private api: ToolBoxUtilityManager;
    private autoUpdateManager: AutoUpdateManager;
    private authManager: AuthManager;
    private terminalManager: TerminalManager;
    private dataverseManager: DataverseManager;
    private tokenExpiryCheckInterval: NodeJS.Timeout | null = null;
    private notifiedExpiredTokens: Set<string> = new Set(); // Track notified expired tokens

    constructor() {
        logCheckpoint("ToolBoxApp constructor started");

        try {
            this.settingsManager = new SettingsManager();
            this.machineIdManager = new MachineIdManager(this.settingsManager);

            // Initialize Sentry with machine ID as early as possible
            if (sentryConfig) {
                const machineId = this.machineIdManager.getMachineId();
                setSentryMachineId(machineId);
                logCheckpoint("Sentry machine ID configured", { machineId });
            }

            this.connectionsManager = new ConnectionsManager();
            this.api = new ToolBoxUtilityManager();
            // Pass Supabase credentials from environment variables or use defaults from constants
            this.toolManager = new ToolManager(path.join(app.getPath("userData"), "tools"), process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, this.machineIdManager);
            this.browserviewProtocolManager = new BrowserviewProtocolManager(this.toolManager, this.settingsManager);
            this.autoUpdateManager = new AutoUpdateManager();
            this.authManager = new AuthManager();
            this.terminalManager = new TerminalManager();
            this.dataverseManager = new DataverseManager(this.connectionsManager, this.authManager);

            this.setupEventListeners();
            this.setupIpcHandlers();

            logCheckpoint("ToolBoxApp constructor completed");
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "construction" },
                level: "fatal",
            });
            throw error;
        }
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
                // Forward to main renderer window
                if (this.mainWindow) {
                    this.mainWindow.webContents.send(EVENT_CHANNELS.TOOLBOX_EVENT, payload);
                }
                // Forward to all tool windows
                if (this.toolWindowManager) {
                    this.toolWindowManager.forwardEventToTools(payload);
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
     * Remove all IPC handlers to allow clean re-registration
     * This is called before setupIpcHandlers to prevent duplicate registration errors
     */
    private removeIpcHandlers(): void {
        // Settings handlers
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_USER_SETTINGS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.UPDATE_USER_SETTINGS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_SETTING);
        ipcMain.removeHandler(SETTINGS_CHANNELS.SET_SETTING);
        ipcMain.removeHandler(SETTINGS_CHANNELS.ADD_FAVORITE_TOOL);
        ipcMain.removeHandler(SETTINGS_CHANNELS.REMOVE_FAVORITE_TOOL);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_FAVORITE_TOOLS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.IS_FAVORITE_TOOL);
        ipcMain.removeHandler(SETTINGS_CHANNELS.TOGGLE_FAVORITE_TOOL);

        // Connection handlers
        ipcMain.removeHandler(CONNECTION_CHANNELS.ADD_CONNECTION);
        ipcMain.removeHandler(CONNECTION_CHANNELS.UPDATE_CONNECTION);
        ipcMain.removeHandler(CONNECTION_CHANNELS.DELETE_CONNECTION);
        ipcMain.removeHandler(CONNECTION_CHANNELS.GET_CONNECTIONS);
        ipcMain.removeHandler(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID);
        ipcMain.removeHandler(CONNECTION_CHANNELS.SET_ACTIVE_CONNECTION);
        ipcMain.removeHandler(CONNECTION_CHANNELS.TEST_CONNECTION);
        ipcMain.removeHandler(CONNECTION_CHANNELS.IS_TOKEN_EXPIRED);
        ipcMain.removeHandler(CONNECTION_CHANNELS.REFRESH_TOKEN);

        // Tool handlers
        ipcMain.removeHandler(TOOL_CHANNELS.GET_ALL_TOOLS);
        ipcMain.removeHandler(TOOL_CHANNELS.GET_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.LOAD_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.UNLOAD_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.INSTALL_TOOL_FROM_REGISTRY);
        ipcMain.removeHandler(TOOL_CHANNELS.FETCH_REGISTRY_TOOLS);
        ipcMain.removeHandler(TOOL_CHANNELS.CHECK_TOOL_UPDATES);
        ipcMain.removeHandler(TOOL_CHANNELS.UPDATE_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.INSTALL_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.UNINSTALL_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.LOAD_LOCAL_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.GET_LOCAL_TOOL_WEBVIEW_HTML);
        ipcMain.removeHandler(TOOL_CHANNELS.OPEN_DIRECTORY_PICKER);
        ipcMain.removeHandler(TOOL_CHANNELS.GET_TOOL_WEBVIEW_HTML);
        ipcMain.removeHandler(TOOL_CHANNELS.GET_TOOL_CONTEXT);

        // Tool settings handlers
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_TOOL_SETTINGS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.UPDATE_TOOL_SETTINGS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.TOOL_SETTINGS_GET_ALL);
        ipcMain.removeHandler(SETTINGS_CHANNELS.TOOL_SETTINGS_GET);
        ipcMain.removeHandler(SETTINGS_CHANNELS.TOOL_SETTINGS_SET);
        ipcMain.removeHandler(SETTINGS_CHANNELS.TOOL_SETTINGS_SET_ALL);

        // CSP consent handlers
        ipcMain.removeHandler(SETTINGS_CHANNELS.HAS_CSP_CONSENT);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GRANT_CSP_CONSENT);
        ipcMain.removeHandler(SETTINGS_CHANNELS.REVOKE_CSP_CONSENT);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_CSP_CONSENTS);

        // Tool-Connection mapping handlers
        ipcMain.removeHandler(SETTINGS_CHANNELS.SET_TOOL_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_TOOL_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.REMOVE_TOOL_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_ALL_TOOL_CONNECTIONS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.SET_TOOL_SECONDARY_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_TOOL_SECONDARY_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.REMOVE_TOOL_SECONDARY_CONNECTION);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_ALL_TOOL_SECONDARY_CONNECTIONS);

        // Recently used tools
        ipcMain.removeHandler(SETTINGS_CHANNELS.ADD_LAST_USED_TOOL);
        ipcMain.removeHandler(SETTINGS_CHANNELS.GET_LAST_USED_TOOLS);
        ipcMain.removeHandler(SETTINGS_CHANNELS.CLEAR_LAST_USED_TOOLS);

        // Webview protocol handler
        ipcMain.removeHandler(TOOL_CHANNELS.GET_TOOL_WEBVIEW_URL);

        // Notification and utility handlers
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_NOTIFICATION);
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_MODAL_WINDOW);
        ipcMain.removeHandler(UTIL_CHANNELS.CLOSE_MODAL_WINDOW);
        ipcMain.removeHandler(UTIL_CHANNELS.SEND_MODAL_MESSAGE);
        ipcMain.removeHandler(UTIL_CHANNELS.COPY_TO_CLIPBOARD);
        ipcMain.removeHandler(UTIL_CHANNELS.SAVE_FILE);
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_LOADING);
        ipcMain.removeHandler(UTIL_CHANNELS.HIDE_LOADING);
        ipcMain.removeHandler(UTIL_CHANNELS.GET_CURRENT_THEME);
        ipcMain.removeHandler(UTIL_CHANNELS.GET_EVENT_HISTORY);
        ipcMain.removeHandler(UTIL_CHANNELS.OPEN_EXTERNAL);

        // Modal window internal channels
        ipcMain.removeHandler(MODAL_WINDOW_CHANNELS.CLOSE);

        // Terminal handlers
        ipcMain.removeHandler(TERMINAL_CHANNELS.CREATE_TERMINAL);
        ipcMain.removeHandler(TERMINAL_CHANNELS.EXECUTE_COMMAND);
        ipcMain.removeHandler(TERMINAL_CHANNELS.CLOSE_TERMINAL);
        ipcMain.removeHandler(TERMINAL_CHANNELS.GET_TERMINAL);
        ipcMain.removeHandler(TERMINAL_CHANNELS.GET_TOOL_TERMINALS);
        ipcMain.removeHandler(TERMINAL_CHANNELS.GET_ALL_TERMINALS);
        ipcMain.removeHandler(TERMINAL_CHANNELS.SET_VISIBILITY);

        // Auto-update handlers
        ipcMain.removeHandler(UPDATE_CHANNELS.CHECK_FOR_UPDATES);
        ipcMain.removeHandler(UPDATE_CHANNELS.DOWNLOAD_UPDATE);
        ipcMain.removeHandler(UPDATE_CHANNELS.QUIT_AND_INSTALL);
        ipcMain.removeHandler(UPDATE_CHANNELS.GET_APP_VERSION);

        // Dataverse handlers
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.RETRIEVE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.RETRIEVE_MULTIPLE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.EXECUTE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.FETCH_XML_QUERY);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ENTITY_METADATA);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ALL_ENTITIES_METADATA);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_SOLUTIONS);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.QUERY_DATA);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_MULTIPLE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_MULTIPLE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME);
    }

    /**
     * Set up IPC handlers for communication with renderer
     */
    private setupIpcHandlers(): void {
        // Remove existing handlers first to prevent duplicate registration errors
        // This is necessary on macOS where the app doesn't quit when windows are closed
        this.removeIpcHandlers();

        // Settings handlers
        ipcMain.handle(SETTINGS_CHANNELS.GET_USER_SETTINGS, () => {
            return this.settingsManager.getUserSettings();
        });

        ipcMain.handle(SETTINGS_CHANNELS.UPDATE_USER_SETTINGS, (_, settings) => {
            this.settingsManager.updateUserSettings(settings);
            this.api.emitEvent(ToolBoxEvent.SETTINGS_UPDATED, settings);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_SETTING, (_, key) => {
            return this.settingsManager.getSetting(key);
        });

        ipcMain.handle(SETTINGS_CHANNELS.SET_SETTING, (_, key, value) => {
            this.settingsManager.setSetting(key, value);
        });

        // Favorite tools
        ipcMain.handle(SETTINGS_CHANNELS.ADD_FAVORITE_TOOL, (_, toolId) => {
            return this.settingsManager.addFavoriteTool(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.REMOVE_FAVORITE_TOOL, (_, toolId) => {
            return this.settingsManager.removeFavoriteTool(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_FAVORITE_TOOLS, () => {
            return this.settingsManager.getFavoriteTools();
        });

        ipcMain.handle(SETTINGS_CHANNELS.IS_FAVORITE_TOOL, (_, toolId) => {
            return this.settingsManager.isFavoriteTool(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.TOGGLE_FAVORITE_TOOL, (_, toolId) => {
            return this.settingsManager.toggleFavoriteTool(toolId);
        });

        // Connection handlers
        ipcMain.handle(CONNECTION_CHANNELS.ADD_CONNECTION, (_, connection) => {
            this.connectionsManager.addConnection(connection);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_CREATED, connection);
        });

        ipcMain.handle(CONNECTION_CHANNELS.UPDATE_CONNECTION, (_, id, updates) => {
            this.connectionsManager.updateConnection(id, updates);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, updates });
        });

        ipcMain.handle(CONNECTION_CHANNELS.DELETE_CONNECTION, (_, id) => {
            this.connectionsManager.deleteConnection(id);
            this.api.emitEvent(ToolBoxEvent.CONNECTION_DELETED, { id });
        });

        ipcMain.handle(CONNECTION_CHANNELS.GET_CONNECTIONS, () => {
            return this.connectionsManager.getConnections();
        });

        ipcMain.handle(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID, (event, connectionId: string) => {
            return this.connectionsManager.getConnectionById(connectionId);
        });

        ipcMain.handle(CONNECTION_CHANNELS.SET_ACTIVE_CONNECTION, async (_, id) => {
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

                // Set the connection with tokens
                this.connectionsManager.updateConnectionTokens(id, {
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    expiresOn: authResult.expiresOn,
                });

                // Clear notification tracking since we have a new active connection
                this.notifiedExpiredTokens.clear();

                this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, isActive: true });
            } catch (error) {
                throw new Error(`Authentication failed: ${(error as Error).message}`);
            }
        });

        // Test connection handler
        ipcMain.handle(CONNECTION_CHANNELS.TEST_CONNECTION, async (_, connection) => {
            try {
                await this.authManager.testConnection(connection, this.mainWindow || undefined);
                return { success: true };
            } catch (error) {
                return { success: false, error: (error as Error).message };
            }
        });
        // Check if connection token is expired
        ipcMain.handle(CONNECTION_CHANNELS.IS_TOKEN_EXPIRED, (_, connectionId) => {
            return this.connectionsManager.isConnectionTokenExpired(connectionId);
        });

        // Re-authenticate connection (refresh token flow)
        ipcMain.handle(CONNECTION_CHANNELS.REFRESH_TOKEN, async (_, connectionId) => {
            const connection = this.connectionsManager.getConnectionById(connectionId);
            if (!connection) {
                throw new Error("Connection not found");
            }

            if (!connection.refreshToken) {
                throw new Error("No refresh token available. Please reconnect.");
            }

            try {
                const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);

                // Update the connection with new tokens
                this.connectionsManager.updateConnectionTokens(connectionId, {
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    expiresOn: authResult.expiresOn,
                });

                // Clear notification tracking for this connection since token is refreshed
                this.notifiedExpiredTokens.clear();

                this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: connectionId, tokenRefreshed: true });

                return { success: true };
            } catch (error) {
                captureException(error instanceof Error ? error : new Error(String(error)), {
                    tags: { phase: "token_refresh" },
                    level: "error",
                });
                throw error;
            }
        });

        // Tool handlers
        ipcMain.handle(TOOL_CHANNELS.GET_ALL_TOOLS, () => {
            return this.toolManager.getAllTools();
        });

        ipcMain.handle(TOOL_CHANNELS.GET_TOOL, (_, toolId) => {
            return this.toolManager.getTool(toolId);
        });

        ipcMain.handle(TOOL_CHANNELS.LOAD_TOOL, async (_, packageName) => {
            return await this.toolManager.loadTool(packageName);
        });

        ipcMain.handle(TOOL_CHANNELS.UNLOAD_TOOL, (_, toolId) => {
            this.toolManager.unloadTool(toolId);
        });

        // Registry-based tool installation (new primary method)
        ipcMain.handle(TOOL_CHANNELS.INSTALL_TOOL_FROM_REGISTRY, async (_, toolId) => {
            const manifest = await this.toolManager.installToolFromRegistry(toolId);
            const tool = await this.toolManager.loadTool(toolId);
            this.settingsManager.addInstalledTool(toolId);
            return { manifest, tool };
        });

        // Fetch available tools from registry
        ipcMain.handle(TOOL_CHANNELS.FETCH_REGISTRY_TOOLS, async () => {
            return await this.toolManager.fetchAvailableTools();
        });

        // Check for tool updates
        ipcMain.handle(TOOL_CHANNELS.CHECK_TOOL_UPDATES, async (_, toolId) => {
            return await this.toolManager.checkForUpdates(toolId);
        });

        // Update a tool to the latest version
        ipcMain.handle(TOOL_CHANNELS.UPDATE_TOOL, async (_, toolId) => {
            return await this.toolManager.updateTool(toolId);
        });

        // Debug mode only - npm-based installation for tool developers
        ipcMain.handle(TOOL_CHANNELS.INSTALL_TOOL, async (_, packageName) => {
            await this.toolManager.installToolForDebug(packageName);
            // Load the npm tool after installation
            const tool = await this.toolManager.loadNpmTool(packageName);
            this.settingsManager.addInstalledTool(packageName);
            return tool;
        });

        ipcMain.handle(TOOL_CHANNELS.UNINSTALL_TOOL, async (_, packageName, toolId) => {
            this.toolManager.unloadTool(toolId);
            await this.toolManager.uninstallTool(packageName);
            this.settingsManager.removeInstalledTool(packageName);
        });

        // Local tool development - load tool from local directory
        ipcMain.handle(TOOL_CHANNELS.LOAD_LOCAL_TOOL, async (_, localPath) => {
            const tool = await this.toolManager.loadLocalTool(localPath);
            return tool;
        });

        ipcMain.handle(TOOL_CHANNELS.GET_LOCAL_TOOL_WEBVIEW_HTML, (_, localPath) => {
            return this.toolManager.getLocalToolWebviewHtml(localPath);
        });

        ipcMain.handle(TOOL_CHANNELS.OPEN_DIRECTORY_PICKER, async () => {
            if (!this.mainWindow) {
                throw new Error("Main window not available");
            }

            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ["openDirectory"],
                title: "Select Tool Directory",
                message: "Select the root directory of your tool (containing package.json)",
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            return result.filePaths[0];
        });

        ipcMain.handle(TOOL_CHANNELS.GET_TOOL_WEBVIEW_HTML, (_, packageName) => {
            return this.toolManager.getToolWebviewHtml(packageName);
        });

        ipcMain.handle(TOOL_CHANNELS.GET_TOOL_CONTEXT, (_, packageName, connectionUrl) => {
            return this.toolManager.getToolContext(packageName, connectionUrl);
        });

        // Tool settings handlers
        ipcMain.handle(SETTINGS_CHANNELS.GET_TOOL_SETTINGS, (_, toolId) => {
            return this.settingsManager.getToolSettings(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.UPDATE_TOOL_SETTINGS, (_, toolId, settings) => {
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        // Context-aware tool settings handlers (for toolboxAPI)
        ipcMain.handle(SETTINGS_CHANNELS.TOOL_SETTINGS_GET_ALL, (_, toolId) => {
            return this.settingsManager.getToolSettings(toolId) || {};
        });

        ipcMain.handle(SETTINGS_CHANNELS.TOOL_SETTINGS_GET, (_, toolId, key) => {
            const settings = this.settingsManager.getToolSettings(toolId);
            return settings ? settings[key] : undefined;
        });

        ipcMain.handle(SETTINGS_CHANNELS.TOOL_SETTINGS_SET, (_, toolId, key, value) => {
            const settings = this.settingsManager.getToolSettings(toolId) || {};
            settings[key] = value;
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        ipcMain.handle(SETTINGS_CHANNELS.TOOL_SETTINGS_SET_ALL, (_, toolId, settings) => {
            this.settingsManager.updateToolSettings(toolId, settings);
        });

        // CSP consent handlers
        ipcMain.handle(SETTINGS_CHANNELS.HAS_CSP_CONSENT, (_, toolId) => {
            return this.settingsManager.hasCspConsent(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GRANT_CSP_CONSENT, (_, toolId) => {
            this.settingsManager.grantCspConsent(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.REVOKE_CSP_CONSENT, (_, toolId) => {
            this.settingsManager.revokeCspConsent(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_CSP_CONSENTS, () => {
            return this.settingsManager.getCspConsents();
        });

        // Tool-Connection mapping handlers
        ipcMain.handle(SETTINGS_CHANNELS.SET_TOOL_CONNECTION, (_, toolId, connectionId) => {
            this.settingsManager.setToolConnection(toolId, connectionId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_TOOL_CONNECTION, (_, toolId) => {
            return this.settingsManager.getToolConnection(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.REMOVE_TOOL_CONNECTION, (_, toolId) => {
            this.settingsManager.removeToolConnection(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_ALL_TOOL_CONNECTIONS, () => {
            return this.settingsManager.getAllToolConnections();
        });

        // Tool secondary connection management
        ipcMain.handle(SETTINGS_CHANNELS.SET_TOOL_SECONDARY_CONNECTION, (_, toolId: string, connectionId: string) => {
            this.settingsManager.setToolSecondaryConnection(toolId, connectionId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_TOOL_SECONDARY_CONNECTION, (_, toolId: string) => {
            return this.settingsManager.getToolSecondaryConnection(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.REMOVE_TOOL_SECONDARY_CONNECTION, (_, toolId: string) => {
            this.settingsManager.removeToolSecondaryConnection(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_ALL_TOOL_SECONDARY_CONNECTIONS, () => {
            return this.settingsManager.getAllToolSecondaryConnections();
        });

        // Recently used tools
        ipcMain.handle(SETTINGS_CHANNELS.ADD_LAST_USED_TOOL, (_, toolId: string) => {
            this.settingsManager.addLastUsedTool(toolId);
        });

        ipcMain.handle(SETTINGS_CHANNELS.GET_LAST_USED_TOOLS, () => {
            return this.settingsManager.getLastUsedTools();
        });

        ipcMain.handle(SETTINGS_CHANNELS.CLEAR_LAST_USED_TOOLS, () => {
            this.settingsManager.clearLastUsedTools();
        });

        // Webview protocol handler
        ipcMain.handle(TOOL_CHANNELS.GET_TOOL_WEBVIEW_URL, (_, toolId) => {
            return this.browserviewProtocolManager.buildToolUrl(toolId);
        });

        // Notification handler
        ipcMain.handle(UTIL_CHANNELS.SHOW_NOTIFICATION, (_, options) => {
            this.api.showNotification(options);
        });

        // BrowserWindow modal handlers
        ipcMain.handle(UTIL_CHANNELS.SHOW_MODAL_WINDOW, (_, options: ModalWindowOptions) => {
            this.modalWindowManager?.showModal(options);
        });

        ipcMain.handle(UTIL_CHANNELS.CLOSE_MODAL_WINDOW, () => {
            this.modalWindowManager?.hideModal();
        });

        ipcMain.handle(UTIL_CHANNELS.SEND_MODAL_MESSAGE, (_, payload: ModalWindowMessagePayload) => {
            this.modalWindowManager?.sendMessageToModal(payload);
        });

        // Clipboard handler
        ipcMain.handle(UTIL_CHANNELS.COPY_TO_CLIPBOARD, (_, text) => {
            this.api.copyToClipboard(text);
        });

        // Save file handler
        ipcMain.handle(UTIL_CHANNELS.SAVE_FILE, async (_, defaultPath, content) => {
            return await this.api.saveFile(defaultPath, content);
        });

        // Show loading handler (overlay window above BrowserViews)
        ipcMain.handle(UTIL_CHANNELS.SHOW_LOADING, (_, message: string) => {
            if (this.loadingOverlayWindowManager) {
                this.loadingOverlayWindowManager.show(message || "Loading...");
            } else if (this.mainWindow) {
                // Fallback to legacy in-DOM loading screen if manager not ready
                this.mainWindow.webContents.send(EVENT_CHANNELS.SHOW_LOADING_SCREEN, message || "Loading...");
            }
        });

        // Hide loading handler
        ipcMain.handle(UTIL_CHANNELS.HIDE_LOADING, () => {
            if (this.loadingOverlayWindowManager) {
                this.loadingOverlayWindowManager.hide();
            } else if (this.mainWindow) {
                // Fallback legacy hide
                this.mainWindow.webContents.send(EVENT_CHANNELS.HIDE_LOADING_SCREEN);
            }
        });

        // Get current theme handler
        ipcMain.handle(UTIL_CHANNELS.GET_CURRENT_THEME, () => {
            const settings = this.settingsManager.getUserSettings();
            const theme = settings.theme || "system";

            // Resolve "system" to actual theme based on OS preference
            if (theme === "system") {
                return nativeTheme.shouldUseDarkColors ? "dark" : "light";
            }

            return theme;
        });

        // Event history handler
        ipcMain.handle(UTIL_CHANNELS.GET_EVENT_HISTORY, (_, limit) => {
            return this.api.getEventHistory(limit);
        });

        // Open external URL handler
        ipcMain.handle(UTIL_CHANNELS.OPEN_EXTERNAL, async (_, url) => {
            await shell.openExternal(url);
        });

        // Modal BrowserWindow internal channels (modal preload -> main)
        ipcMain.handle(MODAL_WINDOW_CHANNELS.CLOSE, () => {
            this.modalWindowManager?.hideModal();
        });

        ipcMain.on(MODAL_WINDOW_CHANNELS.MESSAGE, (_, payload) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send(EVENT_CHANNELS.MODAL_WINDOW_MESSAGE, payload);
            }
        });

        // Terminal handlers
        ipcMain.handle(TERMINAL_CHANNELS.CREATE_TERMINAL, async (_, toolId, options) => {
            return await this.terminalManager.createTerminal(toolId, options);
        });

        ipcMain.handle(TERMINAL_CHANNELS.EXECUTE_COMMAND, async (_, terminalId, command) => {
            return await this.terminalManager.executeCommand(terminalId, command);
        });

        ipcMain.handle(TERMINAL_CHANNELS.CLOSE_TERMINAL, (_, terminalId) => {
            this.terminalManager.closeTerminal(terminalId);
        });

        ipcMain.handle(TERMINAL_CHANNELS.GET_TERMINAL, (_, terminalId) => {
            return this.terminalManager.getTerminal(terminalId);
        });

        ipcMain.handle(TERMINAL_CHANNELS.GET_TOOL_TERMINALS, (_, toolId) => {
            return this.terminalManager.getToolTerminals(toolId);
        });

        ipcMain.handle(TERMINAL_CHANNELS.GET_ALL_TERMINALS, () => {
            return this.terminalManager.getAllTerminals();
        });

        ipcMain.handle(TERMINAL_CHANNELS.SET_VISIBILITY, (_, terminalId, visible) => {
            this.terminalManager.setTerminalVisibility(terminalId, visible);
        });

        // Auto-update handlers
        ipcMain.handle(UPDATE_CHANNELS.CHECK_FOR_UPDATES, async () => {
            await this.autoUpdateManager.checkForUpdates();
        });

        ipcMain.handle(UPDATE_CHANNELS.DOWNLOAD_UPDATE, async () => {
            await this.autoUpdateManager.downloadUpdate();
        });

        ipcMain.handle(UPDATE_CHANNELS.QUIT_AND_INSTALL, () => {
            this.autoUpdateManager.quitAndInstall();
        });

        ipcMain.handle(UPDATE_CHANNELS.GET_APP_VERSION, () => {
            return this.autoUpdateManager.getCurrentVersion();
        });

        // Dataverse API handlers
        // All handlers automatically get the connectionId from the calling tool's WebContents
        // For multi-connection tools, an optional connectionTarget parameter can be passed to specify "primary" or "secondary"
        ipcMain.handle(DATAVERSE_CHANNELS.CREATE, async (event, entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                // Get the connectionId based on connectionTarget (defaults to primary)
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.create(connectionId, entityLogicalName, record);
            } catch (error) {
                throw new Error(`Dataverse create failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.RETRIEVE, async (event, entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.retrieve(connectionId, entityLogicalName, id, columns);
            } catch (error) {
                throw new Error(`Dataverse retrieve failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.UPDATE, async (event, entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.update(connectionId, entityLogicalName, id, record);
                return { success: true };
            } catch (error) {
                throw new Error(`Dataverse update failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE, async (event, entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.delete(connectionId, entityLogicalName, id);
                return { success: true };
            } catch (error) {
                throw new Error(`Dataverse delete failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.RETRIEVE_MULTIPLE, async (event, fetchXml: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.retrieveMultiple(connectionId, fetchXml);
            } catch (error) {
                throw new Error(`Dataverse retrieveMultiple failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(
            DATAVERSE_CHANNELS.EXECUTE,
            async (
                event,
                request: {
                    entityName?: string;
                    entityId?: string;
                    operationName: string;
                    operationType: "action" | "function";
                    parameters?: Record<string, unknown>;
                },
                connectionTarget?: "primary" | "secondary",
            ) => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.execute(connectionId, request);
                } catch (error) {
                    throw new Error(`Dataverse execute failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.FETCH_XML_QUERY, async (event, fetchXml: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.fetchXmlQuery(connectionId, fetchXml);
            } catch (error) {
                throw new Error(`Dataverse fetchXmlQuery failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(
            DATAVERSE_CHANNELS.GET_ENTITY_METADATA,
            async (event, entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.getEntityMetadata(connectionId, entityLogicalName, searchByLogicalName, selectColumns);
                } catch (error) {
                    throw new Error(`Dataverse getEntityMetadata failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.GET_ALL_ENTITIES_METADATA, async (event, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.getAllEntitiesMetadata(connectionId, selectColumns);
            } catch (error) {
                throw new Error(`Dataverse getAllEntitiesMetadata failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(
            DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA,
            async (event, entityLogicalName: string, relatedPath: string, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.getEntityRelatedMetadata(connectionId, entityLogicalName, relatedPath, selectColumns);
                } catch (error) {
                    throw new Error(`Dataverse getEntityRelatedMetadata failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.GET_SOLUTIONS, async (event, selectColumns: string[], connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.getSolutions(connectionId, selectColumns);
            } catch (error) {
                throw new Error(`Dataverse getSolutions failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.QUERY_DATA, async (event, odataQuery: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.queryData(connectionId, odataQuery);
            } catch (error) {
                throw new Error(`Dataverse queryData failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.CREATE_MULTIPLE, async (event, entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.createMultiple(connectionId, entityLogicalName, records);
            } catch (error) {
                throw new Error(`Dataverse createMultiple failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.UPDATE_MULTIPLE, async (event, entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.updateMultiple(connectionId, entityLogicalName, records);
            } catch (error) {
                throw new Error(`Dataverse updateMultiple failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME, (event, entityLogicalName: string) => {
            try {
                return this.dataverseManager.getEntitySetName(entityLogicalName);
            } catch (error) {
                throw new Error(`Dataverse getEntitySetName failed: ${(error as Error).message}`);
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
                    { type: "separator" },
                    {
                        label: "Show Home Page",
                        accelerator: isMac ? "Command+H" : "Ctrl+H",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.send(EVENT_CHANNELS.SHOW_HOME_PAGE);
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
                            await shell.openExternal("https://www.powerplatformtoolbox.com/");
                        },
                    },
                    {
                        label: "Documentation",
                        click: async () => {
                            await shell.openExternal("https://docs.powerplatformtoolbox.com/");
                        },
                    },
                    { type: "separator" },
                    {
                        label: "Toggle Tool DevTools",
                        accelerator: isMac ? "Alt+Command+T" : "Ctrl+Shift+T",
                        click: () => {
                            if (this.toolWindowManager) {
                                const opened = this.toolWindowManager.openDevToolsForActiveTool();
                                if (!opened) {
                                    // Show notification if no active tool
                                    dialog.showMessageBox(this.mainWindow!, {
                                        type: "info",
                                        title: "No Active Tool",
                                        message: "No tool is currently open. Please open a tool first to access its DevTools.",
                                        buttons: ["OK"],
                                    });
                                }
                            }
                        },
                    },
                    { type: "separator" },
                    {
                        label: "Toggle ToolBox DevTools",
                        accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.toggleDevTools();
                            }
                        },
                    },
                    { type: "separator" },
                    {
                        label: `About`,
                        click: () => {
                            this.showAboutDialog();
                        },
                    },
                ],
            },
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    /**
     * Check for token expiry and notify user
     * Note: With no global active connection, this method is deprecated
     * Token expiry checks are now done per-tool when making API calls
     */
    private checkTokenExpiry(): void {
        // No-op: Token expiry is now checked per-connection when tools make API calls
        // Each tool uses its own connection, so we don't need a global check
        return;
    }

    /**
     * Start periodic token expiry checks
     */
    private startTokenExpiryChecks(): void {
        // No-op: Token expiry checks are now done per-connection when tools make API calls
        return;
    }

    /**
     * Stop periodic token expiry checks
     */
    private stopTokenExpiryChecks(): void {
        if (this.tokenExpiryCheckInterval) {
            clearInterval(this.tokenExpiryCheckInterval);
            this.tokenExpiryCheckInterval = null;
        }
    }

    /**
     * Register custom pptb-webview protocol for loading tool content
     * This provides isolation and CSP control for tool execution
     */
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
                // Explicitly disable sandbox so preload can use CommonJS require for sibling chunks (channels.js)
                // Electron 28 may enable stronger sandbox behaviors affecting module resolution when omitted.
                sandbox: false,
                preload: path.join(__dirname, "preload.js"),
                // No longer need webviewTag - using BrowserView instead
            },
            title: "Power Platform Tool Box",
            icon: path.join(__dirname, "../../assets/icon.png"),
        });

        // Initialize ToolWindowManager for managing tool BrowserViews
        this.toolWindowManager = new ToolWindowManager(this.mainWindow, this.browserviewProtocolManager, this.connectionsManager, this.settingsManager, this.toolManager);

        // Initialize NotificationWindowManager for overlay notifications
        this.notificationWindowManager = new NotificationWindowManager(this.mainWindow);
        // Initialize LoadingOverlayWindowManager for full-screen loading spinner above BrowserViews
        this.loadingOverlayWindowManager = new LoadingOverlayWindowManager(this.mainWindow);
        // Initialize BrowserWindow-based modal manager
        this.modalWindowManager = new ModalWindowManager(this.mainWindow);

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
            this.toolWindowManager?.destroy();
            this.toolWindowManager = null;
            this.notificationWindowManager = null;
            this.loadingOverlayWindowManager = null;
            this.modalWindowManager = null;
            this.mainWindow = null;
        });
    }

    /**
     * Show About dialog with version and environment info
     * Includes machine ID and other important information for Sentry tracing
     */
    private showAboutDialog(): void {
        if (this.mainWindow) {
            const appVersion = app.getVersion();
            const machineId = this.machineIdManager.getMachineId();
            const locale = app.getLocale();

            const message = `Power Platform Tool Box
            Version: ${appVersion}
            Machine ID: ${machineId}

            Environment:
            Electron: ${process.versions.electron}
            Node.js: ${process.versions.node}
            Chromium: ${process.versions.chrome}

            System:
            OS: ${process.platform} ${process.arch}
            OS Version: ${process.getSystemVersion()}
            Locale: ${locale}

            Note: Machine ID is used for telemetry and error tracking in Sentry.`;

            if (dialog.showMessageBoxSync({ title: "About Power Platform Tool Box", message: message, type: "info", noLink: true, defaultId: 1, buttons: ["Copy", "OK"] }) === 0) {
                clipboard.writeText(message);
            }
        }
    }

    /**
     * Initialize the application
     */
    async initialize(): Promise<void> {
        logCheckpoint("Application initialization started");

        try {
            // Set app user model ID for Windows notifications
            if (process.platform === "win32") {
                app.setAppUserModelId("com.powerplatform.toolbox");
                addBreadcrumb("Set Windows app user model ID", "init", "info");
            }

            // Register custom protocol scheme before app is ready
            this.browserviewProtocolManager.registerScheme();
            addBreadcrumb("Registered custom protocol scheme", "init", "info");

            await app.whenReady();
            logCheckpoint("Electron app ready");

            // Register protocol handler after app is ready
            this.browserviewProtocolManager.registerHandler();
            addBreadcrumb("Registered protocol handler", "init", "info");

            this.createWindow();
            logCheckpoint("Main window created");

            // Load all installed tools from registry
            try {
                await this.toolManager.loadAllInstalledTools();
                logCheckpoint("Tools loaded from registry");
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                captureException(err, {
                    tags: { phase: "tool_loading" },
                    level: "error",
                });
                captureException(error instanceof Error ? error : new Error(String(error)), {
                    tags: { phase: "tools_loading" },
                    level: "error",
                });
            }

            // Check if auto-update is enabled
            const autoUpdate = this.settingsManager.getSetting("autoUpdate");
            if (autoUpdate) {
                // Enable automatic update checks every 6 hours
                this.autoUpdateManager.enableAutoUpdateChecks(6);
                addBreadcrumb("Auto-update enabled", "settings", "info", { intervalHours: 6 });
            }

            // Start token expiry checks
            this.startTokenExpiryChecks();
            addBreadcrumb("Token expiry checks started", "auth", "info");

            app.on("activate", () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createWindow();
                    addBreadcrumb("Window recreated on activate", "window", "info");
                }
            });

            app.on("window-all-closed", () => {
                if (process.platform !== "darwin") {
                    addBreadcrumb("All windows closed, quitting app", "window", "info");
                    app.quit();
                }
            });

            app.on("before-quit", () => {
                logCheckpoint("Application shutting down");
                // Clean up update checks
                this.autoUpdateManager.disableAutoUpdateChecks();
                // Clean up token expiry checks
                this.stopTokenExpiryChecks();
                addBreadcrumb("Cleanup completed", "shutdown", "info");
            });

            logCheckpoint("Application initialization completed successfully");
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "initialization" },
                level: "fatal",
            });
            logCheckpoint("Application initialization failed", { error: err.message });
            throw error;
        }
    }
}

// Create and initialize the application
const toolboxApp = new ToolBoxApp();
toolboxApp.initialize().catch((error) => {
    captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { phase: "main_initialization" },
        level: "fatal",
    });
    // If Sentry is available, capture the error
    if (sentryConfig) {
        Sentry.captureException(error);
    }
});
