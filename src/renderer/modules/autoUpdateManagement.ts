/**
 * Auto-update management module
 * Handles application auto-update UI and status
 */

import { getUpdateNotificationModalControllerScript } from "../modals/updateNotification/controller";
import { getUpdateNotificationModalView } from "../modals/updateNotification/view";
import { offBrowserWindowModalClosed, offBrowserWindowModalMessage, onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

const UPDATE_NOTIFICATION_MODAL_ID = "update-notification";
const UPDATE_NOTIFICATION_MODAL_CHANNELS = {
    download: "update-notification:download",
    install: "update-notification:install",
    dismiss: "update-notification:dismiss",
    openExternal: "update-notification:open-external",
} as const;

const UPDATE_NOTIFICATION_MODAL_WIDTH = 560;
const UPDATE_NOTIFICATION_MODAL_HEIGHT = 540;

let updateModalOpen = false;

/**
 * Build and show the update notification modal
 */
async function showUpdateNotificationModal(type: "available" | "downloaded", version: string, releaseNotes?: string | null): Promise<void> {
    if (updateModalOpen) {
        return;
    }

    const isDarkTheme = document.body.classList.contains("dark-theme");
    const currentVersion = (await window.toolboxAPI.getAppVersion().catch(() => "")) as string;

    const { styles, body } = getUpdateNotificationModalView({
        type,
        version,
        currentVersion,
        releaseNotes,
        isDarkTheme,
    });

    const script = getUpdateNotificationModalControllerScript({
        type,
        channels: UPDATE_NOTIFICATION_MODAL_CHANNELS,
    });

    const html = `${styles}\n${body}\n${script}`.trim();

    const onMessage = (payload: { channel: string; data?: unknown }) => {
        if (!payload) return;
        if (payload.channel === UPDATE_NOTIFICATION_MODAL_CHANNELS.download) {
            window.toolboxAPI.downloadUpdate().catch(() => undefined);
        } else if (payload.channel === UPDATE_NOTIFICATION_MODAL_CHANNELS.install) {
            window.toolboxAPI.quitAndInstall();
        } else if (payload.channel === UPDATE_NOTIFICATION_MODAL_CHANNELS.openExternal) {
            const url = (payload.data as { url?: string })?.url;
            if (url) {
                window.toolboxAPI.openExternal(url).catch(() => undefined);
            }
        }
    };

    const onClosed = () => {
        updateModalOpen = false;
        offBrowserWindowModalMessage(onMessage);
        offBrowserWindowModalClosed(onClosed);
    };

    onBrowserWindowModalMessage(onMessage);
    onBrowserWindowModalClosed(onClosed);

    updateModalOpen = true;
    try {
        await showBrowserWindowModal({
            id: UPDATE_NOTIFICATION_MODAL_ID,
            html,
            width: UPDATE_NOTIFICATION_MODAL_WIDTH,
            height: UPDATE_NOTIFICATION_MODAL_HEIGHT,
        });
    } catch (_error) {
        onClosed();
    }
}

/**
 * Update UI elements for check for updates button
 */
function updateCheckForUpdatesUI(state: "idle" | "checking" | "available" | "not-available" | "error", message?: string): void {
    const button = document.getElementById("sidebar-check-for-updates-btn") as HTMLButtonElement;
    const buttonText = document.getElementById("check-updates-btn-text");
    const statusMessage = document.getElementById("update-status-message");

    if (!button || !buttonText || !statusMessage) {
        return;
    }

    switch (state) {
        case "checking":
            button.disabled = true;
            buttonText.textContent = "Checking...";
            statusMessage.textContent = "Checking for updates...";
            statusMessage.style.color = "var(--neutral-foreground-rest)";
            statusMessage.style.display = "block";
            break;
        case "available":
            button.disabled = false;
            buttonText.textContent = "Check for Updates";
            statusMessage.textContent = message || "Update available! A download prompt will appear.";
            statusMessage.style.color = "var(--accent-fill-rest)";
            statusMessage.style.display = "block";
            break;
        case "not-available":
            button.disabled = false;
            buttonText.textContent = "Check for Updates";
            statusMessage.textContent = message || "You are running the latest version.";
            statusMessage.style.color = "var(--neutral-foreground-rest)";
            statusMessage.style.display = "block";
            break;
        case "error":
            button.disabled = false;
            buttonText.textContent = "Check for Updates";
            statusMessage.textContent = message || "Failed to check for updates.";
            statusMessage.style.color = "var(--error-fill-rest)";
            statusMessage.style.display = "block";
            break;
        case "idle":
        default:
            button.disabled = false;
            buttonText.textContent = "Check for Updates";
            statusMessage.style.display = "none";
            break;
    }
}

/**
 * Handle manual check for updates from settings sidebar button
 * This function manages the UI state for the Settings sidebar "Check for Updates" button
 */
export async function handleCheckForUpdates(): Promise<void> {
    updateCheckForUpdatesUI("checking");

    try {
        await window.toolboxAPI.checkForUpdates();
        // Note: The actual result will be communicated via event listeners
        // which are set up in setupAutoUpdateListeners()
    } catch (error) {
        updateCheckForUpdatesUI("error", `Error: ${(error as Error).message}`);
    }
}

/**
 * Show update status message
 */
export function showUpdateStatus(message: string, type: "info" | "success" | "error"): void {
    const statusElement = document.getElementById("update-status");
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `update-status ${type}`;
    }
}

/**
 * Hide update status message
 */
export function hideUpdateStatus(): void {
    const statusElement = document.getElementById("update-status");
    if (statusElement) {
        statusElement.style.display = "none";
    }
}

/**
 * Show update progress bar
 */
export function showUpdateProgress(): void {
    const progressElement = document.getElementById("update-progress");
    if (progressElement) {
        progressElement.style.display = "block";
    }
}

/**
 * Hide update progress bar
 */
export function hideUpdateProgress(): void {
    const progressElement = document.getElementById("update-progress");
    if (progressElement) {
        progressElement.style.display = "none";
    }
}

/**
 * Update progress bar percentage
 */
export function updateProgress(percent: number): void {
    const fillElement = document.getElementById("progress-bar-fill");
    const textElement = document.getElementById("progress-text");
    if (fillElement) {
        fillElement.style.width = `${percent}%`;
    }
    if (textElement) {
        textElement.textContent = `${percent}%`;
    }
}

/**
 * Check for updates (legacy function for non-Settings UI)
 * This function manages the update-status div element used elsewhere in the app
 * For Settings sidebar button, use handleCheckForUpdates() instead
 */
export async function checkForUpdates(): Promise<void> {
    hideUpdateStatus();
    hideUpdateProgress();
    showUpdateStatus("Checking for updates...", "info");

    try {
        await window.toolboxAPI.checkForUpdates();
    } catch (error) {
        showUpdateStatus(`Error: ${(error as Error).message}`, "error");
    }
}

/**
 * Set up auto-update event listeners
 */
export function setupAutoUpdateListeners(): void {
    window.toolboxAPI.onUpdateChecking(() => {
        showUpdateStatus("Checking for updates...", "info");
        updateCheckForUpdatesUI("checking");
    });

    window.toolboxAPI.onUpdateAvailable((info: any) => {
        showUpdateStatus(`Update available: Version ${info.version}`, "success");
        updateCheckForUpdatesUI("available", `Update available: Version ${info.version}`);
        void showUpdateNotificationModal("available", info.version, info.releaseNotes as string | null);
    });

    window.toolboxAPI.onUpdateNotAvailable(() => {
        showUpdateStatus("You are running the latest version", "success");
        updateCheckForUpdatesUI("not-available", "You are running the latest version");
    });

    window.toolboxAPI.onUpdateDownloadProgress((progress: any) => {
        showUpdateProgress();
        updateProgress(progress.percent);
        showUpdateStatus(`Downloading update: ${progress.percent}%`, "info");
        void sendBrowserWindowModalMessage({ channel: "update:progress", data: { percent: progress.percent } }).catch(() => undefined);
    });

    window.toolboxAPI.onUpdateDownloaded((info: any) => {
        hideUpdateProgress();
        showUpdateStatus(`Update downloaded: Version ${info.version}. Restart to install.`, "success");
        updateCheckForUpdatesUI("idle");
        if (updateModalOpen) {
            void sendBrowserWindowModalMessage({ channel: "update:downloaded", data: { version: info.version } }).catch(() => undefined);
        } else {
            void showUpdateNotificationModal("downloaded", info.version);
        }
    });

    window.toolboxAPI.onUpdateError((error: string) => {
        hideUpdateProgress();
        showUpdateStatus(`Update error: ${error}`, "error");
        updateCheckForUpdatesUI("error", `Update error: ${error}`);
    });
}
