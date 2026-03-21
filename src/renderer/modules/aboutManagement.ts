/**
 * About dialog management module
 * Handles the custom About dialog displayed as a modal BrowserWindow
 */

import { getAboutModalControllerScript } from "../modals/about/controller";
import { getAboutModalView } from "../modals/about/view";
import { offBrowserWindowModalClosed, offBrowserWindowModalMessage, onBrowserWindowModalClosed, onBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

const ABOUT_MODAL_ID = "about-dialog";
const ABOUT_COPY_CHANNEL = "about:copy";

const ABOUT_MODAL_WIDTH = 480;
const ABOUT_MODAL_HEIGHT = 480;

let aboutModalOpen = false;

export interface AboutModalInfo {
    appVersion: string;
    installId: string;
    locale: string;
    electronVersion: string;
    nodeVersion: string;
    chromeVersion: string;
    platform: string;
    arch: string;
    osVersion: string;
    isDarkTheme: boolean;
}

/**
 * Build and show the About modal dialog
 */
export async function openAboutModal(info: AboutModalInfo): Promise<void> {
    if (aboutModalOpen) {
        return;
    }

    const { styles, body } = getAboutModalView(info);

    const script = getAboutModalControllerScript({
        copyChannel: ABOUT_COPY_CHANNEL,
        appVersion: info.appVersion,
        installId: info.installId,
        electronVersion: info.electronVersion,
        nodeVersion: info.nodeVersion,
        chromeVersion: info.chromeVersion,
        platform: info.platform,
        arch: info.arch,
        osVersion: info.osVersion,
        locale: info.locale,
    });

    const html = `${styles}\n${body}\n${script}`.trim();

    const onMessage = (payload: { channel: string; data?: unknown }) => {
        if (!payload) return;
        if (payload.channel === ABOUT_COPY_CHANNEL) {
            const text = (payload.data as { text?: string })?.text ?? "";
            if (text) {
                window.toolboxAPI.utils.copyToClipboard(text).catch(() => undefined);
            }
        }
    };

    const onClosed = () => {
        aboutModalOpen = false;
        offBrowserWindowModalMessage(onMessage);
        offBrowserWindowModalClosed(onClosed);
    };

    onBrowserWindowModalMessage(onMessage);
    onBrowserWindowModalClosed(onClosed);

    aboutModalOpen = true;
    try {
        await showBrowserWindowModal({
            id: ABOUT_MODAL_ID,
            html,
            width: ABOUT_MODAL_WIDTH,
            height: ABOUT_MODAL_HEIGHT,
        });
    } catch (_error) {
        onClosed();
    }
}
