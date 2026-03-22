import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItemConstructorOptions, nativeTheme, shell } from "electron";
import * as fs from "fs";
import { createWriteStream } from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import {
    CONNECTION_CHANNELS,
    DATAVERSE_CHANNELS,
    EVENT_CHANNELS,
    FILESYSTEM_CHANNELS,
    MODAL_WINDOW_CHANNELS,
    SETTINGS_CHANNELS,
    TERMINAL_CHANNELS,
    TOOL_CHANNELS,
    UPDATE_CHANNELS,
    UTIL_CHANNELS,
} from "../common/ipc/channels";
import { logCheckpoint, logError, logInfo, logWarn } from "../common/logger";
import {
    AttributeMetadataType,
    EntityRelatedMetadataPath,
    LastUsedToolEntry,
    LastUsedToolUpdate,
    MetadataOperationOptions,
    ModalWindowMessagePayload,
    ModalWindowOptions,
    NativeContextMenuRequest,
    ToolBoxEvent,
} from "../common/types";
import { AuthManager } from "./managers/authManager";
import { AutoUpdateManager } from "./managers/autoUpdateManager";
import { BrowserManager } from "./managers/browserManager";
import { BrowserviewProtocolManager } from "./managers/browserviewProtocolManager";
import { ConnectionsManager } from "./managers/connectionsManager";
import { DataverseManager } from "./managers/dataverseManager";
import { InstallIdManager } from "./managers/installIdManager";
import { LoadingOverlayWindowManager } from "./managers/loadingOverlayWindowManager";
import { ModalWindowManager } from "./managers/modalWindowManager";
import { NotificationWindowManager } from "./managers/notificationWindowManager";
import { ProtocolHandlerManager } from "./managers/protocolHandlerManager";
import { SettingsManager } from "./managers/settingsManager";
import { TerminalManager } from "./managers/terminalManager";
import { ToolBoxUtilityManager } from "./managers/toolboxUtilityManager";
import { ToolFileSystemAccessManager } from "./managers/toolFileSystemAccessManager";
import { ToolManager } from "./managers/toolsManager";
import { ToolWindowManager } from "./managers/toolWindowManager";
import { VersionManager } from "./managers/versionManager";

// Constants
const MENU_CREATION_DEBOUNCE_MS = 150; // Debounce delay for menu recreation during rapid tool switches

// Favicon proxy allowlist: only fetch favicons from these known provider domains and their redirect targets.
const FAVICON_ALLOWED_HOSTS = new Set<string>(["www.google.com"]);
const FAVICON_ALLOWED_HOST_SUFFIXES = [".gstatic.com"];
const FAVICON_MAX_BYTES = 65536; // 64 KB — more than enough for any favicon

const isFaviconAllowedHost = (hostname: string): boolean => {
    if (FAVICON_ALLOWED_HOSTS.has(hostname)) return true;
    return FAVICON_ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
};

class ToolBoxApp {
    private mainWindow: BrowserWindow | null = null;
    private settingsManager: SettingsManager;
    private installIdManager: InstallIdManager;
    private connectionsManager: ConnectionsManager;
    private toolManager: ToolManager;
    private browserviewProtocolManager: BrowserviewProtocolManager;
    private protocolHandlerManager: ProtocolHandlerManager;
    private toolWindowManager: ToolWindowManager | null = null;
    private notificationWindowManager: NotificationWindowManager | null = null;
    private loadingOverlayWindowManager: LoadingOverlayWindowManager | null = null;
    private modalWindowManager: ModalWindowManager | null = null;
    private api: ToolBoxUtilityManager;
    private autoUpdateManager: AutoUpdateManager;
    private browserManager: BrowserManager;
    private authManager: AuthManager;
    private terminalManager: TerminalManager;
    private dataverseManager: DataverseManager;
    private toolFilesystemAccessManager: ToolFileSystemAccessManager;
    private tokenExpiryCheckInterval: NodeJS.Timeout | null = null;
    private notifiedExpiredTokens: Set<string> = new Set(); // Track notified expired tokens
    private menuCreationTimeout: NodeJS.Timeout | null = null; // Debounce timer for menu recreation

    constructor() {
        logCheckpoint("ToolBoxApp constructor started");

        try {
            this.settingsManager = new SettingsManager();
            this.installIdManager = new InstallIdManager(this.settingsManager);

            this.connectionsManager = new ConnectionsManager();
            this.api = new ToolBoxUtilityManager();
            // Pass Supabase credentials and Azure Blob base URL from environment variables
            this.toolManager = new ToolManager(
                path.join(app.getPath("userData"), "tools"),
                process.env.SUPABASE_URL,
                process.env.SUPABASE_ANON_KEY,
                this.installIdManager,
                process.env.AZURE_BLOB_BASE_URL,
            );
            this.browserviewProtocolManager = new BrowserviewProtocolManager(this.toolManager, this.settingsManager);
            this.protocolHandlerManager = new ProtocolHandlerManager();
            this.autoUpdateManager = new AutoUpdateManager();
            this.browserManager = new BrowserManager();
            this.authManager = new AuthManager(this.browserManager);
            this.terminalManager = new TerminalManager();
            this.dataverseManager = new DataverseManager(this.connectionsManager, this.authManager);
            this.toolFilesystemAccessManager = new ToolFileSystemAccessManager();

            this.setupEventListeners();
            this.setupIpcHandlers();

            logCheckpoint("ToolBoxApp constructor completed");
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logError(err);
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

        // Listen to tool update events
        this.toolManager.on("tool:update-started", (toolId) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send(EVENT_CHANNELS.TOOL_UPDATE_STARTED, toolId);
            }
        });

        this.toolManager.on("tool:update-completed", (toolId) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send(EVENT_CHANNELS.TOOL_UPDATE_COMPLETED, toolId);
            }
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
            // Record that an auto-update is pending installation so we can auto-open
            // the What's New tab after the next restart into the new version.
            this.settingsManager.setSetting("pendingWhatsNewVersion", info.version);
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
        ipcMain.removeHandler(CONNECTION_CHANNELS.CHECK_BROWSER_INSTALLED);
        ipcMain.removeHandler(CONNECTION_CHANNELS.GET_BROWSER_PROFILES);
        ipcMain.removeHandler(CONNECTION_CHANNELS.EXPORT_CONNECTIONS);
        ipcMain.removeHandler(CONNECTION_CHANNELS.IMPORT_CONNECTIONS);

        // Tool handlers
        ipcMain.removeHandler(TOOL_CHANNELS.GET_ALL_TOOLS);
        ipcMain.removeHandler(TOOL_CHANNELS.GET_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.LOAD_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.UNLOAD_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.INSTALL_TOOL_FROM_REGISTRY);
        ipcMain.removeHandler(TOOL_CHANNELS.FETCH_REGISTRY_TOOLS);
        ipcMain.removeHandler(TOOL_CHANNELS.CHECK_TOOL_UPDATES);
        ipcMain.removeHandler(TOOL_CHANNELS.UPDATE_TOOL);
        ipcMain.removeHandler(TOOL_CHANNELS.IS_TOOL_UPDATING);
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
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_CONTEXT_MENU);
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_MODAL_WINDOW);
        ipcMain.removeHandler(UTIL_CHANNELS.CLOSE_MODAL_WINDOW);
        ipcMain.removeHandler(UTIL_CHANNELS.SEND_MODAL_MESSAGE);
        ipcMain.removeHandler(UTIL_CHANNELS.COPY_TO_CLIPBOARD);
        ipcMain.removeHandler(UTIL_CHANNELS.SHOW_LOADING);
        ipcMain.removeHandler(UTIL_CHANNELS.HIDE_LOADING);
        ipcMain.removeHandler(UTIL_CHANNELS.GET_CURRENT_THEME);
        ipcMain.removeHandler(UTIL_CHANNELS.GET_EVENT_HISTORY);
        ipcMain.removeHandler(UTIL_CHANNELS.FETCH_FAVICON);
        ipcMain.removeHandler(UTIL_CHANNELS.OPEN_EXTERNAL);

        // Filesystem handlers
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.READ_TEXT);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.READ_BINARY);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.EXISTS);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.STAT);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.READ_DIRECTORY);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.WRITE_TEXT);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.CREATE_DIRECTORY);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.SAVE_FILE);
        ipcMain.removeHandler(FILESYSTEM_CHANNELS.SELECT_PATH);

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
        ipcMain.removeHandler(UPDATE_CHANNELS.GET_VERSION_COMPATIBILITY_INFO);

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
        ipcMain.removeHandler(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.ASSOCIATE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DISASSOCIATE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DEPLOY_SOLUTION);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_IMPORT_JOB_STATUS);
        // Metadata operations
        ipcMain.removeHandler(DATAVERSE_CHANNELS.BUILD_LABEL);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.GET_ATTRIBUTE_ODATA_TYPE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_ENTITY_DEFINITION);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_ENTITY_DEFINITION);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE_ENTITY_DEFINITION);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_ATTRIBUTE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_ATTRIBUTE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE_ATTRIBUTE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_POLYMORPHIC_LOOKUP_ATTRIBUTE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_RELATIONSHIP);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_RELATIONSHIP);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE_RELATIONSHIP);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.CREATE_GLOBAL_OPTION_SET);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_GLOBAL_OPTION_SET);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE_GLOBAL_OPTION_SET);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.INSERT_OPTION_VALUE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.UPDATE_OPTION_VALUE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.DELETE_OPTION_VALUE);
        ipcMain.removeHandler(DATAVERSE_CHANNELS.ORDER_OPTION);
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

            // Determine authentication strategy based on token state
            // Similar to DataverseManager, we proactively refresh tokens expiring within 5 minutes
            let tokenState: "valid" | "needs-refresh" | "needs-auth" = "needs-auth";

            if (connection.accessToken && connection.tokenExpiry) {
                const expiryDate = new Date(connection.tokenExpiry);

                // Validate date parsing
                if (isNaN(expiryDate.getTime())) {
                    logInfo(`[ConnectionAuth] Invalid token expiry date for connection: ${connection.name} (${id})`);
                    tokenState = "needs-auth";
                } else {
                    const now = new Date();
                    const timeUntilExpiry = expiryDate.getTime() - now.getTime();

                    // Token is valid if it won't expire in the next 5 minutes (300,000ms)
                    if (timeUntilExpiry > 5 * 60 * 1000) {
                        tokenState = "valid";
                    } else {
                        // Token is expired or expiring soon - needs refresh
                        tokenState = "needs-refresh";
                    }
                }
            } else if (connection.refreshToken) {
                // No access token but has refresh token - try to refresh
                tokenState = "needs-refresh";
            }

            // Handle valid token - reuse it
            if (tokenState === "valid") {
                // Connection has a valid token with sufficient time remaining, no need to re-authenticate
                // Just update the lastUsedAt timestamp
                this.connectionsManager.updateConnection(id, {
                    lastUsedAt: new Date().toISOString(),
                });

                logInfo(`[ConnectionAuth] Reusing valid token for connection: ${connection.name} (${id})`);

                // Emit event to notify that connection is active
                this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, isActive: true });
                return;
            }

            // Handle token refresh - attempt to refresh expired/expiring token
            if (tokenState === "needs-refresh") {
                logInfo(`[ConnectionAuth] Token expired or expiring soon, attempting refresh for connection: ${connection.name} (${id})`);
                try {
                    let authResult: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string };

                    // Use appropriate refresh strategy based on auth type
                    if (connection.authenticationType === "interactive" && connection.msalAccountId) {
                        // MSAL silent acquisition for modern interactive connections
                        authResult = await this.authManager.acquireTokenSilently(connection);
                    } else if (connection.authenticationType === "clientSecret") {
                        // ConfidentialClientApplication for client secret (automatic caching)
                        authResult = await this.authManager.authenticateClientSecret(connection);
                    } else if (connection.refreshToken) {
                        // Manual refresh for username/password and legacy interactive
                        authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);
                    } else {
                        // No refresh method available, fall through to full authentication
                        throw new Error("No refresh method available");
                    }

                    // Update the connection with new tokens
                    this.connectionsManager.updateConnectionTokens(id, {
                        accessToken: authResult.accessToken,
                        refreshToken: authResult.refreshToken,
                        expiresOn: authResult.expiresOn,
                        msalAccountId: authResult.msalAccountId,
                    });

                    // Clear notification tracking since token is refreshed
                    this.notifiedExpiredTokens.clear();

                    logInfo(`[ConnectionAuth] Token refreshed successfully for connection: ${connection.name} (${id})`);

                    this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, isActive: true });
                    return;
                } catch (error) {
                    // Token refresh failed, fall through to full authentication
                    logInfo(`[ConnectionAuth] Token refresh failed, proceeding with full authentication: ${(error as Error).message}`);
                }
            }

            // No valid token exists or refresh failed, proceed with full authentication
            logInfo(`[ConnectionAuth] Authenticating connection: ${connection.name} (${id})`);

            // Authenticate based on the authentication type
            try {
                let authResult: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string };

                switch (connection.authenticationType) {
                    case "interactive":
                        authResult = await this.authManager.authenticateInteractive(connection);
                        break;
                    case "clientSecret":
                        authResult = await this.authManager.authenticateClientSecret(connection);
                        break;
                    case "usernamePassword":
                        authResult = await this.authManager.authenticateUsernamePassword(connection);
                        break;
                    case "connectionString":
                        // Connection string should have been parsed to its actual auth type
                        // This shouldn't happen, but handle it gracefully
                        throw new Error("Connection string must be parsed before authentication. Please edit the connection to set a specific authentication type.");
                    default:
                        throw new Error("Invalid authentication type");
                }

                // Set the connection with tokens (msalAccountId will be set for interactive auth)
                this.connectionsManager.updateConnectionTokens(id, {
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    expiresOn: authResult.expiresOn,
                    msalAccountId: authResult.msalAccountId,
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
                await this.authManager.testConnection(connection);
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

            try {
                // Use MSAL silent acquisition for interactive auth with MSAL account
                if (connection.authenticationType === "interactive" && connection.msalAccountId) {
                    const tokenResult = await this.authManager.acquireTokenSilently(connection);

                    // Update connection with new token
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: tokenResult.accessToken,
                        refreshToken: connection.refreshToken, // Keep existing refresh token
                        expiresOn: tokenResult.expiresOn,
                    });

                    // Clear notification tracking for this connection since token is refreshed
                    this.notifiedExpiredTokens.clear();

                    this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: connectionId, tokenRefreshed: true });

                    return { success: true };
                }

                // For client secret, use MSAL ConfidentialClientApplication (automatic token caching)
                if (connection.authenticationType === "clientSecret") {
                    const authResult = await this.authManager.authenticateClientSecret(connection);

                    // Update connection with new token
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: authResult.accessToken,
                        refreshToken: undefined, // Client credentials don't use refresh tokens
                        expiresOn: authResult.expiresOn,
                    });

                    // Clear notification tracking for this connection since token is refreshed
                    this.notifiedExpiredTokens.clear();

                    this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: connectionId, tokenRefreshed: true });

                    return { success: true };
                }

                // For username/password with MSAL account ID, use silent token acquisition
                if (connection.authenticationType === "usernamePassword" && connection.msalAccountId) {
                    const tokenResult = await this.authManager.acquireTokenSilently(connection);

                    // Update connection with new token
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: tokenResult.accessToken,
                        refreshToken: undefined, // MSAL handles refresh internally
                        expiresOn: tokenResult.expiresOn,
                        msalAccountId: connection.msalAccountId,
                    });

                    // Clear notification tracking for this connection since token is refreshed
                    this.notifiedExpiredTokens.clear();

                    this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id: connectionId, tokenRefreshed: true });

                    return { success: true };
                }

                // For legacy username/password and interactive without MSAL, use manual refresh with refresh token
                if (!connection.refreshToken) {
                    throw new Error(`No refresh token available for '${connection.name}'. Please reconnect.`);
                }

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
                const errorMessage = `Failed to refresh token for connection '${connection.name}': ${(error as Error).message}`;
                logError(error instanceof Error ? error : new Error(String(error)));
                throw new Error(errorMessage);
            }
        });

        // Browser detection handlers
        ipcMain.handle(CONNECTION_CHANNELS.CHECK_BROWSER_INSTALLED, (_, browserType: string) => {
            return this.browserManager.isBrowserInstalled(browserType);
        });

        ipcMain.handle(CONNECTION_CHANNELS.GET_BROWSER_PROFILES, (_, browserType: string) => {
            return this.browserManager.getBrowserProfiles(browserType);
        });

        // Export connections handler
        ipcMain.handle(CONNECTION_CHANNELS.EXPORT_CONNECTIONS, (_, ids?: string[]) => {
            return this.connectionsManager.exportConnections(ids);
        });

        // Import connections handler
        ipcMain.handle(CONNECTION_CHANNELS.IMPORT_CONNECTIONS, (_, data: unknown) => {
            return this.connectionsManager.importConnections(data);
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

        // Check if a tool is currently updating
        ipcMain.handle(TOOL_CHANNELS.IS_TOOL_UPDATING, (_, toolId) => {
            return this.toolManager.isToolUpdating(toolId);
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

        ipcMain.handle(SETTINGS_CHANNELS.GRANT_CSP_CONSENT, (_, toolId, requiredDomains?: string[], approvedOptionalDomains?: string[]) => {
            this.settingsManager.grantCspConsent(toolId, requiredDomains, approvedOptionalDomains);
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
        ipcMain.handle(SETTINGS_CHANNELS.ADD_LAST_USED_TOOL, (_, payload: LastUsedToolUpdate | string) => {
            if (typeof payload === "string") {
                this.settingsManager.addLastUsedTool({ toolId: payload });
                return;
            }

            this.settingsManager.addLastUsedTool(payload);
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

        ipcMain.handle(UTIL_CHANNELS.SHOW_CONTEXT_MENU, async (event, request: NativeContextMenuRequest) => {
            const window = BrowserWindow.fromWebContents(event.sender) || this.mainWindow;
            if (!window || !request || !Array.isArray(request.items) || request.items.length === 0) {
                return null;
            }

            return await new Promise<string | null>((resolve) => {
                let settled = false;
                const settle = (value: string | null) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    resolve(value);
                };

                const template: MenuItemConstructorOptions[] = request.items.map((item) => {
                    if (item.type === "separator") {
                        return { type: "separator" };
                    }

                    return {
                        label: item.label || "",
                        enabled: item.enabled !== false,
                        click: () => settle(item.id),
                    };
                });

                const menu = Menu.buildFromTemplate(template);
                const popupOptions: Electron.PopupOptions = {
                    window,
                    callback: () => settle(null),
                };

                menu.popup(popupOptions);
            });
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

        // Show loading handler (overlay window above tool panel area only)
        ipcMain.handle(UTIL_CHANNELS.SHOW_LOADING, async (_, message: string) => {
            if (this.loadingOverlayWindowManager && this.mainWindow) {
                try {
                    // Get bounds from the active tool's BrowserView directly
                    const bounds = this.toolWindowManager?.getActiveToolBounds() || undefined;

                    // Show overlay with tool panel bounds (or undefined for full window fallback)
                    this.loadingOverlayWindowManager.show(message || "Loading...", bounds);
                } catch (error) {
                    // Capture bounds retrieval failure for diagnostics, then fall back to full window overlay
                    logError(error instanceof Error ? error : new Error(String(error)));
                    // On error, show without bounds (full window fallback)
                    this.loadingOverlayWindowManager.show(message || "Loading...");
                }
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

        // Troubleshooting handlers
        ipcMain.handle(UTIL_CHANNELS.CHECK_SUPABASE_CONNECTIVITY, async () => {
            return await this.checkSupabaseConnectivity();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_REGISTRY_FILE, async () => {
            return await this.checkRegistryFile();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_USER_SETTINGS, async () => {
            return await this.checkUserSettings();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_TOOL_SETTINGS, async () => {
            return await this.checkToolSettings();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_CONNECTIONS, async () => {
            return await this.checkConnections();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_TOOL_DOWNLOAD, async () => {
            return await this.checkToolDownload();
        });

        ipcMain.handle(UTIL_CHANNELS.CHECK_INTERNET_CONNECTIVITY, async () => {
            return await this.checkInternetConnectivity();
        });

        // Event history handler
        ipcMain.handle(UTIL_CHANNELS.GET_EVENT_HISTORY, (_, limit) => {
            return this.api.getEventHistory(limit);
        });

        // Favicon proxy: fetch a favicon URL server-side and return a base64 data URI.
        // Follows up to 5 https: redirects (Google favicon service uses a 302 to gstatic.com).
        // This bypasses renderer CSP restrictions on external image sources.
        // Only requests to the known favicon provider domains (and their redirect targets) are allowed.
        ipcMain.handle(UTIL_CHANNELS.FETCH_FAVICON, async (_, url: unknown): Promise<string | null> => {
            if (typeof url !== "string") {
                logWarn("[Favicon] Rejected: url is not a string");
                return null;
            }

            const fetchWithRedirects = async (targetUrl: string, hopsLeft: number): Promise<string | null> => {
                let parsedUrl: URL;
                try {
                    parsedUrl = new URL(targetUrl);
                } catch (e) {
                    logWarn(`[Favicon] Rejected: invalid URL — ${(e as Error).message}`);
                    return null;
                }

                if (parsedUrl.protocol !== "https:") {
                    logWarn(`[Favicon] Rejected: non-https URL protocol "${parsedUrl.protocol}"`);
                    return null;
                }

                if (!isFaviconAllowedHost(parsedUrl.hostname)) {
                    logWarn("[Favicon] Rejected: hostname not in favicon provider allowlist");
                    return null;
                }

                const https = await import("https");
                return new Promise<string | null>((resolve) => {
                    const req = https.get(parsedUrl.toString(), { timeout: 5000 }, (res) => {
                        const status = res.statusCode ?? 0;
                        const contentType = res.headers["content-type"] ?? "image/png";

                        // Follow redirects
                        if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && res.headers["location"]) {
                            res.resume();
                            if (hopsLeft <= 0) {
                                logWarn("[Favicon] Too many redirects, giving up");
                                resolve(null);
                                return;
                            }
                            const next = new URL(res.headers["location"], parsedUrl).toString();
                            resolve(fetchWithRedirects(next, hopsLeft - 1));
                            return;
                        }

                        if (status !== 200) {
                            logWarn(`[Favicon] Non-200 status ${status}`);
                            res.resume();
                            resolve(null);
                            return;
                        }

                        const chunks: Buffer[] = [];
                        let totalBytes = 0;
                        let limitExceeded = false;
                        res.on("data", (chunk: Buffer) => {
                            if (limitExceeded) return;
                            totalBytes += chunk.length;
                            if (totalBytes > FAVICON_MAX_BYTES) {
                                limitExceeded = true;
                                logWarn(`[Favicon] Response exceeded max size (${FAVICON_MAX_BYTES} bytes), aborting`);
                                req.destroy();
                                resolve(null);
                                return;
                            }
                            chunks.push(chunk);
                        });
                        res.on("end", () => {
                            if (limitExceeded) return;
                            const buffer = Buffer.concat(chunks);
                            const mimeType = contentType.split(";")[0].trim() || "image/png";
                            resolve(`data:${mimeType};base64,${buffer.toString("base64")}`);
                        });
                        res.on("error", (e) => {
                            logWarn(`[Favicon] Response stream error: ${e.message}`);
                            resolve(null);
                        });
                    });

                    req.on("error", (e) => {
                        logWarn(`[Favicon] Request error: ${e.message}`);
                        resolve(null);
                    });
                    req.on("timeout", () => {
                        logWarn("[Favicon] Request timed out");
                        req.destroy();
                        resolve(null);
                    });
                });
            };

            try {
                return await fetchWithRedirects(url, 5);
            } catch (e) {
                logError(e instanceof Error ? e : new Error(`[Favicon] Unexpected error: ${String(e)}`));
                return null;
            }
        });

        // Open external URL handler
        ipcMain.handle(UTIL_CHANNELS.OPEN_EXTERNAL, async (_, url: unknown) => {
            if (typeof url !== "string") {
                logWarn("Blocked openExternal call with non-string url", { urlType: typeof url });
                return;
            }

            let parsedUrl: URL;
            try {
                parsedUrl = new URL(url);
            } catch {
                logWarn("Blocked openExternal call with invalid url", { url });
                return;
            }

            const allowedProtocols = new Set<string>(["https:", "http:", "mailto:"]);
            if (!allowedProtocols.has(parsedUrl.protocol)) {
                logWarn("Blocked openExternal call with disallowed protocol", { url, protocol: parsedUrl.protocol });
                return;
            }

            await shell.openExternal(parsedUrl.toString());
        });

        // Filesystem handlers with access control
        ipcMain.handle(FILESYSTEM_CHANNELS.READ_TEXT, async (event, filePath: string) => {
            // Validate access if caller is a tool (null instanceId means main window - allow all)
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, filePath);
            }

            const { readText } = await import("./utilities/filesystem.js");
            return await readText(filePath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.READ_BINARY, async (event, filePath: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, filePath);
            }

            const { readBinary } = await import("./utilities/filesystem.js");
            return await readBinary(filePath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.EXISTS, async (event, filePath: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, filePath);
            }

            const { exists } = await import("./utilities/filesystem.js");
            return await exists(filePath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.STAT, async (event, filePath: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, filePath);
            }

            const { stat } = await import("./utilities/filesystem.js");
            return await stat(filePath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.READ_DIRECTORY, async (event, dirPath: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, dirPath);
            }

            const { readDirectory } = await import("./utilities/filesystem.js");
            return await readDirectory(dirPath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.WRITE_TEXT, async (event, filePath: string, content: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, filePath);
            }

            const { writeText } = await import("./utilities/filesystem.js");
            return await writeText(filePath, content);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.CREATE_DIRECTORY, async (event, dirPath: string) => {
            // Validate access if caller is a tool
            const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
            if (instanceId) {
                this.toolFilesystemAccessManager.validateAccess(instanceId, dirPath);
            }

            const { createDirectory } = await import("./utilities/filesystem.js");
            return await createDirectory(dirPath);
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.SAVE_FILE, async (event, defaultPath: string, content: string | Buffer, filters?: Array<{ name: string; extensions: string[] }>) => {
            const { saveFile } = await import("./utilities/filesystem.js");
            const selectedPath = await saveFile(defaultPath, content, filters);

            // Grant access to the selected path if a tool called this and user selected a file
            if (selectedPath) {
                const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
                if (instanceId) {
                    this.toolFilesystemAccessManager.grantAccess(instanceId, selectedPath);
                }
            }

            return selectedPath;
        });

        ipcMain.handle(FILESYSTEM_CHANNELS.SELECT_PATH, async (event, options) => {
            const { selectPath } = await import("./utilities/filesystem.js");
            const selectedPath = await selectPath(options);

            // Grant access to the selected path if a tool called this and user selected something
            if (selectedPath) {
                const instanceId = this.toolWindowManager?.getInstanceIdByWebContents(event.sender.id);
                if (instanceId) {
                    this.toolFilesystemAccessManager.grantAccess(instanceId, selectedPath);
                }
            }

            return selectedPath;
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
        ipcMain.handle(TERMINAL_CHANNELS.CREATE_TERMINAL, async (_, toolId, instanceId, options) => {
            return await this.terminalManager.createTerminal(toolId, instanceId ?? null, options);
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

        ipcMain.handle(TERMINAL_CHANNELS.GET_TOOL_TERMINALS, (_, toolId, instanceId) => {
            return this.terminalManager.getToolTerminals(toolId, instanceId ?? null);
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

        ipcMain.handle(UPDATE_CHANNELS.GET_VERSION_COMPATIBILITY_INFO, () => {
            return {
                appVersion: this.autoUpdateManager.getCurrentVersion(),
                minSupportedApiVersion: VersionManager.getMinSupportedApiVersion(),
            };
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
            async (event, entityLogicalName: string, relatedPath: EntityRelatedMetadataPath, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => {
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

        ipcMain.handle(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS, async (event, tableLogicalName?: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);

                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.publishCustomizations(connectionId, tableLogicalName);
                return { success: true };
            } catch (error) {
                throw new Error(`Dataverse publishCustomizations failed: ${(error as Error).message}`);
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

        ipcMain.handle(
            DATAVERSE_CHANNELS.ASSOCIATE,
            async (
                event,
                primaryEntityName: string,
                primaryEntityId: string,
                relationshipName: string,
                relatedEntityName: string,
                relatedEntityId: string,
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
                    return await this.dataverseManager.associate(connectionId, primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId);
                } catch (error) {
                    throw new Error(`Dataverse associate failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.DISASSOCIATE,
            async (event, primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.disassociate(connectionId, primaryEntityName, primaryEntityId, relationshipName, relatedEntityId);
                } catch (error) {
                    throw new Error(`Dataverse disassociate failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.DEPLOY_SOLUTION,
            async (
                event,
                base64SolutionContent: string | ArrayBuffer | ArrayBufferView,
                options?: {
                    importJobId?: string;
                    publishWorkflows?: boolean;
                    overwriteUnmanagedCustomizations?: boolean;
                    skipProductUpdateDependencies?: boolean;
                    convertToManaged?: boolean;
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
                    return await this.dataverseManager.deploySolution(connectionId, base64SolutionContent, options);
                } catch (error) {
                    throw new Error(`Dataverse deploySolution failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.GET_IMPORT_JOB_STATUS, async (event, importJobId: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.getImportJobStatus(connectionId, importJobId);
            } catch (error) {
                throw new Error(`Dataverse getImportJobStatus failed: ${(error as Error).message}`);
            }
        });

        // Get CSDL document endpoint
        ipcMain.handle(DATAVERSE_CHANNELS.GET_CSDL_DOCUMENT, async (event, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.getCSDLDocument(connectionId);
            } catch (error) {
                throw new Error(`Get CSDL document failed: ${(error as Error).message}`);
            }
        });

        // Dataverse Metadata Helper Utilities
        ipcMain.handle(DATAVERSE_CHANNELS.BUILD_LABEL, async (event, text: string, languageCode?: number) => {
            try {
                return this.dataverseManager.buildLabel(text, languageCode);
            } catch (error) {
                throw new Error(`Build label failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.GET_ATTRIBUTE_ODATA_TYPE, async (event, attributeType: string) => {
            try {
                // Validate attributeType is a valid enum value
                const validTypes = Object.values(AttributeMetadataType);
                if (!validTypes.includes(attributeType as AttributeMetadataType)) {
                    throw new Error(`Invalid attribute type: "${attributeType}". Valid types are: ${validTypes.join(", ")}`);
                }
                return this.dataverseManager.getAttributeODataType(attributeType as AttributeMetadataType);
            } catch (error) {
                throw new Error(`Get attribute OData type failed: ${(error as Error).message}`);
            }
        });

        // Entity (Table) Metadata CRUD Operations
        ipcMain.handle(
            DATAVERSE_CHANNELS.CREATE_ENTITY_DEFINITION,
            async (event, entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.createEntityDefinition(connectionId, entityDefinition, options);
                } catch (error) {
                    throw new Error(`Create entity definition failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.UPDATE_ENTITY_DEFINITION,
            async (event, entityIdentifier: string, entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    await this.dataverseManager.updateEntityDefinition(connectionId, entityIdentifier, entityDefinition, options);
                    return { success: true };
                } catch (error) {
                    throw new Error(`Update entity definition failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE_ENTITY_DEFINITION, async (event, entityIdentifier: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.deleteEntityDefinition(connectionId, entityIdentifier);
                return { success: true };
            } catch (error) {
                throw new Error(`Delete entity definition failed: ${(error as Error).message}`);
            }
        });

        // Attribute (Column) Metadata CRUD Operations
        ipcMain.handle(
            DATAVERSE_CHANNELS.CREATE_ATTRIBUTE,
            async (event, entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.createAttribute(connectionId, entityLogicalName, attributeDefinition, options);
                } catch (error) {
                    throw new Error(`Create attribute failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.UPDATE_ATTRIBUTE,
            async (
                event,
                entityLogicalName: string,
                attributeIdentifier: string,
                attributeDefinition: Record<string, unknown>,
                options?: MetadataOperationOptions,
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
                    await this.dataverseManager.updateAttribute(connectionId, entityLogicalName, attributeIdentifier, attributeDefinition, options);
                    return { success: true };
                } catch (error) {
                    throw new Error(`Update attribute failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE_ATTRIBUTE, async (event, entityLogicalName: string, attributeIdentifier: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.deleteAttribute(connectionId, entityLogicalName, attributeIdentifier);
                return { success: true };
            } catch (error) {
                throw new Error(`Delete attribute failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(
            DATAVERSE_CHANNELS.CREATE_POLYMORPHIC_LOOKUP_ATTRIBUTE,
            async (event, entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.createPolymorphicLookupAttribute(connectionId, entityLogicalName, attributeDefinition, options);
                } catch (error) {
                    throw new Error(`Create polymorphic lookup attribute failed: ${(error as Error).message}`);
                }
            },
        );

        // Relationship Metadata CRUD Operations
        ipcMain.handle(
            DATAVERSE_CHANNELS.CREATE_RELATIONSHIP,
            async (event, relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.createRelationship(connectionId, relationshipDefinition, options);
                } catch (error) {
                    throw new Error(`Create relationship failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.UPDATE_RELATIONSHIP,
            async (event, relationshipIdentifier: string, relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    await this.dataverseManager.updateRelationship(connectionId, relationshipIdentifier, relationshipDefinition, options);
                    return { success: true };
                } catch (error) {
                    throw new Error(`Update relationship failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE_RELATIONSHIP, async (event, relationshipIdentifier: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.deleteRelationship(connectionId, relationshipIdentifier);
                return { success: true };
            } catch (error) {
                throw new Error(`Delete relationship failed: ${(error as Error).message}`);
            }
        });

        // Global Option Set (Choice) CRUD Operations
        ipcMain.handle(
            DATAVERSE_CHANNELS.CREATE_GLOBAL_OPTION_SET,
            async (event, optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    return await this.dataverseManager.createGlobalOptionSet(connectionId, optionSetDefinition, options);
                } catch (error) {
                    throw new Error(`Create global option set failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(
            DATAVERSE_CHANNELS.UPDATE_GLOBAL_OPTION_SET,
            async (event, optionSetIdentifier: string, optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => {
                try {
                    const connectionId =
                        connectionTarget === "secondary"
                            ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                            : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                    if (!connectionId) {
                        const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                        throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                    }
                    await this.dataverseManager.updateGlobalOptionSet(connectionId, optionSetIdentifier, optionSetDefinition, options);
                    return { success: true };
                } catch (error) {
                    throw new Error(`Update global option set failed: ${(error as Error).message}`);
                }
            },
        );

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE_GLOBAL_OPTION_SET, async (event, optionSetIdentifier: string, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                await this.dataverseManager.deleteGlobalOptionSet(connectionId, optionSetIdentifier);
                return { success: true };
            } catch (error) {
                throw new Error(`Delete global option set failed: ${(error as Error).message}`);
            }
        });

        // Option Value Modification Actions
        ipcMain.handle(DATAVERSE_CHANNELS.INSERT_OPTION_VALUE, async (event, params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.insertOptionValue(connectionId, params);
            } catch (error) {
                throw new Error(`Insert option value failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.UPDATE_OPTION_VALUE, async (event, params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.updateOptionValue(connectionId, params);
            } catch (error) {
                throw new Error(`Update option value failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.DELETE_OPTION_VALUE, async (event, params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.deleteOptionValue(connectionId, params);
            } catch (error) {
                throw new Error(`Delete option value failed: ${(error as Error).message}`);
            }
        });

        ipcMain.handle(DATAVERSE_CHANNELS.ORDER_OPTION, async (event, params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => {
            try {
                const connectionId =
                    connectionTarget === "secondary"
                        ? this.toolWindowManager?.getSecondaryConnectionIdByWebContents(event.sender.id)
                        : this.toolWindowManager?.getConnectionIdByWebContents(event.sender.id);
                if (!connectionId) {
                    const targetMsg = connectionTarget === "secondary" ? "secondary connection" : "connection";
                    throw new Error(`No ${targetMsg} found for this tool instance. Please ensure the tool is connected to an environment.`);
                }
                return await this.dataverseManager.orderOption(connectionId, params);
            } catch (error) {
                throw new Error(`Order option failed: ${(error as Error).message}`);
            }
        });
    }
    /**
     * Create application menu
     */
    private createMenu(): void {
        const isMac = process.platform === "darwin";
        const isToolOpened = this.toolWindowManager?.getActiveToolId() !== null;
        const favoriteTools = (this.settingsManager.getFavoriteTools() || []).slice(0, 5);
        const recentTools = (this.settingsManager.getLastUsedTools() || []).slice(-10).reverse();
        const favoriteSubmenuItems = this.buildFavoriteToolShortcutMenuItems(favoriteTools);
        const recentSubmenuItems = this.buildRecentToolShortcutMenuItems(recentTools);

        const fileSubmenu: MenuItemConstructorOptions[] = [
            {
                label: "Open Recent",
                submenu: recentSubmenuItems.length > 0 ? recentSubmenuItems : [{ label: "No recent tools", enabled: false }],
            },
            {
                label: "Open Favorite",
                submenu: favoriteSubmenuItems.length > 0 ? favoriteSubmenuItems : [{ label: "No favorite tools", enabled: false }],
            },
            { type: "separator" },
            isMac ? { role: "close" } : { role: "quit" },
        ];

        const template: any[] = [
            // App menu (macOS only)
            ...(isMac
                ? [
                      {
                          label: "Power Platform ToolBox",
                          submenu: [
                              { role: "services" },
                              { type: "separator" },
                              { label: "Hide Power Platform ToolBox", role: "hide" },
                              { role: "hideOthers" },
                              { role: "unhide" },
                              { type: "separator" },
                              { label: "Quit Power Platform ToolBox", role: "quit" },
                          ],
                      },
                  ]
                : []),

            // File menu
            {
                label: "File",
                submenu: fileSubmenu,
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
                    {
                        label: "Settings",
                        accelerator: isMac ? "Command+," : "Ctrl+,",
                        click: () => {
                            if (this.mainWindow) {
                                this.mainWindow.webContents.send(EVENT_CHANNELS.OPEN_SETTINGS);
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
                        label: "Troubleshooting",
                        click: () => {
                            this.showTroubleshootingModal();
                        },
                    },
                    {
                        label: "What's New",
                        click: () => {
                            this.sendWhatsNewRequest("menu");
                        },
                    },
                    { type: "separator" },
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
                    {
                        label: "Join our Discord community!",
                        click: async () => {
                            await shell.openExternal("https://discord.gg/efwAu9sXyJ");
                        },
                    },
                    { type: "separator" },
                    ...(isToolOpened
                        ? [
                              {
                                  label: "Tool Feedback",
                                  accelerator: isMac ? "Alt+Command+F" : "Ctrl+Shift+F",
                                  click: async () => {
                                      const repositoryUrl = this.toolWindowManager?.getActiveToolRepositoryUrl();
                                      if (repositoryUrl) {
                                          await shell.openExternal(repositoryUrl);
                                      } else {
                                          const result = await dialog.showMessageBox(this.mainWindow!, {
                                              type: "info",
                                              title: "Tool Feedback",
                                              message: "The tool creator has not provided specific support links for this tool.",
                                              detail: "To share feedback or raise concerns, you can join the Power Platform ToolBox community Discord directly.",
                                              buttons: ["Open Discord", "Close"],
                                              defaultId: 0,
                                              cancelId: 1,
                                          });
                                          if (result.response === 0) {
                                              await shell.openExternal("https://discord.gg/efwAu9sXyJ");
                                          }
                                      }
                                  },
                              },
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
                          ]
                        : []),
                    {
                        label: "ToolBox Feedback",
                        click: async () => {
                            await shell.openExternal("https://github.com/PowerPlatformToolBox/desktop-app");
                        },
                    },
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

    private buildFavoriteToolShortcutMenuItems(toolIds: string[]): MenuItemConstructorOptions[] {
        if (!toolIds || toolIds.length === 0) {
            return [];
        }

        return toolIds.map((toolId) => {
            const tool = this.toolManager.getTool(toolId);
            const manifest = tool ? null : this.toolManager.getInstalledManifestSync(toolId);
            const label = tool?.name || manifest?.name || toolId;
            const enabled = Boolean(tool || manifest);

            return {
                label,
                enabled,
                click: () => this.sendToolLaunchRequest(toolId, "favorite"),
            };
        });
    }

    private buildRecentToolShortcutMenuItems(entries: LastUsedToolEntry[]): MenuItemConstructorOptions[] {
        if (!entries || entries.length === 0) {
            return [];
        }

        return entries.map((entry) => {
            const tool = this.toolManager.getTool(entry.toolId);
            const manifest = tool ? null : this.toolManager.getInstalledManifestSync(entry.toolId);
            const baseLabel = tool?.name || manifest?.name || entry.toolId;
            const connectionLabel = entry.primaryConnection?.name || entry.primaryConnection?.url || entry.primaryConnection?.id || null;
            const label = connectionLabel ? `${baseLabel} (${connectionLabel})` : baseLabel;
            const enabled = Boolean(tool || manifest);

            return {
                label,
                enabled,
                click: () =>
                    this.sendToolLaunchRequest(entry.toolId, "recent", {
                        primaryConnectionId: entry.primaryConnection?.id ?? null,
                        secondaryConnectionId: entry.secondaryConnection?.id ?? null,
                    }),
            };
        });
    }

    private sendToolLaunchRequest(toolId: string, source: "recent" | "favorite", connectionContext?: { primaryConnectionId?: string | null; secondaryConnectionId?: string | null }): void {
        if (!this.mainWindow) {
            return;
        }

        const payload = {
            event: "menu:launch-tool",
            data: {
                toolId,
                source,
                primaryConnectionId: connectionContext?.primaryConnectionId ?? null,
                secondaryConnectionId: connectionContext?.secondaryConnectionId ?? null,
            },
            timestamp: new Date().toISOString(),
        };

        this.mainWindow.webContents.send(EVENT_CHANNELS.TOOLBOX_EVENT, payload);
    }

    private sendWhatsNewRequest(source: "menu" | "auto-update", version?: string): void {
        if (!this.mainWindow) {
            return;
        }

        const payload = {
            event: "menu:show-whats-new",
            data: {
                source,
                ...(version ? { version } : {}),
            },
            timestamp: new Date().toISOString(),
        };

        const webContents = this.mainWindow.webContents;
        const deliver = (): void => {
            if (!webContents.isDestroyed()) {
                webContents.send(EVENT_CHANNELS.TOOLBOX_EVENT, payload);
            }
        };

        if (webContents.isLoading()) {
            webContents.once("did-finish-load", deliver);
        } else {
            deliver();
        }
    }

    /**
     * Debounced menu creation to prevent excessive menu recreation during rapid tool switches.
     * This method cancels any pending menu recreation and schedules a new one after a short delay.
     */
    private debouncedCreateMenu(): void {
        // Clear any existing timeout
        if (this.menuCreationTimeout) {
            clearTimeout(this.menuCreationTimeout);
        }

        // Schedule menu creation after a short delay
        this.menuCreationTimeout = setTimeout(() => {
            this.createMenu();
            this.menuCreationTimeout = null;
        }, MENU_CREATION_DEBOUNCE_MS);
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
            title: "Power Platform ToolBox",
            icon: path.join(__dirname, "../../assets/icon.png"),
        });

        // Initialize ToolWindowManager for managing tool BrowserViews
        this.toolWindowManager = new ToolWindowManager(
            this.mainWindow,
            this.browserviewProtocolManager,
            this.connectionsManager,
            this.settingsManager,
            this.toolManager,
            this.terminalManager,
            this.toolFilesystemAccessManager,
        );

        // Set up callback to rebuild menu when active tool changes (debounced to prevent excessive recreation)
        this.toolWindowManager.setOnActiveToolChanged(() => {
            this.debouncedCreateMenu();
        });

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

        // After the renderer is ready, auto-open What's New if an auto-update was installed.
        this.mainWindow.webContents.once("did-finish-load", () => {
            this.openWhatsNewIfPending();
        });

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
     * Includes install ID and other important information for diagnostics
     */
    private showAboutDialog(): void {
        if (!this.mainWindow) {
            return;
        }

        const appVersion = app.getVersion();
        const installId = this.installIdManager.getInstallId();
        const locale = app.getLocale();

        const payload = {
            appVersion,
            installId,
            locale,
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            chromeVersion: process.versions.chrome,
            platform: process.platform,
            arch: process.arch,
            osVersion: process.getSystemVersion(),
        };

        const webContents = this.mainWindow.webContents;
        const deliver = (): void => {
            if (!webContents.isDestroyed()) {
                webContents.send(EVENT_CHANNELS.SHOW_ABOUT, payload);
            }
        };

        if (webContents.isLoading()) {
            webContents.once("did-finish-load", deliver);
        } else {
            deliver();
        }
    }

    /**
     * Show Troubleshooting modal
     * Displays a modal for diagnosing connectivity and configuration issues
     */
    private showTroubleshootingModal(): void {
        if (!this.mainWindow) return;

        // Send message to renderer to open the troubleshooting modal
        this.mainWindow.webContents.send("open-troubleshooting-modal");
    }

    private openWhatsNewIfPending(): void {
        const pendingVersion = this.settingsManager.getSetting("pendingWhatsNewVersion");
        if (!pendingVersion || typeof pendingVersion !== "string" || pendingVersion.trim().length === 0) {
            return;
        }

        const currentVersion = app.getVersion();
        if (pendingVersion.trim() !== currentVersion) {
            return;
        }

        // Clear first so the tab only auto-opens once.
        this.settingsManager.setSetting("pendingWhatsNewVersion", null);
        this.sendWhatsNewRequest("auto-update", currentVersion);
    }

    /**
     * Check Supabase connectivity
     * Tests if the Supabase API is accessible
     */
    private async checkSupabaseConnectivity(): Promise<{ success: boolean; message?: string }> {
        try {
            // Use the toolManager to check connectivity by fetching tools
            const tools = await this.toolManager.fetchAvailableTools();
            if (tools && Array.isArray(tools)) {
                logInfo(`[Troubleshooting] Supabase connectivity check passed: ${tools.length} tools found`);
                return { success: true, message: `Connected successfully. Found ${tools.length} tools in registry.` };
            }
            logWarn("[Troubleshooting] Supabase returned invalid data");
            return { success: false, message: "Unable to fetch tools from registry" };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Unknown error connecting to Supabase",
            };
        }
    }

    /**
     * Check if the local registry file exists and is valid
     */
    private async checkRegistryFile(): Promise<{ success: boolean; message?: string; toolCount?: number }> {
        try {
            const toolsDirectory = path.join(app.getPath("userData"), "tools");

            if (!fs.existsSync(toolsDirectory)) {
                logWarn("[Troubleshooting] Tools directory missing for local registry check");
                return {
                    success: false,
                    message: "Tools directory not found. Launch a tool at least once to initialize it.",
                };
            }

            const manifestPath = path.join(toolsDirectory, "manifest.json");
            if (!fs.existsSync(manifestPath)) {
                logWarn("[Troubleshooting] Local manifest file not found");
                return {
                    success: false,
                    message: "Local manifest file not found under tools directory",
                };
            }

            const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
            const manifestJson = JSON.parse(manifestRaw);
            const tools = Array.isArray(manifestJson?.tools) ? manifestJson.tools : [];

            logInfo(`[Troubleshooting] Local manifest check passed with ${tools.length} entries`);
            return {
                success: true,
                message: `Local manifest found (${tools.length} recorded tools)`,
                toolCount: tools.length,
            };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to read local manifest",
            };
        }
    }

    /**
     * Check baseline internet connectivity by reaching GitHub
     */
    private async checkInternetConnectivity(): Promise<{ success: boolean; message?: string }> {
        const INTERNET_CHECK_URL = "https://api.github.com/zen";

        try {
            const response = await fetch(INTERNET_CHECK_URL, {
                method: "GET",
                headers: { "User-Agent": "PowerPlatformToolBox" },
            });

            if (response.ok) {
                logInfo(`[Troubleshooting] Internet connectivity check passed: HTTP ${response.status}`);
                return {
                    success: true,
                    message: "Internet connectivity verified via GitHub",
                };
            }
            logWarn("[Troubleshooting] Internet connectivity check returned non-OK status");
            return {
                success: false,
                message: `Internet connectivity check failed: HTTP ${response.status}`,
            };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Network error during internet connectivity check",
            };
        }
    }

    /**
     * Check tool download capability
     * Tests downloading a tool package from Azure Blob Storage (when configured) or
     * falls back to checking reachability of the registry endpoint.
     */
    private async checkToolDownload(): Promise<{ success: boolean; message?: string }> {
        const azureBlobBaseUrl = process.env.AZURE_BLOB_BASE_URL || "";
        const TEST_TOOL_DOWNLOAD_URL = azureBlobBaseUrl
            ? `${azureBlobBaseUrl.replace(/\/$/, "")}/test/pptb-standard-sample-tool-download-test.tar.gz`
            : "https://github.com/PowerPlatformToolBox/pptb-web/releases/download/test/pptb-standard-sample-tool-download-test.tar.gz";
        const tempDir = path.join(app.getPath("temp"), "pptb-download-test");
        const downloadPath = path.join(tempDir, "pptb-standard-sample-tool-download-test.tar.gz");

        try {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const downloadSource = azureBlobBaseUrl ? "Azure Blob Storage" : "GitHub release";
            logInfo(`[Troubleshooting] Testing download from ${downloadSource}: ${TEST_TOOL_DOWNLOAD_URL}`);

            await new Promise<void>((resolve, reject) => {
                const download = (url: string, redirectDepth = 0) => {
                    const protocol = url.startsWith("https") ? https : http;
                    const request = protocol.get(url, (res) => {
                        if ((res.statusCode === 302 || res.statusCode === 301) && res.headers.location) {
                            if (redirectDepth > 5) {
                                reject(new Error("Too many redirects while downloading test tool"));
                                return;
                            }
                            logInfo(`[Troubleshooting] Following redirect to ${res.headers.location}`);
                            download(res.headers.location, redirectDepth + 1);
                            return;
                        }

                        if (res.statusCode !== 200) {
                            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                            return;
                        }

                        const fileStream = createWriteStream(downloadPath);
                        res.pipe(fileStream);

                        fileStream.on("finish", () => {
                            fileStream.close();
                            resolve();
                        });

                        fileStream.on("error", (err) => {
                            if (fs.existsSync(downloadPath)) {
                                fs.unlinkSync(downloadPath);
                            }
                            reject(err);
                        });
                    });

                    request.on("error", (err) => {
                        reject(new Error(`Network error: ${err.message}`));
                    });

                    request.setTimeout(30000, () => {
                        request.destroy();
                        reject(new Error("Download timeout after 30 seconds"));
                    });
                };

                download(TEST_TOOL_DOWNLOAD_URL);
            });

            const stats = fs.statSync(downloadPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            fs.unlinkSync(downloadPath);
            fs.rmSync(tempDir, { recursive: true, force: true });

            return {
                success: true,
                message: `Successfully downloaded tool package from ${azureBlobBaseUrl ? "Azure Blob Storage" : "GitHub release"} (${fileSizeMB} MB)`,
            };
        } catch (error) {
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                logWarn("[Troubleshooting] Failed to clean up download test artifacts");
            }

            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Unknown error during download test",
            };
        }
    }

    /**
     * Check user settings file
     * Verifies that user settings can be loaded and are valid
     */
    private async checkUserSettings(): Promise<{ success: boolean; message?: string }> {
        try {
            const settings = this.settingsManager.getUserSettings();
            if (!settings) {
                logError("[Troubleshooting] User settings returned null or undefined");
                return {
                    success: false,
                    message: "User settings file could not be loaded",
                };
            }

            // Verify essential settings exist
            const hasTheme = settings.theme !== undefined;
            const hasAutoUpdate = settings.autoUpdate !== undefined;

            if (!hasTheme || !hasAutoUpdate) {
                const missingFields = [];
                if (!hasTheme) missingFields.push("theme");
                if (!hasAutoUpdate) missingFields.push("autoUpdate");

                logWarn("[Troubleshooting] User settings missing required fields");

                return {
                    success: false,
                    message: `User settings missing required fields: ${missingFields.join(", ")}`,
                };
            }

            logInfo(`[Troubleshooting] User settings check passed with ${Object.keys(settings).length} properties`);
            return {
                success: true,
                message: `User settings loaded successfully (${Object.keys(settings).length} properties)`,
            };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to load user settings",
            };
        }
    }

    /**
     * Check tool settings storage
     * Verifies that tool settings can be accessed
     */
    private async checkToolSettings(): Promise<{ success: boolean; message?: string }> {
        try {
            const installedTools = this.toolManager.getAllTools();
            let toolSettingsCount = 0;

            // Try to read settings for each installed tool
            for (const tool of installedTools) {
                try {
                    const toolSettings = this.settingsManager.getToolSettings(tool.id);
                    if (toolSettings && Object.keys(toolSettings).length > 0) {
                        toolSettingsCount++;
                    }
                } catch (toolError) {
                    // Log individual tool setting errors but don't fail the check
                    logInfo(`[Troubleshooting] Could not load settings for tool ${tool.id}: ${toolError}`);
                }
            }

            logInfo(`[Troubleshooting] Tool settings check passed: ${toolSettingsCount} tools with settings out of ${installedTools.length} loaded tools`);
            return {
                success: true,
                message: `Tool settings accessible (${toolSettingsCount} configured out of ${installedTools.length} loaded tools)`,
            };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to access tool settings",
            };
        }
    }

    /**
     * Check connections storage
     * Verifies that connections can be loaded and are valid
     */
    private async checkConnections(): Promise<{ success: boolean; message?: string; connectionCount?: number }> {
        try {
            const connections = this.connectionsManager.getConnections();

            if (!Array.isArray(connections)) {
                logError("[Troubleshooting] Connections is not an array");
                return {
                    success: false,
                    message: "Connections data is corrupted (not an array)",
                };
            }

            // Verify connections have required fields
            let validConnections = 0;
            const invalidConnections = [];

            for (const conn of connections) {
                if (conn.id && conn.name && conn.url) {
                    validConnections++;
                } else {
                    invalidConnections.push({
                        id: conn.id || "missing",
                        name: conn.name || "missing",
                        hasUrl: !!conn.url,
                    });
                }
            }

            if (invalidConnections.length > 0) {
                logWarn("[Troubleshooting] Some connections have invalid structure");
            }

            logInfo(`[Troubleshooting] Connections check passed: ${validConnections} valid connections out of ${connections.length} total`);
            return {
                success: true,
                message: `Connections loaded successfully (${validConnections} valid out of ${connections.length} total)`,
                connectionCount: validConnections,
            };
        } catch (error) {
            logError(error as Error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to load connections",
            };
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
            }

            // Register custom protocol scheme before app is ready
            this.browserviewProtocolManager.registerScheme();

            // Register deep link protocol handler (pptb://)
            this.protocolHandlerManager.registerScheme();

            // Initialize early protocol listeners (single-instance lock, open-url, second-instance)
            // MUST be called before app.whenReady() so no deep link is missed.
            this.protocolHandlerManager.initialize();

            await app.whenReady();
            logCheckpoint("Electron app ready");

            // Register protocol handler after app is ready
            this.browserviewProtocolManager.registerHandler();

            this.createWindow();
            logCheckpoint("Main window created");

            // Set up deep link protocol handler callback after the main window exists.
            // The callback defers IPC delivery until the renderer has finished loading so
            // that protocol URLs captured during startup (buffered in pendingUrls) are
            // reliably delivered even on a cold launch via pptb://.
            this.protocolHandlerManager.setupProtocolHandler(async (action, params) => {
                logInfo(`[ProtocolHandler] Received ${action} request for tool: ${params.toolId}`);

                // Bring app window to focus
                if (this.mainWindow) {
                    if (this.mainWindow.isMinimized()) {
                        this.mainWindow.restore();
                    }
                    this.mainWindow.focus();
                }

                // Deliver the IPC event to the renderer.  If the renderer is still
                // loading (e.g. cold launch via protocol URL), defer until it finishes.
                if (this.mainWindow) {
                    const webContents = this.mainWindow.webContents;
                    const deliver = (): void => {
                        if (!webContents.isDestroyed()) {
                            webContents.send(EVENT_CHANNELS.PROTOCOL_INSTALL_TOOL_REQUEST, {
                                toolId: params.toolId,
                                toolName: params.toolName,
                            });
                        }
                    };

                    if (webContents.isLoading()) {
                        webContents.once("did-finish-load", deliver);
                    } else {
                        deliver();
                    }
                }
            });

            // Load all installed tools from registry
            try {
                await this.toolManager.loadAllInstalledTools();
                logCheckpoint("Tools loaded from registry");
            } catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)));
            }

            // Check if auto-update is enabled
            const autoUpdate = this.settingsManager.getSetting("autoUpdate");
            if (autoUpdate) {
                // Enable automatic update checks every 6 hours
                this.autoUpdateManager.enableAutoUpdateChecks(6);
            }

            // Clear any msal caches on startup
            await this.authManager.cleanup();
            this.connectionsManager.clearAllConnectionTokens();

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
                logCheckpoint("Application shutting down");
                // Clean up update checks
                this.autoUpdateManager.disableAutoUpdateChecks();
                // Clean up token expiry checks
                this.stopTokenExpiryChecks();
                // Clean up MSAL instances
                this.authManager.cleanup();
                // Clean up connection tokens
                this.connectionsManager.clearAllConnectionTokens();
            });

            logCheckpoint("Application initialization completed successfully");
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logError(err);
            logCheckpoint("Application initialization failed", { error: err.message });
            throw error;
        }
    }
}

// Create and initialize the application
const toolboxApp = new ToolBoxApp();
toolboxApp.initialize().catch((error) => {
    logError(error instanceof Error ? error : new Error(String(error)));
});
