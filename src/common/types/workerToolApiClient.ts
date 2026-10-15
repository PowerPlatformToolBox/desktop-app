import { CancellationTokenSource, type CancellationToken } from "vscode-jsonrpc/browser";
import { WORKER_CHANNELS } from "../ipc/channels";
import type { WorkerProcessHandle, WorkerProcessSnapshot, WorkerRpcMessage } from "./workerProcess";
import { createWorkerRpcConnection } from "./workerRpcConnection";
import type { WorkerRequestContext, WorkerSession, WorkerSessionOptions, WorkerToolAPI, WorkerToolApiTransport, WorkerToolEvent, WorkerToolIpcResult, WorkerToolStart } from "./workerToolApi";

const MAX_BUFFERED_EVENTS = 64;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const MAX_CALLBACKS_PER_EVENT = 64;

interface BufferedEvent {
    event: WorkerToolEvent;
    bytes: number;
}

interface WorkerHandleSession {
    handle: WorkerProcessHandle;
    resolveReady(): void;
    rejectReady(error: Error): void;
    readySettled: boolean;
    messages: Set<(message: WorkerRpcMessage) => void>;
    exits: Set<(snapshot: WorkerProcessSnapshot) => void>;
    queued: BufferedEvent[];
    terminal?: WorkerProcessSnapshot;
    overflowed?: boolean;
}

export class WorkerToolError extends Error {
    constructor(readonly code: string) {
        super(`Worker API: ${code}`);
        this.name = "WorkerToolError";
    }
}

function isCancellationToken(value: unknown): value is CancellationToken {
    if (!value || typeof value !== "object") return false;
    const token = value as Partial<CancellationToken>;
    return typeof token.isCancellationRequested === "boolean" && typeof token.onCancellationRequested === "function";
}

function readResult<Value>(value: unknown): Value {
    if (!value || typeof value !== "object" || !("ok" in value)) throw new WorkerToolError("INVALID_RESPONSE");
    const result = value as WorkerToolIpcResult<Value>;
    if (result.ok) return result.value;
    throw new WorkerToolError(typeof result.error?.code === "string" ? result.error.code : "WORKER_FAILED");
}

function eventSize(event: WorkerToolEvent): number {
    try {
        return JSON.stringify(event).length * 2;
    } catch {
        return MAX_BUFFERED_BYTES + 1;
    }
}

export function createWorkerToolAPI(transport: WorkerToolApiTransport): WorkerToolAPI {
    const sessions = new Map<string, WorkerHandleSession>();
    const pending = new Map<string, BufferedEvent[]>();
    const overflowedHandles = new Set<string>();
    let allHandlesOverflowed = false;
    let bufferedCount = 0;
    let bufferedBytes = 0;

    const release = (item: BufferedEvent): void => {
        bufferedCount -= 1;
        bufferedBytes -= item.bytes;
    };

    const queue = (handle: string, item: BufferedEvent): boolean => {
        if (bufferedCount >= MAX_BUFFERED_EVENTS || bufferedBytes + item.bytes > MAX_BUFFERED_BYTES) return false;
        bufferedCount += 1;
        bufferedBytes += item.bytes;
        const session = sessions.get(handle);
        if (session) session.queued.push(item);
        else pending.set(handle, [...(pending.get(handle) ?? []), item]);
        return true;
    };

    const notifyOverflow = (session: WorkerHandleSession): void => {
        if (session.overflowed) return;
        session.overflowed = true;
        for (const item of session.queued) release(item);
        session.queued.length = 0;
        for (const item of pending.get(session.handle) ?? []) release(item);
        pending.delete(session.handle);
        const error = new WorkerToolError("CLIENT_BUFFER_OVERFLOW");
        if (!session.readySettled) {
            session.readySettled = true;
            session.rejectReady(error);
        }
        const snapshot: WorkerProcessSnapshot = {
            state: "failed",
            failure: error.code,
            stderr: { bytes: 0, truncated: false, summary: "Worker stderr redacted" },
        };
        session.terminal = snapshot;
        for (const callback of [...session.exits]) {
            try {
                callback(snapshot);
            } catch {
                session.exits.delete(callback);
            }
        }
        void transport
            .invoke(WORKER_CHANNELS.STOP, session.handle)
            .then(readResult)
            .catch(() => undefined);
    };

    const dispatch = (session: WorkerHandleSession, event: WorkerToolEvent): void => {
        if (event.type === "ready") {
            if (session.readySettled) return;
            session.readySettled = true;
            if (event.error) session.rejectReady(new WorkerToolError(event.error.code));
            else session.resolveReady();
            return;
        }
        if (event.type === "message") {
            if (session.messages.size === 0) {
                if (!queue(session.handle, { event, bytes: eventSize(event) })) notifyOverflow(session);
                return;
            }
            for (const callback of [...session.messages]) {
                try {
                    callback(event.message);
                } catch {
                    session.messages.delete(callback);
                }
            }
            return;
        }
        session.terminal = event.snapshot;
        if (session.exits.size === 0) {
            if (!queue(session.handle, { event, bytes: eventSize(event) })) notifyOverflow(session);
            return;
        }
        for (const callback of [...session.exits]) {
            try {
                callback(event.snapshot);
            } catch {
                session.exits.delete(callback);
            }
        }
    };

    const receive = (event: WorkerToolEvent): void => {
        if (!event || typeof event.handle !== "string" || event.handle.length === 0 || (event.type !== "ready" && event.type !== "message" && event.type !== "terminal")) return;
        const session = sessions.get(event.handle);
        if (session) {
            dispatch(session, event);
            return;
        }
        if (!queue(event.handle, { event, bytes: eventSize(event) })) {
            const queued = pending.get(event.handle);
            for (const item of queued ?? []) release(item);
            pending.delete(event.handle);
            if (overflowedHandles.size < MAX_BUFFERED_EVENTS) overflowedHandles.add(event.handle);
            else allHandlesOverflowed = true;
        }
    };

    transport.subscribe(receive);

    const flush = (session: WorkerHandleSession): void => {
        const queued = session.queued.splice(0);
        for (let index = 0; index < queued.length; index += 1) {
            const item = queued[index];
            release(item);
            if (session.overflowed) {
                for (const remaining of queued.slice(index + 1)) release(remaining);
                return;
            }
            dispatch(session, item.event);
        }
    };

    const getSession = (handle: WorkerProcessHandle): WorkerHandleSession => {
        const session = sessions.get(handle);
        if (!session) throw new WorkerToolError("UNKNOWN_HANDLE");
        return session;
    };

    const clearSession = (handle: WorkerProcessHandle): void => {
        const session = sessions.get(handle);
        if (session) {
            for (const item of session.queued) release(item);
            session.queued.length = 0;
            sessions.delete(handle);
        }
        const waiting = pending.get(handle);
        for (const item of waiting ?? []) release(item);
        pending.delete(handle);
    };

    const api: WorkerToolAPI = {
        async connect(workerId: string, options: WorkerSessionOptions = {}): Promise<WorkerSession> {
            const started = await api.start(workerId);
            const rpc = createWorkerRpcConnection({
                send: (message) => api.send(started.handle, message as WorkerRpcMessage),
                onMessage: (listener) => api.onMessage(started.handle, listener as (message: WorkerRpcMessage) => void),
                onExit: (listener) => api.onExit(started.handle, listener),
            });

            const cancellations = new Set<CancellationTokenSource>();
            let closed = false;
            let removeExit = (): void => undefined;
            const close = (): void => {
                if (closed) return;
                closed = true;
                cancellations.forEach((source) => {
                    source.cancel();
                    source.dispose();
                });
                cancellations.clear();
                removeExit();
                rpc.dispose();
            };
            const normalizeParams = (args: unknown[]): { params: unknown; token?: CancellationToken } => {
                const last = args[args.length - 1];
                const token = isCancellationToken(last) ? last : undefined;
                const values = token ? args.slice(0, -1) : args;
                return { params: values.length === 0 ? undefined : values.length === 1 ? values[0] : values, token };
            };

            for (const [method, handler] of Object.entries(options.requests ?? {})) {
                rpc.connection.onRequest(method, (...args: unknown[]) => {
                    const { params, token } = normalizeParams(args);
                    const context: WorkerRequestContext = {
                        get isCancellationRequested() {
                            return token?.isCancellationRequested ?? false;
                        },
                        onCancellationRequested: (callback) => token?.onCancellationRequested(callback) ?? { dispose: () => undefined },
                    };
                    return handler(params, context);
                });
            }
            for (const [method, handler] of Object.entries(options.notifications ?? {})) {
                rpc.connection.onNotification(method, (...args: unknown[]) => {
                    const { params } = normalizeParams(args);
                    handler(params);
                });
            }

            rpc.listen();
            removeExit = api.onExit(started.handle, (snapshot) => {
                close();
                options.onExit?.(snapshot);
            });

            let stopOperation: Promise<void> | undefined;
            const session: WorkerSession = {
                ready: started.ready,
                request: async <Result = unknown>(method: string, params?: unknown): Promise<Result> => {
                    if (closed) throw new WorkerToolError("NOT_RUNNING");
                    const source = new CancellationTokenSource();
                    cancellations.add(source);
                    try {
                        const result = params === undefined ? await rpc.connection.sendRequest(method, source.token) : await rpc.connection.sendRequest(method, params, source.token);
                        return result as Result;
                    } finally {
                        cancellations.delete(source);
                        source.dispose();
                    }
                },
                notify: async (method, params): Promise<void> => {
                    if (closed) throw new WorkerToolError("NOT_RUNNING");
                    if (params === undefined) await rpc.connection.sendNotification(method);
                    else await rpc.connection.sendNotification(method, params);
                },
                cancel: () => cancellations.forEach((source) => source.cancel()),
                stop: () => {
                    if (stopOperation) return stopOperation;
                    const operation = (async () => {
                        session.cancel();
                        await api.stop(started.handle);
                        close();
                    })();
                    stopOperation = operation;
                    void operation.catch(() => {
                        if (stopOperation === operation) stopOperation = undefined;
                    });
                    return operation;
                },
                dispose: async () => session.stop(),
            };
            return session;
        },
        async start(workerId: string): Promise<WorkerToolStart> {
            const response = readResult<{ handle: string }>(await transport.invoke(WORKER_CHANNELS.START, workerId));
            if (typeof response.handle !== "string" || response.handle.length === 0 || response.handle.length > 128) throw new WorkerToolError("INVALID_HANDLE");
            const handle = response.handle as WorkerProcessHandle;
            let resolveReady!: () => void;
            let rejectReady!: (error: Error) => void;
            const ready = new Promise<void>((resolve, reject) => {
                resolveReady = resolve;
                rejectReady = reject;
            });
            const session: WorkerHandleSession = { handle, resolveReady, rejectReady, readySettled: false, messages: new Set(), exits: new Set(), queued: [] };
            sessions.set(handle, session);
            if (allHandlesOverflowed || overflowedHandles.delete(handle)) notifyOverflow(session);
            const waiting = pending.get(handle) ?? [];
            pending.delete(handle);
            for (const item of waiting) {
                release(item);
                dispatch(session, item.event);
            }
            if (session.terminal && !session.readySettled) {
                session.readySettled = true;
                session.rejectReady(new WorkerToolError("WORKER_EXITED_BEFORE_READY"));
            }
            return { handle, ready };
        },
        async send(handle, message): Promise<void> {
            readResult(await transport.invoke(WORKER_CHANNELS.SEND, handle, message));
        },
        onMessage(handle, callback): () => void {
            const session = getSession(handle);
            if (typeof callback !== "function") throw new WorkerToolError("INVALID_SUBSCRIBER");
            if (session.messages.size >= MAX_CALLBACKS_PER_EVENT) throw new WorkerToolError("SUBSCRIBER_LIMIT");
            session.messages.add(callback);
            flush(session);
            return () => session.messages.delete(callback);
        },
        onExit(handle, callback): () => void {
            const session = getSession(handle);
            if (typeof callback !== "function") throw new WorkerToolError("INVALID_SUBSCRIBER");
            if (session.terminal) {
                const retained = session.queued.filter((item) => item.event.type === "terminal");
                session.queued = session.queued.filter((item) => item.event.type !== "terminal");
                for (const item of retained) release(item);
                try {
                    callback(session.terminal);
                } catch {
                    return () => undefined;
                }
                return () => undefined;
            }
            if (session.exits.size >= MAX_CALLBACKS_PER_EVENT) throw new WorkerToolError("SUBSCRIBER_LIMIT");
            session.exits.add(callback);
            flush(session);
            return () => session.exits.delete(callback);
        },
        async stop(handle): Promise<void> {
            const session = getSession(handle);
            if (session.terminal) {
                clearSession(handle);
                return;
            }
            readResult(await transport.invoke(WORKER_CHANNELS.STOP, handle));
            clearSession(handle);
        },
        async dispose(handle): Promise<void> {
            await api.stop(handle);
        },
    };

    return api;
}
