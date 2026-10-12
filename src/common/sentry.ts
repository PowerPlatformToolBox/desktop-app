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

export type SentryEnvironment = "production" | "development" | "local";

export function getSentryEnvironment(isPackaged?: boolean): SentryEnvironment {
    const isLocal = isPackaged === false || (isPackaged === undefined && process.env.NODE_ENV === "development");
    if (isLocal) {
        return "local";
    }

    return process.env.PPTB_CHANNEL === "insider" ? "development" : "production";
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

    // In Electron main process, app.isPackaged distinguishes local runs.
    // The renderer falls back to NODE_ENV because electron.app is unavailable there.
    let environment: SentryEnvironment;
    let release = "unknown";

    // Try to detect if we're in main process by checking for electron module availability
    try {
        // This will only work in main process
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        if (app && typeof app.isPackaged !== "undefined") {
            environment = getSentryEnvironment(app.isPackaged);
            release = `powerplatform-toolbox@${app.getVersion()}`;
        } else {
            environment = getSentryEnvironment();
        }
    } catch {
        // Failed to access electron.app - likely in renderer process
        environment = getSentryEnvironment();
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
    // Windows file-system paths that may contain usernames (e.g. C:\Users\Alice\...)
    { pattern: /[a-zA-Z]:\\Users\\[^\\]+\\/g, replacement: "[path]\\" },
    // Unix file-system paths that may contain usernames (e.g. /home/alice/...)
    { pattern: /\/(?:home|Users)\/[^/\s"'<>]+/g, replacement: "[path]" },
    // Tokens / keys: long base64-like or hex sequences (32+ chars)
    { pattern: /\b[a-zA-Z0-9_-]{32,}\b/g, replacement: "[token]" },
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
 * Normalize telemetry identifier aliases without mutating the input.
 * Canonical snake_case fields take precedence over aliases.
 */
export function normalizeSentryFields<T>(value: T, ancestors = new WeakSet<object>()): T {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (ancestors.has(value)) {
        return "[circular]" as T;
    }
    ancestors.add(value);
    try {
        if (value instanceof Error) {
            return normalizeSentryFields(
                {
                    ...value,
                    name: value.name,
                    message: value.message,
                    stack: value.stack,
                    ...(value.cause !== undefined ? { cause: value.cause } : {}),
                },
                ancestors,
            ) as T;
        }
        if (Array.isArray(value)) {
            return value.map((item) => normalizeSentryFields(item, ancestors)) as T;
        }

        const fields = value as Record<string, unknown>;
        const normalized: Record<string, unknown> = {};
        for (const [key, fieldValue] of Object.entries(fields)) {
            const canonicalKey = /^(machineid|machine_id|machin_id)$/i.test(key) ? "machine_id" : /^(toolid|tool_id)$/i.test(key) ? "tool_id" : key;
            if (key !== canonicalKey && Object.prototype.hasOwnProperty.call(fields, canonicalKey)) {
                continue;
            }
            normalized[canonicalKey] = normalizeSentryFields(fieldValue, ancestors);
        }
        return normalized as T;
    } finally {
        ancestors.delete(value);
    }
}

/**
 * Recursively scrub PII from metadata, returning a new object.
 */
export function scrubPiiFromObject(obj: unknown, ancestors = new WeakSet<object>()): unknown {
    if (typeof obj === "string") {
        return scrubPii(obj);
    }
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    if (ancestors.has(obj)) {
        return "[circular]";
    }
    ancestors.add(obj);
    try {
        if (obj instanceof Error) {
            return scrubPiiFromObject(normalizeSentryFields(obj), ancestors);
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => scrubPiiFromObject(item, ancestors));
        }
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            // Redact known sensitive keys entirely
            const lowerKey = key.toLowerCase().replace(/_/g, "");
            if (
                lowerKey === "password" ||
                lowerKey === "token" ||
                lowerKey === "secret" ||
                lowerKey === "accesstoken" ||
                lowerKey === "refreshtoken" ||
                lowerKey === "apikey" ||
                lowerKey === "authorization"
            ) {
                result[key] = "[redacted]";
            } else if ((key === "machine_id" || key === "tool_id") && typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
                result[key] = value;
            } else if ((key === "trace_id" || key === "sentry.trace_id") && typeof value === "string" && /^[0-9a-f]{32}$/i.test(value)) {
                result[key] = value;
            } else if (["span_id", "parent_span_id", "sentry.span_id"].includes(key) && typeof value === "string" && /^[0-9a-f]{16}$/i.test(value)) {
                result[key] = value;
            } else {
                result[key] = scrubPiiFromObject(value, ancestors);
            }
        }
        return result;
    } finally {
        ancestors.delete(obj);
    }
}

export function sanitizeSentryData<T>(value: T): T {
    return scrubPiiFromObject(normalizeSentryFields(value)) as T;
}

export function sanitizeSentryLog<T extends { message: string; attributes?: Record<string, unknown> }>(log: T, hasConsent: boolean): T | null {
    if (!hasConsent) {
        if (log.message !== "Sentry telemetry disabled" || log.attributes?.event_type !== "telemetry_disabled") {
            return null;
        }
        const attributes = Object.fromEntries(Object.entries(log.attributes).filter(([key]) => ["event_type", "machine_id", "release", "release_action", "previous_release"].includes(key)));
        return { ...log, attributes: sanitizeSentryData(attributes) };
    }
    return { ...log, message: scrubPii(log.message), attributes: sanitizeSentryData(log.attributes) };
}

/**
 * Apply PII scrubbing to a Sentry event.
 * Should be called from the beforeSend hook in both main and renderer Sentry.init().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubSentryEvent(event: any): any {
    if (!event) return event;

    for (const key of ["tags", "extra", "contexts", "breadcrumbs", "spans"]) {
        if (event[key]) {
            event[key] = sanitizeSentryData(event[key]);
        }
    }

    if (typeof event.transaction === "string") {
        event.transaction = scrubPii(event.transaction);
    }

    // Scrub exception values
    if (event.exception?.values) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event.exception.values = event.exception.values.map((exc: any) => ({
            ...exc,
            value: exc.value ? scrubPii(exc.value) : exc.value,
            ...(exc.stacktrace ? { stacktrace: sanitizeSentryData(exc.stacktrace) } : {}),
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
    const breadcrumbs = Array.isArray(event.breadcrumbs) ? event.breadcrumbs : event.breadcrumbs?.values;
    if (Array.isArray(breadcrumbs)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scrubbedBreadcrumbs = breadcrumbs.map((crumb: any) => ({
            ...crumb,
            message: crumb.message ? scrubPii(crumb.message) : crumb.message,
            data: crumb.data ? scrubPiiFromObject(crumb.data) : crumb.data,
        }));
        if (Array.isArray(event.breadcrumbs)) {
            event.breadcrumbs = scrubbedBreadcrumbs;
        } else {
            event.breadcrumbs.values = scrubbedBreadcrumbs;
        }
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
