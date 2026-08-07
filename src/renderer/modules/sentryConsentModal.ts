import type { TelemetryConsentChoice } from "../../common/types";
import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getSentryConsentModalControllerScript } from "../modals/sentryConsent/controller";
import { getSentryConsentModalView } from "../modals/sentryConsent/view";
import { closeBrowserWindowModal, offBrowserWindowModalClosed, onBrowserWindowModalClosed, onBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

const SENTRY_CONSENT_MODAL_CHANNELS = {
    acceptConsent: "sentry-consent:accept",
    declineConsent: "sentry-consent:decline",
} as const;

const SENTRY_CONSENT_MODAL_ID = "sentry-consent-browser-modal";

const SENTRY_CONSENT_MODAL_DIMENSIONS = {
    width: 560,
    height: 500,
};

interface SentryConsentModalPromiseHandlers {
    resolve: ((result: TelemetryConsentChoice | null) => void) | null;
    reject: ((error: Error) => void) | null;
}

interface OpenSentryConsentModalOptions {
    appVersion: string;
    platform: string;
    arch: string;
}

let sentryConsentModalHandlersRegistered = false;
let sentryConsentModalClosedHandler: ((payload: ModalWindowClosedPayload) => void) | null = null;
const sentryConsentModalPromiseHandlers: SentryConsentModalPromiseHandlers = {
    resolve: null,
    reject: null,
};

export async function openSentryConsentModal(options: OpenSentryConsentModalOptions): Promise<TelemetryConsentChoice | null> {
    return new Promise((resolve, reject) => {
        initializeSentryConsentModalBridge();
        sentryConsentModalPromiseHandlers.resolve = resolve;
        sentryConsentModalPromiseHandlers.reject = reject;

        sentryConsentModalClosedHandler = (payload: ModalWindowClosedPayload) => {
            if (sentryConsentModalPromiseHandlers.resolve && payload?.id === SENTRY_CONSENT_MODAL_ID) {
                const resolveHandler = sentryConsentModalPromiseHandlers.resolve;
                cleanupModalHandlers();
                resolveHandler(null);
            }
        };

        onBrowserWindowModalClosed(sentryConsentModalClosedHandler);

        const { styles, body } = getSentryConsentModalView({
            isDarkTheme: document.body.classList.contains("dark-theme"),
            ...options,
        });

        const html = `${styles}\n${body}\n${getSentryConsentModalControllerScript(SENTRY_CONSENT_MODAL_CHANNELS)}`.trim();

        showBrowserWindowModal({
            id: SENTRY_CONSENT_MODAL_ID,
            html,
            width: SENTRY_CONSENT_MODAL_DIMENSIONS.width,
            height: SENTRY_CONSENT_MODAL_DIMENSIONS.height,
        }).catch(reject);
    });
}

function initializeSentryConsentModalBridge(): void {
    if (sentryConsentModalHandlersRegistered) {
        return;
    }

    onBrowserWindowModalMessage(handleSentryConsentModalMessage);
    sentryConsentModalHandlersRegistered = true;
}

function handleSentryConsentModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload.channel !== "string" || !sentryConsentModalPromiseHandlers.resolve) {
        return;
    }

    if (payload.channel === SENTRY_CONSENT_MODAL_CHANNELS.acceptConsent) {
        const resolveHandler = sentryConsentModalPromiseHandlers.resolve;
        cleanupModalHandlers();
        void closeBrowserWindowModal();
        resolveHandler("yes");
    }

    if (payload.channel === SENTRY_CONSENT_MODAL_CHANNELS.declineConsent) {
        const resolveHandler = sentryConsentModalPromiseHandlers.resolve;
        cleanupModalHandlers();
        void closeBrowserWindowModal();
        resolveHandler("no");
    }
}

function cleanupModalHandlers(): void {
    if (sentryConsentModalClosedHandler) {
        offBrowserWindowModalClosed(sentryConsentModalClosedHandler);
        sentryConsentModalClosedHandler = null;
    }

    sentryConsentModalPromiseHandlers.resolve = null;
    sentryConsentModalPromiseHandlers.reject = null;
}
