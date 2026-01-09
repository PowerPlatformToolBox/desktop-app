/**
 * Sidebar management module
 * Handles sidebar switching and activity bar navigation
 */

import { loadSidebarSettings } from "./settingsManagement";

// Track current sidebar
let currentSidebarId: string | null = "tools";

/**
 * Get current sidebar ID
 */
export function getCurrentSidebarId(): string | null {
    return currentSidebarId;
}

/**
 * Switch to a different sidebar panel
 */
export function switchSidebar(sidebarId: string): void {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    // If clicking the same sidebar, toggle collapse
    if (currentSidebarId === sidebarId) {
        sidebar.classList.toggle("collapsed");
        if (sidebar.classList.contains("collapsed")) {
            // Sidebar is now collapsed
            document.querySelectorAll(".activity-item").forEach((item) => {
                item.classList.remove("active");
            });
            currentSidebarId = null;
        } else {
            // Sidebar is now expanded
            const activeActivity = document.querySelector(`[data-sidebar="${sidebarId}"]`);
            if (activeActivity) {
                activeActivity.classList.add("active");
            }
            currentSidebarId = sidebarId;
            
            // Load settings when re-expanding settings sidebar
            if (sidebarId === "settings") {
                loadSidebarSettings().catch((err) => console.error("Failed to load sidebar settings:", err));
            }
        }
        window.api?.send("sidebar-layout-changed");
        return;
    }

    // Switching to a different sidebar
    sidebar.classList.remove("collapsed");
    currentSidebarId = sidebarId;

    // Update activity items
    document.querySelectorAll(".activity-item").forEach((item) => {
        item.classList.remove("active");
    });
    const activeActivity = document.querySelector(`[data-sidebar="${sidebarId}"]`);
    if (activeActivity) {
        activeActivity.classList.add("active");
    }

    // Update sidebar content visibility
    document.querySelectorAll(".sidebar-content").forEach((content) => {
        content.classList.remove("active");
    });
    const targetContent = document.getElementById(`sidebar-${sidebarId}`);
    if (targetContent) {
        targetContent.classList.add("active");
    }

    // Load settings when switching to settings sidebar
    if (sidebarId === "settings") {
        loadSidebarSettings().catch((err) => console.error("Failed to load sidebar settings:", err));
    }

    window.api?.send("sidebar-layout-changed");
}
