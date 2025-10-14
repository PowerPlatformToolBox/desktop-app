import { BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { EventEmitter } from "events";

/**
 * Manages application auto-updates using electron-updater
 */
export class AutoUpdateManager extends EventEmitter {
    private mainWindow: BrowserWindow | null = null;
    private updateCheckInterval: NodeJS.Timeout | null = null;
    private isChecking = false;

    constructor() {
        super();
        this.setupAutoUpdater();
    }

    /**
     * Set up auto-updater event listeners
     */
    private setupAutoUpdater(): void {
        // Configure auto-updater
        autoUpdater.autoDownload = false; // Don't auto-download, let user choose
        autoUpdater.autoInstallOnAppQuit = true;

        // Check for updates event
        autoUpdater.on("checking-for-update", () => {
            this.isChecking = true;
            this.emit("checking-for-update");
            this.sendToRenderer("update-checking");
        });

        // Update available event
        autoUpdater.on("update-available", (info) => {
            this.isChecking = false;
            this.emit("update-available", info);
            this.sendToRenderer("update-available", {
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
            });

            // Show dialog to user
            if (this.mainWindow) {
                dialog
                    .showMessageBox(this.mainWindow, {
                        type: "info",
                        title: "Update Available",
                        message: `A new version ${info.version} is available. Would you like to download it now?`,
                        buttons: ["Download", "Later"],
                        defaultId: 0,
                        cancelId: 1,
                    })
                    .then((result) => {
                        if (result.response === 0) {
                            this.downloadUpdate();
                        }
                    });
            }
        });

        // Update not available event
        autoUpdater.on("update-not-available", () => {
            this.isChecking = false;
            this.emit("update-not-available");
            this.sendToRenderer("update-not-available");
        });

        // Error event
        autoUpdater.on("error", (error) => {
            this.isChecking = false;
            this.emit("update-error", error);
            this.sendToRenderer("update-error", error.message);
        });

        // Download progress event
        autoUpdater.on("download-progress", (progress) => {
            this.emit("download-progress", progress);
            this.sendToRenderer("update-download-progress", {
                bytesPerSecond: progress.bytesPerSecond,
                percent: Math.round(progress.percent),
                transferred: progress.transferred,
                total: progress.total,
            });
        });

        // Update downloaded event
        autoUpdater.on("update-downloaded", (info) => {
            this.emit("update-downloaded", info);
            this.sendToRenderer("update-downloaded", {
                version: info.version,
            });

            // Show dialog to user
            if (this.mainWindow) {
                dialog
                    .showMessageBox(this.mainWindow, {
                        type: "info",
                        title: "Update Ready",
                        message: `Version ${info.version} has been downloaded. Restart the application to apply the update?`,
                        buttons: ["Restart Now", "Later"],
                        defaultId: 0,
                        cancelId: 1,
                    })
                    .then((result) => {
                        if (result.response === 0) {
                            autoUpdater.quitAndInstall();
                        }
                    });
            }
        });
    }

    /**
     * Set the main window for sending events
     */
    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window;
    }

    /**
     * Send update events to renderer process
     */
    private sendToRenderer(channel: string, data?: unknown): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Check for updates manually
     */
    async checkForUpdates(): Promise<void> {
        if (this.isChecking) {
            return;
        }

        try {
            await autoUpdater.checkForUpdates();
        } catch (error) {
            this.emit("update-error", error);
            this.sendToRenderer("update-error", (error as Error).message);
        }
    }

    /**
     * Download the available update
     */
    async downloadUpdate(): Promise<void> {
        try {
            await autoUpdater.downloadUpdate();
        } catch (error) {
            this.emit("update-error", error);
            this.sendToRenderer("update-error", (error as Error).message);
        }
    }

    /**
     * Install the downloaded update and restart
     */
    quitAndInstall(): void {
        autoUpdater.quitAndInstall();
    }

    /**
     * Enable automatic update checks
     */
    enableAutoUpdateChecks(intervalHours = 6): void {
        // Clear existing interval if any
        this.disableAutoUpdateChecks();

        // Check for updates now
        this.checkForUpdates();

        // Set up periodic checks
        const intervalMs = intervalHours * 60 * 60 * 1000;
        this.updateCheckInterval = setInterval(() => {
            this.checkForUpdates();
        }, intervalMs);
    }

    /**
     * Disable automatic update checks
     */
    disableAutoUpdateChecks(): void {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
        }
    }

    /**
     * Get current version
     */
    getCurrentVersion(): string {
        return autoUpdater.currentVersion.version;
    }
}
