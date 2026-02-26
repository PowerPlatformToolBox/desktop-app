/**
 * Tool management module
 * Handles tool launching, tabs, sessions, and lifecycle
 */

import { captureException, captureMessage, logInfo, logWarn } from "../../common/sentryHelper";
import type { DataverseConnection } from "../../common/types/connection";
import type { OpenTool, SessionData } from "../types/index";
import { getUnsupportedRequirement, getUnsupportedToolMessage } from "../utils/toolCompatibility";
import { openSelectConnectionModal, openSelectMultiConnectionModal } from "./connectionManagement";
import { openCspExceptionModal } from "./cspExceptionModal";
import { hideHomePage, showHomePage as showDynamicHomePage } from "./homepageManagement";

// Constants
const TAB_SCROLL_AMOUNT = 200; // Pixels to scroll when clicking scroll buttons
const SCROLL_TOLERANCE = 1; // Tolerance for rounding errors when checking scroll position
const MIDDLE_MOUSE_BUTTON = 1; // Mouse button code for middle button

export interface LaunchToolOptions {
    source?: string;
    primaryConnectionId?: string | null;
    secondaryConnectionId?: string | null;
}

// Tool state - now keyed by instanceId instead of toolId to support multiple instances
const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null; // Now stores instanceId
let draggedTab: HTMLElement | null = null;

/**
 * Check if a connection token is expired
 * @param tokenExpiry ISO date string of token expiry
 * @returns true if token is expired, false otherwise
 */
function isTokenExpired(tokenExpiry: string | undefined): boolean {
    if (!tokenExpiry) return false;

    const expiryDate = new Date(tokenExpiry);
    // Check if date is valid (invalid dates result in NaN)
    if (isNaN(expiryDate.getTime())) return false;

    const now = new Date();
    return expiryDate.getTime() <= now.getTime();
}

/**
 * Generate a unique instance ID for a tool
 */
function generateInstanceId(toolId: string): string {
    // Generate a simple unique ID using timestamp and random number
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 9);
    return `${toolId}-${timestamp}-${randomPart}`;
}

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
 * Launch a tool by ID
 */
export async function launchTool(toolId: string, options?: LaunchToolOptions): Promise<void> {
    try {
        logInfo("Launching tool:", { toolId });

        // Generate a unique instance ID for this tool launch
        const instanceId = generateInstanceId(toolId);
        logInfo("Generated instance ID:", { instanceId });
        // Load the tool first to check if it requires multi-connection
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            window.toolboxAPI.utils.showNotification({
                title: "Tool Launch Failed",
                body: `Tool ${toolId} not found`,
                type: "error",
            });
            return;
        }

        // Check if tool is supported by current ToolBox version
        if (tool.isSupported === false) {
            const versionInfo = await window.toolboxAPI.getVersionCompatibilityInfo().catch((error) => {
                logWarn("Failed to retrieve version compatibility info for unsupported tool message", {
                    error: error instanceof Error ? error.message : String(error),
                    toolId,
                });
                return null;
            });

            const unsupportedRequirement = getUnsupportedRequirement(tool, versionInfo);
            window.toolboxAPI.utils.showNotification({
                title: "Tool Not Supported",
                body: getUnsupportedToolMessage(tool.name, unsupportedRequirement),
                type: "warning",
            });
            return;
        }

        // Determine multi-connection mode
        const multiConnectionMode = tool.features?.multiConnection || "none";

        const resolveConnectionId = async (connectionId: string | null): Promise<string | null> => {
            if (!connectionId) {
                return null;
            }

            try {
                const connection = await window.toolboxAPI.connections.getById(connectionId);
                return connection ? connection.id : null;
            } catch (error) {
                logWarn(`Failed to resolve connection ${connectionId}`, { error: error instanceof Error ? error.message : String(error) });
                return null;
            }
        };

        let primaryConnectionId: string | null = options?.primaryConnectionId ?? null;
        let secondaryConnectionId: string | null = options?.secondaryConnectionId ?? null;

        if (primaryConnectionId) {
            primaryConnectionId = await resolveConnectionId(primaryConnectionId);
        }

        if (secondaryConnectionId) {
            secondaryConnectionId = await resolveConnectionId(secondaryConnectionId);
        }

        if (multiConnectionMode === "required" || multiConnectionMode === "optional") {
            // Tool supports multi-connection - show multi-connection modal
            const isSecondaryRequired = multiConnectionMode === "required";
            logInfo(
                `Tool supports multi-connection (secondary ${isSecondaryRequired ? "required" : "optional"}). ` +
                    `${primaryConnectionId ? "Reusing stored connections when available." : "Showing selection modal."}`,
            );

            const missingPrimary = !primaryConnectionId;
            const missingSecondary = isSecondaryRequired && !secondaryConnectionId;

            if (missingPrimary || missingSecondary) {
                try {
                    const result = await openSelectMultiConnectionModal(isSecondaryRequired);
                    primaryConnectionId = result.primaryConnectionId;
                    secondaryConnectionId = result.secondaryConnectionId;
                    logInfo("Multi-connections selected:", { primaryConnectionId, secondaryConnectionId });

                    if (isSecondaryRequired && !secondaryConnectionId) {
                        throw new Error("Secondary connection is required but was not provided");
                    }
                } catch (error) {
                    logInfo("Multi-connection selection cancelled:", { error });
                    const errorMessage = isSecondaryRequired
                        ? "This tool requires two connections. Please select both connections to continue."
                        : "This tool requires a primary connection. Please select at least a primary connection to continue.";
                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Launch Cancelled",
                        body: errorMessage,
                        type: "info",
                    });
                    return;
                }
            }
        } else {
            if (!primaryConnectionId) {
                // Regular single-connection flow - prompt if no stored connection
                logInfo("Showing connection selection modal for new instance...");
                try {
                    const selectedConnectionId = await openSelectConnectionModal();
                    logInfo("Connection established. Continuing with tool launch...");
                    if (selectedConnectionId) {
                        primaryConnectionId = selectedConnectionId;
                    } else {
                        throw new Error("No connection was selected");
                    }
                } catch (error) {
                    logInfo("Connection selection cancelled:", { error });
                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Launch Cancelled",
                        body: "A connection is required to use this tool. Please connect to an environment to continue.",
                        type: "info",
                    });
                    return;
                }
            }
        }

        // Check if tool requires CSP exceptions
        if (tool.cspExceptions && Object.keys(tool.cspExceptions).length > 0) {
            // Check if consent has been granted
            const hasConsent = await window.toolboxAPI.hasCspConsent(tool.id);

            if (!hasConsent) {
                // Show consent dialog using BrowserWindow modal framework
                let consentGranted = false;
                try {
                    consentGranted = await openCspExceptionModal(tool);
                } catch (error) {
                    logInfo("CSP consent modal closed without selection:", { error });
                    consentGranted = false;
                }

                if (!consentGranted) {
                    // User declined or closed, don't load the tool
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

        // Hide homepage explicitly
        hideHomePage();

        // Show tool panel
        const toolPanel = document.getElementById("tool-panel");
        if (toolPanel) {
            toolPanel.style.display = "flex";
        }

        // Launch the tool using BrowserView via IPC with the instance ID and connection IDs
        // The backend ToolWindowManager will create a BrowserView and load the tool
        const launched = await window.toolboxAPI.launchToolWindow(instanceId, tool, primaryConnectionId, secondaryConnectionId);

        if (!launched) {
            window.toolboxAPI.utils.showNotification({
                title: "Tool Launch Failed",
                body: `Failed to launch ${tool.name}`,
                type: "error",
            });
            return;
        }

        logInfo(`[Tool Launch] Tool window created via BrowserView: ${instanceId}`);

        // Count how many instances of this tool are already open
        const existingInstances = Array.from(openTools.values()).filter((t) => t.toolId === toolId);
        const instanceNumber = existingInstances.length + 1;

        // Store the open tool with instance information
        openTools.set(instanceId, {
            instanceId: instanceId,
            toolId: toolId,
            tool: tool,
            isPinned: false,
            connectionId: primaryConnectionId,
            secondaryConnectionId: secondaryConnectionId,
        });

        // Create and add tab with instance number if multiple instances exist
        createTab(instanceId, tool, instanceNumber);

        // Switch to the new tab (this will also call backend to show the BrowserView)
        switchToTool(instanceId);

        // Update toolbar buttons
        updateToolbarButtonVisibility();

        // Save session after launching
        saveSession();

        logInfo("Tool launched successfully:", { toolName: tool.name, instanceNumber: instanceNumber });
    } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
            tags: { phase: "tool_launch", toolId },
            level: "error",
        });
        window.toolboxAPI.utils.showNotification({
            title: "Tool Launch Error",
            body: `Failed to launch tool: ${error}`,
            type: "error",
        });
    }
}

/**
 * Create a tab for a tool instance
 */
export function createTab(instanceId: string, tool: any, instanceNumber: number = 1): void {
    const toolTabs = document.getElementById("tool-tabs");
    if (!toolTabs) return;

    const tab = document.createElement("div");
    tab.className = "tool-tab";
    tab.id = `tool-tab-${instanceId}`;
    tab.setAttribute("data-instance-id", instanceId);
    tab.setAttribute("draggable", "true");

    const name = document.createElement("span");
    name.className = "tool-tab-name";
    // Show instance number if multiple instances exist
    const displayName = instanceNumber > 1 ? `${tool.name} (${instanceNumber})` : tool.name;
    name.textContent = displayName;
    name.title = displayName;

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
        togglePinTab(instanceId);
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "tool-tab-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";

    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTool(instanceId);
    });

    tab.addEventListener("click", () => {
        switchToTool(instanceId);
    });

    // Middle-click to close tab
    tab.addEventListener("mousedown", (e) => {
        if (e.button === MIDDLE_MOUSE_BUTTON) {
            e.preventDefault();
            e.stopPropagation();

            // Check if tab is pinned before closing
            const openTool = openTools.get(instanceId);
            if (openTool?.isPinned) {
                window.toolboxAPI.utils.showNotification({
                    title: "Cannot Close Pinned Tab",
                    body: "Unpin the tab before closing it",
                    type: "warning",
                });
                return;
            }

            closeTool(instanceId);
        }
    });

    // Drag and drop events
    tab.addEventListener("dragstart", (e) => handleDragStart(e, tab));
    tab.addEventListener("dragover", (e) => handleDragOver(e, tab));
    tab.addEventListener("drop", (e) => handleDrop(e));
    tab.addEventListener("dragend", (e) => handleDragEnd(e, tab));

    tab.appendChild(name);
    tab.appendChild(pinBtn);
    tab.appendChild(closeBtn);
    toolTabs.appendChild(tab);

    // Update scroll button visibility after adding tab
    updateTabScrollButtons();
}

/**
 * Get the current display name for a tool tab instance
 */
export function getToolInstanceDisplayName(instanceId: string): string | null {
    const tab = document.getElementById(`tool-tab-${instanceId}`);
    if (!tab) return null;
    const nameElement = tab.querySelector(".tool-tab-name");
    return nameElement?.textContent ?? null;
}

/**
 * Switch to a tool tab
 */
export async function switchToTool(instanceId: string): Promise<void> {
    if (!openTools.has(instanceId)) return;

    // Normal single view mode
    activeToolId = instanceId;

    // Update tab active states
    document.querySelectorAll(".tool-tab").forEach((tab) => {
        tab.classList.remove("active");
        // Also remove environment classes from all tabs
        tab.classList.remove("env-dev", "env-test", "env-uat", "env-production");
    });
    const activeTab = document.getElementById(`tool-tab-${instanceId}`);
    if (activeTab) {
        activeTab.classList.add("active");
    }

    // Use IPC to switch the BrowserView in the backend
    // The ToolWindowManager will show the appropriate BrowserView
    window.toolboxAPI.switchToolWindow(instanceId).catch((error: any) => {
        captureException(error instanceof Error ? error : new Error(String(error)), {
            tags: { phase: "tool_switch", instanceId },
            level: "error",
        });
    });

    // Update connection status display based on this tool's connection
    await updateActiveToolConnectionStatus();
}

/**
 * Close a tool
 */
export function closeTool(instanceId: string): void {
    const openTool = openTools.get(instanceId);
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
    const tab = document.getElementById(`tool-tab-${instanceId}`);
    if (tab) {
        tab.remove();
    }

    // Close the tool window via IPC
    // The ToolWindowManager will destroy the BrowserView
    window.toolboxAPI.closeToolWindow(instanceId).catch((error: any) => {
        captureException(error instanceof Error ? error : new Error(String(error)), {
            tags: { phase: "tool_close", instanceId },
            level: "error",
        });
    });

    // Remove from open tools
    openTools.delete(instanceId);

    // Update toolbar buttons
    updateToolbarButtonVisibility();

    // Update scroll buttons visibility
    updateTabScrollButtons();

    // Save session after closing
    saveSession();

    // If this was the active tool, switch to another tool or close the panel
    if (activeToolId === instanceId) {
        if (openTools.size > 0) {
            // Switch to the last tool in the list
            const lastInstanceId = Array.from(openTools.keys())[openTools.size - 1];
            switchToTool(lastInstanceId);
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
export function togglePinTab(instanceId: string): void {
    const openTool = openTools.get(instanceId);
    if (!openTool) return;

    openTool.isPinned = !openTool.isPinned;

    const tab = document.getElementById(`tool-tab-${instanceId}`);
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
        openTools: Array.from(openTools.entries()).map(([instanceId, tool]) => ({
            instanceId,
            toolId: tool.toolId,
            isPinned: tool.isPinned,
            connectionId: tool.connectionId,
            secondaryConnectionId: tool.secondaryConnectionId,
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
            // Note: We can't restore exact instanceIds since they're timestamp-based
            // Instead, we launch the tools fresh, which creates new instances
            // Session restore for multi-instance is simplified for now
            for (const toolInfo of session.openTools) {
                await launchTool(toolInfo.toolId);
                // TODO: Future enhancement - restore pinned state and exact connections per instance
            }
            // Note: activeToolId won't match since we have new instanceIds
        }
    } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
            tags: { phase: "session_restore" },
            level: "error",
        });
    }
}

/**
 * Set connection for a tool
 */
export async function setToolConnection(instanceId: string, connectionId: string | null): Promise<void> {
    const tool = openTools.get(instanceId);
    if (!tool) return;

    // Save to backend using toolId (not instanceId) for settings storage
    const toolId = tool.toolId;
    if (connectionId) {
        await window.toolboxAPI.setToolConnection(toolId, connectionId);
    } else {
        await window.toolboxAPI.removeToolConnection(toolId);
    }

    // Update the tool instance's connection context
    // Pass both primary and secondary to preserve secondary when updating primary
    await window.toolboxAPI.updateToolConnection(instanceId, connectionId, tool.secondaryConnectionId);

    // Update local state
    tool.connectionId = connectionId;

    saveSession();

    // Update sidebar and footer if this is the active tool
    if (activeToolId === instanceId) {
        await updateActiveToolConnectionStatus();
    }

    logInfo(`Tool instance ${instanceId} (toolId: ${toolId}) connection set to:`, { connectionId });
}

/**
 * Show home page
 */
export function showHomePage(): void {
    showDynamicHomePage();
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

/**
 * Update sidebar and footer connection status based on active tool's connection
 */
export async function updateActiveToolConnectionStatus(): Promise<void> {
    const statusElement = document.getElementById("connection-status");
    const secondaryStatusElement = document.getElementById("secondary-connection-status");
    if (!statusElement) return;

    // Always hide secondary status initially
    if (secondaryStatusElement) {
        secondaryStatusElement.classList.remove("visible", "connected", "expired");
        secondaryStatusElement.textContent = "";
    }

    if (!activeToolId) {
        // No active tool, show "Not Connected"
        statusElement.textContent = "Not Connected";
        statusElement.className = "connection-status";
        // Clear tool panel border
        updateToolPanelBorder(null);
        return;
    }

    const activeTool = openTools.get(activeToolId);
    if (!activeTool) return;

    // Check if tool has multi-connection feature
    const multiConnectionMode = activeTool.tool.features?.multiConnection || "none";
    const hasMultiConnection = multiConnectionMode === "required" || multiConnectionMode === "optional";
    const toolConnectionId = activeTool.connectionId;
    const secondaryConnectionId = activeTool.secondaryConnectionId;

    if (hasMultiConnection && toolConnectionId) {
        // Tool supports multi-connection and has at least primary connection
        const connections = await window.toolboxAPI.connections.getAll();
        const primaryConnection = connections.find((c: any) => c.id === toolConnectionId);

        if (primaryConnection) {
            // Check if primary token is expired
            const isPrimaryExpired = isTokenExpired(primaryConnection.tokenExpiry);

            // Display primary connection on the left
            const primaryText = isPrimaryExpired
                ? `Primary: ${primaryConnection.name} (${primaryConnection.environment}) ⚠ (Token Expired)`
                : `Primary: ${primaryConnection.name} (${primaryConnection.environment})`;
            statusElement.textContent = primaryText;
            const primaryEnvClass = `env-${primaryConnection.environment.toLowerCase()}`;
            const primaryStatusClass = isPrimaryExpired ? "expired" : "connected";
            statusElement.className = `connection-status ${primaryStatusClass} ${primaryEnvClass}`;

            // Handle secondary connection display
            if (secondaryStatusElement) {
                if (secondaryConnectionId) {
                    // Secondary connection is set
                    const secondaryConnection = connections.find((c: any) => c.id === secondaryConnectionId);
                    if (secondaryConnection) {
                        // Check if secondary token is expired
                        const isSecondaryExpired = isTokenExpired(secondaryConnection.tokenExpiry);

                        const secondaryText = isSecondaryExpired
                            ? `Secondary: ${secondaryConnection.name} (${secondaryConnection.environment}) ⚠ (Token Expired)`
                            : `Secondary: ${secondaryConnection.name} (${secondaryConnection.environment})`;
                        secondaryStatusElement.textContent = secondaryText;
                        const secondaryEnvClass = `env-${secondaryConnection.environment.toLowerCase()}`;
                        const secondaryStatusClass = isSecondaryExpired ? "expired" : "connected";
                        secondaryStatusElement.className = `secondary-connection-status ${secondaryStatusClass} visible ${secondaryEnvClass}`;

                        // Update tool panel border based on both primary and secondary environment
                        updateToolPanelBorder(primaryConnection.environment, secondaryConnection.environment);
                        return;
                    }
                } else {
                    // No secondary connection - show "Not Connected" for optional secondary
                    if (multiConnectionMode === "optional") {
                        secondaryStatusElement.textContent = "Secondary: Not Connected (Click to connect)";
                        secondaryStatusElement.className = "secondary-connection-status not-connected visible";
                    } else {
                        // Required but missing - this shouldn't happen during normal operation
                        secondaryStatusElement.textContent = "Secondary: Not Connected";
                        secondaryStatusElement.className = "secondary-connection-status not-connected visible";
                    }
                }
            }

            // Update tool panel border based on primary environment only
            updateToolPanelBorder(primaryConnection.environment);
            return;
        }
    } else if (toolConnectionId) {
        // Tool has a single connection
        const connections = await window.toolboxAPI.connections.getAll();
        const toolConnection = connections.find((c: any) => c.id === toolConnectionId);
        if (toolConnection) {
            // Check if token is expired
            const isExpired = isTokenExpired(toolConnection.tokenExpiry);
            const envClass = `env-${toolConnection.environment.toLowerCase()}`;
            // Format: "ToolName is connected to: ConnectionName"
            if (isExpired) {
                statusElement.textContent = `${activeTool.tool.name} is connected to: ${toolConnection.name} ⚠ (Token Expired)`;
                statusElement.className = `connection-status expired ${envClass}`;
            } else {
                statusElement.textContent = `${activeTool.tool.name} is connected to: ${toolConnection.name}`;
                statusElement.className = `connection-status connected ${envClass}`;
            }
            // Update tool panel border based on environment
            updateToolPanelBorder(toolConnection.environment);
            return;
        }
    }
    // Tool doesn't have a connection
    statusElement.textContent = `${activeTool.tool.name} is not connected`;
    statusElement.className = "connection-status";
    // Clear tool panel border
    updateToolPanelBorder(null);
}

/**
 * Update the tool panel border and tab highlight based on the connection environment
 * @param environment The connection environment (Dev, Test, UAT, Production) or null to clear
 */
function updateToolPanelBorder(environment: string | null, secondaryEnvironment?: string | null): void {
    const toolPanelWrapper = document.getElementById("tool-panel-content-wrapper");
    if (toolPanelWrapper) {
        // Remove all environment classes from panel
        const classesToRemove = Array.from(toolPanelWrapper.classList).filter((cls) => cls.startsWith("env-") || cls.startsWith("multi-env-"));
        classesToRemove.forEach((cls) => toolPanelWrapper.classList.remove(cls));

        // Add the appropriate class based on environment(s)
        if (environment && secondaryEnvironment) {
            const primaryEnvClass = environment.toLowerCase();
            const secondaryEnvClass = secondaryEnvironment.toLowerCase();

            // If both environments are the same, use single environment class for efficiency
            if (primaryEnvClass === secondaryEnvClass) {
                toolPanelWrapper.classList.add(`env-${primaryEnvClass}`);
            } else {
                // Multi-connection: use split border with both environments
                const multiEnvClass = `multi-env-${primaryEnvClass}-${secondaryEnvClass}`;
                toolPanelWrapper.classList.add(multiEnvClass);
            }
        } else if (environment) {
            // Single connection: use solid border
            const envClass = `env-${environment.toLowerCase()}`;
            toolPanelWrapper.classList.add(envClass);
        }
    }

    // Update the active tab with environment class
    if (activeToolId) {
        const activeTab = document.getElementById(`tool-tab-${activeToolId}`);
        if (activeTab) {
            // Remove all environment classes from tab
            activeTab.classList.remove("env-dev", "env-test", "env-uat", "env-production");

            // Add the appropriate class based on environment (use primary for tabs)
            if (environment) {
                const envClass = `env-${environment.toLowerCase()}`;
                activeTab.classList.add(envClass);
            }
        }
    }
}

/**
 * Show context menu for tool tab
 * @deprecated Currently unused, may be implemented in the future
 */
// async function showToolTabContextMenu(toolId: string, x: number, y: number): Promise<void> {
//     // Remove any existing context menu
//     const existingMenu = document.getElementById("tool-tab-context-menu");
//     if (existingMenu) {
//         existingMenu.remove();
//     }

//     const menu = document.createElement("div");
//     menu.id = "tool-tab-context-menu";
//     menu.className = "context-menu";
//     menu.style.position = "fixed";
//     menu.style.left = `${x}px`;
//     menu.style.top = `${y}px`;
//     menu.style.zIndex = "10000";

//     // Get available connections
//     const connections = await window.toolboxAPI.connections.getAll();
//     const currentTool = openTools.get(toolId);
//     const currentConnectionId = currentTool?.connectionId;

//     let menuHtml = `<div class="context-menu-header">Connection for ${currentTool?.tool.name || "Tool"}</div>`;
//     // Add "Use Global Connection" option
//     menuHtml += `
//         <div class="context-menu-item ${!currentConnectionId ? "active" : ""}" data-action="use-global">
//             <span>✓ Use Global Connection</span>
//         </div>
//     `;

//     // Add separator
//     if (connections.length > 0) {
//         menuHtml += `<div class="context-menu-separator"></div>`;
//         menuHtml += `<div class="context-menu-header">Tool-Specific Connection</div>`;
//     }

//     // Add connection options
//     if (connections.length === 0) {
//         menuHtml += `<div class="context-menu-item disabled">No connections available</div>`;
//     } else {
//         connections.forEach((conn: any) => {
//             const isActive = conn.id === currentConnectionId;
//             menuHtml += `
//                 <div class="context-menu-item ${isActive ? "active" : ""}" data-action="set-connection" data-connection-id="${conn.id}">
//                     <span>${isActive ? "✓ " : ""}${conn.name} (${conn.environment})</span>
//                 </div>
//             `;
//         });
//     }

//     menu.innerHTML = menuHtml;
//     document.body.appendChild(menu);

//     // Add event listeners to menu items
//     menu.querySelectorAll(".context-menu-item:not(.disabled)").forEach((item) => {
//         item.addEventListener("click", async (e) => {
//             const target = e.currentTarget as HTMLElement;
//             const action = target.getAttribute("data-action");
//             if (action === "use-global") {
//                 await setToolConnection(toolId, null);
//             } else if (action === "set-connection") {
//                 const connectionId = target.getAttribute("data-connection-id");
//                 if (connectionId) {
//                     await setToolConnection(toolId, connectionId);
//                 }
//             }
//             menu.remove();
//         });
//     });

//     // Close menu when clicking outside
//     const closeMenu = (e: MouseEvent) => {
//         if (!menu.contains(e.target as Node)) {
//             menu.remove();
//             document.removeEventListener("click", closeMenu);
//         }
//     };
//     // Add click listener after a small delay to prevent immediate closing
//     setTimeout(() => {
//         document.addEventListener("click", closeMenu);
//     }, 100);
// }

/**
 * Open connection selection modal for the active tool using the BrowserWindow modal framework
 * This modal allows selecting a connection to associate with the active tool
 */
export async function openToolConnectionModal(): Promise<void> {
    if (!activeToolId) {
        window.toolboxAPI.utils.showNotification({
            title: "No Active Tool",
            body: "Please select a tool first before changing its connection.",
            type: "warning",
        });
        return;
    }

    const activeTool = openTools.get(activeToolId);
    if (!activeTool) return;

    try {
        // Use the existing selectConnection modal but with tool-specific behavior
        // Import connectionManagement functions dynamically
        const { openSelectConnectionModal } = await import("./connectionManagement");

        // Open the modal and pass the tool's current connection ID to highlight it
        const selectedConnectionId = await openSelectConnectionModal(activeTool.connectionId);

        // After modal closes with a successful connection, update the tool's connection
        if (selectedConnectionId && activeToolId) {
            await setToolConnection(activeToolId, selectedConnectionId);

            // Get connection from all connections list
            const connections = await window.toolboxAPI.connections.getAll();
            const connection = connections.find((c: DataverseConnection) => c.id === selectedConnectionId);
            window.toolboxAPI.utils.showNotification({
                title: "Connection Set",
                body: `${activeTool.tool.name} is now connected to ${connection?.name || "the selected connection"}.`,
                type: "success",
            });
        }
    } catch (error) {
        // User cancelled or error occurred
        captureMessage("Connection selection cancelled or failed", "error", {
            extra: { error },
        });
    }
}

/**
 * Set secondary connection for a tool
 */
export async function setToolSecondaryConnection(instanceId: string, connectionId: string | null): Promise<void> {
    const tool = openTools.get(instanceId);
    if (!tool) return;

    // Update the tool instance's connection context
    // Pass both primary and secondary connections
    await window.toolboxAPI.updateToolConnection(instanceId, tool.connectionId, connectionId);

    // Update local state
    tool.secondaryConnectionId = connectionId;

    saveSession();

    // Update sidebar and footer if this is the active tool
    if (activeToolId === instanceId) {
        await updateActiveToolConnectionStatus();
    }

    logInfo(`Tool instance ${instanceId} secondary connection set to:`, { connectionId });
}

/**
 * Open connection selection modal for changing the secondary connection of the active tool
 * This modal allows selecting a secondary connection to associate with the active tool
 */
export async function openToolSecondaryConnectionModal(): Promise<void> {
    if (!activeToolId) {
        window.toolboxAPI.utils.showNotification({
            title: "No Active Tool",
            body: "Please select a tool first before changing its secondary connection.",
            type: "warning",
        });
        return;
    }

    const activeTool = openTools.get(activeToolId);
    if (!activeTool) return;

    // Check if tool supports multi-connection
    const multiConnectionMode = activeTool.tool.features?.multiConnection || "none";
    const hasMultiConnection = multiConnectionMode === "required" || multiConnectionMode === "optional";
    if (!hasMultiConnection) {
        window.toolboxAPI.utils.showNotification({
            title: "Not Supported",
            body: "This tool does not support multiple connections.",
            type: "warning",
        });
        return;
    }

    try {
        // Use the existing selectConnection modal but with tool-specific behavior
        // Import connectionManagement functions dynamically
        const { openSelectConnectionModal } = await import("./connectionManagement");

        // Open the modal and pass the tool's current secondary connection ID to highlight it
        const selectedConnectionId = await openSelectConnectionModal(activeTool.secondaryConnectionId);

        // After modal closes with a successful connection, update the tool's secondary connection
        if (selectedConnectionId && activeToolId) {
            await setToolSecondaryConnection(activeToolId, selectedConnectionId);

            // Get connection from all connections list
            const connections = await window.toolboxAPI.connections.getAll();
            const connection = connections.find((c: DataverseConnection) => c.id === selectedConnectionId);
            window.toolboxAPI.utils.showNotification({
                title: "Secondary Connection Set",
                body: `${activeTool.tool.name} secondary connection is now connected to ${connection?.name || "the selected connection"}.`,
                type: "success",
            });
        }
    } catch (error) {
        // User cancelled or error occurred
        captureMessage("Secondary connection selection cancelled or failed", "error", {
            extra: { error },
        });
    }
}

/**
 * Update tab scroll button visibility based on overflow
 */
export function updateTabScrollButtons(): void {
    const toolTabs = document.getElementById("tool-tabs");
    const scrollLeftBtn = document.getElementById("scroll-tabs-left");
    const scrollRightBtn = document.getElementById("scroll-tabs-right");

    if (!toolTabs || !scrollLeftBtn || !scrollRightBtn) return;

    // Check if tabs overflow their container
    const hasOverflow = toolTabs.scrollWidth > toolTabs.clientWidth;

    if (hasOverflow) {
        scrollLeftBtn.classList.add("visible");
        scrollRightBtn.classList.add("visible");

        // Update button disabled states based on scroll position
        updateScrollButtonStates();
    } else {
        scrollLeftBtn.classList.remove("visible");
        scrollRightBtn.classList.remove("visible");
    }
}

/**
 * Update scroll button disabled states based on current scroll position
 */
function updateScrollButtonStates(): void {
    const toolTabs = document.getElementById("tool-tabs");
    const scrollLeftBtn = document.getElementById("scroll-tabs-left") as HTMLButtonElement;
    const scrollRightBtn = document.getElementById("scroll-tabs-right") as HTMLButtonElement;

    if (!toolTabs || !scrollLeftBtn || !scrollRightBtn) return;

    // Check if we're at the start or end of scrolling
    const isAtStart = toolTabs.scrollLeft <= 0;
    const isAtEnd = toolTabs.scrollLeft + toolTabs.clientWidth >= toolTabs.scrollWidth - SCROLL_TOLERANCE;

    scrollLeftBtn.disabled = isAtStart;
    scrollRightBtn.disabled = isAtEnd;
}

/**
 * Initialize tab scroll button handlers
 */
export function initializeTabScrollButtons(): void {
    const toolTabs = document.getElementById("tool-tabs");
    const scrollLeftBtn = document.getElementById("scroll-tabs-left");
    const scrollRightBtn = document.getElementById("scroll-tabs-right");

    if (!toolTabs || !scrollLeftBtn || !scrollRightBtn) return;

    // Scroll left button
    scrollLeftBtn.addEventListener("click", () => {
        toolTabs.scrollBy({ left: -TAB_SCROLL_AMOUNT, behavior: "smooth" });
    });

    // Scroll right button
    scrollRightBtn.addEventListener("click", () => {
        toolTabs.scrollBy({ left: TAB_SCROLL_AMOUNT, behavior: "smooth" });
    });

    // Update button states when scrolling
    toolTabs.addEventListener("scroll", () => {
        updateScrollButtonStates();
    });

    // Update button visibility on window resize
    window.addEventListener("resize", () => {
        updateTabScrollButtons();
    });

    // Initial update
    updateTabScrollButtons();
}
