/**
 * Tool management module
 * Handles tool launching, tabs, sessions, and lifecycle
 */

import type { OpenTool, SessionData } from "../types";
import { updatePinIconsForTheme } from "./themeManagement";

// Tool state
const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null;
let draggedTab: HTMLElement | null = null;

/**
 * Get all open tools
 */
export function getOpenTools(): Map<string, OpenTool> {
    return openTools;
}

/**
 * Get active tool ID
 */
export function getActiveToolId(): string | null {
    return activeToolId;
}

/**
 * Update UI button visibility based on number of open tabs
 */
export function updateToolbarButtonVisibility(): void {
    // No special buttons to show/hide currently
    // Keeping this function for future toolbar features
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
                const directiveName = directive.replace("-src", "").replace("-", " ");
                exceptionsHtml += `
                    <div class="csp-exception">
                        <strong>${directiveName}:</strong>
                        <ul>
                            ${sources.map((source: string) => `<li><code>${source}</code></li>`).join("")}
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
                        <strong>${tool.name}</strong> by <em>${tool.author || "Unknown"}</em> 
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

/**
 * Launch a tool by ID
 */
export async function launchTool(toolId: string): Promise<void> {
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

/**
 * Create a tab for a tool
 */
export function createTab(toolId: string, tool: any): void {
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

/**
 * Switch to a tool tab
 */
export function switchToTool(toolId: string): void {
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
}

/**
 * Close a tool
 */
export function closeTool(toolId: string): void {
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

/**
 * Close all tools
 */
export function closeAllTools(): void {
    // Close all tools
    const toolIds = Array.from(openTools.keys());
    toolIds.forEach((toolId) => {
        closeTool(toolId);
    });
}

/**
 * Toggle pin state for a tab
 */
export function togglePinTab(toolId: string): void {
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

/**
 * Drag and drop handlers for tab reordering
 */
function handleDragStart(e: DragEvent, tab: HTMLElement): void {
    draggedTab = tab;
    tab.classList.add("dragging");
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", tab.innerHTML);
    }
}

function handleDragOver(e: DragEvent, tab: HTMLElement): false {
    if (e.preventDefault) {
        e.preventDefault();
    }
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
    }

    if (draggedTab && tab !== draggedTab) {
        const toolTabs = document.getElementById("tool-tabs");
        if (!toolTabs) return false;

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

function handleDrop(e: DragEvent): false {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    return false;
}

function handleDragEnd(e: DragEvent, tab: HTMLElement): void {
    tab.classList.remove("dragging");
    document.querySelectorAll(".tool-tab").forEach((t) => {
        t.classList.remove("over");
    });
}

/**
 * Save session to local storage
 */
export function saveSession(): void {
    const session: SessionData = {
        openTools: Array.from(openTools.entries()).map(([id, tool]) => ({
            id,
            isPinned: tool.isPinned,
            connectionId: tool.connectionId,
        })),
        activeToolId,
    };
    localStorage.setItem("toolbox-session", JSON.stringify(session));
}

/**
 * Restore session from local storage
 */
export async function restoreSession(): Promise<void> {
    const sessionData = localStorage.getItem("toolbox-session");
    if (!sessionData) return;

    try {
        const session = JSON.parse(sessionData) as SessionData;
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

/**
 * Set connection for a tool
 */
export function setToolConnection(toolId: string, connectionId: string | null): void {
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

/**
 * Show home page
 */
export function showHomePage(): void {
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

/**
 * Setup keyboard shortcuts for tool navigation
 */
export function setupKeyboardShortcuts(): void {
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
