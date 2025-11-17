/**
 * Tool Preload Bridge
 * 
 * This script runs in each tool's BrowserView before the tool loads.
 * It exposes the toolboxAPI to the tool via contextBridge, providing
 * secure access to PPTB functionality through IPC.
 * 
 * This is similar to VS Code's extension host preload script.
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
        getActiveConnection: () => ipcInvoke("connections:get-active"),
        getAllConnections: () => ipcInvoke("connections:get-all"),
        setActiveConnection: (connectionId: string) => ipcInvoke("connections:set-active", connectionId),
        saveConnection: (connection: any) => ipcInvoke("connections:save", connection),
        deleteConnection: (connectionId: string) => ipcInvoke("connections:delete", connectionId),
        testConnection: (connectionId: string) => ipcInvoke("connections:test", connectionId),
    },

    // Dataverse API
    dataverse: {
        executeRequest: (request: any) => ipcInvoke("dataverse:execute-request", request),
        getMetadata: (connectionId: string) => ipcInvoke("dataverse:get-metadata", connectionId),
        getEntities: (connectionId: string) => ipcInvoke("dataverse:get-entities", connectionId),
        getEntity: (connectionId: string, entityLogicalName: string) => ipcInvoke("dataverse:get-entity", connectionId, entityLogicalName),
    },

    // Utils API
    utils: {
        showNotification: (options: any) => ipcInvoke("utils:show-notification", options),
        openExternal: (url: string) => ipcInvoke("utils:open-external", url),
        copyToClipboard: (text: string) => ipcInvoke("utils:copy-to-clipboard", text),
    },

    // Events API
    events: {
        on: (eventName: string, callback: Function) => {
            const listener = (event: any, ...args: any[]) => callback(...args);
            ipcRenderer.on(`toolbox:event:${eventName}`, listener);
            return () => ipcRenderer.removeListener(`toolbox:event:${eventName}`, listener);
        },
        once: (eventName: string, callback: Function) => {
            const listener = (event: any, ...args: any[]) => callback(...args);
            ipcRenderer.once(`toolbox:event:${eventName}`, listener);
        },
        emit: (eventName: string, ...args: any[]) => {
            return ipcInvoke("events:emit", eventName, ...args);
        },
    },

    // Storage API (tool-specific storage)
    storage: {
        get: (key: string) => ipcInvoke("storage:get", toolContext?.toolId, key),
        set: (key: string, value: any) => ipcInvoke("storage:set", toolContext?.toolId, key, value),
        delete: (key: string) => ipcInvoke("storage:delete", toolContext?.toolId, key),
        clear: () => ipcInvoke("storage:clear", toolContext?.toolId),
    },
});

// Also expose dataverseAPI as an alias for backward compatibility with existing tools
contextBridge.exposeInMainWorld("dataverseAPI", {
    executeRequest: (request: any) => ipcInvoke("dataverse:execute-request", request),
    getMetadata: (connectionId: string) => ipcInvoke("dataverse:get-metadata", connectionId),
    getEntities: (connectionId: string) => ipcInvoke("dataverse:get-entities", connectionId),
    getEntity: (connectionId: string, entityLogicalName: string) => ipcInvoke("dataverse:get-entity", connectionId, entityLogicalName),
});

console.log("[ToolPreloadBridge] Initialized - toolboxAPI and dataverseAPI exposed");
