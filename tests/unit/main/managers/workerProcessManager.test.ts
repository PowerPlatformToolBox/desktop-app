/// <reference types="jest" />

import { EventEmitter } from "events";
import { PassThrough, Writable } from "stream";
import type { WorkerLaunchDescriptor, WorkerOwner, WorkerProcessHandle, WorkerRpcMessage } from "../../../../src/common/types/workerProcess";
import { validateWorkerLaunchDescriptor, WorkerProcessManager, type WorkerChild, type WorkerLaunchOptions, type WorkerProcessDependencies } from "../../../../src/main/managers/workerProcessManager";
import { immutableWorkerMessage } from "../../../../src/main/utilities/workerStdio";

const owner: WorkerOwner = { toolId: "tool-a", instanceId: "instance-a" };
const stranger: WorkerOwner = { toolId: "tool-a", instanceId: "instance-b" };
const descriptor: WorkerLaunchDescriptor = { executable: "/trusted/dotnet", args: ["/prepared/worker.dll"], cwd: "/prepared", env: { DOTNET_ROOT: "/trusted", DOTNET_ROLL_FORWARD: "Major" } };
const notification = (index: number): WorkerRpcMessage => ({ jsonrpc: "2.0", method: "progress", params: { index } });

function frame(message: unknown): Buffer {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

async function flush(): Promise<void> {
    for (let index = 0; index < 8; index++) await new Promise<void>((resolve) => setImmediate(resolve));
}

class FakeInput extends Writable {
    readonly chunks: Buffer[] = [];
    blocked = false;
    private readonly callbacks: ((error?: Error | null) => void)[] = [];

    constructor() {
        super({ highWaterMark: 1 });
    }

    _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.chunks.push(Buffer.from(chunk));
        if (this.blocked) this.callbacks.push(callback);
        else callback();
    }

    release(error?: Error): void {
        this.blocked = false;
        for (const callback of this.callbacks.splice(0)) callback(error);
    }

    messages(): WorkerRpcMessage[] {
        const bytes = Buffer.concat(this.chunks);
        const messages: WorkerRpcMessage[] = [];
        let offset = 0;
        while (offset < bytes.length) {
            const boundary = bytes.indexOf("\r\n\r\n", offset);
            if (boundary < 0) break;
            const length = Number(
                bytes
                    .subarray(offset, boundary)
                    .toString()
                    .match(/^Content-Length: ([0-9]+)$/i)?.[1],
            );
            if (!Number.isSafeInteger(length) || boundary + 4 + length > bytes.length) break;
            messages.push(JSON.parse(bytes.subarray(boundary + 4, boundary + 4 + length).toString("utf8")) as WorkerRpcMessage);
            offset = boundary + 4 + length;
        }
        return messages;
    }
}

class FakeChild extends EventEmitter implements WorkerChild {
    pid = 12001;
    readonly stdin = new FakeInput();
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();

    exit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
        this.emit("exit", code, signal);
    }
}

const managers: WorkerProcessManager[] = [];

function harness(overrides: Partial<WorkerProcessDependencies> = {}) {
    const child = new FakeChild();
    const prepare = jest.fn(async (_owner: WorkerOwner, _workerId: string, _signal: AbortSignal) => descriptor);
    const launch = jest.fn((_descriptor: WorkerLaunchDescriptor, _options: WorkerLaunchOptions) => child);
    const killTree = jest.fn(async () => {
        child.exit(null, "SIGKILL");
    });
    const manager = new WorkerProcessManager({
        prepare,
        launch,
        killTree,
        platform: "linux",
        ...overrides,
        limits: { startupTimeoutMs: 100, partialFrameTimeoutMs: 50, writeTimeoutMs: 100, stopTimeoutMs: 20, killTimeoutMs: 20, ...overrides.limits },
    });
    managers.push(manager);
    return { manager, child, prepare, launch, killTree };
}

async function initialize(setup: ReturnType<typeof harness>, ownerInput = owner, workerId = "engine") {
    const started = setup.manager.start(ownerInput, workerId);
    await flush();
    const request = setup.child.stdin.messages()[0];
    if (!request || !("id" in request)) throw new Error("Missing initialize request");
    setup.child.stdout.write(frame({ jsonrpc: "2.0", id: request.id, result: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } }));
    await flush();
    await started.ready;
    return started;
}

beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick", "setImmediate", "clearImmediate"] });
});
afterEach(async () => {
    const cleanup = managers.splice(0).flatMap((manager) => [manager.disposeOwner(owner), manager.disposeOwner(stranger), manager.disposeOwner({ toolId: "tool-b", instanceId: "instance-a" })]);
    await jest.advanceTimersByTimeAsync(300);
    await Promise.all(cleanup);
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe("worker launch and startup", () => {
    it("launches only the injected prepared descriptor with frozen minimal options", async () => {
        const setup = harness();
        const started = await initialize(setup);
        expect(setup.prepare).toHaveBeenCalledWith(owner, "engine", expect.any(AbortSignal));
        const [prepared, options] = setup.launch.mock.calls[0] as unknown as [WorkerLaunchDescriptor, Record<string, unknown>];
        expect(prepared.executable).toBe(descriptor.executable);
        expect(Object.isFrozen(prepared)).toBe(true);
        expect(Object.isFrozen(prepared.args)).toBe(true);
        expect(Object.isFrozen(prepared.env)).toBe(true);
        expect(options).toMatchObject({ shell: false, stdio: ["pipe", "pipe", "pipe"], detached: true, windowsHide: true, cwd: "/prepared" });
        expect(prepared.env).not.toHaveProperty("PATH");
        expect(prepared.env).not.toHaveProperty("HOME");
        expect(prepared.env).not.toHaveProperty("ACCESS_TOKEN");
        expect(setup.child.stdin.messages()[0]).toMatchObject({ method: "platform/initialize", params: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } });
        expect(started.handle).toMatch(/^[a-f0-9-]{36}$/);
        expect(JSON.stringify(setup.manager.snapshot(owner, started.handle))).not.toContain("/trusted");
    });

    it("reserves the worker before asynchronous preparation and separates instances", async () => {
        let finish!: (value: WorkerLaunchDescriptor) => void;
        const setup = harness({
            prepare: () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        });
        const first = setup.manager.start(owner, "engine");
        expect(() => setup.manager.start(owner, "engine")).toThrow("ALREADY_STARTED");
        const second = setup.manager.start(stranger, "engine");
        expect(second.handle).not.toBe(first.handle);
        expect(setup.manager.snapshot(owner, first.handle).state).toBe("starting");
        await setup.manager.stop(owner, first.handle);
        finish(descriptor);
        await flush();
        expect(setup.launch).toHaveBeenCalledTimes(1);
        await expect(first.ready).rejects.toThrow("WORKER_STOPPED");
    });

    it("copies the descriptor, owner and argument array before launch", async () => {
        const mutableOwner = { ...owner };
        const mutable = { ...descriptor, args: [...descriptor.args], env: { ...descriptor.env } };
        const setup = harness({ prepare: async () => mutable });
        const started = await initialize(setup, mutableOwner);
        mutable.args[0] = "/changed.dll";
        mutable.env.DOTNET_ROOT = "/changed";
        mutableOwner.instanceId = "changed";
        const launched = setup.launch.mock.calls[0] as unknown as [WorkerLaunchDescriptor];
        expect(launched[0].args).toEqual(["/prepared/worker.dll"]);
        expect(launched[0].env.DOTNET_ROOT).toBe("/trusted");
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("running");
    });

    it.each([
        ["relative executable", { ...descriptor, executable: "dotnet" }],
        ["relative cwd", { ...descriptor, cwd: "prepared" }],
        ["control argument", { ...descriptor, args: ["one\ntwo"] }],
        ["too many args", { ...descriptor, args: Array(65).fill("arg") }],
        ["startup hook", { ...descriptor, env: { DOTNET_STARTUP_HOOKS: "/evil" } }],
        ["token", { ...descriptor, env: { ACCESS_TOKEN: "secret" } }],
        ["PATH", { ...descriptor, env: { PATH: "/evil" } }],
        ["unknown field", { ...descriptor, shell: true }],
        ["wrong fixed value", { ...descriptor, env: { DOTNET_CLI_TELEMETRY_OPTOUT: "0" } }],
        ["invalid roll forward", { ...descriptor, env: { DOTNET_ROLL_FORWARD: "Latest" } }],
    ])("rejects %s without launching", async (_label, input) => {
        const setup = harness({ prepare: async () => input });
        const started = setup.manager.start(owner, "engine");
        await expect(started.ready).rejects.toThrow("STARTUP_FAILED");
        expect(setup.launch).not.toHaveBeenCalled();
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
    });

    it("rejects accessors and inherited descriptor fields", () => {
        expect(() => validateWorkerLaunchDescriptor(Object.create(descriptor) as WorkerLaunchDescriptor, "linux")).toThrow("INVALID_DESCRIPTOR");
        expect(() =>
            validateWorkerLaunchDescriptor(
                {
                    ...descriptor,
                    get executable() {
                        return "/trusted/dotnet";
                    },
                },
                "linux",
            ),
        ).toThrow("INVALID_DESCRIPTOR");
    });

    it.each(["constructor", "__proto__", "../engine", "engine.cmd", "", "1engine"])("rejects undeclarable identifier %s", (workerId) => {
        expect(() => harness().manager.start(owner, workerId)).toThrow("INVALID_WORKER_ID");
    });

    it("bounds live records and validates limit overrides", () => {
        expect(() => new WorkerProcessManager({ prepare: async () => descriptor, limits: { maxFrameBytes: Infinity } })).toThrow("INVALID_LIMITS");
        expect(() => new WorkerProcessManager({ prepare: async () => descriptor, limits: { maxRecords: 0 } })).toThrow("INVALID_LIMITS");
        const setup = harness({ limits: { maxRecords: 1 } });
        setup.manager.start(owner, "engine");
        expect(() => setup.manager.start(owner, "other")).toThrow("WORKER_LIMIT");
    });

    it.each([
        { protocol: "other", protocolVersion: 1 },
        { protocol: "jsonrpc-stdio-v1", protocolVersion: 2 },
        { protocol: "jsonrpc-stdio-v1" },
        { protocol: "jsonrpc-stdio-v1", protocolVersion: 1, extra: true },
        null,
    ])("rejects incompatible ready result %j", async (result) => {
        const setup = harness();
        const started = setup.manager.start(owner, "engine");
        await flush();
        const request = setup.child.stdin.messages()[0];
        setup.child.stdout.write(frame({ jsonrpc: "2.0", id: "id" in request ? request.id : undefined, result }));
        await expect(started.ready).rejects.toThrow("READY_MISMATCH");
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
    });

    it("rejects startup error responses", async () => {
        const setup = harness();
        const started = setup.manager.start(owner, "engine");
        await flush();
        const request = setup.child.stdin.messages()[0];
        setup.child.stdout.write(frame({ jsonrpc: "2.0", id: "id" in request ? request.id : undefined, error: { code: -32601, message: "unsupported" } }));
        await expect(started.ready).rejects.toThrow("READY_MISMATCH");
    });

    it("times out preparation and never launches a late descriptor", async () => {
        let finish!: (value: WorkerLaunchDescriptor) => void;
        let signal!: AbortSignal;
        const setup = harness({
            prepare: (_owner, _worker, inputSignal) => {
                signal = inputSignal;
                return new Promise((resolve) => {
                    finish = resolve;
                });
            },
        });
        const started = setup.manager.start(owner, "engine");
        await jest.advanceTimersByTimeAsync(100);
        await expect(started.ready).rejects.toThrow("STARTUP_TIMEOUT");
        expect(signal.aborted).toBe(true);
        finish(descriptor);
        await flush();
        expect(setup.launch).not.toHaveBeenCalled();
    });

    it("times out a launched worker that never responds", async () => {
        const setup = harness();
        const started = setup.manager.start(owner, "engine");
        await flush();
        await jest.advanceTimersByTimeAsync(120);
        await expect(started.ready).rejects.toThrow("STARTUP_TIMEOUT");
        expect(setup.killTree).toHaveBeenCalledWith(12001, "linux");
    });

    it.each(["prepare", "launch", "process", "exit", "stdin", "stdout", "stderr"])("handles startup %s failure", async (source) => {
        const setup = harness({
            ...(source === "prepare"
                ? {
                      prepare: async () => {
                          throw new Error("secret");
                      },
                  }
                : {}),
            ...(source === "launch"
                ? {
                      launch: () => {
                          throw new Error("secret");
                      },
                  }
                : {}),
        });
        const started = setup.manager.start(owner, "engine");
        await flush();
        if (source === "process") setup.child.emit("error", new Error("secret"));
        if (source === "exit") setup.child.exit(0);
        if (["stdin", "stdout", "stderr"].includes(source)) setup.child[source as "stdin" | "stdout" | "stderr"].emit("error", new Error("secret"));
        await expect(started.ready).rejects.toThrow("Worker transport:");
        expect(JSON.stringify(setup.manager.snapshot(owner, started.handle))).not.toContain("secret");
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
    });
});

describe("owner-scoped routing and subscribers", () => {
    it.each(["starting", "running", "stopping", "exited", "failed"])("authorizes every handle operation in %s", async (state) => {
        const setup = harness();
        const started = state === "starting" ? setup.manager.start(owner, "engine") : await initialize(setup);
        if (state === "stopping") void setup.manager.stop(owner, started.handle);
        if (state === "exited") setup.child.exit(0);
        if (state === "failed") setup.child.emit("error", new Error("failure"));
        expect(setup.manager.snapshot(owner, started.handle).state).toBe(state);
        for (const invalidOwner of [stranger, { toolId: "tool-b", instanceId: owner.instanceId }]) {
            expect(() => setup.manager.snapshot(invalidOwner, started.handle)).toThrow("NOT_AUTHORIZED");
            expect(() => setup.manager.send(invalidOwner, started.handle, notification(1))).toThrow("NOT_AUTHORIZED");
            expect(() => setup.manager.onMessage(invalidOwner, started.handle, () => undefined)).toThrow("NOT_AUTHORIZED");
            expect(() => setup.manager.stop(invalidOwner, started.handle)).toThrow("NOT_AUTHORIZED");
        }
        expect(() => setup.manager.snapshot(owner, "unknown" as WorkerProcessHandle)).toThrow("NOT_AUTHORIZED");
    });

    it("queues messages before readiness and subscription in arrival order", async () => {
        const setup = harness();
        const started = setup.manager.start(owner, "engine");
        await flush();
        const request = setup.child.stdin.messages()[0];
        const observed: WorkerRpcMessage[] = [];
        const unsubscribe = setup.manager.onMessage(owner, started.handle, (message) => observed.push(message));
        setup.child.stdout.write(frame(notification(1)));
        await flush();
        expect(observed).toEqual([]);
        setup.child.stdout.write(
            Buffer.concat([frame({ jsonrpc: "2.0", id: "id" in request ? request.id : undefined, result: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } }), frame(notification(2))]),
        );
        await started.ready;
        await flush();
        expect(observed).toEqual([notification(1), notification(2)]);
        unsubscribe();
        unsubscribe();
        setup.child.stdout.write(frame(notification(3)));
        await flush();
        const later: WorkerRpcMessage[] = [];
        setup.manager.onMessage(owner, started.handle, (message) => later.push(message));
        expect(later).toEqual([notification(3)]);
        expect(observed).toHaveLength(2);
    });

    it("flushes early messages only once and does not replay to later subscribers", async () => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.concat([frame(notification(1)), frame(notification(2))]));
        await flush();
        const first = jest.fn();
        const second = jest.fn();
        setup.manager.onMessage(owner, started.handle, first);
        setup.manager.onMessage(owner, started.handle, second);
        expect(first.mock.calls.map(([message]) => message)).toEqual([notification(1), notification(2)]);
        expect(second).not.toHaveBeenCalled();
        setup.child.stdout.write(frame(notification(3)));
        await flush();
        expect(second).toHaveBeenCalledWith(notification(3));
    });

    it("removes unsubscribed callbacks during delivery and isolates throwing subscribers", async () => {
        const setup = harness();
        const started = await initialize(setup);
        let removeSecond = (): void => undefined;
        const second = jest.fn();
        const throwing = jest.fn(() => {
            throw new Error("subscriber secret");
        });
        setup.manager.onMessage(owner, started.handle, () => removeSecond());
        removeSecond = setup.manager.onMessage(owner, started.handle, second);
        setup.manager.onMessage(owner, started.handle, throwing);
        const surviving = jest.fn();
        setup.manager.onMessage(owner, started.handle, surviving);
        setup.child.stdout.write(Buffer.concat([frame(notification(1)), frame(notification(2))]));
        await flush();
        expect(second).not.toHaveBeenCalled();
        expect(throwing).toHaveBeenCalledTimes(1);
        expect(surviving).toHaveBeenCalledTimes(2);
        expect(Object.isFrozen(surviving.mock.calls[0][0])).toBe(true);
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("running");
    });

    it("does not globally broadcast or remove another owner's workers", async () => {
        const first = harness();
        const second = harness();
        const firstStarted = await initialize(first);
        const secondStarted = await initialize(second, stranger);
        const callback = jest.fn();
        second.manager.onMessage(stranger, secondStarted.handle, callback);
        first.child.stdout.write(frame(notification(1)));
        await flush();
        expect(callback).not.toHaveBeenCalled();
        await second.manager.disposeOwner(owner);
        expect(second.manager.snapshot(stranger, secondStarted.handle).state).toBe("running");
        expect(first.manager.snapshot(owner, firstStarted.handle).state).toBe("running");
    });

    it("preserves requests, reverse responses and cancellation without correlating domain IDs", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const received = jest.fn();
        setup.manager.onMessage(owner, started.handle, received);
        const cancel: WorkerRpcMessage = { jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 42 } };
        await setup.manager.send(owner, started.handle, { jsonrpc: "2.0", id: 42, method: "query", params: { sql: "test" } });
        await setup.manager.send(owner, started.handle, cancel);
        await setup.manager.send(owner, started.handle, { jsonrpc: "2.0", id: "reverse", result: { value: 1 } });
        setup.child.stdout.write(
            Buffer.concat([frame({ jsonrpc: "2.0", id: "untracked", result: 2 }), frame(cancel), frame({ jsonrpc: "2.0", id: 42, error: { code: -32800, message: "cancelled" } })]),
        );
        await flush();
        expect(setup.child.stdin.messages().slice(1)).toEqual([{ jsonrpc: "2.0", id: 42, method: "query", params: { sql: "test" } }, cancel, { jsonrpc: "2.0", id: "reverse", result: { value: 1 } }]);
        expect(received.mock.calls.map(([message]) => message)).toEqual([
            { jsonrpc: "2.0", id: "untracked", result: 2 },
            cancel,
            { jsonrpc: "2.0", id: 42, error: { code: -32800, message: "cancelled" } },
        ]);
    });

    it("fails bounded early-message count and byte queues", async () => {
        const setup = harness({ limits: { maxEarlyMessages: 2 } });
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.concat([frame(notification(1)), frame(notification(2)), frame(notification(3))]));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("EARLY_QUEUE_LIMIT");
        const bytesSetup = harness({ limits: { maxEarlyBytes: 60 } });
        const bytesStarted = await initialize(bytesSetup, stranger);
        bytesSetup.child.stdout.write(Buffer.concat([frame(notification(1)), frame(notification(2))]));
        await flush();
        expect(bytesSetup.manager.snapshot(stranger, bytesStarted.handle).failure).toBe("EARLY_QUEUE_LIMIT");
    });

    it("blocks platform-reserved methods and duplicate initialize responses", async () => {
        const setup = harness();
        const started = await initialize(setup);
        expect(() => setup.manager.send(owner, started.handle, { jsonrpc: "2.0", method: "platform/initialize" })).toThrow("RESERVED_MESSAGE");
        const request = setup.child.stdin.messages()[0];
        setup.child.stdout.write(frame({ jsonrpc: "2.0", id: "id" in request ? request.id : undefined, result: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } }));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("READY_MISMATCH");
    });
});

describe("bounded framing and envelope safety", () => {
    it("accepts byte-fragmented CRLF headers, split Unicode and coalesced frames", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const received = jest.fn();
        setup.manager.onMessage(owner, started.handle, received);
        const unicode: WorkerRpcMessage = { jsonrpc: "2.0", method: "progress", params: { text: "\u96ea\ud83d\ude80\u00e9" } };
        const combined = Buffer.concat([frame(unicode), frame(notification(2))]);
        for (const byte of combined) setup.child.stdout.write(Buffer.from([byte]));
        await flush();
        expect(received.mock.calls.map(([message]) => message)).toEqual([unicode, notification(2)]);
    });

    it("accepts one explicit UTF-8 content type", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const callback = jest.fn();
        setup.manager.onMessage(owner, started.handle, callback);
        const body = Buffer.from(JSON.stringify(notification(1)));
        setup.child.stdout.write(Buffer.concat([Buffer.from(`content-length: ${body.length}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n`), body]));
        await flush();
        expect(callback).toHaveBeenCalledWith(notification(1));
    });

    it.each([
        "Content-Length: 999999999\r\n\r\n",
        "Content-Length: -1\r\n\r\n",
        "Content-Length: +1\r\n\r\n",
        "Content-Length: 0\r\n\r\n",
        "Content-Length: 01\r\n\r\n",
        "Content-Length: 1x\r\n\r\n",
        "Content-Length: 1.5\r\n\r\n",
        "Content-Length: 9007199254740992\r\n\r\n",
        "Content-Length: 1\n\n",
        "Content-Length: 1\rX",
        "Content-Length: 1\r\nContent-Length: 1\r\n\r\n",
        "Other: 1\r\n\r\n",
        "Content-Length: 1\r\nContent-Encoding: gzip\r\n\r\n",
        "Content-Length: 1\r\nContent-Type: application/json; charset=utf-16\r\n\r\n",
    ])("fail-stops malformed or oversized header %j without a body", async (header) => {
        const setup = harness();
        const started = await initialize(setup);
        const callback = jest.fn();
        setup.manager.onMessage(owner, started.handle, callback);
        for (const byte of Buffer.from(header)) setup.child.stdout.write(Buffer.from([byte]));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
        expect(callback).not.toHaveBeenCalled();
    });

    it("bounds unterminated headers before reader admission", async () => {
        const setup = harness({ limits: { maxHeaderBytes: 32 } });
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.alloc(33, 65));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it.each(["Content-Len", "Content-Length: 50\r\n\r\n{}", "Content-Length: 50\r\n"])("rejects truncated EOF %j", async (partial) => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdout.end(Buffer.from(partial));
        await jest.advanceTimersByTimeAsync(0);
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it("times out an incomplete header or body", async () => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.from("Content-Length: 100\r\n\r\n{"));
        await jest.advanceTimersByTimeAsync(50);
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it("bounds a burst before the library's asynchronous decode queue", async () => {
        const setup = harness({ limits: { maxInboundCount: 2 } });
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.concat(Array.from({ length: 3 }, (_, index) => frame(notification(index)))));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it("bounds aggregate inbound bytes before body allocation", async () => {
        const setup = harness({ limits: { maxInboundBytes: 256 } });
        const started = await initialize(setup);
        setup.child.stdout.write(Buffer.from("Content-Length: 250\r\n\r\n"));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it.each([
        [],
        null,
        { jsonrpc: "1.0", method: "progress" },
        { jsonrpc: "2.0", method: "" },
        { jsonrpc: "2.0", method: "x", id: null },
        { jsonrpc: "2.0", method: "x", params: "bad" },
        { jsonrpc: "2.0", id: 1 },
        { jsonrpc: "2.0", id: 1, result: 1, error: { code: 1, message: "error" } },
        { jsonrpc: "2.0", id: 1, error: { code: 1.5, message: "error" } },
        { jsonrpc: "2.0", id: 1, error: { code: 1 } },
        { jsonrpc: "2.0", method: "x", result: 1 },
        { jsonrpc: "2.0", id: {}, result: 1 },
    ])("rejects malformed envelope %j", async (message) => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdout.write(frame(message));
        await flush();
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
    });

    it.each([Buffer.from("not json"), Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]), Buffer.from('{"jsonrpc":"2.0","id":1,"result":1e400}')])(
        "rejects invalid JSON/UTF-8/nonfinite numbers",
        async (body) => {
            const setup = harness();
            const started = await initialize(setup);
            setup.child.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
            await flush();
            expect(setup.manager.snapshot(owner, started.handle).failure).toBe("PROTOCOL_INVALID");
        },
    );

    it.each(["params", "nested object", "nested array"])("rejects huge sparse arrays in %s before serialization or array key allocation", (location) => {
        const sparse = new Array(100000000);
        const params = location === "params" ? sparse : location === "nested object" ? { nested: sparse } : [sparse];
        const stringify = jest.spyOn(JSON, "stringify").mockImplementation(() => {
            throw new Error("Unexpected serialization");
        });
        const originalKeys = Object.keys;
        const keys = jest.spyOn(Object, "keys").mockImplementation((item: object) => {
            if (item === sparse) throw new Error("Unexpected array key allocation");
            return originalKeys(item);
        });
        try {
            expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params }, 1024)).toThrow("JSON byte limit");
            expect(stringify).not.toHaveBeenCalled();
            expect(keys.mock.calls.some(([item]) => item === sparse)).toBe(false);
        } finally {
            keys.mockRestore();
            stringify.mockRestore();
        }
    });

    it("rejects holes even when non-index keys mask the array length", () => {
        const sparse = new Array(2);
        Object.assign(sparse, { first: 1, second: 2 });
        const stringify = jest.spyOn(JSON, "stringify").mockImplementation(() => {
            throw new Error("Unexpected serialization");
        });
        try {
            expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params: sparse }, 1024)).toThrow("Sparse JSON arrays forbidden");
            expect(stringify).not.toHaveBeenCalled();
        } finally {
            stringify.mockRestore();
        }
    });

    it("rejects non-index array properties before serialization", () => {
        const params = Object.assign([1, 2], { extra: true });
        const stringify = jest.spyOn(JSON, "stringify").mockImplementation(() => {
            throw new Error("Unexpected serialization");
        });
        try {
            expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params }, 1024)).toThrow("JSON array properties forbidden");
            expect(stringify).not.toHaveBeenCalled();
        } finally {
            stringify.mockRestore();
        }
    });

    it("counts every dense array index against the shared pre-serialization budget", () => {
        const params = [Array(32).fill(0), Array(32).fill(0)];
        const stringify = jest.spyOn(JSON, "stringify").mockImplementation(() => {
            throw new Error("Unexpected serialization");
        });
        try {
            expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params }, 128)).toThrow("JSON byte limit");
            expect(stringify).not.toHaveBeenCalled();
        } finally {
            stringify.mockRestore();
        }
    });

    it("preserves and freezes bounded nested dense arrays", () => {
        const input = { jsonrpc: "2.0", method: "x", params: [0, [false, null, "value"]] };
        const normalized = immutableWorkerMessage(input, 1024);
        expect(normalized.message).toEqual(input);
        const params = (normalized.message as { params: unknown[] }).params;
        expect(Object.isFrozen(params)).toBe(true);
        expect(Object.isFrozen(params[1])).toBe(true);
    });

    it("rejects cyclic, accessor, deeply nested and oversized outbound messages", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params: circular }, 1024)).toThrow();
        expect(() =>
            immutableWorkerMessage(
                {
                    jsonrpc: "2.0",
                    method: "x",
                    params: {
                        get secret() {
                            throw new Error("not evaluated");
                        },
                    },
                },
                1024,
            ),
        ).toThrow("JSON accessors forbidden");
        expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params: { text: "\u96ea".repeat(100) } }, 256)).toThrow("JSON byte limit");
        let nested: unknown = {};
        for (let index = 0; index < 70; index++) nested = { nested };
        expect(() => immutableWorkerMessage({ jsonrpc: "2.0", method: "x", params: nested }, 1024)).toThrow("JSON nesting limit");
    });
});

describe("serialized backpressure and bounded stopping", () => {
    it("skips a deferred tree kill when exit occurs after scheduling and settles stop", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const stopped = setup.manager.stop(owner, started.handle);
        const settled = jest.fn();
        void stopped.then(settled);
        jest.advanceTimersByTime(20);
        expect(setup.killTree).not.toHaveBeenCalled();
        setup.child.exit(0);
        await flush();
        expect(settled).toHaveBeenCalledTimes(1);
        expect(setup.killTree).not.toHaveBeenCalled();
        expect(setup.manager.snapshot(owner, started.handle)).toMatchObject({ state: "exited" });
        expect(setup.manager.snapshot(owner, started.handle)).not.toHaveProperty("failure");
        await expect(stopped).resolves.toBeUndefined();
    });

    it.each(["stdout", "stdin"])("fail-stops abrupt %s closure", async (stream) => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child[stream as "stdout" | "stdin"].emit("close");
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
    });

    it("default POSIX termination targets only the captured owned process group", async () => {
        const setup = harness({ killTree: undefined });
        const kill = jest.spyOn(process, "kill").mockImplementation(() => true);
        const started = await initialize(setup);
        setup.child.pid = 33333;
        const stopped = setup.manager.stop(owner, started.handle);
        await jest.advanceTimersByTimeAsync(20);
        await stopped;
        expect(kill).toHaveBeenCalledTimes(1);
        expect(kill).toHaveBeenCalledWith(-12001, "SIGKILL");
        expect(() => setup.manager.start(owner, "engine")).toThrow("ALREADY_STARTED");
        setup.child.exit(null, "SIGKILL");
    });

    it("default Windows termination uses fixed taskkill args and no inherited environment", async () => {
        const childProcess = jest.requireActual<typeof import("child_process")>("child_process");
        const exec = jest.spyOn(childProcess, "execFile").mockImplementation(((
            _file: string,
            _args: readonly string[],
            _options: unknown,
            callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => {
            callback(null, "", "");
            return {};
        }) as unknown as typeof childProcess.execFile);
        const setup = harness({
            killTree: undefined,
            platform: "win32",
            prepare: async () => ({ executable: "C:\\Program Files\\dotnet\\dotnet.exe", args: ["C:\\Prepared\\worker.dll"], cwd: "C:\\Prepared", env: {} }),
        });
        const started = await initialize(setup);
        const stopped = setup.manager.stop(owner, started.handle);
        await jest.advanceTimersByTimeAsync(20);
        await stopped;
        expect(exec).toHaveBeenCalledWith(
            "C:\\Windows\\System32\\taskkill.exe",
            ["/PID", "12001", "/T", "/F"],
            expect.objectContaining({ shell: false, timeout: 2000, maxBuffer: 4096, env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" } }),
            expect.any(Function),
        );
        setup.child.exit(null, "SIGKILL");
    });

    it("default launcher spawns only the trusted absolute executable without a shell", async () => {
        const childProcess = jest.requireActual<typeof import("child_process")>("child_process");
        const child = new FakeChild();
        const launch = jest.spyOn(childProcess, "spawn").mockReturnValue(child as unknown as import("child_process").ChildProcess);
        const setup = harness({
            launch: undefined,
            killTree: async () => {
                child.exit(null, "SIGKILL");
            },
        });
        const started = setup.manager.start(owner, "engine");
        await flush();
        const request = child.stdin.messages()[0];
        child.stdout.write(frame({ jsonrpc: "2.0", id: "id" in request ? request.id : undefined, result: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } }));
        await started.ready;
        expect(launch).toHaveBeenCalledWith("/trusted/dotnet", ["/prepared/worker.dll"], expect.objectContaining({ shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] }));
        const stopped = setup.manager.stop(owner, started.handle);
        child.exit(0);
        await stopped;
    });

    it("bounds pending count while honoring slow write callbacks and message order", async () => {
        const setup = harness({ limits: { maxPendingWrites: 2 } });
        const started = await initialize(setup);
        setup.child.stdin.blocked = true;
        const first = setup.manager.send(owner, started.handle, notification(1));
        const second = setup.manager.send(owner, started.handle, notification(2));
        await expect(setup.manager.send(owner, started.handle, notification(3))).rejects.toThrow("WRITE_QUEUE_LIMIT");
        await flush();
        expect(setup.child.stdin.messages()).toHaveLength(1);
        setup.child.stdin.release();
        await Promise.all([first, second]);
        await flush();
        expect(setup.child.stdin.messages().slice(1)).toEqual([notification(1), notification(2)]);
    });

    it("bounds pending UTF-8 bytes and snapshots caller mutations", async () => {
        const setup = harness({ limits: { maxPendingWriteBytes: 400 } });
        const started = await initialize(setup);
        setup.child.stdin.blocked = true;
        const message = { jsonrpc: "2.0", method: "x", params: { text: "\u96ea".repeat(80) } };
        const first = setup.manager.send(owner, started.handle, message);
        message.params.text = "changed";
        await expect(setup.manager.send(owner, started.handle, { ...message, params: { text: "\u96ea".repeat(80) } })).rejects.toThrow("WRITE_QUEUE_LIMIT");
        setup.child.stdin.release();
        await first;
        expect(setup.child.stdin.messages()[1]).toMatchObject({ params: { text: "\u96ea".repeat(80) } });
    });

    it("rejects blocked and queued sends on stop, then forces the owned tree", async () => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdin.blocked = true;
        const first = setup.manager.send(owner, started.handle, notification(1));
        const second = setup.manager.send(owner, started.handle, notification(2));
        const firstRejected = expect(first).rejects.toThrow("WORKER_STOPPED");
        const secondRejected = expect(second).rejects.toThrow("WORKER_STOPPED");
        const stopped = setup.manager.stop(owner, started.handle);
        expect(setup.manager.stop(owner, started.handle)).toBe(stopped);
        await Promise.all([firstRejected, secondRejected]);
        await expect(setup.manager.send(owner, started.handle, notification(3))).rejects.toThrow("NOT_RUNNING");
        await jest.advanceTimersByTimeAsync(20);
        await stopped;
        expect(setup.killTree).toHaveBeenCalledTimes(1);
        expect(setup.killTree).toHaveBeenCalledWith(12001, "linux");
    });

    it("sends an uncorrelated shutdown notification followed by EOF", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const stopped = setup.manager.stop(owner, started.handle);
        await flush();
        expect(setup.child.stdin.messages().at(-1)).toEqual({ jsonrpc: "2.0", method: "platform/shutdown" });
        expect(setup.child.stdin.writableEnded).toBe(true);
        setup.child.exit(0);
        await stopped;
        expect(setup.killTree).not.toHaveBeenCalled();
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("exited");
    });

    it("allows a replacement only after an observed exit", async () => {
        const setup = harness({
            killTree: async () => {
                throw new Error("kill failed");
            },
        });
        const started = await initialize(setup);
        const stopped = setup.manager.stop(owner, started.handle);
        await jest.advanceTimersByTimeAsync(20);
        await stopped;
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("TREE_KILL_FAILED");
        expect(() => setup.manager.start(owner, "engine")).toThrow("ALREADY_STARTED");
        setup.child.exit(0);
        expect(() => setup.manager.start(owner, "engine")).not.toThrow();
    });

    it("bounds a never-completing tree killer", async () => {
        const setup = harness({ killTree: () => new Promise(() => undefined) });
        const started = await initialize(setup);
        const stopped = setup.manager.stop(owner, started.handle);
        await jest.advanceTimersByTimeAsync(40);
        await stopped;
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("TREE_KILL_FAILED");
    });

    it("times out a blocked write and rejects subsequent queued writes", async () => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdin.blocked = true;
        const writing = setup.manager.send(owner, started.handle, notification(1));
        const rejected = expect(writing).rejects.toThrow("WRITE_FAILED");
        await jest.advanceTimersByTimeAsync(100);
        await rejected;
        expect(setup.manager.snapshot(owner, started.handle).failure).toBe("WRITE_FAILED");
    });

    it("fail-stops write callback errors and clean stdout EOF", async () => {
        const setup = harness();
        const started = await initialize(setup);
        setup.child.stdin.blocked = true;
        const writing = setup.manager.send(owner, started.handle, notification(1));
        const rejected = expect(writing).rejects.toThrow();
        await flush();
        setup.child.stdin.release(new Error("write secret"));
        await rejected;
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("failed");
        const eof = harness();
        const eofStarted = await initialize(eof, stranger);
        eof.child.stdout.end();
        await jest.advanceTimersByTimeAsync(0);
        expect(eof.manager.snapshot(stranger, eofStarted.handle).failure).toBe("STDOUT_ENDED");
    });

    it("redacts every stderr byte and caps diagnostic counters", async () => {
        const setup = harness({ limits: { maxStderrBytes: 16 } });
        const started = await initialize(setup);
        setup.child.stderr.write(Buffer.from("Bearer secret-token https://private-host"));
        expect(setup.manager.snapshot(owner, started.handle).stderr).toEqual({ bytes: 16, truncated: true, summary: "Worker stderr redacted" });
        expect(JSON.stringify(setup.manager.snapshot(owner, started.handle))).not.toContain("secret");
        expect(setup.manager.snapshot(owner, started.handle).state).toBe("running");
    });

    it("uses Windows non-detached pipes and a fixed system root", async () => {
        const setup = harness({ platform: "win32", prepare: async () => ({ executable: "C:\\Program Files\\dotnet\\dotnet.exe", args: ["C:\\Prepared\\worker.dll"], cwd: "C:\\Prepared", env: {} }) });
        const started = await initialize(setup);
        expect(setup.launch.mock.calls[0]).toEqual(
            expect.arrayContaining([expect.objectContaining({ env: expect.objectContaining({ SystemRoot: "C:\\Windows" }) }), expect.objectContaining({ detached: false, shell: false })]),
        );
        const stopped = setup.manager.stop(owner, started.handle);
        await jest.advanceTimersByTimeAsync(20);
        await stopped;
        expect(setup.killTree).toHaveBeenCalledWith(12001, "win32");
    });

    it("removes disposed owner's handles and subscriptions", async () => {
        const setup = harness();
        const started = await initialize(setup);
        const callback = jest.fn();
        setup.manager.onMessage(owner, started.handle, callback);
        const disposed = setup.manager.disposeOwner(owner);
        setup.child.stdout.write(frame(notification(1)));
        setup.child.exit(0);
        await disposed;
        expect(callback).not.toHaveBeenCalled();
        expect(() => setup.manager.snapshot(owner, started.handle)).toThrow("NOT_AUTHORIZED");
    });
});
