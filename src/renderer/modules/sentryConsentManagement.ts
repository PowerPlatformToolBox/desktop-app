/**
 * Sentry consent modal management.
 *
 * Shows a first-run modal asking the user to opt in or opt out of Sentry
 * telemetry.  Once a choice is saved it is persisted in user settings and
 * this modal will not be shown again (unless the stored value is cleared).
 *
 * The user can always change their preference later via
 * Settings → Privacy & Telemetry.
 */

import { logError, logInfo, logWarn } from "../../common/logger";
import { disableSentryRenderer, initSentryRenderer } from "../utils/sentryRenderer";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOverlay(): HTMLElement | null {
    return document.getElementById("sentry-consent-overlay");
}

function showOverlay(): void {
    const overlay = getOverlay();
    if (overlay) {
        overlay.style.display = "flex";
    }
}

function hideOverlay(): void {
    const overlay = getOverlay();
    if (overlay) {
        overlay.style.display = "none";
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check the stored consent value and either:
 *  - Initialize Sentry if consent is "yes".
 *  - Show the consent modal if consent has not been recorded yet (null / undefined).
 *  - Do nothing if consent is "no".
 *
 * Must be called once during application initialization, after the settings
 * have been loaded.
 */
export async function checkAndHandleSentryConsent(): Promise<void> {
    try {
        const consent = await window.toolboxAPI.sentry.getConsent();

        if (consent === "yes") {
            await activateSentryRenderer();
            return;
        }

        if (consent === "no") {
            // User has explicitly declined — do nothing.
            return;
        }

        // consent is null or undefined → first run: show the modal.
        showSentryConsentModal();
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
    }
}

/**
 * Show the Sentry consent modal and wire up the Yes / No buttons.
 */
export function showSentryConsentModal(): void {
    showOverlay();

    const yesBtn = document.getElementById("sentry-consent-yes-btn");
    const noBtn = document.getElementById("sentry-consent-no-btn");

    const onYes = async (): Promise<void> => {
        cleanup();
        hideOverlay();
        try {
            await window.toolboxAPI.sentry.setConsent("yes");
            await activateSentryRenderer();
        } catch (err) {
            logError(err instanceof Error ? err : new Error(String(err)));
        }
    };

    const onNo = async (): Promise<void> => {
        cleanup();
        hideOverlay();
        try {
            await window.toolboxAPI.sentry.setConsent("no");
        } catch (err) {
            logError(err instanceof Error ? err : new Error(String(err)));
        }
    };

    const cleanup = (): void => {
        yesBtn?.removeEventListener("click", onYes);
        noBtn?.removeEventListener("click", onNo);
    };

    yesBtn?.addEventListener("click", onYes);
    noBtn?.addEventListener("click", onNo);
}

/**
 * Update Sentry state when the user changes their consent preference in Settings.
 * Pass "yes" to enable or "no" to disable.
 */
export async function updateSentryConsent(consent: "yes" | "no"): Promise<void> {
    try {
        await window.toolboxAPI.sentry.setConsent(consent);
        if (consent === "yes") {
            await activateSentryRenderer();
        } else {
            disableSentryRenderer();
        }
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
    }
}

/**
 * Send a small smoke-test warning and error to Sentry when telemetry is enabled.
 * Returns true when a test event was sent, false when consent is not enabled.
 */
export async function runSentryTelemetrySmokeTest(): Promise<boolean> {
    try {
        const consent = await window.toolboxAPI.sentry.getConsent();
        if (consent !== "yes") {
            logInfo("[Sentry] Telemetry smoke test skipped because consent is not enabled");
            return false;
        }

        const sent = await window.toolboxAPI.sentry.smokeTest();
        if (sent) {
            return true;
        }

        logWarn("[Sentry] Manual telemetry smoke test (warning)");
        logError(new Error("[Sentry] Manual telemetry smoke test (error)"));
        return false;
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
        return false;
    }
}

// ---------------------------------------------------------------------------
// Internal: renderer Sentry initialisation
// ---------------------------------------------------------------------------

async function activateSentryRenderer(): Promise<void> {
    try {
        const settings = await window.toolboxAPI.getUserSettings();
        const installId = settings.installId ?? "unknown";
        const appVersion = await window.toolboxAPI.getAppVersion();
        const channel = (process.env.PPTB_CHANNEL as string | undefined) ?? "stable";
        await initSentryRenderer(installId, appVersion, channel);
        logInfo("[Sentry] Renderer telemetry activated");
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
    }
}
