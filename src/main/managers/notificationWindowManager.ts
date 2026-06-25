import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";

interface NotificationOptions {
    title: string;
    body: string;
    type?: "info" | "success" | "warning" | "error";
    duration?: number;
    actions?: Array<{ label: string; callback: string }>;
}

/** A single entry stored in the persistent notification history. */
export interface NotificationHistoryEntry {
    title: string;
    body: string;
    type: "info" | "success" | "warning" | "error";
    /** ISO-8601 timestamp string (serialisable across process boundaries). */
    timestamp: string;
}

const HISTORY_MAX_SIZE = 100;
const HISTORY_WINDOW_TITLE = "Notification History";

/**
 * NotificationHistoryWindowManager
 *
 * Manages an always-on-top frameless BrowserWindow that displays the
 * persistent notification history.  The window is created lazily when the
 * user first clicks the bell button, then shown/hidden on subsequent clicks.
 *
 * History data is owned by the main process so the window is always in sync
 * regardless of renderer reloads.
 */
export class NotificationHistoryWindowManager {
    private historyWindow: BrowserWindow | null = null;
    private mainWindow: BrowserWindow;
    private history: NotificationHistoryEntry[] = [];
    private unreadCount: number = 0;
    private isPanelOpen: boolean = false;

    private readonly WINDOW_WIDTH = 380;
    private readonly WINDOW_HEIGHT = 480;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.setupIpcHandlers();
        this.setupMainWindowListeners();
    }

    /**
     * Called by NotificationWindowManager whenever a new notification is shown
     * so the history window can track all notifications.
     */
    addNotification(options: { title: string; body: string; type?: string }): void {
        const VALID_TYPES: ReadonlyArray<NotificationHistoryEntry["type"]> = ["info", "success", "warning", "error"];
        const rawType = options.type;
        const type = (rawType && (VALID_TYPES as readonly string[]).includes(rawType) ? rawType : "info") as NotificationHistoryEntry["type"];

        this.history.unshift({ title: options.title, body: options.body, type, timestamp: new Date().toISOString() });
        if (this.history.length > HISTORY_MAX_SIZE) {
            this.history.pop();
        }
        this.unreadCount++;
        this.sendBadgeUpdate();
    }

    private setupIpcHandlers(): void {
        this.removeIpcHandlers();
        ipcMain.on("notification-history:open", () => this.openPanel());
        ipcMain.on("notification-history:close", () => this.closePanel());
        ipcMain.on("notification-history:clear", () => this.clearHistory());
    }

    private removeIpcHandlers(): void {
        ipcMain.removeAllListeners("notification-history:open");
        ipcMain.removeAllListeners("notification-history:close");
        ipcMain.removeAllListeners("notification-history:clear");
    }

    private setupMainWindowListeners(): void {
        this.mainWindow.on("move", () => this.updateWindowPosition());
        this.mainWindow.on("resize", () => this.updateWindowPosition());
        this.mainWindow.on("minimize", () => {
            if (this.isPanelOpen) this.closePanel();
        });
        this.mainWindow.on("closed", () => this.destroy());
    }

    private openPanel(): void {
        if (!this.historyWindow) {
            this.createHistoryWindow();
        }

        this.isPanelOpen = true;
        this.unreadCount = 0;
        this.sendBadgeUpdate();
        this.updateWindowContent();
        this.updateWindowPosition();
        this.historyWindow!.show();

        // Tell the renderer the panel is now open so it can update aria-pressed.
        this.mainWindow.webContents.send("notification-history:opened");
    }

    private closePanel(): void {
        this.isPanelOpen = false;
        this.historyWindow?.hide();
        // Tell the renderer the panel closed (triggered by blur, Escape, or explicit close).
        this.mainWindow.webContents.send("notification-history:closed");
    }

    private clearHistory(): void {
        this.history = [];
        this.unreadCount = 0;
        this.sendBadgeUpdate();
        if (this.isPanelOpen) {
            this.updateWindowContent();
        }
    }

    private sendBadgeUpdate(): void {
        this.mainWindow.webContents.send("notification:badge-update", this.unreadCount);
    }

    private createHistoryWindow(): void {
        this.historyWindow = new BrowserWindow({
            width: this.WINDOW_WIDTH,
            height: this.WINDOW_HEIGHT,
            title: HISTORY_WINDOW_TITLE,
            frame: false,
            transparent: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: true,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: path.join(__dirname, "notificationPreload.js"),
            },
        });

        this.historyWindow.setParentWindow(this.mainWindow);

        // Close the panel when the window loses OS focus (user clicked elsewhere).
        this.historyWindow.on("blur", () => {
            if (this.isPanelOpen) this.closePanel();
        });

        this.historyWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.generateHistoryHTML())}`);
    }

    private updateWindowContent(): void {
        if (!this.historyWindow) return;
        this.historyWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.generateHistoryHTML())}`);
    }

    private updateWindowPosition(): void {
        if (!this.historyWindow?.isVisible()) return;
        const mainBounds = this.mainWindow.getBounds();
        const x = mainBounds.x + mainBounds.width - this.WINDOW_WIDTH - 10;
        const y = mainBounds.y + mainBounds.height - this.WINDOW_HEIGHT - 40;
        this.historyWindow.setBounds({ x, y, width: this.WINDOW_WIDTH, height: this.WINDOW_HEIGHT });
    }

    private formatTimestamp(isoString: string): string {
        const date = new Date(isoString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) {
            return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        }
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    private generateHistoryHTML(): string {
        const icons: Record<NotificationHistoryEntry["type"], string> = {
            info: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 6h1v3h-1V6z"/><path d="M8 10.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
            success: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm3.844 4.844a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5z"/></svg>',
            warning: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 4h1v4h-1V4z"/><path d="M8 11a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
            error: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zM4.646 4.646a.5.5 0 0 0 0 .708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 0 0-.708 0z"/></svg>',
        };

        const hasHistory = this.history.length > 0;
        const listHTML = hasHistory
            ? this.history
                  .map(
                      (entry) => `
                <div class="notification-history-entry notification-history-entry--${entry.type}" role="listitem">
                    <span class="notification-history-entry__icon">${icons[entry.type]}</span>
                    <div class="notification-history-entry__body">
                        <div class="notification-history-entry__title">${this.escapeHtml(entry.title)}</div>
                        <div class="notification-history-entry__message">${this.escapeHtml(entry.body)}</div>
                    </div>
                    <span class="notification-history-entry__time">${this.formatTimestamp(entry.timestamp)}</span>
                </div>`,
                  )
                  .join("")
            : "";

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>${HISTORY_WINDOW_TITLE}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        #notification-history-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            border: 1px solid #3c3c3c;
            border-radius: 6px;
            overflow: hidden;
        }
        .notification-history-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid #3c3c3c;
            flex-shrink: 0;
            background: #252526;
        }
        .notification-history-title {
            font-size: 12px;
            font-weight: 600;
            color: #d4d4d4;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        #notification-clear-all-btn {
            font-size: 11px;
            color: #9d9d9d;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: color 0.15s ease, background 0.15s ease;
        }
        #notification-clear-all-btn:hover { color: #d4d4d4; background: rgba(255,255,255,0.08); }
        #notification-history-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        #notification-history-empty {
            padding: 24px 16px;
            text-align: center;
            font-size: 12px;
            color: #9d9d9d;
        }
        .notification-history-entry {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 12px;
            border-left: 3px solid transparent;
            transition: background 0.12s ease;
        }
        .notification-history-entry:hover { background: rgba(255,255,255,0.05); }
        .notification-history-entry + .notification-history-entry { border-top: 1px solid #3c3c3c; }
        .notification-history-entry--info    { border-left-color: #0078d4; }
        .notification-history-entry--success { border-left-color: #107c10; }
        .notification-history-entry--warning { border-left-color: #c17a00; }
        .notification-history-entry--error   { border-left-color: #d13438; }
        .notification-history-entry__icon { flex-shrink: 0; margin-top: 2px; }
        .notification-history-entry--info    .notification-history-entry__icon { color: #0078d4; }
        .notification-history-entry--success .notification-history-entry__icon { color: #107c10; }
        .notification-history-entry--warning .notification-history-entry__icon { color: #c17a00; }
        .notification-history-entry--error   .notification-history-entry__icon { color: #d13438; }
        .notification-history-entry__body { flex: 1; min-width: 0; }
        .notification-history-entry__title {
            font-size: 12px;
            font-weight: 600;
            color: #d4d4d4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }
        .notification-history-entry__message {
            font-size: 11px;
            color: #9d9d9d;
            line-height: 1.4;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        .notification-history-entry__time {
            font-size: 10px;
            color: #6b6b6b;
            flex-shrink: 0;
            margin-top: 2px;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div id="notification-history-panel">
        <div class="notification-history-header">
            <span class="notification-history-title">Notifications</span>
            <button type="button" id="notification-clear-all-btn">Clear All</button>
        </div>
        <div id="notification-history-list" role="list">${listHTML}</div>
        <div id="notification-history-empty"${hasHistory ? ' style="display:none"' : ""}>No notifications yet</div>
    </div>
    <script>
        document.getElementById("notification-clear-all-btn").addEventListener("click", function() {
            window.electron.clearHistory();
        });
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") { window.electron.closeHistoryPanel(); }
        });
    </script>
</body>
</html>`;
    }

    destroy(): void {
        this.removeIpcHandlers();
        if (this.historyWindow) {
            this.historyWindow.destroy();
            this.historyWindow = null;
        }
        this.history = [];
        this.unreadCount = 0;
        this.isPanelOpen = false;
    }
}

/**
 * NotificationWindowManager
 *
 * Manages a frameless BrowserWindow for displaying notifications.
 * The window is set as a child of the main window so it stays
 * associated without floating above unrelated windows (e.g. modals).
 *
 * Notification system - notifications appear in a dedicated
 * window that floats above the main application.
 */
export class NotificationWindowManager {
    private notificationWindow: BrowserWindow | null = null;
    private mainWindow: BrowserWindow;
    private notifications: NotificationOptions[] = [];
    private historyManager: NotificationHistoryWindowManager | null = null;
    private readonly MAX_NOTIFICATIONS = 3;
    private readonly WINDOW_WIDTH = 400;
    private readonly NOTIFICATION_HEIGHT = 100;
    private readonly PADDING = 16;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.createNotificationWindow();
        this.setupIpcHandlers();
        this.setupMainWindowListeners();
    }

    /** Wire up the history manager so each shown notification is also recorded. */
    setHistoryManager(manager: NotificationHistoryWindowManager): void {
        this.historyManager = manager;
    }

    /**
     * Create the notification window
     */
    private createNotificationWindow(): void {
        this.notificationWindow = new BrowserWindow({
            width: this.WINDOW_WIDTH,
            height: this.calculateWindowHeight(),
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: false,
            show: false,
            hasShadow: false, // Remove window shadow
            backgroundColor: "#00000000", // Fully transparent background
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                // Use a small preload script to expose a safe `window.electron` API
                // Preload path resolves at runtime to the compiled JS in `dist/main`
                sandbox: false,
                preload: path.join(__dirname, "notificationPreload.js"),
            },
        });

        // Set parent to main window so it stays associated
        this.notificationWindow.setParentWindow(this.mainWindow);

        // Load initial empty content
        this.notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.generateHTML())}`);

        // Position window
        this.updateWindowPosition();
    }

    /**
     * Calculate window height based on number of notifications
     */
    private calculateWindowHeight(): number {
        const notificationCount = Math.min(this.notifications.length, this.MAX_NOTIFICATIONS);
        if (notificationCount === 0) return 100; // Minimum height
        return (this.NOTIFICATION_HEIGHT + this.PADDING) * notificationCount + this.PADDING;
    }

    /**
     * Update window position to be bottom-right of main window
     */
    private updateWindowPosition(): void {
        if (!this.notificationWindow) return;

        const mainBounds = this.mainWindow.getBounds();
        const windowHeight = this.calculateWindowHeight();

        const x = mainBounds.x + mainBounds.width - this.WINDOW_WIDTH - 20;
        const y = mainBounds.y + mainBounds.height - windowHeight - 10; // from bottom for more space

        this.notificationWindow.setBounds({
            x,
            y,
            width: this.WINDOW_WIDTH,
            height: windowHeight,
        });
    }

    /**
     * Setup listeners for main window events
     */
    private setupMainWindowListeners(): void {
        // Update position when main window moves or resizes
        this.mainWindow.on("move", () => this.updateWindowPosition());
        this.mainWindow.on("resize", () => this.updateWindowPosition());
        this.mainWindow.on("minimize", () => this.notificationWindow?.hide());
        this.mainWindow.on("restore", () => {
            if (this.notifications.length > 0) {
                this.notificationWindow?.show();
            }
        });
        this.mainWindow.on("closed", () => this.destroy());
    }

    /**
     * Setup IPC handlers for notifications
     */
    private setupIpcHandlers(): void {
        // Remove existing handlers first to prevent duplicate registration errors
        // This is necessary on macOS where the app doesn't quit when windows are closed
        this.removeIpcHandlers();

        ipcMain.handle("notification:show", async (event, options: NotificationOptions) => {
            this.showNotification(options);
            this.historyManager?.addNotification(options);
        });

        ipcMain.on("notification:dismiss", (event, index: number) => {
            this.dismissNotification(index);
        });

        ipcMain.on("notification:action", (event, index: number, actionIndex: number) => {
            const notification = this.notifications[index];
            if (notification && notification.actions && notification.actions[actionIndex]) {
                // Trigger action callback in renderer
                this.mainWindow.webContents.send("notification:action-triggered", {
                    notificationIndex: index,
                    actionIndex,
                    callback: notification.actions[actionIndex].callback,
                });
            }
            this.dismissNotification(index);
        });
    }

    /**
     * Remove IPC handlers to allow clean re-registration
     */
    private removeIpcHandlers(): void {
        ipcMain.removeHandler("notification:show");
        ipcMain.removeAllListeners("notification:dismiss");
        ipcMain.removeAllListeners("notification:action");
    }

    /**
     * Show a notification
     */
    showNotification(options: NotificationOptions): void {
        // Add notification to queue
        this.notifications.push(options);

        // Remove oldest if we exceed max
        if (this.notifications.length > this.MAX_NOTIFICATIONS) {
            this.notifications.shift();
        }

        // Update window
        this.updateWindow();

        // Auto-dismiss after duration
        const duration = options.duration !== undefined ? options.duration : 5000;
        if (duration > 0) {
            setTimeout(() => {
                const index = this.notifications.indexOf(options);
                if (index >= 0) {
                    this.dismissNotification(index);
                }
            }, duration);
        }
    }

    /**
     * Dismiss a notification
     */
    private dismissNotification(index: number): void {
        if (index >= 0 && index < this.notifications.length) {
            this.notifications.splice(index, 1);
            this.updateWindow();
        }
    }

    /**
     * Update the window content and visibility
     */
    private updateWindow(): void {
        if (!this.notificationWindow) return;

        // Update window size
        const newHeight = this.calculateWindowHeight();
        this.notificationWindow.setSize(this.WINDOW_WIDTH, newHeight);
        this.updateWindowPosition();

        // Reload HTML with updated notifications
        this.notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.generateHTML())}`);

        // Show/hide based on notifications
        if (this.notifications.length > 0) {
            this.notificationWindow.showInactive(); // Show without stealing focus
        } else {
            this.notificationWindow.hide();
        }
    }

    /**
     * Generate HTML for the notification window
     */
    private generateHTML(): string {
        const icons = {
            info: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 6h1v3h-1V6z"/><path d="M8 10.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
            success:
                '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm3.844 4.844a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5z"/></svg>',
            warning:
                '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 4h1v4h-1V4z"/><path d="M8 11a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
            error: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zM4.646 4.646a.5.5 0 0 0 0 .708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 0 0-.708 0z"/></svg>',
        };

        const notificationsHTML = this.notifications
            .map((notification, index) => {
                const type = notification.type || "info";
                const icon = icons[type];
                const actionsHTML = notification.actions
                    ? `<div class="notification-actions">
                        ${notification.actions
                            .map((action, actionIndex) => `<button class="notification-action" onclick="window.electron.actionClicked(${index}, ${actionIndex})">${action.label}</button>`)
                            .join("")}
                       </div>`
                    : "";

                return `
                    <div class="notification ${type}" style="animation: slideIn 0.3s ease-out;">
                        <div class="notification-icon">${icon}</div>
                        <div class="notification-content">
                            <div class="notification-title">${notification.title}</div>
                            <div class="notification-message">${notification.body}</div>
                            ${actionsHTML}
                        </div>
                        <button class="notification-close" onclick="window.electron.dismissNotification(${index})">&times;</button>
                    </div>
                `;
            })
            .join("");

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: transparent;
            padding: ${this.PADDING}px;
            overflow: hidden;
        }

        .notification {
            background: #2d2d2d;
            border-left: 3px solid;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: ${this.PADDING}px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            color: #cccccc;
        }

        .notification.info { border-left-color: #007acc; }
        .notification.success { border-left-color: #4caf50; }
        .notification.warning { border-left-color: #ff9800; }
        .notification.error { border-left-color: #f44336; }

        .notification-icon {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            margin-top: 2px;
        }

        .notification-icon svg {
            width: 100%;
            height: 100%;
        }

        .notification.info .notification-icon { color: #007acc; }
        .notification.success .notification-icon { color: #4caf50; }
        .notification.warning .notification-icon { color: #ff9800; }
        .notification.error .notification-icon { color: #f44336; }

        .notification-content {
            flex: 1;
            min-width: 0;
        }

        .notification-title {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
            color: #ffffff;
        }

        .notification-message {
            font-size: 12px;
            line-height: 1.4;
            color: #cccccc;
        }

        .notification-actions {
            margin-top: 8px;
            display: flex;
            gap: 8px;
        }

        .notification-action {
            background: #0e639c;
            color: #ffffff;
            border: none;
            padding: 4px 12px;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .notification-action:hover {
            background: #1177bb;
        }

        .notification-close {
            background: none;
            border: none;
            color: #999999;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            transition: color 0.2s;
        }

        .notification-close:hover {
            color: #ffffff;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
    </style>
</head>
<body>
    ${notificationsHTML}
    <script>
        // Preload exposes a safe window.electron API with:
        //  - dismissNotification(index)
        //  - actionClicked(index, actionIndex)
        // The HTML buttons call those methods directly.
    </script>
</body>
</html>
        `;
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.removeIpcHandlers();
        this.notificationWindow = null;
        this.notifications = [];
    }
}
