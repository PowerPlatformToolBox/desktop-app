import type { WebContents } from "electron";
import { WORKER_CHANNELS } from "../../common/ipc/channels";
import type { WorkerProcessHandle, WorkerProcessSnapshot, WorkerProcessStart, WorkerRpcMessage } from "../../common/types/workerProcess";
import type { WorkerToolEvent, WorkerToolIpcResult } from "../../common/types/workerToolApi";

interface WorkerBrokerApi {
    start(sender: WebContents, workerId: string): WorkerProcessStart;
    send(sender: WebContents, handle: WorkerProcessHandle, message: unknown): Promise<void>;
    stop(sender: WebContents, handle: WorkerProcessHandle): Promise<void>;
    snapshot(sender: WebContents, handle: WorkerProcessHandle): WorkerProcessSnapshot;
    onMessage(sender: WebContents, handle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void): () => void;
    onTerminal(sender: WebContents, handle: WorkerProcessHandle, callback: () => void): () => void;
}

interface WorkerIpcEvent {
    readonly sender: WebContents;
}

interface WorkerIpcMain {
    handle(channel: string, listener: (event: WorkerIpcEvent, ...args: unknown[]) => unknown): void;
}

interface Subscription {
    readonly sender: WebContents;
    removeMessage: () => void;
    removeTerminal: () => void;
}

function errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)) return error.code;
    return "WORKER_FAILED";
}

function success<Value>(value: Value): WorkerToolIpcResult<Value> {
    return { ok: true, value };
}

function failure(error: unknown): WorkerToolIpcResult<never> {
    return { ok: false, error: { code: errorCode(error) } };
}

export function registerWorkerToolIpcHandlers(ipcMain: WorkerIpcMain, broker: WorkerBrokerApi): void {
    const subscriptions = new Map<string, Subscription>();

    const publish = (sender: WebContents, event: WorkerToolEvent): void => {
        if (sender.isDestroyed()) return;
        try {
            sender.send(WORKER_CHANNELS.EVENT, event);
        } catch {
            return;
        }
    };

    const removeSubscription = (handle: string): void => {
        const subscription = subscriptions.get(handle);
        if (!subscription) return;
        subscriptions.delete(handle);
        subscription.removeMessage();
        subscription.removeTerminal();
    };

    ipcMain.handle(WORKER_CHANNELS.START, async (event, workerId) => {
        if (typeof workerId !== "string" || workerId.length === 0 || workerId.length > 128) return failure({ code: "INVALID_WORKER_ID" });
        let started: WorkerProcessStart | undefined;
        try {
            started = broker.start(event.sender, workerId);
            void started.ready.catch(() => undefined);
            const handle = started.handle;
            const subscription: Subscription = { sender: event.sender, removeMessage: () => undefined, removeTerminal: () => undefined };
            subscriptions.set(handle, subscription);
            try {
                subscription.removeMessage = broker.onMessage(event.sender, handle, (message) => publish(event.sender, { handle, type: "message", message }));
                subscription.removeTerminal = broker.onTerminal(event.sender, handle, () => {
                    try {
                        publish(event.sender, { handle, type: "terminal", snapshot: broker.snapshot(event.sender, handle) });
                    } finally {
                        removeSubscription(handle);
                    }
                });
            } catch (error) {
                removeSubscription(handle);
                throw error;
            }
            void started.ready.then(
                () => publish(event.sender, { handle, type: "ready" }),
                (error: unknown) => publish(event.sender, { handle, type: "ready", error: { code: errorCode(error) } }),
            );
            return success({ handle });
        } catch (error) {
            if (started) {
                removeSubscription(started.handle);
                await broker.stop(event.sender, started.handle).catch(() => undefined);
            }
            return failure(error);
        }
    });

    ipcMain.handle(WORKER_CHANNELS.SEND, async (event, handle, message) => {
        if (typeof handle !== "string" || handle.length === 0 || handle.length > 128) return failure({ code: "INVALID_HANDLE" });
        try {
            await broker.send(event.sender, handle as WorkerProcessHandle, message);
            return success(undefined);
        } catch (error) {
            return failure(error);
        }
    });

    ipcMain.handle(WORKER_CHANNELS.STOP, async (event, handle) => {
        if (typeof handle !== "string" || handle.length === 0 || handle.length > 128) return failure({ code: "INVALID_HANDLE" });
        try {
            await broker.stop(event.sender, handle as WorkerProcessHandle);
            removeSubscription(handle);
            return success(undefined);
        } catch (error) {
            return failure(error);
        }
    });
}
