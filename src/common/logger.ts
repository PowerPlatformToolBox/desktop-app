/**
 * Centralized application logger
 *
 * All application logging flows through this module so that the underlying
 * implementation can be swapped out in one place.
 *
 * Sentry integration:
 *   - Warnings and errors are forwarded to Sentry when a reporter is registered via
 *     `configureSentryReporter()`.  Call this once after Sentry is initialised in the
 *     main process or the renderer process.
 *   - PII is scrubbed from all messages before they are forwarded.
 *   - Sentry is only active when the user has given explicit consent ("yes").
 *
 * Usage:
 *   import { logInfo, logWarn, logError, logDebug, logCheckpoint } from "../../common/logger";
 *
 * NOTE: This module is safe to use in both the main and renderer processes.
 */

// ---------------------------------------------------------------------------
// PII scrubbing
// ---------------------------------------------------------------------------

// Patterns that may contain PII — replaced with a safe placeholder.
const PII_PATTERNS: Array<[RegExp, string]> = [
    // E-mail addresses
    [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
    // IPv4 addresses
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
    // HTTP/HTTPS URLs — replace the authority + path portion but keep the scheme for context
    [/https?:\/\/[^\s"'<>]+/g, "[url]"],
    // Windows file-system paths that may contain usernames (e.g. C:\Users\Alice\...)
    [/[A-Za-z]:\\Users\\[^\\\s"'<>]+/g, "[path]"],
    // Unix home-directory paths that may contain usernames (e.g. /home/alice/...)
    [/\/(?:home|Users)\/[^/\s"'<>]+/g, "[path]"],
    // Tokens / keys: long base64-like or hex sequences (32+ chars)
    [/\b[A-Za-z0-9+/=_-]{32,}\b/g, "[token]"],
    // UUIDs (could be connection IDs, but exclude install-ID as it's anonymous)
    [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]"],
];

/**
 * Remove personally-identifiable information from a string before it is sent
 * to an external telemetry service.
 */
export function scrubPii(text: string): string {
    let result = text;
    for (const [pattern, replacement] of PII_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Sentry reporter interface
// ---------------------------------------------------------------------------

export interface SentryReporter {
    captureException(error: Error, extra?: Record<string, unknown>): void;
    captureMessage(message: string, level: "warning" | "error"): void;
}

let _sentryReporter: SentryReporter | null = null;

/**
 * Register the Sentry reporter.  Should be called once, immediately after Sentry
 * is initialised, in both the main process and the renderer process.
 *
 * Pass `null` to disable Sentry reporting (e.g. when the user revokes consent).
 */
export function configureSentryReporter(reporter: SentryReporter | null): void {
    _sentryReporter = reporter;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function reportWarn(message: string): void {
    if (!_sentryReporter) return;
    try {
        _sentryReporter.captureMessage(scrubPii(message), "warning");
    } catch {
        // Never let the reporter itself crash the app.
    }
}

function reportError(error: Error | string, extra?: Record<string, unknown>): void {
    if (!_sentryReporter) return;
    try {
        const err = typeof error === "string" ? new Error(scrubPii(error)) : new Error(scrubPii(error.message));
        if (typeof error !== "string" && error.stack) {
            err.stack = scrubPii(error.stack);
        }
        _sentryReporter.captureException(err, extra);
    } catch {
        // Never let the reporter itself crash the app.
    }
}

// ---------------------------------------------------------------------------
// Public logging API
// ---------------------------------------------------------------------------

/**
 * Log an informational message.
 * Informational messages are not forwarded to Sentry.
 */
export function logInfo(message: string, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.info(message, data);
    } else {
        // eslint-disable-next-line no-console
        console.info(message);
    }
}

/**
 * Log a warning message.
 * Warnings are forwarded to Sentry when a reporter is registered.
 */
export function logWarn(message: string, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(message, data);
    } else {
        // eslint-disable-next-line no-console
        console.warn(message);
    }
    reportWarn(message);
}

/**
 * Log an error message or Error object.
 * Errors are forwarded to Sentry when a reporter is registered.
 */
export function logError(messageOrError: string | Error, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.error(messageOrError, data);
    } else {
        // eslint-disable-next-line no-console
        console.error(messageOrError);
    }
    reportError(messageOrError);
}

/**
 * Log a debug message.
 * Debug messages are never forwarded to Sentry.
 */
export function logDebug(message: string, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.debug(message, data);
    } else {
        // eslint-disable-next-line no-console
        console.debug(message);
    }
}

/**
 * Log a key application checkpoint / milestone (e.g. startup stages).
 * Checkpoints are never forwarded to Sentry.
 */
export function logCheckpoint(message: string, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.log(message, data);
    } else {
        // eslint-disable-next-line no-console
        console.log(message);
    }
}
