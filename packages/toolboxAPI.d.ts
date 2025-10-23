/**
 * Power Platform Tool Box - ToolBox API Type Definitions
 *
 * Core ToolBox API exposed to tools via window.toolboxAPI
 */

declare namespace ToolBoxAPI {
    /**
     * Tool context containing connection information
     * NOTE: accessToken is NOT included for security - tools must use dataverseAPI
     */
    export interface ToolContext {
        toolId: string | null;
        connectionUrl: string | null;
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
    export type ToolBoxEvent =
        | "tool:loaded"
        | "tool:unloaded"
        | "connection:created"
        | "connection:updated"
        | "connection:deleted"
        | "settings:updated"
        | "notification:shown"
        | "terminal:created"
        | "terminal:closed"
        | "terminal:output"
        | "terminal:command:completed"
        | "terminal:error";

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
     * Connections namespace - restricted access for tools
     */
    export interface ConnectionsAPI {
        /**
         * Get the currently active Dataverse connection
         */
        getActiveConnection: () => Promise<DataverseConnection | null>;
    }

    /**
     * Utils namespace - utility functions for tools
     */
    export interface UtilsAPI {
        /**
         * Display a notification to the user
         */
        showNotification: (options: NotificationOptions) => Promise<void>;

        /**
         * Copy text to the system clipboard
         */
        copyToClipboard: (text: string) => Promise<void>;

        /**
         * Open a save file dialog and write content
         */
        saveFile: (defaultPath: string, content: any) => Promise<string | null>;

        /**
         * Get the current UI theme (light or dark)
         */
        getCurrentTheme: () => Promise<"light" | "dark">;
    }

    /**
     * Terminal namespace - context-aware terminal operations
     */
    export interface TerminalAPI {
        /**
         * Create a new terminal (tool ID is auto-determined)
         */
        create: (options: TerminalOptions) => Promise<Terminal>;

        /**
         * Execute a command in a terminal
         */
        execute: (terminalId: string, command: string) => Promise<TerminalCommandResult>;

        /**
         * Close a terminal
         */
        close: (terminalId: string) => Promise<void>;

        /**
         * Get a terminal by ID
         */
        get: (terminalId: string) => Promise<Terminal | undefined>;

        /**
         * List all terminals for this tool
         */
        list: () => Promise<Terminal[]>;

        /**
         * Set terminal visibility
         */
        setVisibility: (terminalId: string, visible: boolean) => Promise<void>;
    }

    /**
     * Events namespace - tool-specific event handling
     */
    export interface EventsAPI {
        /**
         * Get event history for this tool
         */
        getHistory: (limit?: number) => Promise<ToolBoxEventPayload[]>;

        /**
         * Subscribe to ToolBox events
         */
        on: (callback: (event: any, payload: ToolBoxEventPayload) => void) => void;

        /**
         * Unsubscribe from ToolBox events
         */
        off: (callback: (event: any, payload: ToolBoxEventPayload) => void) => void;
    }

    /**
     * Main ToolBox API exposed to tools via window.toolboxAPI
     */
    export interface API {
        /**
         * Connection-related operations (restricted)
         */
        connections: ConnectionsAPI;

        /**
         * Utility functions
         */
        utils: UtilsAPI;

        /**
         * Terminal operations (context-aware)
         */
        terminal: TerminalAPI;

        /**
         * Event handling (tool-specific)
         */
        events: EventsAPI;

        /**
         * Get the current tool context
         * @internal Used internally by the framework
         */
        getToolContext: () => Promise<ToolContext>;
    }

    /**
     * Auto-update event handlers
     */
    export interface UpdateHandlers {
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
        /**
         * The organized ToolBox API for tools
         */
        toolboxAPI: ToolBoxAPI.API;

        /**
         * Tool context available at startup
         */
        TOOLBOX_CONTEXT?: ToolBoxAPI.ToolContext;
    }
}

export = ToolBoxAPI;
export as namespace ToolBoxAPI;
