/**
 * Tools sidebar management module
 * Handles the display and management of installed tools in the sidebar
 */

import { captureMessage, logInfo } from "../../common/sentryHelper";
import { ToolDetail } from "../types/index";
import { applyToolIconMasks, generateToolIconHtml } from "../utils/toolIconResolver";
import { getToolSourceIconHtml } from "../utils/toolSourceIcon";
import { loadMarketplace, openToolDetail } from "./marketplaceManagement";
import { switchSidebar } from "./sidebarManagement";
import { launchTool } from "./toolManagement";

let activeToolContextMenu: { menu: HTMLElement; anchor: HTMLElement; cleanup: () => void } | null = null;

/**
 * Load and display installed tools in the sidebar
 */
export async function loadSidebarTools(): Promise<void> {
    const toolsList = document.getElementById("sidebar-tools-list");
    if (!toolsList) return;

    try {
        const tools = await window.toolboxAPI.getAllTools();
        const favoriteTools = await window.toolboxAPI.getFavoriteTools();
        const deprecatedToolsVisibility = (await window.toolboxAPI.getSetting("deprecatedToolsVisibility")) || "hide-all";
        const displayMode = ((await window.toolboxAPI.getSetting("toolDisplayMode")) as string) || "standard";

        if (tools.length === 0) {
            toolsList.innerHTML = `
                <div class="empty-state">
                    <p>No tools installed yet.</p>
                    <p class="empty-state-hint">Install tools from the marketplace to get started.</p>
                    <button class="fluent-button fluent-button-primary" id="go-to-marketplace-btn">Browse Marketplace</button>
                </div>
            `;

            // Add event listener for the marketplace button
            attachMarketplaceNavigationButton("go-to-marketplace-btn", "");
            return;
        }

        // Enrich tools with update info and favorite status
        const toolsWithUpdateInfo = await Promise.all(
            tools.map(async (tool: ToolDetail) => {
                const updateInfo = await window.toolboxAPI.checkToolUpdates(tool.id);
                const isUpdating = await window.toolboxAPI.isToolUpdating(tool.id);
                return {
                    ...tool,
                    latestVersion: updateInfo.latestVersion,
                    hasUpdate: updateInfo.hasUpdate,
                    isFavorite: favoriteTools.includes(tool.id),
                    isUpdating,
                };
            }),
        );

        // Get filter and sort values
        const searchInput = document.getElementById("tools-search-input") as HTMLInputElement | null;
        const categoryFilter = document.getElementById("tools-category-filter") as HTMLSelectElement | null;
        const authorFilter = document.getElementById("tools-author-filter") as HTMLSelectElement | null;
        const sortSelect = document.getElementById("tools-sort-select") as HTMLSelectElement | null;

        const searchTerm = searchInput?.value ? searchInput.value.toLowerCase() : "";
        const selectedCategory = categoryFilter?.value || "";
        const selectedAuthor = authorFilter?.value || "";

        // Get saved sort preference or default
        const savedSort = await window.toolboxAPI.getSetting("installedToolsSort");
        const sortOption = (sortSelect?.value as any) || savedSort || "name-asc";

        // Set the dropdown value if we have a saved preference
        if (sortSelect && savedSort && !sortSelect.value) {
            sortSelect.value = savedSort as string;
        }

        // Populate filter dropdowns
        populateInstalledToolsFilters(toolsWithUpdateInfo);

        // Apply filters
        const filteredTools = toolsWithUpdateInfo.filter((t) => {
            // Search filter
            if (searchTerm) {
                const haystacks: string[] = [t.name || "", t.description || ""];
                if (t.authors && t.authors.length) haystacks.push(t.authors.join(", "));
                if (t.categories && t.categories.length) haystacks.push(t.categories.join(", "));
                if (!haystacks.some((h) => h.toLowerCase().includes(searchTerm))) {
                    return false;
                }
            }

            // Category filter
            if (selectedCategory && (!t.categories || !t.categories.includes(selectedCategory))) {
                return false;
            }

            // Author filter
            if (selectedAuthor && (!t.authors || !t.authors.includes(selectedAuthor))) {
                return false;
            }

            // Deprecated filter
            if (t.status === "deprecated") {
                if (deprecatedToolsVisibility === "hide-all" || deprecatedToolsVisibility === "show-marketplace") {
                    return false;
                }
            }

            return true;
        });

        // Sort tools based on selected option
        const sortedTools = [...filteredTools].sort((a, b) => {
            switch (sortOption) {
                case "favorite":
                    // Sort by favorite status - favorites first, then by name
                    if (a.isFavorite && !b.isFavorite) return -1;
                    if (!a.isFavorite && b.isFavorite) return 1;
                    return a.name.localeCompare(b.name);
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

        // Empty state when no matches after filtering
        if (sortedTools.length === 0) {
            const hasSearchTerm = searchTerm.length > 0;
            const hasActiveFilters = hasSearchTerm || selectedCategory || selectedAuthor;
            const emptyMessage = hasSearchTerm ? `No installed tools match "${searchTerm}".` : hasActiveFilters ? "No tools match the current filters." : "Try a different search term.";
            toolsList.innerHTML = `
                <div class="empty-state">
                    <p>No matching tools</p>
                    <p class="empty-state-hint">${emptyMessage}</p>
                    <button class="fluent-button fluent-button-primary" id="search-marketplace-btn">Search in Marketplace</button>
                    ${hasActiveFilters ? '<a href="#" class="empty-state-link" id="clear-filters-link">Clear all filters</a>' : ""}
                </div>
            `;

            // Add event listener for the marketplace search button
            attachMarketplaceNavigationButton("search-marketplace-btn", searchTerm);

            // Add event listener for clear filters link
            if (hasActiveFilters) {
                const clearFiltersLink = document.getElementById("clear-filters-link");
                if (clearFiltersLink) {
                    clearFiltersLink.addEventListener("click", (e) => {
                        e.preventDefault();
                        clearAllFilters();
                    });
                }
            }
            return;
        }

        // Create lookup for menu actions
        const toolLookup = new Map(sortedTools.map((t) => [t.id, t]));

        logInfo(`Loaded ${sortedTools.length} installed tools`);

        // Build tools list HTML
        toolsList.innerHTML = sortedTools
            .map((tool: ToolDetail & { hasUpdate?: boolean; latestVersion?: string; isFavorite?: boolean; isUpdating?: boolean }) => {
                const isDarkTheme = document.body.classList.contains("dark-theme");

                // Icon handling using utility function
                const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
                const toolIconHtml = generateToolIconHtml(tool.id, tool.icon, tool.name, defaultToolIcon);

                // Asset paths
                const infoIconPath = "icons/light/info_filled.svg";
                const favoriteIconPath = isDarkTheme ? "icons/dark/star-filled.svg" : "icons/light/star-filled.svg";
                const moreIconPath = isDarkTheme ? "icons/dark/more-icon.svg" : "icons/light/more-icon.svg";
                const moreIcon = `<img src="${moreIconPath}" alt="More actions" class="tool-more-icon" />`;

                const hasUpdate = !!tool.hasUpdate;
                const isUpdating = !!tool.isUpdating;
                const latestVersion = tool.latestVersion;
                const description = tool.description || "";
                const isDeprecated = tool.status === "deprecated";
                // Show up to two categories, with a +N indicator if more remain
                const categoriesHtml = (() => {
                    if (!tool.categories || !tool.categories.length) return "";
                    const visibleCategories = tool.categories.slice(0, 2);
                    const remainingCount = tool.categories.length - visibleCategories.length;
                    const visibleHtml = visibleCategories.map((t) => `<span class="tool-tag">${t}</span>`).join("");
                    const moreHtml = remainingCount > 0 ? `<span class="tool-tag tool-tag-more">+${remainingCount}</span>` : "";
                    return `${visibleHtml}${moreHtml}`;
                })();
                const deprecatedBadgeHtml = isDeprecated ? '<span class="tool-deprecated-badge" title="This tool is deprecated">⚠ Deprecated</span>' : "";

                // Get tool source icon
                const sourceIconHtml = getToolSourceIconHtml(tool.id);

                // Determine tool source
                let toolSourceClass = "";
                if (tool.id.startsWith("local-")) {
                    toolSourceClass = "tool-item-pptb-local";
                } else if (tool.id.startsWith("npm-")) {
                    toolSourceClass = "tool-item-pptb-npm";
                }

                const analyticsHtml = `<div class="tool-analytics-left">${sourceIconHtml}${
                    tool.downloads !== undefined ? `<span class="tool-metric" title="Downloads">⬇ ${tool.downloads}</span>` : ""
                }${tool.rating !== undefined ? `<span class="tool-metric" title="Rating">⭐ ${tool.rating.toFixed(1)}</span>` : ""}${
                    tool.mau !== undefined ? `<span class="tool-metric" title="Monthly Active Users">👥 ${tool.mau}</span>` : ""
                }</div>`;
                const authorsDisplay = `by ${tool.authors && tool.authors.length ? tool.authors.join(", ") : ""}`;

                // Helper: Generate updating overlay HTML
                const updatingOverlayHtml = isUpdating
                    ? `<div class="tool-item-updating-overlay" role="status" aria-live="polite" aria-label="Updating tool">
                        <div class="tool-item-updating-spinner"></div>
                        <div class="tool-item-updating-text">Updating...</div>
                    </div>`
                    : "";

                // Helper: Generate accessibility attributes for updating state
                const updatingAriaAttrs = isUpdating ? 'aria-busy="true" aria-label="Updating tool"' : "";

                // Helper: Check if update badge should be shown
                const shouldShowUpdateBadge = hasUpdate && !isUpdating;

                // Helper: Check if update info should be shown
                const shouldShowUpdateInfo = hasUpdate && latestVersion && !isUpdating;

                // Render based on display mode
                if (displayMode === "compact") {
                    // Compact mode: icon, name, version, author only
                    return `
                    <div class="tool-item-pptb tool-item-compact ${toolSourceClass} ${isDeprecated ? "deprecated" : ""} ${isUpdating ? "tool-item-updating" : ""}" data-tool-id="${tool.id}" ${updatingAriaAttrs}>
                        ${updatingOverlayHtml}
                        <div class="tool-item-header-pptb">
                            <div class="tool-item-header-left-pptb">
                                <span class="tool-item-icon-pptb">${toolIconHtml}</span>
                                <div class="tool-item-info-pptb">
                                    <div class="tool-item-name-pptb">
                                        ${tool.name} ${shouldShowUpdateBadge ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                                    </div>
                                    <div class="tool-item-version-pptb">v${tool.version}</div>
                                </div>
                            </div>
                            <div class="tool-item-header-right-pptb">
                                ${
                                    tool.isFavorite
                                        ? `
                                        <img width="16" height="16" src="${favoriteIconPath}" alt="Favorite" class="tool-favorite-icon" />
                                    `
                                        : ""
                                }
                                <button class="icon-button tool-more-btn" data-action="more" data-tool-id="${
                                    tool.id
                                }" title="More options" aria-haspopup="true" aria-expanded="false">${moreIcon}</button>
                            </div>
                        </div>
                        <div class="tool-item-authors-pptb">${authorsDisplay}</div>
                    </div>`;
                }

                // Standard mode: full details
                return `
                    <div class="tool-item-pptb ${toolSourceClass} ${isDeprecated ? "deprecated" : ""} ${isUpdating ? "tool-item-updating" : ""}" data-tool-id="${tool.id}" ${updatingAriaAttrs}>
                        ${updatingOverlayHtml}
                        <div class="tool-item-header-pptb">
                            <div class="tool-item-header-left-pptb">
                                <span class="tool-item-icon-pptb">${toolIconHtml}</span>
                                <div class="tool-item-info-pptb">
                                    <div class="tool-item-name-pptb">
                                        ${tool.name} ${shouldShowUpdateBadge ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                                    </div>
                                    <div class="tool-item-version-pptb">v${tool.version}</div>
                                </div>
                            </div>
                            <div class="tool-item-header-right-pptb">
                                ${
                                    tool.isFavorite
                                        ? `
                                        <img width="16" height="16" src="${favoriteIconPath}" alt="Favorite" class="tool-favorite-icon" />
                                    `
                                        : ""
                                }
                                <button class="icon-button tool-more-btn" data-action="more" data-tool-id="${
                                    tool.id
                                }" title="More options" aria-haspopup="true" aria-expanded="false">${moreIcon}</button>
                            </div>
                        </div>
                        <div class="tool-item-description-pptb">${description}</div>
                        <div class="tool-item-authors-pptb">${authorsDisplay}</div>
                        ${
                            shouldShowUpdateInfo
                                ? `<div class="tool-item-updated-version-available-pptb">
                                        <img class="tool-item-updated-version-available-info-icon" src="${infoIconPath}" alt="Info" />
                                        <span class="tool-item-updated-version-available-text">v${latestVersion} update is available</span>
                                    </div>`
                                : ""
                        }
                        <div class="tool-item-footer-pptb">
                            ${analyticsHtml}
                        </div>
                        <div class="tool-item-top-tags">${categoriesHtml}${deprecatedBadgeHtml}</div>
                        ${
                            shouldShowUpdateInfo
                                ? `<div class="tool-item-update-btn"><button class="fluent-button fluent-button-primary" data-action="update" data-tool-id="${tool.id}" title="Update to v${latestVersion}">Update</button></div>`
                                : ""
                        }
                    </div>`;
            })
            .join("");

        // Ensure SVG mask icons are initialized (theme-aware icons via currentColor)
        applyToolIconMasks(toolsList);

        // Add click event listeners to launch tools
        toolsList.querySelectorAll(".tool-item-pptb").forEach((item) => {
            item.addEventListener("click", (e) => {
                const target = e.target as HTMLElement;
                // Don't launch tool if clicking an action button
                if (target.closest("button")) return;
                // Don't launch tool if it's updating
                if (item.classList.contains("tool-item-updating")) return;

                const toolId = item.getAttribute("data-tool-id");
                if (toolId) {
                    launchTool(toolId);
                }
            });
        });

        // Add event listeners for action buttons (include update button)
        toolsList.querySelectorAll(".tool-item-actions-right button, .tool-item-update-btn button, .tool-favorite-btn, .tool-more-btn").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                const button = target.closest("button") as HTMLButtonElement;
                if (!button) return;

                const isDarkTheme = document.body.classList.contains("dark-theme");
                const action = button.getAttribute("data-action");
                const toolId = button.getAttribute("data-tool-id");
                if (!toolId) return;

                // Don't allow actions on updating tools (except viewing context menu)
                const toolCard = button.closest(".tool-item-pptb");
                if (toolCard && toolCard.classList.contains("tool-item-updating") && action !== "more") {
                    return;
                }

                if (action === "more") {
                    const tool = toolLookup.get(toolId);
                    if (!tool) return;
                    showToolContextMenu(tool, button, isDarkTheme);
                    return;
                }

                if (action === "delete") {
                    await uninstallToolFromSidebar(toolId);
                } else if (action === "update") {
                    await updateToolFromSidebar(toolId);
                } else if (action === "favorite") {
                    await toggleFavoriteTool(toolId);
                }
            });
        });
    } catch (error) {
        captureMessage("Failed to load sidebar tools:", "error", { extra: { error } });
        toolsList.innerHTML = `
            <div class="empty-state">
                <p>Error loading tools</p>
                <p class="empty-state-hint">${(error as Error).message}</p>
            </div>
        `;
    }

    // Wire up live search without replacing the input (to avoid cursor loss)
    const searchInput = document.getElementById("tools-search-input") as HTMLInputElement | null;
    const categoryFilter = document.getElementById("tools-category-filter") as HTMLSelectElement | null;
    const authorFilter = document.getElementById("tools-author-filter") as HTMLSelectElement | null;

    if (searchInput && !(searchInput as any)._pptbBound) {
        (searchInput as any)._pptbBound = true;
        searchInput.addEventListener("input", () => {
            loadSidebarTools();
        });
    }

    // Setup filter event listeners
    if (categoryFilter && !(categoryFilter as any)._pptbBound) {
        (categoryFilter as any)._pptbBound = true;
        categoryFilter.addEventListener("change", () => {
            loadSidebarTools();
        });
    }

    if (authorFilter && !(authorFilter as any)._pptbBound) {
        (authorFilter as any)._pptbBound = true;
        authorFilter.addEventListener("change", () => {
            loadSidebarTools();
        });
    }

    // Setup sort event listener
    const sortSelect = document.getElementById("tools-sort-select") as HTMLSelectElement | null;
    if (sortSelect && !(sortSelect as any)._pptbBound) {
        (sortSelect as any)._pptbBound = true;
        sortSelect.addEventListener("change", async () => {
            // Save sort preference
            await window.toolboxAPI.setSetting("installedToolsSort", sortSelect.value);
            loadSidebarTools();
        });
    }
}

/**
 * Populate installed tools filter dropdowns with unique values
 */
function populateInstalledToolsFilters(tools: ToolDetail[]): void {
    const categoryFilter = document.getElementById("tools-category-filter") as HTMLSelectElement | null;
    const authorFilter = document.getElementById("tools-author-filter") as HTMLSelectElement | null;

    if (!categoryFilter || !authorFilter) return;

    // Get current selections
    const selectedCategory = categoryFilter.value;
    const selectedAuthor = authorFilter.value;

    // Extract unique categories and authors
    const categories = new Set<string>();
    const authors = new Set<string>();

    tools.forEach((tool) => {
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

function closeActiveToolContextMenu(): void {
    if (!activeToolContextMenu) return;
    activeToolContextMenu.cleanup();
    activeToolContextMenu = null;
}

function showToolContextMenu(tool: ToolDetail & { isFavorite?: boolean; hasUpdate?: boolean; latestVersion?: string }, anchor: HTMLElement, isDarkTheme: boolean): void {
    // Toggle: if clicking the same anchor, close existing menu
    if (activeToolContextMenu && activeToolContextMenu.anchor === anchor) {
        closeActiveToolContextMenu();
        return;
    }

    closeActiveToolContextMenu();

    const favoriteIconPath = tool.isFavorite ? (isDarkTheme ? "icons/dark/star-filled.svg" : "icons/light/star-filled.svg") : isDarkTheme ? "icons/dark/star.svg" : "icons/light/star.svg";
    const detailsIconPath = isDarkTheme ? "icons/dark/info_filled.svg" : "icons/light/info_filled.svg";
    const updateIconPath = isDarkTheme ? "icons/dark/update.svg" : "icons/light/update.svg";
    const uninstallIconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";

    const hasUpdate = !!tool.hasUpdate;
    const latestVersion = tool.latestVersion;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "50000";
    menu.style.userSelect = "none";
    menu.innerHTML = `
        <div class="context-menu-item" data-menu-action="favorite">
            <img src="${favoriteIconPath}" class="context-menu-icon" alt="" />
            <span>${tool.isFavorite ? "Unmark as Favorite" : "Mark as Favorite"}</span>
        </div>
        ${
            hasUpdate && latestVersion
                ? `<div class="context-menu-item" data-menu-action="update">
            <img src="${updateIconPath}" class="context-menu-icon" alt="" />
            <span>Update to v${latestVersion}</span>
        </div>`
                : ""
        }
        <div class="context-menu-item" data-menu-action="details">
            <img src="${detailsIconPath}" class="context-menu-icon" alt="" />
            <span>See Details</span>
        </div>
        <div class="context-menu-item" data-menu-action="uninstall">
            <img src="${uninstallIconPath}" class="context-menu-icon" alt="" />
            <span>Uninstall</span>
        </div>
    `;

    document.body.appendChild(menu);

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const sidebar = document.getElementById("sidebar");
    const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };

    // Prefer opening to the left to avoid overlapping BrowserView on the right
    let left = anchorRect.left - menuRect.width + anchorRect.width;
    let top = anchorRect.bottom + 6;

    // Clamp within sidebar bounds
    const margin = 6;
    if (left < sidebarRect.left + margin) {
        left = sidebarRect.left + margin;
    }
    if (left + menuRect.width > sidebarRect.right - margin) {
        left = sidebarRect.right - margin - menuRect.width;
    }

    if (top + menuRect.height > sidebarRect.bottom - margin) {
        top = anchorRect.top - menuRect.height - margin;
    }
    if (top < sidebarRect.top + margin) {
        top = sidebarRect.top + margin;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const onOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (menu.contains(target) || anchor.contains(target)) {
            return;
        }
        closeActiveToolContextMenu();
    };

    const onEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            closeActiveToolContextMenu();
        }
    };

    const onScroll = () => closeActiveToolContextMenu();
    const onResize = () => closeActiveToolContextMenu();

    const cleanup = () => {
        document.removeEventListener("click", onOutsideClick, true);
        document.removeEventListener("keydown", onEscape, true);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize, true);
        menu.remove();
        anchor.setAttribute("aria-expanded", "false");
    };

    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);

    anchor.setAttribute("aria-expanded", "true");

    menu.addEventListener("click", async (event) => {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        const action = target.closest("[data-menu-action]")?.getAttribute("data-menu-action");
        if (!action) return;

        closeActiveToolContextMenu();

        if (action === "favorite") {
            await toggleFavoriteTool(tool.id);
            await loadSidebarTools();
            return;
        }

        if (action === "update") {
            await updateToolFromSidebar(tool.id);
            return;
        }

        if (action === "details") {
            await openToolDetail(tool, true);
            return;
        }

        if (action === "uninstall") {
            await uninstallToolFromSidebar(tool.id);
            return;
        }
    });

    activeToolContextMenu = { menu, anchor, cleanup };
}

/**
 * Uninstall a tool from the sidebar
 */
async function uninstallToolFromSidebar(toolId: string): Promise<void> {
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

/**
 * Update a tool from the sidebar
 */
async function updateToolFromSidebar(toolId: string): Promise<void> {
    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        if (!tool) {
            throw new Error("Tool not found");
        }

        // Start the update (event listener triggers sidebar reload which checks isToolUpdating() to show visual feedback)
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
        // Reload sidebar to remove updating state
        await loadSidebarTools();
    }
}

/**
 * Clear all filters in the installed tools section
 */
function clearAllFilters(): void {
    // Clear search input
    const searchInput = document.getElementById("tools-search-input") as HTMLInputElement | null;
    if (searchInput) {
        searchInput.value = "";
    }

    // Reset category filter
    const categoryFilter = document.getElementById("tools-category-filter") as HTMLSelectElement | null;
    if (categoryFilter) {
        categoryFilter.value = "";
    }

    // Reset author filter
    const authorFilter = document.getElementById("tools-author-filter") as HTMLSelectElement | null;
    if (authorFilter) {
        authorFilter.value = "";
    }

    // Reload the sidebar tools to reflect the cleared filters
    loadSidebarTools();
}

/**
 * Attach click event listener to a marketplace navigation button
 */
function attachMarketplaceNavigationButton(buttonId: string, searchTerm: string): void {
    const button = document.getElementById(buttonId);
    if (button) {
        button.addEventListener("click", () => {
            navigateToMarketplace(searchTerm);
        });
    }
}

/**
 * Navigate to marketplace sidebar and optionally set a search term
 */
async function navigateToMarketplace(searchTerm: string = ""): Promise<void> {
    // Switch to marketplace sidebar
    switchSidebar("marketplace");

    // If a search term is provided, set it in the marketplace search input
    if (searchTerm) {
        // Wait for the marketplace sidebar to be rendered using requestAnimationFrame
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
                const marketplaceSearchInput = document.getElementById("marketplace-search-input") as HTMLInputElement;
                if (marketplaceSearchInput) {
                    marketplaceSearchInput.value = searchTerm;
                    // Trigger the marketplace to reload with the search term
                    loadMarketplace()
                        .then(() => resolve())
                        .catch(() => resolve());
                } else {
                    resolve();
                }
            });
        });
    }
}

/**
 * Toggle favorite status for a tool
 */
async function toggleFavoriteTool(toolId: string): Promise<void> {
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
