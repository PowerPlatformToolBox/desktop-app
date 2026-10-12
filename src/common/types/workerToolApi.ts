import type { WorkerProcessHandle, WorkerProcessSnapshot, WorkerRpcMessage } from "./workerProcess";

export type WorkerToolEvent =
    | { readonly handle: string; readonly type: "ready"; readonly error?: { readonly code: string } }
    | { readonly handle: string; readonly type: "message"; readonly message: WorkerRpcMessage }
    | { readonly handle: string; readonly type: "terminal"; readonly snapshot: WorkerProcessSnapshot };

export type WorkerToolIpcResult<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: { readonly code: string } };

export interface WorkerToolStart {
    readonly handle: WorkerProcessHandle;
    readonly ready: Promise<void>;
}

export interface WorkerRequestContext {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(callback: () => void): { dispose(): void };
}

export interface WorkerSessionOptions {
    readonly requests?: Readonly<Record<string, (params: unknown, context: WorkerRequestContext) => unknown | Promise<unknown>>>;
    readonly notifications?: Readonly<Record<string, (params: unknown) => void>>;
    readonly onExit?: (snapshot: WorkerProcessSnapshot) => void;
}

export interface WorkerSession {
    readonly ready: Promise<void>;
    request<Result = unknown>(method: string, params?: unknown): Promise<Result>;
    notify(method: string, params?: unknown): Promise<void>;
    cancel(): void;
    stop(): Promise<void>;
    dispose(): Promise<void>;
}

export interface WorkerToolAPI {
    connect(workerId: string, options?: WorkerSessionOptions): Promise<WorkerSession>;
    start(workerId: string): Promise<WorkerToolStart>;
    send(handle: WorkerProcessHandle, message: WorkerRpcMessage): Promise<void>;
    onMessage(handle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void): () => void;
    onExit(handle: WorkerProcessHandle, callback: (snapshot: WorkerProcessSnapshot) => void): () => void;
    stop(handle: WorkerProcessHandle): Promise<void>;
    dispose(handle: WorkerProcessHandle): Promise<void>;
}

export interface WorkerToolApiTransport {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    subscribe(callback: (event: WorkerToolEvent) => void): () => void;
}
