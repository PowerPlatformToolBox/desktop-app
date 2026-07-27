import { randomUUID } from "crypto";

export type HeadlessJobStatus = "pending" | "in_progress" | "completed" | "failed";

export interface HeadlessJobRecord {
    jobId: string;
    toolId: string;
    toolName: string;
    status: HeadlessJobStatus;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    timeoutMs: number;
    progress?: {
        percent: number;
        message?: string;
    };
    result?: Record<string, unknown>;
    error?: string;
}

interface StartJobOptions {
    toolId: string;
    toolName: string;
    timeoutMs: number;
    execute: (jobId: string) => Promise<Record<string, unknown>>;
}

const DEFAULT_CLEANUP_TTL_MS = 60 * 60 * 1000;

export class HeadlessToolInvocationManager {
    private readonly jobs = new Map<string, HeadlessJobRecord>();
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(private readonly completedJobTtlMs = DEFAULT_CLEANUP_TTL_MS) {
        this.cleanupTimer = setInterval(() => this.cleanupExpiredJobs(), 60_000);
        this.cleanupTimer.unref();
    }

    public dispose(): void {
        clearInterval(this.cleanupTimer);
    }

    public async startJob(options: StartJobOptions): Promise<HeadlessJobRecord> {
        const nowIso = new Date().toISOString();
        const jobId = randomUUID();

        const initialRecord: HeadlessJobRecord = {
            jobId,
            toolId: options.toolId,
            toolName: options.toolName,
            status: "pending",
            createdAt: nowIso,
            timeoutMs: options.timeoutMs,
            progress: {
                percent: 0,
                message: "queued",
            },
        };

        this.jobs.set(jobId, initialRecord);

        void this.runJob(jobId, options.execute, options.timeoutMs);

        return { ...initialRecord };
    }

    public getJob(jobId: string): HeadlessJobRecord | null {
        const job = this.jobs.get(jobId);
        return job ? { ...job } : null;
    }

    public updateProgress(jobId: string, percent: number, message?: string): void {
        const job = this.jobs.get(jobId);
        if (!job || (job.status !== "pending" && job.status !== "in_progress")) {
            return;
        }

        const clamped = Math.max(0, Math.min(100, Math.floor(percent)));
        job.progress = {
            percent: clamped,
            ...(message ? { message } : {}),
        };
        this.jobs.set(jobId, job);
    }

    private async runJob(jobId: string, execute: (jobId: string) => Promise<Record<string, unknown>>, timeoutMs: number): Promise<void> {
        const existing = this.jobs.get(jobId);
        if (!existing) {
            return;
        }

        existing.status = "in_progress";
        existing.startedAt = new Date().toISOString();
        existing.progress = {
            percent: 5,
            message: "running",
        };
        this.jobs.set(jobId, existing);

        try {
            const result = await this.withTimeout(execute(jobId), timeoutMs);
            const completed = this.jobs.get(jobId);
            if (!completed) {
                return;
            }

            completed.status = "completed";
            completed.completedAt = new Date().toISOString();
            completed.progress = {
                percent: 100,
                message: "completed",
            };
            completed.result = result;
            this.jobs.set(jobId, completed);
        } catch (error) {
            const failed = this.jobs.get(jobId);
            if (!failed) {
                return;
            }

            failed.status = "failed";
            failed.completedAt = new Date().toISOString();
            failed.progress = {
                percent: failed.progress?.percent ?? 0,
                message: "failed",
            };
            failed.error = error instanceof Error ? error.message : String(error);
            this.jobs.set(jobId, failed);
        }
    }

    private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        let timeoutHandle: NodeJS.Timeout | undefined;

        const timeoutPromise = new Promise<T>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                timeoutHandle = undefined;
                reject(new Error(`Headless execution timed out after ${timeoutMs} ms`));
            }, timeoutMs);
        });

        return Promise.race([
            promise.then(
                (value) => {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    return value;
                },
                (error) => {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    throw error;
                },
            ),
            timeoutPromise,
        ]);
    }

    private cleanupExpiredJobs(): void {
        const now = Date.now();

        for (const [jobId, job] of this.jobs.entries()) {
            if ((job.status === "completed" || job.status === "failed") && job.completedAt) {
                const completedAt = new Date(job.completedAt).getTime();
                if (now - completedAt > this.completedJobTtlMs) {
                    this.jobs.delete(jobId);
                }
            }
        }
    }
}
