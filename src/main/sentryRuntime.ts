import * as Sentry from "@sentry/electron/main";
import { app } from "electron";
import { logWarn } from "../common/logger";
import { getSentryConfig, scrubSentryEvent } from "../common/sentry";
import { hasSentryTelemetryConsent, initializeSentryHelper, setSentryMachineId, setSentryTelemetryConsent } from "../common/sentryHelper";
import type { TelemetryConsentChoice } from "../common/types";

let isMainSentryInitialized = false;

function getAppVersionFromRelease(release?: string): string {
    return release?.split("@")[1] || "unknown";
}

export async function applyMainSentryConsent(consent: TelemetryConsentChoice | null, installId?: string): Promise<boolean> {
    setSentryTelemetryConsent(consent);

    const sentryConfig = getSentryConfig();

    if (sentryConfig && !isMainSentryInitialized) {
        if (app.isReady()) {
            logWarn("Skipped late Sentry main initialization after app ready; telemetry requires restart", {
                consent,
            });
        } else {
            const appVersion = getAppVersionFromRelease(sentryConfig.release);

            Sentry.init({
                dsn: sentryConfig.dsn,
                environment: sentryConfig.environment,
                release: sentryConfig.release,
                tracesSampleRate: sentryConfig.tracesSampleRate,
                enableLogs: sentryConfig.environment !== "production",
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
    }

    if (consent !== "yes") {
        return false;
    }

    if (!sentryConfig) {
        return false;
    }

    if (installId) {
        setSentryMachineId(installId);
    }

    return isMainSentryInitialized;
}
