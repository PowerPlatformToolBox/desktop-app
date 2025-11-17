import { BrowserWindow, ipcMain, screen } from "electron";

interface NotificationOptions {
    title: string;
    body: string;
    type?: "info" | "success" | "warning" | "error";
    duration?: number;
    actions?: Array<{ label: string; callback: string }>;
}

/**
 * NotificationWindowManager
 * 
 * Manages a frameless, always-on-top BrowserWindow for displaying notifications.
 * This ensures notifications are always visible above BrowserView components.
 * 
 * Similar to VS Code's notification system, notifications appear in a dedicated
 * window that floats above the main application.
 */
export class NotificationWindowManager {
    private notificationWindow: BrowserWindow | null = null;
    private mainWindow: BrowserWindow;
    private notifications: NotificationOptions[] = [];
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
                sandbox: true,
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
        const y = mainBounds.y + mainBounds.height - windowHeight - 50; // 50px from bottom

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
        
        // Hide notification window when main window is minimized or hidden
        this.mainWindow.on("minimize", () => this.notificationWindow?.hide());
        this.mainWindow.on("restore", () => {
            if (this.notifications.length > 0) {
                this.notificationWindow?.show();
            }
        });

        // Close notification window when main window closes
        this.mainWindow.on("closed", () => {
            this.notificationWindow?.close();
            this.notificationWindow = null;
        });
    }

    /**
     * Setup IPC handlers for notifications
     */
    private setupIpcHandlers(): void {
        ipcMain.handle("notification:show", async (event, options: NotificationOptions) => {
            this.showNotification(options);
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
        const duration = options.duration || 5000;
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
            success: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm3.844 4.844a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5z"/></svg>',
            warning: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 4h1v4h-1V4z"/><path d="M8 11a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
            error: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zM4.646 4.646a.5.5 0 0 0 0 .708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 0 0-.708 0z"/></svg>',
        };

        const notificationsHTML = this.notifications
            .map((notification, index) => {
                const type = notification.type || "info";
                const icon = icons[type];
                const actionsHTML = notification.actions
                    ? `<div class="notification-actions">
                        ${notification.actions.map((action, actionIndex) => `<button class="notification-action" onclick="window.electron.actionClicked(${index}, ${actionIndex})">${action.label}</button>`).join("")}
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
        const { ipcRenderer } = require('electron');
        
        window.electron = {
            dismissNotification: (index) => {
                ipcRenderer.send('notification:dismiss', index);
            },
            actionClicked: (index, actionIndex) => {
                ipcRenderer.send('notification:action', index, actionIndex);
            }
        };
    </script>
</body>
</html>
        `;
    }

    /**
     * Cleanup
     */
    destroy(): void {
        if (this.notificationWindow) {
            this.notificationWindow.close();
            this.notificationWindow = null;
        }
        this.notifications = [];
    }
}
