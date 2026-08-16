/// <reference types="jest" />

import { HeadlessToolInvocationManager } from "../../../../src/main/managers/headlessToolInvocationManager";

describe("HeadlessToolInvocationManager", () => {
    it("returns pending or running jobs until they complete", async () => {
        const manager = new HeadlessToolInvocationManager();
        let finishJob: ((result: Record<string, unknown>) => void) | undefined;
        const execution = new Promise<Record<string, unknown>>((resolve) => {
            finishJob = resolve;
        });

        const job = await manager.startJob({
            toolId: "sample-tool",
            toolName: "Sample Tool",
            timeoutMs: 1_000,
            execute: () => execution,
        });

        expect(manager.getActiveJobs()).toEqual([expect.objectContaining({ jobId: job.jobId, status: "in_progress" })]);

        finishJob?.({ success: true });
        await execution;
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(manager.getActiveJobs()).toEqual([]);
        manager.dispose();
    });
});
