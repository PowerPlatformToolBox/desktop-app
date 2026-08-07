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
import { getSentryDsn } from "../../common/sentryConfig";
import { InstallIdManager } from "./installIdManager";
import { SettingsManager } from "./settingsManager";

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
let _sentryClient: Record<string, unknown> | null = null;

/**
 * Initialize Sentry for the main process and register it with the central logger.
 * Should be called once consent is confirmed as "yes".
 */
export async function initSentryMain(settingsManager: SettingsManager, installIdManager: InstallIdManager): Promise<void> {
    const dsn = getSentryDsn();
    if (!dsn) {
        logInfo("[Sentry] No DSN configured — telemetry disabled");
        return;
    }

    if (_initialized) {
        return;
    }

    try {
        const Sentry = await getSentryMain();

        const integrations = [
            ...(typeof Sentry.captureConsoleIntegration === "function" ? [Sentry.captureConsoleIntegration({ levels: ["error", "warn"] })] : []),
            ...(typeof Sentry.httpIntegration === "function" ? [Sentry.httpIntegration()] : []),
            ...(typeof Sentry.nodeContextIntegration === "function" ? [Sentry.nodeContextIntegration()] : []),
            ...(typeof Sentry.contextLinesIntegration === "function" ? [Sentry.contextLinesIntegration()] : []),
            ...(typeof Sentry.localVariablesIntegration === "function" ? [Sentry.localVariablesIntegration()] : []),
            ...(typeof Sentry.modulesIntegration === "function" ? [Sentry.modulesIntegration()] : []),
        ];

        Sentry.init({
            dsn,
            release: app.getVersion(),
            environment: process.env.PPTB_CHANNEL ?? "stable",
            // Disable automatic performance tracing — we only need error/warning capture.
            tracesSampleRate: 0,
            // No session replays for a desktop app.
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            enableLogs: process.env.NODE_ENV === "development",
            integrations,
            beforeSend(event: Record<string, unknown>) {
                const processedEvent = scrubSentryEvent(event);
                const tags = (processedEvent.tags ?? {}) as Record<string, unknown>;
                tags.process = "main";
                processedEvent.tags = tags;

                const contexts = (processedEvent.contexts ?? {}) as Record<string, unknown>;
                contexts.os = {
                    name: process.platform,
                    version: process.getSystemVersion ? process.getSystemVersion() : "unknown",
                };
                processedEvent.contexts = contexts;

                return processedEvent;
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
        _sentryClient = Sentry;
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
    _sentryClient = null;
    logInfo("[Sentry] Main-process telemetry disabled (consent revoked)");
}

export async function sendSentryTestEvent(): Promise<boolean> {
    if (!_initialized || !_sentryClient) {
        return false;
    }

    return sendSentryTestEventToClient(_sentryClient);
}

export async function sendSentryTestEventToClient(client: Record<string, unknown>): Promise<boolean> {
    try {
        const captureMessage = client.captureMessage as ((message: string, level?: string) => void) | undefined;
        const captureException = client.captureException as ((error: Error) => void) | undefined;
        const flush = client.flush as ((timeout?: number) => PromiseLike<boolean> | boolean | undefined) | undefined;

        captureMessage?.("[Sentry] Manual telemetry smoke test (warning)", "warning");
        captureException?.(new Error("[Sentry] Manual telemetry smoke test (error)"));

        if (typeof flush === "function") {
            await flush(5000);
        }

        return true;
    } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)));
        return false;
    }
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
