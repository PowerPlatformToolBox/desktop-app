import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script that exposes safe APIs to the renderer process
 * This is for the main PPTB UI, not for tools
 */
contextBridge.exposeInMainWorld("toolboxAPI", {
    // Settings - Only for PPTB UI
    getUserSettings: () => ipcRenderer.invoke("get-user-settings"),
    updateUserSettings: (settings: unknown) => ipcRenderer.invoke("update-user-settings", settings),
    getSetting: (key: string) => ipcRenderer.invoke("get-setting", key),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke("set-setting", key, value),

    // Connections namespace - organized like in the iframe
    connections: {
        add: (connection: unknown) => ipcRenderer.invoke("add-connection", connection),
        update: (id: string, updates: unknown) => ipcRenderer.invoke("update-connection", id, updates),
        delete: (id: string) => ipcRenderer.invoke("delete-connection", id),
        getAll: () => ipcRenderer.invoke("get-connections"),
        setActive: (id: string) => ipcRenderer.invoke("set-active-connection", id),
        getActiveConnection: () => ipcRenderer.invoke("get-active-connection"),
        disconnect: () => ipcRenderer.invoke("disconnect-connection"),
        test: (connection: unknown) => ipcRenderer.invoke("test-connection", connection),
    },

    // Tools - Only for PPTB UI
    getAllTools: () => ipcRenderer.invoke("get-all-tools"),
    getTool: (toolId: string) => ipcRenderer.invoke("get-tool", toolId),
    loadTool: (packageName: string) => ipcRenderer.invoke("load-tool", packageName),
    unloadTool: (toolId: string) => ipcRenderer.invoke("unload-tool", toolId),
    installTool: (packageName: string) => ipcRenderer.invoke("install-tool", packageName),
    uninstallTool: (packageName: string, toolId: string) => ipcRenderer.invoke("uninstall-tool", packageName, toolId),
    getToolWebviewHtml: (packageName: string) => ipcRenderer.invoke("get-tool-webview-html", packageName),
    getToolContext: (packageName: string, connectionUrl?: string) => ipcRenderer.invoke("get-tool-context", packageName, connectionUrl),
    getLatestToolVersion: (packageName: string) => ipcRenderer.invoke("get-latest-tool-version", packageName),
    updateTool: (packageName: string) => ipcRenderer.invoke("update-tool", packageName),

    // Tool Settings - Only for PPTB UI
    getToolSettings: (toolId: string) => ipcRenderer.invoke("get-tool-settings", toolId),
    updateToolSettings: (toolId: string, settings: unknown) => ipcRenderer.invoke("update-tool-settings", toolId, settings),

    // Utils namespace - organized like in the iframe
    utils: {
        showNotification: (options: unknown) => ipcRenderer.invoke("show-notification", options),
        copyToClipboard: (text: string) => ipcRenderer.invoke("copy-to-clipboard", text),
        saveFile: (defaultPath: string, content: unknown) => ipcRenderer.invoke("save-file", defaultPath, content),
        getCurrentTheme: () => Promise.resolve("light" as const), // Stub for now
    },

    // External URL - Only for PPTB UI
    openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

    // Terminal namespace - organized like in the iframe
    terminal: {
        create: (toolId: string, options: unknown) => ipcRenderer.invoke("create-terminal", toolId, options),
        execute: (terminalId: string, command: string) => ipcRenderer.invoke("execute-terminal-command", terminalId, command),
        close: (terminalId: string) => ipcRenderer.invoke("close-terminal", terminalId),
        get: (terminalId: string) => ipcRenderer.invoke("get-terminal", terminalId),
        list: (toolId: string) => ipcRenderer.invoke("get-tool-terminals", toolId),
        listAll: () => ipcRenderer.invoke("get-all-terminals"),
        setVisibility: (terminalId: string, visible: boolean) => ipcRenderer.invoke("set-terminal-visibility", terminalId, visible),
    },

    // Events namespace - organized like in the iframe
    events: {
        getHistory: (limit?: number) => ipcRenderer.invoke("get-event-history", limit),
        on: (callback: (event: unknown, payload: unknown) => void) => {
            ipcRenderer.on("toolbox-event", callback);
        },
        off: (callback: (event: unknown, payload: unknown) => void) => {
            ipcRenderer.removeListener("toolbox-event", callback);
        },
    },

    // Auto-update - Only for PPTB UI
    checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),
    onUpdateChecking: (callback: () => void) => {
        ipcRenderer.on("update-checking", callback);
    },
    onUpdateAvailable: (callback: (info: unknown) => void) => {
        ipcRenderer.on("update-available", (_, info) => callback(info));
    },
    onUpdateNotAvailable: (callback: () => void) => {
        ipcRenderer.on("update-not-available", callback);
    },
    onUpdateDownloadProgress: (callback: (progress: unknown) => void) => {
        ipcRenderer.on("update-download-progress", (_, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: (info: unknown) => void) => {
        ipcRenderer.on("update-downloaded", (_, info) => callback(info));
    },
    onUpdateError: (callback: (error: string) => void) => {
        ipcRenderer.on("update-error", (_, error) => callback(error));
    },

    // Home page - Only for PPTB UI
    onShowHomePage: (callback: () => void) => {
        ipcRenderer.on("show-home-page", callback);
    },

    // Authentication dialogs - Only for PPTB UI
    onShowDeviceCodeDialog: (callback: (message: string) => void) => {
        ipcRenderer.on("show-device-code-dialog", (_, message) => callback(message));
    },
    onCloseDeviceCodeDialog: (callback: () => void) => {
        ipcRenderer.on("close-device-code-dialog", callback);
    },
    onShowAuthErrorDialog: (callback: (message: string) => void) => {
        ipcRenderer.on("show-auth-error-dialog", (_, message) => callback(message));
    },

    // Dataverse API - Can be called by tools via message routing
    dataverse: {
        create: (entityLogicalName: string, record: Record<string, unknown>) => ipcRenderer.invoke("dataverse.create", entityLogicalName, record),
        retrieve: (entityLogicalName: string, id: string, columns?: string[]) => ipcRenderer.invoke("dataverse.retrieve", entityLogicalName, id, columns),
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => ipcRenderer.invoke("dataverse.update", entityLogicalName, id, record),
        delete: (entityLogicalName: string, id: string) => ipcRenderer.invoke("dataverse.delete", entityLogicalName, id),
        retrieveMultiple: (fetchXml: string) => ipcRenderer.invoke("dataverse.retrieveMultiple", fetchXml),
        execute: (request: { entityName?: string; entityId?: string; operationName: string; operationType: "action" | "function"; parameters?: Record<string, unknown> }) =>
            ipcRenderer.invoke("dataverse.execute", request),
        fetchXmlQuery: (fetchXml: string) => ipcRenderer.invoke("dataverse.fetchXmlQuery", fetchXml),
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) =>
            ipcRenderer.invoke("dataverse.getEntityMetadata", entityLogicalName, searchByLogicalName, selectColumns),
        getAllEntitiesMetadata: () => ipcRenderer.invoke("dataverse.getAllEntitiesMetadata"),
        getEntityRelatedMetadata: (entityLogicalName: string, relatedPath: string, selectColumns?: string[]) =>
            ipcRenderer.invoke("dataverse.getEntityRelatedMetadata", entityLogicalName, relatedPath, selectColumns),
        getSolutions: (selectColumns: string[]) => ipcRenderer.invoke("dataverse.getSolutions", selectColumns),
        queryData: (odataQuery: string) => ipcRenderer.invoke("dataverse.queryData", odataQuery),
    },
});
