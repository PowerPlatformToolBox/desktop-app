/**
 * Sentry helper utilities for enhanced logging and tracing
 * Provides utility functions to add context, breadcrumbs, and machine ID to all Sentry events
 *
 * NOTE: This helper can be used in both main and renderer processes, but must import
 * Sentry from the appropriate subpath in the calling code
 */

import { scrubPii, scrubPiiFromObject } from "./sentry";

// Define types for Sentry operations (these are compatible with both main and renderer)
export interface SentryScope {
    setTag(key: string, value: string): void;
    setExtra(key: string, value: unknown): void;
    setLevel(level: string): void;
    clear(): void;
}

export interface SentryTransaction {
    setStatus(status: string): void;
    finish(): void;
}

let machineId: string | null = null;
// Use any type for flexibility across different Sentry module versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentryModule: any = null;

// Environment detection - determines if we're in development mode
let isDevelopment = false;

/**
 * Detect if we're running in development mode
 * This checks both NODE_ENV and whether the app is packaged (Electron main process)
 * @returns true if in development mode, false otherwise
 */
function isDevelopmentEnvironment(): boolean {
    if (process.env.NODE_ENV === "development") {
        return true;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        return !app.isPackaged;
    } catch {
        return false;
    }
}

/**
 * Initialize the Sentry helper with the Sentry module
 * Call this from main or renderer after importing the appropriate Sentry module
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initializeSentryHelper(sentry: any): void {
    sentryModule = sentry;
    isDevelopment = isDevelopmentEnvironment();
}

/**
 * Set the machine ID to be included in all Sentry events
 * This should be called early in the application initialization
 */
export function setSentryMachineId(id: string): void {
    machineId = id;

    if (!sentryModule) return;

    // Set as user context so it appears in all events (no PII — this is an anonymous install ID)
    sentryModule.setUser({
        id: id,
        username: `machine-${id}`,
    });

    sentryModule.setTag("machine_id", id);

    logInfo(`[Sentry] Machine ID set: ${id}`);
}

/**
 * Get the current machine ID
 */
export function getSentryMachineId(): string | null {
    return machineId;
}

/**
 * Add a breadcrumb with machine ID context
 * Breadcrumbs help recreate the sequence of events leading to an error
 */
export function addBreadcrumb(message: string, category: string, level: "debug" | "info" | "warning" | "error" = "info", data?: Record<string, unknown>): void {
    if (!sentryModule) return;

    sentryModule.addBreadcrumb({
        message: scrubPii(message),
        category,
        level,
        data: data
            ? ({
                  ...(scrubPiiFromObject(data) as Record<string, unknown>),
                  machine_id: machineId,
                  timestamp: new Date().toISOString(),
              } as Record<string, unknown>)
            : {
                  machine_id: machineId,
                  timestamp: new Date().toISOString(),
              },
    });
}

/**
 * Start a new Sentry span for performance monitoring
 * Use this for important operations like tool loading, connection testing, etc.
 */
export function startTransaction(name: string, op: string, data?: Record<string, unknown>): SentryTransaction | undefined {
    if (!sentryModule) return undefined;

    const startTime = Date.now();
    let finished = false;
    let status = "ok";

    const transactionWrapper: SentryTransaction = {
        setStatus: (newStatus: string) => {
            status = newStatus;
        },
        finish: () => {
            if (!finished) {
                finished = true;
                const duration = Date.now() - startTime;

                addBreadcrumb(`Operation ${name} finished`, "performance", "debug", {
                    operation: name,
                    op,
                    duration_ms: duration,
                    status,
                    ...data,
                });

                logDebug(`Operation ${name} completed: ${duration}ms`, {
                    operation: name,
                    op,
                    duration_ms: duration,
                    status,
                    ...data,
                });
            }
        },
    };

    addBreadcrumb(`Operation ${name} started`, "performance", "debug", {
        operation: name,
        op,
        ...data,
    });

    logDebug(`Operation ${name} started`, {
        operation: name,
        op,
        ...data,
    });

    return transactionWrapper;
}

/**
 * Capture an exception with enhanced context
 */
export function captureException(
    error: Error,
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
        level?: string;
    },
): void {
    if (!sentryModule) return;

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

    sentryModule.withScope((scope: SentryScope) => {
        scope.setTag("machine_id", machineId || "unknown");

        if (context?.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }

        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
        }

        if (context?.level) {
            scope.setLevel(context.level);
        }

        sentryModule.captureException(error);
    });
}

/**
 * Capture a message with enhanced context
 * Use this ONLY for error/warning level messages that should appear as Issues
 */
export function captureMessage(
    message: string,
    level: "fatal" | "error" | "warning" = "error",
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
    },
): void {
    if (!sentryModule) return;

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

    sentryModule.withScope((scope: SentryScope) => {
        scope.setTag("machine_id", machineId || "unknown");

        if (context?.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }

        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
        }

        sentryModule.captureMessage(message, level);
    });
}

/**
 * Set context for a specific area of the application
 */
export function setContext(key: string, value: Record<string, unknown>): void {
    if (!sentryModule) return;

    sentryModule.setContext(key, {
        ...value,
        machine_id: machineId,
    });
}

/**
 * Wrap an async function with error capturing and performance tracking
 */
export function wrapAsyncOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
    },
): Promise<T> {
    const transaction = startTransaction(operationName, "function");

    logDebug(`Starting operation: ${operationName}`, context?.extra);

    return operation()
        .then((result) => {
            transaction?.setStatus("ok");
            transaction?.finish();
            addBreadcrumb(`${operationName} completed successfully`, "operation", "info");
            logInfo(`Operation completed: ${operationName}`, {
                operation: operationName,
                ...context?.extra,
            });
            return result;
        })
        .catch((error) => {
            transaction?.setStatus("internal_error");
            transaction?.finish();

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

            addBreadcrumb(`${operationName} failed: ${error}`, "operation", "error");
            throw error;
        });
}

/**
 * Log an important application junction/checkpoint
 */
export function logCheckpoint(checkpoint: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log("[Checkpoint]", checkpoint, data ? JSON.stringify(data, null, 2) : "");

    logInfo(`Checkpoint: ${checkpoint}`, data);

    addBreadcrumb(checkpoint, "checkpoint", "info", data);
}

/**
 * Set custom tags that will be included in all subsequent events
 */
export function setTags(tags: Record<string, string>): void {
    if (!sentryModule) return;

    Object.entries(tags).forEach(([key, value]) => {
        sentryModule.setTag(key, value);
    });
}

/**
 * Clear the current scope
 */
export function clearScope(): void {
    if (!sentryModule) return;

    sentryModule.configureScope((scope: SentryScope) => scope.clear());
}

// ─── Structured log functions ─────────────────────────────────────────────────

/**
 * Log a trace message.
 * Only sent to Sentry in development mode.
 */
export function logTrace(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
        // eslint-disable-next-line no-console
        console.debug("[TRACE]", message, data || "");
    }

    if (!sentryModule || !sentryModule.logger || !isDevelopment) return;

    sentryModule.logger.trace(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}

/**
 * Log a debug message.
 * Only sent to Sentry in development mode.
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
        // eslint-disable-next-line no-console
        console.debug("[DEBUG]", message, data || "");
    }

    if (!sentryModule || !sentryModule.logger || !isDevelopment) return;

    sentryModule.logger.debug(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}

/**
 * Log an informational message.
 * Creates breadcrumbs in all environments.
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info("[INFO]", message, data || "");

    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.info(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}

/**
 * Log a warning message.
 * Sent to Sentry in all environments.
 */
export function logWarn(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn("[WARN]", message, data || "");

    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.warn(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}

/**
 * Log an error message.
 * Sent to Sentry in all environments.
 */
export function logError(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error("[ERROR]", message, data || "");

    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.error(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}

/**
 * Log a fatal error message.
 * Sent to Sentry in all environments.
 */
export function logFatal(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error("[FATAL]", message, data || "");

    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.fatal(scrubPii(message), {
        ...(scrubPiiFromObject(data) as Record<string, unknown>),
        machine_id: machineId,
    });
}
