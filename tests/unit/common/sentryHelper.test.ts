/// <reference types="jest" />

import { initializeSentryHelper, logInfo, recordSentryTelemetryDisabled, resetSentryHelper, setSentryTelemetryConsent } from "../../../src/common/sentryHelper";

describe("Sentry helper telemetry consent", () => {
    const sentry = {
        logger: { info: jest.fn() },
        flush: jest.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        initializeSentryHelper(sentry);
    });

    afterEach(() => {
        resetSentryHelper();
        setSentryTelemetryConsent(null);
    });

    it("does not send ordinary logs after telemetry is disabled", () => {
        setSentryTelemetryConsent("no");

        logInfo("ordinary message");

        expect(sentry.logger.info).not.toHaveBeenCalled();
    });

    it("allows the explicit telemetry-disabled marker while consent is no", async () => {
        setSentryTelemetryConsent("no");

        await recordSentryTelemetryDisabled("install-123", "1.2.7", "update", "1.2.6");

        expect(sentry.logger.info).toHaveBeenCalledWith("Sentry telemetry disabled", {
            event_type: "telemetry_disabled",
            machine_id: "install-123",
            release: "1.2.7",
            release_action: "update",
            previous_release: "1.2.6",
        });
    });
});
