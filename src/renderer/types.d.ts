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
    getAllTools: () => Promise<any[]>;
    getTool: (toolId: string) => Promise<any>;
    loadTool: (packageName: string) => Promise<any>;
    unloadTool: (toolId: string) => Promise<void>;
    installTool: (packageName: string) => Promise<any>;
    uninstallTool: (packageName: string, toolId: string) => Promise<void>;
    getToolWebviewHtml: (packageName: string) => Promise<string | null>;
    getToolContext: (packageName: string, connectionUrl?: string, accessToken?: string) => Promise<ToolContext>;
    getToolSettings: (toolId: string) => Promise<any>;
    updateToolSettings: (toolId: string, settings: any) => Promise<void>;
    showNotification: (options: any) => Promise<void>;
    copyToClipboard: (text: string) => Promise<void>;
    saveFile: (defaultPath: string, content: any) => Promise<string | null>;
    getEventHistory: (limit?: number) => Promise<any[]>;
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
}

declare global {
    interface Window {
        toolboxAPI: ToolboxAPI;
        TOOLBOX_CONTEXT?: ToolContext;
    }
}
