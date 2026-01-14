/**
 * Sentry helper utilities for enhanced logging and tracing
 * Provides utility functions to add context, breadcrumbs, and machine ID to all Sentry events
 *
 * NOTE: This helper can be used in both main and renderer processes, but must import
 * Sentry from the appropriate subpath in the calling code
 */

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

/**
 * Initialize the Sentry helper with the Sentry module
 * Call this from main or renderer after importing the appropriate Sentry module
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initializeSentryHelper(sentry: any): void {
    sentryModule = sentry;
}

/**
 * Set the machine ID to be included in all Sentry events
 * This should be called early in the application initialization
 */
export function setSentryMachineId(id: string): void {
    machineId = id;

    if (!sentryModule) return;

    // Set as user context so it appears in all events
    sentryModule.setUser({
        id: id,
        username: `machine-${id}`,
    });

    // Also set as a tag for easier filtering
    sentryModule.setTag("machine_id", id);

    console.log(`[Sentry] Machine ID set: ${id}`);
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
        message,
        category,
        level,
        data: {
            ...data,
            machine_id: machineId,
            timestamp: new Date().toISOString(),
        },
    });
}

/**
 * Start a new Sentry span for performance monitoring
 * Use this for important operations like tool loading, connection testing, etc.
 *
 * Note: Returns a simple transaction-like object that's compatible with both old and new Sentry APIs
 */
export function startTransaction(name: string, op: string, data?: Record<string, unknown>): SentryTransaction | undefined {
    if (!sentryModule) return undefined;

    // Create a simple wrapper that's compatible with our needs
    // For newer Sentry versions, we just track timing in breadcrumbs instead of full transactions
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

                // Add breadcrumb with timing information (use debug level to avoid creating Issues)
                addBreadcrumb(`Operation ${name} finished`, "performance", "debug", {
                    operation: name,
                    op,
                    duration_ms: duration,
                    status,
                    ...data,
                });

                // Log to structured logger instead
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

    // Add breadcrumb for operation start
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

    // Log the error using the appropriate log level
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
        // Add machine ID to scope
        scope.setTag("machine_id", machineId || "unknown");

        // Add any custom tags
        if (context?.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }

        // Add any custom extra data
        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
        }

        // Set level if provided
        if (context?.level) {
            scope.setLevel(context.level);
        }

        sentryModule.captureException(error);
    });
}

/**
 * Capture a message with enhanced context
 * Use this ONLY for error/warning level messages that should appear as Issues
 * For info/debug messages, use the logInfo/logDebug functions instead
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

    // Log using the appropriate structured logger for full traceability
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

    // Create Sentry Issue with machine ID context
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
 * This helps organize errors by feature/module
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
 * Use this for critical operations to ensure errors are captured with full context
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
 * Use this at critical points in the application flow
 */
export function logCheckpoint(checkpoint: string, data?: Record<string, unknown>): void {
    // Log to Sentry using structured logger
    logInfo(`Checkpoint: ${checkpoint}`, data);

    // Add as breadcrumb for context
    addBreadcrumb(checkpoint, "checkpoint", "info", data);

    // Also log to console for local debugging
    console.log(`[Checkpoint] ${checkpoint}`, data ? JSON.stringify(data, null, 2) : "");
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
 * Clear the current scope (useful when switching contexts)
 */
export function clearScope(): void {
    if (!sentryModule) return;

    sentryModule.configureScope((scope: SentryScope) => scope.clear());
}

/**
 * Sentry Logger API wrappers
 * These functions use Sentry's structured logging API for better log organization
 */

/**
 * Log a trace message to Sentry
 * Use for detailed diagnostic information
 */
export function logTrace(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.trace(message, {
        ...data,
        machine_id: machineId,
    });
}

/**
 * Log a debug message to Sentry
 * Use for debugging information during development
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.debug(message, {
        ...data,
        machine_id: machineId,
    });
}

/**
 * Log an info message to Sentry
 * Use for general informational messages
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.info(message, {
        ...data,
        machine_id: machineId,
    });
}

/**
 * Log a warning message to Sentry
 * Use for warning conditions that should be reviewed
 */
export function logWarn(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.warn(message, {
        ...data,
        machine_id: machineId,
    });
}

/**
 * Log an error message to Sentry
 * Use for error conditions that need attention
 */
export function logError(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.error(message, {
        ...data,
        machine_id: machineId,
    });
}

/**
 * Log a fatal error message to Sentry
 * Use for critical errors that require immediate attention
 */
export function logFatal(message: string, data?: Record<string, unknown>): void {
    if (!sentryModule || !sentryModule.logger) return;

    sentryModule.logger.fatal(message, {
        ...data,
        machine_id: machineId,
    });
}
