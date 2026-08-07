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
    try {
        // This will only work in main process
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        if (app && typeof app.isPackaged !== "undefined") {
            environment = app.isPackaged ? "production" : "development";
            release = `powerplatform-toolbox@${app.getVersion()}`;
        } else {
            environment = process.env.NODE_ENV || "development";
        }
    } catch {
        // Failed to access electron.app - likely in renderer process
        environment = process.env.NODE_ENV || "development";
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pkg = require("../../package.json");
            release = `powerplatform-toolbox@${pkg.version}`;
        } catch {
            release = "powerplatform-toolbox@unknown";
        }
    }

    return {
        dsn,
        environment,
        release,
        enableTracing: true,
        tracesSampleRate: environment === "production" ? 0.1 : 1.0,
        replaysSessionSampleRate: environment === "production" ? 0.1 : 1.0,
        replaysOnErrorSampleRate: 1.0,
    };
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
    return getSentryConfig() !== null;
}

/**
 * PII scrubbing patterns applied in beforeSend hooks
 * Matches common PII data: emails, UUIDs used as identifiers, URLs containing tokens, etc.
 */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Email addresses
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[email]" },
    // URLs containing tokens or credentials (query params named token, key, secret, password, auth, code)
    { pattern: /([?&](token|key|secret|password|auth|code|access_token|refresh_token|api_key)=)[^&\s"']*/gi, replacement: "$1[redacted]" },
    // Authorization header values
    { pattern: /(Authorization:\s*(?:Bearer|Basic|Token)\s+)[^\s"']*/gi, replacement: "$1[redacted]" },
    // Microsoft tenant IDs and object IDs (GUIDs used in AAD context — keep structure but redact value)
    // We keep a placeholder so the structure is visible without exposing actual GUIDs
    { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replacement: "[guid]" },
    // Azure resource URLs containing tenant or org info
    { pattern: /https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com/gi, replacement: "https://[org].crm.dynamics.com" },
    // IP addresses (v4)
    { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[ip]" },
];

/**
 * Scrub PII from a string value
 */
export function scrubPii(value: string): string {
    let result = value;
    for (const { pattern, replacement } of PII_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

/**
 * Recursively scrub PII from an object (tags, extra, breadcrumb data, etc.)
 * Returns a new object with PII scrubbed from all string values.
 */
export function scrubPiiFromObject(obj: unknown): unknown {
    if (typeof obj === "string") {
        return scrubPii(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(scrubPiiFromObject);
    }
    if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            // Redact known sensitive keys entirely
            const lowerKey = key.toLowerCase();
            if (lowerKey === "password" || lowerKey === "token" || lowerKey === "secret" || lowerKey === "accesstoken" || lowerKey === "refreshtoken" || lowerKey === "apikey" || lowerKey === "authorization") {
                result[key] = "[redacted]";
            } else {
                result[key] = scrubPiiFromObject(value);
            }
        }
        return result;
    }
    return obj;
}

/**
 * Apply PII scrubbing to a Sentry event.
 * Should be called from the beforeSend hook in both main and renderer Sentry.init().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubSentryEvent(event: any): any {
    if (!event) return event;

    // Scrub exception values
    if (event.exception?.values) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event.exception.values = event.exception.values.map((exc: any) => ({
            ...exc,
            value: exc.value ? scrubPii(exc.value) : exc.value,
        }));
    }

    // Scrub message
    if (event.message && typeof event.message === "string") {
        event.message = scrubPii(event.message);
    }

    // Scrub tags
    if (event.tags) {
        event.tags = scrubPiiFromObject(event.tags) as Record<string, string>;
    }

    // Scrub extra context
    if (event.extra) {
        event.extra = scrubPiiFromObject(event.extra) as Record<string, unknown>;
    }

    // Scrub breadcrumb messages and data
    if (event.breadcrumbs?.values) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event.breadcrumbs.values = event.breadcrumbs.values.map((crumb: any) => ({
            ...crumb,
            message: crumb.message ? scrubPii(crumb.message) : crumb.message,
            data: crumb.data ? scrubPiiFromObject(crumb.data) : crumb.data,
        }));
    }

    // Scrub request URL and headers
    if (event.request) {
        if (event.request.url && typeof event.request.url === "string") {
            event.request.url = scrubPii(event.request.url);
        }
        if (event.request.headers) {
            event.request.headers = scrubPiiFromObject(event.request.headers) as Record<string, string>;
        }
        if (event.request.data) {
            event.request.data = scrubPiiFromObject(event.request.data);
        }
    }

    // Scrub user context (remove name/email, keep only anonymous id)
    if (event.user) {
        const { id } = event.user as { id?: string };
        event.user = id ? { id } : undefined;
    }

    return event;
}
