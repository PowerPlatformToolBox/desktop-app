/// <reference types="jest" />

import { getSentryEnvironment, normalizeSentryFields, sanitizeSentryData, sanitizeSentryLog, scrubPiiFromObject, scrubSentryEvent } from "../../../src/common/sentry";

describe.each([normalizeSentryFields, scrubPiiFromObject, sanitizeSentryData])("Circular telemetry data: %p", (transform) => {
    it("replaces self-referencing objects without mutating the input", () => {
        const value: Record<string, unknown> = { label: "safe" };
        value.self = value;
        expect(transform(value)).toEqual({ label: "safe", self: "[circular]" });
        expect(value.self).toBe(value);
    });

    it("handles cycles across objects and arrays", () => {
        const value: unknown[] = [];
        value.push({ parent: value });
        expect(transform(value)).toEqual([{ parent: "[circular]" }]);
        const selfArray: unknown[] = [];
        selfArray.push(selfArray);
        expect(transform(selfArray)).toEqual(["[circular]"]);
    });

    it("handles circular Error causes", () => {
        const error = new Error("failure");
        const cause = new Error("cause", { cause: error });
        error.cause = cause;
        const result = transform(error) as { message: string; cause: { message: string; cause: unknown } };
        expect(result.message).toBe("failure");
        expect(result.cause.message).toBe("cause");
        expect(result.cause.cause).toBe("[circular]");
    });

    it("does not mark repeated non-circular references as cycles", () => {
        const shared = { label: "safe" };
        expect(transform({ first: shared, second: shared })).toEqual({ first: { label: "safe" }, second: { label: "safe" } });
        expect(transform(shared)).toEqual(shared);
    });
});

describe("Sentry field names", () => {
    it("retains valid trace identifiers while redacting exception locals", () => {
        const traceId = "123456789abcdef0123456789abcdef0";
        const spanId = "123456789abcdef0";
        const event = scrubSentryEvent({
            contexts: { trace: { trace_id: traceId, span_id: spanId } },
            exception: { values: [{ value: "failure", stacktrace: { frames: [{ vars: { access_token: "secret", email: "person@example.com" } }] } }] },
        });
        expect(event.contexts.trace).toEqual({ trace_id: traceId, span_id: spanId });
        expect(event.exception.values[0].stacktrace.frames[0].vars).toEqual({ access_token: "[redacted]", email: "[email]" });
    });
    it("preserves only explicitly named anonymous UUID identifiers", () => {
        const identifier = "12345678-1234-4321-8123-123456789abc";
        expect(sanitizeSentryData({ machineId: identifier, toolId: identifier, tenantId: identifier, api_key: "secret" })).toEqual({
            machine_id: identifier,
            tool_id: identifier,
            tenantId: "[guid]",
            api_key: "[redacted]",
        });
    });

    it("serializes nested errors including their causes while scrubbing PII", () => {
        const error = new Error("person@example.com", { cause: new Error("nested failure") });
        const result = sanitizeSentryData({ data: error }) as unknown as { data: { name: string; message: string; stack: string; cause: { message: string } } };
        expect(result.data.name).toBe("Error");
        expect(result.data.message).toBe("[email]");
        expect(result.data.stack).toContain("[email]");
        expect(result.data.cause.message).toBe("nested failure");
    });

    it("blocks logs without consent except the restricted opt-out marker", () => {
        expect(sanitizeSentryLog({ message: "ordinary", attributes: {} }, false)).toBeNull();
        expect(sanitizeSentryLog({ message: "ordinary", attributes: { event_type: "telemetry_disabled" } }, false)).toBeNull();
        expect(sanitizeSentryLog({ message: "Sentry telemetry disabled", attributes: { event_type: "telemetry_disabled", release: "1.2.7", secret: "private" } }, false)).toEqual({
            message: "Sentry telemetry disabled",
            attributes: { event_type: "telemetry_disabled", release: "1.2.7" },
        });
    });

    it("scrubs direct SDK logs and transaction span data", () => {
        expect(sanitizeSentryLog({ message: "person@example.com", attributes: { password: "secret", toolId: "tool" } }, true)).toEqual({
            message: "[email]",
            attributes: { password: "[redacted]", tool_id: "tool" },
        });
        const event = scrubSentryEvent({ transaction: "person@example.com", spans: [{ description: "person@example.com", data: { token: "secret" } }] });
        expect(event.transaction).toBe("[email]");
        expect(event.spans[0]).toEqual({ description: "[email]", data: { token: "[redacted]" } });
    });
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

describe("Sentry breadcrumb scrubbing", () => {
    const breadcrumb = { message: "Contact person@example.com", data: { toolId: "tool", password: "secret" } };
    const scrubbedBreadcrumb = { message: "Contact [email]", data: { tool_id: "tool", password: "[redacted]" } };

    it("handles SDK arrays without trying to map their inherited values method", () => {
        const breadcrumbs = [breadcrumb];
        expect(typeof breadcrumbs.values).toBe("function");

        const event = scrubSentryEvent({ breadcrumbs });

        expect(event.breadcrumbs).toEqual([scrubbedBreadcrumb]);
        expect(breadcrumbs[0]).toEqual(breadcrumb);
    });

    it("handles wrapped breadcrumb arrays without changing their representation", () => {
        const event = scrubSentryEvent({ breadcrumbs: { values: [breadcrumb] } });

        expect(event.breadcrumbs).toEqual({ values: [scrubbedBreadcrumb] });
    });

    it.each([undefined, null, {}, { values: undefined }, { values: null }, { values: "not an array" }, { values: {} }, { values: () => [] }])(
        "does not throw when breadcrumb values are absent or not an array: %p",
        (breadcrumbs) => {
            expect(() => scrubSentryEvent({ breadcrumbs })).not.toThrow();
        },
    );

    it.each([[], { values: [] }])("handles empty breadcrumb collections: %p", (breadcrumbs) => {
        expect(scrubSentryEvent({ breadcrumbs }).breadcrumbs).toEqual(breadcrumbs);
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
