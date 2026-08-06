/**
 * Sentry integration for the renderer (Chromium) process.
 *
 * Responsibilities:
 *  - Initialize Sentry renderer SDK with the user-supplied DSN.
 *  - Register the logger's Sentry reporter so that logWarn/logError forward events.
 *  - Attach window-level handlers for uncaught errors and unhandled rejections.
 *  - Tear down reporting when the user revokes consent.
 */

import { configureSentryReporter, logError, logInfo, scrubPii } from "../../common/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryRenderer: any = null;

async function getSentryRenderer() {
    if (!SentryRenderer) {
        SentryRenderer = await import("@sentry/electron/renderer");
    }
    return SentryRenderer;
}

let _initialized = false;

/**
 * Initialize Sentry for the renderer process.
 * Should be called once, after the user has given consent and the DSN is available.
 *
 * @param installId - Anonymous unique install identifier (no PII).
 * @param appVersion - Current application version string.
 * @param channel - Release channel ("stable", "beta", etc.).
 */
export async function initSentryRenderer(installId: string, appVersion: string, channel: string): Promise<void> {
    // __SENTRY_DSN__ is replaced at build time by Vite (see vite.config.ts).
    const dsn: string = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";
    if (!dsn) {
        logInfo("[Sentry] No DSN configured in renderer — telemetry disabled");
        return;
    }

    if (_initialized) {
        return;
    }

    try {
        const Sentry = await getSentryRenderer();

        Sentry.init({
            dsn,
            release: appVersion,
            environment: channel ?? "stable",
            tracesSampleRate: 0,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            beforeSend(event: Record<string, unknown>) {
                return scrubSentryEvent(event);
            },
            beforeSendTransaction() {
                return null;
            },
        });

        Sentry.setTag("install_id", installId);
        Sentry.setTag("app_version", appVersion);
        Sentry.setUser({ id: installId });

        configureSentryReporter({
            captureException: (error: Error, extra?: Record<string, unknown>) => {
                Sentry.captureException(error, extra ? { extra } : undefined);
            },
            captureMessage: (message: string, level: "warning" | "error") => {
                Sentry.captureMessage(message, level);
            },
        });

        registerWindowHandlers();

        _initialized = true;
        logInfo("[Sentry] Renderer-process telemetry initialized");
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
    }
}

/**
 * Disable Sentry reporting in the renderer (consent revoked or set to "no").
 */
export function disableSentryRenderer(): void {
    configureSentryReporter(null);
    _initialized = false;
    logInfo("[Sentry] Renderer-process telemetry disabled");
}

// ---------------------------------------------------------------------------
// Global window-level error handlers
// ---------------------------------------------------------------------------

let _handlersRegistered = false;

function registerWindowHandlers(): void {
    if (_handlersRegistered) return;
    _handlersRegistered = true;

    window.addEventListener("error", (event: ErrorEvent) => {
        const error = event.error instanceof Error ? event.error : new Error(event.message ?? "Uncaught error");
        logError(error);
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason ?? "Unhandled rejection"));
        logError(error);
    });
}

// ---------------------------------------------------------------------------
// PII scrubbing for Sentry events
// ---------------------------------------------------------------------------

function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
    try {
        const raw = JSON.stringify(event);
        return JSON.parse(scrubPii(raw)) as Record<string, unknown>;
    } catch {
        return event;
    }
}
