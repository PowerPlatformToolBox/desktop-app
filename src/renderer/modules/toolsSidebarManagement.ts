/**
 * Tools sidebar management module
 * Handles the display and management of installed tools in the sidebar
 */

import { SidebarTool } from "../types/index";
import { loadMarketplace } from "./marketplaceManagement";
import { launchTool } from "./toolManagement";

/**
 * Load and display installed tools in the sidebar
 */
export async function loadSidebarTools(): Promise<void> {
    const toolsList = document.getElementById("sidebar-tools-list");
    if (!toolsList) return;

    try {
        const tools = await window.toolboxAPI.getAllTools();
        const favoriteTools = await window.toolboxAPI.getFavoriteTools();

        if (tools.length === 0) {
            toolsList.innerHTML = `
                <div class="empty-state">
                    <p>No tools installed yet.</p>
                    <p class="empty-state-hint">Install tools from the marketplace to get started.</p>
                </div>
            `;
            return;
        }

        // Enrich tools with update info and favorite status
        const toolsWithUpdateInfo = await Promise.all(
            tools.map(async (tool: SidebarTool) => {
                const updateInfo = await window.toolboxAPI.checkToolUpdates(tool.id);
                return {
                    ...tool,
                    latestVersion: updateInfo.latestVersion,
                    hasUpdate: updateInfo.hasUpdate,
                    isFavorite: favoriteTools.includes(tool.id),
                };
            }),
        );

        // Sort tools: favorites first, then by name
        const sortedTools = [...toolsWithUpdateInfo].sort((a, b) => {
            const aFav = a.isFavorite;
            const bFav = b.isFavorite;
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.name.localeCompare(b.name);
        });

        // Build tools list HTML
        toolsList.innerHTML = sortedTools
            .map((tool: SidebarTool & { hasUpdate?: boolean; latestVersion?: string; isFavorite?: boolean }) => {
                const isFavorite = !!tool.isFavorite;
                const isDarkTheme = document.body.classList.contains("dark-theme");

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

                // Asset paths
                const trashIconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";
                const starIconPath = isFavorite ? (isDarkTheme ? "icons/dark/star-filled.svg" : "icons/light/star-filled.svg") : isDarkTheme ? "icons/dark/star.svg" : "icons/light/star.svg";

                const hasUpdate = !!tool.hasUpdate;
                const latestVersion = tool.latestVersion;
                const description = tool.description || "";
                const favoriteTitle = isFavorite ? "Remove from favorites" : "Add to favorites";
                const topCategories = tool.categories && tool.categories.length ? tool.categories.slice(0, 2) : [];
                const categoriesHtml = topCategories.length ? topCategories.map((t) => `<span class="tool-tag">${t}</span>`).join("") : "";
                const analyticsHtml = `<div class="tool-analytics-left">${tool.downloads !== undefined ? `<span class="tool-metric" title="Downloads">⬇ ${tool.downloads}</span>` : ""}${
                    tool.rating !== undefined ? `<span class="tool-metric" title="Rating">⭐ ${tool.rating.toFixed(1)}</span>` : ""
                }${tool.aum !== undefined ? `<span class="tool-metric" title="Active User Months">👥 ${tool.aum}</span>` : ""}</div>`;
                const authorsDisplay = `by ${tool.authors && tool.authors.length ? tool.authors.join(", ") : ""}`;

                return `
                    <div class="tool-item-pptb" data-tool-id="${tool.id}">
                        <div class="tool-item-top-tags">${categoriesHtml}</div>
                        <div class="tool-item-header-pptb">
                            <div class="tool-item-header-left-pptb">
                                <span class="tool-item-icon-pptb">${toolIconHtml}</span>
                                <div class="tool-item-info-pptb">
                                    <div class="tool-item-name-pptb">
                                        ${tool.name} ${hasUpdate ? '<span class="tool-update-badge" title="Update available">⬆</span>' : ""}
                                    </div>
                                    <div class="tool-item-authors-pptb">${authorsDisplay}</div>
                                </div>
                            </div>
                            <div class="tool-item-header-right-pptb">
                                <button class="tool-favorite-btn" data-action="favorite" data-tool-id="${tool.id}" title="${favoriteTitle}">
                                    <img src="${starIconPath}" alt="${isFavorite ? "Favorited" : "Not favorite"}" />
                                </button>
                            </div>
                        </div>
                        <div class="tool-item-description-pptb">${description}</div>
                        <div class="tool-item-footer-pptb">
                            ${analyticsHtml}
                            <div class="tool-item-actions-right">
                                ${
                                    hasUpdate && latestVersion
                                        ? `<button class="fluent-button fluent-button-secondary" data-action="update" data-tool-id="${tool.id}" title="Update to v${latestVersion}">Update</button>`
                                        : ""
                                }
                                <button class="tool-item-delete-btn" data-action="delete" data-tool-id="${tool.id}" title="Uninstall tool">
                                    <img src="${trashIconPath}" alt="Delete" />
                                </button>
                            </div>
                        </div>
                    </div>`;
            })
            .join("");

        // Add click event listeners to launch tools
        toolsList.querySelectorAll(".tool-item-pptb").forEach((item) => {
            item.addEventListener("click", (e) => {
                const target = e.target as HTMLElement;
                // Don't launch tool if clicking an action button
                if (target.closest("button")) return;

                const toolId = item.getAttribute("data-tool-id");
                if (toolId) {
                    launchTool(toolId);
                }
            });
        });

        // Add event listeners for action buttons
        toolsList.querySelectorAll(".tool-item-actions-right button, .tool-favorite-btn").forEach((button) => {
            button.addEventListener("click", async (e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                const button = target.closest("button") as HTMLButtonElement;
                if (!button) return;

                const action = button.getAttribute("data-action");
                const toolId = button.getAttribute("data-tool-id");
                if (!toolId) return;

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
        console.error("Failed to load sidebar tools:", error);
        toolsList.innerHTML = `
            <div class="empty-state">
                <p>Error loading tools</p>
                <p class="empty-state-hint">${(error as Error).message}</p>
            </div>
        `;
    }
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
