/**
 * Tool management module
 * Handles tool launching, tabs, sessions, and lifecycle
 */

import { logError, logInfo, logWarn } from "../../common/logger";
import { normalizeCspExceptionSource, type CspExceptionSource } from "../../common/types";
import type { Connection } from "../../common/types/connection";
import {
    DEFAULT_CATEGORY_COLOR_THICKNESS,
    DEFAULT_ENVIRONMENT_COLOR_THICKNESS,
    DEFAULT_SHOW_CATEGORY_COLOR,
    DEFAULT_SHOW_ENVIRONMENT_COLOR,
    MAX_COLOR_BORDER_THICKNESS,
    MIN_COLOR_BORDER_THICKNESS,
} from "../constants";
import type { OpenTool, SessionData } from "../types/index";
import { getUnsupportedRequirement, getUnsupportedToolMessage } from "../utils/toolCompatibility";
import { openSelectConnectionModal, openSelectMultiConnectionModal } from "./connectionManagement";
import { openCspExceptionModal } from "./cspExceptionModal";
import { hideHomePage, showHomePage as showDynamicHomePage } from "./homepageManagement";

// Constants
const TAB_SCROLL_AMOUNT = 200; // Pixels to scroll when clicking scroll buttons
const SCROLL_TOLERANCE = 1; // Tolerance for rounding errors when checking scroll position
const MIDDLE_MOUSE_BUTTON = 1; // Mouse button code for middle button
const SPLIT_VIEW_MIN_PANEL_RATIO = 0.2; // Minimum panel width as a fraction of wrapper width (20% ensures usability on small screens)
const SPLIT_VIEW_MAX_PANEL_RATIO = 0.8; // Maximum panel width as a fraction of wrapper width (80% keeps the secondary panel visible)
const SPLIT_VIEW_HANDLE_FALLBACK_WIDTH = 5; // Fallback resize-handle width in px, used when getBoundingClientRect returns 0 (e.g. hidden element)

export interface LaunchToolOptions {
    source?: string;
    primaryConnectionId?: string | null;
    secondaryConnectionId?: string | null;
    /** Prefill data to pass to the tool on launch (inter-tool launch context). */
    prefillData?: Record<string, unknown>;
    /** The instanceId of the tool initiating this launch (for inter-tool return data). */
    callerInstanceId?: string;
}

// Tool state - now keyed by instanceId instead of toolId to support multiple instances
const openTools = new Map<string, OpenTool>();
let activeToolId: string | null = null; // Now stores instanceId
/** The instanceId of the tool shown in the secondary (right) panel during split view, or null. */
let splitViewSecondaryId: string | null = null;
/** AbortController used to detach the current split-view resize listeners when split view is closed or re-entered. */
let splitViewResizeAbortController: AbortController | null = null;
let draggedTab: HTMLElement | null = null;
let hasWarnedAboutMissingContextMenuHandler = false;

// Appearance settings - cached values used when rendering borders
let _showCategoryColor = DEFAULT_SHOW_CATEGORY_COLOR;
let _showEnvironmentColor = DEFAULT_SHOW_ENVIRONMENT_COLOR;
let _categoryColorThickness = DEFAULT_CATEGORY_COLOR_THICKNESS;
let _environmentColorThickness = DEFAULT_ENVIRONMENT_COLOR_THICKNESS;

function clampThickness(value: number): number {
    return Math.min(MAX_COLOR_BORDER_THICKNESS, Math.max(MIN_COLOR_BORDER_THICKNESS, value));
}

/**
 * Apply appearance settings for color indicators.
 * Caches the values and immediately refreshes any visible borders.
 */
export function applyAppearanceSettings(showCategoryColor: boolean, showEnvironmentColor: boolean, categoryColorThickness: number, environmentColorThickness: number): void {
    _showCategoryColor = showCategoryColor;
    _showEnvironmentColor = showEnvironmentColor;
    _categoryColorThickness = clampThickness(categoryColorThickness);
    _environmentColorThickness = clampThickness(environmentColorThickness);

    // Refresh the active tool's borders to reflect new settings immediately
    updateActiveToolConnectionStatus().catch((err) => {
        logError(err instanceof Error ? err : new Error(String(err)));
    });
}

// Detail tab state - maps tabId to render callback for tool detail tabs
const detailTabs = new Map<string, (panel: HTMLElement) => void>();

// Close guards - async callbacks that can cancel a tab close (return false to prevent)
const closeGuards = new Map<string, () => Promise<boolean>>();

/**
 * Register a close guard for a tab. The guard is called before the tab closes;
 * returning false cancels the close (e.g., to prompt about unsaved changes).
 */
export function registerCloseGuard(instanceId: string, guard: () => Promise<boolean>): void {
    closeGuards.set(instanceId, guard);
}

/**
 * Remove a previously registered close guard.
 */
export function unregisterCloseGuard(instanceId: string): void {
    closeGuards.delete(instanceId);
}

function canCloseTab(instanceId: string): boolean {
    const openTool = openTools.get(instanceId);
    if (!openTool) {
        return false;
    }

    return openTool.isDetailTab || !openTool.isPinned;
}

function getClosableTabIds(excludedInstanceId?: string): string[] {
    return Array.from(openTools.keys()).filter((instanceId) => instanceId !== excludedInstanceId && canCloseTab(instanceId));
}

async function closeTabs(instanceIds: string[]): Promise<void> {
    for (const instanceId of instanceIds) {
        if (openTools.has(instanceId)) {
            await closeTool(instanceId);
        }
    }
}

async function closeOtherTabs(instanceId: string): Promise<void> {
    await closeTabs(getClosableTabIds(instanceId));
}

function canManageToolTab(instanceId: string): boolean {
    const openTool = openTools.get(instanceId);
    return Boolean(openTool && !openTool.isDetailTab && openTool.toolId);
}

async function duplicateToolTab(instanceId: string, promptForNewConnection: boolean = false): Promise<void> {
    const openTool = openTools.get(instanceId);
    if (!openTool || openTool.isDetailTab || !openTool.toolId) {
        return;
    }

    const launchOptions: LaunchToolOptions | undefined = promptForNewConnection
        ? undefined
        : {
              primaryConnectionId: openTool.connectionId,
              secondaryConnectionId: openTool.secondaryConnectionId,
          };

    await launchTool(openTool.toolId, launchOptions);
}

async function changeToolConnectionForInstance(instanceId: string): Promise<void> {
    const targetTool = openTools.get(instanceId);
    if (!targetTool || targetTool.isDetailTab) {
        return;
    }

    const multiConnectionMode = targetTool.tool.features?.multiConnection || "none";
    const hasMultiConnection = multiConnectionMode === "required" || multiConnectionMode === "optional";
    const requirePowerPlatformApi = targetTool.tool.features?.enabledForPowerPlatformAPI === true;

    try {
        if (hasMultiConnection) {
            const isSecondaryRequired = multiConnectionMode === "required";
            const result = await openSelectMultiConnectionModal(isSecondaryRequired, targetTool.tool.name, requirePowerPlatformApi);

            await setToolConnection(instanceId, result.primaryConnectionId);
            await setToolSecondaryConnection(instanceId, result.secondaryConnectionId);

            const connections = await window.toolboxAPI.connections.getAll();
            const primaryConnection = connections.find((item: Connection) => item.id === result.primaryConnectionId);
            const secondaryConnection = result.secondaryConnectionId ? connections.find((item: Connection) => item.id === result.secondaryConnectionId) : null;

            const connectionDetails = secondaryConnection ? `${primaryConnection?.name || "Primary"} and ${secondaryConnection.name}` : primaryConnection?.name || "the selected connection";

            window.toolboxAPI.utils.showNotification({
                title: "Connections Set",
                body: `${targetTool.tool.name} is now connected to ${connectionDetails}.`,
                type: "success",
            });
        } else {
            const selectedConnectionId = await openSelectConnectionModal(targetTool.connectionId, targetTool.tool.name, requirePowerPlatformApi);

            if (!selectedConnectionId) {
                return;
            }

            await setToolConnection(instanceId, selectedConnectionId);

            const connections = await window.toolboxAPI.connections.getAll();
            const connection = connections.find((item: Connection) => item.id === selectedConnectionId);
            window.toolboxAPI.utils.showNotification({
                title: "Connection Set",
                body: `${targetTool.tool.name} is now connected to ${connection?.name || "the selected connection"}.`,
                type: "success",
            });
        }
    } catch (error) {
        logError("Connection selection cancelled or failed", error);
    }
}

/**
 * Activate split view with the given tool instance shown in the right panel.
 * The currently active tool stays in the left panel.
 */
async function enterSplitView(secondaryInstanceId: string): Promise<void> {
    try {
        await window.toolboxAPI.setSplitViewSecondary(secondaryInstanceId);
        await applySplitViewUI(secondaryInstanceId);
    } catch (error) {
        logError("Failed to activate split view", error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Switch the tool shown in the secondary (right) panel.
 */
async function switchSplitViewSecondary(newSecondaryInstanceId: string): Promise<void> {
    try {
        await window.toolboxAPI.switchSplitViewSecondary(newSecondaryInstanceId);
        updateSplitViewToolName(newSecondaryInstanceId);
        splitViewSecondaryId = newSecondaryInstanceId;
    } catch (error) {
        logError("Failed to switch split view secondary", error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Close the split view and return to single-panel layout.
 */
export async function closeSplitView(): Promise<void> {
    // Guard: if split view is not currently active in the renderer, skip the IPC call
    if (!splitViewSecondaryId) {
        removeSplitViewUI();
        return;
    }
    try {
        await window.toolboxAPI.closeSplitView();
    } catch (error) {
        logError("Failed to close split view", error instanceof Error ? error : new Error(String(error)));
    }
    removeSplitViewUI();
}

/**
 * Apply the split view DOM changes: add the split-view class and show the secondary panel.
 */
async function applySplitViewUI(secondaryInstanceId: string): Promise<void> {
    splitViewSecondaryId = secondaryInstanceId;

    const wrapper = document.getElementById("tool-panel-content-wrapper");
    if (wrapper) {
        wrapper.classList.add("split-view");
    }

    const resizeHandle = document.getElementById("split-view-resize-handle");
    if (resizeHandle) {
        resizeHandle.style.display = "";
    }

    const secondaryPanel = document.getElementById("tool-panel-content-secondary");
    if (secondaryPanel) {
        secondaryPanel.style.display = "flex";
    }

    updateSplitViewToolName(secondaryInstanceId);
    setupSplitViewResizeHandle();

    // Restore the persisted divider ratio so the split resumes at the last-used position.
    try {
        const savedRatio = await window.toolboxAPI.getSplitDividerRatio();
        const primaryPanel = document.getElementById("tool-panel-content");
        if (primaryPanel && secondaryPanel && wrapper) {
            const handleWidth = resizeHandle?.getBoundingClientRect().width || SPLIT_VIEW_HANDLE_FALLBACK_WIDTH;
            const totalWidth = wrapper.getBoundingClientRect().width;
            if (totalWidth > 0) {
                const primaryWidth = savedRatio * totalWidth;
                const newSecondaryWidth = totalWidth - primaryWidth - handleWidth;
                primaryPanel.style.flexBasis = `${primaryWidth}px`;
                primaryPanel.style.flex = "none";
                secondaryPanel.style.flexBasis = `${newSecondaryWidth}px`;
                secondaryPanel.style.flex = "none";
            }
        }
    } catch (_e) {
        // Use the default 50/50 split if the ratio cannot be retrieved.
    }
}

/**
 * Remove the split view DOM changes and return to single-panel layout.
 */
function removeSplitViewUI(): void {
    splitViewSecondaryId = null;

    // Abort any active resize event listeners
    if (splitViewResizeAbortController) {
        splitViewResizeAbortController.abort();
        splitViewResizeAbortController = null;
    }

    const wrapper = document.getElementById("tool-panel-content-wrapper");
    if (wrapper) {
        wrapper.classList.remove("split-view");
        // Clear any inline flex-basis set during resize
        const primaryPanel = document.getElementById("tool-panel-content");
        const secondaryPanel = document.getElementById("tool-panel-content-secondary");
        if (primaryPanel) {
            // Clear both the inline flex-basis and flex shorthand set during resize
            primaryPanel.style.flexBasis = "";
            primaryPanel.style.flex = "";
        }
        if (secondaryPanel) {
            secondaryPanel.style.flexBasis = "";
            secondaryPanel.style.flex = "";
            secondaryPanel.style.display = "none";
        }
    }

    const resizeHandle = document.getElementById("split-view-resize-handle");
    if (resizeHandle) {
        resizeHandle.style.display = "none";
    }

    // Notify main process that bounds changed so BrowserView is repositioned
    window.api.send("sidebar-layout-changed");
}

/**
 * Update the tool name displayed in the secondary panel header.
 */
function updateSplitViewToolName(instanceId: string): void {
    const nameEl = document.getElementById("split-view-tool-name");
    if (!nameEl) return;
    const openTool = openTools.get(instanceId);
    nameEl.textContent = openTool?.tool?.name ?? "";
}

/**
 * Set up drag-to-resize behaviour for the split view handle.
 * Called once when split view is activated; listeners are cleaned up via AbortController
 * when split view is closed or re-entered.
 */
function setupSplitViewResizeHandle(): void {
    const handle = document.getElementById("split-view-resize-handle");
    const wrapper = document.getElementById("tool-panel-content-wrapper");
    const primaryPanel = document.getElementById("tool-panel-content");
    const secondaryPanel = document.getElementById("tool-panel-content-secondary");

    if (!handle || !wrapper || !primaryPanel || !secondaryPanel) return;

    // Abort any previously registered listeners before attaching new ones
    if (splitViewResizeAbortController) {
        splitViewResizeAbortController.abort();
    }
    splitViewResizeAbortController = new AbortController();
    const { signal } = splitViewResizeAbortController;

    let isResizing = false;
    let startX = 0;
    let startPrimaryWidth = 0;

    handle.addEventListener(
        "mousedown",
        (e: MouseEvent) => {
            isResizing = true;
            startX = e.clientX;
            startPrimaryWidth = primaryPanel.getBoundingClientRect().width;
            document.body.classList.add("resizing");
            e.preventDefault();
        },
        { signal },
    );

    document.addEventListener(
        "mousemove",
        (e: MouseEvent) => {
            if (!isResizing) return;
            const totalWidth = wrapper.getBoundingClientRect().width;
            const delta = e.clientX - startX;
            const newPrimaryWidth = Math.min(Math.max(startPrimaryWidth + delta, totalWidth * SPLIT_VIEW_MIN_PANEL_RATIO), totalWidth * SPLIT_VIEW_MAX_PANEL_RATIO);
            const handleWidth = handle.getBoundingClientRect().width || SPLIT_VIEW_HANDLE_FALLBACK_WIDTH;
            const newSecondaryWidth = totalWidth - newPrimaryWidth - handleWidth;

            primaryPanel.style.flexBasis = `${newPrimaryWidth}px`;
            primaryPanel.style.flex = "none";
            secondaryPanel.style.flexBasis = `${newSecondaryWidth}px`;
            secondaryPanel.style.flex = "none";

            // Notify backend to reposition both BrowserViews
            window.api.send("sidebar-layout-changed");
        },
        { signal },
    );

    document.addEventListener(
        "mouseup",
        () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.classList.remove("resizing");

            // Persist the new divider position so it is restored next time split view opens.
            const totalWidth = wrapper.getBoundingClientRect().width;
            if (totalWidth > 0) {
                const currentPrimaryWidth = primaryPanel.getBoundingClientRect().width;
                const ratio = currentPrimaryWidth / totalWidth;
                window.toolboxAPI.saveSplitDividerRatio(ratio).catch(() => {
                    // ignore persistence errors
                });
            }
        },
        { signal },
    );
}

async function showTabContextMenu(instanceId: string, clientX: number, clientY: number): Promise<void> {
    const canManageTab = canManageToolTab(instanceId);
    const canCloseCurrent = canCloseTab(instanceId);
    const closableOtherTabIds = getClosableTabIds(instanceId);
    const closableTabIds = getClosableTabIds();
    // Split view: can only open in split view if there are at least 2 tools open, the tab is a real tool,
    // and it's not already the secondary tool.
    // Exclude the currently active tab: the active tool is always the primary (left) panel, so putting
    // it in the right panel too would just duplicate the same view.  The user should right-click a
    // *different* tab to choose what appears on the right.
    const hasMinimumToolsForSplit = openTools.size >= 2;
    const isNotAlreadySecondary = instanceId !== splitViewSecondaryId;
    const isNotActiveTool = instanceId !== activeToolId;
    const canOpenSplitView = canManageTab && hasMinimumToolsForSplit && isNotActiveTool && isNotAlreadySecondary;
    const canSwitchSplitSecondary = canManageTab && splitViewSecondaryId !== null && isNotAlreadySecondary && isNotActiveTool;
    let action: string | null = null;
    try {
        action = await window.toolboxAPI.utils.showContextMenu({
            x: clientX,
            y: clientY,
            items: [
                { id: "close-current", label: "Close Tab", enabled: canCloseCurrent },
                { id: "close-others", label: "Close Other Tabs", enabled: closableOtherTabIds.length > 0 },
                { id: "close-all", label: "Close All Tabs", enabled: closableTabIds.length > 0 },
                { type: "separator" },
                { id: "duplicate-tab", label: "Duplicate Tab", enabled: canManageTab },
                { id: "duplicate-tab-new-connection", label: "Duplicate Tab with New Connection", enabled: canManageTab },
                { id: "change-connection", label: "Change Connection", enabled: canManageTab },
                { type: "separator" },
                { id: "open-split-view", label: "Open in Split View", enabled: canOpenSplitView },
                { id: "switch-split-secondary", label: "Move to Right Panel", enabled: canSwitchSplitSecondary },
            ],
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn("Native context menu is unavailable", { error: message });

        if (!hasWarnedAboutMissingContextMenuHandler && message.includes("show-context-menu")) {
            hasWarnedAboutMissingContextMenuHandler = true;
            await window.toolboxAPI.utils.showNotification({
                title: "Restart Required",
                body: "The native tab context menu was added in the main process. Restart the app to load the new handler.",
                type: "warning",
            });
        }
        return;
    }

    if (!action) {
        return;
    }

    if (action === "duplicate-tab") {
        await duplicateToolTab(instanceId);
        return;
    }

    if (action === "duplicate-tab-new-connection") {
        await duplicateToolTab(instanceId, true);
        return;
    }

    if (action === "change-connection") {
        await changeToolConnectionForInstance(instanceId);
        return;
    }

    if (action === "open-split-view") {
        await enterSplitView(instanceId);
        return;
    }

    if (action === "switch-split-secondary") {
        await switchSplitViewSecondary(instanceId);
        return;
    }

    if (action === "close-current") {
        await closeTool(instanceId);
        return;
    }

    if (action === "close-others") {
        await closeOtherTabs(instanceId);
        return;
    }

    if (action === "close-all") {
        await closeTabs(getClosableTabIds());
    }
}

function attachTabContextMenu(tab: HTMLElement, instanceId: string): void {
    tab.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void showTabContextMenu(instanceId, event.clientX, event.clientY);
    });
}

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
                    const result = await openSelectMultiConnectionModal(isSecondaryRequired, tool.name, tool.features?.enabledForPowerPlatformAPI === true);
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
                    const selectedConnectionId = await openSelectConnectionModal(null, tool.name, tool.features?.enabledForPowerPlatformAPI === true);
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
                let approvedOptionalDomains: string[] | null = null;
                try {
                    approvedOptionalDomains = await openCspExceptionModal(tool);
                } catch (error) {
                    logInfo("CSP consent modal closed without selection:", { error });
                    approvedOptionalDomains = null;
                }

                if (approvedOptionalDomains === null) {
                    // User declined or closed, don't load the tool
                    window.toolboxAPI.utils.showNotification({
                        title: "Tool Launch Cancelled",
                        body: `You declined the security permissions for ${tool.name}. The tool cannot be loaded without these permissions.`,
                        type: "warning",
                    });
                    return;
                }

                // Grant consent — store required domains (for future re-consent detection) and selected optional domains
                const requiredDomainsSet = new Set<string>();
                for (const sources of Object.values(tool.cspExceptions as Record<string, CspExceptionSource[]>)) {
                    if (Array.isArray(sources)) {
                        for (const s of sources) {
                            const entry = normalizeCspExceptionSource(s);
                            if (!entry.optional) {
                                requiredDomainsSet.add(entry.domain);
                            }
                        }
                    }
                }
                const requiredDomains = Array.from(requiredDomainsSet).sort();
                await window.toolboxAPI.grantCspConsent(tool.id, requiredDomains, approvedOptionalDomains);
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
        if (options?.callerInstanceId) {
            // Intentionally fire-and-forget so the callee tool can open immediately while invocation result resolves later.
            void window.toolboxAPI
                .launchToolWithContext(options.callerInstanceId, instanceId, tool, primaryConnectionId, secondaryConnectionId ?? null, options.prefillData ?? {})
                .catch(async (error) => {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logError("Inter-tool invocation launch failed", { instanceId, error: errorMessage });
                    void window.toolboxAPI.utils.showNotification({
                        title: "Tool Launch Failed",
                        body: `Failed to launch ${tool.name}: ${errorMessage}`,
                        type: "error",
                    });
                    try {
                        await closeTool(instanceId);
                    } catch (closeError) {
                        logError("Failed to close tool after invocation launch failure", { instanceId, error: closeError instanceof Error ? closeError.message : String(closeError) });
                    }
                });
        } else {
            const launched = await window.toolboxAPI.launchToolWindow(instanceId, tool, primaryConnectionId, secondaryConnectionId);
            if (!launched) {
                window.toolboxAPI.utils.showNotification({
                    title: "Tool Launch Failed",
                    body: `Failed to launch ${tool.name}`,
                    type: "error",
                });
                return;
            }
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
        // Tab is appended synchronously; connection subtext is populated asynchronously
        createTab(instanceId, tool, instanceNumber);

        // Switch to the new tab (this will also call backend to show the BrowserView)
        switchToTool(instanceId);

        // Update toolbar buttons
        updateToolbarButtonVisibility();

        // Save session after launching
        saveSession();

        logInfo("Tool launched successfully:", { toolName: tool.name, instanceNumber: instanceNumber });
    } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)));
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

    // Create a container for the name and subtext
    const nameContainer = document.createElement("div");
    nameContainer.className = "tool-tab-name-container";
    nameContainer.appendChild(name);

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
        void closeTool(instanceId);
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

            void closeTool(instanceId);
        }
    });

    // Drag and drop events
    tab.addEventListener("dragstart", (e) => handleDragStart(e, tab));
    tab.addEventListener("dragover", (e) => handleDragOver(e, tab));
    tab.addEventListener("drop", (e) => handleDrop(e));
    tab.addEventListener("dragend", (e) => handleDragEnd(e, tab));
    attachTabContextMenu(tab, instanceId);

    tab.appendChild(nameContainer);
    tab.appendChild(pinBtn);
    tab.appendChild(closeBtn);
    toolTabs.appendChild(tab);

    void updateTabConnectionSubtext(instanceId);

    // Update scroll button visibility after adding tab
    updateTabScrollButtons();
}

async function updateTabConnectionSubtext(instanceId: string): Promise<void> {
    const tab = document.getElementById(`tool-tab-${instanceId}`);
    const nameContainer = tab?.querySelector(".tool-tab-name-container");
    const openTool = openTools.get(instanceId);

    if (!(nameContainer instanceof HTMLElement)) {
        return;
    }

    const existingSubtext = nameContainer.querySelector(".tool-tab-subtext");
    existingSubtext?.remove();

    if (!openTool || openTool.isDetailTab) {
        return;
    }

    try {
        const [primaryConnection, secondaryConnection] = await Promise.all([
            openTool.connectionId ? window.toolboxAPI.connections.getById(openTool.connectionId) : Promise.resolve(null),
            openTool.secondaryConnectionId ? window.toolboxAPI.connections.getById(openTool.secondaryConnectionId) : Promise.resolve(null),
        ]);

        const primaryLabel = primaryConnection?.name ?? null;
        const secondaryLabel = secondaryConnection?.name ?? null;

        let connectionSubtext = "";
        if (primaryLabel && secondaryLabel) {
            connectionSubtext = `${primaryLabel} / ${secondaryLabel}`;
        } else if (primaryLabel) {
            connectionSubtext = primaryLabel;
        }

        if (!connectionSubtext) {
            return;
        }

        const subtext = document.createElement("span");
        subtext.className = "tool-tab-subtext";
        subtext.textContent = connectionSubtext;
        subtext.title = connectionSubtext;
        nameContainer.appendChild(subtext);
    } catch (error) {
        const normalizedError = error instanceof Error ? error.message : String(error);
        logWarn("Failed to refresh connection names for tab:", { error: normalizedError, instanceId });
    }
}

/**
 * Open a a local page like tool details, settings, or other internal pages as a tab (shows content as a tab instead of a modal dialog)
 * @param tabId Unique identifier for the tab (e.g., "tool-detail-{toolId}")
 * @param displayName Name shown on the tab
 * @param renderContent Callback that populates the detail panel with content
 * @param tabLabelSuffix Text appended to the display name for the tab label and tooltip. Defaults to " - Details" to visually distinguish detail tabs from regular tool tabs.
 */
export async function openLocalPageAsTab(tabId: string, displayName: string, renderContent: (panel: HTMLElement) => void, tabLabelSuffix = " - Details"): Promise<void> {
    // If this tool's detail tab is already open, just switch to it
    if (openTools.has(tabId)) {
        // Refresh content in case install state changed
        detailTabs.set(tabId, renderContent);
        const detailPanel = document.getElementById("tool-detail-content-panel");
        if (detailPanel) {
            detailPanel.removeAttribute("data-tab-id");
        }
        await switchToTool(tabId);
        return;
    }

    // Store the render callback
    detailTabs.set(tabId, renderContent);

    // Create the tab element
    const toolTabs = document.getElementById("tool-tabs");
    if (!toolTabs) return;

    const tab = document.createElement("div");
    tab.className = "tool-tab tool-detail-tab";
    tab.id = `tool-tab-${tabId}`;
    tab.setAttribute("data-instance-id", tabId);
    tab.setAttribute("draggable", "false");

    const name = document.createElement("span");
    name.className = "tool-tab-name";
    name.textContent = `${displayName}${tabLabelSuffix}`;
    name.title = `${displayName}${tabLabelSuffix}`;
    tab.appendChild(name);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tool-tab-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void closeTool(tabId);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener("click", () => {
        switchToTool(tabId);
    });

    // Middle-click to close
    tab.addEventListener("mousedown", (e) => {
        if (e.button === MIDDLE_MOUSE_BUTTON) {
            e.preventDefault();
            e.stopPropagation();
            void closeTool(tabId);
        }
    });

    attachTabContextMenu(tab, tabId);

    toolTabs.appendChild(tab);

    // Register as an open tool entry (detail tab variant)
    openTools.set(tabId, {
        instanceId: tabId,
        toolId: "",
        tool: { name: displayName },
        isPinned: false,
        connectionId: null,
        secondaryConnectionId: null,
        isDetailTab: true,
    });

    // Ensure tool panel is visible
    hideHomePage();
    const toolPanel = document.getElementById("tool-panel");
    if (toolPanel) {
        toolPanel.style.display = "flex";
    }

    // Switch to the new detail tab
    await switchToTool(tabId);

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

    const openTool = openTools.get(instanceId);

    // Handle tool detail tabs (no BrowserView - content is rendered inline)
    if (openTool?.isDetailTab) {
        // Hide any active BrowserView
        window.toolboxAPI.hideToolWindows().catch((error: any) => {
            logError(error instanceof Error ? error : new Error(String(error)));
        });

        // Hide the BrowserView placeholder so detail panel gets full space
        const toolPanelContent = document.getElementById("tool-panel-content");
        if (toolPanelContent) {
            toolPanelContent.style.display = "none";
        }

        // Show detail panel and populate with this tab's content
        const detailPanel = document.getElementById("tool-detail-content-panel");
        if (detailPanel) {
            const currentTabId = detailPanel.getAttribute("data-tab-id");
            if (currentTabId !== instanceId) {
                const renderContent = detailTabs.get(instanceId);
                if (renderContent) {
                    detailPanel.innerHTML = "";
                    renderContent(detailPanel);
                    detailPanel.setAttribute("data-tab-id", instanceId);
                }
            }
            detailPanel.style.display = "flex";
        }

        await updateActiveToolConnectionStatus();
        return;
    }

    // Regular tool tab: restore tool-panel-content, hide detail panel, show BrowserView
    const toolPanelContent = document.getElementById("tool-panel-content");
    if (toolPanelContent) {
        toolPanelContent.style.display = "";
    }
    const detailPanel = document.getElementById("tool-detail-content-panel");
    if (detailPanel) {
        detailPanel.style.display = "none";
    }

    // Use IPC to switch the BrowserView in the backend
    // The ToolWindowManager will show the appropriate BrowserView
    window.toolboxAPI.switchToolWindow(instanceId).catch((error: any) => {
        logError(error instanceof Error ? error : new Error(String(error)));
    });

    // Update connection status display based on this tool's connection
    await updateActiveToolConnectionStatus();
}

/**
 * Close a tool
 */
export async function closeTool(instanceId: string): Promise<void> {
    const openTool = openTools.get(instanceId);
    if (!openTool) return;

    // Run close guard if registered for this tab
    const guard = closeGuards.get(instanceId);
    if (guard) {
        const canClose = await guard();
        if (!canClose) return;
    }

    // Check if tab is pinned (only for real tool instances, not detail tabs)
    if (!openTool.isDetailTab && openTool.isPinned) {
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

    // Clean up close guard
    closeGuards.delete(instanceId);

    // If this tool is the secondary panel in split view, deactivate split view
    if (splitViewSecondaryId === instanceId) {
        removeSplitViewUI();
        // The main process will be notified when closeToolWindow is called below
    }

    if (openTool.isDetailTab) {
        // Detail tab: clean up render callback and hide detail panel if active
        detailTabs.delete(instanceId);
        if (activeToolId === instanceId) {
            const detailPanel = document.getElementById("tool-detail-content-panel");
            if (detailPanel) {
                detailPanel.style.display = "none";
                detailPanel.removeAttribute("data-tab-id");
            }
            // Restore tool-panel-content visibility for when a real tool is shown next
            const toolPanelContent = document.getElementById("tool-panel-content");
            if (toolPanelContent) {
                toolPanelContent.style.display = "";
            }
        }
    } else {
        // Real tool: close the tool window via IPC
        // The ToolWindowManager will destroy the BrowserView
        window.toolboxAPI.closeToolWindow(instanceId).catch((error: any) => {
            logError(error instanceof Error ? error : new Error(String(error)));
        });
    }

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
export async function closeAllTools(): Promise<void> {
    // Close all tools
    const toolIds = Array.from(openTools.keys());
    for (const toolId of toolIds) {
        await closeTool(toolId);
    }
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
        openTools: Array.from(openTools.entries())
            .filter(([, tool]) => !tool.isDetailTab)
            .map(([instanceId, tool]) => ({
                instanceId,
                toolId: tool.toolId,
                isPinned: tool.isPinned,
                connectionId: tool.connectionId,
                secondaryConnectionId: tool.secondaryConnectionId,
            })),
        activeToolId: activeToolId && openTools.get(activeToolId)?.isDetailTab ? null : activeToolId,
    };
    localStorage.setItem("toolbox-session", JSON.stringify(session));
}

/**
 * Restore session from local storage
 */
export async function restoreSession(): Promise<void> {
    // Check if the user has disabled session restore
    const settings = await window.toolboxAPI.getUserSettings();
    if (settings.restoreSessionOnStartup === false) {
        return;
    }

    const sessionData = localStorage.getItem("toolbox-session");
    if (!sessionData) return;

    try {
        const session = JSON.parse(sessionData) as SessionData;
        if (session.openTools && Array.isArray(session.openTools)) {
            // Note: We can't restore exact instanceIds since they're timestamp-based
            // Instead, we launch the tools fresh, which creates new instances.
            // Saved connection IDs are passed so the tool opens without prompting
            // when authentication can be restored silently.
            for (const toolInfo of session.openTools) {
                // Attempt silent re-authentication for each saved connection.
                // If the token is still valid it will be reused directly.
                // If it can be refreshed (client-secret, username/password, stored
                // refresh token) that will happen automatically.
                // If silent auth fails (e.g. MSAL in-memory cache cleared after
                // restart and token expired), pass null so launchTool shows the
                // appropriate connection modal (single or multi, with tool name).
                let primaryConnectionId: string | null = toolInfo.connectionId ?? null;
                let secondaryConnectionId: string | null = toolInfo.secondaryConnectionId ?? null;

                if (primaryConnectionId) {
                    try {
                        await window.toolboxAPI.connections.authenticate(primaryConnectionId);
                    } catch (authError) {
                        logWarn(`Silent auth failed for primary connection ${primaryConnectionId} on session restore – connection modal will be shown`, {
                            error: authError instanceof Error ? authError.message : String(authError),
                        });
                        primaryConnectionId = null;
                    }
                }

                if (secondaryConnectionId) {
                    try {
                        await window.toolboxAPI.connections.authenticate(secondaryConnectionId);
                    } catch (authError) {
                        logWarn(`Silent auth failed for secondary connection ${secondaryConnectionId} on session restore – connection modal will be shown`, {
                            error: authError instanceof Error ? authError.message : String(authError),
                        });
                        secondaryConnectionId = null;
                    }
                }

                await launchTool(toolInfo.toolId, {
                    primaryConnectionId,
                    secondaryConnectionId,
                });
            }
            // Note: activeToolId won't match since we have new instanceIds
        }
    } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)));
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

    await updateTabConnectionSubtext(instanceId);

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
                void closeTool(activeToolId);
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
        secondaryStatusElement.style.color = "";
        secondaryStatusElement.style.backgroundColor = "";
    }

    if (!activeToolId) {
        // No active tool, show "Not Connected"
        statusElement.textContent = "Not Connected";
        statusElement.className = "connection-status";
        statusElement.style.color = "";
        statusElement.style.backgroundColor = "";
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
            const primaryHasCustomColor = !isPrimaryExpired && primaryConnection.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(primaryConnection.environmentColor);
            if (primaryHasCustomColor) {
                statusElement.className = `connection-status ${primaryStatusClass}`;
                statusElement.style.color = primaryConnection.environmentColor as string;
                statusElement.style.backgroundColor = `${primaryConnection.environmentColor}1a`;
            } else {
                statusElement.className = `connection-status ${primaryStatusClass} ${primaryEnvClass}`;
                statusElement.style.color = "";
                statusElement.style.backgroundColor = "";
            }

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
                        const secondaryHasCustomColor = !isSecondaryExpired && secondaryConnection.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(secondaryConnection.environmentColor);
                        if (secondaryHasCustomColor) {
                            secondaryStatusElement.className = `secondary-connection-status ${secondaryStatusClass} visible`;
                            secondaryStatusElement.style.color = secondaryConnection.environmentColor as string;
                            secondaryStatusElement.style.backgroundColor = `${secondaryConnection.environmentColor}1a`;
                        } else {
                            secondaryStatusElement.className = `secondary-connection-status ${secondaryStatusClass} visible ${secondaryEnvClass}`;
                            secondaryStatusElement.style.color = "";
                            secondaryStatusElement.style.backgroundColor = "";
                        }

                        // Update tool panel border based on both primary and secondary environment
                        updateToolPanelBorder(
                            primaryConnection.environment,
                            secondaryConnection.environment,
                            primaryConnection.environmentColor,
                            secondaryConnection.environmentColor,
                            primaryConnection.categoryColor,
                            secondaryConnection.categoryColor,
                        );
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
            updateToolPanelBorder(primaryConnection.environment, null, primaryConnection.environmentColor, null, primaryConnection.categoryColor);
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
                statusElement.style.color = "";
                statusElement.style.backgroundColor = "";
            } else {
                statusElement.textContent = `${activeTool.tool.name} is connected to: ${toolConnection.name}`;
                const singleHasCustomColor = toolConnection.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(toolConnection.environmentColor);
                if (singleHasCustomColor) {
                    statusElement.className = `connection-status connected`;
                    statusElement.style.color = toolConnection.environmentColor as string;
                    statusElement.style.backgroundColor = `${toolConnection.environmentColor}1a`;
                } else {
                    statusElement.className = `connection-status connected ${envClass}`;
                    statusElement.style.color = "";
                    statusElement.style.backgroundColor = "";
                }
            }
            // Update tool panel border based on environment
            updateToolPanelBorder(toolConnection.environment, null, toolConnection.environmentColor, null, toolConnection.categoryColor);
            return;
        }
    }
    // Tool doesn't have a connection
    statusElement.textContent = `${activeTool.tool.name} is not connected`;
    statusElement.className = "connection-status";
    statusElement.style.color = "";
    statusElement.style.backgroundColor = "";
    // Clear tool panel border
    updateToolPanelBorder(null);
}

/**
 * Resolve the CSS-variable-based border color for a given environment type.
 * Used as a fallback when no custom environmentColor is set on a connection.
 */
function getEnvBorderColor(environment: string): string {
    const styles = getComputedStyle(document.documentElement);
    const varMap: Record<string, string> = {
        dev: "--env-border-dev",
        test: "--env-border-test",
        uat: "--env-border-uat",
        production: "--env-border-prod",
    };
    const cssVar = varMap[environment.toLowerCase()] || "--env-border-dev";
    return styles.getPropertyValue(cssVar).trim() || "#8a8886";
}

/**
 * Update the tool panel border and tab highlight based on the connection environment
 * @param environment The connection environment (Dev, Test, UAT, Production) or null to clear
 */
function updateToolPanelBorder(
    environment: string | null,
    secondaryEnvironment?: string | null,
    environmentColor?: string | null,
    secondaryEnvironmentColor?: string | null,
    categoryColor?: string | null,
    secondaryCategoryColor?: string | null,
): void {
    const envThickness = _environmentColorThickness;
    const catThickness = _categoryColorThickness;

    const toolPanelWrapper = document.getElementById("tool-panel-content-wrapper");
    if (toolPanelWrapper) {
        // Remove all environment classes from panel
        const classesToRemove = Array.from(toolPanelWrapper.classList).filter((cls) => cls.startsWith("env-") || cls.startsWith("multi-env-"));
        classesToRemove.forEach((cls) => toolPanelWrapper.classList.remove(cls));
        // Reset inline styles
        toolPanelWrapper.style.border = "";
        toolPanelWrapper.style.borderImage = "";

        if (_showEnvironmentColor) {
            // Add the appropriate class or inline style based on environment(s)
            if (environment && secondaryEnvironment) {
                const primaryColor = environmentColor && /^#[0-9A-Fa-f]{6}$/.test(environmentColor) ? environmentColor : null;
                const secColor = secondaryEnvironmentColor && /^#[0-9A-Fa-f]{6}$/.test(secondaryEnvironmentColor) ? secondaryEnvironmentColor : null;
                if (primaryColor || secColor) {
                    // At least one connection has a custom color — use inline gradient border
                    const leftColor = primaryColor || getEnvBorderColor(environment);
                    const rightColor = secColor || getEnvBorderColor(secondaryEnvironment);
                    toolPanelWrapper.style.border = `${envThickness}px solid transparent`;
                    toolPanelWrapper.style.borderImage = `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%) 1`;
                } else {
                    const primaryEnvClass = environment.toLowerCase();
                    const secondaryEnvClass = secondaryEnvironment.toLowerCase();
                    if (primaryEnvClass === secondaryEnvClass) {
                        toolPanelWrapper.classList.add(`env-${primaryEnvClass}`);
                    } else {
                        const multiEnvClass = `multi-env-${primaryEnvClass}-${secondaryEnvClass}`;
                        toolPanelWrapper.classList.add(multiEnvClass);
                    }
                    toolPanelWrapper.style.setProperty("--env-border-thickness", `${envThickness}px`);
                }
            } else if (environment) {
                if (environmentColor && /^#[0-9A-Fa-f]{6}$/.test(environmentColor)) {
                    toolPanelWrapper.style.border = `${envThickness}px solid ${environmentColor}`;
                } else {
                    const envClass = `env-${environment.toLowerCase()}`;
                    toolPanelWrapper.classList.add(envClass);
                    toolPanelWrapper.style.setProperty("--env-border-thickness", `${envThickness}px`);
                }
            }
        }
    }

    // Update the active tab highlight based solely on category color(s).
    // If no category color is set the tab shows no color indicator (no env-class fallback).
    if (activeToolId) {
        const activeTab = document.getElementById(`tool-tab-${activeToolId}`);
        if (activeTab) {
            // Remove all environment classes from tab
            activeTab.classList.remove("env-dev", "env-test", "env-uat", "env-production");
            // Reset inline styles (including any previous border-image gradient)
            activeTab.style.borderBottom = "";
            activeTab.style.removeProperty("border-image");

            if (_showCategoryColor) {
                const primaryCatColor = categoryColor && /^#[0-9A-Fa-f]{6}$/.test(categoryColor) ? categoryColor : null;
                const secondaryCatColor = secondaryCategoryColor && /^#[0-9A-Fa-f]{6}$/.test(secondaryCategoryColor) ? secondaryCategoryColor : null;

                if (primaryCatColor && secondaryCatColor && primaryCatColor !== secondaryCatColor) {
                    // Dual connection with two different category colors — split gradient on bottom border
                    activeTab.style.borderBottom = `${catThickness}px solid transparent`;
                    activeTab.style.setProperty("border-image", `linear-gradient(to right, ${primaryCatColor} 50%, ${secondaryCatColor} 50%) 0 0 1 0 / 0 0 ${catThickness}px 0`);
                } else {
                    const singleColor = primaryCatColor || secondaryCatColor;
                    if (singleColor) {
                        activeTab.style.borderBottom = `${catThickness}px solid ${singleColor}`;
                    }
                    // If no category color is present, leave the tab with no color indicator
                }
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

    await changeToolConnectionForInstance(activeTool.instanceId);
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

    await updateTabConnectionSubtext(instanceId);

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
        const selectedConnectionId = await openSelectConnectionModal(activeTool.secondaryConnectionId, activeTool.tool?.name);

        // After modal closes with a successful connection, update the tool's secondary connection
        if (selectedConnectionId && activeToolId) {
            await setToolSecondaryConnection(activeToolId, selectedConnectionId);

            // Get connection from all connections list
            const connections = await window.toolboxAPI.connections.getAll();
            const connection = connections.find((c: Connection) => c.id === selectedConnectionId);
            window.toolboxAPI.utils.showNotification({
                title: "Secondary Connection Set",
                body: `${activeTool.tool.name} secondary connection is now connected to ${connection?.name || "the selected connection"}.`,
                type: "success",
            });
        }
    } catch (error) {
        // User cancelled or error occurred
        logError("Secondary connection selection cancelled or failed", error);
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

/**
 * Initialise the shell-level invocation banner shown above tool content when a callee tool is active.
 *
 * The main process pushes INVOCATION_BANNER_STATE whenever the active tool changes.
 * - visible: true  → show the banner with the caller's display name
 * - visible: false → hide the banner
 *
 * The banner is only shown when the invocation was launched without `noReturn: true`.
 * For one-way "Send To" flows (`noReturn: true`) no banner is shown.
 *
 * The banner text reads "Launched from [CallerToolName]" and the return button reads
 * "Return to [CallerToolName]".
 *
 * Clicking "Return to …" triggers RETURN_INVOCATION_DATA with a null payload (banner early-return path):
 *   - The active invocation resolves with null on the caller side
 *   - PPTB auto-closes the callee window
 *
 * Clicking "✕" (dismiss) hides the banner for the session but does NOT cancel the invocation.
 */
export function initializeInvocationBanner(): void {
    const banner = document.getElementById("invocation-banner");
    const bannerText = document.getElementById("invocation-banner-text");
    const returnBtn = document.getElementById("invocation-banner-return");
    const dismissBtn = document.getElementById("invocation-banner-dismiss");

    if (!banner || !bannerText || !returnBtn || !dismissBtn) return;

    // Listen for banner state pushes from the main process
    window.toolboxAPI.onInvocationBannerState((state) => {
        if (state.visible && state.callerToolName) {
            bannerText.textContent = `Launched from ${state.callerToolName}`;
            returnBtn.textContent = `Return to ${state.callerToolName}`;
            banner.style.display = "flex";
        } else {
            banner.style.display = "none";
        }
        // Notify the main process so it can re-request BrowserView bounds that
        // account for the banner height (or restore full-height when hidden).
        window.api.send("invocation-banner-visibility-changed");
    });

    // "Return" button: trigger banner early-return path
    returnBtn.addEventListener("click", () => {
        void window.toolboxAPI.returnToCallerBanner();
        banner.style.display = "none";
    });

    // "Dismiss" button: hide banner only — does NOT end the invocation.
    // After hiding, notify the main process to restore full-height BrowserView bounds.
    dismissBtn.addEventListener("click", () => {
        banner.style.display = "none";
        window.api.send("invocation-banner-visibility-changed");
    });
}

/**
 * Listen for invocation connection prompts from the main process.
 *
 * When an invoked callee tool requires a secondary connection that was not inherited from
 * the caller (e.g. DMS requires both primary + secondary but FXS only has primary), the
 * main process sends INVOCATION_PROMPT_CONNECTIONS. This handler shows the
 * multi-connection selector and returns the chosen IDs back to the main process via
 * PROVIDE_INVOCATION_CONNECTIONS.
 */
export function initializeInvocationConnectionsPrompt(): void {
    window.toolboxAPI.onInvocationConnectionsPrompt(async ({ requestId, toolName, isSecondaryRequired, inheritedPrimaryConnectionId }) => {
        try {
            const result = await openSelectMultiConnectionModal(isSecondaryRequired, toolName);
            await window.toolboxAPI.provideInvocationConnections(requestId, {
                primaryConnectionId: result.primaryConnectionId ?? inheritedPrimaryConnectionId,
                secondaryConnectionId: result.secondaryConnectionId,
            });
        } catch (err) {
            // User cancelled or modal failed – notify main process so it can reject the launch
            logWarn(`[invocationConnectionsPrompt] Connection modal cancelled or failed: ${err instanceof Error ? err.message : String(err)}`);
            await window.toolboxAPI.provideInvocationConnections(requestId, null);
        }
    });
}

/**
 * Listen for callee tool lifecycle events pushed by the main process when a tool is
 * launched via inter-tool invocation (invocation.launchTool()).
 *
 * CALLEE_TOOL_OPENED: the callee BrowserView was successfully created. The renderer
 *   registers a new entry in openTools and creates a dedicated tab so the callee
 *   appears as its own independent instance rather than replacing the caller's tab.
 *
 * CALLEE_TOOL_CLOSED: the callee was auto-closed by the main process after it returned
 *   data (resolveInvocation path). The renderer removes the callee tab and switches
 *   back to the caller tool.
 */
export function initializeCalleeToolListeners(): void {
    window.toolboxAPI.onCalleeToolOpened(({ calleeInstanceId, tool, primaryConnectionId, secondaryConnectionId }) => {
        // Ensure the tool panel is visible (it may already be open via the caller, but
        // guard against edge cases where the caller launched without the panel shown).
        hideHomePage();
        const toolPanel = document.getElementById("tool-panel");
        if (toolPanel) {
            toolPanel.style.display = "flex";
        }

        // Avoid double-registration if the event fires more than once.
        if (openTools.has(calleeInstanceId)) {
            return;
        }

        // Determine the instance number for the display name.
        const existingInstances = Array.from(openTools.values()).filter((t) => !t.isDetailTab && t.toolId === tool.id);
        const instanceNumber = existingInstances.length + 1;

        // Register the callee in the open-tools map so all tab management
        // functions (close, pin, context menu, session save, etc.) work correctly.
        openTools.set(calleeInstanceId, {
            instanceId: calleeInstanceId,
            toolId: tool.id,
            tool: tool,
            isPinned: false,
            connectionId: primaryConnectionId,
            secondaryConnectionId: secondaryConnectionId,
        });

        // Create the visual tab for the callee.
        createTab(calleeInstanceId, tool, instanceNumber);

        // Set the callee as the active tab in the renderer (the main process has already
        // switched the BrowserView — we only update renderer state here to stay in sync).
        activeToolId = calleeInstanceId;
        document.querySelectorAll(".tool-tab").forEach((tab) => {
            tab.classList.remove("active");
        });
        const calleeTab = document.getElementById(`tool-tab-${calleeInstanceId}`);
        if (calleeTab) {
            calleeTab.classList.add("active");
        }

        updateToolbarButtonVisibility();
        updateTabScrollButtons();
        saveSession();

        // Refresh the connection status strip for the newly active callee tab.
        updateActiveToolConnectionStatus().catch((err) => {
            logError(err instanceof Error ? err : new Error(String(err)));
        });
    });

    window.toolboxAPI.onCalleeToolClosed(({ calleeInstanceId, callerInstanceId }) => {
        // Remove the callee tab element from the DOM.
        const calleeTab = document.getElementById(`tool-tab-${calleeInstanceId}`);
        if (calleeTab) {
            calleeTab.remove();
        }

        // Clean up any registered close guard for this instance.
        closeGuards.delete(calleeInstanceId);

        // Remove from the open-tools map.
        openTools.delete(calleeInstanceId);

        updateToolbarButtonVisibility();
        updateTabScrollButtons();
        saveSession();

        // Switch back to the caller tool if it is still open, otherwise fall back to
        // the most-recently-opened tool, or show the home page when no tools remain.
        if (openTools.has(callerInstanceId)) {
            void switchToTool(callerInstanceId);
        } else if (openTools.size > 0) {
            const lastInstanceId = Array.from(openTools.keys())[openTools.size - 1];
            void switchToTool(lastInstanceId);
        } else {
            activeToolId = null;
            const toolPanel = document.getElementById("tool-panel");
            if (toolPanel) {
                toolPanel.style.display = "none";
            }
            showHomePage();
        }
    });
}
