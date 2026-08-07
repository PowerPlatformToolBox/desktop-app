/**
 * Shared Sentry runtime configuration helpers.
 *
 * We resolve the DSN from the build-time injected Vite define first, then fall
 * back to runtime process environment or a renderer global for local/dev
 * debugging. This avoids relying solely on `process.env` in bundled Electron
 * contexts where Vite does not replace those references as expected.
 */

declare const __SENTRY_DSN__: string;

export function getSentryDsn(): string {
    const viteValue = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";
    if (viteValue.trim()) {
        return viteValue.trim();
    }

    const processValue = typeof process !== "undefined" && process.env ? process.env.SENTRY_DSN : undefined;
    if (typeof processValue === "string" && processValue.trim()) {
        return processValue.trim();
    }

    const globalValue = typeof globalThis !== "undefined" ? (globalThis as typeof globalThis & { __SENTRY_DSN__?: string }).__SENTRY_DSN__ : undefined;
    if (typeof globalValue === "string" && globalValue.trim()) {
        return globalValue.trim();
    }

    return "";
}
