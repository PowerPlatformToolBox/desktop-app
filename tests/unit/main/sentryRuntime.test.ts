import type { SentryConfig } from "../../../src/common/sentry";

jest.mock("@sentry/electron/main", () => ({
    init: jest.fn(),
    setUser: jest.fn(),
    setTag: jest.fn(),
    logger: { info: jest.fn() },
    flush: jest.fn().mockResolvedValue(true),
    httpIntegration: jest.fn(() => ({ name: "Http" })),
    nodeContextIntegration: jest.fn(() => ({ name: "NodeContext" })),
    contextLinesIntegration: jest.fn(() => ({ name: "ContextLines" })),
    localVariablesIntegration: jest.fn(() => ({ name: "LocalVariables" })),
    modulesIntegration: jest.fn(() => ({ name: "Modules" })),
    captureConsoleIntegration: jest.fn(() => ({ name: "CaptureConsole" })),
}));
jest.mock("electron", () => ({ app: { isReady: jest.fn(() => false), isPackaged: true } }));
jest.mock("../../../src/common/logger", () => ({ logWarn: jest.fn() }));
jest.mock("../../../src/common/sentry", () => ({
    ...jest.requireActual<typeof import("../../../src/common/sentry")>("../../../src/common/sentry"),
    getSentryConfig: jest.fn(() => ({
        dsn: "https://public@example.invalid/1",
        environment: "production",
        release: "powerplatform-toolbox@1.2.3",
        tracesSampleRate: 0.1,
    })),
}));

interface RuntimeLog {
    message: string;
    attributes?: Record<string, unknown>;
}

interface RuntimeOptions {
    enableLogs: boolean;
    integrations: Array<{ name: string }>;
    beforeSend(event: Record<string, unknown>): Record<string, unknown> | null;
    beforeSendTransaction(event: Record<string, unknown>): Record<string, unknown> | null;
    beforeSendLog(log: RuntimeLog): RuntimeLog | null;
}

interface MockSdk {
    init: jest.Mock<void, [RuntimeOptions]>;
    setUser: jest.Mock;
    setTag: jest.Mock;
    logger: { info: jest.Mock };
    flush: jest.Mock;
    captureConsoleIntegration: jest.Mock;
}

const installId = "12345678-1234-1234-1234-123456789abc";

function privateEvent(): Record<string, unknown> {
    return {
        message: "Failure for alice@example.com at /Users/alice/tool",
        user: { id: installId, email: "alice@example.com", username: "Alice", name: "Alice Example" },
        tags: { machineId: installId, toolId: installId, contact: "alice@example.com" },
        extra: { password: "private-password", ownerPath: "/Users/alice/tool" },
        contexts: { connection: { accessToken: "private-token" } },
        exception: { values: [{ value: "alice@example.com" }] },
        breadcrumbs: [{ message: "alice@example.com", data: { secret: "private-secret" } }],
        request: { url: "https://contoso.crm.dynamics.com/api?token=private-token", headers: { Authorization: "Bearer private-token" } },
    };
}

describe("main Sentry runtime", () => {
    let sdk: MockSdk;
    let app: { isReady: jest.Mock };
    let helper: typeof import("../../../src/common/sentryHelper");
    let applyConsent: typeof import("../../../src/main/sentryRuntime").applyMainSentryConsent;
    let getConfig: jest.Mock<SentryConfig | null, []>;
    let logWarn: jest.Mock;

    beforeEach(() => {
        jest.resetModules();
        sdk = jest.requireMock("@sentry/electron/main");
        app = jest.requireMock("electron").app;
        helper = jest.requireActual("../../../src/common/sentryHelper");
        getConfig = jest.requireMock("../../../src/common/sentry").getSentryConfig;
        logWarn = jest.requireMock("../../../src/common/logger").logWarn;
        applyConsent = jest.requireActual("../../../src/main/sentryRuntime").applyMainSentryConsent;
    });

    async function initialize(): Promise<RuntimeOptions> {
        expect(await applyConsent("yes")).toBe(true);
        return sdk.init.mock.calls[0][0];
    }

    test.each([null, "no"] as const)("initializes before app ready with consent %s, but gates ordinary telemetry", async (consent) => {
        expect(await applyConsent(consent, installId)).toBe(true);
        expect(sdk.init).toHaveBeenCalledTimes(1);
        expect(helper.hasSentryTelemetryConsent()).toBe(false);
        const options = sdk.init.mock.calls[0][0];
        expect(options.enableLogs).toBe(true);
        expect(options.beforeSend(privateEvent())).toBeNull();
        expect(options.beforeSendTransaction({ transaction: "ordinary transaction" })).toBeNull();
        expect(options.beforeSendLog({ message: "ordinary log" })).toBeNull();
        expect(sdk.setUser).not.toHaveBeenCalled();
        expect(sdk.setTag).not.toHaveBeenCalled();
    });

    test("sanitizes SDK log message and attributes, normalizing identifier names without mutating the log", async () => {
        const options = await initialize();
        const log = {
            message: "alice@example.com /Users/alice/tool https://contoso.crm.dynamics.com?token=private-token",
            attributes: { machineId: installId, toolId: installId, email: "alice@example.com", nested: { password: "private-password" } },
        };
        expect(options.beforeSendLog(log)).toEqual({
            message: "[email] [path]/tool https://[org].crm.dynamics.com?token=[redacted]",
            attributes: { machine_id: installId, tool_id: installId, email: "[email]", nested: { password: "[redacted]" } },
        });
        expect(log.message).toContain("alice@example.com");
        expect(log.attributes).toHaveProperty("machineId", installId);
    });

    test("existing hooks drop logs, events, and transactions immediately after consent is revoked", async () => {
        const options = await initialize();
        expect(options.beforeSendLog({ message: "allowed" })).not.toBeNull();
        expect(options.beforeSend(privateEvent())).not.toBeNull();
        expect(options.beforeSendTransaction({ transaction: "allowed" })).not.toBeNull();
        expect(await applyConsent("no")).toBe(true);
        expect(options.beforeSendLog({ message: "blocked" })).toBeNull();
        expect(options.beforeSend(privateEvent())).toBeNull();
        expect(options.beforeSendTransaction({ transaction: "blocked" })).toBeNull();
        expect(sdk.init).toHaveBeenCalledTimes(1);
    });

    test("permits only the explicit opt-out marker and allowlisted sanitized attributes without consent", async () => {
        await applyConsent("no");
        await helper.recordSentryTelemetryDisabled(installId, "1.2.3", "upgrade", "1.2.2");
        expect(sdk.logger.info).toHaveBeenCalledWith("Sentry telemetry disabled", {
            event_type: "telemetry_disabled",
            machine_id: installId,
            release: "1.2.3",
            release_action: "upgrade",
            previous_release: "1.2.2",
        });
        expect(sdk.flush).toHaveBeenCalledWith(2000);
        const options = sdk.init.mock.calls[0][0];
        const log = {
            message: "Sentry telemetry disabled",
            attributes: {
                event_type: "telemetry_disabled",
                machine_id: installId,
                release: "1.2.3",
                release_action: "upgrade",
                previous_release: "alice@example.com",
                email: "alice@example.com",
                secret: "private-secret",
            },
        };
        expect(options.beforeSendLog(log)).toEqual({
            message: log.message,
            attributes: { event_type: "telemetry_disabled", machine_id: installId, release: "1.2.3", release_action: "upgrade", previous_release: "[email]" },
        });
        expect(options.beforeSendLog({ message: log.message })).toBeNull();
        expect(options.beforeSendLog({ message: log.message, attributes: { event_type: "ordinary" } })).toBeNull();
        expect(options.beforeSendLog({ message: "ordinary", attributes: log.attributes })).toBeNull();
    });

    test("scrubs events and removes user names while adding main process metadata", async () => {
        const options = await initialize();
        expect(options.beforeSend(privateEvent())).toMatchObject({
            message: "Failure for [email] at [path]/tool",
            user: { id: installId },
            tags: { machine_id: installId, tool_id: installId, contact: "[email]", process: "main", app_version: "1.2.3", os_platform: process.platform, os_arch: process.arch },
            extra: { password: "[redacted]", ownerPath: "[path]/tool" },
            contexts: { connection: { accessToken: "[redacted]" }, os: { name: process.platform, arch: process.arch } },
            exception: { values: [{ value: "[email]" }] },
            breadcrumbs: [{ message: "[email]", data: { secret: "[redacted]" } }],
            request: { url: "https://[org].crm.dynamics.com/api?token=[redacted]", headers: { Authorization: "[redacted]" } },
        });
        expect(options.beforeSend(privateEvent())?.user).toEqual({ id: installId });
    });

    test("scrubs transaction names and nested span data when consent is granted", async () => {
        const options = await initialize();
        expect(options.beforeSendTransaction({ transaction: "Load alice@example.com", spans: [{ description: "/Users/alice/tool", data: { token: "private-token", toolId: installId } }] })).toEqual({
            transaction: "Load [email]",
            spans: [{ description: "[path]/tool", data: { token: "[redacted]", tool_id: installId } }],
        });
    });

    test("sets install identity through the real helper without reinitializing or capturing console", async () => {
        await applyConsent(null);
        expect(await applyConsent("yes", installId)).toBe(true);
        expect(helper.getSentryMachineId()).toBe(installId);
        expect(sdk.setUser).toHaveBeenCalledWith({ id: installId, username: `machine-${installId}` });
        expect(sdk.setTag).toHaveBeenCalledWith("machine_id", installId);
        expect(sdk.init).toHaveBeenCalledTimes(1);
        expect(sdk.captureConsoleIntegration).not.toHaveBeenCalled();
        expect(sdk.init.mock.calls[0][0].integrations.map((integration) => integration.name)).toEqual(["Http", "NodeContext", "ContextLines", "LocalVariables", "Modules"]);
    });

    test("skips late main initialization after app readiness", async () => {
        app.isReady.mockReturnValue(true);
        expect(await applyConsent("yes", installId)).toBe(false);
        expect(helper.hasSentryTelemetryConsent()).toBe(true);
        expect(sdk.init).not.toHaveBeenCalled();
        expect(logWarn).toHaveBeenCalledWith("Skipped late Sentry main initialization after app ready; telemetry requires restart", { consent: "yes" });
        expect(sdk.setUser).not.toHaveBeenCalled();
        expect(sdk.setTag).not.toHaveBeenCalled();
    });

    test("does not initialize or set SDK identity without configuration", async () => {
        getConfig.mockReturnValue(null);
        expect(await applyConsent("yes", installId)).toBe(false);
        expect(sdk.init).not.toHaveBeenCalled();
        expect(sdk.setUser).not.toHaveBeenCalled();
        expect(helper.getSentryMachineId()).toBeNull();
    });
});
