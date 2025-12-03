/**
 * Notification system module
 * Handles displaying notifications using dedicated BrowserWindow
 */

import type { NotificationOptions } from "../types/index";

// Store callbacks for notification actions
const notificationCallbacks = new Map<string, () => void>();

// Flag to track if the notification action listener is already set up
let isNotificationActionListenerSetUp = false;

/**
 * Set up the notification action listener
 * This listens for action clicks from the notification window
 */
function setupNotificationActionListener(): void {
    if (isNotificationActionListenerSetUp) return;

    window.api.on("notification:action-triggered", (...args: unknown[]) => {
        // The IPC event sends (event, data), so data is the second argument
        const data = args[1];
        // Validate the data structure at runtime
        if (data && typeof data === "object" && "callback" in data) {
            const callbackId = (data as { callback: unknown }).callback;
            if (typeof callbackId === "string") {
                const callback = notificationCallbacks.get(callbackId);
                if (callback) {
                    callback();
                    // Clean up the callback after it's been invoked
                    notificationCallbacks.delete(callbackId);
                }
            }
        }
    });

    isNotificationActionListenerSetUp = true;
}

/**
 * Show PPTB notification using dedicated BrowserWindow
 * Notifications are displayed in an always-on-top frameless window above the BrowserView
 */
export function showPPTBNotification(options: NotificationOptions): void {
    // Ensure the action listener is set up
    setupNotificationActionListener();

    // Convert actions to serializable format
    const actions = options.actions?.map((action: { label: string; callback: () => void }, index: number) => ({
        label: action.label,
        callback: `action_${Date.now()}_${index}`, // Unique callback ID
    }));

    // Store callbacks for later invocation
    if (options.actions && actions) {
        actions.forEach((action: { label: string; callback: string }, index: number) => {
            const originalCallback = options.actions![index].callback;
            notificationCallbacks.set(action.callback, originalCallback);
        });
    }

    // Send to notification window manager via IPC
    window.api.invoke("notification:show", {
        title: options.title,
        body: options.body,
        type: options.type || "info",
        duration: options.duration || 5000,
        actions,
    });
}
