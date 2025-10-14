/**
 * Type definitions for the renderer process
 */

export interface ToolboxAPI {
    getUserSettings: () => Promise<any>;
    updateUserSettings: (settings: any) => Promise<void>;
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;
    addConnection: (connection: any) => Promise<void>;
    updateConnection: (id: string, updates: any) => Promise<void>;
    deleteConnection: (id: string) => Promise<void>;
    getConnections: () => Promise<any[]>;
    getAllTools: () => Promise<any[]>;
    getTool: (toolId: string) => Promise<any>;
    loadTool: (packageName: string) => Promise<any>;
    unloadTool: (toolId: string) => Promise<void>;
    installTool: (packageName: string) => Promise<any>;
    uninstallTool: (packageName: string, toolId: string) => Promise<void>;
    getToolSettings: (toolId: string) => Promise<any>;
    updateToolSettings: (toolId: string, settings: any) => Promise<void>;
    showNotification: (options: any) => Promise<void>;
    getEventHistory: (limit?: number) => Promise<any[]>;
    onToolboxEvent: (callback: (event: any, payload: any) => void) => void;
    removeToolboxEventListener: (callback: (event: any, payload: any) => void) => void;
}

declare global {
    interface Window {
        toolboxAPI: ToolboxAPI;
    }
}
