/**
 * Theme management module
 * Handles theme application and icon updates
 */

import { ACTIVITY_BAR_ICONS } from "../constants";

/**
 * Apply theme to the application
 */
export function applyTheme(theme: string): void {
    const body = document.body;

    if (theme === "system") {
        // Check system preference
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        body.classList.toggle("dark-theme", prefersDark);
        body.classList.toggle("light-theme", !prefersDark);
    } else if (theme === "dark") {
        body.classList.add("dark-theme");
        body.classList.remove("light-theme");
    } else {
        body.classList.add("light-theme");
        body.classList.remove("dark-theme");
    }

    // Update pin icons in tabs when theme changes
    updatePinIconsForTheme();

    // Update activity bar icons when theme changes
    updateActivityBarIconsForTheme();

    // Update connection icons when theme changes
    updateConnectionIconsForTheme();

    // Update tool sidebar icons when theme changes
    updateToolSidebarIconsForTheme();

    // Update marketplace icons when theme changes
    updateMarketplaceIconsForTheme();

    // Update homepage icon when theme changes
    updateHomepageIconForTheme();

    // Update filter icons when theme changes
    updateFilterIconsForTheme();
}

/**
 * Update pin icons to match current theme
 */
export function updatePinIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");

    // Update all pin icons in tabs
    document.querySelectorAll(".tool-tab").forEach((tab) => {
        const pinBtn = tab.querySelector(".tool-tab-pin img") as HTMLImageElement;
        if (pinBtn) {
            const isPinned = tab.classList.contains("pinned");
            if (isPinned) {
                pinBtn.src = isDarkTheme ? "icons/dark/pin-filled.svg" : "icons/light/pin-filled.svg";
            } else {
                pinBtn.src = isDarkTheme ? "icons/dark/pin.svg" : "icons/light/pin.svg";
            }
        }
    });
}

/**
 * Update connection icons to match current theme
 * Called when theme changes to update edit/delete icons
 */
export function updateConnectionIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const cacheBuster = `?t=${Date.now()}`;
    const iconPath = (isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg") + cacheBuster;
    const iconEditPath = (isDarkTheme ? "icons/dark/edit.svg" : "icons/light/edit.svg") + cacheBuster;
    const moreIconPath = (isDarkTheme ? "icons/dark/more-icon.svg" : "icons/light/more-icon.svg") + cacheBuster;

    // Update all connection action icons in sidebar
    const connectionsList = document.getElementById("sidebar-connections-list");
    if (connectionsList) {
        connectionsList.querySelectorAll('[data-action="edit"] img').forEach((img) => {
            (img as HTMLImageElement).src = iconEditPath;
        });
        connectionsList.querySelectorAll('[data-action="delete"] img').forEach((img) => {
            (img as HTMLImageElement).src = iconPath;
        });
        connectionsList.querySelectorAll(".tool-more-icon").forEach((img) => {
            (img as HTMLImageElement).src = moreIconPath;
        });
    }
}

/**
 * Update activity bar icons to match current theme
 */
export function updateActivityBarIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const prefix = isDarkTheme ? "icons/dark" : "icons/light";

    for (const m of ACTIVITY_BAR_ICONS) {
        const el = document.getElementById(m.id) as HTMLImageElement | null;
        if (el) {
            el.src = `${prefix}/${m.file}`;
        }
    }
}

/**
 * Update tool sidebar icons to match current theme
 * Called when theme changes to update star/trash icons in installed tools
 */
export function updateToolSidebarIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const cacheBuster = `?t=${Date.now()}`;
    const trashIconPath = isDarkTheme ? "icons/dark/trash.svg" : "icons/light/trash.svg";
    const starIconPath = isDarkTheme ? "icons/dark/star.svg" : "icons/light/star.svg";
    const starFilledIconPath = isDarkTheme ? "icons/dark/star-filled.svg" : "icons/light/star-filled.svg";
    const moreIconPath = isDarkTheme ? "icons/dark/more-icon.svg" : "icons/light/more-icon.svg";
    const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";

    const toolsList = document.getElementById("sidebar-tools-list");
    if (!toolsList) return;

    // Update trash icons (delete buttons)
    toolsList.querySelectorAll(".tool-item-delete-btn img").forEach((img) => {
        (img as HTMLImageElement).src = trashIconPath + cacheBuster;
    });

    // Update star icons (favorite buttons)
    toolsList.querySelectorAll(".tool-favorite-btn img").forEach((img) => {
        const button = img.closest(".tool-favorite-btn") as HTMLButtonElement;
        if (!button) return;

        const toolId = button.getAttribute("data-tool-id");
        if (!toolId) return;

        // Check if tool is favorited by checking if it's using the filled star
        const currentSrc = (img as HTMLImageElement).src;
        const isFavorited = currentSrc.includes("star-filled");

        (img as HTMLImageElement).src = (isFavorited ? starFilledIconPath : starIconPath) + cacheBuster;
    });

    // Update inline favorite icons rendered for installed tools list (no button wrapper)
    toolsList.querySelectorAll(".tool-favorite-icon").forEach((img) => {
        (img as HTMLImageElement).src = starFilledIconPath + cacheBuster;
    });

    // Update "more" menu icons
    toolsList.querySelectorAll(".tool-more-icon").forEach((img) => {
        (img as HTMLImageElement).src = moreIconPath + cacheBuster;
    });

    // Update default tool icons (fallback icons only)
    toolsList.querySelectorAll("img.tool-item-icon-img").forEach((img) => {
        const currentSrc = (img as HTMLImageElement).src;
        // Only update if it's using the default tool icon (not custom tool icons)
        if (currentSrc.includes("tool-default.svg")) {
            (img as HTMLImageElement).src = defaultToolIcon + cacheBuster;
        }
    });
}

/**
 * Update marketplace icons to match current theme
 * Called when theme changes to update default tool icons in marketplace
 */
export function updateMarketplaceIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const cacheBuster = `?t=${Date.now()}`;
    const defaultToolIcon = isDarkTheme ? "icons/dark/tool-default.svg" : "icons/light/tool-default.svg";
    const installIconPath = (isDarkTheme ? "icons/dark/install.svg" : "icons/light/install.svg") + cacheBuster;

    const marketplaceList = document.getElementById("marketplace-tools-list");
    if (!marketplaceList) return;

    // Update default tool icons (fallback icons only, not custom tool icons)
    marketplaceList.querySelectorAll(".marketplace-item-icon-pptb img.tool-item-icon-img").forEach((img) => {
        const currentSrc = (img as HTMLImageElement).src;
        // Only update if it's using the default tool icon (not custom tool icons from URLs)
        if (currentSrc.includes("tool-default.svg")) {
            (img as HTMLImageElement).src = defaultToolIcon + cacheBuster;
            // Also update the onerror attribute to match the new theme
            (img as HTMLImageElement).onerror = function () {
                this.src = defaultToolIcon;
            };
        }
    });

    // Update install buttons to match theme
    marketplaceList.querySelectorAll(".install-button img").forEach((img) => {
        (img as HTMLImageElement).src = installIconPath;
    });
}

/**
 * Update homepage icon to match current theme
 */
function updateHomepageIconForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const homepageIcon = document.getElementById("homepage-app-icon") as HTMLImageElement;
    if (homepageIcon) {
        homepageIcon.src = isDarkTheme ? "icons/dark/app-icon.svg" : "icons/light/app-icon.svg";
    }

    const newToolsIcon = document.getElementById("new-tools-icon") as HTMLImageElement | null;
    if (newToolsIcon) {
        newToolsIcon.src = isDarkTheme ? "icons/dark/star-filled.svg" : "icons/light/star-filled.svg";
    }
}

/**
 * Update filter icons to match current theme
 */
export function updateFilterIconsForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const cacheBuster = `?t=${Date.now()}`;
    const filterIconPath = (isDarkTheme ? "icons/dark/filter.svg" : "icons/light/filter.svg") + cacheBuster;

    const toolsFilterButton = document.getElementById("tools-filter-btn");
    if (toolsFilterButton) {
        const filterImg = toolsFilterButton.querySelector("img") as HTMLImageElement | null;
        if (filterImg) {
            filterImg.src = filterIconPath;
        }
    }

    const connectionsFilterButton = document.getElementById("connections-filter-btn");
    if (connectionsFilterButton) {
        const filterImg = connectionsFilterButton.querySelector("img") as HTMLImageElement | null;
        if (filterImg) {
            filterImg.src = filterIconPath;
        }
    }

    const marketplaceFilterButton = document.getElementById("marketplace-filter-btn");
    if (marketplaceFilterButton) {
        const filterImg = marketplaceFilterButton.querySelector("img") as HTMLImageElement | null;
        if (filterImg) {
            filterImg.src = filterIconPath;
        }
    }

    const settingsFilterButton = document.getElementById("settings-filter-btn");
    if (settingsFilterButton) {
        const filterImg = settingsFilterButton.querySelector("img") as HTMLImageElement | null;
        if (filterImg) {
            filterImg.src = filterIconPath;
        }
    }
}

/**
 * Apply terminal font family
 */
export function applyTerminalFont(fontFamily: string): void {
    const terminalPanelContent = document.getElementById("terminal-panel-content");
    if (terminalPanelContent) {
        terminalPanelContent.style.fontFamily = fontFamily;
    }

    // Also apply to any existing terminal output elements
    const terminalOutputElements = document.querySelectorAll(".terminal-output-content");
    terminalOutputElements.forEach((element) => {
        (element as HTMLElement).style.fontFamily = fontFamily;
    });
}

/**
 * Apply debug menu visibility setting
 */
export function applyDebugMenuVisibility(showDebugMenu: boolean): void {
    const debugActivityItem = document.querySelector('[data-sidebar="debug"]') as HTMLElement;
    if (debugActivityItem) {
        debugActivityItem.style.display = showDebugMenu ? "" : "none";
    }
}
