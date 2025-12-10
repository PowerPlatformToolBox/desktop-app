/**
 * Connection management module
 * Handles connection UI, CRUD operations, and authentication
 */

import type { DataverseConnection, ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getAddConnectionModalControllerScript } from "../modals/addConnection/controller";
import { getAddConnectionModalView } from "../modals/addConnection/view";
import { getSelectConnectionModalControllerScript } from "../modals/selectConnection/controller";
import { getSelectConnectionModalView } from "../modals/selectConnection/view";
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

let addConnectionModalHandlersRegistered = false;
let selectConnectionModalHandlersRegistered = false;

// Store promise handlers for select connection modal
const selectConnectionModalPromiseHandlers: {
    resolve: (() => void) | null;
    reject: ((error: Error) => void) | null;
} = {
    resolve: null,
    reject: null,
};

/**
 * Update footer connection information
 */
export async function updateFooterConnection(): Promise<void> {
    const footerConnectionName = document.getElementById("footer-connection-name");
    const footerChangeBtn = document.getElementById("footer-change-connection-btn");

    if (!footerConnectionName) return;

    try {
        const activeConn = await window.toolboxAPI.connections.getActiveConnection();

        if (activeConn) {
            // Check if token is expired
            let isExpired = false;
            if (activeConn.tokenExpiry) {
                const expiryDate = new Date(activeConn.tokenExpiry);
                const now = new Date();
                isExpired = expiryDate.getTime() <= now.getTime();
            }

            const warningIcon = isExpired ? `<span style="color: #f59e0b; margin-left: 4px;" title="Token Expired - Re-authentication Required">⚠</span>` : "";

            footerConnectionName.innerHTML = `${activeConn.name} (${activeConn.environment})${warningIcon}`;
            if (footerChangeBtn) {
                footerChangeBtn.style.display = "inline";
            }
        } else {
            footerConnectionName.textContent = "Not Connected";
            if (footerChangeBtn) {
                footerChangeBtn.style.display = "none";
            }
        }
    } catch (error) {
        console.error("Failed to update footer connection:", error);
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
 * Returns a promise that resolves when a connection is selected and connected, or rejects if cancelled
 */
export async function openSelectConnectionModal(): Promise<void> {
    return new Promise((resolve, reject) => {
        initializeSelectConnectionModalBridge();
        
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
        // Connect to the selected connection
        await connectToConnection(connectionId);
        
        // Close the modal
        await closeBrowserWindowModal();
        
        // Resolve the promise
        if (selectConnectionModalPromiseHandlers.resolve) {
            selectConnectionModalPromiseHandlers.resolve();
            selectConnectionModalPromiseHandlers.resolve = null;
            selectConnectionModalPromiseHandlers.reject = null;
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
                connections: connections.map((conn: DataverseConnection) => ({
                    id: conn.id,
                    name: conn.name,
                    url: conn.url,
                    environment: conn.environment,
                    authenticationType: conn.authenticationType,
                    isActive: conn.isActive || false,
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
                    disconnectConnection();
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
 */
export async function connectToConnection(id: string): Promise<void> {
    try {
        await window.toolboxAPI.connections.setActive(id);
        await window.toolboxAPI.utils.showNotification({
            title: "Connected",
            body: "Successfully authenticated and connected to the environment.",
            type: "success",
        });
        await loadConnections();
        await loadSidebarConnections();
        await updateFooterConnection();
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
 * Disconnect from active connection
 */
export async function disconnectConnection(): Promise<void> {
    try {
        await window.toolboxAPI.connections.disconnect();
        await window.toolboxAPI.utils.showNotification({
            title: "Disconnected",
            body: "Disconnected from environment.",
            type: "info",
        });
        await loadConnections();
        await loadSidebarConnections();
        await updateFooterConnection();
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Disconnect Failed",
            body: (error as Error).message,
            type: "error",
        });
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
        console.error("Token refresh failed, trying full re-authentication:", error);

        // If refresh fails, prompt for full re-authentication
        try {
            await window.toolboxAPI.connections.setActive(connectionId);

            await window.toolboxAPI.utils.showNotification({
                title: "Re-authenticated",
                body: "Successfully re-authenticated with the environment.",
                type: "success",
            });

            // Reload connections to update UI
            await loadSidebarConnections();
            await updateFooterConnection();
        } catch (reauthError) {
            await window.toolboxAPI.utils.showNotification({
                title: "Re-authentication Failed",
                body: (reauthError as Error).message,
                type: "error",
            });
        }
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

function buildConnectionFromPayload(formPayload: ConnectionFormPayload, mode: "add" | "test"): any {
    const authenticationType = normalizeAuthenticationType(formPayload.authenticationType);
    const connection: any = {
        id: mode === "add" ? Date.now().toString() : "test",
        name: mode === "add" ? sanitizeInput(formPayload.name) : "Test Connection",
        url: sanitizeInput(formPayload.url),
        environment: mode === "add" ? normalizeEnvironment(formPayload.environment) : "Test",
        authenticationType,
        createdAt: new Date().toISOString(),
        isActive: false,
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

                // Check if token is expired
                let isExpired = false;
                if (conn.isActive && conn.tokenExpiry) {
                    const expiryDate = new Date(conn.tokenExpiry);
                    const now = new Date();
                    isExpired = expiryDate.getTime() <= now.getTime();
                }

                const warningIcon = isExpired ? `<span class="connection-warning-icon" title="Token Expired - Re-authentication Required" style="color: #f59e0b; margin-left: 4px;">⚠</span>` : "";

                return `
                <div class="connection-item-pptb ${conn.isActive ? "active" : ""} ${isExpired ? "expired" : ""}">
                    <div class="connection-item-header-pptb">
                        <div class="connection-item-name-pptb">${conn.name}${warningIcon}</div>
                        <span class="connection-env-pill env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                    </div>
                    <div class="connection-item-url-pptb">${conn.url}</div>
                    <div class="connection-item-actions-pptb" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            ${
                                conn.isActive
                                    ? isExpired
                                        ? `<button class="fluent-button fluent-button-primary" data-action="reauth" data-connection-id="${conn.id}">Re-authenticate</button>`
                                        : `<button class="fluent-button fluent-button-secondary" data-action="disconnect">Disconnect</button>`
                                    : `<button class="fluent-button fluent-button-primary" data-action="connect" data-connection-id="${conn.id}">Connect</button>`
                            }
                        </div>
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

                if (action === "connect" && connectionId) {
                    // Disable button while connecting
                    target.disabled = true;
                    target.textContent = "Connecting...";

                    try {
                        await connectToConnection(connectionId);
                    } catch (error) {
                        // Error is already handled in connectToConnection
                    } finally {
                        // Reload will refresh the button state
                    }
                } else if (action === "disconnect") {
                    await disconnectConnection();
                } else if (action === "reauth" && connectionId) {
                    // Re-authenticate expired connection
                    target.disabled = true;
                    target.textContent = "Re-authenticating...";
                    await handleReauthentication(connectionId);
                } else if (action === "delete" && connectionId) {
                    if (confirm("Are you sure you want to delete this connection?")) {
                        await window.toolboxAPI.connections.delete(connectionId);
                        loadSidebarConnections();
                        updateFooterConnection();
                    }
                }
            });
        });

        // Update footer status
        const activeConn = connections.find((c: any) => c.isActive);
        updateFooterConnectionStatus(activeConn || null);
    } catch (error) {
        console.error("Failed to load connections:", error);
    }
}
