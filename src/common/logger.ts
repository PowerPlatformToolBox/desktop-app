/**
 * Centralized application logger
 *
 * All application logging flows through this module so that the underlying
 * implementation (currently console.*) can be swapped out in one place when
 * a replacement telemetry or structured-logging solution is introduced.
 *
 * Usage:
 *   import { logInfo, logWarn, logError, logDebug, logCheckpoint } from "../../common/logger";
 *
 * NOTE: This module is safe to use in both the main and renderer processes.
 */

/**
 * Log an informational message.
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
 */
export function logWarn(message: string, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(message, data);
    } else {
        // eslint-disable-next-line no-console
        console.warn(message);
    }
}

/**
 * Log an error message or Error object.
 */
export function logError(messageOrError: string | Error, data?: unknown): void {
    if (data !== undefined) {
        // eslint-disable-next-line no-console
        console.error(messageOrError, data);
    } else {
        // eslint-disable-next-line no-console
        console.error(messageOrError);
    }
}

/**
 * Log a debug message.
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
 * These map to console.log so that they are always visible regardless of
 * the browser/Node console log-level filter.
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
