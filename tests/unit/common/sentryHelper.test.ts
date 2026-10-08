/// <reference types="jest" />

import {
    addConnectionSlotsBreadcrumb,
    captureException,
    captureMessage,
    initializeSentryHelper,
    logInfo,
    recordSentryTelemetryDisabled,
    resetSentryHelper,
    setContext,
    setSentryTelemetryConsent,
    setTags,
    startTransaction,
    wrapAsyncOperation,
} from "../../../src/common/sentryHelper";

describe("Sentry helper telemetry consent", () => {
    it("creates and finishes a real SDK span only once", () => {
        const span = { setStatus: jest.fn(), end: jest.fn() };
        const startInactiveSpan = jest.fn().mockReturnValue(span);
        initializeSentryHelper({ ...sentry, startInactiveSpan, addBreadcrumb: jest.fn() });
        setSentryTelemetryConsent("yes");
        const transaction = startTransaction("tool load", "tool", { toolId: "tool" });
        transaction?.setStatus("internal_error");
        transaction?.finish();
        transaction?.finish();
        expect(startInactiveSpan).toHaveBeenCalledWith({ name: "tool load", op: "tool", attributes: { tool_id: "tool", machine_id: null } });
        expect(span.setStatus).toHaveBeenCalledWith({ code: 2, message: "internal_error" });
        expect(span.end).toHaveBeenCalledTimes(1);
        setSentryTelemetryConsent("no");
        expect(startTransaction("disabled", "tool")).toBeUndefined();
        expect(startInactiveSpan).toHaveBeenCalledTimes(1);
    });

    it("captures synchronous operation failures and ends their spans", async () => {
        const span = { setStatus: jest.fn(), end: jest.fn() };
        const capture = jest.fn();
        initializeSentryHelper({
            ...sentry,
            startInactiveSpan: jest.fn().mockReturnValue(span),
            addBreadcrumb: jest.fn(),
            withScope: (callback: (scope: unknown) => void) => callback({ setTag: jest.fn(), setExtra: jest.fn(), setLevel: jest.fn() }),
            captureException: capture,
        });
        setSentryTelemetryConsent("yes");
        const error = new Error("sync failure");
        await expect(
            wrapAsyncOperation("load", () => {
                throw error;
            }),
        ).rejects.toBe(error);
        expect(capture).toHaveBeenCalledTimes(1);
        expect(span.end).toHaveBeenCalledTimes(1);
    });
    const sentry = {
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
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

    it("normalizes nested log fields and keeps the shared machine identifier authoritative", () => {
        setSentryTelemetryConsent("yes");

        logInfo("tool launched", { toolId: "alias", tool_id: "canonical", machineId: "caller", data: { toolid: "nested" } });

        expect(sentry.logger.info).toHaveBeenCalledWith("tool launched", {
            tool_id: "canonical",
            machine_id: null,
            data: { tool_id: "nested" },
        });
    });

    it("normalizes global tags and context fields", () => {
        const setTag = jest.fn();
        const setContextMock = jest.fn();
        initializeSentryHelper({ ...sentry, setTag, setContext: setContextMock });

        setTags({ toolId: "tool", machineid: "machine" });
        setContext("tool", { toolId: "tool", machineId: "caller" });

        expect(setTag.mock.calls).toEqual([
            ["tool_id", "tool"],
            ["machine_id", "machine"],
        ]);
        expect(setContextMock).toHaveBeenCalledWith("tool", { tool_id: "tool", machine_id: null });
    });

    it.each(["exception", "message"])("normalizes %s scope metadata", (kind) => {
        const scope = { setTag: jest.fn(), setExtra: jest.fn(), setLevel: jest.fn(), clear: jest.fn() };
        initializeSentryHelper({
            ...sentry,
            logger: { ...sentry.logger, error: jest.fn() },
            withScope: (callback: (value: typeof scope) => void) => callback(scope),
            captureException: jest.fn(),
            captureMessage: jest.fn(),
        });
        setSentryTelemetryConsent("yes");
        const context = { tags: { toolId: "tool" }, extra: { details: { machineId: "machine" } } };

        if (kind === "exception") {
            captureException(new Error("failed"), context);
        } else {
            captureMessage("failed", "error", context);
        }

        expect(scope.setTag).toHaveBeenCalledWith("tool_id", "tool");
        expect(scope.setTag).not.toHaveBeenCalledWith("toolId", expect.anything());
        expect(scope.setExtra).toHaveBeenCalledWith("details", { machine_id: "machine" });
        expect(sentry.logger.error).not.toHaveBeenCalled();
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
