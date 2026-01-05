/**
 * CSP Exception Modal Module
 * Handles displaying the CSP exception consent modal using the modal framework
 */

import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getCspExceptionModalControllerScript } from "../modals/cspException/controller";
import { getCspExceptionModalView } from "../modals/cspException/view";
import { closeBrowserWindowModal, offBrowserWindowModalClosed, onBrowserWindowModalClosed, onBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

interface CspExceptionModalPromiseHandlers {
    resolve: ((granted: boolean) => void) | null;
    reject: ((error: Error) => void) | null;
}

const CSP_EXCEPTION_MODAL_CHANNELS = {
    acceptConsent: "csp-exception:accept",
    declineConsent: "csp-exception:decline",
} as const;

const CSP_EXCEPTION_MODAL_DIMENSIONS = {
    width: 600,
    height: 580,
};

let cspExceptionModalHandlersRegistered = false;
const cspExceptionModalPromiseHandlers: CspExceptionModalPromiseHandlers = {
    resolve: null,
    reject: null,
};
let cspExceptionModalClosedHandler: ((payload: ModalWindowClosedPayload) => void) | null = null;

/**
 * Open the CSP exception consent modal
 * Returns a promise that resolves with true if user accepts, false if declines
 */
export async function openCspExceptionModal(tool: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
        initializeCspExceptionModalBridge();

        // Store resolve/reject handlers for later use
        cspExceptionModalPromiseHandlers.resolve = resolve;
        cspExceptionModalPromiseHandlers.reject = reject;

        // Listen for modal close event to reject if not already resolved
        cspExceptionModalClosedHandler = (payload: ModalWindowClosedPayload) => {
            if (cspExceptionModalPromiseHandlers.reject && payload?.id === "csp-exception-browser-modal") {
                // Modal was closed without making a selection
                cspExceptionModalPromiseHandlers.reject(new Error("CSP consent dialog cancelled"));
                cleanupModalHandlers();
            }
        };

        onBrowserWindowModalClosed(cspExceptionModalClosedHandler);

        showBrowserWindowModal({
            id: "csp-exception-browser-modal",
            html: buildCspExceptionModalHtml(tool),
            width: CSP_EXCEPTION_MODAL_DIMENSIONS.width,
            height: CSP_EXCEPTION_MODAL_DIMENSIONS.height,
        }).catch(reject);
    });
}

/**
 * Initialize CSP exception modal bridge
 */
function initializeCspExceptionModalBridge(): void {
    if (cspExceptionModalHandlersRegistered) return;
    onBrowserWindowModalMessage(handleCspExceptionModalMessage);
    cspExceptionModalHandlersRegistered = true;
}

/**
 * Handle messages from the CSP exception modal
 */
function handleCspExceptionModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || typeof payload.channel !== "string") {
        return;
    }

    switch (payload.channel) {
        case CSP_EXCEPTION_MODAL_CHANNELS.acceptConsent:
            handleCspConsentAccepted();
            break;
        case CSP_EXCEPTION_MODAL_CHANNELS.declineConsent:
            handleCspConsentDeclined();
            break;
        default:
            break;
    }
}

/**
 * Handle accept consent action
 */
function handleCspConsentAccepted(): void {
    if (!cspExceptionModalPromiseHandlers.resolve) return;

    const resolveHandler = cspExceptionModalPromiseHandlers.resolve;
    cleanupModalHandlers();
    void closeBrowserWindowModal();
    resolveHandler(true);
}

/**
 * Handle decline consent action
 */
function handleCspConsentDeclined(): void {
    if (!cspExceptionModalPromiseHandlers.resolve) return;

    const resolveHandler = cspExceptionModalPromiseHandlers.resolve;
    cleanupModalHandlers();
    void closeBrowserWindowModal();
    resolveHandler(false);
}

/**
 * Build the CSP exception modal HTML
 */
function buildCspExceptionModalHtml(tool: any): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");

    const { styles, body } = getCspExceptionModalView({
        toolName: tool.name,
        authors: tool.authors || [],
        cspExceptions: tool.cspExceptions || {},
        isDarkTheme,
    });
    const script = getCspExceptionModalControllerScript(CSP_EXCEPTION_MODAL_CHANNELS);
    return `${styles}\n${body}\n${script}`.trim();
}

function cleanupModalHandlers(): void {
    if (cspExceptionModalClosedHandler) {
        offBrowserWindowModalClosed(cspExceptionModalClosedHandler);
        cspExceptionModalClosedHandler = null;
    }

    cspExceptionModalPromiseHandlers.resolve = null;
    cspExceptionModalPromiseHandlers.reject = null;
}
