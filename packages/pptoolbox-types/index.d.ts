/**
 * Power Platform Tool Box API Type Definitions
 *
 * Tools running in ToolBox webviews can access the ToolBox API via window.toolboxAPI
 */

declare namespace ToolBox {
    /**
     * Tool context containing connection information
     */
    export interface ToolContext {
        toolId: string | null;
        connectionUrl: string | null;
        accessToken: string | null;
    }

    /**
     * Notification options
     */
    export interface NotificationOptions {
        title: string;
        body: string;
        type?: "info" | "success" | "warning" | "error";
        duration?: number; // Duration in milliseconds, 0 for persistent
    }

    /**
     * Event types that can be emitted by the ToolBox
     */
    export type ToolBoxEvent = "tool:loaded" | "tool:unloaded" | "connection:created" | "connection:updated" | "connection:deleted" | "settings:updated" | "notification:shown" | "terminal:created" | "terminal:closed" | "terminal:output" | "terminal:command:completed" | "terminal:error";

    /**
     * Event payload for ToolBox events
     */
    export interface ToolBoxEventPayload {
        event: ToolBoxEvent;
        data: unknown;
        timestamp: string;
    }

    /**
     * Dataverse connection configuration
     */
    export interface DataverseConnection {
        id: string;
        name: string;
        url: string;
        environment: "Dev" | "Test" | "UAT" | "Production";
        clientId?: string;
        tenantId?: string;
        createdAt: string;
        lastUsedAt?: string;
        isActive?: boolean;
    }

    /**
     * Tool information
     */
    export interface Tool {
        id: string;
        name: string;
        version: string;
        description: string;
        author: string;
        icon?: string;
    }

    /**
     * Terminal configuration options
     */
    export interface TerminalOptions {
        name: string;
        shell?: string;
        cwd?: string;
        env?: Record<string, string>;
    }

    /**
     * Terminal instance
     */
    export interface Terminal {
        id: string;
        name: string;
        toolId: string;
        shell: string;
        cwd: string;
        isVisible: boolean;
        createdAt: string;
    }

    /**
     * Terminal command execution result
     */
    export interface TerminalCommandResult {
        terminalId: string;
        commandId: string;
        output?: string;
        exitCode?: number;
        error?: string;
    }

    /**
     * ToolBox API exposed to tools via window.toolboxAPI
     */
    export interface ToolBoxAPI {
        // Settings
        getUserSettings: () => Promise<any>;
        updateUserSettings: (settings: any) => Promise<void>;
        getSetting: (key: string) => Promise<any>;
        setSetting: (key: string, value: any) => Promise<void>;

        // Connections
        addConnection: (connection: any) => Promise<void>;
        updateConnection: (id: string, updates: any) => Promise<void>;
        deleteConnection: (id: string) => Promise<void>;
        getConnections: () => Promise<DataverseConnection[]>;
        setActiveConnection: (id: string) => Promise<void>;
        getActiveConnection: () => Promise<DataverseConnection | null>;
        disconnectConnection: () => Promise<void>;

        // Tools
        getAllTools: () => Promise<Tool[]>;
        getTool: (toolId: string) => Promise<Tool>;
        loadTool: (packageName: string) => Promise<Tool>;
        unloadTool: (toolId: string) => Promise<void>;
        installTool: (packageName: string) => Promise<Tool>;
        uninstallTool: (packageName: string, toolId: string) => Promise<void>;
        getToolWebviewHtml: (packageName: string, connectionUrl?: string, accessToken?: string) => Promise<string | null>;
        getToolContext: () => Promise<ToolContext>;

        // Tool Settings
        getToolSettings: (toolId: string) => Promise<any>;
        updateToolSettings: (toolId: string, settings: any) => Promise<void>;

        // Notifications
        showNotification: (options: NotificationOptions) => Promise<void>;

        // Clipboard
        copyToClipboard: (text: string) => Promise<void>;

        // File operations
        saveFile: (defaultPath: string, content: any) => Promise<string | null>;

        // Terminal operations
        createTerminal: (toolId: string, options: TerminalOptions) => Promise<Terminal>;
        executeTerminalCommand: (terminalId: string, command: string) => Promise<TerminalCommandResult>;
        closeTerminal: (terminalId: string) => Promise<void>;
        getTerminal: (terminalId: string) => Promise<Terminal | undefined>;
        getToolTerminals: (toolId: string) => Promise<Terminal[]>;
        getAllTerminals: () => Promise<Terminal[]>;
        setTerminalVisibility: (terminalId: string, visible: boolean) => Promise<void>;

        // Events
        getEventHistory: (limit?: number) => Promise<ToolBoxEventPayload[]>;
        onToolboxEvent: (callback: (event: any, payload: ToolBoxEventPayload) => void) => void;
        removeToolboxEventListener: (callback: (event: any, payload: ToolBoxEventPayload) => void) => void;

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
}

/**
 * Global window interface extension for ToolBox tools
 */
declare global {
    interface Window {
        toolboxAPI: ToolBox.ToolBoxAPI;
        TOOLBOX_CONTEXT?: ToolBox.ToolContext;
    }
}

export = ToolBox;
export as namespace ToolBox;
