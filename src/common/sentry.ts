/**
 * Sentry configuration for telemetry and error tracking
 * This file provides initialization logic for both main and renderer processes
 */

/**
 * Sentry initialization options
 */
export interface SentryConfig {
    dsn: string;
    environment?: string;
    release?: string;
    enableTracing?: boolean;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
}

/**
 * Get Sentry configuration from environment
 * Returns null if Sentry DSN is not configured
 */
export function getSentryConfig(): SentryConfig | null {
    const dsn = process.env.SENTRY_DSN;

    // If no DSN is configured, return null to disable Sentry
    if (!dsn || dsn.trim() === "") {
        return null;
    }

    // Determine environment (production, development, etc.)
    // In Electron main process, we check if app is packaged
    // In renderer process, we check NODE_ENV
    let environment: string;
    let release = "unknown";

    // Try to detect if we're in main process by checking for electron module availability
    // and attempting to access main process APIs
    try {
        // This will only work in main process
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        if (app && typeof app.isPackaged !== "undefined") {
            // Successfully accessed main process app - we're in main process
            environment = app.isPackaged ? "production" : "development";
            release = `powerplatform-toolbox@${app.getVersion()}`;
        } else {
            // app exists but isPackaged is undefined - fall back to NODE_ENV
            environment = process.env.NODE_ENV || "development";
        }
    } catch (error) {
        // Failed to access electron.app - likely in renderer process or other context
        environment = process.env.NODE_ENV || "development";
        // Try to get version from package.json if available
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pkg = require("../../package.json");
            release = `powerplatform-toolbox@${pkg.version}`;
        } catch (pkgError) {
            // If package.json is not available, use default
            release = "powerplatform-toolbox@unknown";
        }
    }

    return {
        dsn,
        environment,
        release,
        enableTracing: true,
        tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in production, 100% in development
        replaysSessionSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in production, 100% in development
        replaysOnErrorSampleRate: 1.0, // Always capture replays on error
    };
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
    return getSentryConfig() !== null;
}
