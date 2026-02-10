/**
 * Connection management module
 * Handles connection UI, CRUD operations, and authentication
 */

import { captureMessage, logDebug, logInfo } from "../../common/sentryHelper";
import type { ConnectionsSortOption, DataverseConnection, ModalWindowClosedPayload, ModalWindowMessagePayload, UIConnectionData } from "../../common/types";
import { parseConnectionString } from "../../common/types/connection";
import { getAddConnectionModalControllerScript } from "../modals/addConnection/controller";
import { getAddConnectionModalView } from "../modals/addConnection/view";
import { getEditConnectionModalControllerScript } from "../modals/editConnection/controller";
import { getEditConnectionModalView } from "../modals/editConnection/view";
import { getSelectConnectionModalControllerScript } from "../modals/selectConnection/controller";
import { getSelectConnectionModalView } from "../modals/selectConnection/view";
import { getSelectMultiConnectionModalControllerScript } from "../modals/selectMultiConnection/controller";
import { getSelectMultiConnectionModalView } from "../modals/selectMultiConnection/view";
import { sortConnections } from "../utils/connectionSorting";
import {
    closeBrowserWindowModal,
    offBrowserWindowModalClosed,
    onBrowserWindowModalClosed,
    onBrowserWindowModalMessage,
    sendBrowserWindowModalMessage,
    showBrowserWindowModal,
} from "./browserWindowModals";

type ConnectionEnvironment = "Dev" | "Test" | "UAT" | "Production";
type ConnectionAuthenticationType = "interactive" | "clientSecret" | "usernamePassword" | "connectionString";

interface ConnectionFormPayload {
    id?: string;
    name?: string;
    url?: string;
    environment?: ConnectionEnvironment;
    authenticationType?: ConnectionAuthenticationType;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    username?: string;
    password?: string;
    optionalClientId?: string;
    interactiveUsername?: string;
    interactiveTenantId?: string;
    usernamePasswordClientId?: string;
    usernamePasswordTenantId?: string;
    connectionString?: string;
    browserType?: string;
    browserProfile?: string;
    browserProfileName?: string;
}

interface AuthenticateConnectionAction {
    action: "authenticate";
    connectionId: string;
    listType: "primary" | "secondary";
}

interface ConfirmConnectionsAction {
    action: "confirm";
    primaryConnectionId: string;
    secondaryConnectionId: string | null;
}

interface LegacyConnectionSelection {
    primaryConnectionId?: string;
    secondaryConnectionId?: string;
    action?: never;
}

type SelectMultiConnectionPayload = AuthenticateConnectionAction | ConfirmConnectionsAction | LegacyConnectionSelection;

const ADD_CONNECTION_MODAL_CHANNELS = {
    submit: "add-connection:submit",
    submitReady: "add-connection:submit:ready",
    test: "add-connection:test",
    testReady: "add-connection:test:ready",
    testFeedback: "add-connection:test:feedback",
} as const;

const ADD_CONNECTION_MODAL_DIMENSIONS = {
    width: 520,
    height: 700,
};

const EDIT_CONNECTION_MODAL_CHANNELS = {
    submit: "edit-connection:submit",
    submitReady: "edit-connection:submit:ready",
    test: "edit-connection:test",
    testReady: "edit-connection:test:ready",
    testFeedback: "edit-connection:test:feedback",
    populateConnection: "edit-connection:populate",
} as const;

const EDIT_CONNECTION_MODAL_DIMENSIONS = {
    width: 520,
    height: 700,
};

const SELECT_CONNECTION_MODAL_CHANNELS = {
    selectConnection: "select-connection:select",
    connectReady: "select-connection:connect:ready",
    populateConnections: "select-connection:populate",
} as const;

const SELECT_CONNECTION_MODAL_DIMENSIONS = {
    width: 520,
    height: 600,
};

const SELECT_MULTI_CONNECTION_MODAL_CHANNELS = {
    selectConnections: "select-multi-connection:select",
    connectReady: "select-multi-connection:connect:ready",
    populateConnections: "select-multi-connection:populate",
} as const;

const SELECT_MULTI_CONNECTION_MODAL_DIMENSIONS = {
    width: 920,
    height: 700,
};

let addConnectionModalHandlersRegistered = false;
let editConnectionModalHandlersRegistered = false;
let selectConnectionModalHandlersRegistered = false;
let selectMultiConnectionModalHandlersRegistered = false;

// Store promise handlers for select connection modal - now returns connectionId
const selectConnectionModalPromiseHandlers: {
    resolve: ((value: string) => void) | null;
    reject: ((error: Error) => void) | null;
} = {
    resolve: null,
    reject: null,
};

// Store promise handlers for select multi-connection modal
const selectMultiConnectionModalPromiseHandlers: {
    resolve: ((result: { primaryConnectionId: string; secondaryConnectionId: string | null }) => void) | null;
    reject: ((error: Error) => void) | null;
} = {
    resolve: null,
    reject: null,
};

// Store the connection ID to highlight in the modal (for tool-specific connection selection)
let highlightConnectionId: string | null = null;

// Store the connection ID being edited
let editingConnectionId: string | null = null;

const CONNECTIONS_SORT_SETTING_KEY = "connectionsSort";
const DEFAULT_CONNECTIONS_SORT: ConnectionsSortOption = "last-used";

function coerceConnectionsSortOption(value: unknown): ConnectionsSortOption {
    if (value === "last-used" || value === "name-asc" || value === "name-desc" || value === "environment") {
        return value as ConnectionsSortOption;
    }

    return DEFAULT_CONNECTIONS_SORT;
}

async function getConnectionsSortPreference(): Promise<ConnectionsSortOption> {
    try {
        const storedPreference = await window.toolboxAPI.getSetting(CONNECTIONS_SORT_SETTING_KEY);
        return coerceConnectionsSortOption(storedPreference);
    } catch (error) {
        captureMessage("Failed to read connections sort preference", "warning", { extra: { error } });
        return DEFAULT_CONNECTIONS_SORT;
    }
}

/**
 * Update footer connection information
 */
export async function updateFooterConnection(): Promise<void> {
    const footerConnectionName = document.getElementById("footer-connection-name");
    const footerChangeBtn = document.getElementById("footer-change-connection-btn");

    if (!footerConnectionName) return;

    try {
        // Note: With no global active connection, the footer shows the active tool's connection
        // This is handled by updateActiveToolConnectionStatus in toolManagement.ts
        // This function now just ensures the UI element exists
        footerConnectionName.textContent = "No tool selected";
        footerConnectionName.className = "connection-status";
        if (footerChangeBtn) {
            footerChangeBtn.style.display = "none";
        }
    } catch (error) {
        captureMessage("Error updating footer connection:", "error", { extra: { error } });
    }
}

export function initializeAddConnectionModalBridge(): void {
    if (addConnectionModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleAddConnectionModalMessage);
    addConnectionModalHandlersRegistered = true;
}

export async function openAddConnectionModal(): Promise<void> {
    initializeAddConnectionModalBridge();
    await showBrowserWindowModal({
        id: "add-connection-browser-modal",
        html: buildAddConnectionModalHtml(),
        width: ADD_CONNECTION_MODAL_DIMENSIONS.width,
        height: ADD_CONNECTION_MODAL_DIMENSIONS.height,
    });
}

function handleAddConnectionModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || typeof payload.channel !== "string") {
        return;
    }

    switch (payload.channel) {
        case ADD_CONNECTION_MODAL_CHANNELS.submit:
            void handleAddConnectionSubmit(payload.data as ConnectionFormPayload);
            break;
        case ADD_CONNECTION_MODAL_CHANNELS.test:
            void handleTestConnectionRequest(payload.data as ConnectionFormPayload);
            break;
        default:
            break;
    }
}

function buildAddConnectionModalHtml(): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const themeClass = isDarkTheme ? "dark-theme" : "light-theme";
    const { styles, body } = getAddConnectionModalView(isDarkTheme);
    const script = getAddConnectionModalControllerScript(ADD_CONNECTION_MODAL_CHANNELS);
    // Inject theme class into body tag
    const bodyWithTheme = body.replace("<body>", `<body class="${themeClass}">`);
    return `${styles}\n${bodyWithTheme}\n${script}`.trim();
}

/**
 * Initialize select connection modal bridge
 */
export function initializeSelectConnectionModalBridge(): void {
    if (selectConnectionModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleSelectConnectionModalMessage);
    selectConnectionModalHandlersRegistered = true;
}

/**
 * Open the select connection modal
 * Returns a promise that resolves with the selected connectionId when a connection is selected and connected, or rejects if cancelled
 * @param toolConnectionId - Optional connection ID to highlight as active (for tool-specific selection)
 */
export async function openSelectConnectionModal(toolConnectionId?: string | null): Promise<string> {
    return new Promise((resolve, reject) => {
        initializeSelectConnectionModalBridge();

        // Store the tool connection ID to highlight in the modal
        highlightConnectionId = toolConnectionId || null;

        // Store resolve/reject handlers for later use
        selectConnectionModalPromiseHandlers.resolve = resolve;
        selectConnectionModalPromiseHandlers.reject = reject;

        // Listen for modal close event to reject if not already resolved
        const modalClosedHandler = (payload: ModalWindowClosedPayload) => {
            if (selectConnectionModalPromiseHandlers.reject && payload?.id === "select-connection-browser-modal") {
                // Modal was closed without selecting a connection
                selectConnectionModalPromiseHandlers.reject(new Error("Connection selection cancelled"));
                selectConnectionModalPromiseHandlers.resolve = null;
                selectConnectionModalPromiseHandlers.reject = null;
                highlightConnectionId = null; // Clear highlight
                // Remove the handler after first call
                offBrowserWindowModalClosed(modalClosedHandler);
            }
        };

        onBrowserWindowModalClosed(modalClosedHandler);

        showBrowserWindowModal({
            id: "select-connection-browser-modal",
            html: buildSelectConnectionModalHtml(),
            width: SELECT_CONNECTION_MODAL_DIMENSIONS.width,
            height: SELECT_CONNECTION_MODAL_DIMENSIONS.height,
        }).catch(reject);
    });
}

function handleSelectConnectionModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || typeof payload.channel !== "string") {
        return;
    }

    switch (payload.channel) {
        case SELECT_CONNECTION_MODAL_CHANNELS.selectConnection:
            void handleSelectConnectionRequest(payload.data as { connectionId?: string });
            break;
        case SELECT_CONNECTION_MODAL_CHANNELS.populateConnections:
            void handlePopulateConnectionsRequest();
            break;
        default:
            break;
    }
}

function buildSelectConnectionModalHtml(): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const { styles, body } = getSelectConnectionModalView(isDarkTheme);
    const script = getSelectConnectionModalControllerScript(SELECT_CONNECTION_MODAL_CHANNELS);
    return `${styles}\n${body}\n${script}`.trim();
}

async function handleSelectConnectionRequest(data?: { connectionId?: string }): Promise<void> {
    const connectionId = data?.connectionId;

    if (!connectionId) {
        await signalSelectConnectionReady();
        return;
    }

    try {
        // Authenticate the connection - this will trigger the authentication flow
        await window.toolboxAPI.connections.authenticate(connectionId);

        // Connect to the selected connection - this will update UI
        const connectedId = await connectToConnection(connectionId);

        // Verify the connection was successful
        if (!connectedId || connectedId !== connectionId) {
            throw new Error("Connection was not successfully established");
        }

        // Resolve the promise BEFORE closing the modal to avoid race condition
        // where modal close handler might reject the promise
        const resolveHandler = selectConnectionModalPromiseHandlers.resolve;
        selectConnectionModalPromiseHandlers.resolve = null;
        selectConnectionModalPromiseHandlers.reject = null;

        // Clear highlight connection ID
        highlightConnectionId = null;

        // Close the modal
        await closeBrowserWindowModal();

        // Now resolve the promise with the connectionId after handlers are cleared
        if (resolveHandler) {
            resolveHandler(connectionId);
        }
    } catch (error) {
        captureMessage("Error connecting to selected connection:", "error", { extra: { error } });

        // Clean up the error message - remove IPC wrapper text
        let errorMessage = (error as Error).message;
        // Remove "Error invoking remote method 'set-active-connection': " prefix
        errorMessage = errorMessage.replace(/^Error invoking remote method '[^']+': /, "");
        // Remove "Error: " prefix if present
        errorMessage = errorMessage.replace(/^Error: /, "");

        // Show error notification to user
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Failed",
            body: errorMessage,
            type: "error",
        });

        await signalSelectConnectionReady();

        // Don't close modal on error - let user try again or cancel
    }
}

async function handlePopulateConnectionsRequest(): Promise<void> {
    try {
        const connections = await window.toolboxAPI.connections.getAll();
        const sortOption = await getConnectionsSortPreference();
        const sortedConnections = sortConnections(connections, sortOption);

        // Send connections list to modal
        await sendBrowserWindowModalMessage({
            channel: SELECT_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: {
                sortOption,
                // Map persisted connections to UI-level data with isActive property
                connections: sortedConnections.map(
                    (conn: DataverseConnection): UIConnectionData => ({
                        id: conn.id,
                        name: conn.name,
                        url: conn.url,
                        environment: conn.environment,
                        authenticationType: conn.authenticationType,
                        lastUsedAt: conn.lastUsedAt,
                        createdAt: conn.createdAt,
                        // If highlightConnectionId is set (tool-specific modal), use it to mark as active
                        // Otherwise, mark none as active since there's no global active connection
                        isActive: highlightConnectionId ? conn.id === highlightConnectionId : false,
                    }),
                ),
            },
        });
    } catch (error) {
        captureMessage("Failed to populate connections:", "error", { extra: { error } });
        await sendBrowserWindowModalMessage({
            channel: SELECT_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: { connections: [] },
        });
    }
}

async function signalSelectConnectionReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: SELECT_CONNECTION_MODAL_CHANNELS.connectReady });
}

/**
 * Initialize select multi-connection modal bridge
 */
export function initializeSelectMultiConnectionModalBridge(): void {
    if (selectMultiConnectionModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleSelectMultiConnectionModalMessage);
    selectMultiConnectionModalHandlersRegistered = true;
}

/**
 * Open the select multi-connection modal for tools that require two connections
 * Returns a promise that resolves with both connection IDs, or rejects if cancelled
 * @param isSecondaryRequired - Whether the secondary connection is required (true) or optional (false)
 */
export async function openSelectMultiConnectionModal(isSecondaryRequired: boolean = true): Promise<{ primaryConnectionId: string; secondaryConnectionId: string | null }> {
    return new Promise((resolve, reject) => {
        initializeSelectMultiConnectionModalBridge();

        // Store resolve/reject handlers for later use
        selectMultiConnectionModalPromiseHandlers.resolve = resolve;
        selectMultiConnectionModalPromiseHandlers.reject = reject;

        // Listen for modal close event to reject if not already resolved
        const modalClosedHandler = (payload: ModalWindowClosedPayload) => {
            if (selectMultiConnectionModalPromiseHandlers.reject && payload?.id === "select-multi-connection-browser-modal") {
                // Modal was closed without selecting connections
                selectMultiConnectionModalPromiseHandlers.reject(new Error("Multi-connection selection cancelled"));
                selectMultiConnectionModalPromiseHandlers.resolve = null;
                selectMultiConnectionModalPromiseHandlers.reject = null;
                // Remove the handler after first call
                offBrowserWindowModalClosed(modalClosedHandler);
            }
        };

        onBrowserWindowModalClosed(modalClosedHandler);

        showBrowserWindowModal({
            id: "select-multi-connection-browser-modal",
            html: buildSelectMultiConnectionModalHtml(isSecondaryRequired),
            width: SELECT_MULTI_CONNECTION_MODAL_DIMENSIONS.width,
            height: SELECT_MULTI_CONNECTION_MODAL_DIMENSIONS.height,
        }).catch(reject);
    });
}

function handleSelectMultiConnectionModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || typeof payload.channel !== "string") {
        return;
    }

    switch (payload.channel) {
        case SELECT_MULTI_CONNECTION_MODAL_CHANNELS.selectConnections:
            void handleSelectMultiConnectionsRequest(payload.data as { primaryConnectionId?: string; secondaryConnectionId?: string });
            break;
        case SELECT_MULTI_CONNECTION_MODAL_CHANNELS.populateConnections:
            void handlePopulateMultiConnectionsRequest();
            break;
        default:
            break;
    }
}

function buildSelectMultiConnectionModalHtml(isSecondaryRequired: boolean = true): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const { styles, body } = getSelectMultiConnectionModalView(isDarkTheme, isSecondaryRequired);
    const script = getSelectMultiConnectionModalControllerScript(SELECT_MULTI_CONNECTION_MODAL_CHANNELS, isSecondaryRequired);
    return `${styles}\n${body}\n${script}`.trim();
}

async function handleSelectMultiConnectionsRequest(data?: SelectMultiConnectionPayload): Promise<void> {
    // Handle authentication requests from individual connect buttons
    if (data && "action" in data && data.action === "authenticate") {
        try {
            // Authenticate the connection
            await window.toolboxAPI.connections.authenticate(data.connectionId);

            // Send success message back to modal
            await sendBrowserWindowModalMessage({
                channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.connectReady,
                data: {
                    success: true,
                    connectionId: data.connectionId,
                    listType: data.listType,
                },
            });
        } catch (error) {
            captureMessage("Error authenticating connection:", "error", { extra: { error } });
            // Send failure message back to modal
            await sendBrowserWindowModalMessage({
                channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.connectReady,
                data: {
                    success: false,
                    connectionId: data.connectionId,
                    listType: data.listType,
                    error: (error as Error).message,
                },
            });
        }
        return;
    }

    // Handle confirm button - connections are already authenticated
    if (data && "action" in data && data.action === "confirm") {
        try {
            // Resolve the promise BEFORE closing the modal
            const resolveHandler = selectMultiConnectionModalPromiseHandlers.resolve;
            selectMultiConnectionModalPromiseHandlers.resolve = null;
            selectMultiConnectionModalPromiseHandlers.reject = null;

            // Close the modal
            await closeBrowserWindowModal();

            // Now resolve the promise with both connection IDs
            if (resolveHandler) {
                resolveHandler({ primaryConnectionId: data.primaryConnectionId, secondaryConnectionId: data.secondaryConnectionId });
            }
        } catch (error) {
            captureMessage("Error confirming multi-connections:", "error", { extra: { error } });
        }
        return;
    }

    // Legacy path - should not be hit anymore but keeping for backwards compatibility
    const primaryConnectionId = data?.primaryConnectionId;
    const secondaryConnectionId = data?.secondaryConnectionId;

    if (!primaryConnectionId || !secondaryConnectionId) {
        await signalSelectMultiConnectionReady();
        return;
    }

    try {
        // Resolve the promise BEFORE closing the modal
        const resolveHandler = selectMultiConnectionModalPromiseHandlers.resolve;
        selectMultiConnectionModalPromiseHandlers.resolve = null;
        selectMultiConnectionModalPromiseHandlers.reject = null;

        // Close the modal
        await closeBrowserWindowModal();

        // Now resolve the promise with both connection IDs
        if (resolveHandler) {
            resolveHandler({ primaryConnectionId, secondaryConnectionId });
        }
    } catch (error) {
        captureMessage("Error selecting multi-connections:", "error", { extra: { error } });
        await signalSelectMultiConnectionReady();
    }
}

async function handlePopulateMultiConnectionsRequest(): Promise<void> {
    try {
        const connections = await window.toolboxAPI.connections.getAll();
        const sortOption = await getConnectionsSortPreference();
        const sortedConnections = sortConnections(connections, sortOption);

        // Send connections list to modal
        await sendBrowserWindowModalMessage({
            channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: {
                sortOption,
                connections: sortedConnections.map((conn: DataverseConnection) => ({
                    id: conn.id,
                    name: conn.name,
                    url: conn.url,
                    environment: conn.environment,
                    authenticationType: conn.authenticationType,
                    lastUsedAt: conn.lastUsedAt,
                    createdAt: conn.createdAt,
                    isActive: false,
                })),
            },
        });
    } catch (error) {
        captureMessage("Failed to populate multi-connections:", "error", { extra: { error } });
        await sendBrowserWindowModalMessage({
            channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: { connections: [] },
        });
    }
}

async function signalSelectMultiConnectionReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.connectReady });
}

/**
 * Load connections list in the connections view
 */
export async function loadConnections(): Promise<void> {
    logInfo("loadConnections() called");
    const connectionsList = document.getElementById("connections-list");
    if (!connectionsList) {
        captureMessage("connections-list element not found", "error");
        return;
    }

    try {
        const connections = await window.toolboxAPI.connections.getAll();
        logInfo("Loaded connections:", { connections });

        if (connections.length === 0) {
            connectionsList.innerHTML = `
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p class="empty-state-hint">Add a connection to your Dataverse environment.</p>
                </div>
            `;
            updateFooterConnectionStatus(null);
            return;
        }

        connectionsList.innerHTML = connections
            .map(
                (conn: any) => `
            <div class="connection-card ${conn.isActive ? "active-connection" : ""}" data-connection-id="${conn.id}">
                <div class="connection-header">
                    <div>
                        <div class="connection-name">${conn.name}</div>
                        <span class="connection-env-badge env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                    </div>
                    <div class="connection-actions">
                        ${
                            conn.isActive
                                ? '<button class="fluent-button fluent-button-secondary" data-action="disconnect">Disconnect</button>'
                                : '<button class="fluent-button fluent-button-primary" data-action="connect" data-connection-id="' + conn.id + '">Connect</button>'
                        }
                        <button class="fluent-button fluent-button-secondary" data-action="edit" data-connection-id="${conn.id}" title="Edit connection">Edit</button>
                        <button class="fluent-button fluent-button-secondary" data-action="delete" data-connection-id="${conn.id}">Delete</button>
                    </div>
                </div>
                <div class="connection-url">${conn.url}</div>
                <div class="connection-meta">Created: ${new Date(conn.createdAt).toLocaleDateString()}</div>
            </div>
        `,
            )
            .join("");

        // Add event listeners to all connection action buttons
        connectionsList.querySelectorAll(".connection-actions button").forEach((button) => {
            button.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLButtonElement;
                const action = target.getAttribute("data-action");
                const connectionId = target.getAttribute("data-connection-id");

                if (action === "connect" && connectionId) {
                    connectToConnection(connectionId);
                } else if (action === "disconnect") {
                    // Disconnect action is no longer needed as there's no global active connection
                    // Tools have their own per-instance connections
                    logInfo("Disconnect action is deprecated - connections are per-tool-instance");
                } else if (action === "edit" && connectionId) {
                    editConnection(connectionId);
                } else if (action === "delete" && connectionId) {
                    deleteConnection(connectionId);
                }
            });
        });

        // Update footer
        const activeConn = connections.find((c: any) => c.isActive);
        updateFooterConnectionStatus(activeConn || null);
    } catch (error) {
        captureMessage("Error loading connections:", "error", { extra: { error } });
        connectionsList.innerHTML = `
            <div class="empty-state">
                <p>Error loading connections</p>
                <p class="empty-state-hint">${(error as Error).message}</p>
            </div>
        `;
    }
}

/**
 * Update footer connection status display
 */
export function updateFooterConnectionStatus(connection: any | null): void {
    const statusElement = document.getElementById("connection-status");
    if (!statusElement) return;

    if (connection) {
        // Check if token is expired
        let isExpired = false;
        if (connection.tokenExpiry) {
            const expiryDate = new Date(connection.tokenExpiry);
            const now = new Date();
            isExpired = expiryDate.getTime() <= now.getTime();
        }

        if (isExpired) {
            statusElement.textContent = `Token Expired: ${connection.name} (${connection.environment})`;
            statusElement.className = "connection-status expired";
        } else {
            statusElement.textContent = `Connected to: ${connection.name} (${connection.environment})`;
            statusElement.className = "connection-status connected";
        }
    } else {
        statusElement.textContent = "No active connection";
        statusElement.className = "connection-status";
    }
}

/**
 * Connect to a connection by ID
 * Note: With no global active connection, this just confirms the connection exists and is authenticated
 * Returns the connectionId that was connected
 */
export async function connectToConnection(id: string): Promise<string> {
    try {
        // Verify the connection exists by getting all connections and finding it
        const connections = await window.toolboxAPI.connections.getAll();
        const connection = connections.find((c: DataverseConnection) => c.id === id);
        if (!connection) {
            throw new Error("Connection not found");
        }

        // Authenticate the connection (this will trigger the authentication flow)
        await window.toolboxAPI.connections.authenticate(id);

        await window.toolboxAPI.utils.showNotification({
            title: "Connected",
            body: "Successfully authenticated and connected to the environment.",
            type: "success",
        });
        await loadConnections();
        await loadSidebarConnections();
        await updateFooterConnection();

        return id; // Return the connectionId
    } catch (error) {
        // Clean up the error message - remove IPC wrapper text
        let errorMessage = (error as Error).message;
        // Remove "Error invoking remote method 'authenticate': " prefix
        errorMessage = errorMessage.replace(/^Error invoking remote method '[^']+': /, "");
        // Remove "Error: " prefix if present
        errorMessage = errorMessage.replace(/^Error: /, "");

        await window.toolboxAPI.utils.showNotification({
            title: "Connection Failed",
            body: errorMessage,
            type: "error",
        });
        // Reload sidebar to reset button state
        await loadSidebarConnections();
        throw error; // Re-throw to let caller handle it
    }
}

/**
 * Handle re-authentication for expired tokens
 */
export async function handleReauthentication(connectionId: string): Promise<void> {
    // Get connection details once for use in both success and error paths
    const connection = await window.toolboxAPI.connections.getById(connectionId).catch(() => null);
    const connectionName = connection?.name || "Unknown connection";

    try {
        // First try to refresh using the refresh token (MSAL or manual)
        await window.toolboxAPI.connections.refreshToken(connectionId);

        await window.toolboxAPI.utils.showNotification({
            title: "Connection Refreshed",
            body: `Successfully refreshed token for '${connectionName}'.`,
            type: "success",
        });

        // Reload connections to update UI
        await loadSidebarConnections();
        await updateFooterConnection();
    } catch (error) {
        captureMessage("Token refresh failed:", "error", {
            extra: { error, connectionId, connectionName },
        });

        // Extract meaningful error message (strip generic parts)
        const errorMessage = (error as Error).message || "Token refresh failed";
        const cleanMessage = errorMessage.replace(/^Failed to refresh token for connection '[^']+': /, "");

        // If refresh fails, notify user to re-authenticate with specific connection name
        await window.toolboxAPI.utils.showNotification({
            title: "Re-authentication Required",
            body: `Connection '${connectionName}' needs re-authentication. ${cleanMessage}`,
            type: "error",
        });

        // Reload connections to update UI
        await loadSidebarConnections();
        await updateFooterConnection();
    }
}

async function handleAddConnectionSubmit(formPayload?: ConnectionFormPayload): Promise<void> {
    const validationMessage = validateConnectionPayload(formPayload, "add");
    if (validationMessage) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: validationMessage,
            type: "error",
        });
        await signalAddConnectionSubmitReady();
        return;
    }

    const connection = buildConnectionFromPayload(formPayload!, "add");

    try {
        await window.toolboxAPI.connections.add(connection);
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Added",
            body: `Connection "${connection.name}" has been added.`,
            type: "success",
        });
        await closeBrowserWindowModal();
        await loadConnections();
    } catch (error) {
        captureMessage("Error adding connection:", "error", { extra: { error } });
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Add Connection",
            body: (error as Error).message,
            type: "error",
        });
        await signalAddConnectionSubmitReady();
    }
}

async function handleTestConnectionRequest(formPayload?: ConnectionFormPayload): Promise<void> {
    if (editingConnectionId !== null) {
        await setEditConnectionTestFeedback("");
    } else {
        await setAddConnectionTestFeedback("");
    }

    const validationMessage = validateConnectionPayload(formPayload, "test");
    if (validationMessage) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: validationMessage,
            type: "error",
        });
        if (editingConnectionId !== null) {
            await setEditConnectionTestFeedback(validationMessage);
            await signalEditConnectionTestReady();
        } else {
            await setAddConnectionTestFeedback(validationMessage);
            await signalAddConnectionTestReady();
        }
        return;
    }

    const testConn = buildConnectionFromPayload(formPayload!, "test");

    try {
        const result = await window.toolboxAPI.connections.test(testConn);
        if (result.success) {
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Successful",
                body: "Successfully connected to the environment!",
                type: "success",
            });
            if (editingConnectionId !== null) {
                await setEditConnectionTestFeedback("");
            } else {
                await setAddConnectionTestFeedback("");
            }
        } else {
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Failed",
                body: result.error || "Failed to connect to the environment.",
                type: "error",
            });
            if (editingConnectionId !== null) {
                await setEditConnectionTestFeedback(result.error || "Failed to connect to the environment.");
            } else {
                await setAddConnectionTestFeedback(result.error || "Failed to connect to the environment.");
            }
        }
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Test Failed",
            body: (error as Error).message,
            type: "error",
        });
        if (editingConnectionId !== null) {
            await setEditConnectionTestFeedback((error as Error).message);
        } else {
            await setAddConnectionTestFeedback((error as Error).message);
        }
    } finally {
        if (editingConnectionId !== null) {
            await signalEditConnectionTestReady();
        } else {
            await signalAddConnectionTestReady();
        }
    }
}

/**
 * Initialize edit connection modal bridge
 */
export function initializeEditConnectionModalBridge(): void {
    if (editConnectionModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleEditConnectionModalMessage);
    editConnectionModalHandlersRegistered = true;
}

/**
 * Edit a connection by ID
 */
export async function editConnection(id: string): Promise<void> {
    logInfo("editConnection called with id:", { connectionId: id });
    editingConnectionId = id;
    initializeEditConnectionModalBridge();
    await showBrowserWindowModal({
        id: "edit-connection-browser-modal",
        html: buildEditConnectionModalHtml(),
        width: EDIT_CONNECTION_MODAL_DIMENSIONS.width,
        height: EDIT_CONNECTION_MODAL_DIMENSIONS.height,
    });
}

function handleEditConnectionModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || typeof payload.channel !== "string") {
        return;
    }

    switch (payload.channel) {
        case EDIT_CONNECTION_MODAL_CHANNELS.submit:
            void handleEditConnectionSubmit(payload.data as ConnectionFormPayload);
            break;
        case EDIT_CONNECTION_MODAL_CHANNELS.test:
            void handleTestConnectionRequest(payload.data as ConnectionFormPayload);
            break;
        case EDIT_CONNECTION_MODAL_CHANNELS.populateConnection:
            void handlePopulateEditConnectionRequest();
            break;
        default:
            break;
    }
}

function buildEditConnectionModalHtml(): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");

    logDebug("Building edit connection modal HTML", { isDarkTheme });

    const themeClass = isDarkTheme ? "dark-theme" : "light-theme";
    const { styles, body } = getEditConnectionModalView(isDarkTheme);
    const script = getEditConnectionModalControllerScript(EDIT_CONNECTION_MODAL_CHANNELS);
    // Inject theme class into body tag
    const bodyWithTheme = body.replace("<body>", `<body class="${themeClass}">`);
    return `${styles}\n${bodyWithTheme}\n${script}`.trim();
}

async function handlePopulateEditConnectionRequest(): Promise<void> {
    if (!editingConnectionId) {
        captureMessage("No connection ID to edit", "error");
        return;
    }

    try {
        const connection = await window.toolboxAPI.connections.getById(editingConnectionId);
        if (!connection) {
            throw new Error("Connection not found");
        }

        await sendBrowserWindowModalMessage({
            channel: EDIT_CONNECTION_MODAL_CHANNELS.populateConnection,
            data: connection,
        });
    } catch (error) {
        captureMessage("Failed to populate connection for editing:", "error", { extra: { error } });
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Load Connection",
            body: (error as Error).message,
            type: "error",
        });
        await closeBrowserWindowModal();
    }
}

async function handleEditConnectionSubmit(formPayload?: ConnectionFormPayload): Promise<void> {
    const validationMessage = validateConnectionPayload(formPayload, "edit");
    if (validationMessage) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: validationMessage,
            type: "error",
        });
        await signalEditConnectionSubmitReady();
        return;
    }

    if (!editingConnectionId) {
        await window.toolboxAPI.utils.showNotification({
            title: "Error",
            body: "No connection ID found for editing.",
            type: "error",
        });
        await signalEditConnectionSubmitReady();
        return;
    }

    const updates = buildConnectionFromPayload({ ...formPayload, id: editingConnectionId }, "edit");

    try {
        await window.toolboxAPI.connections.update(editingConnectionId, updates);
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Updated",
            body: `Connection "${updates.name}" has been updated.`,
            type: "success",
        });
        editingConnectionId = null;
        await closeBrowserWindowModal();
        await loadConnections();
        await loadSidebarConnections();
    } catch (error) {
        captureMessage("Error updating connection:", "error", { extra: { error } });
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Update Connection",
            body: (error as Error).message,
            type: "error",
        });
        await signalEditConnectionSubmitReady();
    }
}

async function signalEditConnectionSubmitReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: EDIT_CONNECTION_MODAL_CHANNELS.submitReady });
}

async function signalEditConnectionTestReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: EDIT_CONNECTION_MODAL_CHANNELS.testReady });
}

async function setEditConnectionTestFeedback(message?: string): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: EDIT_CONNECTION_MODAL_CHANNELS.testFeedback, data: message ?? "" });
}

/**
 * Delete a connection by ID
 */
export async function deleteConnection(id: string): Promise<void> {
    logInfo("deleteConnection called with id:", { connectionId: id });
    if (!confirm("Are you sure you want to delete this connection?")) {
        return;
    }

    try {
        logInfo("Calling window.toolboxAPI.deleteConnection");
        await window.toolboxAPI.connections.delete(id);

        await window.toolboxAPI.utils.showNotification({
            title: "Connection Deleted",
            body: "The connection has been deleted.",
            type: "success",
        });

        await loadConnections();
    } catch (error) {
        captureMessage("Error deleting connection:", "error", { extra: { error } });
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Delete Connection",
            body: (error as Error).message,
            type: "error",
        });
    }
}

function validateConnectionPayload(formPayload: ConnectionFormPayload | undefined, mode: "add" | "edit" | "test"): string | null {
    if (!formPayload) {
        return "Connection form data is unavailable.";
    }

    const authType = normalizeAuthenticationType(formPayload.authenticationType);

    // Special validation for connection string
    if (authType === "connectionString") {
        const connectionString = sanitizeInput(formPayload.connectionString);
        if (!connectionString) {
            return "Please provide a connection string.";
        }

        // Try to parse the connection string
        const parsed = parseConnectionString(connectionString);
        if (!parsed || !parsed.url) {
            return "Invalid connection string format. Please ensure it includes at least a URL parameter.";
        }

        // Validate URL format
        const dynamicsUrlPattern = /\.crm\d*\.dynamics/;
        if (!dynamicsUrlPattern.test(parsed.url)) {
            return "Connection string URL must contain .crm*.dynamics pattern (e.g., https://orgname.crm.dynamics.com).";
        }

        // Connection name is still required for add/edit modes even with connection string
        if ((mode === "add" || mode === "edit") && !sanitizeInput(formPayload.name)) {
            return "Please provide a connection name.";
        }

        return null;
    }

    // Standard validation for non-connection-string types
    if (!sanitizeInput(formPayload.url)) {
        return "Please provide an environment URL.";
    }

    // Validate URL format matches Dynamics 365/Dataverse pattern
    const url = sanitizeInput(formPayload.url);
    const dynamicsUrlPattern = /\.crm\d*\.dynamics/;
    if (!dynamicsUrlPattern.test(url)) {
        return "Please provide a valid Dynamics 365/Dataverse URL (must contain .crm*.dynamics pattern, e.g., https://orgname.crm.dynamics.com).";
    }

    if ((mode === "add" || mode === "edit") && !sanitizeInput(formPayload.name)) {
        return "Please provide a connection name.";
    }

    if (authType === "clientSecret") {
        if (!sanitizeInput(formPayload.clientId) || !sanitizeInput(formPayload.clientSecret) || !sanitizeInput(formPayload.tenantId)) {
            return "Client ID, Client Secret, and Tenant ID are required for Client ID/Secret authentication.";
        }
    } else if (authType === "usernamePassword") {
        if (!sanitizeInput(formPayload.username) || !sanitizeInput(formPayload.password)) {
            return "Username and Password are required for Username/Password authentication.";
        }
    }

    return null;
}

function buildConnectionFromPayload(formPayload: ConnectionFormPayload, mode: "add" | "edit" | "test"): DataverseConnection {
    const authenticationType = normalizeAuthenticationType(formPayload.authenticationType);

    // Handle connection string specially
    if (authenticationType === "connectionString") {
        const connectionString = sanitizeInput(formPayload.connectionString);
        const parsed = parseConnectionString(connectionString);

        if (!parsed || !parsed.url) {
            throw new Error("Invalid connection string format");
        }

        // Build connection from parsed data
        const connection: DataverseConnection = {
            id: mode === "add" ? Date.now().toString() : mode === "edit" ? (formPayload.id ?? "") : "test",
            name: mode === "add" || mode === "edit" ? sanitizeInput(formPayload.name) : "Test Connection",
            url: parsed.url,
            environment: mode === "add" || mode === "edit" ? normalizeEnvironment(formPayload.environment) : "Test",
            authenticationType: parsed.authenticationType!,
            createdAt: new Date().toISOString(),
        };

        // Add auth-specific fields from parsed connection string
        if (parsed.clientId) connection.clientId = parsed.clientId;
        if (parsed.clientSecret) connection.clientSecret = parsed.clientSecret;
        if (parsed.tenantId) connection.tenantId = parsed.tenantId;
        if (parsed.username) connection.username = parsed.username;
        if (parsed.password) connection.password = parsed.password;

        // Browser settings apply to all auth types (used for opening URLs with authentication)
        const browserType = sanitizeInput(formPayload.browserType);
        const browserProfile = sanitizeInput(formPayload.browserProfile);
        const browserProfileName = sanitizeInput(formPayload.browserProfileName);
        connection.browserType = (browserType || "default") as DataverseConnection["browserType"];
        connection.browserProfile = browserProfile || undefined;
        connection.browserProfileName = browserProfileName || undefined;

        return connection;
    }

    // Standard connection building for non-connection-string types
    const connection: DataverseConnection = {
        id: mode === "add" ? Date.now().toString() : mode === "edit" ? (formPayload.id ?? "") : "test",
        name: mode === "add" || mode === "edit" ? sanitizeInput(formPayload.name) : "Test Connection",
        url: sanitizeInput(formPayload.url),
        environment: mode === "add" || mode === "edit" ? normalizeEnvironment(formPayload.environment) : "Test",
        authenticationType,
        createdAt: new Date().toISOString(),
        // Note: isActive is NOT part of DataverseConnection - it's a UI-level property
    };

    // Browser settings apply to all auth types (used for opening URLs with authentication)
    const browserType = sanitizeInput(formPayload.browserType);
    const browserProfile = sanitizeInput(formPayload.browserProfile);
    const browserProfileName = sanitizeInput(formPayload.browserProfileName);
    connection.browserType = (browserType || "default") as DataverseConnection["browserType"];
    connection.browserProfile = browserProfile || undefined;
    connection.browserProfileName = browserProfileName || undefined;

    if (authenticationType === "clientSecret") {
        connection.clientId = sanitizeInput(formPayload.clientId);
        connection.clientSecret = sanitizeInput(formPayload.clientSecret);
        connection.tenantId = sanitizeInput(formPayload.tenantId);
    } else if (authenticationType === "usernamePassword") {
        connection.username = sanitizeInput(formPayload.username);
        connection.password = sanitizeInput(formPayload.password);
        // Username/password supports optional clientId and tenantId
        const usernamePasswordClientId = sanitizeInput(formPayload.usernamePasswordClientId);
        const usernamePasswordTenantId = sanitizeInput(formPayload.usernamePasswordTenantId);
        if (usernamePasswordClientId) {
            connection.clientId = usernamePasswordClientId;
        }
        if (usernamePasswordTenantId) {
            connection.tenantId = usernamePasswordTenantId;
        }
    } else if (authenticationType === "interactive") {
        // Interactive OAuth with optional username (login_hint), clientId, tenantId
        const interactiveUsername = sanitizeInput(formPayload.interactiveUsername);
        const optionalClientId = sanitizeInput(formPayload.optionalClientId);
        const interactiveTenantId = sanitizeInput(formPayload.interactiveTenantId);

        connection.username = interactiveUsername || undefined;
        connection.clientId = optionalClientId || undefined;
        connection.tenantId = interactiveTenantId || undefined;
    }

    return connection;
}

function sanitizeInput(value?: string): string {
    return (value || "").trim();
}

function normalizeEnvironment(value?: string): ConnectionEnvironment {
    const normalized = (value || "Dev").toLowerCase();
    const map: Record<string, ConnectionEnvironment> = {
        dev: "Dev",
        test: "Test",
        uat: "UAT",
        production: "Production",
        prod: "Production",
    };
    return map[normalized] || "Dev";
}

function formatAuthType(authType: "interactive" | "clientSecret" | "usernamePassword" | "connectionString") {
    const labels: Record<string, string> = {
        interactive: "Microsoft Login",
        clientSecret: "Client Secret",
        usernamePassword: "Username/Password",
        connectionString: "Connection String",
    };
    return labels[authType] || authType;
}

function getBrowserBadgeMarkup(conn: DataverseConnection): string {
    const browserType = conn.browserType;
    if (!browserType || browserType === "default") {
        return "";
    }

    const profileNameRaw = sanitizeInput(conn.browserProfileName || conn.browserProfile);
    if (!profileNameRaw) {
        return "";
    }
    const profileName = profileNameRaw;
    const safeProfileName = escapeHtml(profileName);
    const browserLabel = formatBrowserType(browserType);
    const safeTitle = escapeHtml(`${browserLabel} · ${profileName}`);
    const iconPath = getBrowserIconPath(browserType);
    const iconMarkup = iconPath
        ? `<img src="${iconPath}" alt="${browserLabel} icon" class="browser-profile-icon" />`
        : `<span class="browser-profile-icon browser-profile-icon-fallback">${browserLabel.charAt(0).toUpperCase()}</span>`;

    return `
        <span class="browser-profile-badge" title="${safeTitle}">
            ${iconMarkup}
            <span class="browser-profile-label">${safeProfileName}</span>
        </span>
    `;
}

function formatBrowserType(browserType: DataverseConnection["browserType"]): string {
    const labels: Record<string, string> = {
        default: "Browser",
        chrome: "Chrome",
        edge: "Edge",
    };
    return labels[browserType || "default"] || "Browser";
}

function getBrowserIconPath(browserType: DataverseConnection["browserType"]): string | null {
    switch (browserType) {
        case "chrome":
            return "icons/logos/chrome.png";
        case "edge":
            return "icons/logos/edge.png";
        default:
            return null;
    }
}

function normalizeAuthenticationType(value?: string): ConnectionAuthenticationType {
    if (value === "clientSecret" || value === "usernamePassword" || value === "connectionString") {
        return value;
    }
    return "interactive";
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function signalAddConnectionSubmitReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: ADD_CONNECTION_MODAL_CHANNELS.submitReady });
}

async function signalAddConnectionTestReady(): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: ADD_CONNECTION_MODAL_CHANNELS.testReady });
}

async function setAddConnectionTestFeedback(message?: string): Promise<void> {
    await sendBrowserWindowModalMessage({ channel: ADD_CONNECTION_MODAL_CHANNELS.testFeedback, data: message ?? "" });
}

let activeConnectionContextMenu: { menu: HTMLElement; anchor: HTMLElement; cleanup: () => void } | null = null;

/**
 * Close active connection context menu
 */
function closeActiveConnectionContextMenu(): void {
    if (!activeConnectionContextMenu) return;
    activeConnectionContextMenu.cleanup();
    activeConnectionContextMenu = null;
}

/**
 * Show context menu for connection
 */
function showConnectionContextMenu(conn: DataverseConnection, anchor: HTMLElement): void {
    // Toggle: if clicking the same anchor, close existing menu
    if (activeConnectionContextMenu && activeConnectionContextMenu.anchor === anchor) {
        closeActiveConnectionContextMenu();
        return;
    }

    closeActiveConnectionContextMenu();

    const isDarkTheme = document.body.classList.contains("dark-theme");
    const editIconPath = isDarkTheme ? "icons/dark/edit.svg" : "icons/light/edit.svg";
    const deleteIconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "50000";
    menu.style.userSelect = "none";
    menu.innerHTML = `
        <div class="context-menu-item" data-menu-action="edit">
            <img src="${editIconPath}" class="context-menu-icon" alt="" />
            <span>Edit Connection</span>
        </div>
        <div class="context-menu-item context-menu-item-danger" data-menu-action="delete">
            <img src="${deleteIconPath}" class="context-menu-icon" alt="" />
            <span>Delete Connection</span>
        </div>
    `;

    document.body.appendChild(menu);

    // Position menu near the anchor
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const sidebar = document.getElementById("sidebar");
    const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };

    // Prefer opening to the left to avoid overlapping BrowserView on the right
    let left = anchorRect.left - menuRect.width + anchorRect.width;
    let top = anchorRect.bottom + 6;

    // Clamp within sidebar bounds to prevent overlapping with tool BrowserView
    const margin = 6;
    if (left < sidebarRect.left + margin) {
        left = sidebarRect.left + margin;
    }
    if (left + menuRect.width > sidebarRect.right - margin) {
        left = sidebarRect.right - margin - menuRect.width;
    }

    if (top + menuRect.height > sidebarRect.bottom - margin) {
        top = anchorRect.top - menuRect.height - margin;
    }
    if (top < sidebarRect.top + margin) {
        top = sidebarRect.top + margin;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Add event listeners
    menu.querySelectorAll(".context-menu-item").forEach((item) => {
        item.addEventListener("click", async (e) => {
            e.stopPropagation();
            const action = (item as HTMLElement).getAttribute("data-menu-action");

            if (action === "edit") {
                await editConnection(conn.id);
            } else if (action === "delete") {
                if (confirm(`Are you sure you want to delete the connection "${conn.name}"?`)) {
                    await window.toolboxAPI.connections.delete(conn.id);
                    loadSidebarConnections();
                    // Import and call updateActiveToolConnectionStatus from toolManagement
                    const { updateActiveToolConnectionStatus } = await import("./toolManagement");
                    await updateActiveToolConnectionStatus();
                }
            }

            closeActiveConnectionContextMenu();
        });
    });

    const cleanup = () => {
        menu.remove();
        document.removeEventListener("click", outsideClickHandler);
        document.removeEventListener("keydown", escapeHandler);
    };

    const outsideClickHandler = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
            closeActiveConnectionContextMenu();
        }
    };

    const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            closeActiveConnectionContextMenu();
        }
    };

    setTimeout(() => {
        document.addEventListener("click", outsideClickHandler);
        document.addEventListener("keydown", escapeHandler);
    }, 0);

    activeConnectionContextMenu = { menu, anchor, cleanup };
}

/**
 * Load connections in the sidebar
 */
export async function loadSidebarConnections(): Promise<void> {
    const connectionsList = document.getElementById("sidebar-connections-list");
    if (!connectionsList) return;

    try {
        const connections = await window.toolboxAPI.connections.getAll();

        // Get filter and sort values
        const searchInput = document.getElementById("connections-search-input") as HTMLInputElement | null;
        const environmentFilter = document.getElementById("connections-environment-filter") as HTMLSelectElement | null;
        const authFilter = document.getElementById("connections-auth-filter") as HTMLSelectElement | null;
        const sortSelect = document.getElementById("connections-sort-select") as HTMLSelectElement | null;

        const searchTerm = searchInput?.value ? searchInput.value.toLowerCase() : "";
        const selectedEnvironment = environmentFilter?.value || "";
        const selectedAuthType = authFilter?.value || "";

        // Get saved sort preference or default
        const savedSort = await getConnectionsSortPreference();
        if (sortSelect) {
            sortSelect.value = savedSort;
        }
        const sortOption = sortSelect ? coerceConnectionsSortOption(sortSelect.value) : savedSort;

        // Apply filters
        const filteredConnections = connections.filter((conn: DataverseConnection) => {
            // Search filter (name or URL)
            if (searchTerm) {
                const haystacks: string[] = [conn.name || "", conn.url || ""];
                if (!haystacks.some((h) => h.toLowerCase().includes(searchTerm))) {
                    return false;
                }
            }

            // Environment filter
            if (selectedEnvironment && conn.environment !== selectedEnvironment) {
                return false;
            }

            // Authentication type filter
            if (selectedAuthType && conn.authenticationType !== selectedAuthType) {
                return false;
            }

            return true;
        });

        const sortedConnections = sortConnections(filteredConnections, sortOption);

        if (sortedConnections.length === 0) {
            if (connections.length === 0) {
                connectionsList.innerHTML = `
                    <div class="empty-state">
                        <p>No connections configured yet.</p>
                        <p class="empty-state-hint">Add a connection to get started.</p>
                    </div>
                `;
            } else {
                connectionsList.innerHTML = `
                    <div class="empty-state">
                        <p>No matching connections</p>
                        <p class="empty-state-hint">${searchTerm ? "Try a different search term." : "Adjust your filters."}</p>
                    </div>
                `;
            }
            updateFooterConnectionStatus(null);
            return;
        }

        connectionsList.innerHTML = sortedConnections
            .map((conn: DataverseConnection) => {
                const isDarkTheme = document.body.classList.contains("dark-theme");
                const moreIconPath = isDarkTheme ? "icons/dark/more-icon.svg" : "icons/light/more-icon.svg";
                const browserBadgeMarkup = getBrowserBadgeMarkup(conn);

                return `
                <div class="connection-item-pptb">
                    <div class="connection-item-header-pptb">
                        <div class="connection-item-header-left-pptb">
                            <div class="connection-item-info-pptb">
                                <div class="connection-item-name-pptb">${conn.name}</div>
                            </div>
                        </div>
                        <div class="connection-item-header-right-pptb">
                            <button class="icon-button tool-more-btn" data-action="more" data-connection-id="${conn.id}" title="More options" aria-haspopup="true" aria-expanded="false">
                                <img src="${moreIconPath}" alt="More actions" class="tool-more-icon" />
                            </button>
                        </div>
                    </div>
                    <div class="connection-item-url-pptb">${conn.url}</div>
                    <div class="connection-item-footer-pptb">
                        <div class="connection-item-meta-left">
                            <span class="connection-env-badge env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                            <span class="auth-type-badge">${formatAuthType(conn.authenticationType)}</span>
                        </div>
                        <div class="connection-item-meta-left">
                            ${browserBadgeMarkup}
                        </div>
                    </div>
                </div>
            `;
            })
            .join("");

        // Add event listeners for more buttons and context menu
        connectionsList.querySelectorAll(".tool-more-btn").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.stopPropagation();
                const target = e.currentTarget as HTMLButtonElement;
                const connectionId = target.getAttribute("data-connection-id");
                if (!connectionId) return;

                const conn = sortedConnections.find((c: DataverseConnection) => c.id === connectionId);
                if (!conn) return;

                showConnectionContextMenu(conn, target);
            });
        });

        // Keep legacy event listener for any remaining action buttons (fallback)
        connectionsList.querySelectorAll("button[data-action]").forEach((button) => {
            button.addEventListener("click", async (e) => {
                const target = e.currentTarget as HTMLButtonElement;
                const action = target.getAttribute("data-action");
                const connectionId = target.getAttribute("data-connection-id");

                if (action === "delete" && connectionId) {
                    if (confirm("Are you sure you want to delete this connection?")) {
                        await window.toolboxAPI.connections.delete(connectionId);
                        loadSidebarConnections();
                        // Import and call updateActiveToolConnectionStatus from toolManagement
                        const { updateActiveToolConnectionStatus } = await import("./toolManagement");
                        await updateActiveToolConnectionStatus();
                    }
                } else if (action === "edit" && connectionId) {
                    await editConnection(connectionId);
                }
            });
        });

        // Setup search without replacing the input (to avoid cursor loss)
        if (searchInput && !(searchInput as any)._pptbBound) {
            (searchInput as any)._pptbBound = true;
            searchInput.addEventListener("input", () => {
                loadSidebarConnections();
            });
        }

        // Setup filter event listeners
        if (environmentFilter && !(environmentFilter as any)._pptbBound) {
            (environmentFilter as any)._pptbBound = true;
            environmentFilter.addEventListener("change", () => {
                loadSidebarConnections();
            });
        }

        if (authFilter && !(authFilter as any)._pptbBound) {
            (authFilter as any)._pptbBound = true;
            authFilter.addEventListener("change", () => {
                loadSidebarConnections();
            });
        }

        // Setup sort event listener
        if (sortSelect && !(sortSelect as any)._pptbBound) {
            (sortSelect as any)._pptbBound = true;
            sortSelect.addEventListener("change", async () => {
                // Save sort preference
                const selectedSort = coerceConnectionsSortOption(sortSelect.value);
                sortSelect.value = selectedSort;
                await window.toolboxAPI.setSetting(CONNECTIONS_SORT_SETTING_KEY, selectedSort);
                loadSidebarConnections();
            });
        }
    } catch (error) {
        captureMessage("Failed to load connections:", "error", { extra: { error } });
    }
}
