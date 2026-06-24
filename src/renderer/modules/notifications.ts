/**
 * Notification system module
 * Handles displaying notifications using dedicated BrowserWindow
 */

import type { NotificationOptions } from "../types/index";
import { DEFAULT_NOTIFICATION_DURATION } from "../constants";

// Store callbacks for notification actions with their expiry timestamps
interface CallbackEntry {
    callback: () => void;
    expiresAt: number;
}

/** A single entry in the persistent notification history */
export interface NotificationHistoryEntry {
    title: string;
    body: string;
    type: "info" | "success" | "warning" | "error";
    timestamp: Date;
}

/** Maximum number of notifications kept in history */
const MAX_HISTORY_SIZE = 100;

/** In-memory notification history (newest first) */
const notificationHistory: NotificationHistoryEntry[] = [];

/** Number of notifications added since the last time the history panel was opened */
let unreadCount = 0;

/** Listeners to be called whenever the history or unread count changes */
const historyUpdateListeners: Array<() => void> = [];

/**
 * Register a callback to be invoked whenever the notification history changes
 * (new notification added or history cleared).
 */
export function onHistoryUpdate(callback: () => void): void {
    historyUpdateListeners.push(callback);
}

/** Notify all registered listeners that the history has changed */
function notifyHistoryUpdate(): void {
    for (const listener of historyUpdateListeners) {
        listener();
    }
}

/** Return a shallow copy of the notification history (newest first) */
export function getNotificationHistory(): NotificationHistoryEntry[] {
    return [...notificationHistory];
}

/** Return the current count of unread notifications */
export function getUnreadCount(): number {
    return unreadCount;
}

/** Mark all current notifications as read (reset unread counter) */
export function markAllAsRead(): void {
    unreadCount = 0;
    notifyHistoryUpdate();
}

/** Clear all notifications from the history */
export function clearNotificationHistory(): void {
    notificationHistory.length = 0;
    unreadCount = 0;
    notifyHistoryUpdate();
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

// Default notification display duration (can be overridden by user settings)
let defaultNotificationDuration: number = DEFAULT_NOTIFICATION_DURATION;

/**
 * Update the default notification duration used when no explicit duration is provided
 */
export function setDefaultNotificationDuration(duration: number): void {
    defaultNotificationDuration = duration;
}

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
 * Notifications are displayed in an always-on-top frameless window above the BrowserView.
 * Every notification is also recorded in the persistent history.
 */
export function showPPTBNotification(options: NotificationOptions): void {
    // Record in persistent history
    const VALID_TYPES: ReadonlyArray<NotificationHistoryEntry["type"]> = ["info", "success", "warning", "error"];
    const rawType = options.type;
    const entry: NotificationHistoryEntry = {
        title: options.title,
        body: options.body,
        type: (rawType && (VALID_TYPES as readonly string[]).includes(rawType) ? rawType : "info") as NotificationHistoryEntry["type"],
        timestamp: new Date(),
    };
    notificationHistory.unshift(entry);
    if (notificationHistory.length > MAX_HISTORY_SIZE) {
        notificationHistory.pop();
    }
    unreadCount++;
    notifyHistoryUpdate();
    // Ensure the action listener is set up
    setupNotificationActionListener();

    // Convert actions to serializable format
    const actions = options.actions?.map((action: { label: string; callback: () => void }, index: number) => ({
        label: action.label,
        callback: `action_${Date.now()}_${index}`, // Unique callback ID
    }));

    // Store callbacks for later invocation with TTL for automatic cleanup
    if (options.actions && actions) {
        const duration = options.duration !== undefined ? options.duration : defaultNotificationDuration;
        // For persistent notifications (duration === 0), use a very large TTL so callbacks
        // remain available until the user explicitly dismisses the notification.
        const effectiveDuration = duration === 0 ? Number.MAX_SAFE_INTEGER - Date.now() : duration;
        const expiresAt = Date.now() + effectiveDuration + CALLBACK_TTL_BUFFER_MS;
        
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
        duration: options.duration !== undefined ? options.duration : defaultNotificationDuration,
        actions,
    });
}
