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
// Reverted to importing centralized channel definitions from single source file.
// Ensure BrowserView preload can resolve this module (see ToolWindowManager sandbox setting).
import { CONNECTION_CHANNELS, DATAVERSE_CHANNELS, EVENT_CHANNELS, FILESYSTEM_CHANNELS, SETTINGS_CHANNELS, TERMINAL_CHANNELS, UTIL_CHANNELS } from "../common/ipc/channels";
import { logInfo } from "../common/sentryHelper";
import type { EntityRelatedMetadataPath, EntityRelatedMetadataResponse } from "../common/types";

// Tool context received from main process
let toolContext: Record<string, unknown> | null = null;

// Promise that resolves when toolContext is ready
// This prevents race conditions where tool code tries to use the API before context is received
// Pattern: Create a promise and capture its resolve function for later use
let resolveToolContext!: () => void; // Definite assignment assertion - will be set immediately below

// Initialize the promise and capture the resolve function
const toolContextReady = new Promise<void>((resolve) => {
    resolveToolContext = resolve;
});

// Listen for context from main process
ipcRenderer.on("toolbox:context", (event, context) => {
    // Merge new context with existing to preserve all fields
    toolContext = { ...toolContext, ...context };
    logInfo("[ToolPreloadBridge] Received tool context update", context);
    // Resolve the promise so any pending API calls can proceed (only once)
    if (resolveToolContext) {
        resolveToolContext();
        resolveToolContext = null as any; // Only resolve once
    }
});

// Constants for timeout configuration
const TOOL_CONTEXT_TIMEOUT_MS = 10000;
const TOOL_CONTEXT_TIMEOUT_ERROR = "Tool context initialization timed out after 10 seconds. The tool may not have been initialized properly.";

// Helper to wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            timeoutHandle = undefined;
            reject(new Error(errorMessage));
        }, timeoutMs);
    });

    return Promise.race([
        promise.then(
            (result) => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                return result;
            },
            (error) => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                throw error;
            },
        ),
        timeoutPromise,
    ]);
}

// Helper to ensure toolContext is ready before proceeding
async function ensureToolContext(): Promise<string> {
    await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
    // After promise resolves, toolContext must be set and have a toolId
    if (!toolContext || typeof toolContext.toolId !== "string") {
        throw new Error("Tool context not initialized properly");
    }
    return toolContext.toolId;
}

async function getToolIdentifiers(): Promise<{ toolId: string; instanceId: string | null }> {
    await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
    if (!toolContext || typeof toolContext.toolId !== "string") {
        throw new Error("Tool context not initialized properly");
    }

    const instanceId = typeof toolContext.instanceId === "string" ? toolContext.instanceId : null;
    return { toolId: toolContext.toolId, instanceId };
}

// Helper to make IPC calls and return promises
function ipcInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(channel, ...args);
}

// Expose toolboxAPI to the tool window
contextBridge.exposeInMainWorld("toolboxAPI", {
    // Tool Info
    getToolContext: async () => {
        await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
        return toolContext;
    },

    // Connections API
    connections: {
        // Get tool's primary connection from context
        getConnection: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            if (!toolContext || typeof toolContext.connectionId !== "string") {
                return null;
            }
            return ipcInvoke(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID, toolContext.connectionId);
        },
        getConnectionUrl: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            return toolContext?.connectionUrl || null;
        },
        getConnectionId: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            return toolContext?.connectionId || null;
        },
        // Backward compatibility: getActiveConnection is an alias for getConnection
        // Tools call this expecting their own connection, not a global active connection
        getActiveConnection: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            if (!toolContext || typeof toolContext.connectionId !== "string") {
                return null;
            }
            return ipcInvoke(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID, toolContext.connectionId);
        },
        getAll: () => ipcInvoke(CONNECTION_CHANNELS.GET_CONNECTIONS),
        add: (connection: unknown) => ipcInvoke(CONNECTION_CHANNELS.ADD_CONNECTION, connection),
        update: (id: string, updates: unknown) => ipcInvoke(CONNECTION_CHANNELS.UPDATE_CONNECTION, id, updates),
        delete: (id: string) => ipcInvoke(CONNECTION_CHANNELS.DELETE_CONNECTION, id),
        test: (connection: unknown) => ipcInvoke(CONNECTION_CHANNELS.TEST_CONNECTION, connection),
        isTokenExpired: (connectionId: string) => ipcInvoke(CONNECTION_CHANNELS.IS_TOKEN_EXPIRED, connectionId),
        refreshToken: (connectionId: string) => ipcInvoke(CONNECTION_CHANNELS.REFRESH_TOKEN, connectionId),
        // Secondary connection methods for multi-connection tools
        getSecondaryConnection: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            if (!toolContext || typeof toolContext.secondaryConnectionId !== "string") {
                return null;
            }
            return ipcInvoke(CONNECTION_CHANNELS.GET_CONNECTION_BY_ID, toolContext.secondaryConnectionId);
        },
        getSecondaryConnectionUrl: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            return toolContext?.secondaryConnectionUrl || null;
        },
        getSecondaryConnectionId: async () => {
            await withTimeout(toolContextReady, TOOL_CONTEXT_TIMEOUT_MS, TOOL_CONTEXT_TIMEOUT_ERROR);
            return toolContext?.secondaryConnectionId || null;
        },
    },

    // Dataverse API
    dataverse: {
        create: (entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.CREATE, entityLogicalName, record, connectionTarget),
        retrieve: (entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.RETRIEVE, entityLogicalName, id, columns, connectionTarget),
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.UPDATE, entityLogicalName, id, record, connectionTarget),
        delete: (entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.DELETE, entityLogicalName, id, connectionTarget),
        retrieveMultiple: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.RETRIEVE_MULTIPLE, fetchXml, connectionTarget),
        execute: (request: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.EXECUTE, request, connectionTarget),
        fetchXmlQuery: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.FETCH_XML_QUERY, fetchXml, connectionTarget),
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_METADATA, entityLogicalName, searchByLogicalName, selectColumns, connectionTarget),
        getAllEntitiesMetadata: (selectColumns?: string[], connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_ALL_ENTITIES_METADATA, selectColumns, connectionTarget),
        getEntityRelatedMetadata: <P extends EntityRelatedMetadataPath>(entityLogicalName: string, relatedPath: P, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA, entityLogicalName, relatedPath, selectColumns, connectionTarget) as Promise<EntityRelatedMetadataResponse<P>>,
        getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_SOLUTIONS, selectColumns, connectionTarget),
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.QUERY_DATA, odataQuery, connectionTarget),
        publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS, tableLogicalName, connectionTarget),
        createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.CREATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.UPDATE_MULTIPLE, entityLogicalName, records, connectionTarget),
        getEntitySetName: (entityLogicalName: string) => ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME, entityLogicalName),
        associate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.ASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId, connectionTarget),
        disassociate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
            ipcInvoke(DATAVERSE_CHANNELS.DISASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityId, connectionTarget),
        deploySolution: (
            base64SolutionContent: string,
            options?: {
                importJobId?: string;
                publishWorkflows?: boolean;
                overwriteUnmanagedCustomizations?: boolean;
                skipProductUpdateDependencies?: boolean;
                convertToManaged?: boolean;
            },
            connectionTarget?: "primary" | "secondary",
        ) => ipcInvoke(DATAVERSE_CHANNELS.DEPLOY_SOLUTION, base64SolutionContent, options, connectionTarget),
        getImportJobStatus: (importJobId: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_IMPORT_JOB_STATUS, importJobId, connectionTarget),
    },

    // Utils API
    utils: {
        showNotification: (options: Record<string, unknown>) => ipcInvoke(UTIL_CHANNELS.SHOW_NOTIFICATION, options),
        openExternal: (url: string) => ipcInvoke(UTIL_CHANNELS.OPEN_EXTERNAL, url),
        copyToClipboard: (text: string) => ipcInvoke(UTIL_CHANNELS.COPY_TO_CLIPBOARD, text),
        getCurrentTheme: () => ipcInvoke(UTIL_CHANNELS.GET_CURRENT_THEME),
        showLoading: (message?: string) => ipcInvoke(UTIL_CHANNELS.SHOW_LOADING, message),
        hideLoading: () => ipcInvoke(UTIL_CHANNELS.HIDE_LOADING),
        executeParallel: async <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => {
            const promises = operations.map((op) => (typeof op === "function" ? op() : op));
            return Promise.all(promises);
        },
    },

    // FileSystem API
    fileSystem: {
        readText: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.READ_TEXT, path),
        readBinary: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.READ_BINARY, path),
        exists: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.EXISTS, path),
        stat: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.STAT, path),
        readDirectory: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.READ_DIRECTORY, path),
        writeText: (path: string, content: string) => ipcInvoke(FILESYSTEM_CHANNELS.WRITE_TEXT, path, content),
        createDirectory: (path: string) => ipcInvoke(FILESYSTEM_CHANNELS.CREATE_DIRECTORY, path),
        saveFile: (defaultPath: string, content: unknown) => ipcInvoke(FILESYSTEM_CHANNELS.SAVE_FILE, defaultPath, content),
        selectPath: (options?: Record<string, unknown>) => ipcInvoke(FILESYSTEM_CHANNELS.SELECT_PATH, options),
    },

    // Terminal API
    terminal: {
        create: async (options: Record<string, unknown>) => {
            const { toolId, instanceId } = await getToolIdentifiers();
            return ipcInvoke(TERMINAL_CHANNELS.CREATE_TERMINAL, toolId, instanceId, options);
        },
        execute: (terminalId: string, command: string) => ipcInvoke(TERMINAL_CHANNELS.EXECUTE_COMMAND, terminalId, command),
        close: (terminalId: string) => ipcInvoke(TERMINAL_CHANNELS.CLOSE_TERMINAL, terminalId),
        get: (terminalId: string) => ipcInvoke(TERMINAL_CHANNELS.GET_TERMINAL, terminalId),
        list: async () => {
            const { toolId, instanceId } = await getToolIdentifiers();
            return ipcInvoke(TERMINAL_CHANNELS.GET_TOOL_TERMINALS, toolId, instanceId);
        },
        listAll: () => ipcInvoke(TERMINAL_CHANNELS.GET_ALL_TERMINALS),
        setVisibility: (terminalId: string, visible: boolean) => ipcInvoke(TERMINAL_CHANNELS.SET_VISIBILITY, terminalId, visible),
    },

    // Events API
    events: {
        on: (callback: (event: unknown, payload: unknown) => void) => {
            const listener = (event: unknown, payload: unknown) => callback(event, payload);
            ipcRenderer.on(EVENT_CHANNELS.TOOLBOX_EVENT, listener);
            return () => ipcRenderer.removeListener(EVENT_CHANNELS.TOOLBOX_EVENT, listener);
        },
        off: (callback: (event: unknown, payload: unknown) => void) => {
            ipcRenderer.removeListener(EVENT_CHANNELS.TOOLBOX_EVENT, callback);
        },
        getHistory: (limit?: number) => ipcInvoke(UTIL_CHANNELS.GET_EVENT_HISTORY, limit),
    },

    // Settings API (tool-specific)
    settings: {
        getAll: async () => {
            const toolId = await ensureToolContext();
            return ipcInvoke(SETTINGS_CHANNELS.TOOL_SETTINGS_GET_ALL, toolId);
        },
        get: async (key: string) => {
            const toolId = await ensureToolContext();
            return ipcInvoke(SETTINGS_CHANNELS.TOOL_SETTINGS_GET, toolId, key);
        },
        set: async (key: string, value: unknown) => {
            const toolId = await ensureToolContext();
            return ipcInvoke(SETTINGS_CHANNELS.TOOL_SETTINGS_SET, toolId, key, value);
        },
        setAll: async (settings: Record<string, unknown>) => {
            const toolId = await ensureToolContext();
            return ipcInvoke(SETTINGS_CHANNELS.TOOL_SETTINGS_SET_ALL, toolId, settings);
        },
    },
});

// Also expose dataverseAPI as a direct alias (for tools that use it directly)
contextBridge.exposeInMainWorld("dataverseAPI", {
    create: (entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.CREATE, entityLogicalName, record, connectionTarget),
    retrieve: (entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.RETRIEVE, entityLogicalName, id, columns, connectionTarget),
    update: (entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.UPDATE, entityLogicalName, id, record, connectionTarget),
    delete: (entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.DELETE, entityLogicalName, id, connectionTarget),
    retrieveMultiple: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.RETRIEVE_MULTIPLE, fetchXml, connectionTarget),
    execute: (request: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.EXECUTE, request, connectionTarget),
    fetchXmlQuery: (fetchXml: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.FETCH_XML_QUERY, fetchXml, connectionTarget),
    getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_METADATA, entityLogicalName, searchByLogicalName, selectColumns, connectionTarget),
    getAllEntitiesMetadata: (selectColumns?: string[], connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_ALL_ENTITIES_METADATA, selectColumns, connectionTarget),
    getEntityRelatedMetadata: <P extends EntityRelatedMetadataPath>(entityLogicalName: string, relatedPath: P, selectColumns?: string[], connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_RELATED_METADATA, entityLogicalName, relatedPath, selectColumns, connectionTarget) as Promise<EntityRelatedMetadataResponse<P>>,
    getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_SOLUTIONS, selectColumns, connectionTarget),
    queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.QUERY_DATA, odataQuery, connectionTarget),
    publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.PUBLISH_CUSTOMIZATIONS, tableLogicalName, connectionTarget),
    createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.CREATE_MULTIPLE, entityLogicalName, records, connectionTarget),
    updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.UPDATE_MULTIPLE, entityLogicalName, records, connectionTarget),
    getEntitySetName: (entityLogicalName: string) => ipcInvoke(DATAVERSE_CHANNELS.GET_ENTITY_SET_NAME, entityLogicalName),
    associate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.ASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId, connectionTarget),
    disassociate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") =>
        ipcInvoke(DATAVERSE_CHANNELS.DISASSOCIATE, primaryEntityName, primaryEntityId, relationshipName, relatedEntityId, connectionTarget),
    deploySolution: (
        base64SolutionContent: string,
        options?: {
            importJobId?: string;
            publishWorkflows?: boolean;
            overwriteUnmanagedCustomizations?: boolean;
            skipProductUpdateDependencies?: boolean;
            convertToManaged?: boolean;
        },
        connectionTarget?: "primary" | "secondary",
    ) => ipcInvoke(DATAVERSE_CHANNELS.DEPLOY_SOLUTION, base64SolutionContent, options, connectionTarget),
    getImportJobStatus: (importJobId: string, connectionTarget?: "primary" | "secondary") => ipcInvoke(DATAVERSE_CHANNELS.GET_IMPORT_JOB_STATUS, importJobId, connectionTarget),
});

logInfo("[ToolPreloadBridge] Initialized - toolboxAPI and dataverseAPI exposed");
