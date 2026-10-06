export type WorkerProcessState = "starting" | "running" | "stopping" | "exited" | "failed";

export interface WorkerOwner {
    readonly toolId: string;
    readonly instanceId: string;
}

declare const workerHandleBrand: unique symbol;
export type WorkerProcessHandle = string & { readonly [workerHandleBrand]: true };

export type WorkerRpcId = string | number;
export type WorkerRpcMessage =
    | { jsonrpc: "2.0"; method: string; id?: WorkerRpcId; params?: unknown[] | Record<string, unknown> }
    | { jsonrpc: "2.0"; id: WorkerRpcId | null; result: unknown }
    | { jsonrpc: "2.0"; id: WorkerRpcId | null; error: { code: number; message: string; data?: unknown } };

export interface WorkerLaunchDescriptor {
    readonly executable: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
}

export interface WorkerProcessLimits {
    readonly maxFrameBytes: number;
    readonly maxHeaderBytes: number;
    readonly maxInboundCount: number;
    readonly maxInboundBytes: number;
    readonly maxPendingWrites: number;
    readonly maxPendingWriteBytes: number;
    readonly maxEarlyMessages: number;
    readonly maxEarlyBytes: number;
    readonly maxStderrBytes: number;
    readonly maxRecords: number;
    readonly startupTimeoutMs: number;
    readonly partialFrameTimeoutMs: number;
    readonly writeTimeoutMs: number;
    readonly stopTimeoutMs: number;
    readonly killTimeoutMs: number;
}

export interface WorkerProcessSnapshot {
    readonly state: WorkerProcessState;
    readonly failure?: string;
    readonly stderr: { readonly bytes: number; readonly truncated: boolean; readonly summary: "Worker stderr redacted" };
}

export interface WorkerProcessStart {
    readonly handle: WorkerProcessHandle;
    readonly ready: Promise<void>;
}
