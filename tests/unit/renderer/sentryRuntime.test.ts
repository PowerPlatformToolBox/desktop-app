import type { SentryConfig } from "../../../src/common/sentry";

jest.mock("@sentry/electron/renderer", () => ({
    init: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    setUser: jest.fn(),
    setTag: jest.fn(),
    logger: { info: jest.fn() },
    browserTracingIntegration: jest.fn(() => ({ name: "BrowserTracing" })),
    contextLinesIntegration: jest.fn(() => ({ name: "ContextLines" })),
    captureConsoleIntegration: jest.fn(() => ({ name: "CaptureConsole" })),
}));
jest.mock("electron", () => ({ app: { isReady: jest.fn(() => false), isPackaged: true } }));
jest.mock("../../../src/common/sentry", () => ({
    ...jest.requireActual<typeof import("../../../src/common/sentry")>("../../../src/common/sentry"),
    getSentryConfig: jest.fn(() => ({
        dsn: "https://public@example.invalid/1",
        environment: "production",
        release: "powerplatform-toolbox@1.2.3",
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1,
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
    close: jest.Mock;
    setUser: jest.Mock;
    setTag: jest.Mock;
    browserTracingIntegration: jest.Mock;
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

describe("renderer Sentry runtime", () => {
    let sdk: MockSdk;
    let helper: typeof import("../../../src/common/sentryHelper");
    let applyConsent: typeof import("../../../src/renderer/modules/sentryRuntime").applyRendererSentryConsent;
    let getConfig: jest.Mock<SentryConfig | null, []>;

    beforeEach(() => {
        jest.resetModules();
        sdk = jest.requireMock("@sentry/electron/renderer");
        helper = jest.requireActual("../../../src/common/sentryHelper");
        getConfig = jest.requireMock("../../../src/common/sentry").getSentryConfig;
        applyConsent = jest.requireActual("../../../src/renderer/modules/sentryRuntime").applyRendererSentryConsent;
    });

    async function initialize(): Promise<RuntimeOptions> {
        expect(await applyConsent("yes")).toBe(true);
        return sdk.init.mock.calls[0][0];
    }

    test.each([null, "no"] as const)("does not initialize or set identity with consent %s", async (consent) => {
        expect(await applyConsent(consent, installId)).toBe(false);
        expect(helper.hasSentryTelemetryConsent()).toBe(false);
        expect(helper.getSentryMachineId()).toBeNull();
        expect(sdk.init).not.toHaveBeenCalled();
        expect(sdk.close).not.toHaveBeenCalled();
        expect(sdk.setUser).not.toHaveBeenCalled();
        expect(sdk.setTag).not.toHaveBeenCalled();
    });

    test("sanitizes the SDK message property and normalizes log attribute names without mutating input", async () => {
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

    test.each([null, "no"] as const)("closes and resets identity on consent %s; existing hooks immediately gate telemetry", async (consent) => {
        await applyConsent("yes", installId);
        const options = sdk.init.mock.calls[0][0];
        expect(options.beforeSendLog({ message: "allowed" })).not.toBeNull();
        expect(options.beforeSend(privateEvent())).not.toBeNull();
        expect(options.beforeSendTransaction({ transaction: "allowed" })).not.toBeNull();
        expect(await applyConsent(consent)).toBe(false);
        expect(sdk.close).toHaveBeenCalledTimes(1);
        expect(helper.hasSentryTelemetryConsent()).toBe(false);
        expect(helper.getSentryMachineId()).toBeNull();
        expect(options.beforeSendLog({ message: "blocked" })).toBeNull();
        expect(options.beforeSend(privateEvent())).toBeNull();
        expect(options.beforeSendTransaction({ transaction: "blocked" })).toBeNull();
        await applyConsent(consent);
        expect(sdk.close).toHaveBeenCalledTimes(1);
    });

    test("scrubs events and removes user names while adding renderer metadata", async () => {
        const options = await initialize();
        expect(options.beforeSend(privateEvent())).toMatchObject({
            message: "Failure for [email] at [path]/tool",
            user: { id: installId },
            tags: { machine_id: installId, tool_id: installId, contact: "[email]", process: "renderer", app_version: "1.2.3", os_platform: process.platform, os_arch: process.arch },
            extra: { password: "[redacted]", ownerPath: "[path]/tool" },
            contexts: { connection: { accessToken: "[redacted]" } },
            exception: { values: [{ value: "[email]" }] },
            breadcrumbs: [{ message: "[email]", data: { secret: "[redacted]" } }],
            request: { url: "https://[org].crm.dynamics.com/api?token=[redacted]", headers: { Authorization: "[redacted]" } },
        });
        expect(options.beforeSend(privateEvent())?.user).toEqual({ id: installId });
    });

    test("scrubs transaction names and nested span data with consent", async () => {
        const options = await initialize();
        expect(options.beforeSendTransaction({ transaction: "Load alice@example.com", spans: [{ description: "/Users/alice/tool", data: { token: "private-token", toolId: installId } }] })).toEqual({
            transaction: "Load [email]",
            spans: [{ description: "[path]/tool", data: { token: "[redacted]", tool_id: installId } }],
        });
    });

    test("sets install identity through the real helper and initializes once without console capture", async () => {
        expect(await applyConsent("yes", installId)).toBe(true);
        expect(await applyConsent("yes", installId)).toBe(true);
        expect(helper.getSentryMachineId()).toBe(installId);
        expect(sdk.setUser).toHaveBeenCalledWith({ id: installId, username: `machine-${installId}` });
        expect(sdk.setTag).toHaveBeenCalledWith("machine_id", installId);
        expect(sdk.init).toHaveBeenCalledTimes(1);
        expect(sdk.captureConsoleIntegration).not.toHaveBeenCalled();
        expect(sdk.browserTracingIntegration).toHaveBeenCalledWith({ enableLongTask: true });
        const options = sdk.init.mock.calls[0][0];
        expect(options.enableLogs).toBe(true);
        expect(options.integrations.map((integration) => integration.name)).toEqual(["BrowserTracing", "ContextLines"]);
    });

    test("reinitializes and restores SDK identity after opting back in", async () => {
        await applyConsent("yes", installId);
        await applyConsent("no");
        sdk.setUser.mockClear();
        sdk.setTag.mockClear();
        expect(await applyConsent("yes", installId)).toBe(true);
        expect(sdk.init).toHaveBeenCalledTimes(2);
        expect(sdk.close).toHaveBeenCalledTimes(1);
        expect(helper.hasSentryTelemetryConsent()).toBe(true);
        expect(helper.getSentryMachineId()).toBe(installId);
        expect(sdk.setUser).toHaveBeenCalledWith({ id: installId, username: `machine-${installId}` });
        expect(sdk.setTag).toHaveBeenCalledWith("machine_id", installId);
        expect(sdk.init.mock.calls[1][0].beforeSendLog({ message: "restored" })).not.toBeNull();
    });

    test("does not initialize or set SDK identity without configuration", async () => {
        getConfig.mockReturnValue(null);
        expect(await applyConsent("yes", installId)).toBe(false);
        expect(sdk.init).not.toHaveBeenCalled();
        expect(sdk.setUser).not.toHaveBeenCalled();
        expect(helper.getSentryMachineId()).toBeNull();
    });
});
