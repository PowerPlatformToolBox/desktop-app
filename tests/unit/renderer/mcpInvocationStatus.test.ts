/// <reference types="jest" />

import type { AgentInvocationLogEntry, HeadlessJobDetails } from "../../../src/common/types";
import { getMcpInvocationDetailsContent } from "../../../src/renderer/modals/mcpInvocationDetails/view";
import { getMcpInvocationStatus, getMcpInvocationStatusBadgeStyle } from "../../../src/renderer/modules/mcpInvocationStatus";

describe("MCP invocation status", () => {
    it.each(["pending", "in_progress", "completed", "failed"] as const)("prefers the %s job status over the invocation outcome", (status) => {
        expect(getMcpInvocationStatus("completed", status)).toBe(status);
    });

    it.each([
        ["in-progress", "in_progress"],
        ["completed", "completed"],
        ["rejected", "rejected"],
        ["no-result", "no-result"],
        [undefined, "pending"],
    ] as const)("falls back from outcome %s to %s without a job", (outcome, status) => {
        expect(getMcpInvocationStatus(outcome)).toBe(status);
    });

    it.each([
        ["pending", "#8a8886"],
        ["in_progress", "#0f6cbd"],
        ["completed", "#107c10"],
        ["failed", "#d13438"],
        ["rejected", "#d13438"],
        ["no-result", "#8a8886"],
    ] as const)("styles the combined %s status", (status, color) => {
        expect(getMcpInvocationStatusBadgeStyle(status)).toContain(color);
    });
});

describe("MCP invocation details status presentation", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

    beforeEach(() => {
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                createElement: () => ({
                    textContent: "",
                    get innerHTML() {
                        return this.textContent;
                    },
                }),
            },
        });
    });

    afterEach(() => {
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    });

    const log: AgentInvocationLogEntry = {
        timestamp: "2026-11-10T00:00:00Z",
        toolId: "test",
        toolName: "Test Tool",
        connectionId: null,
        prefillSummary: "",
        outcome: "completed",
        correlationId: "job-1",
    };
    const job: HeadlessJobDetails = {
        jobId: "job-1",
        toolId: "test",
        toolName: "Test Tool",
        status: "failed",
        createdAt: log.timestamp,
        timeoutMs: 1000,
    };

    it("renders a single status field using the job status rather than a conflicting outcome", () => {
        const html = getMcpInvocationDetailsContent(log, job);
        expect(html.match(/<strong>Status<\/strong>/g)).toHaveLength(1);
        expect(html).not.toContain("<strong>Outcome</strong>");
        expect(html).toContain(">failed</span>");
        expect(html).not.toContain(">completed</span>");
    });

    it("renders an invocation-only outcome in the status badge", () => {
        const html = getMcpInvocationDetailsContent({ ...log, outcome: "no-result" }, null);
        expect(html).toContain(">no-result</span>");
        expect(html).not.toContain("<strong>Outcome</strong>");
    });

    it("uses the requested correlation label and a shared summary typography class", () => {
        const html = getMcpInvocationDetailsContent(log, job);
        expect(html).toContain("<strong>Corelation Id</strong>");
        expect(html).not.toContain("Job / Correlation ID");
        expect(html).toContain('class="mcp-invocation-summary"');
    });
});
