/**
 * Notification system module
 * Handles displaying notifications using dedicated BrowserWindow
 */

import type { NotificationOptions } from "../types/index";

// Store callbacks for notification actions with their expiry timestamps
interface CallbackEntry {
    callback: () => void;
    expiresAt: number;
}

const notificationCallbacks = new Map<string, CallbackEntry>();

// TTL buffer added to notification duration for callback cleanup
const CALLBACK_TTL_BUFFER_MS = 5000; // 5 seconds extra buffer after notification dismissal

// Cleanup interval in milliseconds
const CLEANUP_INTERVAL_MS = 30000; // Run cleanup every 30 seconds

// Cleanup interval reference
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

// Flag to track if the notification action listener is already set up
let isNotificationActionListenerSetUp = false;

/**
 * Clean up expired callbacks to prevent memory leaks
 * This runs periodically to remove callbacks whose notifications have been dismissed
 */
function cleanupExpiredCallbacks(): void {
    const now = Date.now();
    for (const [callbackId, entry] of notificationCallbacks.entries()) {
        if (now > entry.expiresAt) {
            notificationCallbacks.delete(callbackId);
        }
    }

    // Stop the cleanup interval if there are no more callbacks
    if (notificationCallbacks.size === 0 && cleanupIntervalId !== null) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
}

/**
 * Start the cleanup interval if not already running
 */
function startCleanupInterval(): void {
    if (cleanupIntervalId === null) {
        // Run cleanup at regular intervals
        cleanupIntervalId = setInterval(cleanupExpiredCallbacks, CLEANUP_INTERVAL_MS);
    }
}

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
                const entry = notificationCallbacks.get(callbackId);
                if (entry) {
                    entry.callback();
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

    // Store callbacks for later invocation with TTL for automatic cleanup
    if (options.actions && actions) {
        const duration = options.duration || 5000;
        // Callback expires after notification duration plus a buffer to handle edge cases
        const expiresAt = Date.now() + duration + CALLBACK_TTL_BUFFER_MS;
        
        actions.forEach((action: { label: string; callback: string }, index: number) => {
            const originalCallback = options.actions![index].callback;
            notificationCallbacks.set(action.callback, {
                callback: originalCallback,
                expiresAt,
            });
        });
        
        // Start the cleanup interval to handle dismissed notifications
        startCleanupInterval();
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
