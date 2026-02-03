/**
 * API type definitions for renderer process
 * These types define the structure of the toolboxAPI exposed to the renderer
 */

import { FileDialogFilter, ModalWindowMessagePayload, ModalWindowOptions, SelectPathOptions, Theme } from "./common";
import { DataverseConnection } from "./connection";
import { DataverseExecuteRequest } from "./dataverse";
import { LastUsedToolEntry, LastUsedToolUpdate, UserSettings } from "./settings";
import { Terminal, TerminalOptions } from "./terminal";
import { Tool, ToolContext, ToolSettings } from "./tool";

/**
 * Connections API namespace
 */
export interface ConnectionsAPI {
    add: (connection: DataverseConnection) => Promise<void>;
    update: (id: string, updates: Partial<DataverseConnection>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    getAll: () => Promise<DataverseConnection[]>;
    getById: (connectionId: string) => Promise<DataverseConnection | null>;
    test: (connection: DataverseConnection) => Promise<{ success: boolean; error?: string }>;
    isTokenExpired: (connectionId: string) => Promise<boolean>;
    refreshToken: (connectionId: string) => Promise<{ success: boolean }>;
    authenticate: (connectionId: string) => Promise<void>;
}

/**
 * Utils API namespace
 */
export interface UtilsAPI {
    showNotification: (options: { title: string; body: string; type?: "info" | "success" | "warning" | "error"; duration?: number }) => Promise<void>;
    copyToClipboard: (text: string) => Promise<void>;
    getCurrentTheme: () => Promise<Theme>;
    executeParallel: <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => Promise<T[]>;
    showLoading: (message?: string) => Promise<void>;
    hideLoading: () => Promise<void>;
    showModalWindow: (options: ModalWindowOptions) => Promise<void>;
    closeModalWindow: () => Promise<void>;
    sendModalMessage: (payload: ModalWindowMessagePayload) => Promise<void>;
}

/**
 * FileSystem API namespace
 */
export interface FileSystemAPI {
    readText: (path: string) => Promise<string>;
    readBinary: (path: string) => Promise<Buffer>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<{ type: "file" | "directory"; size: number; mtime: string }>;
    readDirectory: (path: string) => Promise<Array<{ name: string; type: "file" | "directory" }>>;
    writeText: (path: string, content: string) => Promise<void>;
    createDirectory: (path: string) => Promise<void>;
    saveFile: (defaultPath: string, content: string | Buffer, filters?: FileDialogFilter[]) => Promise<string | null>;
    selectPath: (options?: SelectPathOptions) => Promise<string | null>;
}

/**
 * Terminal API namespace
 */
export interface TerminalAPI {
    create: (toolId: string, options: TerminalOptions) => Promise<Terminal>;
    execute: (terminalId: string, command: string) => Promise<{ commandId: string }>;
    close: (terminalId: string) => Promise<void>;
    get: (terminalId: string) => Promise<Terminal | undefined>;
    list: (toolId: string) => Promise<Terminal[]>;
    listAll: () => Promise<Terminal[]>;
    setVisibility: (terminalId: string, visible: boolean) => Promise<void>;
}

/**
 * Events API namespace
 */
export interface EventsAPI {
    getHistory: (limit?: number) => Promise<unknown[]>;
    on: (callback: (event: unknown, payload: unknown) => void) => void;
    off: (callback: (event: unknown, payload: unknown) => void) => void;
}

/**
 * Troubleshooting API namespace
 */
export interface TroubleshootingAPI {
    checkSupabaseConnectivity: () => Promise<{ success: boolean; message?: string }>;
    checkRegistryFile: () => Promise<{ success: boolean; message?: string; toolCount?: number }>;
    checkUserSettings: () => Promise<{ success: boolean; message?: string }>;
    checkToolSettings: () => Promise<{ success: boolean; message?: string }>;
    checkConnections: () => Promise<{ success: boolean; message?: string; connectionCount?: number }>;
    checkSentryLogging: () => Promise<{ success: boolean; message?: string }>;
    checkToolDownload: () => Promise<{ success: boolean; message?: string }>;
    checkInternetConnectivity: () => Promise<{ success: boolean; message?: string }>;
}

/**
 * Dataverse API namespace
 */
export interface DataverseAPI {
    create: (entityLogicalName: string, record: Record<string, unknown>) => Promise<unknown>;
    retrieve: (entityLogicalName: string, id: string, columns?: string[]) => Promise<unknown>;
    update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => Promise<void>;
    delete: (entityLogicalName: string, id: string) => Promise<void>;
    retrieveMultiple: (fetchXml: string) => Promise<unknown>;
    execute: (request: DataverseExecuteRequest) => Promise<unknown>;
    fetchXmlQuery: (fetchXml: string) => Promise<unknown>;
    getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) => Promise<unknown>;
    getAllEntitiesMetadata: () => Promise<unknown>;
    queryData: (odataQuery: string) => Promise<unknown>;
    createMultiple: (entityLogicalName: string, records: Record<string, unknown>[]) => Promise<string[]>;
    updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[]) => Promise<void>;
    getEntitySetName: (entityLogicalName: string) => Promise<string>;
}

/**
 * Main ToolboxAPI interface
 */
export interface ToolboxAPI {
    getUserSettings: () => Promise<UserSettings>;
    updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
    getSetting: (key: string) => Promise<unknown>;
    setSetting: (key: string, value: unknown) => Promise<void>;

    // Connections namespace
    connections: ConnectionsAPI;

    getAllTools: () => Promise<Tool[]>;
    getTool: (toolId: string) => Promise<Tool>;
    loadTool: (packageName: string) => Promise<Tool>;
    unloadTool: (toolId: string) => Promise<void>;
    installTool: (packageName: string) => Promise<Tool>;
    uninstallTool: (packageName: string, toolId: string) => Promise<void>;
    getToolWebviewHtml: (packageName: string) => Promise<string | null>;
    getToolContext: (packageName: string, connectionUrl?: string, accessToken?: string) => Promise<ToolContext>;
    getLatestToolVersion: (packageName: string) => Promise<string | null>;
    updateTool: (packageName: string) => Promise<Tool>;
    getToolSettings: (toolId: string) => Promise<ToolSettings>;
    updateToolSettings: (toolId: string, settings: ToolSettings) => Promise<void>;

    // CSP consent management
    hasCspConsent: (toolId: string) => Promise<boolean>;
    grantCspConsent: (toolId: string) => Promise<void>;
    revokeCspConsent: (toolId: string) => Promise<void>;
    getCspConsents: () => Promise<{ [toolId: string]: boolean }>;

    // Webview URL generation
    getToolWebviewUrl: (toolId: string) => Promise<string>;

    // Tool Window Management
    launchToolWindow: (instanceId: string, tool: Tool, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => Promise<boolean>;
    switchToolWindow: (toolId: string) => Promise<boolean>;
    closeToolWindow: (toolId: string) => Promise<boolean>;
    getActiveToolWindow: () => Promise<string | null>;
    getOpenToolWindows: () => Promise<string[]>;
    updateToolConnection: (instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => Promise<void>;

    // Favorite tools
    addFavoriteTool: (toolId: string) => Promise<void>;
    removeFavoriteTool: (toolId: string) => Promise<void>;
    getFavoriteTools: () => Promise<string[]>;
    isFavoriteTool: (toolId: string) => Promise<boolean>;
    toggleFavoriteTool: (toolId: string) => Promise<boolean>;

    // Tool-specific connection management
    setToolConnection: (toolId: string, connectionId: string) => Promise<void>;
    getToolConnection: (toolId: string) => Promise<string | null>;
    removeToolConnection: (toolId: string) => Promise<void>;
    getAllToolConnections: () => Promise<Record<string, string>>;

    // Tool-specific secondary connection management (for multi-connection tools)
    setToolSecondaryConnection: (toolId: string, connectionId: string) => Promise<void>;
    getToolSecondaryConnection: (toolId: string) => Promise<string | null>;
    removeToolSecondaryConnection: (toolId: string) => Promise<void>;
    getAllToolSecondaryConnections: () => Promise<Record<string, string>>;

    // Recently used tools
    addLastUsedTool: (entry: LastUsedToolUpdate) => Promise<void>;
    getLastUsedTools: () => Promise<LastUsedToolEntry[]>;
    clearLastUsedTools: () => Promise<void>;

    // Local tool development (DEBUG MODE)
    loadLocalTool: (localPath: string) => Promise<Tool>;
    getLocalToolWebviewHtml: (localPath: string) => Promise<string | null>;
    openDirectoryPicker: () => Promise<string | null>;

    // Registry-based tools
    fetchRegistryTools: () => Promise<Tool[]>;
    installToolFromRegistry: (toolId: string) => Promise<{ manifest: unknown; tool: Tool }>;
    checkToolUpdates: (toolId: string) => Promise<{ hasUpdate: boolean; latestVersion?: string }>;
    isToolUpdating: (toolId: string) => Promise<boolean>;

    // Utils namespace
    utils: UtilsAPI;

    // Troubleshooting namespace
    troubleshooting: TroubleshootingAPI;

    // FileSystem namespace
    fileSystem: FileSystemAPI;

    openExternal: (url: string) => Promise<void>;

    // Terminal namespace
    terminal: TerminalAPI;

    // Events namespace
    events: EventsAPI;

    // Auto-update
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
    getAppVersion: () => Promise<string>;
    onUpdateChecking: (callback: () => void) => void;
    onUpdateAvailable: (callback: (info: unknown) => void) => void;
    onUpdateNotAvailable: (callback: () => void) => void;
    onUpdateDownloadProgress: (callback: (progress: unknown) => void) => void;
    onUpdateDownloaded: (callback: (info: unknown) => void) => void;
    onUpdateError: (callback: (error: string) => void) => void;
    onShowHomePage: (callback: () => void) => void;

    // Authentication dialogs
    onShowDeviceCodeDialog: (callback: (message: string) => void) => void;
    onCloseDeviceCodeDialog: (callback: () => void) => void;
    onShowAuthErrorDialog: (callback: (message: string) => void) => void;

    // Token expiry
    onTokenExpired: (callback: (data: { connectionId: string; connectionName: string }) => void) => void;

    // Tool update events
    onToolUpdateStarted: (callback: (toolId: string) => void) => void;
    onToolUpdateCompleted: (callback: (toolId: string) => void) => void;

    // Dataverse namespace
    dataverse: DataverseAPI;
}
