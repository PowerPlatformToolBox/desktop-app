/// <reference types="jest" />

import { getSentryEnvironment, normalizeSentryFields, scrubSentryEvent } from "../../../src/common/sentry";

describe("Sentry field names", () => {
    it("normalizes aliases recursively without changing the input", () => {
        const fields = { machineId: "machine", data: [{ toolId: "tool", machineid: "nested" }], machin_id: "machine" };

        expect(normalizeSentryFields(fields)).toEqual({ machine_id: "machine", data: [{ tool_id: "tool", machine_id: "nested" }] });
        expect(fields.data[0].toolId).toBe("tool");
        expect(normalizeSentryFields({ toolid: "tool", machineid: "machine" })).toEqual({ tool_id: "tool", machine_id: "machine" });
    });

    it("prefers canonical keys regardless of property order", () => {
        expect(normalizeSentryFields({ tool_id: "canonical", toolId: "alias" })).toEqual({ tool_id: "canonical" });
        expect(normalizeSentryFields({ machineId: "alias", machine_id: "canonical" })).toEqual({ machine_id: "canonical" });
    });

    it("normalizes event metadata while retaining PII scrubbing", () => {
        const event = scrubSentryEvent({
            tags: { toolId: "tool" },
            extra: { machineId: "machine", email: "person@example.com" },
            contexts: { tool: { toolid: "tool" } },
            breadcrumbs: [{ data: { toolId: "tool" } }],
        });

        expect(event.tags).toEqual({ tool_id: "tool" });
        expect(event.extra).toEqual({ machine_id: "machine", email: "[email]" });
        expect(event.contexts.tool).toEqual({ tool_id: "tool" });
        expect(event.breadcrumbs[0].data).toEqual({ tool_id: "tool" });
    });
});

describe("getSentryEnvironment", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalChannel = process.env.PPTB_CHANNEL;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.PPTB_CHANNEL = originalChannel;
    });

    it("uses development for packaged insider builds", () => {
        process.env.PPTB_CHANNEL = "insider";

        expect(getSentryEnvironment(true)).toBe("development");
    });

    it("uses local for unpackaged runs, including the insider channel", () => {
        process.env.PPTB_CHANNEL = "insider";

        expect(getSentryEnvironment(false)).toBe("local");
    });

    it("uses local for renderer development runs", () => {
        process.env.NODE_ENV = "development";
        process.env.PPTB_CHANNEL = "stable";

        expect(getSentryEnvironment()).toBe("local");
    });

    it("uses production for packaged stable builds", () => {
        process.env.PPTB_CHANNEL = "stable";

        expect(getSentryEnvironment(true)).toBe("production");
    });
});
