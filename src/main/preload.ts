import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script that exposes safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld("toolboxAPI", {
    // Settings
    getUserSettings: () => ipcRenderer.invoke("get-user-settings"),
    updateUserSettings: (settings: unknown) => ipcRenderer.invoke("update-user-settings", settings),
    getSetting: (key: string) => ipcRenderer.invoke("get-setting", key),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke("set-setting", key, value),

    // Connections
    addConnection: (connection: unknown) => ipcRenderer.invoke("add-connection", connection),
    updateConnection: (id: string, updates: unknown) => ipcRenderer.invoke("update-connection", id, updates),
    deleteConnection: (id: string) => ipcRenderer.invoke("delete-connection", id),
    getConnections: () => ipcRenderer.invoke("get-connections"),
    setActiveConnection: (id: string) => ipcRenderer.invoke("set-active-connection", id),
    getActiveConnection: () => ipcRenderer.invoke("get-active-connection"),
    disconnectConnection: () => ipcRenderer.invoke("disconnect-connection"),

    // Tools
    getAllTools: () => ipcRenderer.invoke("get-all-tools"),
    getTool: (toolId: string) => ipcRenderer.invoke("get-tool", toolId),
    loadTool: (packageName: string) => ipcRenderer.invoke("load-tool", packageName),
    unloadTool: (toolId: string) => ipcRenderer.invoke("unload-tool", toolId),
    installTool: (packageName: string) => ipcRenderer.invoke("install-tool", packageName),
    uninstallTool: (packageName: string, toolId: string) => ipcRenderer.invoke("uninstall-tool", packageName, toolId),
    getToolWebviewHtml: (packageName: string) => ipcRenderer.invoke("get-tool-webview-html", packageName),
    getToolContext: (packageName: string, connectionUrl?: string, accessToken?: string) => ipcRenderer.invoke("get-tool-context", packageName, connectionUrl, accessToken),

    // Tool Settings
    getToolSettings: (toolId: string) => ipcRenderer.invoke("get-tool-settings", toolId),
    updateToolSettings: (toolId: string, settings: unknown) => ipcRenderer.invoke("update-tool-settings", toolId, settings),

    // Notifications
    showNotification: (options: unknown) => ipcRenderer.invoke("show-notification", options),

    // Clipboard
    copyToClipboard: (text: string) => ipcRenderer.invoke("copy-to-clipboard", text),

    // File operations
    saveFile: (defaultPath: string, content: unknown) => ipcRenderer.invoke("save-file", defaultPath, content),

    // External URL
    openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

    // Events
    getEventHistory: (limit?: number) => ipcRenderer.invoke("get-event-history", limit),
    onToolboxEvent: (callback: (event: unknown, payload: unknown) => void) => {
        ipcRenderer.on("toolbox-event", callback);
    },
    removeToolboxEventListener: (callback: (event: unknown, payload: unknown) => void) => {
        ipcRenderer.removeListener("toolbox-event", callback);
    },

    // Auto-update
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

    // Terminal operations
    isTerminalAvailable: () => ipcRenderer.invoke("terminal:is-available"),
    getAvailableShells: () => ipcRenderer.invoke("terminal:get-available-shells"),
    createTerminal: (options: unknown) => ipcRenderer.invoke("terminal:create", options),
    writeToTerminal: (terminalId: string, data: string) => ipcRenderer.invoke("terminal:write", terminalId, data),
    executeCommand: (terminalId: string, command: string, timeout?: number) => 
        ipcRenderer.invoke("terminal:execute-command", terminalId, command, timeout),
    resizeTerminal: (terminalId: string, cols: number, rows: number) => 
        ipcRenderer.invoke("terminal:resize", terminalId, cols, rows),
    disposeTerminal: (terminalId: string) => ipcRenderer.invoke("terminal:dispose", terminalId),
    getAllTerminals: () => ipcRenderer.invoke("terminal:get-all"),
    getTerminal: (terminalId: string) => ipcRenderer.invoke("terminal:get", terminalId),
    
    // Home page
    onShowHomePage: (callback: () => void) => {
        ipcRenderer.on("show-home-page", callback);
    },
});
