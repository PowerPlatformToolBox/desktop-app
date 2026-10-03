/// <reference types="jest" />

import { addConnectionSlotsBreadcrumb, initializeSentryHelper, logInfo, recordSentryTelemetryDisabled, resetSentryHelper, setSentryTelemetryConsent } from "../../../src/common/sentryHelper";

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

    it("records only slot counts in the connection-launch breadcrumb payload", () => {
        const addBreadcrumb = jest.fn();
        initializeSentryHelper({ ...sentry, addBreadcrumb });

        addConnectionSlotsBreadcrumb(0, 3, 2);

        expect(addBreadcrumb).toHaveBeenCalledWith({
            message: "Tool connection slots resolved",
            category: "tool.connections",
            level: "info",
            data: {
                minConnections: 0,
                maxConnections: 3,
                filledConnectionCount: 2,
                machine_id: null,
                timestamp: expect.any(String),
            },
        });
    });
});
