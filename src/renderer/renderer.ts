// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="types.d.ts" />

import AnsiToHtml from "ansi-to-html";
import toastr from "toastr";
import "toastr/build/toastr.min.css";

// Create ANSI to HTML converter instance
const ansiConverter = new AnsiToHtml({
    fg: "#CCCCCC",
    bg: "#1E1E1E",
    newline: false,
    escapeXML: true,
    stream: false,
});

// Configure toastr for notifications
toastr.options = {
    closeButton: true,
    debug: false,
    newestOnTop: true,
    progressBar: true,
    positionClass: "toast-bottom-right",
    preventDuplicates: false,
    onclick: undefined,
    showDuration: 300,
    hideDuration: 1000,
    timeOut: 5000,
    extendedTimeOut: 1000,
    showEasing: "swing",
    hideEasing: "linear",
    showMethod: "fadeIn",
    hideMethod: "fadeOut",
    iconClass: "", // Remove default icons to match VSCode style
    iconClasses: undefined,
};

// Tab management for multiple tools
// With BrowserView, we no longer need to track webview elements
// The backend ToolWindowManager handles BrowserView instances
interface OpenTool {
    id: string;
    tool: any;
    isPinned: boolean;
    connectionId: string | null;
}

const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null;

// Tool library will be loaded from the registry
let toolLibrary: any[] = [];

// Load tools from registry
async function loadToolsLibrary() {
    try {
        // Fetch tools from registry
        const registryTools = await window.toolboxAPI.fetchRegistryTools();

        // Map registry tools to the format expected by the UI
        toolLibrary = registryTools.map((tool: any) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            author: tool.author,
            category: tool.tags?.[0] || "Tools", // Use first tag as category
            version: tool.version,
            icon: tool.icon,
            downloadUrl: tool.downloadUrl,
            tags: tool.tags || [],
        }));

        console.log(`Loaded ${toolLibrary.length} tools from registry`);
    } catch (error) {
        console.error("Failed to load tools from registry:", error);
        toolLibrary = [];
        // Error will be shown in the marketplace UI
    }
}

// Update UI button visibility based on number of open tabs
function updateToolbarButtonVisibility() {
    // No special buttons to show/hide currently
    // Keeping this function for future toolbar features
}

// Update footer connection information
async function updateFooterConnection() {
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

function loadToolLibrary() {
    const libraryList = document.getElementById("tool-library-list");
    if (!libraryList) return;

    libraryList.innerHTML = toolLibrary
        .map(
            (tool) => `
        <div class="tool-library-item">
            <div class="tool-library-info">
                <div class="tool-library-name">${tool.name}</div>
                <div class="tool-library-desc">${tool.description}</div>
                <div class="tool-library-meta">
                    <span class="tool-library-category">Category: ${tool.category}</span>
                    <span class="tool-library-author">Author: ${tool.author}</span>
                </div>
            </div>
            <button class="fluent-button fluent-button-primary" data-action="install-tool" data-package="${tool.id}" data-name="${tool.name}">Install</button>
        </div>
    `,
        )
        .join("");

    // Add event listeners to install buttons
    libraryList.querySelectorAll('[data-action="install-tool"]').forEach((button) => {
        button.addEventListener("click", (e) => {
            const target = e.target as HTMLButtonElement;
            const packageName = target.getAttribute("data-package");
            const toolName = target.getAttribute("data-name");
            if (packageName && toolName) {
                installToolFromLibrary(packageName, toolName);
            }
        });
    });
}

async function installToolFromLibrary(packageName: string, toolName: string) {
    console.log("installToolFromLibrary called:", packageName, toolName);
    if (!packageName) {
        await window.toolboxAPI.utils.showNotification({
            title: "Invalid Package",
            body: "Please select a valid tool to install.",
            type: "error",
        });
        return;
    }

    try {
        await window.toolboxAPI.utils.showNotification({
            title: "Installing Tool",
            body: `Installing ${toolName}...`,
            type: "info",
        });

        await window.toolboxAPI.installTool(packageName);

        await window.toolboxAPI.utils.showNotification({
            title: "Tool Installed",
            body: `${toolName} has been installed successfully.`,
            type: "success",
        });

        closeModal("install-tool-modal");
        // Reload sidebar tools to show newly installed tool
        await loadSidebarTools();
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Installation Failed",
            body: `Failed to install ${toolName}: ${(error as Error).message}`,
            type: "error",
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function uninstallTool(toolId: string) {
    if (!confirm("Are you sure you want to uninstall this tool?")) {
        return;
    }

    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        await window.toolboxAPI.uninstallTool(tool.id, toolId);

        await window.toolboxAPI.utils.showNotification({
            title: "Tool Uninstalled",
            body: `${tool.name} has been uninstalled.`,
            type: "success",
        });

        // Reload sidebar tools to update tool list
        await loadSidebarTools();
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Uninstall Failed",
            body: `Failed to uninstall tool: ${(error as Error).message}`,
            type: "error",
        });
    }
}

/**
 * Show CSP consent dialog for a tool
 * Returns true if user grants consent, false otherwise
 */
async function showCspConsentDialog(tool: any): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "modal";
        modal.id = "csp-consent-modal";
        
        const cspExceptions = tool.cspExceptions || {};
        
        // Build list of CSP exceptions
        let exceptionsHtml = "";
        for (const [directive, sources] of Object.entries(cspExceptions)) {
            if (Array.isArray(sources) && sources.length > 0) {
                const directiveName = directive.replace('-src', '').replace('-', ' ');
                exceptionsHtml += `
                    <div class="csp-exception">
                        <strong>${directiveName}:</strong>
                        <ul>
                            ${sources.map((source: string) => `<li><code>${source}</code></li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        }
        
        modal.innerHTML = `
            <div class="modal-content csp-consent-dialog">
                <div class="modal-header">
                    <h2>⚠️ Security Permissions Required</h2>
                </div>
                <div class="modal-body">
                    <p>
                        <strong>${tool.name}</strong> by <em>${tool.author || 'Unknown'}</em> 
                        is requesting permission to access external resources.
                    </p>
                    <p>
                        This tool needs the following Content Security Policy (CSP) exceptions to function properly:
                    </p>
                    <div class="csp-exceptions-list">
                        ${exceptionsHtml}
                    </div>
                    <div class="csp-warning">
                        <p>
                            ⚠️ <strong>Important:</strong> Only grant these permissions if you trust this tool and its author. 
                            These permissions will allow the tool to:
                        </p>
                        <ul>
                            <li>Make network requests to the specified domains</li>
                            <li>Load scripts and styles from external sources</li>
                            <li>Access external resources as specified above</li>
                        </ul>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="csp-decline-btn">Decline</button>
                    <button class="btn btn-primary" id="csp-accept-btn">Accept &amp; Continue</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        setTimeout(() => modal.classList.add("active"), 10);
        
        // Handle buttons
        const acceptBtn = modal.querySelector("#csp-accept-btn");
        const declineBtn = modal.querySelector("#csp-decline-btn");
        
        const closeModal = (granted: boolean) => {
            modal.classList.remove("active");
            setTimeout(() => {
                modal.remove();
                resolve(granted);
            }, 300);
        };
        
        acceptBtn?.addEventListener("click", () => closeModal(true));
        declineBtn?.addEventListener("click", () => closeModal(false));
    });
}

async function launchTool(toolId: string) {
    try {
        console.log("Launching tool:", toolId);

        // If tool is already open, just switch to its tab
        if (openTools.has(toolId)) {
            switchToTool(toolId);
            return;
        }

        // Load the tool
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            window.toolboxAPI.utils.showNotification({
                title: "Tool Launch Failed",
                body: `Tool ${toolId} not found`,
                type: "error",
            });
            return;
        }

        // Check if tool requires CSP exceptions
        if (tool.cspExceptions && Object.keys(tool.cspExceptions).length > 0) {
            // Check if consent has been granted
            const hasConsent = await window.toolboxAPI.hasCspConsent(tool.id);
            
            if (!hasConsent) {
                // Show consent dialog
                const consentGranted = await showCspConsentDialog(tool);
                
                if (!consentGranted) {
                    // User declined, don't load the tool
                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Launch Cancelled",
                        body: `You declined the security permissions for ${tool.name}. The tool cannot be loaded without these permissions.`,
                        type: "warning",
                    });
                    return;
                }
                
                // Grant consent
                await window.toolboxAPI.grantCspConsent(tool.id);
            }
        }

        // Hide all views (including home view)
        document.querySelectorAll(".view").forEach((view) => {
            view.classList.remove("active");
            (view as HTMLElement).style.display = "none";
        });

        // Show tool panel
        const toolPanel = document.getElementById("tool-panel");
        if (toolPanel) {
            toolPanel.style.display = "flex";
        }

        // Launch the tool using BrowserView via IPC
        // The backend ToolWindowManager will create a BrowserView and load the tool
        const launched = await window.toolboxAPI.launchToolWindow(toolId, tool);
        
        if (!launched) {
            window.toolboxAPI.utils.showNotification({
                title: "Tool Launch Failed",
                body: `Failed to launch ${tool.name}`,
                type: "error",
            });
            return;
        }

        console.log(`[Tool Launch] Tool window created via BrowserView: ${toolId}`);

        // Store the open tool (no webview container needed - managed by backend)
        openTools.set(toolId, {
            id: toolId,
            tool: tool,
            isPinned: false,
            connectionId: null,
        });

        // Create and add tab
        createTab(toolId, tool);

        // Switch to the new tab (this will also call backend to show the BrowserView)
        switchToTool(toolId);

        // Update toolbar buttons
        updateToolbarButtonVisibility();

        // Update footer connection
        updateFooterConnection();

        // Save session after launching
        saveSession();

        console.log("Tool launched successfully:", tool.name);
    } catch (error) {
        console.error("Error launching tool:", error);
        window.toolboxAPI.utils.showNotification({
            title: "Tool Launch Error",
            body: `Failed to launch tool: ${error}`,
            type: "error",
        });
    }
}

function createTab(toolId: string, tool: any) {
    const toolTabs = document.getElementById("tool-tabs");
    if (!toolTabs) return;

    const tab = document.createElement("div");
    tab.className = "tool-tab";
    tab.id = `tool-tab-${toolId}`;
    tab.setAttribute("data-tool-id", toolId);
    tab.setAttribute("draggable", "true");

    const name = document.createElement("span");
    name.className = "tool-tab-name";
    name.textContent = tool.name;
    name.title = tool.name;

    const connectionBadge = document.createElement("span");
    connectionBadge.className = "tool-tab-connection";
    connectionBadge.id = `tab-connection-${toolId}`;
    connectionBadge.textContent = "🔗";
    connectionBadge.title = "No connection";
    connectionBadge.style.display = "none";

    const pinBtn = document.createElement("button");
    pinBtn.className = "tool-tab-pin";
    pinBtn.title = "Pin tab";

    // Create pin icon
    const pinIcon = document.createElement("img");
    const isDarkTheme = document.body.classList.contains("dark-theme");
    pinIcon.src = isDarkTheme ? "icons/dark/pin.svg" : "icons/light/pin.svg";
    pinIcon.alt = "Pin";
    pinBtn.appendChild(pinIcon);

    pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinTab(toolId);
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "tool-tab-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";

    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTool(toolId);
    });

    tab.addEventListener("click", () => {
        switchToTool(toolId);
    });

    // Drag and drop events
    tab.addEventListener("dragstart", (e) => handleDragStart(e, tab));
    tab.addEventListener("dragover", (e) => handleDragOver(e, tab));
    tab.addEventListener("drop", (e) => handleDrop(e));
    tab.addEventListener("dragend", (e) => handleDragEnd(e, tab));

    tab.appendChild(name);
    tab.appendChild(connectionBadge);
    tab.appendChild(pinBtn);
    tab.appendChild(closeBtn);
    toolTabs.appendChild(tab);
}

function switchToTool(toolId: string) {
    if (!openTools.has(toolId)) return;

    // Normal single view mode
    activeToolId = toolId;

    // Update tab active states
    document.querySelectorAll(".tool-tab").forEach((tab) => {
        tab.classList.remove("active");
    });
    const activeTab = document.getElementById(`tool-tab-${toolId}`);
    if (activeTab) {
        activeTab.classList.add("active");
    }

    // Use IPC to switch the BrowserView in the backend
    // The ToolWindowManager will show the appropriate BrowserView
    window.toolboxAPI.switchToolWindow(toolId).catch((error: any) => {
        console.error("Failed to switch tool window:", error);
    });

    // Update footer connection
    updateFooterConnection();
}

function closeTool(toolId: string) {
    const openTool = openTools.get(toolId);
    if (!openTool) return;

    // Check if tab is pinned
    if (openTool.isPinned) {
        window.toolboxAPI.utils.showNotification({
            title: "Cannot Close Pinned Tab",
            body: "Unpin the tab before closing it",
            type: "warning",
        });
        return;
    }

    // Remove tab
    const tab = document.getElementById(`tool-tab-${toolId}`);
    if (tab) {
        tab.remove();
    }

    // Close the tool window via IPC
    // The ToolWindowManager will destroy the BrowserView
    window.toolboxAPI.closeToolWindow(toolId).catch((error: any) => {
        console.error("Failed to close tool window:", error);
    });

    // Remove from open tools
    openTools.delete(toolId);

    // Update toolbar buttons
    updateToolbarButtonVisibility();

    // Save session after closing
    saveSession();

    // If this was the active tool, switch to another tool or close the panel
    if (activeToolId === toolId) {
        if (openTools.size > 0) {
            // Switch to the last tool in the list
            const lastToolId = Array.from(openTools.keys())[openTools.size - 1];
            switchToTool(lastToolId);
        } else {
            // No more tools open, hide the tool panel and show home view
            const toolPanel = document.getElementById("tool-panel");
            const homeView = document.getElementById("home-view");
            if (toolPanel) {
                toolPanel.style.display = "none";
            }
            if (homeView) {
                homeView.style.display = "block";
            }
            activeToolId = null;
        }
    }
}

function closeAllTools() {
    // Close all tools
    const toolIds = Array.from(openTools.keys());
    toolIds.forEach((toolId) => {
        closeTool(toolId);
    });
}

// Toggle pin state for a tab
function togglePinTab(toolId: string) {
    const openTool = openTools.get(toolId);
    if (!openTool) return;

    openTool.isPinned = !openTool.isPinned;

    const tab = document.getElementById(`tool-tab-${toolId}`);
    if (tab) {
        const isDarkTheme = document.body.classList.contains("dark-theme");
        const pinBtn = tab.querySelector(".tool-tab-pin img") as HTMLImageElement;

        if (openTool.isPinned) {
            tab.classList.add("pinned");
            if (pinBtn) {
                pinBtn.src = isDarkTheme ? "icons/dark/pin-filled.svg" : "icons/light/pin-filled.svg";
            }
        } else {
            tab.classList.remove("pinned");
            if (pinBtn) {
                pinBtn.src = isDarkTheme ? "icons/dark/pin.svg" : "icons/light/pin.svg";
            }
        }
    }

    saveSession();
}

// Drag and drop handlers for tab reordering
let draggedTab: HTMLElement | null = null;

function handleDragStart(e: DragEvent, tab: HTMLElement) {
    draggedTab = tab;
    tab.classList.add("dragging");
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", tab.innerHTML);
    }
}

function handleDragOver(e: DragEvent, tab: HTMLElement) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
    }

    if (draggedTab && tab !== draggedTab) {
        const toolTabs = document.getElementById("tool-tabs");
        if (!toolTabs) return;

        const tabs = Array.from(toolTabs.children);
        const draggedIndex = tabs.indexOf(draggedTab);
        const targetIndex = tabs.indexOf(tab);

        if (draggedIndex < targetIndex) {
            toolTabs.insertBefore(draggedTab, tab.nextSibling);
        } else {
            toolTabs.insertBefore(draggedTab, tab);
        }
    }

    return false;
}

function handleDrop(e: DragEvent) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    return false;
}

function handleDragEnd(e: DragEvent, tab: HTMLElement) {
    tab.classList.remove("dragging");
    document.querySelectorAll(".tool-tab").forEach((t) => {
        t.classList.remove("over");
    });
}

// Session management - save and restore
function saveSession() {
    const session = {
        openTools: Array.from(openTools.entries()).map(([id, tool]) => ({
            id,
            isPinned: tool.isPinned,
            connectionId: tool.connectionId,
        })),
        activeToolId,
    };
    localStorage.setItem("toolbox-session", JSON.stringify(session));
}

async function restoreSession() {
    const sessionData = localStorage.getItem("toolbox-session");
    if (!sessionData) return;

    try {
        const session = JSON.parse(sessionData);
        if (session.openTools && Array.isArray(session.openTools)) {
            for (const toolInfo of session.openTools) {
                await launchTool(toolInfo.id);
                if (toolInfo.isPinned) {
                    togglePinTab(toolInfo.id);
                }
                if (toolInfo.connectionId) {
                    setToolConnection(toolInfo.id, toolInfo.connectionId);
                }
            }
            if (session.activeToolId && openTools.has(session.activeToolId)) {
                switchToTool(session.activeToolId);
            }
        }
    } catch (error) {
        console.error("Failed to restore session:", error);
    }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        // Ctrl+Tab - Switch to next tab
        if (e.ctrlKey && e.key === "Tab") {
            e.preventDefault();
            const toolIds = Array.from(openTools.keys());
            if (toolIds.length === 0) return;

            const currentIndex = activeToolId ? toolIds.indexOf(activeToolId) : -1;
            const nextIndex = (currentIndex + 1) % toolIds.length;
            switchToTool(toolIds[nextIndex]);
        }

        // Ctrl+W - Close current tab
        if (e.ctrlKey && e.key === "w") {
            e.preventDefault();
            if (activeToolId) {
                closeTool(activeToolId);
            }
        }

        // Ctrl+Shift+Tab - Switch to previous tab
        if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
            e.preventDefault();
            const toolIds = Array.from(openTools.keys());
            if (toolIds.length === 0) return;

            const currentIndex = activeToolId ? toolIds.indexOf(activeToolId) : -1;
            const prevIndex = currentIndex <= 0 ? toolIds.length - 1 : currentIndex - 1;
            switchToTool(toolIds[prevIndex]);
        }
    });
}

function setToolConnection(toolId: string, connectionId: string | null) {
    const tool = openTools.get(toolId);
    if (!tool) return;

    tool.connectionId = connectionId;

    // Update connection badge on tab
    const badge = document.getElementById(`tab-connection-${toolId}`);
    if (badge) {
        if (connectionId) {
            badge.style.display = "inline";
            badge.title = "Connected";
        } else {
            badge.style.display = "none";
            badge.title = "No connection";
        }
    }

    saveSession();

    // Notify tool of connection change (in a real implementation, this would message the webview)
    console.log(`Tool ${toolId} connection set to:`, connectionId);
}

// Show home page function
function showHomePage() {
    // Hide tool panel
    const toolPanel = document.getElementById("tool-panel");
    if (toolPanel) {
        toolPanel.style.display = "none";
    }

    // Show home view
    const homeView = document.getElementById("home-view");
    if (homeView) {
        homeView.style.display = "block";
        homeView.classList.add("active");
    }
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function toolSettings(toolId: string) {
    try {
        console.log("Opening settings for tool:", toolId);

        // Get the tool and its current settings
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            window.toolboxAPI.utils.showNotification({
                title: "Tool Not Found",
                body: `Tool ${toolId} not found`,
                type: "error",
            });
            return;
        }

        const currentSettings = await window.toolboxAPI.getToolSettings(toolId);

        // Create a settings modal
        const modal = document.getElementById("tool-settings-modal");
        if (!modal) {
            console.error("Tool settings modal not found");
            return;
        }

        const settingsContent = modal.querySelector("#tool-settings-content");
        if (!settingsContent) {
            console.error("Tool settings content container not found");
            return;
        }

        // Display current settings
        settingsContent.innerHTML = `
            <h3>Settings for ${tool.name}</h3>
            <div class="settings-form">
                <p class="hint">Current settings:</p>
                <pre>${JSON.stringify(currentSettings || {}, null, 2)}</pre>
                <p class="hint">Tool-specific settings UI would appear here in a full implementation.</p>
            </div>
        `;

        modal.classList.add("active");

        console.log("Tool settings opened for:", tool.name);
    } catch (error) {
        console.error("Error opening tool settings:", error);
        window.toolboxAPI.utils.showNotification({
            title: "Settings Error",
            body: `Failed to open tool settings: ${error}`,
            type: "error",
        });
    }
}

// Connections Management
async function loadConnections() {
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

function updateFooterConnectionStatus(connection: any | null) {
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

async function connectToConnection(id: string) {
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

async function disconnectConnection() {
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

async function handleReauthentication(connectionId: string) {
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

async function addConnection() {
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

async function testConnection() {
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

function updateAuthFieldsVisibility() {
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    const clientSecretFields = document.getElementById("client-secret-fields");
    const usernamePasswordFields = document.getElementById("username-password-fields");
    const testConnectionBtn = document.getElementById("test-connection-btn");

    if (!authTypeSelect) return;

    const authType = authTypeSelect.value;

    // Hide all fields first
    if (clientSecretFields) clientSecretFields.style.display = "none";
    if (usernamePasswordFields) usernamePasswordFields.style.display = "none";

    // Show relevant fields based on auth type
    if (authType === "clientSecret") {
        if (clientSecretFields) clientSecretFields.style.display = "block";
        if (testConnectionBtn) testConnectionBtn.style.display = "inline-block";
    } else if (authType === "usernamePassword") {
        if (usernamePasswordFields) usernamePasswordFields.style.display = "block";
        if (testConnectionBtn) testConnectionBtn.style.display = "inline-block";
    } else if (authType === "interactive") {
        // Hide test connection button for interactive auth
        if (testConnectionBtn) testConnectionBtn.style.display = "none";
    }
}

async function deleteConnection(id: string) {
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

// Settings Management
function applyTheme(theme: string) {
    const body = document.body;

    if (theme === "system") {
        // Check system preference
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        body.classList.toggle("dark-theme", prefersDark);
        body.classList.toggle("light-theme", !prefersDark);
    } else if (theme === "dark") {
        body.classList.add("dark-theme");
        body.classList.remove("light-theme");
    } else {
        body.classList.add("light-theme");
        body.classList.remove("dark-theme");
    }

    // Update pin icons in tabs when theme changes
    updatePinIconsForTheme();

    // Update activity bar icons when theme changes
    updateActivityBarIconsForTheme();

    // Reload sidebar to update tool icons with correct theme
    const activeSidebar = document.querySelector(".sidebar-content.active");
    if (activeSidebar) {
        const sidebarId = activeSidebar.id.replace("sidebar-", "");
        if (sidebarId === "tools") {
            loadSidebarTools();
        } else if (sidebarId === "marketplace") {
            loadMarketplace();
        }
    }
}

function updatePinIconsForTheme() {
    const isDarkTheme = document.body.classList.contains("dark-theme");

    // Update all pin icons in tabs
    document.querySelectorAll(".tool-tab").forEach((tab) => {
        const pinBtn = tab.querySelector(".tool-tab-pin img") as HTMLImageElement;
        if (pinBtn) {
            const isPinned = tab.classList.contains("pinned");
            if (isPinned) {
                pinBtn.src = isDarkTheme ? "icons/dark/pin-filled.svg" : "icons/light/pin-filled.svg";
            } else {
                pinBtn.src = isDarkTheme ? "icons/dark/pin.svg" : "icons/light/pin.svg";
            }
        }
    });
}

function updateActivityBarIconsForTheme() {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const prefix = isDarkTheme ? "icons/dark" : "icons/light";

    const map: Array<{ id: string; file: string }> = [
        { id: "tools-icon", file: "tools.svg" },
        { id: "connections-icon", file: "connections.svg" },
        { id: "marketplace-icon", file: "marketplace.svg" },
        { id: "debug-icon", file: "debug.svg" },
        { id: "settings-icon", file: "settings.svg" },
    ];

    for (const m of map) {
        const el = document.getElementById(m.id) as HTMLImageElement | null;
        if (el) {
            el.src = `${prefix}/${m.file}`;
        }
    }
}

function applyTerminalFont(fontFamily: string) {
    const terminalPanelContent = document.getElementById("terminal-panel-content");
    if (terminalPanelContent) {
        terminalPanelContent.style.fontFamily = fontFamily;
    }

    // Also apply to any existing terminal output elements
    const terminalOutputElements = document.querySelectorAll(".terminal-output-content");
    terminalOutputElements.forEach((element) => {
        (element as HTMLElement).style.fontFamily = fontFamily;
    });
}

function applyDebugMenuVisibility(showDebugMenu: boolean) {
    const debugActivityItem = document.querySelector('[data-sidebar="debug"]') as HTMLElement;
    if (debugActivityItem) {
        debugActivityItem.style.display = showDebugMenu ? "" : "none";
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function saveSettings() {
    const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById("auto-update-check") as HTMLInputElement;

    const settings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
    };

    await window.toolboxAPI.updateUserSettings(settings);

    // Apply theme immediately
    applyTheme(settings.theme);

    await window.toolboxAPI.utils.showNotification({
        title: "Settings Saved",
        body: "Your settings have been saved.",
        type: "success",
    });
}

// Auto-Update Management
function showUpdateStatus(message: string, type: "info" | "success" | "error") {
    const statusElement = document.getElementById("update-status");
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `update-status ${type}`;
    }
}

function hideUpdateStatus() {
    const statusElement = document.getElementById("update-status");
    if (statusElement) {
        statusElement.style.display = "none";
    }
}

function showUpdateProgress() {
    const progressElement = document.getElementById("update-progress");
    if (progressElement) {
        progressElement.style.display = "block";
    }
}

function hideUpdateProgress() {
    const progressElement = document.getElementById("update-progress");
    if (progressElement) {
        progressElement.style.display = "none";
    }
}

function updateProgress(percent: number) {
    const fillElement = document.getElementById("progress-bar-fill");
    const textElement = document.getElementById("progress-text");
    if (fillElement) {
        fillElement.style.width = `${percent}%`;
    }
    if (textElement) {
        textElement.textContent = `${percent}%`;
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkForUpdates() {
    hideUpdateStatus();
    hideUpdateProgress();
    showUpdateStatus("Checking for updates...", "info");

    try {
        await window.toolboxAPI.checkForUpdates();
    } catch (error) {
        showUpdateStatus(`Error: ${(error as Error).message}`, "error");
    }
}

// Set up auto-update event listeners
function setupAutoUpdateListeners() {
    window.toolboxAPI.onUpdateChecking(() => {
        showUpdateStatus("Checking for updates...", "info");
    });

    window.toolboxAPI.onUpdateAvailable((info: any) => {
        showUpdateStatus(`Update available: Version ${info.version}`, "success");
    });

    window.toolboxAPI.onUpdateNotAvailable(() => {
        showUpdateStatus("You are running the latest version", "success");
    });

    window.toolboxAPI.onUpdateDownloadProgress((progress: any) => {
        showUpdateProgress();
        updateProgress(progress.percent);
        showUpdateStatus(`Downloading update: ${progress.percent}%`, "info");
    });

    window.toolboxAPI.onUpdateDownloaded((info: any) => {
        hideUpdateProgress();
        showUpdateStatus(`Update downloaded: Version ${info.version}. Restart to install.`, "success");
    });

    window.toolboxAPI.onUpdateError((error: string) => {
        hideUpdateProgress();
        showUpdateStatus(`Update error: ${error}`, "error");
    });
}

// Modal Management
function openModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");

        // Reset add-connection-modal when closed
        if (modalId === "add-connection-modal") {
            resetConnectionModal();
        }
    }
}

function resetConnectionModal() {
    // Reset all form fields
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
    const testBtn = document.getElementById("test-connection-btn") as HTMLButtonElement;

    if (nameInput) nameInput.value = "";
    if (urlInput) urlInput.value = "";
    if (environmentSelect) environmentSelect.value = "Dev";
    if (authTypeSelect) authTypeSelect.value = "interactive";
    if (clientIdInput) clientIdInput.value = "";
    if (clientSecretInput) clientSecretInput.value = "";
    if (tenantIdInput) tenantIdInput.value = "";
    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (optionalClientIdInput) optionalClientIdInput.value = "";

    // Reset test button state
    if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = "Test Connection";
    }

    // Reset field visibility
    updateAuthFieldsVisibility();
}

// Activity Bar and Sidebar Management
let currentSidebarId: string | null = "tools";

function switchSidebar(sidebarId: string) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    // If clicking the same sidebar, toggle collapse
    if (currentSidebarId === sidebarId) {
        sidebar.classList.toggle("collapsed");
        if (sidebar.classList.contains("collapsed")) {
            // Sidebar is now collapsed
            document.querySelectorAll(".activity-item").forEach((item) => {
                item.classList.remove("active");
            });
            currentSidebarId = null;
        } else {
            // Sidebar is now expanded
            const activeActivity = document.querySelector(`[data-sidebar="${sidebarId}"]`);
            if (activeActivity) {
                activeActivity.classList.add("active");
            }
            currentSidebarId = sidebarId;
        }
        return;
    }

    // Switching to a different sidebar
    sidebar.classList.remove("collapsed");
    currentSidebarId = sidebarId;

    // Update activity items
    document.querySelectorAll(".activity-item").forEach((item) => {
        item.classList.remove("active");
    });
    const activeActivity = document.querySelector(`[data-sidebar="${sidebarId}"]`);
    if (activeActivity) {
        activeActivity.classList.add("active");
    }

    // Update sidebar content
    document.querySelectorAll(".sidebar-content").forEach((content) => {
        content.classList.remove("active");
    });
    const activeSidebar = document.getElementById(`sidebar-${sidebarId}`);
    if (activeSidebar) {
        activeSidebar.classList.add("active");
    }

    // Load content based on sidebar
    if (sidebarId === "tools") {
        loadSidebarTools();
    } else if (sidebarId === "connections") {
        loadSidebarConnections();
    } else if (sidebarId === "marketplace") {
        loadMarketplace();
    } else if (sidebarId === "settings") {
        loadSidebarSettings();
    }
}

async function loadSidebarTools() {
    const toolsList = document.getElementById("sidebar-tools-list");
    if (!toolsList) return;

    const tools = await window.toolboxAPI.getAllTools();

    // If no tools are found, show an empty state
    if (!tools || tools.length === 0) {
        toolsList.innerHTML = `
            <div class="empty-state">
                <p>No tools installed.</p>
                <p class="empty-state-hint">Install tools from the marketplace.</p>
            </div>
        `;
        return;
    }

    // Check for updates for all tools and get favorite status
    const favoriteTools = await window.toolboxAPI.getFavoriteTools();
    const toolsWithUpdateInfo = await Promise.all(
        tools.map(async (tool) => {
            const updateInfo = await window.toolboxAPI.checkToolUpdates(tool.id);
            return {
                ...tool,
                latestVersion: updateInfo.latestVersion,
                hasUpdate: updateInfo.hasUpdate,
                isFavorite: favoriteTools.includes(tool.id),
            };
        }),
    );

    // Setup search
    const searchInput = document.getElementById("tools-search-input") as any; // Fluent UI text field
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            renderSidebarTools(toolsWithUpdateInfo, searchInput.value);
        });
    }

    renderSidebarTools(toolsWithUpdateInfo, "");
}

function renderSidebarTools(tools: any[], searchTerm: string) {
    const toolsList = document.getElementById("sidebar-tools-list");
    if (!toolsList) return;

    const filteredTools = tools.filter((tool) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return tool.name.toLowerCase().includes(term) || tool.description.toLowerCase().includes(term);
    });

    if (filteredTools.length === 0) {
        toolsList.innerHTML = `
            <div class="empty-state">
                <p>No tools found.</p>
            </div>
        `;
        return;
    }

    // Sort tools: favorites first (sorted by name), then non-favorites (sorted by name)
    // Create a copy to avoid mutating the filtered array
    const sortedTools = [...filteredTools].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
    });

    toolsList.innerHTML = sortedTools
        .map((tool) => {
            const isDarkTheme = document.body.classList.contains("dark-theme");
            const trashIconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";
            const starIconPath = tool.isFavorite
                ? isDarkTheme
                    ? "icons/dark/star-filled.svg"
                    : "icons/light/star-filled.svg"
                : isDarkTheme
                ? "icons/dark/star-regular.svg"
                : "icons/light/star-regular.svg";
            const favoriteTitle = tool.isFavorite ? "Remove from favorites" : "Add to favorites";

            // Determine tool icon: use URL if provided, otherwise use default icon
            const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
            let toolIconHtml = "";
            if (tool.icon) {
                // Check if icon is a URL (starts with http:// or https://)
                if (tool.icon.startsWith("http://") || tool.icon.startsWith("https://")) {
                    toolIconHtml = `<img src="${tool.icon}" alt="${tool.name} icon" class="tool-item-icon-img" onerror="this.src='${defaultToolIcon}'" />`;
                } else {
                    // Assume it's an emoji or text
                    toolIconHtml = `<span class="tool-item-icon-text">${tool.icon}</span>`;
                }
            } else {
                // Use default icon
                toolIconHtml = `<img src="${defaultToolIcon}" alt="Tool icon" class="tool-item-icon-img" />`;
            }

            return `
        <div class="tool-item-vscode" data-tool-id="${tool.id}">
            <div class="tool-item-header-vscode">
                <span class="tool-item-icon-vscode">${toolIconHtml}</span>
                <div class="tool-item-name-vscode">
                    ${tool.name}
                    ${tool.hasUpdate ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                </div>
                <button class="tool-favorite-btn" data-action="favorite" data-tool-id="${tool.id}" title="${favoriteTitle}">
                    <img src="${starIconPath}" alt="${tool.isFavorite ? "Favorited" : "Not favorite"}" />
                </button>
            </div>
            <div class="tool-item-description-vscode">${tool.description}</div>
            <div class="tool-item-version-vscode">
                v${tool.version}${tool.hasUpdate ? ` → v${tool.latestVersion}` : ""}
            </div>
            <div class="tool-item-actions-vscode">
                ${tool.hasUpdate ? `<button class="fluent-button fluent-button-secondary" data-action="update" data-tool-id="${tool.id}" title="Update to v${tool.latestVersion}">Update</button>` : ""}
                <button class="fluent-button fluent-button-primary" data-action="launch" data-tool-id="${tool.id}">Launch</button>
                <button class="tool-item-delete-btn" data-action="delete" data-tool-id="${tool.id}" title="Uninstall tool">
                    <img src="${trashIconPath}" alt="Delete" />
                </button>
            </div>
        </div>
    `;
        })
        .join("");

    // Add event listeners
    toolsList.querySelectorAll(".tool-item-vscode").forEach((item) => {
        item.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "BUTTON") return; // Button click will handle

            const toolId = item.getAttribute("data-tool-id");
            if (toolId) {
                launchTool(toolId);
            }
        });
    });

    toolsList.querySelectorAll(".tool-item-actions-vscode button, .tool-favorite-btn").forEach((button) => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation();
            const target = e.target as HTMLElement;
            const button = target.closest("button") as HTMLButtonElement;
            if (!button) return;

            const action = button.getAttribute("data-action");
            const toolId = button.getAttribute("data-tool-id");
            if (!toolId) return;

            if (action === "launch") {
                launchTool(toolId);
            } else if (action === "delete") {
                await uninstallToolFromSidebar(toolId);
            } else if (action === "update") {
                await updateToolFromSidebar(toolId);
            } else if (action === "favorite") {
                await toggleFavoriteTool(toolId);
            }
        });
    });
}

async function uninstallToolFromSidebar(toolId: string) {
    if (!confirm("Are you sure you want to uninstall this tool?")) {
        return;
    }

    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            throw new Error("Tool not found");
        }

        await window.toolboxAPI.uninstallTool(tool.id, toolId);

        await window.toolboxAPI.utils.showNotification({
            title: "Tool Uninstalled",
            body: `${tool.name} has been uninstalled.`,
            type: "success",
        });

        // Reload the sidebar tools
        await loadSidebarTools();

        // Reload marketplace to update installed status
        await loadMarketplace();
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Uninstall Failed",
            body: `Failed to uninstall tool: ${(error as Error).message}`,
            type: "error",
        });
    }
}

async function updateToolFromSidebar(toolId: string) {
    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            throw new Error("Tool not found");
        }

        await window.toolboxAPI.utils.showNotification({
            title: "Updating Tool",
            body: `Updating ${tool.name}...`,
            type: "info",
        });

        const updatedTool = await window.toolboxAPI.updateTool(tool.id);

        await window.toolboxAPI.utils.showNotification({
            title: "Tool Updated",
            body: `${tool.name} has been updated to v${updatedTool.version}.`,
            type: "success",
        });

        // Reload the sidebar tools to show new version
        await loadSidebarTools();

        // Reload marketplace to update version display
        await loadMarketplace();
    } catch (error) {
        await window.toolboxAPI.utils.showNotification({
            title: "Update Failed",
            body: `Failed to update tool: ${(error as Error).message}`,
            type: "error",
        });
    }
}

async function toggleFavoriteTool(toolId: string) {
    try {
        const isFavorite = await window.toolboxAPI.toggleFavoriteTool(toolId);
        const message = isFavorite ? "Added to favorites" : "Removed from favorites";
        window.toolboxAPI.utils.showNotification({
            title: "Favorites Updated",
            body: message,
            type: "success",
        });
        await loadSidebarTools();
    } catch (error) {
        window.toolboxAPI.utils.showNotification({
            title: "Error",
            body: `Failed to update favorites: ${error}`,
            type: "error",
        });
    }
}

async function loadSidebarConnections() {
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
                <div class="connection-item-vscode ${conn.isActive ? "active" : ""} ${isExpired ? "expired" : ""}">
                    <div class="connection-item-header-vscode">
                        <div class="connection-item-name-vscode">${conn.name}${warningIcon}</div>
                        <span class="connection-env-pill env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                    </div>
                    <div class="connection-item-url-vscode">${conn.url}</div>
                    <div class="connection-item-actions-vscode" style="display: flex; justify-content: space-between; align-items: center;">
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

async function loadMarketplace() {
    const marketplaceList = document.getElementById("marketplace-tools-list");
    if (!marketplaceList) return;

    // Check if toolLibrary is empty (failed to load from registry)
    if (!toolLibrary || toolLibrary.length === 0) {
        marketplaceList.innerHTML = `
            <div class="empty-state">
                <p>Unable to load tools from registry.</p>
                <p class="empty-state-hint">Please check your internet connection and try again.</p>
            </div>
        `;
        return;
    }

    // Get installed tools
    const installedTools = await window.toolboxAPI.getAllTools();
    const installedToolsMap = new Map(installedTools.map((t: any) => [t.id, t]));

    // Filter based on search
    const searchInput = document.getElementById("marketplace-search-input") as any; // Fluent UI text field
    const searchTerm = searchInput?.value ? searchInput.value.toLowerCase() : "";

    const filteredTools = toolLibrary.filter((tool) => {
        if (!searchTerm) return true;
        return tool.name.toLowerCase().includes(searchTerm) || tool.description.toLowerCase().includes(searchTerm) || tool.category.toLowerCase().includes(searchTerm);
    });

    // Show empty state if no tools match the search
    if (filteredTools.length === 0) {
        marketplaceList.innerHTML = `
            <div class="empty-state">
                <p>No tools found.</p>
                <p class="empty-state-hint">${searchTerm ? "Try a different search term." : "Check back later for new tools."}</p>
            </div>
        `;
        return;
    }

    marketplaceList.innerHTML = filteredTools
        .map((tool) => {
            const installedTool = installedToolsMap.get(tool.id);
            const isInstalled = !!installedTool;
            const isDarkTheme = document.body.classList.contains("dark-theme");

            // Determine tool icon: use URL if provided, otherwise use default icon
            const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
            let toolIconHtml = "";
            if (tool.icon) {
                // Check if icon is a URL (starts with http:// or https://)
                if (tool.icon.startsWith("http://") || tool.icon.startsWith("https://")) {
                    toolIconHtml = `<img src="${tool.icon}" alt="${tool.name} icon" class="marketplace-item-icon-img" onerror="this.src='${defaultToolIcon}'" />`;
                } else {
                    // Assume it's an emoji or text
                    toolIconHtml = `<span class="marketplace-item-icon-text">${tool.icon}</span>`;
                }
            } else {
                // Use default icon
                toolIconHtml = `<img src="${defaultToolIcon}" alt="Tool icon" class="marketplace-item-icon-img" />`;
            }

            return `
        <div class="marketplace-item-vscode ${isInstalled ? "installed" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-header-vscode">
                <span class="marketplace-item-icon-vscode">${toolIconHtml}</span>
                <div class="marketplace-item-info-vscode">
                    <div class="marketplace-item-name-vscode">
                        ${tool.name}
                    </div>
                    <div class="marketplace-item-author-vscode">by ${tool.author}</div>
                </div>
            </div>
            <div class="marketplace-item-description-vscode">${tool.description}</div>
            <div class="marketplace-item-footer-vscode">
                <div class="marketplace-item-tags">
                    <span class="marketplace-item-category-vscode">${tool.category}</span>
                    ${isInstalled ? '<span class="marketplace-item-installed-badge">Installed</span>' : ""}
                </div>
                <div class="marketplace-item-actions-vscode">
                    ${!isInstalled ? `<button class="fluent-button fluent-button-primary" data-action="install" data-tool-id="${tool.id}">Install</button>` : ""}
                </div>
            </div>
        </div>
    `;
        })
        .join("");

    // Add click handlers for marketplace items to open detail view
    marketplaceList.querySelectorAll(".marketplace-item-vscode").forEach((item) => {
        item.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            // Don't open detail if clicking a button
            if (target.tagName === "BUTTON") return;

            const toolId = item.getAttribute("data-tool-id");
            if (toolId) {
                const tool = toolLibrary.find((t) => t.id === toolId);
                if (tool) {
                    const isInstalled = installedToolsMap.has(toolId);
                    openToolDetail(tool, isInstalled);
                }
            }
        });
    });

    // Add event listeners for install and update buttons
    marketplaceList.querySelectorAll(".marketplace-item-actions-vscode button").forEach((button) => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation(); // Prevent opening detail modal
            const target = e.target as HTMLButtonElement;
            const action = target.getAttribute("data-action");
            const toolId = target.getAttribute("data-tool-id");
            if (!toolId) return;

            if (action === "install") {
                target.disabled = true;
                target.textContent = "Installing...";

                try {
                    // Use registry-based installation
                    await window.toolboxAPI.installToolFromRegistry(toolId);

                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Installed",
                        body: `Tool has been installed successfully`,
                        type: "success",
                    });

                    // Reload marketplace and tools sidebar
                    await loadMarketplace();
                    await loadSidebarTools();
                } catch (error) {
                    target.disabled = false;
                    target.textContent = "Install";
                    window.toolboxAPI.utils.showNotification({
                        title: "Installation Failed",
                        body: `Failed to install tool: ${error}`,
                        type: "error",
                    });
                }
            } else if (action === "update") {
                target.disabled = true;
                target.textContent = "Updating...";

                try {
                    const updatedTool = await window.toolboxAPI.updateTool(toolId);

                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Updated",
                        body: `Tool has been updated to v${updatedTool.version}`,
                        type: "success",
                    });

                    // Reload marketplace and tools sidebar
                    await loadMarketplace();
                    await loadSidebarTools();
                } catch (error) {
                    target.disabled = false;
                    target.textContent = "Update";
                    window.toolboxAPI.utils.showNotification({
                        title: "Update Failed",
                        body: `Failed to update tool: ${error}`,
                        type: "error",
                    });
                }
            }
        });
    });

    // Setup search
    if (searchInput) {
        // Remove existing listeners
        const newSearchInput = searchInput.cloneNode(true) as HTMLInputElement;
        searchInput.parentNode?.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener("input", () => {
            loadMarketplace();
        });
    }
}

// Open tool detail modal
async function openToolDetail(tool: any, isInstalled: boolean) {
    const modal = document.getElementById("tool-detail-modal");
    if (!modal) return;

    // Set tool info
    const nameElement = document.getElementById("tool-detail-name");
    const descElement = document.getElementById("tool-detail-description");
    const authorElement = document.getElementById("tool-detail-author");
    const categoryElement = document.getElementById("tool-detail-category");
    const installBtn = document.getElementById("tool-detail-install-btn");
    const installedBadge = document.getElementById("tool-detail-installed-badge");
    const readmeContent = document.getElementById("tool-detail-readme-content");

    if (nameElement) nameElement.textContent = tool.name;
    if (descElement) descElement.textContent = tool.description;
    if (authorElement) authorElement.textContent = `Author: ${tool.author}`;
    if (categoryElement) categoryElement.textContent = `Category: ${tool.category}`;

    // Show install button or installed badge
    if (installBtn && installedBadge) {
        if (isInstalled) {
            installBtn.style.display = "none";
            installedBadge.style.display = "inline-flex";
        } else {
            installBtn.style.display = "block";
            installedBadge.style.display = "none";

            // Setup install button handler
            const newInstallBtn = installBtn.cloneNode(true) as HTMLButtonElement;
            installBtn.parentNode?.replaceChild(newInstallBtn, installBtn);

            newInstallBtn.addEventListener("click", async () => {
                newInstallBtn.disabled = true;
                newInstallBtn.textContent = "Installing...";

                try {
                    await window.toolboxAPI.installTool(tool.id);

                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Installed",
                        body: `${tool.name} has been installed successfully`,
                        type: "success",
                    });

                    // Close modal and reload
                    closeModal("tool-detail-modal");
                    await loadMarketplace();
                    await loadSidebarTools();
                } catch (error) {
                    newInstallBtn.disabled = false;
                    newInstallBtn.textContent = "Install";
                    window.toolboxAPI.utils.showNotification({
                        title: "Installation Failed",
                        body: `Failed to install tool: ${error}`,
                        type: "error",
                    });
                }
            });
        }
    }

    // Load README
    if (readmeContent) {
        readmeContent.innerHTML = '<p class="loading-text">Loading README...</p>';

        const readmeUrl = (tool as any).readme || (tool as any).readmeUrl;
        if (readmeUrl) {
            try {
                const response = await fetch(readmeUrl);
                const markdown = await response.text();

                // Simple markdown to HTML conversion
                const html = convertMarkdownToHtml(markdown);
                readmeContent.innerHTML = html;
            } catch (error) {
                readmeContent.innerHTML = '<p class="loading-text">Failed to load README</p>';
            }
        } else {
            readmeContent.innerHTML = '<p class="loading-text">No README available</p>';
        }
    }

    openModal("tool-detail-modal");
}

// Simple markdown to HTML converter
function convertMarkdownToHtml(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Code blocks
    html = html.replace(/```([^`]+)```/gs, "<pre><code>$1</code></pre>");

    // Line breaks
    html = html.replace(/\n\n/g, "</p><p>");
    html = html.replace(/\n/g, "<br>");

    // Wrap in paragraphs if not already in a tag
    if (!html.startsWith("<")) {
        html = "<p>" + html + "</p>";
    }

    return html;
}

// Track original settings to detect changes
let originalSettings: {
    theme?: string;
    autoUpdate?: boolean;
    showDebugMenu?: boolean;
    terminalFont?: string;
} = {};

async function loadSidebarSettings() {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");

    if (themeSelect && autoUpdateCheck && showDebugMenuCheck && terminalFontSelect) {
        const settings = await window.toolboxAPI.getUserSettings();

        // Store original settings for change detection
        originalSettings = {
            theme: settings.theme,
            autoUpdate: settings.autoUpdate,
            showDebugMenu: settings.showDebugMenu ?? false,
            terminalFont: settings.terminalFont || "'Consolas', 'Monaco', 'Courier New', monospace",
        };

        themeSelect.value = settings.theme;
        autoUpdateCheck.checked = settings.autoUpdate;
        showDebugMenuCheck.checked = settings.showDebugMenu ?? false;

        const terminalFont = settings.terminalFont || "'Consolas', 'Monaco', 'Courier New', monospace";

        // Check if the font is a predefined option
        const options = Array.from(terminalFontSelect.options) as HTMLOptionElement[];
        const matchingOption = options.find((opt) => opt.value === terminalFont);

        if (matchingOption) {
            terminalFontSelect.value = terminalFont;
        } else {
            // Custom font - set dropdown to "custom" and populate input
            terminalFontSelect.value = "custom";
            if (customFontInput) {
                customFontInput.value = terminalFont;
            }
            if (customFontContainer) {
                customFontContainer.style.display = "block";
            }
        }

        // Apply current terminal font
        applyTerminalFont(terminalFont);
    }
}

async function saveSidebarSettings() {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;

    if (!themeSelect || !autoUpdateCheck || !showDebugMenuCheck || !terminalFontSelect) return;

    let terminalFont = terminalFontSelect.value;

    // If custom option is selected, use the custom input value
    if (terminalFont === "custom" && customFontInput) {
        terminalFont = customFontInput.value.trim() || "'Consolas', 'Monaco', 'Courier New', monospace";
    }

    const currentSettings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
        showDebugMenu: showDebugMenuCheck.checked,
        terminalFont: terminalFont,
    };

    // Only include changed settings in the update
    const changedSettings: any = {};

    if (currentSettings.theme !== originalSettings.theme) {
        changedSettings.theme = currentSettings.theme;
    }
    if (currentSettings.autoUpdate !== originalSettings.autoUpdate) {
        changedSettings.autoUpdate = currentSettings.autoUpdate;
    }
    if (currentSettings.showDebugMenu !== originalSettings.showDebugMenu) {
        changedSettings.showDebugMenu = currentSettings.showDebugMenu;
    }
    if (currentSettings.terminalFont !== originalSettings.terminalFont) {
        changedSettings.terminalFont = currentSettings.terminalFont;
    }

    // Only save and emit event if something changed
    if (Object.keys(changedSettings).length > 0) {
        await window.toolboxAPI.updateUserSettings(changedSettings);

        // Apply all current settings visually (even if not all changed)
        applyTheme(currentSettings.theme);
        applyTerminalFont(currentSettings.terminalFont);
        applyDebugMenuVisibility(currentSettings.showDebugMenu);

        // Update original settings to reflect new state
        originalSettings = { ...currentSettings };

        await window.toolboxAPI.utils.showNotification({
            title: "Settings Saved",
            body: "Your settings have been saved.",
            type: "success",
        });
    }
    // If no changes, do nothing (no notification shown)
}

// ===== Terminal Management =====
interface TerminalTab {
    id: string;
    name: string;
    toolId: string;
    element: HTMLElement;
    outputElement: HTMLElement;
}

const openTerminals = new Map<string, TerminalTab>();
let activeTerminalId: string | null = null;

// Set up terminal panel
function setupTerminalPanel() {
    const toggleBtn = document.getElementById("footer-toggle-terminal-btn");
    const terminalPanel = document.getElementById("terminal-panel");
    const terminalPanelClose = document.getElementById("terminal-panel-close");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (toggleBtn && terminalPanel) {
        toggleBtn.addEventListener("click", () => {
            const isVisible = terminalPanel.style.display !== "none";
            if (isVisible) {
                terminalPanel.style.display = "none";
                if (resizeHandle) resizeHandle.style.display = "none";
            } else {
                terminalPanel.style.display = "flex";
                if (resizeHandle) resizeHandle.style.display = "block";
            }
        });
    }

    if (terminalPanelClose && terminalPanel) {
        terminalPanelClose.addEventListener("click", () => {
            terminalPanel.style.display = "none";
            if (resizeHandle) resizeHandle.style.display = "none";
        });
    }

    // Set up resize handle for terminal panel
    if (resizeHandle && terminalPanel) {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener("mousedown", (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = terminalPanel.offsetHeight;
            document.body.style.cursor = "ns-resize";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight * 0.8));
            terminalPanel.style.height = `${newHeight}px`;
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
            }
        });
    }
}

// Handle terminal created event
function handleTerminalCreated(terminal: any) {
    console.log("Terminal created:", terminal);
    createTerminalTab(terminal);
    showTerminalPanel();
}

// Handle terminal closed event
function handleTerminalClosed(data: any) {
    console.log("Terminal closed:", data);
    removeTerminalTab(data.terminalId);
}

// Handle terminal output event
function handleTerminalOutput(data: any) {
    const { terminalId, data: output } = data;
    appendTerminalOutput(terminalId, output);
}

// Handle terminal command completed event
function handleTerminalCommandCompleted(result: any) {
    console.log("Terminal command completed:", result);
    // Output is already displayed via terminal:output events
}

// Handle terminal error event
function handleTerminalError(data: any) {
    const { terminalId, error } = data;
    appendTerminalOutput(terminalId, `\x1b[31mError: ${error}\x1b[0m\n`);
}

// Create a terminal tab
function createTerminalTab(terminal: any) {
    const terminalTabs = document.getElementById("terminal-tabs");
    const terminalPanelContent = document.getElementById("terminal-panel-content");

    if (!terminalTabs || !terminalPanelContent) return;

    // Create tab element
    const tabElement = document.createElement("button");
    tabElement.className = "terminal-tab";
    tabElement.dataset.terminalId = terminal.id;

    const tabLabel = document.createElement("span");
    tabLabel.textContent = terminal.name;
    tabElement.appendChild(tabLabel);

    const closeBtn = document.createElement("button");
    closeBtn.className = "terminal-tab-close";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.toolboxAPI.terminal.close(terminal.id);
    });
    tabElement.appendChild(closeBtn);

    tabElement.addEventListener("click", () => {
        switchTerminalTab(terminal.id);
    });

    terminalTabs.appendChild(tabElement);

    // Create output element
    const outputContainer = document.createElement("div");
    outputContainer.className = "terminal-output";
    outputContainer.dataset.terminalId = terminal.id;

    const outputContent = document.createElement("pre");
    outputContent.className = "terminal-output-content";
    outputContainer.appendChild(outputContent);

    terminalPanelContent.appendChild(outputContainer);

    // Store terminal tab
    openTerminals.set(terminal.id, {
        id: terminal.id,
        name: terminal.name,
        toolId: terminal.toolId,
        element: tabElement,
        outputElement: outputContent,
    });

    // Activate this terminal
    switchTerminalTab(terminal.id);
}

// Remove a terminal tab
function removeTerminalTab(terminalId: string) {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Remove tab element
    terminal.element.remove();

    // Remove output container
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) {
        outputContainer.remove();
    }

    openTerminals.delete(terminalId);

    // If this was the active terminal, switch to another
    if (activeTerminalId === terminalId) {
        const remainingTerminals = Array.from(openTerminals.keys());
        if (remainingTerminals.length > 0) {
            switchTerminalTab(remainingTerminals[0]);
        } else {
            activeTerminalId = null;
            hideTerminalPanel();
        }
    }
}

// Switch to a terminal tab
function switchTerminalTab(terminalId: string) {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Update active state for tabs
    openTerminals.forEach((t) => {
        t.element.classList.remove("active");
    });
    terminal.element.classList.add("active");

    // Update active state for output containers
    document.querySelectorAll(".terminal-output").forEach((output) => {
        output.classList.remove("active");
    });
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) {
        outputContainer.classList.add("active");
    }

    activeTerminalId = terminalId;
}

// Append output to a terminal
function appendTerminalOutput(terminalId: string, output: string) {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Convert ANSI escape codes to HTML
    const htmlOutput = ansiConverter.toHtml(output);

    // Append HTML content (using insertAdjacentHTML to preserve formatting)
    terminal.outputElement.insertAdjacentHTML("beforeend", htmlOutput);

    // Auto-scroll to bottom
    terminal.outputElement.scrollTop = terminal.outputElement.scrollHeight;
}

// Show terminal panel
function showTerminalPanel() {
    const terminalPanel = document.getElementById("terminal-panel");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (terminalPanel) {
        terminalPanel.style.display = "flex";
    }
    if (resizeHandle) {
        resizeHandle.style.display = "block";
    }
}

// Hide terminal panel
function hideTerminalPanel() {
    const terminalPanel = document.getElementById("terminal-panel");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (terminalPanel) {
        terminalPanel.style.display = "none";
    }
    if (resizeHandle) {
        resizeHandle.style.display = "none";
    }
}

// Initialize the application
async function init() {
    // Set up Activity Bar navigation
    const activityItems = document.querySelectorAll(".activity-item");
    activityItems.forEach((item) => {
        item.addEventListener("click", () => {
            const sidebar = item.getAttribute("data-sidebar");
            if (sidebar) {
                switchSidebar(sidebar);
            }
        });
    });

    // Remove old sidebar toggle logic
    // (keeping for backwards compatibility in case needed)

    // Tool panel close all button
    const closeAllToolsBtn = document.getElementById("close-all-tools");
    if (closeAllToolsBtn) {
        closeAllToolsBtn.addEventListener("click", () => {
            closeAllTools();
        });
    }

    // Remove connection selector logic (no longer using it in header)
    // Connection will be selected when tool is launched

    // Split view has been removed (not compatible with BrowserView architecture)

    // Sidebar add connection button
    const sidebarAddConnectionBtn = document.getElementById("sidebar-add-connection-btn");
    if (sidebarAddConnectionBtn) {
        sidebarAddConnectionBtn.addEventListener("click", () => {
            openModal("add-connection-modal");
        });
    }

    // Footer change connection button
    const footerChangeConnectionBtn = document.getElementById("footer-change-connection-btn");
    if (footerChangeConnectionBtn) {
        footerChangeConnectionBtn.addEventListener("click", () => {
            openModal("connection-select-modal");
        });
    }

    // Sidebar save settings button
    const sidebarSaveSettingsBtn = document.getElementById("sidebar-save-settings-btn");
    if (sidebarSaveSettingsBtn) {
        sidebarSaveSettingsBtn.addEventListener("click", saveSidebarSettings);
    }

    // Sidebar browse local tool button (Debug section)
    const sidebarBrowseLocalToolBtn = document.getElementById("sidebar-browse-local-tool-btn");
    const sidebarLocalToolPathInput = document.getElementById("sidebar-local-tool-path") as HTMLInputElement;

    if (sidebarBrowseLocalToolBtn) {
        sidebarBrowseLocalToolBtn.addEventListener("click", async () => {
            try {
                const selectedPath = await window.toolboxAPI.openDirectoryPicker();
                if (selectedPath && sidebarLocalToolPathInput) {
                    sidebarLocalToolPathInput.value = selectedPath;
                }
            } catch (error) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Directory Selection Failed",
                    body: `Failed to select directory: ${(error as Error).message}`,
                    type: "error",
                });
            }
        });
    }

    // Sidebar load local tool button (Debug section)
    const sidebarLoadLocalToolBtn = document.getElementById("sidebar-load-local-tool-btn");
    if (sidebarLoadLocalToolBtn) {
        sidebarLoadLocalToolBtn.addEventListener("click", async () => {
            if (!sidebarLocalToolPathInput) return;

            const localPath = sidebarLocalToolPathInput.value.trim();
            if (!localPath) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid Path",
                    body: "Please select a tool directory first.",
                    type: "error",
                });
                return;
            }

            // Disable button and show loading state
            sidebarLoadLocalToolBtn.textContent = "Loading...";
            sidebarLoadLocalToolBtn.setAttribute("disabled", "true");

            try {
                // Load the local tool
                const tool = await window.toolboxAPI.loadLocalTool(localPath);

                // Show success notification
                await window.toolboxAPI.utils.showNotification({
                    title: "Tool Loaded",
                    body: `${tool.name} has been loaded successfully from local directory.`,
                    type: "success",
                });

                // Clear the input
                sidebarLocalToolPathInput.value = "";

                // Refresh the tools list
                await loadSidebarTools();

                // Switch to tools sidebar to show the newly loaded tool
                switchSidebar("tools");
            } catch (error) {
                // Show error notification
                await window.toolboxAPI.utils.showNotification({
                    title: "Load Failed",
                    body: `Failed to load tool: ${(error as Error).message}`,
                    type: "error",
                    duration: 0, // Persistent error message
                });
            } finally {
                // Re-enable button
                sidebarLoadLocalToolBtn.textContent = "Load Tool";
                sidebarLoadLocalToolBtn.removeAttribute("disabled");
            }
        });
    }

    // Sidebar install package button (Debug section)
    const sidebarInstallPackageBtn = document.getElementById("sidebar-install-package-btn");
    if (sidebarInstallPackageBtn) {
        sidebarInstallPackageBtn.addEventListener("click", async () => {
            const packageNameInput = document.getElementById("sidebar-package-name-input") as HTMLInputElement;
            if (!packageNameInput) return;

            const packageName = packageNameInput.value.trim();
            if (!packageName) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid Package Name",
                    body: "Please enter a valid npm package name.",
                    type: "error",
                });
                return;
            }

            // Disable button and show loading state
            sidebarInstallPackageBtn.textContent = "Installing...";
            sidebarInstallPackageBtn.setAttribute("disabled", "true");

            try {
                // Install the package
                const tool = await window.toolboxAPI.installTool(packageName);

                // Show success notification
                await window.toolboxAPI.utils.showNotification({
                    title: "Tool Installed",
                    body: `${tool.name || packageName} has been installed successfully.`,
                    type: "success",
                });

                // Clear the input
                packageNameInput.value = "";

                // Refresh the tools list
                await loadSidebarTools();

                // Switch to tools sidebar to show the newly installed tool
                switchSidebar("tools");
            } catch (error) {
                // Show error notification
                await window.toolboxAPI.utils.showNotification({
                    title: "Installation Failed",
                    body: `Failed to install ${packageName}: ${(error as Error).message}`,
                    type: "error",
                });
            } finally {
                // Re-enable button
                sidebarInstallPackageBtn.textContent = "Install Package";
                sidebarInstallPackageBtn.removeAttribute("disabled");
            }
        });
    }

    // Allow Enter key to trigger install in the package name input
    const packageNameInput = document.getElementById("sidebar-package-name-input");
    if (packageNameInput) {
        packageNameInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                sidebarInstallPackageBtn?.click();
            }
        });
    }

    // Add change listener for theme selector to apply immediately
    const themeSelect = document.getElementById("sidebar-theme-select");
    if (themeSelect) {
        themeSelect.addEventListener("change", async () => {
            const theme = (themeSelect as any).value;
            if (theme) {
                // Save only the changed theme setting
                await window.toolboxAPI.updateUserSettings({ theme });
                applyTheme(theme);
                // Update original settings to track the change
                originalSettings.theme = theme;
            }
        });
    }

    // Add change listener for terminal font selector to apply immediately and show/hide custom input
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select");
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");

    if (terminalFontSelect) {
        terminalFontSelect.addEventListener("change", async () => {
            const terminalFont = (terminalFontSelect as any).value;

            // Show/hide custom input based on selection
            if (customFontContainer) {
                if (terminalFont === "custom") {
                    customFontContainer.style.display = "block";
                    // Apply custom font if available
                    if (customFontInput && customFontInput.value.trim()) {
                        await window.toolboxAPI.updateUserSettings({ terminalFont: customFontInput.value.trim() });
                        applyTerminalFont(customFontInput.value.trim());
                        originalSettings.terminalFont = customFontInput.value.trim();
                    }
                } else {
                    customFontContainer.style.display = "none";
                    // Apply selected preset font
                    await window.toolboxAPI.updateUserSettings({ terminalFont });
                    applyTerminalFont(terminalFont);
                    originalSettings.terminalFont = terminalFont;
                }
            } else if (terminalFont && terminalFont !== "custom") {
                // Fallback if container not found
                await window.toolboxAPI.updateUserSettings({ terminalFont });
                applyTerminalFont(terminalFont);
                originalSettings.terminalFont = terminalFont;
            }
        });
    }

    // Add input listener for custom font to apply on blur or Enter key
    if (customFontInput) {
        const applyCustomFont = async () => {
            const customFont = customFontInput.value.trim();
            if (customFont) {
                await window.toolboxAPI.updateUserSettings({ terminalFont: customFont });
                applyTerminalFont(customFont);
                originalSettings.terminalFont = customFont;
            }
        };

        customFontInput.addEventListener("blur", applyCustomFont);
        customFontInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                applyCustomFont();
            }
        });
    }

    // Home screen action buttons
    const sponsorBtn = document.getElementById("sponsor-btn");
    if (sponsorBtn) {
        sponsorBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/sponsors/PowerPlatform-ToolBox");
        });
    }

    const githubBtn = document.getElementById("github-btn");
    if (githubBtn) {
        githubBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app");
        });
    }

    // Font help link
    const fontHelpLink = document.getElementById("font-help-link");
    if (fontHelpLink) {
        fontHelpLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/docs/terminal-setup.md#font-configuration");
        });
    }

    const bugsFeaturesBtn = document.getElementById("bugs-features-btn");
    if (bugsFeaturesBtn) {
        bugsFeaturesBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/issues");
        });
    }

    const createToolBtn = document.getElementById("create-tool-btn");
    if (createToolBtn) {
        createToolBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/TOOL_DEV.md");
        });
    }

    // Resource links
    const docsLink = document.getElementById("docs-link");
    if (docsLink) {
        docsLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/README.md");
        });
    }

    const toolDevGuideLink = document.getElementById("tool-dev-guide-link");
    if (toolDevGuideLink) {
        toolDevGuideLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/TOOL_DEV.md");
        });
    }

    const architectureLink = document.getElementById("architecture-link");
    if (architectureLink) {
        architectureLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/docs/ARCHITECTURE.md");
        });
    }

    const contributingLink = document.getElementById("contributing-link");
    if (contributingLink) {
        contributingLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/CONTRIBUTING.md");
        });
    }

    // Install tool modal - removed since we don't have the button anymore

    const closeConnectionModal = document.getElementById("close-connection-modal");
    if (closeConnectionModal) {
        closeConnectionModal.addEventListener("click", () => closeModal("add-connection-modal"));
    }

    const cancelConnectionBtn = document.getElementById("cancel-connection-btn");
    if (cancelConnectionBtn) {
        cancelConnectionBtn.addEventListener("click", () => closeModal("add-connection-modal"));
    }

    const confirmConnectionBtn = document.getElementById("confirm-connection-btn");
    if (confirmConnectionBtn) {
        confirmConnectionBtn.addEventListener("click", addConnection);
    }

    // Test connection button
    const testConnectionBtn = document.getElementById("test-connection-btn");
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener("click", testConnection);
    }

    // Authentication type change handler
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    if (authTypeSelect) {
        authTypeSelect.addEventListener("change", updateAuthFieldsVisibility);
    }

    // Password toggle buttons
    const toggleClientSecret = document.getElementById("toggle-client-secret");
    if (toggleClientSecret) {
        toggleClientSecret.addEventListener("click", () => {
            const input = document.getElementById("connection-client-secret") as HTMLInputElement;
            if (input) {
                input.type = input.type === "password" ? "text" : "password";
            }
        });
    }

    const togglePassword = document.getElementById("toggle-password");
    if (togglePassword) {
        togglePassword.addEventListener("click", () => {
            const input = document.getElementById("connection-password") as HTMLInputElement;
            if (input) {
                input.type = input.type === "password" ? "text" : "password";
            }
        });
    }

    // Tool settings modal
    const closeToolSettingsModal = document.getElementById("close-tool-settings-modal");
    if (closeToolSettingsModal) {
        closeToolSettingsModal.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    const cancelToolSettingsBtn = document.getElementById("cancel-tool-settings-btn");
    if (cancelToolSettingsBtn) {
        cancelToolSettingsBtn.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    // Settings save button - removed since settings view is gone
    // Auto-update button handler - removed since settings view is gone

    // Device code modal
    const closeDeviceCodeBtn = document.getElementById("close-device-code-btn");
    if (closeDeviceCodeBtn) {
        closeDeviceCodeBtn.addEventListener("click", async () => {
            closeModal("device-code-modal");
            // Reload sidebar to reset button state
            await loadSidebarConnections();
        });
    }

    // Authentication error modal
    const closeAuthErrorModal = document.getElementById("close-auth-error-modal");
    if (closeAuthErrorModal) {
        closeAuthErrorModal.addEventListener("click", () => closeModal("auth-error-modal"));
    }

    const closeAuthErrorBtn = document.getElementById("close-auth-error-btn");
    if (closeAuthErrorBtn) {
        closeAuthErrorBtn.addEventListener("click", () => closeModal("auth-error-modal"));
    }

    // Tool detail modal
    const closeToolDetailModal = document.getElementById("close-tool-detail-modal");
    if (closeToolDetailModal) {
        closeToolDetailModal.addEventListener("click", () => closeModal("tool-detail-modal"));
    }

    // Set up auto-update listeners
    setupAutoUpdateListeners();

    // Set up home page listener
    window.toolboxAPI.onShowHomePage(() => {
        showHomePage();
    });

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();

    // Load and apply theme settings on startup
    const settings = await window.toolboxAPI.getUserSettings();
    applyTheme(settings.theme);
    applyTerminalFont(settings.terminalFont || "'Consolas', 'Monaco', 'Courier New', monospace");
    applyDebugMenuVisibility(settings.showDebugMenu ?? false);

    // Load tools library from JSON
    await loadToolsLibrary();

    // Load initial sidebar content (tools by default)
    await loadSidebarTools();
    await loadMarketplace();

    // Load initial data - tools view is deprecated, no need to load
    // await loadTools();

    // Update footer connection info
    await updateFooterConnection();

    // Update footer connection status
    const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
    updateFooterConnectionStatus(activeConnection);

    // Restore previous session
    await restoreSession();

    // Set up IPC listeners for authentication dialogs
    window.toolboxAPI.onShowDeviceCodeDialog((message: string) => {
        const messageElement = document.getElementById("device-code-message");
        if (messageElement) {
            const urlRegex = /https:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%]+/g;
            messageElement.innerHTML = message.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
        }
        openModal("device-code-modal");
    });

    window.toolboxAPI.onCloseDeviceCodeDialog(() => {
        closeModal("device-code-modal");
    });

    window.toolboxAPI.onShowAuthErrorDialog((message: string) => {
        const messageElement = document.getElementById("auth-error-message");
        if (messageElement) {
            messageElement.textContent = message;
        }
        openModal("auth-error-modal");
    });

    // Listen for token expiry events
    window.toolboxAPI.onTokenExpired(async (data: { connectionId: string; connectionName: string }) => {
        console.log("Token expired for connection:", data);

        // Show warning notification with re-authenticate button
        const toastHtml = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div><strong>Connection Token Expired</strong></div>
                <div>Your connection to "${data.connectionName}" has expired.</div>
                <button id="reauth-btn-${data.connectionId}" 
                        style="padding: 4px 12px; 
                               background: #0078d4; 
                               color: white; 
                               border: none; 
                               border-radius: 2px; 
                               cursor: pointer;
                               font-size: 12px;
                               margin-top: 4px;">
                    Re-authenticate
                </button>
            </div>
        `;

        const toast = toastr.warning(toastHtml, "", {
            timeOut: 30000, // Auto-dismiss after 30 seconds
            extendedTimeOut: 10000, // Extra 10 seconds if user hovers
            closeButton: true,
            tapToDismiss: false,
            escapeHtml: false,
        });

        // Add click handler for re-authenticate button
        setTimeout(() => {
            const reauthBtn = document.getElementById(`reauth-btn-${data.connectionId}`);
            if (reauthBtn) {
                reauthBtn.addEventListener("click", async () => {
                    toast.remove();
                    await handleReauthentication(data.connectionId);
                });
            }
        }, 100);

        // Reload connections to update UI with expired status
        await loadSidebarConnections();
        await updateFooterConnection();
    });

    // Set up loading screen listeners from main process
    window.api.on("show-loading-screen", (_event, message: string) => {
        const loadingScreen = document.getElementById("loading-screen");
        const loadingMessage = document.getElementById("loading-message");
        if (loadingScreen && loadingMessage) {
            loadingMessage.textContent = message || "Loading...";
            loadingScreen.style.display = "flex";
            loadingScreen.classList.remove("fade-out");
        }
    });

    window.api.on("hide-loading-screen", () => {
        const loadingScreen = document.getElementById("loading-screen");
        if (loadingScreen) {
            loadingScreen.classList.add("fade-out");
            setTimeout(() => {
                loadingScreen.style.display = "none";
            }, 200); // Match animation duration
        }
    });

    // Listen for toolbox events and react to them
    window.toolboxAPI.events.on((event: any, payload: any) => {
        console.log("ToolBox Event:", payload);

        // NOTE: With BrowserView, events are forwarded to tools via IPC through the toolPreloadBridge
        // No need to forward via postMessage as tools are in separate renderer processes
        // The backend ToolWindowManager handles event forwarding to BrowserView instances

        // Handle notifications using toastr
        if (payload.event === "notification:shown") {
            const notificationData = payload.data as { title: string; body: string; type?: string; duration?: number };
            const message = notificationData.body;
            const title = notificationData.title;
            const options = {
                timeOut: notificationData.duration || 5000,
            };

            // Show notification based on type
            switch (notificationData.type) {
                case "success":
                    toastr.success(message, title, options);
                    break;
                case "error":
                    toastr.error(message, title, options);
                    break;
                case "warning":
                    toastr.warning(message, title, options);
                    break;
                case "info":
                default:
                    toastr.info(message, title, options);
                    break;
            }
        }

        // Reload connections when connection events occur
        if (payload.event === "connection:created" || payload.event === "connection:updated" || payload.event === "connection:deleted") {
            console.log("Connection event detected, reloading connections...");
            loadSidebarConnections().catch((err) => console.error("Failed to reload sidebar connections:", err));
            updateFooterConnection().catch((err) => console.error("Failed to update footer connection:", err));
        }

        // Reload tools when tool events occur
        if (payload.event === "tool:loaded" || payload.event === "tool:unloaded") {
            console.log("Tool event detected, reloading tools...");
            loadSidebarTools().catch((err) => console.error("Failed to reload sidebar tools:", err));
        }

        // Handle terminal events
        if (payload.event === "terminal:created") {
            handleTerminalCreated(payload.data);
        } else if (payload.event === "terminal:closed") {
            handleTerminalClosed(payload.data);
        } else if (payload.event === "terminal:output") {
            handleTerminalOutput(payload.data);
        } else if (payload.event === "terminal:command:completed") {
            handleTerminalCommandCompleted(payload.data);
        } else if (payload.event === "terminal:error") {
            handleTerminalError(payload.data);
        }
    });

    // Set up terminal toggle button
    setupTerminalPanel();
}

// Start the application
document.addEventListener("DOMContentLoaded", init);
