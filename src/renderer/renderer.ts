// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="types.d.ts" />

// Tab management for multiple tools
interface OpenTool {
    id: string;
    tool: any;
    webviewContainer: HTMLElement;
    webview: any;
    isPinned: boolean;
    connectionId: string | null;
}

const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null;
let secondaryToolId: string | null = null;
let isSplitView = false;

// Set up message handler for iframe communication
window.addEventListener("message", async (event) => {
    // Handle toolboxAPI calls from iframes
    if (event.data.type === "TOOLBOX_API_CALL") {
        const { messageId, method, args } = event.data;

        try {
            // Call the actual toolboxAPI method
            const result = await (window.toolboxAPI as any)[method](...(args || []));

            // Send response back to iframe
            event.source?.postMessage(
                {
                    type: "TOOLBOX_API_RESPONSE",
                    messageId,
                    result,
                },
                "*" as any,
            );
        } catch (error) {
            // Send error back to iframe
            event.source?.postMessage(
                {
                    type: "TOOLBOX_API_RESPONSE",
                    messageId,
                    error: (error as Error).message,
                },
                "*" as any,
            );
        }
    }
});

// Tool library will be loaded from tools.json
let toolLibrary: any[] = [];

// Load tools.json
async function loadToolsLibrary() {
    try {
        const response = await fetch("tools.json");
        toolLibrary = await response.json();
    } catch (error) {
        console.error("Failed to load tools.json:", error);
        toolLibrary = [];
    }
}

// Navigation - No longer needed since we removed the main view switching
// Tools are now managed via the sidebar only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function switchView(viewName: string) {
    // Deprecated - keeping for backwards compatibility but no longer used
    console.log("switchView is deprecated:", viewName);
}

// Update split view button visibility based on number of open tabs
function updateSplitViewButtonVisibility() {
    const splitViewBtn = document.getElementById("split-view-btn");
    if (splitViewBtn) {
        if (openTools.size >= 2) {
            splitViewBtn.style.display = "block";
        } else {
            splitViewBtn.style.display = "none";
        }
    }
}

// Update footer connection information
async function updateFooterConnection() {
    const footerConnectionName = document.getElementById("footer-connection-name");
    const footerChangeBtn = document.getElementById("footer-change-connection-btn");

    if (!footerConnectionName) return;

    try {
        const activeConn = await window.toolboxAPI.getActiveConnection();

        if (activeConn) {
            footerConnectionName.textContent = `${activeConn.name} (${activeConn.environment})`;
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

async function loadTools() {
    // This function is no longer used for the main view
    // Tools are now displayed in the sidebar only
    // Keeping for backwards compatibility
    console.log("loadTools is deprecated - tools are now managed in sidebar");
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
            <fluent-button appearance="primary" data-action="install-tool" data-package="${tool.id}" data-name="${tool.name}">Install</fluent-button>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        // Get active connection for passing to tool
        const activeConnection = await window.toolboxAPI.getActiveConnection();
        const connectionUrl = activeConnection?.url;
        const accessToken = activeConnection?.accessToken; // This would come from auth flow

        // Get tool HTML without context injection (to avoid CSP issues)
        const webviewHtml = await window.toolboxAPI.getToolWebviewHtml(tool.id);

        // Get tool context separately for postMessage
        const toolContext = await window.toolboxAPI.getToolContext(tool.id, connectionUrl, accessToken);

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

        // Create webview container for this tool
        const toolPanelContent = document.getElementById("tool-panel-content");
        if (!toolPanelContent) return;

        const webviewContainer = document.createElement("div");
        webviewContainer.className = "tool-webview-container";
        webviewContainer.id = `tool-webview-${toolId}`;

        // Default HTML for tools that fail to load
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
                color: #d83b01; 
                margin-top: 0;
                }
                .error {
                background: #fde7e9;
                padding: 15px;
                border-radius: 4px;
                margin: 20px 0;
                border-left: 4px solid #d83b01;
                color: #a4262c;
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
                <h1>⚠️ Error Loading Tool</h1>
                <div class="error">
                <strong>Unable to load the contents of this tool.</strong><br>
                Please reach out to the tool author for support.<br>
                <span style="font-size: 13px;">Author: ${tool.author || "Unknown"}</span>
                </div>
                <div class="metadata">
                <div class="metadata-label">Tool Name:</div>
                <div class="metadata-value">${tool.name}</div>
                <div class="metadata-label">Tool ID:</div>
                <div class="metadata-value">${tool.id}</div>
                <div class="metadata-label">Version:</div>
                <div class="metadata-value">${tool.version || "N/A"}</div>
                </div>
            </div>
            </body>
            </html>
        `;

        const toolIframe = document.createElement("iframe");
        toolIframe.style.width = "100%";
        toolIframe.style.height = "100%";
        toolIframe.style.border = "none";
        toolIframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");

        // Inject script tag to load external bridge file (avoids CSP violation)
        let injectedHtml = webviewHtml || toolHtml;

        // Get the absolute path to the bridge script
        // The main renderer runs from dist/renderer/, so we use that as base
        const bridgePath = window.location.href.replace(/[^/]*$/, "toolboxAPIBridge.js");
        const bridgeScriptTag = `<script src="${bridgePath}"></script>`;

        // Inject the script tag before the closing </head> tag or at the beginning of <body>
        if (injectedHtml.includes("</head>")) {
            injectedHtml = injectedHtml.replace("</head>", bridgeScriptTag + "</head>");
        } else if (injectedHtml.includes("<body>")) {
            injectedHtml = injectedHtml.replace("<body>", "<body>" + bridgeScriptTag);
        } else {
            // If no head or body tags, prepend the script
            injectedHtml = bridgeScriptTag + injectedHtml;
        }

        // Set up event listener to post context after iframe loads
        toolIframe.addEventListener("load", () => {
            if (toolIframe.contentWindow) {
                // Post the TOOLBOX_CONTEXT to the iframe after a short delay to ensure bridge is loaded
                setTimeout(() => {
                    if (toolIframe.contentWindow) {
                        toolIframe.contentWindow.postMessage(
                            {
                                type: "TOOLBOX_CONTEXT",
                                data: toolContext,
                            },
                            "*",
                        );
                    }
                }, 100);
            }
        });

        // Use srcdoc to load content into iframe
        // This allows the HTML to execute properly and fire DOMContentLoaded
        toolIframe.srcdoc = injectedHtml;

        webviewContainer.appendChild(toolIframe);
        toolPanelContent.appendChild(webviewContainer);

        // Store the open tool
        openTools.set(toolId, {
            id: toolId,
            tool: tool,
            webviewContainer: webviewContainer,
            webview: toolIframe,
            isPinned: false,
            connectionId: null,
        });

        // Create and add tab
        createTab(toolId, tool);

        // Switch to the new tab
        switchToTool(toolId);

        // Update split view button visibility
        updateSplitViewButtonVisibility();

        // Update footer connection
        updateFooterConnection();

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

    const connectionBadge = document.createElement("span");
    connectionBadge.className = "tool-tab-connection";
    connectionBadge.id = `tab-connection-${toolId}`;
    connectionBadge.textContent = "🔗";
    connectionBadge.title = "No connection";
    connectionBadge.style.display = "none";

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
    tab.appendChild(connectionBadge);
    tab.appendChild(pinBtn);
    tab.appendChild(closeBtn);
    toolTabs.appendChild(tab);
}

function switchToTool(toolId: string) {
    if (!openTools.has(toolId)) return;

    if (isSplitView) {
        // In split view, determine if this should be primary or secondary
        // If it's the secondary tool, keep it there, otherwise make it primary
        if (toolId === secondaryToolId) {
            // Just highlight it, don't move
            updateSplitViewDisplay();
        } else {
            // Set as primary
            activeToolId = toolId;
            updateSplitViewDisplay();
        }
    } else {
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

        // Update webview container visibility
        document.querySelectorAll(".tool-webview-container").forEach((container) => {
            container.classList.remove("active");
        });
        const activeContainer = document.getElementById(`tool-webview-${toolId}`);
        if (activeContainer) {
            activeContainer.classList.add("active");
        }
    }

    // Update footer connection (no longer updating connection selector)
    updateFooterConnection();
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

    // Update split view button visibility
    updateSplitViewButtonVisibility();

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

// Connection management for tabs
// Legacy function - no longer used since connection selector was removed from header
// Keeping for backwards compatibility in case needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateConnectionSelector() {
    const selector = document.getElementById("tab-connection-selector") as HTMLSelectElement;
    if (!selector) return;

    try {
        const connections = await window.toolboxAPI.getConnections();

        // Clear and repopulate
        selector.innerHTML = '<option value="">No Connection</option>';
        connections.forEach((conn: any) => {
            const option = document.createElement("option");
            option.value = conn.id;
            option.textContent = `${conn.name} (${conn.environment})`;
            selector.appendChild(option);
        });

        // Set current selection
        if (activeToolId && openTools.has(activeToolId)) {
            const tool = openTools.get(activeToolId);
            if (tool && tool.connectionId) {
                selector.value = tool.connectionId;
            } else {
                selector.value = "";
            }
        }
    } catch (error) {
        console.error("Failed to update connection selector:", error);
    }
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

// Split view management
function toggleSplitView() {
    isSplitView = !isSplitView;
    const wrapper = document.getElementById("tool-panel-content-wrapper");

    if (!wrapper) return;

    if (isSplitView) {
        wrapper.classList.add("split-view");

        // If there are at least 2 tools, show the second tool in secondary panel
        const toolIds = Array.from(openTools.keys());
        if (toolIds.length >= 2) {
            // Set secondary to first non-active tool
            const secondaryId = toolIds.find((id) => id !== activeToolId) || toolIds[0];
            setSecondaryTool(secondaryId);
        }

        window.toolboxAPI.showNotification({
            title: "Split View Enabled",
            body: "Click on tabs to switch between primary and secondary panel",
            type: "success",
        });
    } else {
        wrapper.classList.remove("split-view");
        secondaryToolId = null;

        // Move all tools back to primary panel
        const primaryPanel = document.getElementById("tool-panel-content");
        if (primaryPanel) {
            openTools.forEach((tool) => {
                if (tool.webviewContainer.parentElement !== primaryPanel) {
                    primaryPanel.appendChild(tool.webviewContainer);
                }
            });
        }
    }

    updateSplitViewDisplay();
}

function setSecondaryTool(toolId: string) {
    if (!openTools.has(toolId)) return;

    secondaryToolId = toolId;
    updateSplitViewDisplay();
}

function updateSplitViewDisplay() {
    if (!isSplitView) return;

    const primaryPanel = document.getElementById("tool-panel-content");
    const secondaryPanel = document.getElementById("tool-panel-content-secondary");

    if (!primaryPanel || !secondaryPanel) return;

    // Move tools to appropriate panels
    openTools.forEach((tool, toolId) => {
        if (toolId === activeToolId) {
            if (tool.webviewContainer.parentElement !== primaryPanel) {
                primaryPanel.appendChild(tool.webviewContainer);
            }
            tool.webviewContainer.classList.add("active");
        } else if (toolId === secondaryToolId) {
            if (tool.webviewContainer.parentElement !== secondaryPanel) {
                secondaryPanel.appendChild(tool.webviewContainer);
            }
            tool.webviewContainer.classList.add("active");
        } else {
            tool.webviewContainer.classList.remove("active");
        }
    });

    // Update tab indicators
    document.querySelectorAll(".tool-tab").forEach((tab) => {
        const toolId = tab.getAttribute("data-tool-id");
        tab.classList.remove("active", "secondary-active");

        if (toolId === activeToolId) {
            tab.classList.add("active");
        } else if (toolId === secondaryToolId) {
            tab.classList.add("secondary-active");
        }
    });
}

function setupResizeHandle() {
    const handle = document.getElementById("resize-handle");
    const wrapper = document.getElementById("tool-panel-content-wrapper");
    const primaryPanel = document.getElementById("tool-panel-content");

    if (!handle || !wrapper || !primaryPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener("mousedown", (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = primaryPanel.offsetWidth;
        document.body.style.cursor = "col-resize";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;

        const diff = e.clientX - startX;
        const newWidth = startWidth + diff;
        const wrapperWidth = wrapper.offsetWidth;
        const percentage = (newWidth / wrapperWidth) * 100;

        if (percentage >= 20 && percentage <= 80) {
            primaryPanel.style.flex = `0 0 ${percentage}%`;
            const secondaryPanel = document.getElementById("tool-panel-content-secondary");
            if (secondaryPanel) {
                secondaryPanel.style.flex = `0 0 ${100 - percentage}%`;
            }
        }
    });

    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "";
        }
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                                ? '<fluent-button appearance="secondary" data-action="disconnect">Disconnect</fluent-button>'
                                : '<fluent-button appearance="primary" data-action="connect" data-connection-id="' + conn.id + '">Connect</fluent-button>'
                        }
                        <fluent-button appearance="secondary" data-action="delete" data-connection-id="${conn.id}">Delete</fluent-button>
                    </div>
                </div>
                <div class="connection-url">${conn.url}</div>
                <div class="connection-meta">Created: ${new Date(conn.createdAt).toLocaleDateString()}</div>
            </div>
        `,
            )
            .join("");

        // Add event listeners to all connection action buttons
        connectionsList.querySelectorAll(".connection-actions fluent-button, .connection-actions button").forEach((button) => {
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
            body: "Successfully authenticated and connected to the environment.",
            type: "success",
        });
        await loadConnections();
        await loadSidebarConnections();
        await updateFooterConnection();
    } catch (error) {
        await window.toolboxAPI.showNotification({
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
        await window.toolboxAPI.disconnectConnection();
        await window.toolboxAPI.showNotification({
            title: "Disconnected",
            body: "Disconnected from environment.",
            type: "info",
        });
        await loadConnections();
        await loadSidebarConnections();
        await updateFooterConnection();
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
    const authenticationType = authTypeSelect.value as "interactive" | "clientSecret" | "usernamePassword";

    if (!name || !url) {
        await window.toolboxAPI.showNotification({
            title: "Invalid Input",
            body: "Please provide both connection name and URL.",
            type: "error",
        });
        return;
    }

    // Validate based on authentication type
    if (authenticationType === "clientSecret") {
        if (!clientIdInput?.value.trim() || !clientSecretInput?.value.trim() || !tenantIdInput?.value.trim()) {
            await window.toolboxAPI.showNotification({
                title: "Invalid Input",
                body: "Client ID, Client Secret, and Tenant ID are required for Client ID/Secret authentication.",
                type: "error",
            });
            return;
        }
    } else if (authenticationType === "usernamePassword") {
        if (!usernameInput?.value.trim() || !passwordInput?.value.trim()) {
            await window.toolboxAPI.showNotification({
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
        await window.toolboxAPI.showNotification({
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
        await window.toolboxAPI.showNotification({
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
            await window.toolboxAPI.showNotification({
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
            await window.toolboxAPI.showNotification({
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
        const result = await window.toolboxAPI.testConnection(testConn);

        if (result.success) {
            await window.toolboxAPI.showNotification({
                title: "Connection Successful",
                body: "Successfully connected to the environment!",
                type: "success",
            });
        } else {
            await window.toolboxAPI.showNotification({
                title: "Connection Failed",
                body: result.error || "Failed to connect to the environment.",
                type: "error",
            });
        }
    } catch (error) {
        await window.toolboxAPI.showNotification({
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
// Legacy loadSettings function - kept for backwards compatibility if full settings view is needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // Check for updates for all tools
    const toolsWithUpdateInfo = await Promise.all(
        tools.map(async (tool) => {
            const latestVersion = await window.toolboxAPI.getLatestToolVersion(tool.id);
            const hasUpdate = latestVersion && latestVersion !== tool.version;
            return { ...tool, latestVersion, hasUpdate };
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

    toolsList.innerHTML = filteredTools
        .map(
            (tool) => `
        <div class="tool-item-vscode" data-tool-id="${tool.id}">
            <div class="tool-item-header-vscode">
                <span class="tool-item-icon-vscode">${tool.icon || "🔧"}</span>
                <div class="tool-item-name-vscode">
                    ${tool.name}
                    ${tool.hasUpdate ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                </div>
            </div>
            <div class="tool-item-description-vscode">${tool.description}</div>
            <div class="tool-item-version-vscode">
                v${tool.version}${tool.hasUpdate ? ` → v${tool.latestVersion}` : ""}
            </div>
            <div class="tool-item-actions-vscode">
                ${tool.hasUpdate ? `<fluent-button appearance="secondary" data-action="update" data-tool-id="${tool.id}" title="Update to v${tool.latestVersion}">Update</fluent-button>` : ""}
                <fluent-button appearance="primary" data-action="launch" data-tool-id="${tool.id}">Launch</fluent-button>
                <button class="tool-item-delete-btn" data-action="delete" data-tool-id="${tool.id}" title="Uninstall tool">
                    <img src="icons/trash.svg" alt="Delete" />
                </button>
            </div>
        </div>
    `,
        )
        .join("");

    // Add event listeners
    toolsList.querySelectorAll(".tool-item-vscode").forEach((item) => {
        item.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "BUTTON" || target.tagName === "FLUENT-BUTTON") return; // Button click will handle

            const toolId = item.getAttribute("data-tool-id");
            if (toolId) {
                launchTool(toolId);
            }
        });
    });

    toolsList.querySelectorAll(".tool-item-actions-vscode button, .tool-item-actions-vscode fluent-button").forEach((button) => {
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

        await window.toolboxAPI.showNotification({
            title: "Tool Uninstalled",
            body: `${tool.name} has been uninstalled.`,
            type: "success",
        });

        // Reload the sidebar tools
        await loadSidebarTools();

        // Reload marketplace to update installed status
        await loadMarketplace();
    } catch (error) {
        await window.toolboxAPI.showNotification({
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

        await window.toolboxAPI.showNotification({
            title: "Updating Tool",
            body: `Updating ${tool.name}...`,
            type: "info",
        });

        const updatedTool = await window.toolboxAPI.updateTool(tool.id);

        await window.toolboxAPI.showNotification({
            title: "Tool Updated",
            body: `${tool.name} has been updated to v${updatedTool.version}.`,
            type: "success",
        });

        // Reload the sidebar tools to show new version
        await loadSidebarTools();

        // Reload marketplace to update version display
        await loadMarketplace();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: "Update Failed",
            body: `Failed to update tool: ${(error as Error).message}`,
            type: "error",
        });
    }
}

async function loadSidebarConnections() {
    const connectionsList = document.getElementById("sidebar-connections-list");
    if (!connectionsList) return;

    try {
        const connections = await window.toolboxAPI.getConnections();

        if (connections.length === 0) {
            connectionsList.innerHTML = `
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p class="empty-state-hint">Add a connection to get started.</p>
                </div>
            `;
            return;
        }

        connectionsList.innerHTML = connections
            .map(
                (conn: any) => `
            <div class="connection-item-vscode ${conn.isActive ? "active" : ""}">
                <div class="connection-item-header-vscode">
                    <div class="connection-item-name-vscode">${conn.name}</div>
                    <span class="connection-env-pill env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                </div>
                <div class="connection-item-url-vscode">${conn.url}</div>
                <div class="connection-item-actions-vscode" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        ${
                            conn.isActive
                                ? `<fluent-button appearance="secondary" data-action="disconnect">Disconnect</fluent-button>`
                                : `<fluent-button appearance="primary" data-action="connect" data-connection-id="${conn.id}">Connect</fluent-button>`
                        }
                    </div>
                    <button class="btn btn-icon" data-action="delete" data-connection-id="${conn.id}" style="color: #d83b01;" title="Delete connection">
                        <img src="icons/trash.svg" alt="Delete" style="width:16px; height:16px;" />
                    </button>
                </div>
            </div>
        `,
            )
            .join("");

        // Add event listeners
        connectionsList.querySelectorAll("button, fluent-button").forEach((button) => {
            button.addEventListener("click", async (e) => {
                const target = e.target as HTMLButtonElement;
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
                } else if (action === "delete" && connectionId) {
                    if (confirm("Are you sure you want to delete this connection?")) {
                        await window.toolboxAPI.deleteConnection(connectionId);
                        loadSidebarConnections();
                        updateFooterConnection();
                    }
                }
            });
        });
    } catch (error) {
        console.error("Failed to load connections:", error);
    }
}

async function loadMarketplace() {
    const marketplaceList = document.getElementById("marketplace-tools-list");
    if (!marketplaceList) return;

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

    marketplaceList.innerHTML = filteredTools
        .map((tool) => {
            const installedTool = installedToolsMap.get(tool.id);
            const isInstalled = !!installedTool;
            const hasUpdate = isInstalled && installedTool.version && tool.version && tool.version !== installedTool.version;

            return `
        <div class="marketplace-item-vscode ${isInstalled ? "installed" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-header-vscode">
                <div class="marketplace-item-info-vscode">
                    <div class="marketplace-item-name-vscode">
                        ${tool.name}
                        ${isInstalled ? '<span class="marketplace-item-installed-badge">Installed</span>' : ""}
                        ${hasUpdate ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                    </div>
                    <div class="marketplace-item-author-vscode">by ${tool.author}</div>
                </div>
            </div>
            <div class="marketplace-item-description-vscode">${tool.description}</div>
            <div class="marketplace-item-footer-vscode">
                <span class="marketplace-item-category-vscode">${tool.category}</span>
                ${tool.version ? `<span class="marketplace-item-version-vscode">v${tool.version}${hasUpdate ? ` (installed: v${installedTool.version})` : ""}</span>` : ""}
                <div class="marketplace-item-actions-vscode">
                    ${!isInstalled ? `<fluent-button appearance="primary" data-action="install" data-tool-id="${tool.id}">Install</fluent-button>` : ""}
                    ${hasUpdate ? `<fluent-button appearance="secondary" data-action="update" data-tool-id="${tool.id}">Update</fluent-button>` : ""}
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
            if (target.tagName === "BUTTON" || target.tagName === "FLUENT-BUTTON") return;

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
    marketplaceList.querySelectorAll(".marketplace-item-actions-vscode button, .marketplace-item-actions-vscode fluent-button").forEach((button) => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation(); // Prevent opening detail modal
            const target = e.target as any; // Can be HTMLButtonElement or fluent-button
            const action = target.getAttribute("data-action");
            const toolId = target.getAttribute("data-tool-id");
            if (!toolId) return;

            if (action === "install") {
                target.disabled = true;
                target.textContent = "Installing...";

                try {
                    await window.toolboxAPI.installTool(toolId);

                    window.toolboxAPI.showNotification({
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
                    window.toolboxAPI.showNotification({
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

                    window.toolboxAPI.showNotification({
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
                    window.toolboxAPI.showNotification({
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

                    window.toolboxAPI.showNotification({
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
                    window.toolboxAPI.showNotification({
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

        if (tool.readmeUrl) {
            try {
                const response = await fetch(tool.readmeUrl);
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

async function loadSidebarSettings() {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element

    if (themeSelect && autoUpdateCheck) {
        const settings = await window.toolboxAPI.getUserSettings();
        themeSelect.value = settings.theme;
        autoUpdateCheck.checked = settings.autoUpdate;
    }
}

async function saveSidebarSettings() {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element

    if (!themeSelect || !autoUpdateCheck) return;

    const settings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
    };

    await window.toolboxAPI.updateUserSettings(settings);
    applyTheme(settings.theme);

    await window.toolboxAPI.showNotification({
        title: "Settings Saved",
        body: "Your settings have been saved.",
        type: "success",
    });
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

    // Split view button
    const splitViewBtn = document.getElementById("split-view-btn");
    if (splitViewBtn) {
        splitViewBtn.addEventListener("click", () => {
            toggleSplitView();
        });
    }

    // Set up resize handle
    setupResizeHandle();

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

    // Add change listener for theme selector to apply immediately
    const themeSelect = document.getElementById("sidebar-theme-select");
    if (themeSelect) {
        themeSelect.addEventListener("change", async () => {
            const theme = (themeSelect as any).value;
            if (theme) {
                await window.toolboxAPI.updateUserSettings({ theme });
                applyTheme(theme);
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
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/docs/TOOL_DEVELOPMENT.md");
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
            window.toolboxAPI.openExternal("https://github.com/PowerPlatform-ToolBox/desktop-app/blob/main/docs/TOOL_DEVELOPMENT.md");
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

    // Load tools library from JSON
    await loadToolsLibrary();

    // Load initial sidebar content (tools by default)
    await loadSidebarTools();
    await loadMarketplace();

    // Load initial data - tools view is deprecated, no need to load
    // await loadTools();

    // Update footer connection info
    await updateFooterConnection();

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

    // Listen for toolbox events and react to them
    window.toolboxAPI.onToolboxEvent((event: any, payload: any) => {
        console.log("ToolBox Event:", payload);

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
    });
}

// Start the application
document.addEventListener("DOMContentLoaded", init);
