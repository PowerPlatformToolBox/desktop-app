/**
 * Debug tool trust modal
 * Shows the one-time-per-folder consent prompt before a CLI `--debug-tool` mount.
 */

import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getDebugToolTrustModalControllerScript } from "../modals/debugToolTrust/controller";
import { getDebugToolTrustModalView, type DebugToolTrustModalViewModel } from "../modals/debugToolTrust/view";
import {
    closeBrowserWindowModal,
    offBrowserWindowModalClosed,
    offBrowserWindowModalMessage,
    onBrowserWindowModalClosed,
    onBrowserWindowModalMessage,
    showBrowserWindowModal,
} from "./browserWindowModals";

const DEBUG_TOOL_TRUST_MODAL_ID = "debug-tool-trust-browser-modal";

const DEBUG_TOOL_TRUST_MODAL_CHANNELS = {
    trust: "debug-tool-trust:trust",
    cancel: "debug-tool-trust:cancel",
} as const;

const DEBUG_TOOL_TRUST_MODAL_DIMENSIONS = {
    width: 560,
    height: 560,
};

export type DebugToolTrustModalOptions = Omit<DebugToolTrustModalViewModel, "isDarkTheme">;

/**
 * Open the trust prompt. Resolves true when the user grants trust, false otherwise
 * (cancel, close, or a failure to show the modal).
 */
export async function openDebugToolTrustModal(options: DebugToolTrustModalOptions): Promise<boolean> {
    const requestId = crypto.randomUUID();
    const channels = {
        trust: `${DEBUG_TOOL_TRUST_MODAL_CHANNELS.trust}:${requestId}`,
        cancel: `${DEBUG_TOOL_TRUST_MODAL_CHANNELS.cancel}:${requestId}`,
    };
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const { styles, body } = getDebugToolTrustModalView({ ...options, isDarkTheme });
    const script = getDebugToolTrustModalControllerScript(channels);
    const html = `${styles}\n${body}\n${script}`.trim();

    return await new Promise<boolean>((resolve) => {
        let trusted = false;
        let settled = false;

        const cleanup = (): void => {
            offBrowserWindowModalMessage(onMessage);
            offBrowserWindowModalClosed(onClosed);
        };

        const settle = (result: boolean): void => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const onMessage = (payload: ModalWindowMessagePayload): void => {
            if (payload?.channel === channels.trust) {
                trusted = true;
                void closeBrowserWindowModal();
                return;
            }

            if (payload?.channel === channels.cancel) {
                trusted = false;
                void closeBrowserWindowModal();
            }
        };

        const onClosed = (payload: ModalWindowClosedPayload): void => {
            if (payload?.id && payload.id !== DEBUG_TOOL_TRUST_MODAL_ID) {
                return;
            }
            settle(trusted);
        };

        onBrowserWindowModalMessage(onMessage);
        onBrowserWindowModalClosed(onClosed);

        showBrowserWindowModal({
            id: DEBUG_TOOL_TRUST_MODAL_ID,
            html,
            width: DEBUG_TOOL_TRUST_MODAL_DIMENSIONS.width,
            height: DEBUG_TOOL_TRUST_MODAL_DIMENSIONS.height,
        }).catch(() => {
            settle(false);
        });
    });
}
