/**
 * Homepage management module
 * Handles homepage display, data loading, and user interactions
 */

import { captureException } from "../../common/sentryHelper";
import type { LastUsedToolEntry } from "../../common/types";
import { applyToolIconMasks, generateToolIconHtml } from "../utils/toolIconResolver";
import { switchSidebar } from "./sidebarManagement";
import { launchTool, LaunchToolOptions } from "./toolManagement";

function normalizeHomepageError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
        return error;
    }

    if (typeof error === "string") {
        return new Error(error);
    }

    try {
        const serialized = JSON.stringify(error);
        return new Error(serialized);
    } catch {
        return new Error(fallbackMessage);
    }
}

function reportHomepageError(operation: string, error: unknown, extra?: Record<string, unknown>): void {
    const normalized = normalizeHomepageError(error, `Homepage operation failed: ${operation}`);
    captureException(normalized, {
        tags: {
            module: "homepage",
            operation,
        },
        extra,
    });
}

/**
 * Show the homepage and hide the tool panel
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
 * Hide the homepage and show the tool panel
 */
export function hideHomePage(): void {
    // Show tool panel
    const toolPanel = document.getElementById("tool-panel");
    if (toolPanel) {
        toolPanel.style.display = "flex";
    }

    // Hide home view
    const homeView = document.getElementById("home-view");
    if (homeView) {
        homeView.style.display = "none";
        homeView.classList.remove("active");
    }
}

/**
 * Load all homepage data
 */
export async function loadHomepageData(): Promise<void> {
    await Promise.all([loadHeroStats(), loadNewToolsNotification(), loadWhatsNew(), loadSponsorData(), loadQuickAccessTools()]);
}

/**
 * Load new tools notification bar
 * Shows tools published in the last 7 days
 */
async function loadNewToolsNotification(): Promise<void> {
    try {
        // Get available tools from marketplace
        const availableTools = await window.toolboxAPI.fetchRegistryTools();

        // Calculate date 7 days ago
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Filter tools published in the last 7 days
        const newTools = availableTools.filter((tool: any) => {
            if (!tool.createdAt) return false;
            const createdDate = new Date(tool.createdAt);
            return createdDate >= sevenDaysAgo;
        });

        // Show notification if there are new tools
        const notificationBar = document.getElementById("new-tools-notification");
        const messageEl = document.getElementById("new-tools-message");

        if (newTools.length > 0 && notificationBar && messageEl) {
            if (newTools.length === 1) {
                // Single new tool
                messageEl.textContent = `${newTools[0].name} is now available in the marketplace!`;
            } else {
                // Multiple new tools
                messageEl.textContent = `${newTools.length} new tools available! Check them out in the marketplace.`;
            }

            notificationBar.style.display = "flex";

            // Add click handler to navigate to marketplace
            notificationBar.style.cursor = "pointer";
            notificationBar.onclick = () => {
                switchSidebar("marketplace");
            };
        } else if (notificationBar) {
            notificationBar.style.display = "none";
        }
    } catch (error) {
        reportHomepageError("loadNewToolsNotification", error);
    }
}

/**
 * Load hero section statistics
 */
async function loadHeroStats(): Promise<void> {
    try {
        // Get installed tools count
        const allTools = await window.toolboxAPI.getAllTools();
        const installedCount = allTools.length;

        // Get available tools count from marketplace (fetch registry tools)
        const availableTools = await window.toolboxAPI.fetchRegistryTools();
        const availableCount = availableTools.length;

        // Get connections count
        const connections = await window.toolboxAPI.connections.getAll();
        const connectionsCount = connections.length;

        // Update stats in the UI
        const installedCountEl = document.getElementById("stat-installed-count");
        const availableCountEl = document.getElementById("stat-available-count");
        const connectionsCountEl = document.getElementById("stat-connections-count");

        if (installedCountEl) {
            installedCountEl.textContent = installedCount.toString();
        }

        if (availableCountEl) {
            availableCountEl.textContent = availableCount.toString();
        }

        if (connectionsCountEl) {
            connectionsCountEl.textContent = connectionsCount.toString();
        }
    } catch (error) {
        reportHomepageError("loadHeroStats", error);
    }
}

/**
 * Load latest release information from GitHub
 */
async function loadWhatsNew(): Promise<void> {
    try {
        const response = await fetch("https://api.github.com/repos/PowerPlatformToolBox/desktop-app/releases/latest");

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const release = await response.json();
        const highlights = parseReleaseHighlights(release.body || "");

        // Update UI with release information
        const versionEl = document.getElementById("release-version");
        const dateEl = document.getElementById("release-date");
        const highlightsList = document.getElementById("release-highlights");
        const fullNotesLink = document.getElementById("release-full-notes");

        if (versionEl) {
            versionEl.textContent = release.tag_name || "Latest";
        }

        if (dateEl && release.published_at) {
            const date = new Date(release.published_at);
            dateEl.textContent = date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        }

        if (highlightsList) {
            highlightsList.innerHTML = highlights.map((highlight) => `<li>${highlight}</li>`).join("");
        }

        if (fullNotesLink && release.html_url) {
            fullNotesLink.setAttribute("href", release.html_url);
        }
    } catch (error) {
        reportHomepageError("loadWhatsNew", error);

        // Show fallback content
        const highlightsList = document.getElementById("release-highlights");
        if (highlightsList) {
            highlightsList.innerHTML = `
                <li>🎨 Modern VS Code-inspired interface with activity bar and sidebar</li>
                <li>🔧 Install and manage tools from the marketplace</li>
                <li>🔗 Manage multiple Dataverse connections</li>
                <li>⚙️ Customizable settings and themes</li>
                <li>🔄 Automatic updates to keep your toolbox current</li>
            `;
        }
    }
}

/**
 * Parse release notes and extract highlights with emoji icons
 */
function parseReleaseHighlights(body: string): string[] {
    const lines = body.split("\n");
    const highlights: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Look for list items
        if (trimmed.startsWith("*") || trimmed.startsWith("-") || trimmed.startsWith("•")) {
            let text = trimmed.substring(1).trim();

            // Remove markdown formatting
            text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // Remove links
            text = text.replace(/\*\*([^*]+)\*\*/g, "$1"); // Remove bold
            text = text.replace(/\*([^*]+)\*/g, "$1"); // Remove italic
            text = text.replace(/`([^`]+)`/g, "$1"); // Remove code

            // Add contextual emoji based on keywords
            let emoji = "✨"; // Default: new feature
            const lowerText = text.toLowerCase();

            if (lowerText.includes("fix") || lowerText.includes("bug")) {
                emoji = "🐛";
            } else if (lowerText.includes("improve") || lowerText.includes("performance") || lowerText.includes("optimize")) {
                emoji = "⚡";
            } else if (lowerText.includes("doc") || lowerText.includes("readme")) {
                emoji = "📚";
            }

            highlights.push(`${emoji} ${text}`);

            // Limit to 5 highlights
            if (highlights.length >= 5) {
                break;
            }
        }
    }

    // If no highlights found, return empty array
    return highlights;
}

/**
 * Load sponsor information
 */
async function loadSponsorData(): Promise<void> {
    try {
        // TODO: Placeholder sponsor count and avatars
        const sponsorCountEl = document.getElementById("sponsor-count");
        if (sponsorCountEl) {
            sponsorCountEl.textContent = "0";
        }

        // In the future, this could fetch real sponsor data from GitHub Sponsors API
        // which would require authentication
    } catch (error) {
        reportHomepageError("loadSponsorData", error);
    }
}

/**
 * Load quick access tools (favorites and recently used)
 */
async function loadQuickAccessTools(): Promise<void> {
    try {
        // Get all tools and settings
        const [allTools, userSettings] = await Promise.all([window.toolboxAPI.getAllTools(), window.toolboxAPI.getUserSettings()]);

        // Load favorite tools
        await loadFavoriteTools(allTools, userSettings.favoriteTools || []);

        // Load recently used tools
        await loadRecentlyUsedTools(allTools, userSettings.lastUsedTools || []);
    } catch (error) {
        reportHomepageError("loadQuickAccessTools", error);
    }
}

/**
 * Load favorite tools into the UI
 */
async function loadFavoriteTools(allTools: any[], favoriteToolIds: string[]): Promise<void> {
    const favoriteToolsList = document.getElementById("favorite-tools-list");
    if (!favoriteToolsList) return;

    // Get top 3 favorite tools
    const favoriteTools = favoriteToolIds
        .slice(0, 3)
        .map((toolId) => allTools.find((tool) => tool.id === toolId))
        .filter((tool) => tool !== undefined);

    if (favoriteTools.length === 0) {
        // Show empty state
        favoriteToolsList.innerHTML = `
            <div class="quick-tools-empty">
                <p>No favorite tools yet</p>
                <small>Mark tools as favorites to see them here</small>
            </div>
        `;
        return;
    }

    // Render favorite tools using safe DOM creation
    renderToolsList(favoriteToolsList, favoriteTools);
}

/**
 * Load recently used tools into the UI
 */
async function loadRecentlyUsedTools(allTools: any[], recentEntries: LastUsedToolEntry[]): Promise<void> {
    const recentlyUsedToolsList = document.getElementById("recently-used-tools-list");
    if (!recentlyUsedToolsList) return;

    const recentTools = recentEntries
        .slice()
        .reverse()
        .map((entry) => {
            const tool = allTools.find((toolItem) => toolItem.id === entry.toolId);
            return tool ? { tool, entry } : null;
        })
        .filter((item): item is { tool: any; entry: LastUsedToolEntry } => item !== null)
        .slice(0, 3);

    if (recentTools.length === 0) {
        // Show empty state
        recentlyUsedToolsList.innerHTML = `
            <div class="quick-tools-empty">
                <p>No recently used tools</p>
                <small>Launch tools to see them here</small>
            </div>
        `;
        return;
    }

    renderRecentToolsList(recentlyUsedToolsList, recentTools);
}

/**
 * Render a list of tools into a container (shared helper to avoid duplication)
 */
function renderToolsList(container: HTMLElement, tools: any[]): void {
    // Clear existing content
    container.innerHTML = "";

    tools.forEach((tool) => {
        // Create tool item
        const toolItem = document.createElement("div");
        toolItem.className = "quick-tool-item";
        toolItem.setAttribute("data-tool-id", tool.id);

        // Create icon container
        const iconContainer = document.createElement("div");
        iconContainer.className = "quick-tool-icon";

        // Theme-aware icon rendering (SVGs use CSS mask + currentColor)
        const toolIconHtml = generateToolIconHtml(tool.id, tool.icon, tool.name, "");
        if (toolIconHtml) {
            iconContainer.innerHTML = toolIconHtml;
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "quick-tool-icon-placeholder";
            placeholder.textContent = tool.name.charAt(0).toUpperCase();
            iconContainer.appendChild(placeholder);
        }

        // Create info container
        const infoContainer = document.createElement("div");
        infoContainer.className = "quick-tool-info";

        const nameDiv = document.createElement("div");
        nameDiv.className = "quick-tool-name";
        nameDiv.textContent = tool.name;

        const versionDiv = document.createElement("div");
        versionDiv.className = "quick-tool-version";
        versionDiv.textContent = `v${tool.version}`;

        infoContainer.appendChild(nameDiv);
        infoContainer.appendChild(versionDiv);

        // Assemble the tool item
        toolItem.appendChild(iconContainer);
        toolItem.appendChild(infoContainer);

        // Add click handler
        toolItem.addEventListener("click", async () => {
            await openTool(tool.id);
        });

        // Add to container
        container.appendChild(toolItem);
    });

    applyToolIconMasks(container);
}

function renderRecentToolsList(container: HTMLElement, items: { tool: any; entry: LastUsedToolEntry }[]): void {
    container.innerHTML = "";

    items.forEach(({ tool, entry }) => {
        const toolItem = document.createElement("div");
        toolItem.className = "quick-tool-item";
        toolItem.setAttribute("data-tool-id", tool.id);

        const iconContainer = document.createElement("div");
        iconContainer.className = "quick-tool-icon";

        // Theme-aware icon rendering (SVGs use CSS mask + currentColor)
        const toolIconHtml = generateToolIconHtml(tool.id, tool.icon, tool.name, "");
        if (toolIconHtml) {
            iconContainer.innerHTML = toolIconHtml;
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "quick-tool-icon-placeholder";
            placeholder.textContent = tool.name.charAt(0).toUpperCase();
            iconContainer.appendChild(placeholder);
        }

        const infoContainer = document.createElement("div");
        infoContainer.className = "quick-tool-info";

        const nameDiv = document.createElement("div");
        nameDiv.className = "quick-tool-name";
        nameDiv.textContent = tool.name;

        const versionDiv = document.createElement("div");
        versionDiv.className = "quick-tool-version";
        versionDiv.textContent = `v${tool.version}`;

        infoContainer.appendChild(nameDiv);
        infoContainer.appendChild(versionDiv);

        const connectionLabel = entry.primaryConnection?.name || entry.primaryConnection?.url || entry.primaryConnection?.id || null;
        if (connectionLabel) {
            const connectionDiv = document.createElement("div");
            connectionDiv.className = "quick-tool-connection";
            connectionDiv.textContent = `Connection: ${connectionLabel}`;
            infoContainer.appendChild(connectionDiv);
        }

        toolItem.appendChild(iconContainer);
        toolItem.appendChild(infoContainer);

        toolItem.addEventListener("click", async () => {
            await openTool(tool.id, {
                source: "recent",
                primaryConnectionId: entry.primaryConnection?.id ?? null,
                secondaryConnectionId: entry.secondaryConnection?.id ?? null,
            });
        });

        container.appendChild(toolItem);
    });

    applyToolIconMasks(container);
}

/**
 * Open a tool by ID
 */
async function openTool(toolId: string, options?: LaunchToolOptions): Promise<void> {
    try {
        await launchTool(toolId, options);
    } catch (error) {
        reportHomepageError("openTool", error, { toolId });
    }
}

/**
 * Set up event handlers for homepage actions
 */
export function setupHomepageActions(): void {
    // Sponsor button
    const sponsorBtn = document.getElementById("homepage-sponsor-btn");
    if (sponsorBtn) {
        sponsorBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/sponsors/PowerPlatformToolBox");
        });
    }

    // One-time donation link
    const oneTimeDonationLink = document.getElementById("homepage-one-time-donation");
    if (oneTimeDonationLink) {
        oneTimeDonationLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/sponsors/PowerPlatformToolBox?frequency=one-time");
        });
    }

    // Quick action cards
    const browseToolsCard = document.getElementById("quick-action-browse-tools");
    if (browseToolsCard) {
        browseToolsCard.addEventListener("click", (e) => {
            e.preventDefault();
            switchSidebar("marketplace");
        });
    }

    const docsCard = document.getElementById("quick-action-docs");
    if (docsCard) {
        docsCard.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://docs.powerplatformtoolbox.com");
        });
    }

    const discordCard = document.getElementById("quick-action-discord");
    if (discordCard) {
        discordCard.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://discord.gg/efwAu9sXyJ");
        });
    }

    const githubCard = document.getElementById("quick-action-github");
    if (githubCard) {
        githubCard.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatformToolBox/desktop-app");
        });
    }

    // Footer links
    const footerLinks = [
        { id: "footer-tool-submission", url: "https://www.powerplatformtoolbox.com/submit-tool" },
        { id: "footer-report-bug", url: "https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issue-form-bug.yml" },
        { id: "footer-request-feature", url: "https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issues-form-feature-request.yaml" },
        { id: "footer-license", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/LICENSE" },
    ];

    footerLinks.forEach(({ id, url }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener("click", (e) => {
                e.preventDefault();
                window.toolboxAPI.openExternal(url);
            });
        }
    });

    // Release full notes link
    const releaseFullNotes = document.getElementById("release-full-notes");
    if (releaseFullNotes) {
        releaseFullNotes.addEventListener("click", (e) => {
            const href = releaseFullNotes.getAttribute("href");
            if (href && href.startsWith("https://")) {
                e.preventDefault();
                window.toolboxAPI.openExternal(href);
            }
        });
    }
}
