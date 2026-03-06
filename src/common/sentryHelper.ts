/**
 * Logging helper utilities
 * Provides utility functions for consistent console logging across the application
 *
 * NOTE: This helper can be used in both main and renderer processes
 */

/**
 * Detect if we're running in development mode
 * This checks both NODE_ENV and whether the app is packaged (Electron main process)
 * @returns true if in development mode, false otherwise
 */
function isDevelopmentEnvironment(): boolean {
    // Check NODE_ENV first
    if (process.env.NODE_ENV === "development") {
        return true;
    }

    // Try to detect if we're in Electron main process and check if app is packaged
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        return !app.isPackaged;
    } catch {
        // Not in main process or electron not available
        // Default to production mode for safety
        return false;
    }
}

// Environment detection - determines if we're in development mode
const isDevelopment = isDevelopmentEnvironment();

/**
 * No-op: previously initialized the Sentry helper - retained for API compatibility
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initializeSentryHelper(_sentry: any): void {
    // No-op: Sentry has been removed
}

/**
 * No-op: previously set the install ID for Sentry events - retained for API compatibility
 */
export function setSentryInstallId(_id: string): void {
    // No-op: Sentry has been removed
}

/**
 * No-op: previously returned the Sentry install ID - retained for API compatibility
 */
export function getSentryInstallId(): string | null {
    return null;
}

/**
 * No-op: previously added breadcrumbs to Sentry - retained for API compatibility
 */
export function addBreadcrumb(_message: string, _category: string, _level?: string, _data?: Record<string, unknown>): void {
    // No-op: Sentry has been removed
}

/**
 * No-op: previously started a Sentry transaction - retained for API compatibility
 */
export function startTransaction(_name: string, _op: string, _data?: Record<string, unknown>): undefined {
    return undefined;
}

/**
 * Log an exception to the console
 */
export function captureException(
    error: Error,
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
        level?: string;
    },
): void {
    const level = context?.level || "error";
    const errorMessage = `${error.name}: ${error.message}`;
    const errorData = {
        ...context?.extra,
        ...context?.tags,
        stack: error.stack,
    };

    if (level === "fatal") {
        logFatal(errorMessage, errorData);
    } else {
        logError(errorMessage, errorData);
    }
}

/**
 * Log a message to the console
 */
export function captureMessage(
    message: string,
    level: "fatal" | "error" | "warning" = "error",
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
    },
): void {
    const logData = {
        ...context?.extra,
        ...context?.tags,
    };

    switch (level) {
        case "fatal":
            logFatal(message, logData);
            break;
        case "error":
            logError(message, logData);
            break;
        case "warning":
            logWarn(message, logData);
            break;
    }
}

/**
 * No-op: previously set Sentry context - retained for API compatibility
 */
export function setContext(_key: string, _value: Record<string, unknown>): void {
    // No-op: Sentry has been removed
}

/**
 * Wrap an async function with error logging
 */
export function wrapAsyncOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
    },
): Promise<T> {
    logDebug(`Starting operation: ${operationName}`, context?.extra);

    return operation()
        .then((result) => {
            logInfo(`Operation completed: ${operationName}`, {
                operation: operationName,
                ...context?.extra,
            });
            return result;
        })
        .catch((error) => {
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: {
                    operation: operationName,
                    ...context?.tags,
                },
                extra: {
                    ...context?.extra,
                },
                level: "error",
            });
            throw error;
        });
}

/**
 * Log an important application junction/checkpoint
 * TODO: Replace with a proper logging mechanism when a replacement for Sentry is implemented
 */
export function logCheckpoint(checkpoint: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log(`[Checkpoint] ${checkpoint}`, data ? JSON.stringify(data, null, 2) : "");
}

/**
 * No-op: previously set Sentry tags - retained for API compatibility
 */
export function setTags(_tags: Record<string, string>): void {
    // No-op: Sentry has been removed
}

/**
 * No-op: previously cleared the Sentry scope - retained for API compatibility
 */
export function clearScope(): void {
    // No-op: Sentry has been removed
}

/**
 * Log a trace message (development only)
 */
export function logTrace(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
        // eslint-disable-next-line no-console
        console.debug(`[TRACE] ${message}`, data || "");
    }
}

/**
 * Log a debug message (development only)
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
        // eslint-disable-next-line no-console
        console.debug(`[DEBUG] ${message}`, data || "");
    }
}

/**
 * Log an info message
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(`[INFO] ${message}`, data || "");
}

/**
 * Log a warning message
 */
export function logWarn(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${message}`, data || "");
}

/**
 * Log an error message
 */
export function logError(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, data || "");
}

/**
 * Log a fatal error message
 */
export function logFatal(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(`[FATAL] ${message}`, data || "");
}
