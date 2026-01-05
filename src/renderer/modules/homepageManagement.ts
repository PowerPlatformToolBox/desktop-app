/**
 * Homepage management module
 * Handles homepage display, data loading, and user interactions
 */

import { switchSidebar } from "./sidebarManagement";
import { launchTool } from "./toolManagement";

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
    await Promise.all([loadHeroStats(), loadWhatsNew(), loadSponsorData(), loadQuickAccessTools()]);
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

        // Update stats in the UI
        const installedCountEl = document.getElementById("stat-installed-count");
        const availableCountEl = document.getElementById("stat-available-count");
        const activeUsersEl = document.getElementById("stat-active-users");

        if (installedCountEl) {
            installedCountEl.textContent = installedCount.toString();
        }

        if (availableCountEl) {
            availableCountEl.textContent = availableCount.toString();
        }

        // TODO: Active users is a placeholder for now
        if (activeUsersEl) {
            activeUsersEl.textContent = "Coming soon";
            activeUsersEl.setAttribute("aria-label", "Active users statistic coming soon");
        }
    } catch (error) {
        console.error("Failed to load hero stats:", error);
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
        console.error("Failed to load what's new:", error);

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
        console.error("Failed to load sponsor data:", error);
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
        console.error("Failed to load quick access tools:", error);
    }
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
async function loadRecentlyUsedTools(allTools: any[], recentlyUsedToolIds: string[]): Promise<void> {
    const recentlyUsedToolsList = document.getElementById("recently-used-tools-list");
    if (!recentlyUsedToolsList) return;

    // Get top 3 recently used tools (reverse order - most recent first)
    const recentTools = recentlyUsedToolIds
        .slice()
        .reverse()
        .slice(0, 3)
        .map((toolId) => allTools.find((tool) => tool.id === toolId))
        .filter((tool) => tool !== undefined);

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

    // Render recently used tools using safe DOM creation
    renderToolsList(recentlyUsedToolsList, recentTools);
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

        if (tool.iconUrl) {
            const img = document.createElement("img");
            img.src = tool.iconUrl;
            img.alt = escapeHtml(tool.name);
            iconContainer.appendChild(img);
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
}

/**
 * Open a tool by ID
 */
async function openTool(toolId: string): Promise<void> {
    try {
        launchTool(toolId);
    } catch (error) {
        console.error(`Failed to open tool ${toolId}:`, error);
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
