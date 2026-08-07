import * as Sentry from "@sentry/electron/renderer";
import type { TelemetryConsentChoice } from "../../common/types";
import { getSentryConfig, scrubSentryEvent } from "../../common/sentry";
import { hasSentryTelemetryConsent, initializeSentryHelper, resetSentryHelper, setSentryTelemetryConsent } from "../../common/sentryHelper";

let isRendererSentryInitialized = false;

function getAppVersionFromRelease(release?: string): string {
    return release?.split("@")[1] || "unknown";
}

export async function applyRendererSentryConsent(consent: TelemetryConsentChoice | null): Promise<boolean> {
    setSentryTelemetryConsent(consent);

    if (consent !== "yes") {
        if (isRendererSentryInitialized && typeof Sentry.close === "function") {
            await Sentry.close();
        }

        isRendererSentryInitialized = false;
        resetSentryHelper();
        return false;
    }

    const sentryConfig = getSentryConfig();
    if (!sentryConfig) {
        return false;
    }

    if (!isRendererSentryInitialized) {
        const appVersion = getAppVersionFromRelease(sentryConfig.release);
        const platform = typeof process !== "undefined" ? process.platform : "unknown";
        const arch = typeof process !== "undefined" ? process.arch : "unknown";

        Sentry.init({
            dsn: sentryConfig.dsn,
            environment: sentryConfig.environment,
            release: sentryConfig.release,
            tracesSampleRate: sentryConfig.tracesSampleRate,
            replaysSessionSampleRate: sentryConfig.replaysSessionSampleRate,
            replaysOnErrorSampleRate: sentryConfig.replaysOnErrorSampleRate,
            enableLogs: sentryConfig.environment === "development",
            integrations: [
                Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
                Sentry.browserTracingIntegration({ enableLongTask: true }),
                Sentry.contextLinesIntegration(),
            ],
            beforeSend(event) {
                if (!hasSentryTelemetryConsent()) {
                    return null;
                }

                const scrubbed = scrubSentryEvent(event);

                if (!scrubbed.tags) scrubbed.tags = {};
                scrubbed.tags.process = "renderer";
                scrubbed.tags.app_version = appVersion;
                scrubbed.tags.os_platform = platform;
                scrubbed.tags.os_arch = arch;

                return scrubbed;
            },
        });

        initializeSentryHelper(Sentry);
        isRendererSentryInitialized = true;
    }

    return true;
}
