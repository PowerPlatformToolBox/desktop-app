import { contextBridge, ipcRenderer } from "electron";
import {
    CONNECTION_CHANNELS,
    DATAVERSE_CHANNELS,
    EVENT_CHANNELS,
    SETTINGS_CHANNELS,
    TERMINAL_CHANNELS,
    TOOL_CHANNELS,
    TOOL_WINDOW_CHANNELS,
    UPDATE_CHANNELS,
    UTIL_CHANNELS,
} from "../common/ipc/channels";

/**
 * Preload script that exposes safe APIs to the renderer process
 * This is for the main PPTB UI, not for tools
 */
contextBridge.exposeInMainWorld("toolboxAPI", {
    // Settings - Only for PPTB UI
    getUserSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_USER_SETTINGS),
    updateUserSettings: (settings: unknown) => ipcRenderer.invoke(SETTINGS_CHANNELS.UPDATE_USER_SETTINGS, settings),
    getSetting: (key: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_SETTING, key),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke(SETTINGS_CHANNELS.SET_SETTING, key, value),

    // Connections namespace - organized like in the iframe
    connections: {
        add: (connection: unknown) => ipcRenderer.invoke(CONNECTION_CHANNELS.ADD_CONNECTION, connection),
        update: (id: string, updates: unknown) => ipcRenderer.invoke(CONNECTION_CHANNELS.UPDATE_CONNECTION, id, updates),
        delete: (id: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.DELETE_CONNECTION, id),
        getAll: () => ipcRenderer.invoke(CONNECTION_CHANNELS.GET_CONNECTIONS),
        getById: (connectionId: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID, connectionId),
        test: (connection: unknown) => ipcRenderer.invoke(CONNECTION_CHANNELS.TEST_CONNECTION, connection),
        isTokenExpired: (connectionId: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.IS_TOKEN_EXPIRED, connectionId),
        refreshToken: (connectionId: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.REFRESH_TOKEN, connectionId),
        authenticate: (connectionId: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.SET_ACTIVE_CONNECTION, connectionId),
    },

    // Tools - Only for PPTB UI
    getAllTools: () => ipcRenderer.invoke(TOOL_CHANNELS.GET_ALL_TOOLS),
    getTool: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL, toolId),
    loadTool: (packageName: string) => ipcRenderer.invoke(TOOL_CHANNELS.LOAD_TOOL, packageName),
    unloadTool: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.UNLOAD_TOOL, toolId),
    installTool: (packageName: string) => ipcRenderer.invoke(TOOL_CHANNELS.INSTALL_TOOL, packageName),
    uninstallTool: (packageName: string, toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.UNINSTALL_TOOL, packageName, toolId),
    getToolWebviewHtml: (packageName: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL_WEBVIEW_HTML, packageName),
    getToolContext: (packageName: string, connectionUrl?: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL_CONTEXT, packageName, connectionUrl),

    // Tool Window Management (NEW - BrowserView based)
    launchToolWindow: (instanceId: string, tool: unknown, primaryConnectionId: string | null, secondaryConnectionId?: string | null) =>
        ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.LAUNCH, instanceId, tool, primaryConnectionId, secondaryConnectionId),
    switchToolWindow: (instanceId: string) => ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.SWITCH, instanceId),
    closeToolWindow: (instanceId: string) => ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.CLOSE, instanceId),
    getActiveToolWindow: () => ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.GET_ACTIVE),
    getOpenToolWindows: () => ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.GET_OPEN_TOOLS),
    updateToolConnection: (instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null) =>
        ipcRenderer.invoke(TOOL_WINDOW_CHANNELS.UPDATE_TOOL_CONNECTION, instanceId, primaryConnectionId, secondaryConnectionId),

    // Favorite tools - Only for PPTB UI
    addFavoriteTool: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.ADD_FAVORITE_TOOL, toolId),
    removeFavoriteTool: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.REMOVE_FAVORITE_TOOL, toolId),
    getFavoriteTools: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_FAVORITE_TOOLS),
    isFavoriteTool: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.IS_FAVORITE_TOOL, toolId),
    toggleFavoriteTool: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.TOGGLE_FAVORITE_TOOL, toolId),

    // Local tool development (DEBUG MODE)
    loadLocalTool: (localPath: string) => ipcRenderer.invoke(TOOL_CHANNELS.LOAD_LOCAL_TOOL, localPath),
    getLocalToolWebviewHtml: (localPath: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_LOCAL_TOOL_WEBVIEW_HTML, localPath),
    openDirectoryPicker: () => ipcRenderer.invoke(TOOL_CHANNELS.OPEN_DIRECTORY_PICKER),

    // Registry-based tools (new primary method)
    fetchRegistryTools: () => ipcRenderer.invoke(TOOL_CHANNELS.FETCH_REGISTRY_TOOLS),
    installToolFromRegistry: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.INSTALL_TOOL_FROM_REGISTRY, toolId),
    checkToolUpdates: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.CHECK_TOOL_UPDATES, toolId),
    updateTool: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.UPDATE_TOOL, toolId),

    // Tool Settings - Only for PPTB UI
    getToolSettings: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_TOOL_SETTINGS, toolId),
    updateToolSettings: (toolId: string, settings: unknown) => ipcRenderer.invoke(SETTINGS_CHANNELS.UPDATE_TOOL_SETTINGS, toolId, settings),

    // CSP consent management - Only for PPTB UI
    hasCspConsent: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.HAS_CSP_CONSENT, toolId),
    grantCspConsent: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.GRANT_CSP_CONSENT, toolId),
    revokeCspConsent: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.REVOKE_CSP_CONSENT, toolId),
    getCspConsents: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_CSP_CONSENTS),

    // Tool-Connection mapping - Only for PPTB UI
    setToolConnection: (toolId: string, connectionId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.SET_TOOL_CONNECTION, toolId, connectionId),
    getToolConnection: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_TOOL_CONNECTION, toolId),
    removeToolConnection: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.REMOVE_TOOL_CONNECTION, toolId),
    getAllToolConnections: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_ALL_TOOL_CONNECTIONS),

    // Tool secondary connection management
    setToolSecondaryConnection: (toolId: string, connectionId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.SET_TOOL_SECONDARY_CONNECTION, toolId, connectionId),
    getToolSecondaryConnection: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_TOOL_SECONDARY_CONNECTION, toolId),
    removeToolSecondaryConnection: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.REMOVE_TOOL_SECONDARY_CONNECTION, toolId),
    getAllToolSecondaryConnections: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_ALL_TOOL_SECONDARY_CONNECTIONS),

    // Recently used tools - Only for PPTB UI
    addLastUsedTool: (toolId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.ADD_LAST_USED_TOOL, toolId),
    getLastUsedTools: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_LAST_USED_TOOLS),
    clearLastUsedTools: () => ipcRenderer.invoke(SETTINGS_CHANNELS.CLEAR_LAST_USED_TOOLS),

    // Webview URL generation - Only for PPTB UI
    getToolWebviewUrl: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL_WEBVIEW_URL, toolId),

    // Utils namespace - organized like in the iframe
    utils: {
        showNotification: (options: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SHOW_NOTIFICATION, options),
        copyToClipboard: (text: string) => ipcRenderer.invoke(UTIL_CHANNELS.COPY_TO_CLIPBOARD, text),
        saveFile: (defaultPath: string, content: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SAVE_FILE, defaultPath, content),
        getCurrentTheme: () => ipcRenderer.invoke(UTIL_CHANNELS.GET_CURRENT_THEME),
        executeParallel: async <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => {
            // Convert any functions to promises and execute all in parallel
            const promises = operations.map((op) => (typeof op === "function" ? op() : op));
            return Promise.all(promises);
        },
        showLoading: (message?: string) => ipcRenderer.invoke(UTIL_CHANNELS.SHOW_LOADING, message),
        hideLoading: () => ipcRenderer.invoke(UTIL_CHANNELS.HIDE_LOADING),
        showModalWindow: (options: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SHOW_MODAL_WINDOW, options),
        closeModalWindow: () => ipcRenderer.invoke(UTIL_CHANNELS.CLOSE_MODAL_WINDOW),
        sendModalMessage: (payload: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SEND_MODAL_MESSAGE, payload),
    },

    // External URL - Only for PPTB UI
    openExternal: (url: string) => ipcRenderer.invoke(UTIL_CHANNELS.OPEN_EXTERNAL, url),

    // Terminal namespace - organized like in the iframe
    terminal: {
        create: (toolId: string, options: unknown) => ipcRenderer.invoke(TERMINAL_CHANNELS.CREATE_TERMINAL, toolId, options),
        execute: (terminalId: string, command: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.EXECUTE_COMMAND, terminalId, command),
        close: (terminalId: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.CLOSE_TERMINAL, terminalId),
        get: (terminalId: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.GET_TERMINAL, terminalId),
        list: (toolId: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.GET_TOOL_TERMINALS, toolId),
        listAll: () => ipcRenderer.invoke(TERMINAL_CHANNELS.GET_ALL_TERMINALS),
        setVisibility: (terminalId: string, visible: boolean) => ipcRenderer.invoke(TERMINAL_CHANNELS.SET_VISIBILITY, terminalId, visible),
    },

    // Events namespace - organized like in the iframe
    events: {
        getHistory: (limit?: number) => ipcRenderer.invoke(UTIL_CHANNELS.GET_EVENT_HISTORY, limit),
        on: (callback: (event: unknown, payload: unknown) => void) => {
            ipcRenderer.on(EVENT_CHANNELS.TOOLBOX_EVENT, callback);
        },
        off: (callback: (event: unknown, payload: unknown) => void) => {
            ipcRenderer.removeListener(EVENT_CHANNELS.TOOLBOX_EVENT, callback);
        },
    },

    // Auto-update - Only for PPTB UI
    checkForUpdates: () => ipcRenderer.invoke(UPDATE_CHANNELS.CHECK_FOR_UPDATES),
    downloadUpdate: () => ipcRenderer.invoke(UPDATE_CHANNELS.DOWNLOAD_UPDATE),
    quitAndInstall: () => ipcRenderer.invoke(UPDATE_CHANNELS.QUIT_AND_INSTALL),
    getAppVersion: () => ipcRenderer.invoke(UPDATE_CHANNELS.GET_APP_VERSION),
    onUpdateChecking: (callback: () => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_CHECKING, callback);
    },
    onUpdateAvailable: (callback: (info: unknown) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_AVAILABLE, (_, info) => callback(info));
    },
    onUpdateNotAvailable: (callback: () => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_NOT_AVAILABLE, callback);
    },
    onUpdateDownloadProgress: (callback: (progress: unknown) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, (_, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: (info: unknown) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_DOWNLOADED, (_, info) => callback(info));
    },
    onUpdateError: (callback: (error: string) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.UPDATE_ERROR, (_, error) => callback(error));
    },

    // Home page - Only for PPTB UI
    onShowHomePage: (callback: () => void) => {
        ipcRenderer.on(EVENT_CHANNELS.SHOW_HOME_PAGE, callback);
    },

    // Authentication dialogs - Only for PPTB UI
    onShowDeviceCodeDialog: (callback: (message: string) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.SHOW_DEVICE_CODE_DIALOG, (_, message) => callback(message));
    },
    onCloseDeviceCodeDialog: (callback: () => void) => {
        ipcRenderer.on(EVENT_CHANNELS.CLOSE_DEVICE_CODE_DIALOG, callback);
    },
    onShowAuthErrorDialog: (callback: (message: string) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.SHOW_AUTH_ERROR_DIALOG, (_, message) => callback(message));
    },

    // Token expiry event
    onTokenExpired: (callback: (data: { connectionId: string; connectionName: string }) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.TOKEN_EXPIRED, (_, data) => callback(data));
    },

    // Dataverse API - Can be called by tools via message routing
    dataverse: {
        create: (entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE, entityLogicalName, record, connectionTarget),
        retrieve: (entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.RETRIEVE, entityLogicalName, id, columns, connectionTarget),
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE, entityLogicalName, id, record, connectionTarget),
        delete: (entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE, entityLogicalName, id, connectionTarget),
        retrieveMultiple: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.RETRIEVE_MULTIPLE, fetchXml, connectionTarget),
        execute: (
            request: { entityName?: string; entityId?: string; operationName: string; operationType: "action" | "function"; parameters?: Record<string, unknown> },
            connectionTarget?: "primary" | "secondary",
        ) => ipcRenderer.invoke(DATAVERSE_CHANNELS.EXECUTE, request, connectionTarget),
        fetchXmlQuery: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.FETCH_XML_QUERY, fetchXml, connectionTarget),
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ENTITY_METADATA, entityLogicalName, searchByLogicalName, selectColumns, connectionTarget),
        getAllEntitiesMetadata: (selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ALL_ENTITIES_METADATA, selectColumns, connectionTarget),
        getEntityRelatedMetadata: (entityLogicalName: string, relatedPath: string, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA, entityLogicalName, relatedPath, selectColumns, connectionTarget),
        getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_SOLUTIONS, selectColumns, connectionTarget),
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.QUERY_DATA, odataQuery, connectionTarget),
        publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS, tableLogicalName, connectionTarget),
        createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        getEntitySetName: (entityLogicalName: string) => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME, entityLogicalName),
    },
});

// Expose a simple API namespace for renderer IPC events
contextBridge.exposeInMainWorld("api", {
    on: (channel: string, callback: (...args: unknown[]) => void) => {
        ipcRenderer.on(channel, callback);
    },
    invoke: (channel: string, ...args: unknown[]) => {
        return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel: string, ...args: unknown[]) => {
        ipcRenderer.send(channel, ...args);
    },
});
