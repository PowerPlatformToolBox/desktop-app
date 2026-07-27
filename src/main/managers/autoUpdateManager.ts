import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { EVENT_CHANNELS } from "../../common/ipc/channels";
import { logWarn } from "../../common/logger";

/**
 * Manages application auto-updates using electron-updater
 */
export class AutoUpdateManager extends EventEmitter {
    private mainWindow: BrowserWindow | null = null;
    private updateCheckInterval: NodeJS.Timeout | null = null;
    private isChecking = false;
    private readonly appUpdateConfigPath = path.join(process.resourcesPath, "app-update.yml");

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
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_CHECKING);
        });

        // Update available event
        autoUpdater.on("update-available", (info) => {
            this.isChecking = false;
            this.emit("update-available", info);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_AVAILABLE, {
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
            });
        });

        // Update not available event
        autoUpdater.on("update-not-available", () => {
            this.isChecking = false;
            this.emit("update-not-available");
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_NOT_AVAILABLE);
        });

        // Error event
        autoUpdater.on("error", (error) => {
            this.isChecking = false;
            this.emit("update-error", error);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_ERROR, error.message);
        });

        // Download progress event
        autoUpdater.on("download-progress", (progress) => {
            this.emit("download-progress", progress);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, {
                bytesPerSecond: progress.bytesPerSecond,
                percent: Math.round(progress.percent),
                transferred: progress.transferred,
                total: progress.total,
            });
        });

        // Update downloaded event
        autoUpdater.on("update-downloaded", (info) => {
            this.emit("update-downloaded", info);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_DOWNLOADED, {
                version: info.version,
            });
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
        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    /**
     * Determine whether the installed app has the updater metadata electron-updater needs.
     */
    private canCheckForUpdates(): boolean {
        if (!app.isPackaged) {
            return false;
        }

        return fs.existsSync(this.appUpdateConfigPath);
    }

    /**
     * Report that auto-updates are unavailable for the current installation.
     */
    private reportAutoUpdateUnavailable(action: string): void {
        let message = "Automatic updates are unavailable for this installation.";

        if (!app.isPackaged) {
            message = "Automatic updates are only available in packaged releases.";
            logWarn(`Skipping auto-update ${action}: app is not packaged`);
        } else if (process.platform === "win32") {
            message = "Automatic updates are only supported for the Windows NSIS (.exe) installer. If this app was installed via MSI, download the latest release manually from GitHub Releases.";
            logWarn(`Skipping auto-update ${action}: ${this.appUpdateConfigPath} not found (likely non-NSIS Windows install)`);
        } else {
            message = "Automatic updates are unavailable because updater metadata is missing from this installation.";
            logWarn(`Skipping auto-update ${action}: ${this.appUpdateConfigPath} not found`);
        }

        this.isChecking = false;
        this.emit("update-error", new Error(message));
        this.sendToRenderer(EVENT_CHANNELS.UPDATE_ERROR, message);
    }

    /**
     * Check for updates manually
     */
    async checkForUpdates(): Promise<void> {
        if (this.isChecking) {
            return;
        }

        if (!this.canCheckForUpdates()) {
            this.reportAutoUpdateUnavailable("check");
            return;
        }

        try {
            await autoUpdater.checkForUpdates();
        } catch (error) {
            this.emit("update-error", error);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_ERROR, (error as Error).message);
        }
    }

    /**
     * Download the available update
     */
    async downloadUpdate(): Promise<void> {
        if (!this.canCheckForUpdates()) {
            this.reportAutoUpdateUnavailable("download");
            return;
        }

        try {
            await autoUpdater.downloadUpdate();
        } catch (error) {
            this.emit("update-error", error);
            this.sendToRenderer(EVENT_CHANNELS.UPDATE_ERROR, (error as Error).message);
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

        if (!this.canCheckForUpdates()) {
            this.reportAutoUpdateUnavailable("scheduled check");
            return;
        }

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
