/**
 * Marketplace management module
 * Handles tool library, marketplace UI, and tool installation
 */

import type { ToolDetail } from "../types/index";
import { closeModal, openModal } from "./modalManagement";
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
        toolLibrary = (registryTools as RegistryTool[]).map((tool) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            authors: tool.authors,
            category: tool.categories && tool.categories.length > 0 ? tool.categories[0] : "Tools",
            tags: tool.categories,
            version: tool.version,
            iconUrl: tool.icon,
            downloadUrl: tool.downloadUrl,
            readmeUrl: tool.readme,
            downloads: tool.downloads,
            rating: tool.rating,
            aum: tool.aum,
        }));

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

    const filteredTools = toolLibrary.filter((tool) => {
        if (!searchTerm) return true;
        const haystacks: string[] = [tool.name, tool.description, tool.category];
        if (tool.authors && tool.authors.length) haystacks.push(tool.authors.join(", "));
        if (tool.tags && tool.tags.length) haystacks.push(tool.tags.join(", "));
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
            const topTags = tool.tags && tool.tags.length ? tool.tags.slice(0, 2) : [];
            const tagsHtml = topTags.length ? topTags.map((t) => `<span class="marketplace-tag">${t}</span>`).join("") : "";
            const analyticsHtml = `<div class="marketplace-analytics-left">
                ${tool.downloads !== undefined ? `<span class=\"marketplace-metric\" title=\"Downloads\">⬇ ${tool.downloads}</span>` : ""}
                ${tool.rating !== undefined ? `<span class=\"marketplace-metric\" title=\"Rating\">⭐ ${tool.rating.toFixed(1)}</span>` : ""}
                ${tool.aum !== undefined ? `<span class=\"marketplace-metric\" title=\"Active User Months\">👥 ${tool.aum}</span>` : ""}
            </div>`;
            const authorsDisplay = tool.authors && tool.authors.length ? tool.authors.join(", ") : "";

            // Determine tool icon: use URL if provided, otherwise use default icon
            const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
            let toolIconHtml = "";
            if (tool.iconUrl) {
                // Check if icon is a URL (starts with http:// or https://)
                if (tool.iconUrl.startsWith("http://") || tool.iconUrl.startsWith("https://")) {
                    toolIconHtml = `<img src="${tool.iconUrl}" alt="${tool.name} icon" class="marketplace-item-icon-img" onerror="this.src='${defaultToolIcon}'" />`;
                } else {
                    // Assume it's an emoji or text
                    toolIconHtml = `<span class="marketplace-item-icon-text">${tool.iconUrl}</span>`;
                }
            } else {
                // Use default icon
                toolIconHtml = `<img src="${defaultToolIcon}" alt="Tool icon" class="marketplace-item-icon-img" />`;
            }

            return `
        <div class="marketplace-item-pptb ${isInstalled ? "installed" : ""}" data-tool-id="${tool.id}">
            <div class="marketplace-item-top-tags">${tagsHtml}${isInstalled ? ' <span class="marketplace-item-installed-badge">Installed</span>' : ""}</div>
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
 * Open tool detail modal
 */
async function openToolDetail(tool: ToolDetail, isInstalled: boolean): Promise<void> {
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
    const iconElement = document.getElementById("tool-detail-icon");

    if (nameElement) nameElement.textContent = tool.name;
    if (descElement) descElement.textContent = tool.description;
    if (authorElement) authorElement.textContent = `Authors: ${tool.authors && tool.authors.length ? tool.authors.join(", ") : "Unknown"}`;
    if (categoryElement) categoryElement.textContent = `Category: ${tool.category}`;

    // Icon handling (emoji, image URL, or fallback)
    if (iconElement) {
        const isDarkTheme = document.body.classList.contains("dark-theme");
        const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
        let content = "";
        const iconUrl: string | undefined = (tool as ExtendedToolDetail).iconUrl || (tool as ExtendedToolDetail).icon;
        if (iconUrl) {
            if (iconUrl.startsWith("http://") || iconUrl.startsWith("https://")) {
                content = `<img src="${iconUrl}" alt="${tool.name} icon" onerror="this.src='${defaultToolIcon}'" />`;
            } else if (iconUrl.length <= 4) {
                // Likely an emoji or short text token
                content = `<span style="font-size:48px;line-height:1">${iconUrl}</span>`;
            } else {
                // Treat as text fallback
                content = `<span style="font-size:20px;font-weight:600">${iconUrl}</span>`;
            }
        } else {
            content = `<img src="${defaultToolIcon}" alt="Tool icon" />`;
        }
        iconElement.innerHTML = content;
    }

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

        const readmeUrl = (tool as ExtendedToolDetail).readme || (tool as ExtendedToolDetail).readmeUrl;
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
