/**
 * Type definitions for the renderer process
 */

export interface ToolContext {
    toolId: string;
    connectionUrl: string | null;
    accessToken: string | null;
}

export interface ConnectionsAPI {
    add: (connection: any) => Promise<void>;
    update: (id: string, updates: any) => Promise<void>;
    delete: (id: string) => Promise<void>;
    getAll: () => Promise<any[]>;
    setActive: (id: string) => Promise<void>;
    getActiveConnection: () => Promise<any | null>;
    disconnect: () => Promise<void>;
    test: (connection: any) => Promise<{ success: boolean; error?: string }>;
    isTokenExpired: (connectionId: string) => Promise<boolean>;
    refreshToken: (connectionId: string) => Promise<{ success: boolean }>;
}

export interface UtilsAPI {
    showNotification: (options: any) => Promise<void>;
    copyToClipboard: (text: string) => Promise<void>;
    saveFile: (defaultPath: string, content: any) => Promise<string | null>;
    getCurrentTheme: () => Promise<"light" | "dark">;
    executeParallel: <T = any>(...operations: Array<Promise<T> | (() => Promise<T>)>) => Promise<T[]>;
    showLoading: (message?: string) => Promise<void>;
    hideLoading: () => Promise<void>;
}

export interface TerminalAPI {
    create: (toolId: string, options: any) => Promise<any>;
    execute: (terminalId: string, command: string) => Promise<any>;
    close: (terminalId: string) => Promise<void>;
    get: (terminalId: string) => Promise<any | undefined>;
    list: (toolId: string) => Promise<any[]>;
    listAll: () => Promise<any[]>;
    setVisibility: (terminalId: string, visible: boolean) => Promise<void>;
}

export interface EventsAPI {
    getHistory: (limit?: number) => Promise<any[]>;
    on: (callback: (event: any, payload: any) => void) => void;
    off: (callback: (event: any, payload: any) => void) => void;
}

export interface DataverseAPI {
    create: (entityLogicalName: string, record: Record<string, unknown>) => Promise<any>;
    retrieve: (entityLogicalName: string, id: string, columns?: string[]) => Promise<any>;
    update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => Promise<void>;
    delete: (entityLogicalName: string, id: string) => Promise<void>;
    retrieveMultiple: (fetchXml: string) => Promise<any>;
    execute: (request: { entityName?: string; entityId?: string; operationName: string; operationType: "action" | "function"; parameters?: Record<string, unknown> }) => Promise<any>;
    fetchXmlQuery: (fetchXml: string) => Promise<any>;
    getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[]) => Promise<any>;
    getAllEntitiesMetadata: () => Promise<any>;
    queryData: (odataQuery: string) => Promise<any>;
}

export interface ToolboxAPI {
    getUserSettings: () => Promise<any>;
    updateUserSettings: (settings: any) => Promise<void>;
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;

    // Connections namespace
    connections: ConnectionsAPI;

    getAllTools: () => Promise<any[]>;
    getTool: (toolId: string) => Promise<any>;
    loadTool: (packageName: string) => Promise<any>;
    unloadTool: (toolId: string) => Promise<void>;
    installTool: (packageName: string) => Promise<any>;
    uninstallTool: (packageName: string, toolId: string) => Promise<void>;
    getToolWebviewHtml: (packageName: string) => Promise<string | null>;
    getToolContext: (packageName: string, connectionUrl?: string, accessToken?: string) => Promise<ToolContext>;
    getLatestToolVersion: (packageName: string) => Promise<string | null>;
    updateTool: (packageName: string) => Promise<any>;
    getToolSettings: (toolId: string) => Promise<any>;
    updateToolSettings: (toolId: string, settings: any) => Promise<void>;

    // Favorite tools
    addFavoriteTool: (toolId: string) => Promise<void>;
    removeFavoriteTool: (toolId: string) => Promise<void>;
    getFavoriteTools: () => Promise<string[]>;
    isFavoriteTool: (toolId: string) => Promise<boolean>;
    toggleFavoriteTool: (toolId: string) => Promise<boolean>;

    // Local tool development (DEBUG MODE)
    loadLocalTool: (localPath: string) => Promise<any>;
    getLocalToolWebviewHtml: (localPath: string) => Promise<string | null>;
    openDirectoryPicker: () => Promise<string | null>;

    // Registry-based tools (new primary method)
    fetchRegistryTools: () => Promise<any[]>;
    installToolFromRegistry: (toolId: string) => Promise<any>;
    checkToolUpdates: (toolId: string) => Promise<{ hasUpdate: boolean; latestVersion?: string }>;

    // Utils namespace
    utils: UtilsAPI;

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
    onUpdateAvailable: (callback: (info: any) => void) => void;
    onUpdateNotAvailable: (callback: () => void) => void;
    onUpdateDownloadProgress: (callback: (progress: any) => void) => void;
    onUpdateDownloaded: (callback: (info: any) => void) => void;
    onUpdateError: (callback: (error: string) => void) => void;
    onShowHomePage: (callback: () => void) => void;

    // Authentication dialogs
    onShowDeviceCodeDialog: (callback: (message: string) => void) => void;
    onCloseDeviceCodeDialog: (callback: () => void) => void;
    onShowAuthErrorDialog: (callback: (message: string) => void) => void;

    // Token expiry
    onTokenExpired: (callback: (data: { connectionId: string; connectionName: string }) => void) => void;

    // Dataverse namespace
    dataverse: DataverseAPI;
}

declare global {
    interface Window {
        toolboxAPI: ToolboxAPI;
        TOOLBOX_CONTEXT?: ToolContext;
        api: {
            on: (channel: string, callback: (...args: any[]) => void) => void;
            invoke: (channel: string, ...args: any[]) => Promise<any>;
        };
    }
}
