/**
 * Sentry integration for the main (Node.js) process.
 *
 * Responsibilities:
 *  - Initialize Sentry with the user-supplied DSN (injected at build time).
 *  - Register the logger's Sentry reporter so that logWarn/logError forward events.
 *  - Attach process-level handlers for uncaught exceptions and unhandled rejections.
 *  - Tear down / reinitialize when the user changes their consent.
 */

import { app } from "electron";
import * as os from "os";
import { configureSentryReporter, logError, logInfo, scrubPii } from "../../common/logger";
import { SettingsManager } from "./settingsManager";
import { InstallIdManager } from "./installIdManager";

// @sentry/electron/main is a CommonJS/ESM package; import lazily so that when
// no DSN is configured the module is never evaluated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryMain: any = null;

async function getSentryMain() {
    if (!SentryMain) {
        // Dynamic import to avoid resolution errors if the module is unavailable
        SentryMain = await import("@sentry/electron/main");
    }
    return SentryMain;
}

// Track whether Sentry has been initialized in this session to prevent double-init.
let _initialized = false;

/**
 * Initialize Sentry for the main process and register it with the central logger.
 * Should be called once consent is confirmed as "yes".
 */
export async function initSentryMain(settingsManager: SettingsManager, installIdManager: InstallIdManager): Promise<void> {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        logInfo("[Sentry] No DSN configured — telemetry disabled");
        return;
    }

    if (_initialized) {
        return;
    }

    try {
        const Sentry = await getSentryMain();

        Sentry.init({
            dsn,
            release: app.getVersion(),
            environment: process.env.PPTB_CHANNEL ?? "stable",
            // Disable automatic performance tracing — we only need error/warning capture.
            tracesSampleRate: 0,
            // No session replays for a desktop app.
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            beforeSend(event: Record<string, unknown>) {
                return scrubSentryEvent(event);
            },
            beforeSendTransaction() {
                // Drop all transactions (performance traces).
                return null;
            },
        });

        // Attach stable, non-PII context once.
        const installId = installIdManager.getInstallId();
        Sentry.setTag("install_id", installId);
        Sentry.setTag("os", os.platform());
        Sentry.setTag("arch", os.arch());
        Sentry.setTag("app_version", app.getVersion());
        Sentry.setUser({ id: installId });

        // Register the reporter with the central logger.
        configureSentryReporter({
            captureException: (error: Error, extra?: Record<string, unknown>) => {
                Sentry.captureException(error, extra ? { extra } : undefined);
            },
            captureMessage: (message: string, level: "warning" | "error") => {
                Sentry.captureMessage(message, level);
            },
        });

        // Register global process error handlers.
        registerProcessHandlers();

        _initialized = true;
        logInfo("[Sentry] Main-process telemetry initialized");
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
    }
}

/**
 * Disable Sentry reporting (called when the user revokes consent).
 * Removes the reporter from the central logger; Sentry itself cannot be fully
 * torn down at runtime so we simply stop sending events via the reporter bridge.
 */
export function disableSentryMain(): void {
    configureSentryReporter(null);
    _initialized = false;
    logInfo("[Sentry] Main-process telemetry disabled (consent revoked)");
}

// ---------------------------------------------------------------------------
// Global process-level error handlers
// ---------------------------------------------------------------------------

let _handlersRegistered = false;
// Re-entrancy guard: prevents our handler from recursively re-triggering itself
// when Sentry's async send (captureException) produces its own unhandled rejection.
let _inErrorHandler = false;

function registerProcessHandlers(): void {
    if (_handlersRegistered) return;
    _handlersRegistered = true;

    process.on("uncaughtException", (error: Error) => {
        if (_inErrorHandler) return;
        _inErrorHandler = true;
        try {
            logError(error);
        } finally {
            _inErrorHandler = false;
        }
    });

    process.on("unhandledRejection", (reason: unknown) => {
        if (_inErrorHandler) return;
        _inErrorHandler = true;
        try {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            logError(error);
        } finally {
            _inErrorHandler = false;
        }
    });
}

// ---------------------------------------------------------------------------
// PII scrubbing for Sentry events
// ---------------------------------------------------------------------------

function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
    try {
        // Scrub the stringified event and parse it back.
        const raw = JSON.stringify(event);
        return JSON.parse(scrubPii(raw)) as Record<string, unknown>;
    } catch {
        return event;
    }
}
