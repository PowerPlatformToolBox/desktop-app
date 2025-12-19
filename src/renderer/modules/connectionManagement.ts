/**
 * Connection management module
 * Handles connection UI, CRUD operations, and authentication
 */

import type { DataverseConnection, UIConnectionData, ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getAddConnectionModalControllerScript } from "../modals/addConnection/controller";
import { getAddConnectionModalView } from "../modals/addConnection/view";
import { getSelectConnectionModalControllerScript } from "../modals/selectConnection/controller";
import { getSelectConnectionModalView } from "../modals/selectConnection/view";
import { getSelectMultiConnectionModalControllerScript } from "../modals/selectMultiConnection/controller";
import { getSelectMultiConnectionModalView } from "../modals/selectMultiConnection/view";
import {
    closeBrowserWindowModal,
    onBrowserWindowModalMessage,
    offBrowserWindowModalClosed,
    onBrowserWindowModalClosed,
    sendBrowserWindowModalMessage,
    showBrowserWindowModal,
} from "./browserWindowModals";

type ConnectionEnvironment = "Dev" | "Test" | "UAT" | "Production";
type ConnectionAuthenticationType = "interactive" | "clientSecret" | "usernamePassword";

interface ConnectionFormPayload {
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
}

interface AuthenticateConnectionAction {
    action: 'authenticate';
    connectionId: string;
    listType: 'primary' | 'secondary';
}

interface ConfirmConnectionsAction {
    action: 'confirm';
    primaryConnectionId: string;
    secondaryConnectionId: string;
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
    resolve: ((result: { primaryConnectionId: string; secondaryConnectionId: string }) => void) | null;
    reject: ((error: Error) => void) | null;
} = {
    resolve: null,
    reject: null,
};

// Store the connection ID to highlight in the modal (for tool-specific connection selection)
let highlightConnectionId: string | null = null;

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
        console.error("Error updating footer connection:", error);
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
    const { styles, body } = getAddConnectionModalView();
    const script = getAddConnectionModalControllerScript(ADD_CONNECTION_MODAL_CHANNELS);
    return `${styles}\n${body}\n${script}`.trim();
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
    const { styles, body } = getSelectConnectionModalView();
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
        console.error("Error connecting to selected connection:", error);
        await signalSelectConnectionReady();
        
        // Don't close modal on error - let user try again or cancel
    }
}

async function handlePopulateConnectionsRequest(): Promise<void> {
    try {
        const connections = await window.toolboxAPI.connections.getAll();
        
        // Send connections list to modal
        await sendBrowserWindowModalMessage({
            channel: SELECT_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: {
                // Map persisted connections to UI-level data with isActive property
                connections: connections.map((conn: DataverseConnection): UIConnectionData => ({
                    id: conn.id,
                    name: conn.name,
                    url: conn.url,
                    environment: conn.environment,
                    authenticationType: conn.authenticationType,
                    // If highlightConnectionId is set (tool-specific modal), use it to mark as active
                    // Otherwise, mark none as active since there's no global active connection
                    isActive: highlightConnectionId ? conn.id === highlightConnectionId : false,
                })),
            },
        });
    } catch (error) {
        console.error("Failed to populate connections:", error);
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
 */
export async function openSelectMultiConnectionModal(): Promise<{ primaryConnectionId: string; secondaryConnectionId: string }> {
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
            html: buildSelectMultiConnectionModalHtml(),
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

function buildSelectMultiConnectionModalHtml(): string {
    const { styles, body } = getSelectMultiConnectionModalView();
    const script = getSelectMultiConnectionModalControllerScript(SELECT_MULTI_CONNECTION_MODAL_CHANNELS);
    return `${styles}\n${body}\n${script}`.trim();
}

async function handleSelectMultiConnectionsRequest(data?: SelectMultiConnectionPayload): Promise<void> {
    // Handle authentication requests from individual connect buttons
    if (data && 'action' in data && data.action === 'authenticate') {
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
            console.error("Error authenticating connection:", error);
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
    if (data && 'action' in data && data.action === 'confirm') {
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
            console.error("Error confirming multi-connections:", error);
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
        console.error("Error selecting multi-connections:", error);
        await signalSelectMultiConnectionReady();
    }
}

async function handlePopulateMultiConnectionsRequest(): Promise<void> {
    try {
        const connections = await window.toolboxAPI.connections.getAll();
        
        // Send connections list to modal
        await sendBrowserWindowModalMessage({
            channel: SELECT_MULTI_CONNECTION_MODAL_CHANNELS.populateConnections,
            data: {
                connections: connections.map((conn: DataverseConnection) => ({
                    id: conn.id,
                    name: conn.name,
                    url: conn.url,
                    environment: conn.environment,
                    authenticationType: conn.authenticationType,
                })),
            },
        });
    } catch (error) {
        console.error("Failed to populate multi-connections:", error);
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
    console.log("loadConnections() called");
    const connectionsList = document.getElementById("connections-list");
    if (!connectionsList) {
        console.error("connections-list element not found");
        return;
    }

    try {
        const connections = await window.toolboxAPI.connections.getAll();
        console.log("Loaded connections:", connections);

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
                    console.log("Disconnect action is deprecated - connections are per-tool-instance");
                } else if (action === "delete" && connectionId) {
                    deleteConnection(connectionId);
                }
            });
        });

        // Update footer
        const activeConn = connections.find((c: any) => c.isActive);
        updateFooterConnectionStatus(activeConn || null);
    } catch (error) {
        console.error("Error loading connections:", error);
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
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Failed",
            body: (error as Error).message,
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
    try {
        // First try to refresh using the refresh token
        await window.toolboxAPI.connections.refreshToken(connectionId);

        await window.toolboxAPI.utils.showNotification({
            title: "Re-authenticated",
            body: "Successfully refreshed your connection token.",
            type: "success",
        });

        // Reload connections to update UI
        await loadSidebarConnections();
        await updateFooterConnection();
    } catch (error) {
        console.error("Token refresh failed:", error);

        // If refresh fails, notify user to re-authenticate
        await window.toolboxAPI.utils.showNotification({
            title: "Re-authentication Needed",
            body: "Token refresh failed. Please re-authenticate the connection.",
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
        console.error("Error adding connection:", error);
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Add Connection",
            body: (error as Error).message,
            type: "error",
        });
        await signalAddConnectionSubmitReady();
    }
}

async function handleTestConnectionRequest(formPayload?: ConnectionFormPayload): Promise<void> {
    await setAddConnectionTestFeedback("");
    const validationMessage = validateConnectionPayload(formPayload, "test");
    if (validationMessage) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: validationMessage,
            type: "error",
        });
        await setAddConnectionTestFeedback(validationMessage);
        await signalAddConnectionTestReady();
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
            await setAddConnectionTestFeedback("");
        } else {
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Failed",
                body: result.error || "Failed to connect to the environment.",
                type: "error",
            });
            await setAddConnectionTestFeedback(result.error || "Failed to connect to the environment.");
        }
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Test Failed",
            body: (error as Error).message,
            type: "error",
        });
        await setAddConnectionTestFeedback((error as Error).message);
    } finally {
        await signalAddConnectionTestReady();
    }
}

/**
 * Delete a connection by ID
 */
export async function deleteConnection(id: string): Promise<void> {
    console.log("deleteConnection called with id:", id);
    if (!confirm("Are you sure you want to delete this connection?")) {
        return;
    }

    try {
        console.log("Calling window.toolboxAPI.deleteConnection");
        await window.toolboxAPI.connections.delete(id);

        await window.toolboxAPI.utils.showNotification({
            title: "Connection Deleted",
            body: "The connection has been deleted.",
            type: "success",
        });

        await loadConnections();
    } catch (error) {
        console.error("Error deleting connection:", error);
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Delete Connection",
            body: (error as Error).message,
            type: "error",
        });
    }
}

function validateConnectionPayload(formPayload: ConnectionFormPayload | undefined, mode: "add" | "test"): string | null {
    if (!formPayload) {
        return "Connection form data is unavailable.";
    }

    if (!sanitizeInput(formPayload.url)) {
        return "Please provide an environment URL.";
    }

    if (mode === "add" && !sanitizeInput(formPayload.name)) {
        return "Please provide a connection name.";
    }

    const authType = normalizeAuthenticationType(formPayload.authenticationType);

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

function buildConnectionFromPayload(formPayload: ConnectionFormPayload, mode: "add" | "test"): DataverseConnection {
    const authenticationType = normalizeAuthenticationType(formPayload.authenticationType);
    const connection: DataverseConnection = {
        id: mode === "add" ? Date.now().toString() : "test",
        name: mode === "add" ? sanitizeInput(formPayload.name) : "Test Connection",
        url: sanitizeInput(formPayload.url),
        environment: mode === "add" ? normalizeEnvironment(formPayload.environment) : "Test",
        authenticationType,
        createdAt: new Date().toISOString(),
        // Note: isActive is NOT part of DataverseConnection - it's a UI-level property
    };

    if (authenticationType === "clientSecret") {
        connection.clientId = sanitizeInput(formPayload.clientId);
        connection.clientSecret = sanitizeInput(formPayload.clientSecret);
        connection.tenantId = sanitizeInput(formPayload.tenantId);
    } else if (authenticationType === "usernamePassword") {
        connection.username = sanitizeInput(formPayload.username);
        connection.password = sanitizeInput(formPayload.password);
        const optionalClientId = sanitizeInput(formPayload.optionalClientId);
        if (optionalClientId) {
            connection.clientId = optionalClientId;
        }
    } else if (authenticationType === "interactive") {
        const optionalClientId = sanitizeInput(formPayload.optionalClientId);
        if (optionalClientId) {
            connection.clientId = optionalClientId;
        }
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

function normalizeAuthenticationType(value?: string): ConnectionAuthenticationType {
    if (value === "clientSecret" || value === "usernamePassword") {
        return value;
    }
    return "interactive";
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

/**
 * Load connections in the sidebar
 */
export async function loadSidebarConnections(): Promise<void> {
    const connectionsList = document.getElementById("sidebar-connections-list");
    if (!connectionsList) return;

    try {
        const connections = await window.toolboxAPI.connections.getAll();

        if (connections.length === 0) {
            connectionsList.innerHTML = `
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p class="empty-state-hint">Add a connection to get started.</p>
                </div>
            `;
            updateFooterConnectionStatus(null);
            return;
        }

        connectionsList.innerHTML = connections
            .map((conn: any) => {
                const isDarkTheme = document.body.classList.contains("dark-theme");
                const iconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";

                return `
                <div class="connection-item-pptb">
                    <div class="connection-item-header-pptb">
                        <div class="connection-item-name-pptb">${conn.name}</div>
                        <span class="connection-env-pill env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                    </div>
                    <div class="connection-item-url-pptb">${conn.url}</div>
                    <div class="connection-item-actions-pptb" style="display: flex; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-icon" data-action="delete" data-connection-id="${conn.id}" style="color: #d83b01;" title="Delete connection">
                            <img src="${iconPath}" alt="Delete" style="width:16px; height:16px;" />
                        </button>
                    </div>
                </div>
            `;
            })
            .join("");

        // Add event listeners
        connectionsList.querySelectorAll("button").forEach((button) => {
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
                }
            });
        });
    } catch (error) {
        console.error("Failed to load connections:", error);
    }
}
