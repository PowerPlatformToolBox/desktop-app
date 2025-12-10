/**
 * Marketplace management module
 * Handles tool library, marketplace UI, and tool installation
 */

import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getToolDetailModalControllerScript } from "../modals/toolDetail/controller";
import { getToolDetailModalView } from "../modals/toolDetail/view";
import type { ToolDetail } from "../types/index";
import { onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";
import { loadSidebarTools } from "./toolsSidebarManagement";

interface RegistryTool {
    id: string;
    name: string;
    description: string;
    authors?: string[];
    version: string;
    icon?: string;
    downloadUrl?: string;
    readme?: string;
    categories?: string[];
    downloads?: number;
    rating?: number;
    aum?: number;
}

interface InstalledTool {
    id: string;
    version: string;
    name?: string;
}

interface ExtendedToolDetail extends ToolDetail {
    icon?: string;
    iconUrl?: string;
    readme?: string;
    readmeUrl?: string;
}

// Tool library loaded from registry
let toolLibrary: ToolDetail[] = [];

const TOOL_DETAIL_MODAL_CHANNELS = {
    install: "tool-detail:install",
    installResult: "tool-detail:install:result",
} as const;

const TOOL_DETAIL_MODAL_DIMENSIONS = {
    width: 860,
    height: 720,
};

let toolDetailModalHandlersRegistered = false;
let activeToolDetailModal: { tool: ExtendedToolDetail; isInstalled: boolean } | null = null;

/**
 * Get tool library
 */
export function getToolLibrary(): ToolDetail[] {
    return toolLibrary;
}

/**
 * Load tools library from registry
 */
export async function loadToolsLibrary(): Promise<void> {
    try {
        // Fetch tools from registry
        // TODO readmeurl
        const registryTools = await window.toolboxAPI.fetchRegistryTools();
        console.log(registryTools);

        // Map registry tools to the format expected by the UI
        toolLibrary = (registryTools as RegistryTool[]).map(
            (tool) =>
                ({
                    id: tool.id,
                    name: tool.name,
                    description: tool.description,
                    authors: tool.authors,
                    categories: tool.categories,
                    version: tool.version,
                    icon: tool.icon,
                    downloads: tool.downloads,
                    rating: tool.rating,
                    aum: tool.aum,
                } as ToolDetail),
        );

        console.log(`Loaded ${toolLibrary.length} tools from registry`);
    } catch (error) {
        console.error("Failed to load tools from registry:", error);
        toolLibrary = [];
        // Error will be shown in the marketplace UI
    }
}

/**
 * Load and display marketplace tools
 */
export async function loadMarketplace(): Promise<void> {
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
    const installedToolsMap = new Map((installedTools as InstalledTool[]).map((t) => [t.id, t]));

    // Filter based on search
    const searchInput = document.getElementById("marketplace-search-input") as HTMLInputElement | null; // Fluent UI text field
    const searchTerm = searchInput?.value ? searchInput.value.toLowerCase() : "";

    const filteredTools = !searchTerm
        ? toolLibrary
        : toolLibrary.filter((t) => {
              const haystacks: string[] = [t.name || "", t.description || ""]; // name + description
              if (t.authors && t.authors.length) haystacks.push(t.authors.join(", "));
              if ((t as any).categories && (t as any).categories.length) haystacks.push((t as any).categories.join(", "));
              return haystacks.some((h) => h.toLowerCase().includes(searchTerm));
          });

    // Show empty state if no tools match the search
    if (filteredTools.length === 0) {
        marketplaceList.innerHTML = `
            <div class="empty-state">
                <p>No matching tools</p>
                <p class="empty-state-hint">${searchTerm ? "Try a different search term." : "Check back later for new tools."}</p>
            </div>
        `;
        return;
    }

    marketplaceList.innerHTML = filteredTools
        .map((tool) => {
            console.log(tool);

            const installedTool = installedToolsMap.get(tool.id);
            const isInstalled = !!installedTool;
            const isDarkTheme = document.body.classList.contains("dark-theme");
            const topCategories = tool.categories && tool.categories.length ? tool.categories.slice(0, 2) : [];
            const categoriesHtml = topCategories.length ? topCategories.map((t) => `<span class="tool-tag">${t}</span>`).join("") : "";
            const analyticsHtml = `<div class="marketplace-analytics-left">
                ${tool.downloads !== undefined ? `<span class="marketplace-metric" title="Downloads">⬇ ${tool.downloads}</span>` : ""}
                ${tool.rating !== undefined ? `<span class="marketplace-metric" title="Rating">⭐ ${tool.rating.toFixed(1)}</span>` : ""}
                ${tool.aum !== undefined ? `<span class="marketplace-metric" title="Active User Months">👥 ${tool.aum}</span>` : ""}
            </div>`;
            const authorsDisplay = tool.authors && tool.authors.length ? tool.authors.join(", ") : "";

            // Icon handling (retain improved fallback logic)
            const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
            let toolIconHtml = "";
            if (tool.icon) {
                if (tool.icon.startsWith("http://") || tool.icon.startsWith("https://")) {
                    toolIconHtml = `<img src="${tool.icon}" alt="${tool.name} icon" class="tool-item-icon-img" onerror="this.src='${defaultToolIcon}'" />`;
                } else {
                    toolIconHtml = `<span class="tool-item-icon-text">${tool.icon}</span>`;
                }
            } else {
                toolIconHtml = `<img src="${defaultToolIcon}" alt="Tool icon" class="tool-item-icon-img" />`;
            }

            return `
        <div class="marketplace-item-pptb ${isInstalled ? "installed" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-top-tags">${categoriesHtml}${isInstalled ? ' <span class="marketplace-item-installed-badge">Installed</span>' : ""}</div>
            <div class="marketplace-item-header-pptb">
                <span class="marketplace-item-icon-pptb">${toolIconHtml}</span>
                <div class="marketplace-item-info-pptb">
                    <div class="marketplace-item-name-pptb">
                        ${tool.name}
                    </div>
                    <div class="marketplace-item-author-pptb">by ${authorsDisplay}</div>
                </div>
            </div>
            <div class="marketplace-item-description-pptb">${tool.description}</div>
            <div class="marketplace-item-footer-pptb">
                ${analyticsHtml}
                <div class="marketplace-item-actions-right">
                    ${!isInstalled ? `<button class="fluent-button fluent-button-primary" data-action="install" data-tool-id="${tool.id}">Install</button>` : ""}
                </div>
            </div>
        </div>
    `;
        })
        .join("");

    // Add click handlers for marketplace items to open detail view
    marketplaceList.querySelectorAll(".marketplace-item-pptb").forEach((item) => {
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
    marketplaceList.querySelectorAll(".marketplace-item-actions-right button").forEach((button) => {
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

    // Setup search without replacing the input (to avoid cursor loss)
    if (searchInput && !(searchInput as any)._pptbBound) {
        (searchInput as any)._pptbBound = true;
        searchInput.addEventListener("input", () => {
            loadMarketplace();
        });
    }
}

/**
 * Open tool detail modal (BrowserWindow-based)
 */
async function openToolDetail(tool: ToolDetail, isInstalled: boolean): Promise<void> {
    initializeToolDetailModalBridge();
    const extendedTool = tool as ExtendedToolDetail;
    activeToolDetailModal = { tool: extendedTool, isInstalled };

    try {
        const readmeHtml = await loadToolReadmeHtml(extendedTool);
        const modalHtml = buildToolDetailModalHtml(extendedTool, readmeHtml, isInstalled);

        await showBrowserWindowModal({
            id: `tool-detail-modal-${tool.id}`,
            html: modalHtml,
            width: TOOL_DETAIL_MODAL_DIMENSIONS.width,
            height: TOOL_DETAIL_MODAL_DIMENSIONS.height,
        });
    } catch (error) {
        console.error("Failed to open tool detail modal", error);
        await window.toolboxAPI.utils.showNotification({
            title: "Tool Details",
            body: `Unable to open modal: ${formatError(error)}`,
            type: "error",
        });
        activeToolDetailModal = null;
    }
}

function initializeToolDetailModalBridge(): void {
    if (toolDetailModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleToolDetailModalMessage);
    onBrowserWindowModalClosed(handleToolDetailModalClosed);
    toolDetailModalHandlersRegistered = true;
}

function handleToolDetailModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload.channel !== "string") return;

    switch (payload.channel) {
        case TOOL_DETAIL_MODAL_CHANNELS.install:
            void handleToolDetailInstallRequest();
            break;
        default:
            break;
    }
}

async function handleToolDetailInstallRequest(): Promise<void> {
    if (!activeToolDetailModal) return;

    try {
        await window.toolboxAPI.installToolFromRegistry(activeToolDetailModal.tool.id);

        window.toolboxAPI.utils.showNotification({
            title: "Tool Installed",
            body: `${activeToolDetailModal.tool.name} has been installed successfully`,
            type: "success",
        });

        activeToolDetailModal.isInstalled = true;

        await loadMarketplace();
        await loadSidebarTools();

        await sendBrowserWindowModalMessage({
            channel: TOOL_DETAIL_MODAL_CHANNELS.installResult,
            data: {
                success: true,
            },
        });
    } catch (error) {
        const errorMessage = formatError(error);
        await sendBrowserWindowModalMessage({
            channel: TOOL_DETAIL_MODAL_CHANNELS.installResult,
            data: {
                success: false,
                error: errorMessage,
            },
        });
        await window.toolboxAPI.utils.showNotification({
            title: "Installation Failed",
            body: `Failed to install tool: ${errorMessage}`,
            type: "error",
        });
    }
}

function handleToolDetailModalClosed(payload: ModalWindowClosedPayload): void {
    if (!payload || typeof payload.id !== "string") {
        activeToolDetailModal = null;
        return;
    }

    if (payload.id.startsWith("tool-detail-modal-")) {
        activeToolDetailModal = null;
    }
}

function buildToolDetailModalHtml(tool: ExtendedToolDetail, readmeHtml: string, isInstalled: boolean): string {
    const authorsDisplay = tool.authors && tool.authors.length ? tool.authors.join(", ") : "Unknown author";
    const metaBadges: string[] = [];
    if (tool.version) metaBadges.push(`v${tool.version}`);
    if (tool.downloads !== undefined) metaBadges.push(`${tool.downloads.toLocaleString()} downloads`);
    if (tool.rating !== undefined) metaBadges.push(`${tool.rating.toFixed(1)} rating`);
    const categories = tool.categories && tool.categories.length ? tool.categories.map((category) => escapeHtml(category)) : [];

    const { styles, body } = getToolDetailModalView({
        toolId: escapeHtml(tool.id),
        name: escapeHtml(tool.name),
        description: escapeHtml(tool.description || ""),
        iconHtml: buildToolIconHtml(tool),
        authors: escapeHtml(authorsDisplay),
        metaBadges: metaBadges.map((badge) => escapeHtml(badge)),
        categories: categories,
        readmeHtml,
        isInstalled,
    });

    const script = getToolDetailModalControllerScript({
        channels: TOOL_DETAIL_MODAL_CHANNELS,
        state: {
            toolId: tool.id,
            toolName: tool.name,
            isInstalled,
        },
    });

    return `${styles}\n${body}\n${script}`.trim();
}

async function loadToolReadmeHtml(tool: ExtendedToolDetail): Promise<string> {
    const readmeUrl = tool.readme || tool.readmeUrl;
    if (!readmeUrl) {
        return '<p class="loading-text">No README available</p>';
    }

    try {
        const response = await fetch(readmeUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const markdown = await response.text();
        return convertMarkdownToHtml(markdown);
    } catch (error) {
        console.error("Failed to load README", error);
        return '<p class="loading-text">Failed to load README</p>';
    }
}

function buildToolIconHtml(tool: ExtendedToolDetail): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
    const iconUrl = tool.iconUrl || tool.icon;

    if (!iconUrl) {
        return `<img src="${defaultToolIcon}" alt="${escapeHtml(tool.name)} icon" />`;
    }

    if (iconUrl.startsWith("http://") || iconUrl.startsWith("https://")) {
        return `<img src="${iconUrl}" alt="${escapeHtml(tool.name)} icon" onerror="this.src='${defaultToolIcon}'" />`;
    }

    if (iconUrl.length <= 4) {
        return `<span style="font-size:48px;line-height:1">${escapeHtml(iconUrl)}</span>`;
    }

    return `<span style="font-size:20px;font-weight:600">${escapeHtml(iconUrl)}</span>`;
}

/**
 * Simple markdown to HTML converter
 */
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

function escapeHtml(value: string): string {
    return value ? value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : "";
}

function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}
