/**
 * Notification system module
 * Handles displaying notifications using dedicated BrowserWindow
 */

import type { NotificationOptions } from "../types/index";

/**
 * Show PPTB notification using dedicated BrowserWindow
 * Notifications are displayed in an always-on-top frameless window above the BrowserView
 */
export function showPPTBNotification(options: NotificationOptions): void {
    // Convert actions to serializable format
    const actions = options.actions?.map((action: { label: string; callback: () => void }, index: number) => ({
        label: action.label,
        callback: `action_${Date.now()}_${index}`, // Unique callback ID
    }));

    // Store callbacks for later invocation
    if (options.actions && actions) {
        actions.forEach((action: { label: string; callback: string }, index: number) => {
            const originalCallback = options.actions![index].callback;
            window.api.on(`notification-action-${action.callback}`, () => {
                originalCallback();
            });
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
