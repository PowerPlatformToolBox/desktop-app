/**
 * Auto-update management module
 * Handles application auto-update UI and status
 */

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
 * Check for updates
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
    });

    window.toolboxAPI.onUpdateAvailable((info: any) => {
        showUpdateStatus(`Update available: Version ${info.version}`, "success");
    });

    window.toolboxAPI.onUpdateNotAvailable(() => {
        showUpdateStatus("You are running the latest version", "success");
    });

    window.toolboxAPI.onUpdateDownloadProgress((progress: any) => {
        showUpdateProgress();
        updateProgress(progress.percent);
        showUpdateStatus(`Downloading update: ${progress.percent}%`, "info");
    });

    window.toolboxAPI.onUpdateDownloaded((info: any) => {
        hideUpdateProgress();
        showUpdateStatus(`Update downloaded: Version ${info.version}. Restart to install.`, "success");
    });

    window.toolboxAPI.onUpdateError((error: string) => {
        hideUpdateProgress();
        showUpdateStatus(`Update error: ${error}`, "error");
    });
}
