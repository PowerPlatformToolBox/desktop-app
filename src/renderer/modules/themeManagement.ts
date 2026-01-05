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

    // Update homepage icon when theme changes
    updateHomepageIconForTheme();
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

/**
 * Update homepage icon to match current theme
 */
function updateHomepageIconForTheme(): void {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const homepageIcon = document.getElementById("homepage-app-icon") as HTMLImageElement;
    if (homepageIcon) {
        homepageIcon.src = isDarkTheme ? "icons/dark/app-icon.svg" : "icons/light/app-icon.svg";
    }
}
