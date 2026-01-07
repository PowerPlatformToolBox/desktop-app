/**
 * Sentry configuration for telemetry and error tracking
 * This file provides initialization logic for both main and renderer processes
 */

import { app } from "electron";

/**
 * Sentry initialization options
 */
export interface SentryConfig {
    dsn: string;
    environment?: string;
    release?: string;
    enableTracing?: boolean;
    tracesSampleRate?: number;
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
    const environment = process.env.NODE_ENV || (app?.isPackaged ? "production" : "development");

    // Get app version for release tracking
    const release = app?.getVersion() || "unknown";

    return {
        dsn,
        environment,
        release: `powerplatform-toolbox@${release}`,
        enableTracing: true,
        tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in production, 100% in development
    };
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
    return getSentryConfig() !== null;
}
