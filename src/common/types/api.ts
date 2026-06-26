/**
 * API type definitions for renderer process
 * These types define the structure of the toolboxAPI exposed to the renderer
 */

import { FileDialogFilter, ModalWindowMessagePayload, ModalWindowOptions, NativeContextMenuRequest, SelectPathOptions, Theme } from "./common";
import { CommunityLinksCollection } from "./communityLinks";
import { Connection } from "./connection";
import { DataverseExecuteRequest } from "./dataverse";
import { CspConsentRecord, LastUsedToolEntry, LastUsedToolUpdate, UserSettings } from "./settings";
import { Terminal, TerminalOptions } from "./terminal";
import { CapabilityTagEntry, Tool, ToolContext, ToolSettings } from "./tool";

/**
 * Connections API namespace
 */
export interface ConnectionsAPI {
    add: (connection: Connection) => Promise<void>;
    update: (id: string, updates: Partial<Connection>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    getAll: () => Promise<Connection[]>;
    getById: (connectionId: string) => Promise<Connection | null>;
    test: (connection: Connection) => Promise<{ success: boolean; error?: string }>;
    isTokenExpired: (connectionId: string) => Promise<boolean>;
    refreshToken: (connectionId: string) => Promise<{ success: boolean }>;
    authenticate: (connectionId: string) => Promise<void>;
    exportConnections: (ids?: string[]) => Promise<{ version: 1; exportedAt: string; connections: Partial<Connection>[] }>;
    importConnections: (data: unknown) => Promise<{ imported: number; skipped: number; warnings: string[] }>;
}

/**
 * Utils API namespace
 */
export interface UtilsAPI {
    showNotification: (options: { title: string; body: string; type?: "info" | "success" | "warning" | "error"; duration?: number }) => Promise<void>;
    showContextMenu: (request: NativeContextMenuRequest) => Promise<string | null>;
    copyToClipboard: (text: string) => Promise<void>;
    getCurrentTheme: () => Promise<Theme>;
    executeParallel: <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => Promise<T[]>;
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
 * Agent Invocation Log Entry
 */
export interface AgentInvocationLogEntry {
    timestamp: string;
    toolId: string;
    toolName: string;
    connectionId: string | null;
    prefillSummary: string;
    outcome: "completed" | "no-result" | "rejected";
    invocationMode?: "one-way" | "two-way";
    correlationId?: string;
    error?: string;
}

/**
 * Agent Invocation API namespace
 */
export interface AgentInvocationAPI {
    getLogs: () => Promise<AgentInvocationLogEntry[]>;
}

/**
 * MCP server details shown in the renderer UI
 */
export interface McpServerDetails {
    address: string;
    authHeaderName: string;
    authHeaderValue: string;
    isRunning: boolean;
}

export interface McpClientConfigWriteResult {
    client: "claude-desktop" | "vscode";
    os: "macos" | "windows" | "linux";
    filePath: string;
    serverName: string;
}

/**
 * MCP server API namespace
 */
export interface McpServerAPI {
    getDetails: () => Promise<McpServerDetails>;
    configureClaudeDesktop: () => Promise<McpClientConfigWriteResult>;
    configureVSCode: () => Promise<McpClientConfigWriteResult>;
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
 * Split layout state returned by the main process
 */
export interface SplitLayoutState {
    isActive: boolean;
    /** Ordered list of instanceIds assigned to the left pane. */
    leftGroup: string[];
    /** Ordered list of instanceIds assigned to the right pane. */
    rightGroup: string[];
    /** The currently visible (active) tool in the left pane. */
    activeLeftInstanceId: string | null;
    /** The currently visible (active) tool in the right pane. */
    activeRightInstanceId: string | null;
    /** Which pane receives newly opened tools. */
    focusedPane: "left" | "right";
    ratio: number;
}

/**
 * Split Layout API namespace
 */
export interface SplitLayoutAPI {
    activate: (leftInstanceId: string, rightInstanceId: string) => Promise<boolean>;
    deactivate: () => Promise<boolean>;
    setRatio: (ratio: number) => Promise<void>;
    getState: () => Promise<SplitLayoutState>;
    /** Make instanceId the active (visible) tool in its pane. Also focuses that pane. */
    switchPane: (pane: "left" | "right", instanceId: string) => Promise<boolean>;
    /** Move instanceId from its current group to targetPane. Collapses split if source becomes empty. */
    moveToPane: (instanceId: string, targetPane: "left" | "right") => Promise<boolean>;
    /** Set which pane receives newly opened tools. */
    focusPane: (pane: "left" | "right") => Promise<void>;
    onStateChanged: (callback: (state: SplitLayoutState) => void) => void;
}

/**
 * Main ToolboxAPI interface
 */
export interface ToolboxAPI {
    getUserSettings: () => Promise<UserSettings>;
    updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
    getSetting: (key: string) => Promise<unknown>;
    setSetting: (key: string, value: unknown) => Promise<void>;
    getMcpAccessToken: () => Promise<string>;

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
    grantCspConsent: (toolId: string, requiredDomains?: string[], approvedOptionalDomains?: string[]) => Promise<void>;
    revokeCspConsent: (toolId: string) => Promise<void>;
    getCspConsents: () => Promise<{ [toolId: string]: CspConsentRecord }>;

    // Webview URL generation
    getToolWebviewUrl: (toolId: string) => Promise<string>;

    // Tool Window Management
    launchToolWindow: (instanceId: string, tool: Tool, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => Promise<boolean>;
    launchToolWithContext: (
        callerInstanceId: string,
        calleeInstanceId: string,
        tool: Tool,
        primaryConnectionId: string | null,
        secondaryConnectionId: string | null,
        prefillData: Record<string, unknown>,
        noReturn?: boolean,
    ) => Promise<unknown>;
    switchToolWindow: (toolId: string) => Promise<boolean>;
    closeToolWindow: (toolId: string) => Promise<boolean>;
    hideToolWindows: () => Promise<boolean>;
    getActiveToolWindow: () => Promise<string | null>;
    getOpenToolWindows: () => Promise<string[]>;
    updateToolConnection: (instanceId: string, primaryConnectionId: string | null, secondaryConnectionId?: string | null) => Promise<void>;
    /** Find installed tools that declare a given capability tag in their pptb.config.json. */
    findToolsByCapability: (tag: string) => Promise<Tool[]>;
    /** Returns the list of known capability tags from the registry (Supabase-backed, with built-in fallback). */
    getKnownCapabilityTags: () => Promise<CapabilityTagEntry[]>;
    /** Trigger banner "Return to Caller" — resolves the currently active callee's invocation with null and auto-closes it. */
    returnToCallerBanner: () => Promise<void>;
    /** Subscribe to invocation banner state changes (main → renderer push). */
    onInvocationBannerState: (callback: (state: { visible: boolean; callerToolName?: string }) => void) => void;
    /** Subscribe to multi-connection prompts triggered when an invoked callee requires a secondary connection. */
    onInvocationConnectionsPrompt: (callback: (prompt: { requestId: string; toolName: string; isSecondaryRequired: boolean; inheritedPrimaryConnectionId: string | null }) => void) => void;
    /** Provide the selected connection IDs in response to an INVOCATION_PROMPT_CONNECTIONS request (or null to cancel). */
    provideInvocationConnections: (requestId: string, result: { primaryConnectionId: string | null; secondaryConnectionId: string | null } | null) => Promise<void>;
    /**
     * Subscribe to callee-tool-opened events. Fired once the callee BrowserView is ready
     * so the renderer can create a dedicated tab for the callee instance.
     */
    onCalleeToolOpened: (
        callback: (data: { calleeInstanceId: string; callerInstanceId: string; tool: Tool; primaryConnectionId: string | null; secondaryConnectionId: string | null }) => void,
    ) => void;
    /**
     * Subscribe to callee-tool-closed events. Fired after the callee is auto-closed by
     * the main process so the renderer can remove the callee tab and return focus to the caller.
     */
    onCalleeToolClosed: (callback: (data: { calleeInstanceId: string; callerInstanceId: string }) => void) => void;

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
    fetchCommunityLinks: () => Promise<CommunityLinksCollection | null>;
    installToolFromRegistry: (toolId: string) => Promise<{ manifest: unknown; tool: Tool }>;
    checkToolUpdates: (toolId: string) => Promise<{ hasUpdate: boolean; latestVersion?: string }>;
    isToolUpdating: (toolId: string) => Promise<boolean>;
    /** Check whether a beta (pre-release) npm package version exists for the given npm package name. */
    checkBetaPackage: (npmPackageName: string) => Promise<{ hasBeta: boolean; betaVersion?: string }>;
    /** Install the beta (pre-release) npm package for a registry tool and return the loaded Tool. */
    installPrereleaseToolFromNpm: (npmPackageName: string) => Promise<Tool>;

    // Split layout namespace
    splitLayout: SplitLayoutAPI;

    // Utils namespace
    utils: UtilsAPI;

    // Troubleshooting namespace
    troubleshooting: TroubleshootingAPI;

    // FileSystem namespace
    fileSystem: FileSystemAPI;

    openExternal: (url: string) => Promise<void>;
    fetchFavicon: (url: string) => Promise<string | null>;

    // Terminal namespace
    terminal: TerminalAPI;

    // Events namespace
    events: EventsAPI;

    // Auto-update
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
    getAppVersion: () => Promise<string>;
    getVersionCompatibilityInfo: () => Promise<{ appVersion: string; minSupportedApiVersion: string }>;
    onUpdateChecking: (callback: () => void) => void;
    onUpdateAvailable: (callback: (info: unknown) => void) => void;
    onUpdateNotAvailable: (callback: () => void) => void;
    onUpdateDownloadProgress: (callback: (progress: unknown) => void) => void;
    onUpdateDownloaded: (callback: (info: unknown) => void) => void;
    onUpdateError: (callback: (error: string) => void) => void;
    onShowHomePage: (callback: () => void) => void;
    onOpenSettings: (callback: () => void) => void;

    // Authentication dialogs
    onShowDeviceCodeDialog: (callback: (message: string) => void) => void;
    onCloseDeviceCodeDialog: (callback: () => void) => void;
    onShowAuthErrorDialog: (callback: (message: string) => void) => void;

    // Token expiry
    onTokenExpired: (callback: (data: { connectionId: string; connectionName: string }) => void) => void;

    // Tool update events
    onToolUpdateStarted: (callback: (toolId: string) => void) => void;
    onToolUpdateCompleted: (callback: (toolId: string) => void) => void;

    // Protocol deep link events
    onProtocolInstallToolRequest: (callback: (params: { toolId: string; toolName: string }) => void) => void;

    // About dialog event
    onShowAbout: (
        callback: (info: {
            appVersion: string;
            installId: string;
            locale: string;
            electronVersion: string;
            nodeVersion: string;
            chromeVersion: string;
            platform: string;
            arch: string;
            osVersion: string;
            isInsider: boolean;
        }) => void,
    ) => void;

    // Dataverse namespace
    dataverse: DataverseAPI;

    // Agent Invocation namespace
    agentInvocation: AgentInvocationAPI;

    // MCP server namespace
    mcpServer: McpServerAPI;
}
