/**
 * Connection management module
 * Handles connection UI, CRUD operations, and authentication
 */

import { updateAuthFieldsVisibility } from "./modalManagement";
import { closeModal } from "./modalManagement";

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

/**
 * Add a new connection
 */
export async function addConnection(): Promise<void> {
    const nameInput = document.getElementById("connection-name") as HTMLInputElement;
    const urlInput = document.getElementById("connection-url") as HTMLInputElement;
    const environmentSelect = document.getElementById("connection-environment") as HTMLSelectElement;
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    const clientIdInput = document.getElementById("connection-client-id") as HTMLInputElement;
    const clientSecretInput = document.getElementById("connection-client-secret") as HTMLInputElement;
    const tenantIdInput = document.getElementById("connection-tenant-id") as HTMLInputElement;
    const usernameInput = document.getElementById("connection-username") as HTMLInputElement;
    const passwordInput = document.getElementById("connection-password") as HTMLInputElement;
    const optionalClientIdInput = document.getElementById("connection-optional-client-id") as HTMLInputElement;

    // Check if all elements exist
    if (!nameInput || !urlInput || !environmentSelect || !authTypeSelect) {
        console.error("Connection form elements not found");
        await window.toolboxAPI.utils.showNotification({
            title: "Error",
            body: "Connection form not properly initialized.",
            type: "error",
        });
        return;
    }

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const environment = environmentSelect.value as "Dev" | "Test" | "UAT" | "Production";
    const authenticationType = authTypeSelect.value as "interactive" | "clientSecret" | "usernamePassword";

    if (!name || !url) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: "Please provide both connection name and URL.",
            type: "error",
        });
        return;
    }

    // Validate based on authentication type
    if (authenticationType === "clientSecret") {
        if (!clientIdInput?.value.trim() || !clientSecretInput?.value.trim() || !tenantIdInput?.value.trim()) {
            await window.toolboxAPI.utils.showNotification({
                title: "Invalid Input",
                body: "Client ID, Client Secret, and Tenant ID are required for Client ID/Secret authentication.",
                type: "error",
            });
            return;
        }
    } else if (authenticationType === "usernamePassword") {
        if (!usernameInput?.value.trim() || !passwordInput?.value.trim()) {
            await window.toolboxAPI.utils.showNotification({
                title: "Invalid Input",
                body: "Username and Password are required for Username/Password authentication.",
                type: "error",
            });
            return;
        }
    }

    const connection: any = {
        id: Date.now().toString(),
        name,
        url,
        environment,
        authenticationType,
        createdAt: new Date().toISOString(),
        isActive: false,
    };

    // Add authentication-specific fields
    if (authenticationType === "clientSecret") {
        connection.clientId = clientIdInput.value.trim();
        connection.clientSecret = clientSecretInput.value.trim();
        connection.tenantId = tenantIdInput.value.trim();
    } else if (authenticationType === "usernamePassword") {
        connection.username = usernameInput.value.trim();
        connection.password = passwordInput.value.trim();
        if (optionalClientIdInput?.value.trim()) {
            connection.clientId = optionalClientIdInput.value.trim();
        }
    } else if (authenticationType === "interactive") {
        if (optionalClientIdInput?.value.trim()) {
            connection.clientId = optionalClientIdInput.value.trim();
        }
    }

    try {
        console.log("Adding connection:", { ...connection, password: connection.password ? "***" : undefined, clientSecret: connection.clientSecret ? "***" : undefined });
        await window.toolboxAPI.connections.add(connection);

        await window.toolboxAPI.utils.showNotification({
            title: "Connection Added",
            body: `Connection "${name}" has been added.`,
            type: "success",
        });

        // Clear form
        nameInput.value = "";
        urlInput.value = "";
        environmentSelect.value = "Dev";
        authTypeSelect.value = "interactive";
        if (clientIdInput) clientIdInput.value = "";
        if (clientSecretInput) clientSecretInput.value = "";
        if (tenantIdInput) tenantIdInput.value = "";
        if (usernameInput) usernameInput.value = "";
        if (passwordInput) passwordInput.value = "";
        if (optionalClientIdInput) optionalClientIdInput.value = "";

        // Reset field visibility
        updateAuthFieldsVisibility();

        closeModal("add-connection-modal");
        await loadConnections();
    } catch (error) {
        console.error("Error adding connection:", error);
        await window.toolboxAPI.utils.showNotification({
            title: "Failed to Add Connection",
            body: (error as Error).message,
            type: "error",
        });
    }
}

/**
 * Test a connection before saving
 */
export async function testConnection(): Promise<void> {
    const urlInput = document.getElementById("connection-url") as HTMLInputElement;
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    const clientIdInput = document.getElementById("connection-client-id") as HTMLInputElement;
    const clientSecretInput = document.getElementById("connection-client-secret") as HTMLInputElement;
    const tenantIdInput = document.getElementById("connection-tenant-id") as HTMLInputElement;
    const usernameInput = document.getElementById("connection-username") as HTMLInputElement;
    const passwordInput = document.getElementById("connection-password") as HTMLInputElement;
    const optionalClientIdInput = document.getElementById("connection-optional-client-id") as HTMLInputElement;
    const testBtn = document.getElementById("test-connection-btn") as HTMLButtonElement;

    if (!urlInput || !authTypeSelect || !testBtn) {
        return;
    }

    const url = urlInput.value.trim();
    const authenticationType = authTypeSelect.value as "interactive" | "clientSecret" | "usernamePassword";

    if (!url) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Input",
            body: "Please provide an environment URL.",
            type: "error",
        });
        return;
    }

    // Build test connection object
    const testConn: any = {
        id: "test",
        name: "Test Connection",
        url,
        environment: "Test",
        authenticationType,
        createdAt: new Date().toISOString(),
    };

    // Add authentication-specific fields
    if (authenticationType === "clientSecret") {
        if (!clientIdInput?.value.trim() || !clientSecretInput?.value.trim() || !tenantIdInput?.value.trim()) {
            await window.toolboxAPI.utils.showNotification({
                title: "Invalid Input",
                body: "Client ID, Client Secret, and Tenant ID are required for testing Client ID/Secret authentication.",
                type: "error",
            });
            return;
        }
        testConn.clientId = clientIdInput.value.trim();
        testConn.clientSecret = clientSecretInput.value.trim();
        testConn.tenantId = tenantIdInput.value.trim();
    } else if (authenticationType === "usernamePassword") {
        if (!usernameInput?.value.trim() || !passwordInput?.value.trim()) {
            await window.toolboxAPI.utils.showNotification({
                title: "Invalid Input",
                body: "Username and Password are required for testing Username/Password authentication.",
                type: "error",
            });
            return;
        }
        testConn.username = usernameInput.value.trim();
        testConn.password = passwordInput.value.trim();
        if (optionalClientIdInput?.value.trim()) {
            testConn.clientId = optionalClientIdInput.value.trim();
        }
    } else if (authenticationType === "interactive") {
        if (optionalClientIdInput?.value.trim()) {
            testConn.clientId = optionalClientIdInput.value.trim();
        }
    }

    // Disable the test button and show loading state
    testBtn.disabled = true;
    testBtn.textContent = "Testing...";

    try {
        const result = await window.toolboxAPI.connections.test(testConn);

        if (result.success) {
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Successful",
                body: "Successfully connected to the environment!",
                type: "success",
            });
        } else {
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Failed",
                body: result.error || "Failed to connect to the environment.",
                type: "error",
            });
        }
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Connection Test Failed",
            body: (error as Error).message,
            type: "error",
        });
    } finally {
        // Re-enable the button
        testBtn.disabled = false;
        testBtn.textContent = "Test Connection";
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
