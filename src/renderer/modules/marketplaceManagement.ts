/**
 * Marketplace management module
 * Handles tool library, marketplace UI, and tool installation
 */

import { captureMessage, logInfo } from "../../common/sentryHelper";
import type { ModalWindowClosedPayload, ModalWindowMessagePayload, Tool } from "../../common/types";
import { getToolDetailModalControllerScript } from "../modals/toolDetail/controller";
import { getToolDetailModalView } from "../modals/toolDetail/view";
import type { ToolDetail } from "../types/index";
import { applyToolIconMasks, escapeHtml, generateToolIconHtml, resolveToolIconUrl } from "../utils/toolIconResolver";
import { onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";
import { loadSidebarTools } from "./toolsSidebarManagement";

interface InstalledTool {
    id: string;
    version: string;
    name?: string;
}

// Tool library loaded from registry
let toolLibrary: ToolDetail[] = [];

const TOOL_DETAIL_MODAL_CHANNELS = {
    install: "tool-detail:install",
    installResult: "tool-detail:install:result",
    review: "tool-detail:review",
    repository: "tool-detail:repository",
    website: "tool-detail:website",
} as const;

const TOOL_DETAIL_MODAL_DIMENSIONS = {
    width: 860,
    height: 720,
};

const DEFAULT_TOOL_ICON_DARK_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M17 12V10.5C16.9948 10.3854 16.9714 10.2943 16.9297 10.2266C16.888 10.1589 16.8307 10.1094 16.7578 10.0781C16.6849 10.0469 16.6068 10.0261 16.5234 10.0156C16.4401 10.0052 16.3542 10 16.2656 10H16V5.1172C16.0312 5.04949 16.0755 4.96876 16.1328 4.87501C16.1901 4.78126 16.2448 4.67709 16.2969 4.56251C16.349 4.44792 16.3958 4.34115 16.4375 4.24219C16.4792 4.14323 16.5 4.06251 16.5 4.00001C16.4948 3.9375 16.4714 3.83073 16.4297 3.67969C16.388 3.52865 16.3359 3.36459 16.2734 3.1875C16.2109 3.01042 16.151 2.84375 16.0938 2.6875C16.0365 2.53125 15.9974 2.41667 15.9766 2.34375C15.9349 2.23958 15.8724 2.15625 15.7891 2.09375C15.7057 2.03125 15.6094 2 15.5 2H13.5C13.3906 2.00521 13.2917 2.03906 13.2031 2.10156C13.1146 2.16406 13.0547 2.24479 13.0234 2.34375C12.9974 2.42188 12.9557 2.53906 12.8984 2.69531C12.8411 2.85156 12.7839 3.01823 12.7266 3.19532C12.6693 3.3724 12.6172 3.53646 12.5703 3.6875C12.5234 3.83855 12.5 3.94271 12.5 4.00001C12.5 4.07292 12.5208 4.15626 12.5625 4.25001C12.6042 4.34376 12.6536 4.44792 12.7109 4.56251C12.7682 4.67709 12.8229 4.78386 12.875 4.88282C12.9271 4.98178 12.9688 5.0599 13 5.1172V10H12.7344C12.6406 10 12.5521 10.0052 12.4688 10.0156C12.3854 10.0261 12.3073 10.0495 12.2344 10.086C12.1615 10.1224 12.1042 10.1719 12.0625 10.2344C12.0208 10.2969 12 10.3854 12 10.5V12H17ZM17 13H12V15.5547C12 15.8933 12.0677 16.211 12.2031 16.5078C12.3385 16.8047 12.5208 17.0651 12.75 17.2891C12.9792 17.5131 13.2448 17.6875 13.5469 17.8125C13.849 17.9375 14.1667 18 14.5 18C14.8333 18 15.151 17.9349 15.4531 17.8047C15.7552 17.6745 16.0208 17.5 16.25 17.2813C16.4792 17.0625 16.6615 16.8047 16.7969 16.5078C16.9323 16.211 17 15.8933 17 15.5547V13ZM5.77946 2.12641C5.91734 2.21934 6 2.37474 6 2.54102V5.99806C6 6.55034 6.44772 6.99806 7 6.99806C7.55228 6.99806 8 6.55034 8 5.99806V2.54102C8 2.37474 8.08266 2.21934 8.22054 2.12641C8.35842 2.03347 8.53348 2.01516 8.68761 2.07755C10.3358 2.74474 11.5 4.36095 11.5 6.25026C11.5 8.01784 10.481 9.54637 9 10.2824V15.998C9 17.1026 8.10457 17.998 7 17.998C5.89543 17.998 5 17.1026 5 15.998V10.2824C3.51897 9.54637 2.5 8.01784 2.5 6.25026C2.5 4.36095 3.66416 2.74474 5.31239 2.07755C5.46652 2.01516 5.64158 2.03347 5.77946 2.12641Z" fill="#ffffff"/>
</svg>`;

let toolDetailModalHandlersRegistered = false;
let activeToolDetailModal: { tool: ToolDetail; isInstalled: boolean } | null = null;

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
        const registryTools = await window.toolboxAPI.fetchRegistryTools();

        // Map registry tools to the format expected by the UI
        toolLibrary = (registryTools as Tool[]).map(
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
                    mau: tool.mau,
                    readmeUrl: tool.readmeUrl,
                    status: tool.status,
                    repository: tool.repository,
                    website: tool.website,
                    createdAt: tool.createdAt, // Use createdAt for new tool detection
                }) as ToolDetail,
        );

        logInfo(`Loaded ${toolLibrary.length} tools from registry`);
    } catch (error) {
        captureMessage("Failed to load tools from registry:", "error", { extra: { error } });
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

    // Get display mode setting
    const displayMode = ((await window.toolboxAPI.getSetting("toolDisplayMode")) as string) || "standard";

    // Get filter and sort values
    const searchInput = document.getElementById("marketplace-search-input") as HTMLInputElement | null;
    const categoryFilter = document.getElementById("marketplace-category-filter") as HTMLSelectElement | null;
    const authorFilter = document.getElementById("marketplace-author-filter") as HTMLSelectElement | null;
    const newFilter = document.getElementById("marketplace-new-filter") as HTMLInputElement | null;
    const sortSelect = document.getElementById("marketplace-sort-select") as HTMLSelectElement | null;

    const searchTerm = searchInput?.value ? searchInput.value.toLowerCase() : "";
    const selectedCategory = categoryFilter?.value || "";
    const selectedAuthor = authorFilter?.value || "";
    const showNewOnly = newFilter?.checked || false;
    const deprecatedToolsVisibility = (await window.toolboxAPI.getSetting("deprecatedToolsVisibility")) || "hide-all";

    // Get saved sort preference or default
    const savedSort = await window.toolboxAPI.getSetting("marketplaceSort");
    const sortOption = (sortSelect?.value as any) || savedSort || "name-asc";

    // Set the dropdown value if we have a saved preference
    if (sortSelect && savedSort && !sortSelect.value) {
        sortSelect.value = savedSort as string;
    }

    // Populate filter dropdowns
    populateMarketplaceFilters();

    // Apply filters
    let filteredTools = toolLibrary.filter((t) => {
        // Search filter
        if (searchTerm) {
            const haystacks: string[] = [t.name || "", t.description || ""];
            if (t.authors && t.authors.length) haystacks.push(t.authors.join(", "));
            if (t.categories && t.categories.length) haystacks.push(t.categories.join(", "));
            if (!haystacks.some((h) => h.toLowerCase().includes(searchTerm))) {
                return false;
            }
        }

        const toolIsNew = isToolNew(t);

        // Category filter
        if (selectedCategory && (!t.categories || !t.categories.includes(selectedCategory))) {
            return false;
        }

        // Author filter
        if (selectedAuthor && (!t.authors || !t.authors.includes(selectedAuthor))) {
            return false;
        }

        // New tools filter
        if (showNewOnly && !toolIsNew) {
            return false;
        }

        // Deprecated filter
        if (t.status === "deprecated") {
            if (deprecatedToolsVisibility === "hide-all" || deprecatedToolsVisibility === "show-installed") {
                return false;
            }
        }

        return true;
    });

    // Sort tools based on selected option
    filteredTools = filteredTools.sort((a, b) => {
        switch (sortOption) {
            case "name-asc":
                return a.name.localeCompare(b.name);
            case "name-desc":
                return b.name.localeCompare(a.name);
            case "popularity":
                // Sort by MAU (Monthly Active Users) - higher is better
                return (b.mau || 0) - (a.mau || 0);
            case "rating":
                // Sort by rating - higher is better
                return (b.rating || 0) - (a.rating || 0);
            case "downloads":
                // Sort by downloads - higher is better
                return (b.downloads || 0) - (a.downloads || 0);
            default:
                return a.name.localeCompare(b.name);
        }
    });

    // Show empty state if no tools match the search
    if (filteredTools.length === 0) {
        const hasSearchTerm = searchTerm.length > 0;
        const hasActiveFilters = hasSearchTerm || selectedCategory || selectedAuthor;
        const emptyMessage = hasSearchTerm ? "Try a different search term." : hasActiveFilters ? "No tools match the current filters." : "Check back later for new tools.";
        marketplaceList.innerHTML = `
            <div class="empty-state">
                <p>No matching tools</p>
                <p class="empty-state-hint">${emptyMessage}</p>
                ${hasActiveFilters ? '<a href="#" class="empty-state-link" id="marketplace-clear-filters-link">Clear all filters</a>' : ""}
            </div>
        `;

        // Add event listener for clear filters link
        if (hasActiveFilters) {
            const clearFiltersLink = document.getElementById("marketplace-clear-filters-link");
            if (clearFiltersLink) {
                clearFiltersLink.addEventListener("click", (e) => {
                    e.preventDefault();
                    clearMarketplaceFilters();
                });
            }
        }
        return;
    }

    marketplaceList.innerHTML = filteredTools
        .map((tool) => {
            const installedTool = installedToolsMap.get(tool.id);
            const isInstalled = !!installedTool;
            const isDarkTheme = document.body.classList.contains("dark-theme");

            // Check if tool is new (created within last 7 days)
            const isNewTool = isToolNew(tool);

            // Show all categories for this tool
            const categoriesHtml = tool.categories && tool.categories.length ? tool.categories.map((t) => `<span class="tool-tag">${t}</span>`).join("") : "";
            const isDeprecated = tool.status === "deprecated";
            const deprecatedBadgeHtml = isDeprecated ? '<span class="marketplace-item-deprecated-badge">Deprecated</span>' : "";
            const newBadgeHtml = isNewTool ? '<span class="marketplace-item-new-badge">NEW</span>' : "";
            const analyticsHtml = `<div class="marketplace-analytics-left">
                ${tool.downloads !== undefined ? `<span class="marketplace-metric" title="Downloads">⬇ ${tool.downloads}</span>` : ""}
                ${tool.rating !== undefined ? `<span class="marketplace-metric" title="Rating">⭐ ${tool.rating.toFixed(1)}</span>` : ""}
                ${tool.mau !== undefined ? `<span class="marketplace-metric" title="Monthly Active Users">👥 ${tool.mau}</span>` : ""}
            </div>`;
            const authorsDisplay = `by ${tool.authors && tool.authors.length ? tool.authors.join(", ") : ""}`;

            // Icon handling using utility function
            const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
            const toolIconHtml = generateToolIconHtml(tool.id, tool.icon, tool.name, defaultToolIcon);
            const defaultInstallIcon = isDarkTheme ? "icons/dark/install.svg" : "icons/light/install.svg";

            // Render based on display mode
            if (displayMode === "compact") {
                // Compact mode: icon, name, version, author only
                return `
        <div class="marketplace-item-pptb marketplace-item-compact ${isInstalled ? "installed" : ""} ${isDeprecated ? "deprecated" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-header-pptb">
                <span class="marketplace-item-icon-pptb">${toolIconHtml}</span>
                <div class="marketplace-item-info-pptb">
                    <div class="marketplace-item-name-pptb">
                        ${tool.name}
                    </div>
                    <div class="marketplace-item-version-pptb">v${tool.version}</div>
                </div>
                <div class="marketplace-item-header-right-pptb">
                    ${
                        isInstalled
                            ? '<span class="marketplace-item-installed-icon" title="Installed">✓</span>'
                            : `<button class="install-button" data-action="install" data-tool-id="${tool.id}" aria-label="Install ${tool.name}" title="Install ${tool.name}">
                            <img width="18" height="18" src="${defaultInstallIcon}" alt="" aria-hidden="true" /></button>`
                    }
                </div>
            </div>
            <div class="marketplace-item-author-pptb">${authorsDisplay}</div>
        </div>
    `;
            }

            // Standard mode: full details
            return `
        <div class="marketplace-item-pptb ${isInstalled ? "installed" : ""} ${isDeprecated ? "deprecated" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-header-pptb">
                <span class="marketplace-item-icon-pptb">${toolIconHtml}</span>
                <div class="marketplace-item-info-pptb">
                    <div class="marketplace-item-name-pptb">
                        ${tool.name}
                    </div>
                    <div class="marketplace-item-version-pptb">v${tool.version}</div>
                </div>
                <div class="marketplace-item-header-right-pptb">
                    ${
                        isInstalled
                            ? '<span class="marketplace-item-installed-icon" title="Installed">✓</span>'
                            : `<button class="install-button" data-action="install" data-tool-id="${tool.id}" aria-label="Install ${tool.name}" title="Install ${tool.name}">
                            <img width="18" height="18" src="${defaultInstallIcon}" alt="" aria-hidden="true" /></button>`
                    }
                </div>
            </div>
            <div class="marketplace-item-description-pptb">${tool.description}</div>
            <div class="marketplace-item-author-pptb">${authorsDisplay}</div>
            <div class="marketplace-item-footer-pptb">
                ${analyticsHtml}
            </div>
            <div class="marketplace-item-top-tags">${newBadgeHtml}${categoriesHtml}${deprecatedBadgeHtml}</div>
        </div>
    `;
        })
        .join("");

    // Ensure SVG mask icons are initialized (theme-aware icons via currentColor)
    applyToolIconMasks(marketplaceList);

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

    // Add event listeners for install buttons in header
    marketplaceList.querySelectorAll(".install-button").forEach((button) => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation(); // Prevent opening detail modal
            const target = e.target as HTMLElement;

            // Handle both button and img clicks
            const buttonElement = target.tagName === "BUTTON" ? target : target.closest("button");
            if (!buttonElement) return;

            const toolId = buttonElement.getAttribute("data-tool-id");
            if (!toolId) return;

            // Disable button and show loading state
            buttonElement.setAttribute("disabled", "true");
            const originalHtml = buttonElement.innerHTML;
            buttonElement.classList.add("is-loading");
            buttonElement.innerHTML = '<span class="install-button-spinner" aria-hidden="true"></span>';

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
                buttonElement.removeAttribute("disabled");
                buttonElement.classList.remove("is-loading");
                buttonElement.innerHTML = originalHtml;
                window.toolboxAPI.utils.showNotification({
                    title: "Installation Failed",
                    body: `Failed to install tool: ${error}`,
                    type: "error",
                });
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

    // Setup filter event listeners
    if (categoryFilter && !(categoryFilter as any)._pptbBound) {
        (categoryFilter as any)._pptbBound = true;
        categoryFilter.addEventListener("change", () => {
            loadMarketplace();
        });
    }

    if (authorFilter && !(authorFilter as any)._pptbBound) {
        (authorFilter as any)._pptbBound = true;
        authorFilter.addEventListener("change", () => {
            loadMarketplace();
        });
    }

    if (newFilter && !(newFilter as any)._pptbBound) {
        (newFilter as any)._pptbBound = true;
        newFilter.addEventListener("change", () => {
            loadMarketplace();
        });
    }

    // Setup sort event listener
    if (sortSelect && !(sortSelect as any)._pptbBound) {
        (sortSelect as any)._pptbBound = true;
        sortSelect.addEventListener("change", async () => {
            // Save sort preference
            await window.toolboxAPI.setSetting("marketplaceSort", sortSelect.value);
            loadMarketplace();
        });
    }
}

/**
 * Populate marketplace filter dropdowns with unique values
 */
function populateMarketplaceFilters(): void {
    const categoryFilter = document.getElementById("marketplace-category-filter") as HTMLSelectElement | null;
    const authorFilter = document.getElementById("marketplace-author-filter") as HTMLSelectElement | null;

    if (!categoryFilter || !authorFilter) return;

    // Get current selections
    const selectedCategory = categoryFilter.value;
    const selectedAuthor = authorFilter.value;

    // Extract unique categories and authors
    const categories = new Set<string>();
    const authors = new Set<string>();

    toolLibrary.forEach((tool) => {
        if (tool.categories) {
            tool.categories.forEach((cat) => categories.add(cat));
        }
        if (tool.authors) {
            tool.authors.forEach((author) => authors.add(author));
        }
    });

    // Populate category filter
    const sortedCategories = Array.from(categories).sort();
    categoryFilter.innerHTML = '<option value="">All Categories</option>' + sortedCategories.map((cat) => `<option value="${cat}">${cat}</option>`).join("");
    if (selectedCategory && sortedCategories.includes(selectedCategory)) {
        categoryFilter.value = selectedCategory;
    }

    // Populate author filter
    const sortedAuthors = Array.from(authors).sort();
    authorFilter.innerHTML = '<option value="">All Authors</option>' + sortedAuthors.map((author) => `<option value="${author}">${author}</option>`).join("");
    if (selectedAuthor && sortedAuthors.includes(selectedAuthor)) {
        authorFilter.value = selectedAuthor;
    }
}

function isToolNew(tool: ToolDetail): boolean {
    if (!tool.createdAt) return false;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdDate = new Date(tool.createdAt);
    return createdDate >= sevenDaysAgo;
}

/**
 * Open tool detail modal (BrowserWindow-based)
 */
export async function openToolDetail(tool: ToolDetail, isInstalled: boolean): Promise<void> {
    initializeToolDetailModalBridge();
    activeToolDetailModal = { tool, isInstalled };

    try {
        //const readmeHtml = await loadToolReadmeHtml(tool);
        const modalHtml = buildToolDetailModalHtml(tool, isInstalled);
        await showBrowserWindowModal({
            id: `tool-detail-modal-${tool.id}`,
            html: modalHtml,
            width: TOOL_DETAIL_MODAL_DIMENSIONS.width,
            height: TOOL_DETAIL_MODAL_DIMENSIONS.height,
        });
    } catch (error) {
        captureMessage("Failed to open tool detail modal", "error", { extra: { error } });
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
        case TOOL_DETAIL_MODAL_CHANNELS.review: {
            const data = (payload.data ?? {}) as { url?: unknown };
            const url = typeof data.url === "string" ? data.url : undefined;
            if (!url) {
                return;
            }
            void window.toolboxAPI.openExternal(url).catch((error) => {
                captureMessage("Failed to open review link", "error", { extra: { error } });
            });
            break;
        }
        case TOOL_DETAIL_MODAL_CHANNELS.repository: {
            const data = (payload.data ?? {}) as { url?: unknown };
            const url = typeof data.url === "string" ? data.url : undefined;
            if (!url) {
                return;
            }
            void window.toolboxAPI.openExternal(url).catch((error) => {
                captureMessage("Failed to open repository link", "error", { extra: { error } });
            });
            break;
        }
        case TOOL_DETAIL_MODAL_CHANNELS.website: {
            const data = (payload.data ?? {}) as { url?: unknown };
            const url = typeof data.url === "string" ? data.url : undefined;
            if (!url) {
                return;
            }
            void window.toolboxAPI.openExternal(url).catch((error) => {
                captureMessage("Failed to open website link", "error", { extra: { error } });
            });
            break;
        }
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

function buildToolDetailModalHtml(tool: ToolDetail, isInstalled: boolean): string {
    const authorsDisplay = tool.authors && tool.authors.length ? tool.authors.join(", ") : "Unknown author";
    const metaBadges: string[] = [];
    if (tool.version) metaBadges.push(`v${tool.version}`);
    if (tool.downloads !== undefined) metaBadges.push(`${tool.downloads.toLocaleString()} downloads`);
    const categories = tool.categories && tool.categories.length ? tool.categories.map((category) => escapeHtml(category)) : [];
    const isDarkTheme = document.body.classList.contains("dark-theme");

    const { styles, body } = getToolDetailModalView({
        toolId: escapeHtml(tool.id),
        name: escapeHtml(tool.name),
        description: escapeHtml(tool.description || ""),
        iconHtml: buildToolIconHtml(tool),
        authors: escapeHtml(authorsDisplay),
        metaBadges: metaBadges.map((badge) => escapeHtml(badge)),
        categories: categories,
        isInstalled,
        readmeUrl: tool.readmeUrl,
        isDarkTheme,
        repository: tool.repository,
        website: tool.website,
        rating: tool.rating,
    });

    const script = getToolDetailModalControllerScript({
        channels: TOOL_DETAIL_MODAL_CHANNELS,
        state: {
            toolId: tool.id,
            toolName: tool.name,
            isInstalled,
            readmeUrl: tool.readmeUrl || null,
            reviewUrl: `https://www.powerplatformtoolbox.com/rate-tool?toolId=${encodeURIComponent(tool.id)}`,
            repositoryUrl: tool.repository || null,
            websiteUrl: tool.website || null,
        },
    });

    return `${styles}\n${body}\n${script}`.trim();
}

function buildToolIconHtml(tool: ToolDetail): string {
    // defaultToolIcon is a safe data:image/svg+xml URI generated from application constant
    const defaultToolIcon = svgToDataUri(DEFAULT_TOOL_ICON_DARK_SVG);
    const resolvedIconUrl = resolveToolIconUrl(tool.id, tool.icon);

    // Validate the generated data URI is safe (defensive check)
    const escapedDefaultIcon = defaultToolIcon.startsWith("data:image/") ? escapeHtml(defaultToolIcon) : "";

    if (!resolvedIconUrl) {
        return escapedDefaultIcon ? `<img src="${escapedDefaultIcon}" alt="${escapeHtml(tool.name)} icon" />` : "";
    }

    const escapedResolvedUrl = escapeHtml(resolvedIconUrl);
    const onerrorAttr = escapedDefaultIcon ? ` onerror="this.src='${escapedDefaultIcon}'"` : "";
    return `<img src="${escapedResolvedUrl}" alt="${escapeHtml(tool.name)} icon"${onerrorAttr} />`;
}

function svgToDataUri(svgContent: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
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

/**
 * Clear all filters in the marketplace section
 */
function clearMarketplaceFilters(): void {
    // Clear search input
    const searchInput = document.getElementById("marketplace-search-input") as HTMLInputElement | null;
    if (searchInput) {
        searchInput.value = "";
    }

    // Reset category filter
    const categoryFilter = document.getElementById("marketplace-category-filter") as HTMLSelectElement | null;
    if (categoryFilter) {
        categoryFilter.value = "";
    }

    // Reset author filter
    const authorFilter = document.getElementById("marketplace-author-filter") as HTMLSelectElement | null;
    if (authorFilter) {
        authorFilter.value = "";
    }

    // Reload the marketplace to reflect the cleared filters
    loadMarketplace();
}
