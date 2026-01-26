/**
 * Troubleshooting management module
 * Handles the troubleshooting modal for diagnosing connectivity issues
 */

import { captureMessage } from "../../common/sentryHelper";
import { getTroubleshootingModalControllerScript } from "../modals/troubleshooting/controller";
import { getTroubleshootingModalView } from "../modals/troubleshooting/view";
import { showBrowserWindowModal } from "./browserWindowModals";

const TROUBLESHOOTING_MODAL_DIMENSIONS = {
    width: 600,
    height: 550,
};

/**
 * Open troubleshooting modal
 */
export async function openTroubleshootingModal(isDarkTheme: boolean): Promise<void> {
    try {
        const modalHtml = buildTroubleshootingModalHtml(isDarkTheme);
        await showBrowserWindowModal({
            id: "troubleshooting-modal",
            html: modalHtml,
            width: TROUBLESHOOTING_MODAL_DIMENSIONS.width,
            height: TROUBLESHOOTING_MODAL_DIMENSIONS.height,
        });
    } catch (error) {
        captureMessage("Failed to open troubleshooting modal", "error", { extra: { error } });
        await window.toolboxAPI.utils.showNotification({
            title: "Troubleshooting",
            body: `Unable to open troubleshooting modal: ${formatError(error)}`,
            type: "error",
        });
    }
}

function buildTroubleshootingModalHtml(isDarkTheme: boolean): string {
    const { styles, body } = getTroubleshootingModalView({ isDarkTheme });
    const controllerScript = getTroubleshootingModalControllerScript();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Troubleshooting</title>
    ${styles}
</head>
<body>
    ${body}
    ${controllerScript}
</body>
</html>
    `.trim();
}

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Initialize troubleshooting module
 */
export function initializeTroubleshooting(): void {
    // No initialization needed currently
    // Future: Could add keyboard shortcuts or other initialization logic
}
