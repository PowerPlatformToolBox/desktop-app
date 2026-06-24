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
     * Power Platform ToolBox connection configuration
     */
    export interface Connection {
        id: string;
        name: string;
        url: string;
        environment: "Dev" | "Test" | "UAT" | "Production";
        category?: string;
        environmentColor?: string;
        categoryColor?: string;
        enabledForPowerPlatformAPI?: boolean;
        scopesForPowerPlatformAPI?: string[];
        createdAt?: string;
        lastUsedAt?: string;
        /**
         * @deprecated isActive is a legacy field that is no longer persisted.
         * It may be present in older tool code but should not be relied upon.
         * Use the connection context provided by the ToolBox API instead.
         */
        isActive?: boolean;
    }

    /**
     * @deprecated Use Connection instead.
     */
    export type DataverseConnection = Connection;

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
        shell?: string; // Preferred shell executable (e.g. "pwsh", "/bin/zsh"). Falls back to the system default if the requested shell is not found on the machine.
        cwd?: string;
        env?: Record<string, string>; // PATH-like and shell bootstrap variables are filtered for tool security
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
        getActiveConnection: () => Promise<Connection | null>;

        /**
         * Get the secondary connection for multi-connection tools
         */
        getSecondaryConnection: () => Promise<Connection | null>;
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
         * Open a URL in the external browser associated with the tool's active connection.
         *
         * When the connection has a browser profile configured (e.g. a specific Chrome or
         * Edge profile), the URL will be opened in that browser and profile so the user is
         * already authenticated.  Falls back to the system default browser when no profile
         * is configured or the browser cannot be found.
         *
         * Only `https:` and `http:` URLs are allowed.
         *
         * @param url The URL to open (must use https: or http: protocol)
         * @param connectionTarget Which connection's browser profile to use.
         *   Defaults to `"primary"`. Pass `"secondary"` for multi-connection tools that
         *   want to open the URL in the secondary connection's browser context.
         */
        openInConnectionBrowser: (url: string, connectionTarget?: "primary" | "secondary") => Promise<void>;
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
         * Inter-tool launch context API.
         *
         * Allows one tool to launch another, pass prefill data to it, and receive
         * a return value when the callee finishes.
         */
        invocation: InvocationAPI;

        /**
         * Get the current tool context
         * @internal Used internally by the framework
         */
        getToolContext: () => Promise<ToolContext>;
    }

    /**
     * Inter-tool launch context API.
     *
     * Tools use this namespace to:
     * 1. **Launch another tool** with prefill data (`invocation.launchTool`).
     * 2. **Read their own launch context** when they were launched by another tool (`invocation.getLaunchContext`).
     * 3. **Return data** back to the tool that launched them (`invocation.returnData`).
     *
     * @example Caller (Tool A)
     * ```ts
     * const result = await toolboxAPI.invocation.launchTool(
     *   "@my-org/entity-picker",
     *   { entityName: "account" },
     * );
     * console.log(result); // { selectedId: "...", selectedName: "..." }
     * ```
     *
     * @example Callee (Tool B)
     * ```ts
     * const ctx = await toolboxAPI.invocation.getLaunchContext();
     * if (ctx) {
     *   console.log(ctx.entityName); // "account"
     * }
     *
     * // After user picks something...
     * await toolboxAPI.invocation.returnData({ selectedId, selectedName });
     * ```
     */
    export interface InvocationAPI {
        /**
         * Returns the prefill data that was passed by the caller tool when it launched
         * this tool, or `null` if this tool was not launched via an inter-tool invocation.
         */
        getLaunchContext: () => Promise<Record<string, unknown> | null>;

        /**
         * Returns data back to the caller tool that launched this tool.
         *
         * The value resolves the `Promise` returned by the caller's
         * `invocation.launchTool()` call.  **After calling `returnData`, PPTB
         * automatically closes the callee window** — the callee does not need to
         * close itself.
         *
         * If this tool was not launched by another tool, the call is a no-op.
         *
         * @param returnData The data to pass back to the caller
         */
        returnData: (returnData: Record<string, unknown>) => Promise<void>;

        /**
         * Launch another tool from within this tool and (optionally) pass prefill data.
         *
         * Returns a Promise that resolves with the data the target tool sends via
         * `invocation.returnData()`, or `null` if:
         *  - the target tool closes without calling `returnData`, or
         *  - the user clicks the "Return to [this tool]" banner before the callee finalises.
         *
         * **One-at-a-time**: only one active callee per caller is supported. A second
         * call while a callee is active throws `"A callee invocation is already in progress"`.
         *
         * **Connection auto-inheritance**: when `options.primaryConnectionId` is omitted,
         * the callee automatically inherits the caller's active FXS connection.
         *
         * **Multi-connection auto-prompt**: when the callee declares
         * `features.multiConnection: "required"` or `"optional"` and
         * `options.secondaryConnectionId` is not provided, PPTB automatically shows
         * the multi-connection selector before launching the callee. The Promise rejects
         * if the user cancels the selector.
         *
         * **`noReturn`**: pass `true` when the caller does not expect the callee to
         * return data (e.g. a "Send To" pattern where data is only sent one-way).
         * When set, the "Return to [Caller]" banner is suppressed entirely for the callee.
         * The invocation lifecycle is otherwise identical — the Promise still resolves
         * with `null` when the callee closes.
         *
         * @param targetToolId The npm package name (toolId) of the tool to launch
         * @param prefillData  Data to pre-populate the target tool's state
         * @param options      Optional connection overrides and launch flags
         */
        launchTool: (
            targetToolId: string,
            prefillData?: Record<string, unknown>,
            options?: { primaryConnectionId?: string | null; secondaryConnectionId?: string | null; noReturn?: boolean },
        ) => Promise<unknown>;

        /**
         * Find installed tools that declare a given capability tag in their
         * `pptb.config.json` (`invocation.capabilities` array).
         *
         * Use a `KnownCapabilityTag` literal from `@pptb/types` for IDE auto-complete:
         * ```ts
         * import type { KnownCapabilityTag } from "@pptb/types/pptbConfig";
         * const tools = await toolboxAPI.invocation.findToolsByCapability("fetchxml");
         * ```
         *
         * @param tag  The capability tag to search for (e.g. `"entity-picker"`)
         * @returns    Array of matching installed `ToolManifest` objects
         */
        findToolsByCapability: (tag: import("./pptbConfig").CapabilityTag) => Promise<unknown[]>;

        /**
         * Returns the list of known (registered) capability tags from the capability registry.
         *
         * The registry is stored in a Supabase `capability_tags` table and fetched at
         * startup (cached for 5 minutes). When Supabase is unavailable a built-in
         * fallback list is returned, so the result is never empty.
         *
         * Use this at runtime to populate a "capabilities" picker or to validate a tag
         * before calling `findToolsByCapability`.
         *
         * @returns Array of `{ tag: string; description: string }` entries ordered by tag name.
         */
        getKnownCapabilityTags: () => Promise<Array<{ tag: string; description: string }>>;
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
