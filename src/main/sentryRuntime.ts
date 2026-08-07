import * as Sentry from "@sentry/electron/main";
import type { TelemetryConsentChoice } from "../common/types";
import { getSentryConfig, scrubSentryEvent } from "../common/sentry";
import { hasSentryTelemetryConsent, initializeSentryHelper, resetSentryHelper, setSentryMachineId, setSentryTelemetryConsent } from "../common/sentryHelper";

let isMainSentryInitialized = false;

function getAppVersionFromRelease(release?: string): string {
    return release?.split("@")[1] || "unknown";
}

export async function applyMainSentryConsent(consent: TelemetryConsentChoice | null, installId?: string): Promise<boolean> {
    setSentryTelemetryConsent(consent);

    if (consent !== "yes") {
        if (isMainSentryInitialized && typeof Sentry.close === "function") {
            await Sentry.close();
        }

        isMainSentryInitialized = false;
        resetSentryHelper();
        return false;
    }

    const sentryConfig = getSentryConfig();
    if (!sentryConfig) {
        return false;
    }

    if (!isMainSentryInitialized) {
        const appVersion = getAppVersionFromRelease(sentryConfig.release);

        Sentry.init({
            dsn: sentryConfig.dsn,
            environment: sentryConfig.environment,
            release: sentryConfig.release,
            tracesSampleRate: sentryConfig.tracesSampleRate,
            enableLogs: sentryConfig.environment === "development",
            integrations: [
                Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
                Sentry.httpIntegration(),
                Sentry.nodeContextIntegration(),
                Sentry.contextLinesIntegration(),
                Sentry.localVariablesIntegration(),
                Sentry.modulesIntegration(),
            ],
            beforeSend(event) {
                if (!hasSentryTelemetryConsent()) {
                    return null;
                }

                const scrubbed = scrubSentryEvent(event);

                if (!scrubbed.tags) scrubbed.tags = {};
                scrubbed.tags.process = "main";
                scrubbed.tags.app_version = appVersion;
                scrubbed.tags.os_platform = process.platform;
                scrubbed.tags.os_arch = process.arch;

                if (!scrubbed.contexts) scrubbed.contexts = {};
                scrubbed.contexts.os = {
                    name: process.platform,
                    version: process.getSystemVersion ? process.getSystemVersion() : "unknown",
                    arch: process.arch,
                };

                return scrubbed;
            },
        });

        initializeSentryHelper(Sentry);
        isMainSentryInitialized = true;
    }

    if (installId) {
        setSentryMachineId(installId);
    }

    return true;
}
