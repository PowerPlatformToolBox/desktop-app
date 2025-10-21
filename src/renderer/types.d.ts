/**
 * Type definitions for the renderer process
 */

export interface ToolContext {
    toolId: string;
    connectionUrl: string | null;
    accessToken: string | null;
}

export interface ToolboxAPI {
    getUserSettings: () => Promise<any>;
    updateUserSettings: (settings: any) => Promise<void>;
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;
    addConnection: (connection: any) => Promise<void>;
    updateConnection: (id: string, updates: any) => Promise<void>;
    deleteConnection: (id: string) => Promise<void>;
    getConnections: () => Promise<any[]>;
    setActiveConnection: (id: string) => Promise<void>;
    getActiveConnection: () => Promise<any | null>;
    disconnectConnection: () => Promise<void>;
    testConnection: (connection: any) => Promise<{ success: boolean; error?: string }>;
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
    showNotification: (options: any) => Promise<void>;
    copyToClipboard: (text: string) => Promise<void>;
    saveFile: (defaultPath: string, content: any) => Promise<string | null>;
    openExternal: (url: string) => Promise<void>;
    getEventHistory: (limit?: number) => Promise<any[]>;
    // Terminal operations
    createTerminal: (toolId: string, options: any) => Promise<any>;
    executeTerminalCommand: (terminalId: string, command: string) => Promise<any>;
    closeTerminal: (terminalId: string) => Promise<void>;
    getTerminal: (terminalId: string) => Promise<any | undefined>;
    getToolTerminals: (toolId: string) => Promise<any[]>;
    getAllTerminals: () => Promise<any[]>;
    setTerminalVisibility: (terminalId: string, visible: boolean) => Promise<void>;
    onToolboxEvent: (callback: (event: any, payload: any) => void) => void;
    removeToolboxEventListener: (callback: (event: any, payload: any) => void) => void;
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
}

declare global {
    interface Window {
        toolboxAPI: ToolboxAPI;
        TOOLBOX_CONTEXT?: ToolContext;
    }
}
