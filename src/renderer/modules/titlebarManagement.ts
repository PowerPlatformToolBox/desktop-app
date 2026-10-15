import { toggleSidebar } from "./sidebarManagement";
import { openGlobalSearch } from "./globalSearchManagement";

/** Connect the custom renderer title bar to the main-process window controls. */
export function initializeTitlebar(): void {
    const isMacOs = navigator.platform.toLowerCase().includes("mac");
    const isWindows = navigator.platform.toLowerCase().includes("win");
    document.body.classList.toggle("macos", isMacOs);
    document.body.classList.toggle("windows", isWindows);

    const minimizeButton = document.getElementById("window-minimize-btn");
    const maximizeButton = document.getElementById("window-maximize-btn");
    const closeButton = document.getElementById("window-close-btn");
    const sidebarButton = document.getElementById("toggle-sidebar-btn");
    const searchButton = document.getElementById("titlebar-search-btn");
    const menuBar = document.getElementById("app-menubar");

    const updateFullScreenState = (isFullScreen: boolean): void => {
        document.body.classList.toggle("window-full-screen", isFullScreen);
    };

    window.toolboxAPI.window.onFullScreenChanged(updateFullScreenState);

    const updateSidebarButtonState = (): void => {
        const isCollapsed = document.getElementById("sidebar")?.classList.contains("collapsed") ?? false;
        sidebarButton?.setAttribute("aria-pressed", String(!isCollapsed));
        if (sidebarButton) {
            sidebarButton.title = isCollapsed ? "Show sidebar" : "Hide sidebar";
            sidebarButton.setAttribute("aria-label", isCollapsed ? "Show sidebar" : "Hide sidebar");
            sidebarButton.classList.toggle("sidebar-is-collapsed", isCollapsed);
        }
    };

    sidebarButton?.addEventListener("click", () => {
        toggleSidebar();
        updateSidebarButtonState();
    });
    updateSidebarButtonState();

    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
        const sidebarStateObserver = new MutationObserver(updateSidebarButtonState);
        sidebarStateObserver.observe(sidebar, { attributeFilter: ["class"] });
    }

    searchButton?.addEventListener("click", openGlobalSearch);

    if (!isMacOs && menuBar) {
        menuBar.querySelectorAll<HTMLButtonElement>("[data-menu-label]").forEach((menuButton) => {
            menuButton.addEventListener("click", () => {
                const rect = menuButton.getBoundingClientRect();
                void window.toolboxAPI.window.openMenu(menuButton.dataset.menuLabel ?? "", Math.round(rect.left), Math.round(rect.bottom));
            });
        });
    }

    minimizeButton?.addEventListener("click", () => {
        void window.toolboxAPI.window.minimize();
    });

    maximizeButton?.addEventListener("click", async () => {
        const isMaximized = await window.toolboxAPI.window.toggleMaximize();
        maximizeButton.title = isMaximized ? "Restore" : "Maximize";
        maximizeButton.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
    });

    closeButton?.addEventListener("click", () => {
        void window.toolboxAPI.window.close();
    });

    void window.toolboxAPI.window.isMaximized().then((isMaximized) => {
        if (maximizeButton && isMaximized) {
            maximizeButton.title = "Restore";
            maximizeButton.setAttribute("aria-label", "Restore");
        }
    });

    void window.toolboxAPI.window.isFullScreen().then(updateFullScreenState);
}
