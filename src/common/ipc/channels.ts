/**
 * IPC Channel Constants (Shared)
 * Centralized definition of all IPC channel names to avoid string duplication.
 * Moved to src/common/ipc so both main and preload/renderer builds can depend
 * on a single source of truth without cross-boundary require issues.
 */

// Settings-related IPC channels
export const SETTINGS_CHANNELS = {
    GET_USER_SETTINGS: "get-user-settings",
    UPDATE_USER_SETTINGS: "update-user-settings",
    GET_SETTING: "get-setting",
    SET_SETTING: "set-setting",
    ADD_FAVORITE_TOOL: "add-favorite-tool",
    REMOVE_FAVORITE_TOOL: "remove-favorite-tool",
    GET_FAVORITE_TOOLS: "get-favorite-tools",
    IS_FAVORITE_TOOL: "is-favorite-tool",
    TOGGLE_FAVORITE_TOOL: "toggle-favorite-tool",
    GET_TOOL_SETTINGS: "get-tool-settings",
    UPDATE_TOOL_SETTINGS: "update-tool-settings",
    TOOL_SETTINGS_GET_ALL: "tool-settings-get-all",
    TOOL_SETTINGS_GET: "tool-settings-get",
    TOOL_SETTINGS_SET: "tool-settings-set",
    TOOL_SETTINGS_SET_ALL: "tool-settings-set-all",
    HAS_CSP_CONSENT: "has-csp-consent",
    GRANT_CSP_CONSENT: "grant-csp-consent",
    REVOKE_CSP_CONSENT: "revoke-csp-consent",
    GET_CSP_CONSENTS: "get-csp-consents",
    SET_TOOL_CONNECTION: "set-tool-connection",
    GET_TOOL_CONNECTION: "get-tool-connection",
    REMOVE_TOOL_CONNECTION: "remove-tool-connection",
    GET_ALL_TOOL_CONNECTIONS: "get-all-tool-connections",
    SET_TOOL_SECONDARY_CONNECTION: "set-tool-secondary-connection",
    GET_TOOL_SECONDARY_CONNECTION: "get-tool-secondary-connection",
    REMOVE_TOOL_SECONDARY_CONNECTION: "remove-tool-secondary-connection",
    GET_ALL_TOOL_SECONDARY_CONNECTIONS: "get-all-tool-secondary-connections",
    ADD_LAST_USED_TOOL: "add-last-used-tool",
    GET_LAST_USED_TOOLS: "get-last-used-tools",
    CLEAR_LAST_USED_TOOLS: "clear-last-used-tools",
    GET_MCP_ACCESS_TOKEN: "get-mcp-access-token",
} as const;

// Connection-related IPC channels
export const CONNECTION_CHANNELS = {
    ADD_CONNECTION: "add-connection",
    UPDATE_CONNECTION: "update-connection",
    DELETE_CONNECTION: "delete-connection",
    GET_CONNECTIONS: "get-connections",
    GET_CONNECTION_BY_ID: "get-connection-by-id",
    GET_CATEGORIES: "get-connection-categories",
    SET_ACTIVE_CONNECTION: "set-active-connection",
    TEST_CONNECTION: "test-connection",
    IS_TOKEN_EXPIRED: "is-connection-token-expired",
    REFRESH_TOKEN: "refresh-connection-token",
    CHECK_BROWSER_INSTALLED: "check-browser-installed",
    GET_BROWSER_PROFILES: "get-browser-profiles",
    EXPORT_CONNECTIONS: "export-connections",
    IMPORT_CONNECTIONS: "import-connections",
} as const;

// Tool-related IPC channels
export const TOOL_CHANNELS = {
    GET_ALL_TOOLS: "get-all-tools",
    GET_TOOL: "get-tool",
    LOAD_TOOL: "load-tool",
    UNLOAD_TOOL: "unload-tool",
    INSTALL_TOOL: "install-tool",
    UNINSTALL_TOOL: "uninstall-tool",
    GET_TOOL_WEBVIEW_HTML: "get-tool-webview-html",
    GET_TOOL_CONTEXT: "get-tool-context",
    GET_TOOL_WEBVIEW_URL: "get-tool-webview-url",
    LOAD_LOCAL_TOOL: "load-local-tool",
    GET_LOCAL_TOOL_WEBVIEW_HTML: "get-local-tool-webview-html",
    OPEN_DIRECTORY_PICKER: "open-directory-picker",
    FETCH_REGISTRY_TOOLS: "fetch-registry-tools",
    FETCH_COMMUNITY_LINKS: "fetch-community-links",
    INSTALL_TOOL_FROM_REGISTRY: "install-tool-from-registry",
    CHECK_TOOL_UPDATES: "check-tool-updates",
    UPDATE_TOOL: "update-tool",
    IS_TOOL_UPDATING: "is-tool-updating",
    /** Fetch the list of registered capability tags from Supabase (with built-in fallback). */
    GET_KNOWN_CAPABILITY_TAGS: "get-known-capability-tags",
    /** Check whether a beta (pre-release) npm package version exists for a given npm package name. */
    CHECK_BETA_PACKAGE: "check-beta-package",
    /** Install the beta (pre-release) npm package for a registry tool. */
    INSTALL_PRERELEASE_TOOL: "install-prerelease-tool",
} as const;

// Tool Window-related IPC channels
export const TOOL_WINDOW_CHANNELS = {
    LAUNCH: "tool-window:launch",
    LAUNCH_WITH_CONTEXT: "tool-window:launch-with-context",
    SWITCH: "tool-window:switch",
    CLOSE: "tool-window:close",
    GET_ACTIVE: "tool-window:get-active",
    GET_OPEN_TOOLS: "tool-window:get-open-tools",
    UPDATE_TOOL_CONNECTION: "tool-window:update-tool-connection",
    HIDE_ALL: "tool-window:hide-all",
    RENDERER_INITIALIZED: "tool-window:renderer-initialized",
    RETURN_INVOCATION_DATA: "tool-window:return-invocation-data",
    FIND_TOOLS_BY_CAPABILITY: "tool-window:find-tools-by-capability",
    /** Pushed from main process to the PPTB renderer to show/hide the invocation banner. */
    INVOCATION_BANNER_STATE: "tool-window:invocation-banner-state",
    /**
     * Pushed from main process to the PPTB renderer when an invoked callee tool requires
     * connections that were not inherited from the caller (e.g. secondary connection needed
     * by a multi-connection tool). The renderer shows the multi-connection selector and
     * replies via PROVIDE_INVOCATION_CONNECTIONS.
     */
    INVOCATION_PROMPT_CONNECTIONS: "tool-window:invocation-prompt-connections",
    /**
     * Sent from the PPTB renderer back to the main process to provide the connection IDs
     * selected by the user in response to an INVOCATION_PROMPT_CONNECTIONS request.
     */
    PROVIDE_INVOCATION_CONNECTIONS: "tool-window:provide-invocation-connections",
    /**
     * Pushed from the main process to the PPTB renderer when a callee tool has been
     * successfully launched via an inter-tool invocation. The renderer creates a new tab
     * for the callee so it can be independently managed (switched to, closed, etc.).
     */
    CALLEE_TOOL_OPENED: "tool-window:callee-tool-opened",
    /**
     * Pushed from the main process to the PPTB renderer when a callee tool has been
     * auto-closed after returning data (resolveInvocation path). The renderer removes
     * the callee's tab and switches back to the caller tool.
     */
    CALLEE_TOOL_CLOSED: "tool-window:callee-tool-closed",
} as const;

// Terminal-related IPC channels
export const TERMINAL_CHANNELS = {
    CREATE_TERMINAL: "create-terminal",
    EXECUTE_COMMAND: "execute-terminal-command",
    CLOSE_TERMINAL: "close-terminal",
    GET_TERMINAL: "get-terminal",
    GET_TOOL_TERMINALS: "get-tool-terminals",
    GET_ALL_TERMINALS: "get-all-terminals",
    SET_VISIBILITY: "set-terminal-visibility",
} as const;

// Utility-related IPC channels
export const UTIL_CHANNELS = {
    SHOW_NOTIFICATION: "show-notification",
    SHOW_CONTEXT_MENU: "show-context-menu",
    COPY_TO_CLIPBOARD: "copy-to-clipboard",
    GET_CURRENT_THEME: "get-current-theme",
    OPEN_EXTERNAL: "open-external",
    GET_EVENT_HISTORY: "get-event-history",
    SHOW_MODAL_WINDOW: "show-modal-window",
    CLOSE_MODAL_WINDOW: "close-modal-window",
    SEND_MODAL_MESSAGE: "send-modal-message",
    CHECK_SUPABASE_CONNECTIVITY: "check-supabase-connectivity",
    CHECK_REGISTRY_FILE: "check-registry-file",
    CHECK_USER_SETTINGS: "check-user-settings",
    CHECK_TOOL_SETTINGS: "check-tool-settings",
    CHECK_CONNECTIONS: "check-connections",
    CHECK_TOOL_DOWNLOAD: "check-tool-download",
    CHECK_INTERNET_CONNECTIVITY: "check-internet-connectivity",
    FETCH_FAVICON: "fetch-favicon",
    OPEN_IN_CONNECTION_BROWSER: "open-in-connection-browser",
} as const;

// Filesystem-related IPC channels
export const FILESYSTEM_CHANNELS = {
    READ_TEXT: "filesystem:read-text",
    READ_BINARY: "filesystem:read-binary",
    EXISTS: "filesystem:exists",
    STAT: "filesystem:stat",
    READ_DIRECTORY: "filesystem:read-directory",
    WRITE_TEXT: "filesystem:write-text",
    CREATE_DIRECTORY: "filesystem:create-directory",
    SAVE_FILE: "filesystem:save-file",
    SELECT_PATH: "filesystem:select-path",
} as const;

// Auto-update-related IPC channels
export const UPDATE_CHANNELS = {
    CHECK_FOR_UPDATES: "check-for-updates",
    DOWNLOAD_UPDATE: "download-update",
    QUIT_AND_INSTALL: "quit-and-install",
    GET_APP_VERSION: "get-app-version",
    GET_VERSION_COMPATIBILITY_INFO: "get-version-compatibility-info",
} as const;

// Dataverse-related IPC channels
export const DATAVERSE_CHANNELS = {
    CREATE: "dataverse.create",
    RETRIEVE: "dataverse.retrieve",
    UPDATE: "dataverse.update",
    DELETE: "dataverse.delete",
    RETRIEVE_MULTIPLE: "dataverse.retrieveMultiple",
    EXECUTE: "dataverse.execute",
    FETCH_XML_QUERY: "dataverse.fetchXmlQuery",
    GET_ENTITY_METADATA: "dataverse.getEntityMetadata",
    GET_ALL_ENTITIES_METADATA: "dataverse.getAllEntitiesMetadata",
    GET_ENTITY_RELATED_METADATA: "dataverse.getEntityRelatedMetadata",
    GET_SOLUTIONS: "dataverse.getSolutions",
    QUERY_DATA: "dataverse.queryData",
    CREATE_MULTIPLE: "dataverse.createMultiple",
    UPDATE_MULTIPLE: "dataverse.updateMultiple",
    PUBLISH_CUSTOMIZATIONS: "dataverse.publishCustomizations",
    GET_ENTITY_SET_NAME: "dataverse.getEntitySetName",
    ASSOCIATE: "dataverse.associate",
    DISASSOCIATE: "dataverse.disassociate",
    DEPLOY_SOLUTION: "dataverse.deploySolution",
    GET_IMPORT_JOB_STATUS: "dataverse.getImportJobStatus",
    // Metadata helper utilities
    BUILD_LABEL: "dataverse.buildLabel",
    GET_ATTRIBUTE_ODATA_TYPE: "dataverse.getAttributeODataType",
    // Entity (Table) metadata operations
    CREATE_ENTITY_DEFINITION: "dataverse.createEntityDefinition",
    UPDATE_ENTITY_DEFINITION: "dataverse.updateEntityDefinition",
    DELETE_ENTITY_DEFINITION: "dataverse.deleteEntityDefinition",
    // Attribute (Column) metadata operations
    CREATE_ATTRIBUTE: "dataverse.createAttribute",
    UPDATE_ATTRIBUTE: "dataverse.updateAttribute",
    DELETE_ATTRIBUTE: "dataverse.deleteAttribute",
    CREATE_POLYMORPHIC_LOOKUP_ATTRIBUTE: "dataverse.createPolymorphicLookupAttribute",
    // Relationship metadata operations
    CREATE_RELATIONSHIP: "dataverse.createRelationship",
    UPDATE_RELATIONSHIP: "dataverse.updateRelationship",
    DELETE_RELATIONSHIP: "dataverse.deleteRelationship",
    // Global option set (choice) metadata operations
    CREATE_GLOBAL_OPTION_SET: "dataverse.createGlobalOptionSet",
    UPDATE_GLOBAL_OPTION_SET: "dataverse.updateGlobalOptionSet",
    DELETE_GLOBAL_OPTION_SET: "dataverse.deleteGlobalOptionSet",
    // Option value modification actions
    INSERT_OPTION_VALUE: "dataverse.insertOptionValue",
    UPDATE_OPTION_VALUE: "dataverse.updateOptionValue",
    DELETE_OPTION_VALUE: "dataverse.deleteOptionValue",
    ORDER_OPTION: "dataverse.orderOption",
    GET_CSDL_DOCUMENT: "dataverse.getCSDLDocument",
} as const;

// Power Platform API-related IPC channels
export const POWERPLATFORM_CHANNELS = {
    REQUEST: "powerplatform.request",
} as const;

// Protocol handler-related IPC channels
export const PROTOCOL_CHANNELS = {
    PROTOCOL_INSTALL_TOOL: "protocol:install-tool",
} as const;

// Agent Invocation Logging channels
export const AGENT_INVOCATION_CHANNELS = {
    GET_LOGS: "agent-invocation:get-logs",
} as const;

// MCP server status/details channels
export const MCP_SERVER_CHANNELS = {
    GET_DETAILS: "mcp-server:get-details",
    CONFIGURE_CLAUDE_DESKTOP: "mcp-server:configure-claude-desktop",
    CONFIGURE_VSCODE: "mcp-server:configure-vscode",
} as const;

// Event-related IPC channels (from main to renderer)
export const EVENT_CHANNELS = {
    TOOLBOX_EVENT: "toolbox-event",
    UPDATE_CHECKING: "update-checking",
    UPDATE_AVAILABLE: "update-available",
    UPDATE_NOT_AVAILABLE: "update-not-available",
    UPDATE_DOWNLOAD_PROGRESS: "update-download-progress",
    UPDATE_DOWNLOADED: "update-downloaded",
    UPDATE_ERROR: "update-error",
    SHOW_HOME_PAGE: "show-home-page",
    OPEN_SETTINGS: "open-settings",
    SHOW_DEVICE_CODE_DIALOG: "show-device-code-dialog",
    CLOSE_DEVICE_CODE_DIALOG: "close-device-code-dialog",
    SHOW_AUTH_ERROR_DIALOG: "show-auth-error-dialog",
    TOKEN_EXPIRED: "token-expired",
    MODAL_WINDOW_OPENED: "modal-window:opened",
    MODAL_WINDOW_CLOSED: "modal-window:closed",
    MODAL_WINDOW_MESSAGE: "modal-window:message",
    TOOL_UPDATE_STARTED: "tool:update-started",
    TOOL_UPDATE_COMPLETED: "tool:update-completed",
    PROTOCOL_INSTALL_TOOL_REQUEST: "protocol:install-tool-request",
    SHOW_ABOUT: "show-about",
} as const;

// Internal BrowserWindow modal channels (modal content -> main process)
export const MODAL_WINDOW_CHANNELS = {
    CLOSE: "modal-window:close",
    MESSAGE: "modal-window:event",
    RENDERER_MESSAGE: "modal-window:renderer-message",
} as const;

// Split layout channels
export const SPLIT_LAYOUT_CHANNELS = {
    ACTIVATE: "split-layout:activate",
    DEACTIVATE: "split-layout:deactivate",
    SET_RATIO: "split-layout:set-ratio",
    GET_STATE: "split-layout:get-state",
    /** setActiveInPane(pane, instanceId) — make a group member the visible tool in its pane */
    SWITCH_PANE: "split-layout:switch-pane",
    /** moveToPane(instanceId, targetPane) — move a tab from one group to another */
    MOVE_TO_PANE: "split-layout:move-to-pane",
    /** setFocusedPane(pane) — set which pane receives newly opened tools */
    FOCUS_PANE: "split-layout:focus-pane",
    /** Pushed from main to renderer when split state changes */
    STATE_CHANGED: "split-layout:state-changed",
} as const;

// Type helper to extract channel names
export type ChannelName<T> = T[keyof T];
