/**
 * Power Platform ToolBox - ToolBox API Type Definitions
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
        instanceId?: string | null;
        connectionUrl: string | null;
        connectionId?: string | null;
        secondaryConnectionUrl?: string | null;
        secondaryConnectionId?: string | null;
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
     * File dialog filter definition
     */
    export interface FileDialogFilter {
        name: string;
        extensions: string[];
    }

    /**
     * Options for selecting a file or folder path
     */
    export interface SelectPathOptions {
        type?: "file" | "folder";
        title?: string;
        message?: string;
        buttonLabel?: string;
        defaultPath?: string;
        filters?: FileDialogFilter[];
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
        createdAt: string;
        lastUsedAt?: string;
        /**
         * @deprecated isActive is a legacy field that is no longer persisted.
         * It may be present in older tool code but should not be relied upon.
         * Use the connection context provided by the ToolBox API instead.
         */
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
        visible?: boolean; // Whether terminal should be visible initially (default: true)
    }

    /**
     * Terminal instance
     */
    export interface Terminal {
        id: string;
        name: string;
        toolId: string;
        toolInstanceId?: string | null;
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

        /**
         * Get the secondary connection for multi-connection tools
         */
        getSecondaryConnection: () => Promise<DataverseConnection | null>;
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
         * Get the current UI theme (light or dark)
         */
        getCurrentTheme: () => Promise<"light" | "dark">;

        /**
         * Execute multiple async operations in parallel using Promise.all
         * @param operations Variable number of promises or async function calls
         * @returns Promise that resolves when all operations complete with an array of results
         * @example
         * // Execute multiple API calls in parallel
         * const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel(
         *   dataverseAPI.retrieve('account', '123'),
         *   dataverseAPI.retrieve('contact', '456'),
         *   dataverseAPI.fetchXmlQuery(fetchXml)
         * );
         */
        executeParallel: <T = any>(...operations: Array<Promise<T> | (() => Promise<T>)>) => Promise<T[]>;

        /**
         * Show a loading screen in the tool's context
         * @param message Optional message to display (default: "Loading...")
         */
        showLoading: (message?: string) => Promise<void>;

        /**
         * Hide the loading screen in the tool's context
         */
        hideLoading: () => Promise<void>;
    }

    /**
     * FileSystem namespace - filesystem operations for tools
     */
    export interface FileSystemAPI {
        /**
         * Read a file as UTF-8 text
         * Ideal for configs (pcfconfig.json, package.json)
         */
        readText: (path: string) => Promise<string>;

        /**
         * Read a file as raw binary data (Buffer)
         * For images, ZIPs, manifests that need to be hashed, uploaded, or parsed as non-text
         * Returns a Node.js Buffer which Electron can properly serialize over IPC
         * Tools can convert to ArrayBuffer using buffer.buffer if needed
         */
        readBinary: (path: string) => Promise<Buffer>;

        /**
         * Check if a file or directory exists
         * Lightweight existence check before attempting reads/writes
         */
        exists: (path: string) => Promise<boolean>;

        /**
         * Get file or directory metadata
         * Confirms users picked the correct folder/file and shows info in UI
         */
        stat: (path: string) => Promise<{ type: "file" | "directory"; size: number; mtime: string }>;

        /**
         * Read directory contents
         * Enumerate folder contents when tools need to show selectable files or validate structure
         */
        readDirectory: (path: string) => Promise<Array<{ name: string; type: "file" | "directory" }>>;

        /**
         * Write text content to a file
         * Save generated files (manifests, logs) without forcing users through save dialog
         */
        writeText: (path: string, content: string) => Promise<void>;

        /**
         * Create a directory (recursive)
         * Ensure target folders exist before writing scaffolding artifacts
         */
        createDirectory: (path: string) => Promise<void>;

        /**
         * Open a save file dialog and write content
         * @param defaultPath The suggested file name and path
         * @param content The content to save (string or Buffer)
         * @param filters Optional file type filters. If not provided, filters are derived from the file extension
         * @example
         * // Save with custom filters
         * await toolboxAPI.fileSystem.saveFile(
         *   "react-export.json",
         *   JSON.stringify(data, null, 2),
         *   [{name: "JSON", extensions: ["json"]}, {name: "Text", extensions: ["txt"]}]
         * );
         *
         * // Save without filters (auto-derived from extension)
         * await toolboxAPI.fileSystem.saveFile("config.xml", xmlContent);
         */
        saveFile: (defaultPath: string, content: any, filters?: FileDialogFilter[]) => Promise<string | null>;

        /**
         * Open a native dialog to select either a file or a folder and return the chosen path
         */
        selectPath: (options?: SelectPathOptions) => Promise<string | null>;
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
     * Settings namespace - context-aware tool settings
     * All settings operations automatically use the current tool's ID
     */
    export interface SettingsAPI {
        /**
         * Get all settings for this tool
         * @returns Promise resolving to an object with all settings (empty object if no settings exist)
         */
        getAll: () => Promise<Record<string, any>>;

        /**
         * Get a specific setting by key
         * @param key The setting key to retrieve
         * @returns Promise resolving to the setting value, or undefined if not found
         */
        get: (key: string) => Promise<any>;

        /**
         * Set a specific setting by key
         * @param key The setting key to set
         * @param value The value to store (can be any JSON-serializable value)
         * @returns Promise that resolves when the setting is saved
         */
        set: (key: string, value: any) => Promise<void>;

        /**
         * Set all settings (replaces entire settings object)
         * @param settings The settings object to store
         * @returns Promise that resolves when the settings are saved
         */
        setAll: (settings: Record<string, any>) => Promise<void>;
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
         * Filesystem operations
         */
        fileSystem: FileSystemAPI;

        /**
         * Tool-specific settings (context-aware)
         */
        settings: SettingsAPI;

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
