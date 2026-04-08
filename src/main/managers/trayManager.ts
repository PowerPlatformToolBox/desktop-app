import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
import * as path from "path";

/**
 * TrayManager
 *
 * Manages the system tray icon so the application remains accessible when its
 * main window is closed.  This is particularly important on macOS, where
 * `window-all-closed` does not trigger `app.quit()` — the app intentionally
 * stays alive to support background tool execution.  Without a tray icon,
 * users have no visible affordance that the app is still running.
 *
 * The tray icon provides:
 * - A visual indicator that the app is running in the background
 * - A context menu with "Open Power Platform ToolBox" and "Quit" actions
 * - Double-click (macOS) / single-click (Windows/Linux) to restore the window
 */
export class TrayManager {
    private tray: Tray | null = null;
    private readonly getMainWindow: () => BrowserWindow | null;
    private readonly openMainWindow: () => void;

    constructor(getMainWindow: () => BrowserWindow | null, openMainWindow: () => void) {
        this.getMainWindow = getMainWindow;
        this.openMainWindow = openMainWindow;
    }

    /**
     * Create and show the tray icon.  Safe to call multiple times — subsequent
     * calls are no-ops if the tray is already active.
     */
    create(): void {
        if (this.tray) {
            return;
        }

        const iconPath = path.join(__dirname, "../../icons/icon.png");
        let icon = nativeImage.createFromPath(iconPath);

        // Tray icons should be 16×16 (standard) or 22×22 pixels.
        icon = icon.resize({ width: 16, height: 16 });

        // On macOS, marking the image as a template lets the OS automatically
        // adapt the icon color for both light and dark menu bars.
        if (process.platform === "darwin") {
            icon.setTemplateImage(true);
        }

        this.tray = new Tray(icon);
        this.tray.setToolTip("Power Platform ToolBox");

        this.updateContextMenu();

        // macOS: double-click restores the window (single-click opens the context menu).
        // Windows / Linux: single-click also restores the window.
        if (process.platform === "darwin") {
            this.tray.on("double-click", () => {
                this.showMainWindow();
            });
        } else {
            this.tray.on("click", () => {
                this.showMainWindow();
            });
        }
    }

    /**
     * Destroy the tray icon.  Should be called just before the application quits
     * so the icon is removed from the system tray immediately.
     */
    destroy(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private showMainWindow(): void {
        const mainWindow = this.getMainWindow();
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        } else {
            // Window was fully closed — re-create it.
            this.openMainWindow();
        }
    }

    private updateContextMenu(): void {
        if (!this.tray) {
            return;
        }

        const contextMenu = Menu.buildFromTemplate([
            {
                label: "Open Power Platform ToolBox",
                click: () => this.showMainWindow(),
            },
            { type: "separator" },
            {
                label: "Quit",
                click: () => app.quit(),
            },
        ]);

        this.tray.setContextMenu(contextMenu);
    }
}
