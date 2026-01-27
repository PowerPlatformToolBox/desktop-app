/**
 * Troubleshooting management module
 * Handles the troubleshooting modal for diagnosing connectivity issues
 */

import { captureMessage } from "../../common/sentryHelper";
import type { ModalWindowMessagePayload } from "../../common/types";
import { getTroubleshootingModalControllerScript } from "../modals/troubleshooting/controller";
import { getTroubleshootingModalView } from "../modals/troubleshooting/view";
import { onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

const TROUBLESHOOTING_MODAL_CHANNELS = {
    runCheck: "troubleshooting:run-check",
    checkResult: "troubleshooting:check-result",
} as const;

const TROUBLESHOOTING_MODAL_DIMENSIONS = {
    width: 600,
    height: 550,
};

let troubleshootingModalHandlersRegistered = false;

/**
 * Open troubleshooting modal
 */
export async function openTroubleshootingModal(isDarkTheme: boolean): Promise<void> {
    initializeTroubleshootingModalBridge();

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

function initializeTroubleshootingModalBridge(): void {
    if (troubleshootingModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleTroubleshootingModalMessage);
    onBrowserWindowModalClosed(handleTroubleshootingModalClosed);
    troubleshootingModalHandlersRegistered = true;
}

async function handleTroubleshootingModalMessage(payload: ModalWindowMessagePayload): Promise<void> {
    if (!payload || typeof payload.channel !== "string") return;

    if (payload.channel === TROUBLESHOOTING_MODAL_CHANNELS.runCheck) {
        const data = (payload.data ?? {}) as { checkType?: string };
        const checkType = data.checkType;

        if (!checkType) return;

        try {
            let result;
            switch (checkType) {
                case "supabase":
                    result = await window.toolboxAPI.troubleshooting.checkSupabaseConnectivity();
                    break;
                case "registry":
                    result = await window.toolboxAPI.troubleshooting.checkRegistryFile();
                    break;
                case "fallback":
                    result = await window.toolboxAPI.troubleshooting.checkFallbackApi();
                    break;
                case "download":
                    result = await window.toolboxAPI.troubleshooting.checkToolDownload();
                    break;
                default:
                    return;
            }

            // Send result back to modal
            await sendBrowserWindowModalMessage({
                channel: TROUBLESHOOTING_MODAL_CHANNELS.checkResult,
                data: { checkType, result },
            });
        } catch (error) {
            // Send error back to modal
            await sendBrowserWindowModalMessage({
                channel: TROUBLESHOOTING_MODAL_CHANNELS.checkResult,
                data: {
                    checkType,
                    result: {
                        success: false,
                        message: error instanceof Error ? error.message : String(error),
                    },
                },
            });
        }
    }
}

function handleTroubleshootingModalClosed(): void {
    // Cleanup if needed
}

function buildTroubleshootingModalHtml(isDarkTheme: boolean): string {
    const { styles, body } = getTroubleshootingModalView({ isDarkTheme });
    const controllerScript = getTroubleshootingModalControllerScript({
        channels: TROUBLESHOOTING_MODAL_CHANNELS,
    });

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
