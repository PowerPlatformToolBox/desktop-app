/**
 * Centralized application logger
 *
 * All application logging flows through this module. Log calls are forwarded to
 * sentryHelper which routes them through Sentry structured logging (when a DSN is
 * configured) and always mirrors output to the console.
 *
 * Usage:
 *   import { logInfo, logWarn, logError, logDebug, logCheckpoint } from "../../common/logger";
 *
 * NOTE: This module is safe to use in both the main and renderer processes.
 */

import { logCheckpoint as sentryLogCheckpoint, logDebug as sentryLogDebug, logError as sentryLogError, logInfo as sentryLogInfo, logWarn as sentryLogWarn } from "./sentryHelper";

/**
 * Log an informational message.
 */
export function logInfo(message: string, data?: unknown): void {
    sentryLogInfo(message, data !== undefined ? { data } : undefined);
}

/**
 * Log a warning message.
 */
export function logWarn(message: string, data?: unknown): void {
    sentryLogWarn(message, data !== undefined ? { data } : undefined);
}

/**
 * Log an error message or Error object.
 */
export function logError(messageOrError: string | Error, data?: unknown): void {
    if (messageOrError instanceof Error) {
        const extra: Record<string, unknown> = { stack: messageOrError.stack, ...(data !== undefined ? { data } : {}) };
        sentryLogError(`${messageOrError.name}: ${messageOrError.message}`, extra);
    } else {
        sentryLogError(messageOrError, data !== undefined ? { data } : undefined);
    }
}

/**
 * Log a debug message.
 */
export function logDebug(message: string, data?: unknown): void {
    sentryLogDebug(message, data !== undefined ? { data } : undefined);
}

/**
 * Log a key application checkpoint / milestone (e.g. startup stages).
 * Always visible regardless of the console log-level filter.
 */
export function logCheckpoint(message: string, data?: unknown): void {
    sentryLogCheckpoint(message, data !== undefined ? ({ data } as Record<string, unknown>) : undefined);
}
