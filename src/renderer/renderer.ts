// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="types.d.ts" />

// Tab management for multiple tools
interface OpenTool {
    id: string;
    tool: any;
    webviewContainer: HTMLElement;
    webview: any;
    isPinned: boolean;
}

const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null;

// Tools Management - Testing Only
const mockTools = [
    {
        id: "mock-entity-editor",
        name: "Entity Editor (Mock)",
        description: "Edit Dataverse entities and records - Test Tool",
        version: "1.0.0",
        author: "PowerPlatform ToolBox",
        icon: "📝",
        main: "index.js",
    },
    {
        id: "mock-solution-manager",
        name: "Solution Manager (Mock)",
        description: "Manage and deploy solutions - Test Tool",
        version: "1.2.3",
        author: "PowerPlatform ToolBox",
        icon: "📦",
        main: "index.js",
    },
    {
        id: "mock-plugin-tracer",
        name: "Plugin Trace Viewer (Mock)",
        description: "View and analyze plugin traces - Test Tool",
        version: "2.0.1",
        author: "PowerPlatform ToolBox",
        icon: "🔍",
        main: "index.js",
    },
];

// Tool library with predefined tools
const toolLibrary = [
    {
        id: "dvdt-erd-generator",
        name: "ERD Generator",
        description: "Generate Entity Relationship Diagrams for Dataverse",
        author: "Power Maverick",
        category: "Data Management",
    },
    {
        id: "@powerplatform/solution-manager",
        name: "Solution Manager",
        description: "Manage and deploy solutions",
        author: "PowerPlatform ToolBox",
        category: "Solutions",
    },
    {
        id: "@powerplatform/plugin-tracer",
        name: "Plugin Trace Viewer",
        description: "View and analyze plugin traces",
        author: "PowerPlatform ToolBox",
        category: "Development",
    },
    {
        id: "@powerplatform/bulk-data-tools",
        name: "Bulk Data Tools",
        description: "Import and export data in bulk",
        author: "PowerPlatform ToolBox",
        category: "Data Management",
    },
    {
        id: "@powerplatform/security-analyzer",
        name: "Security Analyzer",
        description: "Analyze security roles and permissions",
        author: "PowerPlatform ToolBox",
        category: "Security",
    },
];

// Navigation
function switchView(viewName: string) {
    const views = document.querySelectorAll(".view");
    const navItems = document.querySelectorAll(".nav-item");

    views.forEach((view) => {
        view.classList.remove("active");
    });

    navItems.forEach((item) => {
        item.classList.remove("active");
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add("active");
    }

    const targetNav = document.querySelector(`[data-view="${viewName}"]`);
    if (targetNav) {
        targetNav.classList.add("active");
    }
}

async function loadTools() {
    const toolsGrid = document.getElementById("tools-grid");
    if (!toolsGrid) return;

    let tools = await window.toolboxAPI.getAllTools();

    // Add mock tools for testing if no tools are installed
    if (tools.length === 0) {
        tools = mockTools;
    }

    if (tools.length === 0) {
        toolsGrid.innerHTML = `
            <div class="empty-state">
                <p>No tools installed yet.</p>
                <p class="empty-state-hint">Install tools from the tool library to get started.</p>
            </div>
        `;
        return;
    }

    toolsGrid.innerHTML = tools
        .map(
            (tool) => `
        <div class="tool-card">
            <div class="tool-card-header">
                <span class="tool-icon">${tool.icon || "🔧"}</span>
                <div>
                    <div class="tool-name">${tool.name}</div>
                </div>
            </div>
            <div class="tool-description">${tool.description}</div>
            <div class="tool-meta">
                <span>v${tool.version}</span>
                <span>${tool.author}</span>
            </div>
            <div class="tool-actions">
                <button class="btn btn-primary" data-action="launch" data-tool-id="${tool.id}">Launch</button>
                <button class="btn btn-secondary" data-action="settings" data-tool-id="${tool.id}">Settings</button>
                <button class="btn btn-danger" data-action="uninstall" data-tool-id="${tool.id}">Uninstall</button>
            </div>
        </div>
    `,
        )
        .join("");

    // Add event listeners to all tool action buttons
    toolsGrid.querySelectorAll(".tool-actions button").forEach((button) => {
        button.addEventListener("click", (e) => {
            const target = e.target as HTMLButtonElement;
            const action = target.getAttribute("data-action");
            const toolId = target.getAttribute("data-tool-id");
            if (!toolId) return;

            if (action === "launch") {
                launchTool(toolId);
            } else if (action === "settings") {
                toolSettings(toolId);
            } else if (action === "uninstall") {
                uninstallTool(toolId);
            }
        });
    });
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
            <button class="btn btn-primary" data-action="install-tool" data-package="${tool.id}" data-name="${tool.name}">Install</button>
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
        await window.toolboxAPI.showNotification({
            title: "Invalid Package",
            body: "Please select a valid tool to install.",
            type: "error",
        });
        return;
    }

    try {
        await window.toolboxAPI.showNotification({
            title: "Installing Tool",
            body: `Installing ${toolName}...`,
            type: "info",
        });

        await window.toolboxAPI.installTool(packageName);

        await window.toolboxAPI.showNotification({
            title: "Tool Installed",
            body: `${toolName} has been installed successfully.`,
            type: "success",
        });

        closeModal("install-tool-modal");
        await loadTools();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: "Installation Failed",
            body: `Failed to install ${toolName}: ${(error as Error).message}`,
            type: "error",
        });
    }
}

// Legacy function kept for compatibility - now opens tool library
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function installTool() {
    loadToolLibrary();
}

async function uninstallTool(toolId: string) {
    if (!confirm("Are you sure you want to uninstall this tool?")) {
        return;
    }

    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        await window.toolboxAPI.uninstallTool(tool.id, toolId);

        await window.toolboxAPI.showNotification({
            title: "Tool Uninstalled",
            body: `${tool.name} has been uninstalled.`,
            type: "success",
        });

        await loadTools();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: "Uninstall Failed",
            body: `Failed to uninstall tool: ${(error as Error).message}`,
            type: "error",
        });
    }
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
            window.toolboxAPI.showNotification({
                title: "Tool Launch Failed",
                body: `Tool ${toolId} not found`,
                type: "error",
            });
            return;
        }

        // Hide all views
        document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));

        // Show tool panel
        const toolPanel = document.getElementById("tool-panel");
        if (toolPanel) {
            toolPanel.style.display = "flex";
        }

        // Create webview container for this tool
        const toolPanelContent = document.getElementById("tool-panel-content");
        if (!toolPanelContent) return;

        const webviewContainer = document.createElement("div");
        webviewContainer.className = "tool-webview-container";
        webviewContainer.id = `tool-webview-${toolId}`;
        
        const toolWebview = document.createElement("webview") as any;
        toolWebview.style.width = "100%";
        toolWebview.style.height = "100%";
        
        // Set webview src - in real implementation, this would load the tool's UI
        // For mock tools, we'll create a simple welcome page
        const toolHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    html, body { 
                        height: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        padding: 40px; 
                        background: #f5f5f5;
                        box-sizing: border-box;
                    }
                    .tool-container {
                        max-width: 800px;
                        margin: 0 auto;
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    h1 { 
                        color: #0078d4; 
                        margin-top: 0;
                    }
                    .info { 
                        background: #e7f3ff; 
                        padding: 15px; 
                        border-radius: 4px; 
                        margin: 20px 0;
                        border-left: 4px solid #0078d4;
                    }
                    .metadata {
                        display: grid;
                        grid-template-columns: 150px 1fr;
                        gap: 10px;
                        margin: 20px 0;
                    }
                    .metadata-label {
                        font-weight: 600;
                        color: #605e5c;
                    }
                    .metadata-value {
                        color: #323130;
                    }
                </style>
            </head>
            <body>
                <div class="tool-container">
                    <h1>${tool.icon || "🔧"} ${tool.name}</h1>
                    <p>${tool.description || "No description available"}</p>
                    
                    <div class="info">
                        <strong>ℹ️ Tool Information</strong><br>
                        This is a ${tool.id.includes("mock") ? "mock" : "real"} tool running in the PowerPlatform ToolBox.
                    </div>
                    
                    <div class="metadata">
                        <div class="metadata-label">Version:</div>
                        <div class="metadata-value">${tool.version || "N/A"}</div>
                        
                        <div class="metadata-label">Author:</div>
                        <div class="metadata-value">${tool.author || "Unknown"}</div>
                        
                        <div class="metadata-label">Tool ID:</div>
                        <div class="metadata-value">${tool.id}</div>
                    </div>
                    
                    <p style="margin-top: 30px; color: #605e5c; font-size: 14px;">
                        In a production environment, this panel would load the tool's actual UI from its package.
                        The tool would have access to the ToolBox API for connections, settings, and other features.
                    </p>
                </div>
            </body>
            </html>
        `;

        // Use data URI to load content into webview
        toolWebview.src = "data:text/html;charset=utf-8," + encodeURIComponent(toolHtml);
        
        webviewContainer.appendChild(toolWebview);
        toolPanelContent.appendChild(webviewContainer);

        // Store the open tool
        openTools.set(toolId, {
            id: toolId,
            tool: tool,
            webviewContainer: webviewContainer,
            webview: toolWebview,
            isPinned: false
        });

        // Create and add tab
        createTab(toolId, tool);

        // Switch to the new tab
        switchToTool(toolId);

        // Save session after launching
        saveSession();

        window.toolboxAPI.showNotification({
            title: "Tool Launched",
            body: `${tool.name} opened in new tab`,
            type: "success",
        });

        console.log("Tool launched successfully:", tool.name);
    } catch (error) {
        console.error("Error launching tool:", error);
        window.toolboxAPI.showNotification({
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

    const icon = document.createElement("span");
    icon.className = "tool-tab-icon";
    icon.textContent = tool.icon || "🔧";

    const name = document.createElement("span");
    name.className = "tool-tab-name";
    name.textContent = tool.name;
    name.title = tool.name;

    const pinBtn = document.createElement("button");
    pinBtn.className = "tool-tab-pin";
    pinBtn.textContent = "📌";
    pinBtn.title = "Pin tab";
    
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

    tab.appendChild(icon);
    tab.appendChild(name);
    tab.appendChild(pinBtn);
    tab.appendChild(closeBtn);
    toolTabs.appendChild(tab);
}

function switchToTool(toolId: string) {
    if (!openTools.has(toolId)) return;

    // Update active tool ID
    activeToolId = toolId;

    // Update tab active states
    document.querySelectorAll(".tool-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    const activeTab = document.getElementById(`tool-tab-${toolId}`);
    if (activeTab) {
        activeTab.classList.add("active");
    }

    // Update webview container visibility
    document.querySelectorAll(".tool-webview-container").forEach(container => {
        container.classList.remove("active");
    });
    const activeContainer = document.getElementById(`tool-webview-${toolId}`);
    if (activeContainer) {
        activeContainer.classList.add("active");
    }
}

function closeTool(toolId: string) {
    const openTool = openTools.get(toolId);
    if (!openTool) return;

    // Check if tab is pinned
    if (openTool.isPinned) {
        window.toolboxAPI.showNotification({
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

    // Remove webview container
    openTool.webviewContainer.remove();

    // Remove from open tools
    openTools.delete(toolId);

    // Save session after closing
    saveSession();

    // If this was the active tool, switch to another tool or close the panel
    if (activeToolId === toolId) {
        if (openTools.size > 0) {
            // Switch to the last tool in the list
            const lastToolId = Array.from(openTools.keys())[openTools.size - 1];
            switchToTool(lastToolId);
        } else {
            // No more tools open, hide the tool panel
            const toolPanel = document.getElementById("tool-panel");
            if (toolPanel) {
                toolPanel.style.display = "none";
            }
            activeToolId = null;
            // Show tools view again
            switchView("tools");
        }
    }
}

function closeAllTools() {
    // Close all tools
    const toolIds = Array.from(openTools.keys());
    toolIds.forEach(toolId => {
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
        if (openTool.isPinned) {
            tab.classList.add("pinned");
        } else {
            tab.classList.remove("pinned");
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
    document.querySelectorAll(".tool-tab").forEach(t => {
        t.classList.remove("over");
    });
}

// Session management - save and restore
function saveSession() {
    const session = {
        openTools: Array.from(openTools.entries()).map(([id, tool]) => ({
            id,
            isPinned: tool.isPinned,
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

async function toolSettings(toolId: string) {
    try {
        console.log("Opening settings for tool:", toolId);

        // Get the tool and its current settings
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            window.toolboxAPI.showNotification({
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
        window.toolboxAPI.showNotification({
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
        const connections = await window.toolboxAPI.getConnections();
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
                                ? '<button class="btn btn-secondary" data-action="disconnect">Disconnect</button>'
                                : '<button class="btn btn-primary" data-action="connect" data-connection-id="' + conn.id + '">Connect</button>'
                        }
                        <button class="btn btn-danger" data-action="delete" data-connection-id="${conn.id}">Delete</button>
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
                const target = e.target as HTMLButtonElement;
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
        statusElement.textContent = `Connected to: ${connection.name} (${connection.environment})`;
        statusElement.className = "connection-status connected";
    } else {
        statusElement.textContent = "No active connection";
        statusElement.className = "connection-status";
    }
}

async function connectToConnection(id: string) {
    try {
        await window.toolboxAPI.setActiveConnection(id);
        await window.toolboxAPI.showNotification({
            title: "Connected",
            body: "Successfully connected to Dataverse environment.",
            type: "success",
        });
        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: "Connection Failed",
            body: (error as Error).message,
            type: "error",
        });
    }
}

async function disconnectConnection() {
    try {
        await window.toolboxAPI.disconnectConnection();
        await window.toolboxAPI.showNotification({
            title: "Disconnected",
            body: "Disconnected from Dataverse environment.",
            type: "info",
        });
        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: "Disconnect Failed",
            body: (error as Error).message,
            type: "error",
        });
    }
}

async function addConnection() {
    const nameInput = document.getElementById("connection-name") as HTMLInputElement;
    const urlInput = document.getElementById("connection-url") as HTMLInputElement;
    const environmentSelect = document.getElementById("connection-environment") as HTMLSelectElement;
    const clientIdInput = document.getElementById("connection-client-id") as HTMLInputElement;
    const tenantIdInput = document.getElementById("connection-tenant-id") as HTMLInputElement;

    // Check if all elements exist
    if (!nameInput || !urlInput || !environmentSelect) {
        console.error("Connection form elements not found");
        await window.toolboxAPI.showNotification({
            title: "Error",
            body: "Connection form not properly initialized.",
            type: "error",
        });
        return;
    }

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const environment = environmentSelect.value as "Dev" | "Test" | "UAT" | "Production";
    const clientId = clientIdInput?.value.trim() || "";
    const tenantId = tenantIdInput?.value.trim() || "";

    if (!name || !url) {
        await window.toolboxAPI.showNotification({
            title: "Invalid Input",
            body: "Please provide both connection name and URL.",
            type: "error",
        });
        return;
    }

    const connection = {
        id: Date.now().toString(),
        name,
        url,
        environment,
        clientId: clientId || undefined,
        tenantId: tenantId || undefined,
        createdAt: new Date().toISOString(),
        isActive: false,
    };

    try {
        console.log("Adding connection:", connection);
        await window.toolboxAPI.addConnection(connection);

        await window.toolboxAPI.showNotification({
            title: "Connection Added",
            body: `Connection "${name}" has been added.`,
            type: "success",
        });

        // Clear form
        nameInput.value = "";
        urlInput.value = "";
        environmentSelect.value = "Dev";
        if (clientIdInput) clientIdInput.value = "";
        if (tenantIdInput) tenantIdInput.value = "";

        closeModal("add-connection-modal");
        await loadConnections();
    } catch (error) {
        console.error("Error adding connection:", error);
        await window.toolboxAPI.showNotification({
            title: "Failed to Add Connection",
            body: (error as Error).message,
            type: "error",
        });
    }
}

async function deleteConnection(id: string) {
    console.log("deleteConnection called with id:", id);
    if (!confirm("Are you sure you want to delete this connection?")) {
        return;
    }

    try {
        console.log("Calling window.toolboxAPI.deleteConnection");
        await window.toolboxAPI.deleteConnection(id);

        await window.toolboxAPI.showNotification({
            title: "Connection Deleted",
            body: "The connection has been deleted.",
            type: "success",
        });

        await loadConnections();
    } catch (error) {
        console.error("Error deleting connection:", error);
        await window.toolboxAPI.showNotification({
            title: "Failed to Delete Connection",
            body: (error as Error).message,
            type: "error",
        });
    }
}

// Settings Management
async function loadSettings() {
    const settings = await window.toolboxAPI.getUserSettings();

    const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById("auto-update-check") as HTMLInputElement;

    if (themeSelect) themeSelect.value = settings.theme;
    if (autoUpdateCheck) autoUpdateCheck.checked = settings.autoUpdate;

    // Load app version
    const version = await window.toolboxAPI.getAppVersion();
    const versionElement = document.getElementById("app-version");
    if (versionElement) {
        versionElement.textContent = version;
    }

    // Apply current theme
    applyTheme(settings.theme);
}

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
}

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

    await window.toolboxAPI.showNotification({
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
    }
}

// Initialize the application
async function init() {
    // Sidebar toggle
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const sidebar = document.getElementById("sidebar");
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
        });
    }

    // Set up navigation
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            const view = item.getAttribute("data-view");
            if (view) {
                switchView(view);
                if (view === "tools") loadTools();
                if (view === "connections") loadConnections();
                if (view === "settings") loadSettings();
            }
        });
    });

    // Tool panel close all button
    const closeAllToolsBtn = document.getElementById("close-all-tools");
    if (closeAllToolsBtn) {
        closeAllToolsBtn.addEventListener("click", () => {
            closeAllTools();
        });
    }

    // Install tool modal
    const installToolBtn = document.getElementById("install-tool-btn");
    if (installToolBtn) {
        installToolBtn.addEventListener("click", () => {
            openModal("install-tool-modal");
            loadToolLibrary();
        });
    }

    const closeInstallModal = document.getElementById("close-install-modal");
    if (closeInstallModal) {
        closeInstallModal.addEventListener("click", () => closeModal("install-tool-modal"));
    }

    const cancelInstallBtn = document.getElementById("cancel-install-btn");
    if (cancelInstallBtn) {
        cancelInstallBtn.addEventListener("click", () => closeModal("install-tool-modal"));
    }

    // Add connection modal
    const addConnectionBtn = document.getElementById("add-connection-btn");
    if (addConnectionBtn) {
        addConnectionBtn.addEventListener("click", () => openModal("add-connection-modal"));
    }

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

    // Tool settings modal
    const closeToolSettingsModal = document.getElementById("close-tool-settings-modal");
    if (closeToolSettingsModal) {
        closeToolSettingsModal.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    const cancelToolSettingsBtn = document.getElementById("cancel-tool-settings-btn");
    if (cancelToolSettingsBtn) {
        cancelToolSettingsBtn.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    // Settings save button
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener("click", saveSettings);
    }

    // Auto-update button handler
    const checkUpdatesBtn = document.getElementById("check-updates-btn");
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener("click", checkForUpdates);
    }

    // Set up auto-update listeners
    setupAutoUpdateListeners();

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();

    // Load initial data
    await loadTools();

    // Restore previous session
    await restoreSession();

    // Listen for toolbox events and react to them
    window.toolboxAPI.onToolboxEvent((event: any, payload: any) => {
        console.log("ToolBox Event:", payload);

        // Reload connections when connection events occur
        if (payload.event === "connection:created" || payload.event === "connection:updated" || payload.event === "connection:deleted") {
            console.log("Connection event detected, reloading connections...");
            loadConnections().catch((err) => console.error("Failed to reload connections:", err));
        }

        // Reload tools when tool events occur
        if (payload.event === "tool:loaded" || payload.event === "tool:unloaded") {
            console.log("Tool event detected, reloading tools...");
            loadTools().catch((err) => console.error("Failed to reload tools:", err));
        }
    });
}

// Start the application
document.addEventListener("DOMContentLoaded", init);
