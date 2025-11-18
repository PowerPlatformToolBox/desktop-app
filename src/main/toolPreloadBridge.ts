/**
 * Tool Preload Bridge
 * 
 * This script runs in each tool's BrowserView before the tool loads.
 * It exposes the toolboxAPI to the tool via contextBridge, providing
 * secure access to PPTB functionality through IPC.
 * 
 * This is similar to extension host preload scripts, providing isolated contexts.
 */

import { contextBridge, ipcRenderer } from "electron";

// Tool context received from main process
let toolContext: any = null;

// Listen for context from main process
ipcRenderer.on("toolbox:context", (event, context) => {
    toolContext = context;
    console.log("[ToolPreloadBridge] Received tool context:", context);
});

// Helper to make IPC calls and return promises
function ipcInvoke(channel: string, ...args: any[]): Promise<any> {
    return ipcRenderer.invoke(channel, ...args);
}

// Expose toolboxAPI to the tool window
contextBridge.exposeInMainWorld("toolboxAPI", {
    // Tool Info
    getToolContext: () => toolContext,

    // Connections API
    connections: {
        getActiveConnection: () => ipcInvoke("get-active-connection"),
        getAll: () => ipcInvoke("get-connections"),
        setActive: (connectionId: string) => ipcInvoke("set-active-connection", connectionId),
        add: (connection: any) => ipcInvoke("add-connection", connection),
        update: (id: string, updates: any) => ipcInvoke("update-connection", id, updates),
        delete: (id: string) => ipcInvoke("delete-connection", id),
        test: (connection: any) => ipcInvoke("test-connection", connection),
        disconnect: () => ipcInvoke("disconnect-connection"),
        isTokenExpired: (connectionId: string) => ipcInvoke("is-connection-token-expired", connectionId),
        refreshToken: (connectionId: string) => ipcInvoke("refresh-connection-token", connectionId),
    },

    // Dataverse API
    dataverse: {
        create: (entityLogicalName: string, record: Record<string, unknown>) => 
            ipcInvoke("dataverse.create", entityLogicalName, record),
        retrieve: (entityLogicalName: string, id: string, columns?: string[]) => 
            ipcInvoke("dataverse.retrieve", entityLogicalName, id, columns),
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => 
            ipcInvoke("dataverse.update", entityLogicalName, id, record),
        delete: (entityLogicalName: string, id: string) => 
            ipcInvoke("dataverse.delete", entityLogicalName, id),
        retrieveMultiple: (fetchXml: string) => 
            ipcInvoke("dataverse.retrieveMultiple", fetchXml),
        execute: (request: any) => 
            ipcInvoke("dataverse.execute", request),
        fetchXmlQuery: (fetchXml: string) => 
            ipcInvoke("dataverse.fetchXmlQuery", fetchXml),
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) => 
            ipcInvoke("dataverse.getEntityMetadata", entityLogicalName, searchByLogicalName, selectColumns),
        getAllEntitiesMetadata: () => 
            ipcInvoke("dataverse.getAllEntitiesMetadata"),
        getEntityRelatedMetadata: (entityLogicalName: string, relatedPath: string, selectColumns?: string[]) => 
            ipcInvoke("dataverse.getEntityRelatedMetadata", entityLogicalName, relatedPath, selectColumns),
        getSolutions: (selectColumns: string[]) => 
            ipcInvoke("dataverse.getSolutions", selectColumns),
        queryData: (odataQuery: string) => 
            ipcInvoke("dataverse.queryData", odataQuery),
    },

    // Utils API
    utils: {
        showNotification: (options: any) => ipcInvoke("show-notification", options),
        openExternal: (url: string) => ipcInvoke("open-external", url),
        copyToClipboard: (text: string) => ipcInvoke("copy-to-clipboard", text),
        saveFile: (defaultPath: string, content: any) => ipcInvoke("save-file", defaultPath, content),
        getCurrentTheme: () => ipcInvoke("get-current-theme"),
        showLoading: (message?: string) => ipcInvoke("show-loading", message),
        hideLoading: () => ipcInvoke("hide-loading"),
        executeParallel: async (...operations: Array<Promise<any> | (() => Promise<any>)>) => {
            const promises = operations.map(op => typeof op === "function" ? op() : op);
            return Promise.all(promises);
        },
    },

    // Terminal API
    terminal: {
        create: (options: any) => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("create-terminal", toolContext.toolId, options);
        },
        execute: (terminalId: string, command: string) => 
            ipcInvoke("execute-terminal-command", terminalId, command),
        close: (terminalId: string) => 
            ipcInvoke("close-terminal", terminalId),
        get: (terminalId: string) => 
            ipcInvoke("get-terminal", terminalId),
        list: () => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("get-tool-terminals", toolContext.toolId);
        },
        listAll: () => 
            ipcInvoke("get-all-terminals"),
        setVisibility: (terminalId: string, visible: boolean) => 
            ipcInvoke("set-terminal-visibility", terminalId, visible),
    },

    // Events API
    events: {
        on: (callback: (event: any, payload: any) => void) => {
            const listener = (event: any, payload: any) => callback(event, payload);
            ipcRenderer.on("toolbox-event", listener);
            return () => ipcRenderer.removeListener("toolbox-event", listener);
        },
        off: (callback: (event: any, payload: any) => void) => {
            ipcRenderer.removeListener("toolbox-event", callback);
        },
        getHistory: (limit?: number) => 
            ipcInvoke("get-event-history", limit),
    },

    // Settings API (tool-specific)
    settings: {
        getSettings: () => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("tool-settings-get-all", toolContext.toolId);
        },
        getSetting: (key: string) => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("tool-settings-get", toolContext.toolId, key);
        },
        setSetting: (key: string, value: any) => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("tool-settings-set", toolContext.toolId, key, value);
        },
        setSettings: (settings: any) => {
            if (!toolContext?.toolId) {
                throw new Error("Tool context not initialized");
            }
            return ipcInvoke("tool-settings-set-all", toolContext.toolId, settings);
        },
    },
});

// Also expose dataverseAPI as a direct alias (for tools that use it directly)
contextBridge.exposeInMainWorld("dataverseAPI", {
    create: (entityLogicalName: string, record: Record<string, unknown>) => 
        ipcInvoke("dataverse.create", entityLogicalName, record),
    retrieve: (entityLogicalName: string, id: string, columns?: string[]) => 
        ipcInvoke("dataverse.retrieve", entityLogicalName, id, columns),
    update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => 
        ipcInvoke("dataverse.update", entityLogicalName, id, record),
    delete: (entityLogicalName: string, id: string) => 
        ipcInvoke("dataverse.delete", entityLogicalName, id),
    retrieveMultiple: (fetchXml: string) => 
        ipcInvoke("dataverse.retrieveMultiple", fetchXml),
    execute: (request: any) => 
        ipcInvoke("dataverse.execute", request),
    fetchXmlQuery: (fetchXml: string) => 
        ipcInvoke("dataverse.fetchXmlQuery", fetchXml),
    getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) => 
        ipcInvoke("dataverse.getEntityMetadata", entityLogicalName, searchByLogicalName, selectColumns),
    getAllEntitiesMetadata: () => 
        ipcInvoke("dataverse.getAllEntitiesMetadata"),
    getEntityRelatedMetadata: (entityLogicalName: string, relatedPath: string, selectColumns?: string[]) => 
        ipcInvoke("dataverse.getEntityRelatedMetadata", entityLogicalName, relatedPath, selectColumns),
    getSolutions: (selectColumns: string[]) => 
        ipcInvoke("dataverse.getSolutions", selectColumns),
    queryData: (odataQuery: string) => 
        ipcInvoke("dataverse.queryData", odataQuery),
});

console.log("[ToolPreloadBridge] Initialized - toolboxAPI and dataverseAPI exposed");
