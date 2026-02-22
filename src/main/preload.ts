import { contextBridge, ipcRenderer } from "electron";
import {
    CONNECTION_CHANNELS,
    DATAVERSE_CHANNELS,
    EVENT_CHANNELS,
    FILESYSTEM_CHANNELS,
    SETTINGS_CHANNELS,
    TERMINAL_CHANNELS,
    TOOL_CHANNELS,
    TOOL_WINDOW_CHANNELS,
    UPDATE_CHANNELS,
    UTIL_CHANNELS,
} from "../common/ipc/channels";
import type { EntityRelatedMetadataPath, EntityRelatedMetadataResponse, LastUsedToolUpdate } from "../common/types";

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
        checkBrowserInstalled: (browserType: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.CHECK_BROWSER_INSTALLED, browserType),
        getBrowserProfiles: (browserType: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.GET_BROWSER_PROFILES, browserType),
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
    isToolUpdating: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.IS_TOOL_UPDATING, toolId),

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
    addLastUsedTool: (entry: LastUsedToolUpdate) => ipcRenderer.invoke(SETTINGS_CHANNELS.ADD_LAST_USED_TOOL, entry),
    getLastUsedTools: () => ipcRenderer.invoke(SETTINGS_CHANNELS.GET_LAST_USED_TOOLS),
    clearLastUsedTools: () => ipcRenderer.invoke(SETTINGS_CHANNELS.CLEAR_LAST_USED_TOOLS),

    // Webview URL generation - Only for PPTB UI
    getToolWebviewUrl: (toolId: string) => ipcRenderer.invoke(TOOL_CHANNELS.GET_TOOL_WEBVIEW_URL, toolId),

    // Utils namespace - organized like in the iframe
    utils: {
        showNotification: (options: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SHOW_NOTIFICATION, options),
        copyToClipboard: (text: string) => ipcRenderer.invoke(UTIL_CHANNELS.COPY_TO_CLIPBOARD, text),
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

    // Troubleshooting namespace - organized like other features
    troubleshooting: {
        checkSupabaseConnectivity: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_SUPABASE_CONNECTIVITY),
        checkRegistryFile: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_REGISTRY_FILE),
        checkUserSettings: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_USER_SETTINGS),
        checkToolSettings: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_TOOL_SETTINGS),
        checkConnections: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_CONNECTIONS),
        checkSentryLogging: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_SENTRY_LOGGING),
        checkToolDownload: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_TOOL_DOWNLOAD),
        checkInternetConnectivity: () => ipcRenderer.invoke(UTIL_CHANNELS.CHECK_INTERNET_CONNECTIVITY),
    },

    // FileSystem namespace - filesystem operations
    fileSystem: {
        readText: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.READ_TEXT, path),
        readBinary: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.READ_BINARY, path),
        exists: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.EXISTS, path),
        stat: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.STAT, path),
        readDirectory: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.READ_DIRECTORY, path),
        writeText: (path: string, content: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.WRITE_TEXT, path, content),
        createDirectory: (path: string) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.CREATE_DIRECTORY, path),
        saveFile: (defaultPath: string, content: unknown, filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.SAVE_FILE, defaultPath, content, filters),
        selectPath: (options?: unknown) => ipcRenderer.invoke(FILESYSTEM_CHANNELS.SELECT_PATH, options),
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

    // Tool update events
    onToolUpdateStarted: (callback: (toolId: string) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.TOOL_UPDATE_STARTED, (_, toolId) => callback(toolId));
    },
    onToolUpdateCompleted: (callback: (toolId: string) => void) => {
        ipcRenderer.on(EVENT_CHANNELS.TOOL_UPDATE_COMPLETED, (_, toolId) => callback(toolId));
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
        getEntityRelatedMetadata: <P extends EntityRelatedMetadataPath>(entityLogicalName: string, relatedPath: P, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA, entityLogicalName, relatedPath, selectColumns, connectionTarget) as Promise<EntityRelatedMetadataResponse<P>>,
        getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_SOLUTIONS, selectColumns, connectionTarget),
        getCSDLDocument: (connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_CSDL_DOCUMENT, connectionTarget),
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.QUERY_DATA, odataQuery, connectionTarget),
        publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS, tableLogicalName, connectionTarget),
        createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        getEntitySetName: (entityLogicalName: string) => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME, entityLogicalName),
        associate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.ASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId, connectionTarget),
        disassociate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.DISASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityId, connectionTarget),
        deploySolution: (
            base64SolutionContent: string | ArrayBuffer | ArrayBufferView,
            options?: {
                importJobId?: string;
                publishWorkflows?: boolean;
                overwriteUnmanagedCustomizations?: boolean;
                skipProductUpdateDependencies?: boolean;
                convertToManaged?: boolean;
            },
            connectionTarget?: "primary" | "secondary",
        ) => ipcRenderer.invoke(DATAVERSE_CHANNELS.DEPLOY_SOLUTION, base64SolutionContent, options, connectionTarget),
        getImportJobStatus: (importJobId: string, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_IMPORT_JOB_STATUS, importJobId, connectionTarget),
        // Metadata helper utilities
        buildLabel: (text: string, languageCode?: number) => ipcRenderer.invoke(DATAVERSE_CHANNELS.BUILD_LABEL, text, languageCode),
        getAttributeODataType: (attributeType: string) => ipcRenderer.invoke(DATAVERSE_CHANNELS.GET_ATTRIBUTE_ODATA_TYPE, attributeType),
        // Entity (Table) metadata operations
        createEntityDefinition: (entityDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_ENTITY_DEFINITION, entityDefinition, options, connectionTarget),
        updateEntityDefinition: (entityIdentifier: string, entityDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_ENTITY_DEFINITION, entityIdentifier, entityDefinition, options, connectionTarget),
        deleteEntityDefinition: (entityIdentifier: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE_ENTITY_DEFINITION, entityIdentifier, connectionTarget),
        // Attribute (Column) metadata operations
        createAttribute: (entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_ATTRIBUTE, entityLogicalName, attributeDefinition, options, connectionTarget),
        updateAttribute: (
            entityLogicalName: string,
            attributeIdentifier: string,
            attributeDefinition: Record<string, unknown>,
            options?: Record<string, unknown>,
            connectionTarget?: "primary" | "secondary",
        ) => ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_ATTRIBUTE, entityLogicalName, attributeIdentifier, attributeDefinition, options, connectionTarget),
        deleteAttribute: (entityLogicalName: string, attributeIdentifier: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE_ATTRIBUTE, entityLogicalName, attributeIdentifier, connectionTarget),
        createPolymorphicLookupAttribute: (entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_POLYMORPHIC_LOOKUP_ATTRIBUTE, entityLogicalName, attributeDefinition, options, connectionTarget),
        // Relationship metadata operations
        createRelationship: (relationshipDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_RELATIONSHIP, relationshipDefinition, options, connectionTarget),
        updateRelationship: (relationshipIdentifier: string, relationshipDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_RELATIONSHIP, relationshipIdentifier, relationshipDefinition, options, connectionTarget),
        deleteRelationship: (relationshipIdentifier: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE_RELATIONSHIP, relationshipIdentifier, connectionTarget),
        // Global option set (choice) metadata operations
        createGlobalOptionSet: (optionSetDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.CREATE_GLOBAL_OPTION_SET, optionSetDefinition, options, connectionTarget),
        updateGlobalOptionSet: (optionSetIdentifier: string, optionSetDefinition: Record<string, unknown>, options?: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_GLOBAL_OPTION_SET, optionSetIdentifier, optionSetDefinition, options, connectionTarget),
        deleteGlobalOptionSet: (optionSetIdentifier: string, connectionTarget?: "primary" | "secondary") =>
            ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE_GLOBAL_OPTION_SET, optionSetIdentifier, connectionTarget),
        // Option value modification actions
        insertOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.INSERT_OPTION_VALUE, params, connectionTarget),
        updateOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.UPDATE_OPTION_VALUE, params, connectionTarget),
        deleteOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.DELETE_OPTION_VALUE, params, connectionTarget),
        orderOption: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcRenderer.invoke(DATAVERSE_CHANNELS.ORDER_OPTION, params, connectionTarget),
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
