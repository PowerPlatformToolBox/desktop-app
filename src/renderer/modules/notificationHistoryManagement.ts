/**
 * Notification History Management
 *
 * Manages the VSCode-style notification history panel that appears when the
 * bell icon in the footer is clicked.  The panel lists all notifications
 * received during the current session (newest first) and lets the user clear
 * them all at once.  It closes when the user clicks outside it, presses Escape,
 * or clicks the bell icon again.
 */

import { clearNotificationHistory, getNotificationHistory, getUnreadCount, markAllAsRead, onHistoryUpdate, type NotificationHistoryEntry } from "./notifications";

/** IDs used to locate DOM nodes */
const PANEL_ID = "notification-history-panel";
const BELL_BTN_ID = "footer-notification-bell-btn";
const BADGE_ID = "notification-badge";
const LIST_ID = "notification-history-list";
const EMPTY_ID = "notification-history-empty";
const CLEAR_BTN_ID = "notification-clear-all-btn";

/** Whether the panel is currently visible */
let isPanelOpen = false;

/** Reference to the outside-click handler so it can be removed later */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

/** Reference to the Escape key handler */
let escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Format a Date as a short human-readable string, e.g. "2:34 PM" for today,
 * or "Jun 23, 2:34 PM" for older dates.
 */
function formatTimestamp(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Map notification type to a colour token used for the left border / icon.
 */
function typeClass(type: NotificationHistoryEntry["type"]): string {
    return `notification-history-entry--${type}`;
}

/**
 * Return the SVG icon markup for a given notification type.
 */
function typeIcon(type: NotificationHistoryEntry["type"]): string {
    const icons: Record<NotificationHistoryEntry["type"], string> = {
        info: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 6h1v3h-1V6z"/><path d="M8 10.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
        success: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm3.844 4.844a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5z"/></svg>',
        warning: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z"/><path d="M7.5 4h1v4h-1V4z"/><path d="M8 11a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>',
        error: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zM4.646 4.646a.5.5 0 0 0 0 .708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 0 0-.708 0z"/></svg>',
    };
    return icons[type];
}

/**
 * Render the current notification history into the panel list.
 */
function renderList(): void {
    const list = document.getElementById(LIST_ID);
    const empty = document.getElementById(EMPTY_ID);
    if (!list || !empty) return;

    const history = getNotificationHistory();

    if (history.length === 0) {
        list.innerHTML = "";
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.innerHTML = history
        .map(
            (entry) => `
        <div class="notification-history-entry ${typeClass(entry.type)}" role="listitem">
            <span class="notification-history-entry__icon">${typeIcon(entry.type)}</span>
            <div class="notification-history-entry__body">
                <div class="notification-history-entry__title">${escapeHtml(entry.title)}</div>
                <div class="notification-history-entry__message">${escapeHtml(entry.body)}</div>
            </div>
            <span class="notification-history-entry__time">${formatTimestamp(entry.timestamp)}</span>
        </div>`,
        )
        .join("");
}

/** Minimal HTML escaping to prevent XSS in rendered notification content */
function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** Update the badge element to reflect the current unread count */
function updateBadge(): void {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;

    const count = getUnreadCount();
    if (count > 0) {
        const label = count > 99 ? "99+" : String(count);
        badge.textContent = label;
        badge.setAttribute("aria-label", `${label} unread notifications`);
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

/** Open the notification history panel */
function openPanel(): void {
    const panel = document.getElementById(PANEL_ID);
    const bellBtn = document.getElementById(BELL_BTN_ID);
    if (!panel) return;

    isPanelOpen = true;
    panel.hidden = false;
    panel.setAttribute("aria-expanded", "true");
    bellBtn?.setAttribute("aria-pressed", "true");

    // Mark all as read when the panel is opened
    markAllAsRead();
    updateBadge();
    renderList();

    // Close when clicking outside (exclude the bell button — its own handler toggles)
    outsideClickHandler = (e: MouseEvent) => {
        const target = e.target as Node;
        const bellBtn = document.getElementById(BELL_BTN_ID);
        if (!panel.contains(target) && (!bellBtn || !bellBtn.contains(target))) {
            closePanel();
        }
    };
    // Use setTimeout so that the current click (which opened the panel) doesn't
    // immediately trigger the outside-click handler.
    setTimeout(() => {
        document.addEventListener("click", outsideClickHandler!, { capture: true });
    }, 0);

    // Close on Escape
    escapeKeyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            closePanel();
        }
    };
    document.addEventListener("keydown", escapeKeyHandler);
}

/** Close the notification history panel */
function closePanel(): void {
    const panel = document.getElementById(PANEL_ID);
    const bellBtn = document.getElementById(BELL_BTN_ID);
    if (!panel) return;

    isPanelOpen = false;
    panel.hidden = true;
    panel.setAttribute("aria-expanded", "false");
    bellBtn?.setAttribute("aria-pressed", "false");

    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler, { capture: true });
        outsideClickHandler = null;
    }
    if (escapeKeyHandler) {
        document.removeEventListener("keydown", escapeKeyHandler);
        escapeKeyHandler = null;
    }
}

/**
 * Initialize the notification history panel.
 * Must be called once after the DOM is ready.
 */
export function initNotificationHistoryPanel(): void {
    const bellBtn = document.getElementById(BELL_BTN_ID);
    const clearBtn = document.getElementById(CLEAR_BTN_ID);

    if (!bellBtn) return;

    // Toggle panel on bell button click
    bellBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    });

    // Clear all notifications
    clearBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        clearNotificationHistory();
    });

    // Re-render and update badge whenever history changes
    onHistoryUpdate(() => {
        updateBadge();
        if (isPanelOpen) {
            renderList();
        }
    });

    // Set initial badge state
    updateBadge();
}
