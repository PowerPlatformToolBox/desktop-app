import type { WebContents } from "electron";
import { WORKER_CHANNELS } from "../../../src/common/ipc/channels";
import type { WorkerProcessHandle, WorkerProcessSnapshot, WorkerRpcMessage } from "../../../src/common/types/workerProcess";
import type { WorkerToolEvent, WorkerToolIpcResult } from "../../../src/common/types/workerToolApi";
import { createWorkerToolAPI } from "../../../src/common/types/workerToolApiClient";
import { registerWorkerToolIpcHandlers } from "../../../src/main/utilities/workerToolIpc";

const handle = "worker-handle-1" as WorkerProcessHandle;
const readySnapshot: WorkerProcessSnapshot = {
    state: "exited",
    stderr: { bytes: 12, truncated: false, summary: "Worker stderr redacted" },
};

function ok<Value>(value: Value): WorkerToolIpcResult<Value> {
    return { ok: true, value };
}

describe("public worker tool API", () => {
    it("connects a session, handles a reverse request, reports progress, and stops by itself", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        let queryId: string | number | undefined;
        const sent: WorkerRpcMessage[] = [];
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel, ...args) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "ready" });
                    return ok({ handle });
                }
                if (channel === WORKER_CHANNELS.SEND) {
                    const message = args[1] as WorkerRpcMessage;
                    sent.push(message);
                    if ("method" in message && message.method === "query") {
                        queryId = message.id;
                        receive({ handle, type: "message", message: { jsonrpc: "2.0", method: "progress", params: ["fetching"] } });
                        receive({ handle, type: "message", message: { jsonrpc: "2.0", id: "reverse", method: "dataverse/fetchXml", params: ["<fetch />"] } });
                    } else if ("id" in message && message.id === "reverse" && "result" in message) {
                        receive({
                            handle,
                            type: "message",
                            message: { jsonrpc: "2.0", id: queryId!, result: { rowCount: (message.result as { value: unknown[] }).value.length } },
                        });
                    }
                    return ok(undefined);
                }
                if (channel === WORKER_CHANNELS.STOP) return ok(undefined);
                throw new Error(`Unexpected worker channel: ${channel}`);
            },
        });

        const progress: string[] = [];
        const session = await api.connect("engine", {
            requests: {
                "dataverse/fetchXml": async (params) => {
                    expect(params).toBe("<fetch />");
                    return { value: [{ id: "one" }, { id: "two" }] };
                },
            },
            notifications: { progress: (params) => progress.push(params as string) },
        });
        await session.ready;
        await expect(session.request("query", "<fetch />")).resolves.toEqual({ rowCount: 2 });
        expect(progress).toEqual(["fetching"]);
        await session.stop();
        expect(sent.some((message) => "method" in message && message.method === "platform/initialize")).toBe(false);
        await expect(session.request("query", "<fetch />")).rejects.toMatchObject({ code: "NOT_RUNNING" });
    });

    it("cancels in-flight session requests without exposing JSON-RPC cancellation plumbing", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        let queryId: string | number | undefined;
        const sent: WorkerRpcMessage[] = [];
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel, ...args) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "ready" });
                    return ok({ handle });
                }
                if (channel === WORKER_CHANNELS.SEND) {
                    const message = args[1] as WorkerRpcMessage;
                    sent.push(message);
                    if ("method" in message && message.method === "query") queryId = message.id;
                    if ("method" in message && message.method === "$/cancelRequest") {
                        receive({ handle, type: "message", message: { jsonrpc: "2.0", id: queryId!, error: { code: -32800, message: "Cancelled" } } });
                    }
                    return ok(undefined);
                }
                if (channel === WORKER_CHANNELS.STOP) return ok(undefined);
                throw new Error(`Unexpected worker channel: ${channel}`);
            },
        });
        const session = await api.connect("engine");
        await session.ready;
        const pending = session.request("query", "large fetch");
        const rejected = expect(pending).rejects.toThrow("Cancelled");
        await Promise.resolve();
        session.cancel();
        await rejected;
        expect(sent.some((message) => "method" in message && message.method === "$/cancelRequest")).toBe(true);
        await session.stop();
    });

    it("keeps reverse-request cancellation context live while a tool callback awaits", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        let queryId: string | number | undefined;
        let callbackStarted!: () => void;
        const startedCallback = new Promise<void>((resolve) => {
            callbackStarted = resolve;
        });
        let callbackSawCancellation = false;
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel, ...args) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "ready" });
                    return ok({ handle });
                }
                if (channel === WORKER_CHANNELS.SEND) {
                    const message = args[1] as WorkerRpcMessage;
                    if ("method" in message && message.method === "query") {
                        queryId = message.id;
                        receive({ handle, type: "message", message: { jsonrpc: "2.0", id: "reverse", method: "dataverse/slow", params: [] } });
                    } else if ("id" in message && message.id === "reverse" && "error" in message) {
                        receive({ handle, type: "message", message: { jsonrpc: "2.0", id: queryId!, error: { code: -32800, message: "Reverse call cancelled" } } });
                    }
                    return ok(undefined);
                }
                if (channel === WORKER_CHANNELS.STOP) return ok(undefined);
                throw new Error(`Unexpected worker channel: ${channel}`);
            },
        });
        const session = await api.connect("engine", {
            requests: {
                "dataverse/slow": async (_params, context) =>
                    new Promise((_resolve, reject) => {
                        callbackStarted();
                        context.onCancellationRequested(() => {
                            callbackSawCancellation = context.isCancellationRequested;
                            reject(new Error("Reverse call cancelled"));
                        });
                    }),
            },
        });
        await session.ready;
        const pending = session.request("query");
        const rejected = expect(pending).rejects.toThrow("Reverse call cancelled");
        await startedCallback;
        receive({ handle, type: "message", message: { jsonrpc: "2.0", method: "$/cancelRequest", params: { id: "reverse" } } });
        await rejected;
        expect(callbackSawCancellation).toBe(true);
        await session.stop();
    });

    it("captures ready and early messages before start returns, then delivers messages to tool listeners", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        const message: WorkerRpcMessage = { jsonrpc: "2.0", method: "worker/ready" };
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "ready" });
                    receive({ handle, type: "message", message });
                    return ok({ handle });
                }
                return ok(undefined);
            },
        });

        const started = await api.start("engine");
        await expect(started.ready).resolves.toBeUndefined();
        const received: WorkerRpcMessage[] = [];
        const unsubscribe = api.onMessage(started.handle, (item) => received.push(item));

        expect(received).toEqual([message]);
        unsubscribe();
        receive({ handle, type: "message", message: { jsonrpc: "2.0", method: "after/unsubscribe" } });
        expect(received).toEqual([message]);
        await api.dispose(started.handle);
        expect(() => api.onMessage(started.handle, () => undefined)).toThrow("UNKNOWN_HANDLE");
    });

    it("rejects readiness and stops the handle if pre-start buffering exceeds its bound", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        const invoke = jest.fn(async (channel: string) => {
            if (channel === WORKER_CHANNELS.START) {
                for (let index = 0; index < 65; index += 1) receive({ handle, type: "message", message: { jsonrpc: "2.0", method: `early/${index}` } });
                return ok({ handle });
            }
            return ok(undefined);
        });
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke,
        });

        const started = await api.start("engine");
        await expect(started.ready).rejects.toMatchObject({ code: "CLIENT_BUFFER_OVERFLOW" });
        await Promise.resolve();
        expect(invoke).toHaveBeenCalledWith(WORKER_CHANNELS.STOP, handle);
    });

    it("delivers terminal snapshots and startup errors without exposing stderr text", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "terminal", snapshot: readySnapshot });
                    receive({ handle, type: "ready", error: { code: "STARTUP_FAILED" } });
                    return ok({ handle });
                }
                return ok(undefined);
            },
        });

        const started = await api.start("engine");
        await expect(started.ready).rejects.toMatchObject({ code: "STARTUP_FAILED" });
        const exits: WorkerProcessSnapshot[] = [];
        api.onExit(started.handle, (snapshot) => exits.push(snapshot));
        expect(exits).toEqual([readySnapshot]);
        expect(JSON.stringify(exits)).not.toContain("stderr text");
        await api.stop(started.handle);
    });

    it("isolates throwing subscribers while draining messages and terminal events", async () => {
        let receive!: (event: WorkerToolEvent) => void;
        const api = createWorkerToolAPI({
            subscribe: (callback) => {
                receive = callback;
                return () => undefined;
            },
            invoke: async (channel) => {
                if (channel === WORKER_CHANNELS.START) {
                    receive({ handle, type: "message", message: { jsonrpc: "2.0", method: "queued" } });
                    return ok({ handle });
                }
                return ok(undefined);
            },
        });

        const started = await api.start("engine");
        const messages: string[] = [];
        api.onMessage(started.handle, () => {
            throw new Error("consumer callback failure");
        });
        api.onMessage(started.handle, (message) => messages.push("method" in message ? message.method : "response"));
        expect(messages).toEqual([]);
        receive({ handle, type: "message", message: { jsonrpc: "2.0", method: "live" } });
        expect(messages).toEqual(["live"]);

        const exits: string[] = [];
        api.onExit(started.handle, () => {
            throw new Error("consumer callback failure");
        });
        api.onExit(started.handle, (snapshot) => exits.push(snapshot.state));
        receive({ handle, type: "terminal", snapshot: readySnapshot });
        expect(exits).toEqual(["exited"]);
    });

    it("binds every broker operation to the Electron sender and returns only stable error codes", async () => {
        const registered = new Map<string, (event: { sender: WebContents }, ...args: unknown[]) => unknown>();
        const sender = {
            isDestroyed: () => false,
            send: jest.fn(),
        } as unknown as WebContents;
        const foreignSender = { ...sender } as WebContents;
        const receivedMessage: WorkerRpcMessage = { jsonrpc: "2.0", method: "worker/run", params: { value: 1 } };
        let messageListener: ((message: WorkerRpcMessage) => void) | undefined;
        let terminalListener: (() => void) | undefined;
        const broker = {
            start: jest.fn((actualSender: WebContents) => {
                if (actualSender !== sender) throw Object.assign(new Error("details must not escape"), { code: "NOT_AUTHORIZED" });
                return { handle, ready: Promise.resolve() };
            }),
            onMessage: jest.fn((_actualSender: WebContents, _actualHandle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void) => {
                messageListener = callback;
                return () => undefined;
            }),
            onTerminal: jest.fn((_actualSender: WebContents, _actualHandle: WorkerProcessHandle, callback: () => void) => {
                terminalListener = callback;
                return () => undefined;
            }),
            snapshot: jest.fn(() => readySnapshot),
            send: jest.fn(async (actualSender: WebContents, actualHandle: WorkerProcessHandle, actualMessage: unknown) => {
                if (actualSender !== sender || actualHandle !== handle || actualMessage !== receivedMessage) throw Object.assign(new Error("denied"), { code: "NOT_AUTHORIZED" });
            }),
            stop: jest.fn(async (actualSender: WebContents) => {
                if (actualSender !== sender) throw Object.assign(new Error("denied"), { code: "NOT_AUTHORIZED" });
            }),
        };
        registerWorkerToolIpcHandlers({ handle: (channel, listener) => registered.set(channel, listener) }, broker);
        const start = registered.get(WORKER_CHANNELS.START)!;
        const send = registered.get(WORKER_CHANNELS.SEND)!;
        const stop = registered.get(WORKER_CHANNELS.STOP)!;

        const denied = (await start({ sender: foreignSender }, "engine")) as WorkerToolIpcResult<unknown>;
        expect(denied).toEqual({ ok: false, error: { code: "NOT_AUTHORIZED" } });
        expect(JSON.stringify(denied)).not.toContain("details must not escape");

        const started = (await start({ sender }, "engine")) as WorkerToolIpcResult<{ handle: string }>;
        expect(started).toEqual(ok({ handle }));
        await Promise.resolve();
        expect(sender.send).toHaveBeenCalledWith(WORKER_CHANNELS.EVENT, { handle, type: "ready" });
        expect(broker.onMessage).toHaveBeenCalledWith(sender, handle, expect.any(Function));
        expect(broker.onTerminal).toHaveBeenCalledWith(sender, handle, expect.any(Function));
        expect(messageListener).toBeDefined();
        messageListener!(receivedMessage);
        expect(sender.send).toHaveBeenCalledWith(WORKER_CHANNELS.EVENT, { handle, type: "message", message: receivedMessage });
        expect(terminalListener).toBeDefined();
        terminalListener!();
        expect(sender.send).toHaveBeenCalledWith(WORKER_CHANNELS.EVENT, { handle, type: "terminal", snapshot: readySnapshot });

        expect(await send({ sender }, handle, receivedMessage)).toEqual(ok(undefined));
        expect(broker.send).toHaveBeenCalledWith(sender, handle, receivedMessage);
        expect(await stop({ sender }, handle)).toEqual(ok(undefined));
        expect(broker.stop).toHaveBeenCalledWith(sender, handle);
    });
});
