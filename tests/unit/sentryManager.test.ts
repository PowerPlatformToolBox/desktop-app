import { sendSentryTestEventToClient } from "../../src/main/managers/sentryManager";

describe("sendSentryTestEventToClient", () => {
    it("flushes the Sentry client after sending smoke-test events", async () => {
        const captureMessage = jest.fn();
        const captureException = jest.fn();
        const flush = jest.fn().mockResolvedValue(true);

        const result = await sendSentryTestEventToClient({
            captureMessage,
            captureException,
            flush,
        } as never);

        expect(result).toBe(true);
        expect(captureMessage).toHaveBeenCalledWith("[Sentry] Manual telemetry smoke test (warning)", "warning");
        expect(captureException).toHaveBeenCalled();
        expect(flush).toHaveBeenCalledWith(5000);
    });
});
