import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import { posix, win32 } from "path";
import type { Readable, Writable } from "stream";
import { StreamMessageWriter } from "vscode-jsonrpc/node";
import type {
    WorkerLaunchDescriptor,
    WorkerOwner,
    WorkerProcessHandle,
    WorkerProcessLimits,
    WorkerProcessSnapshot,
    WorkerProcessStart,
    WorkerProcessState,
    WorkerRpcMessage,
} from "../../common/types/workerProcess";
import { BoundedWorkerReader, immutableWorkerMessage, WORKER_PROCESS_LIMITS } from "../utilities/workerStdio";

export interface WorkerChild {
    readonly pid?: number;
    readonly stdin: Writable;
    readonly stdout: Readable;
    readonly stderr: Readable;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export interface WorkerLaunchOptions {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly shell: false;
    readonly stdio: readonly ["pipe", "pipe", "pipe"];
    readonly windowsHide: true;
    readonly detached: boolean;
}

export interface WorkerProcessDependencies {
    prepare(owner: WorkerOwner, workerId: string, signal: AbortSignal): Promise<WorkerLaunchDescriptor>;
    beforeLaunch?(owner: WorkerOwner, workerId: string): void;
    deferStartupTimeoutUntilLaunch?: boolean;
    preserveStartupErrorCodes?: boolean;
    launch?(descriptor: WorkerLaunchDescriptor, options: WorkerLaunchOptions): WorkerChild;
    killTree?(pid: number, platform: NodeJS.Platform): Promise<void>;
    platform?: NodeJS.Platform;
    limits?: Partial<WorkerProcessLimits>;
}

export class WorkerProcessError extends Error {
    constructor(readonly code: string) {
        super(`Worker transport: ${code}`);
        this.name = "WorkerProcessError";
    }
}

interface PendingWrite {
    message: WorkerRpcMessage;
    bytes: number;
    resolve(): void;
    reject(error: Error): void;
    settled: boolean;
}

interface WorkerRecord {
    handle: WorkerProcessHandle;
    owner: WorkerOwner;
    workerId: string;
    slot: string;
    state: WorkerProcessState;
    failure?: string;
    abort: AbortController;
    ready: Promise<void>;
    resolveReady(): void;
    rejectReady(error: Error): void;
    startupId: string;
    startupTimer?: ReturnType<typeof setTimeout>;
    child?: WorkerChild;
    pid?: number;
    reader?: BoundedWorkerReader;
    writer?: StreamMessageWriter;
    exitSeen: boolean;
    outputClosed: Set<"stdout" | "stderr">;
    preparation?: Promise<void>;
    preparationSettled: boolean;
    preparationFailure?: Error;
    treeKillDispatched: boolean;
    treeKillSucceeded: boolean;
    verificationWaiters: Set<() => void>;
    writes: PendingWrite[];
    active?: PendingWrite;
    pendingBytes: number;
    early: { message: WorkerRpcMessage; bytes: number }[];
    earlyBytes: number;
    subscribers: Map<symbol, (message: WorkerRpcMessage) => void>;
    terminalSubscribers: Map<symbol, () => void>;
    delivering: boolean;
    stderrBytes: number;
    stderrTruncated: boolean;
    stopPromise?: Promise<void>;
    resolveStop?: () => void;
    stopTimer?: ReturnType<typeof setTimeout>;
    forcing: boolean;
    closingInput: boolean;
    cleaned: boolean;
}

function limited<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new WorkerProcessError("TIMEOUT")), timeout);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                reject(new WorkerProcessError("OPERATION_FAILED"));
            },
        );
    });
}

function cleanString(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= max && !Array.from(value).some((character) => character.charCodeAt(0) < 32);
}

function validateOwner(owner: WorkerOwner): WorkerOwner {
    if (!owner || !cleanString(owner.toolId, 256) || !cleanString(owner.instanceId, 256)) throw new WorkerProcessError("INVALID_OWNER");
    return Object.freeze({ toolId: owner.toolId, instanceId: owner.instanceId });
}

export function validateWorkerLaunchDescriptor(input: WorkerLaunchDescriptor, platform: NodeJS.Platform): WorkerLaunchDescriptor {
    const paths = platform === "win32" ? win32 : posix;
    const absolute = (value: unknown): value is string => cleanString(value, 4096) && paths.isAbsolute(value);
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== 4 || Object.keys(input).some((key) => !["executable", "args", "cwd", "env"].includes(key)))
        throw new WorkerProcessError("INVALID_DESCRIPTOR");
    if (Object.values(Object.getOwnPropertyDescriptors(input)).some((descriptor) => !("value" in descriptor)) || !absolute(input.executable) || !absolute(input.cwd))
        throw new WorkerProcessError("INVALID_DESCRIPTOR");
    if (
        !Array.isArray(input.args) ||
        input.args.length > 64 ||
        input.args.some((arg) => typeof arg !== "string" || Buffer.byteLength(arg, "utf8") > 4096 || Array.from(arg).some((character) => character.charCodeAt(0) < 32))
    )
        throw new WorkerProcessError("INVALID_DESCRIPTOR");
    if (!input.env || Object.getPrototypeOf(input.env) !== Object.prototype) throw new WorkerProcessError("INVALID_ENVIRONMENT");
    const fixed: Record<string, string> = {
        DOTNET_MULTILEVEL_LOOKUP: "0",
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
        DOTNET_NOLOGO: "1",
        DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
        DOTNET_CLI_UI_LANGUAGE: "en-US",
        LANG: "C",
        LC_ALL: "C",
        ...(platform === "win32" ? { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" } : {}),
    };
    const env: Record<string, string> = { ...fixed };
    for (const [key, value] of Object.entries(input.env)) {
        if (key === "DOTNET_ROOT" && absolute(value)) env[key] = value;
        else if (key === "DOTNET_ROLL_FORWARD" && ["Disable", "LatestMajor", "Minor", "Major"].includes(value)) env[key] = value;
        else if (fixed[key] !== undefined && fixed[key] === value) env[key] = value;
        else throw new WorkerProcessError("INVALID_ENVIRONMENT");
    }
    return Object.freeze({ executable: input.executable, args: Object.freeze([...input.args]), cwd: input.cwd, env: Object.freeze(env) });
}

function defaultLaunch(descriptor: WorkerLaunchDescriptor, options: WorkerLaunchOptions): WorkerChild {
    return spawn(descriptor.executable, [...descriptor.args], { ...options, env: { ...options.env }, stdio: ["pipe", "pipe", "pipe"] });
}

async function defaultKillTree(pid: number, platform: NodeJS.Platform): Promise<void> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new WorkerProcessError("INVALID_PID");
    if (platform === "win32") {
        await new Promise<void>((resolve, reject) => {
            execFile(
                "C:\\Windows\\System32\\taskkill.exe",
                ["/PID", String(pid), "/T", "/F"],
                {
                    shell: false,
                    windowsHide: true,
                    timeout: 2000,
                    maxBuffer: 4096,
                    env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
                },
                (error) => {
                    if (error) reject(new WorkerProcessError("TREE_KILL_FAILED"));
                    else resolve();
                },
            );
        });
    } else {
        try {
            process.kill(-pid, "SIGKILL");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw new WorkerProcessError("TREE_KILL_FAILED");
        }
    }
}

export class WorkerProcessManager {
    private readonly records = new Map<WorkerProcessHandle, WorkerRecord>();
    private readonly slots = new Map<string, WorkerProcessHandle>();
    private readonly limits: Readonly<WorkerProcessLimits>;
    private readonly platform: NodeJS.Platform;

    constructor(private readonly dependencies: WorkerProcessDependencies) {
        this.platform = dependencies.platform ?? process.platform;
        if (!["win32", "darwin", "linux"].includes(this.platform)) throw new WorkerProcessError("PLATFORM_UNSUPPORTED");
        const limits = { ...WORKER_PROCESS_LIMITS, ...dependencies.limits };
        for (const key of Object.keys(limits) as (keyof WorkerProcessLimits)[]) {
            if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > WORKER_PROCESS_LIMITS[key]) throw new WorkerProcessError("INVALID_LIMITS");
        }
        this.limits = Object.freeze(limits);
    }

    start(ownerInput: WorkerOwner, workerId: string): WorkerProcessStart {
        const owner = validateOwner(ownerInput);
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(workerId) || ["constructor", "prototype", "__proto__"].includes(workerId)) throw new WorkerProcessError("INVALID_WORKER_ID");
        const slot = JSON.stringify([owner.toolId, owner.instanceId, workerId]);
        if (this.slots.has(slot)) throw new WorkerProcessError("ALREADY_STARTED");
        if (this.slots.size >= this.limits.maxRecords) throw new WorkerProcessError("WORKER_LIMIT");
        if (this.records.size >= this.limits.maxRecords) {
            const terminal = [...this.records.values()].find((record) => record.cleaned);
            if (!terminal) throw new WorkerProcessError("WORKER_LIMIT");
            this.records.delete(terminal.handle);
        }
        let resolveReady!: () => void;
        let rejectReady!: (error: Error) => void;
        const ready = new Promise<void>((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
        });
        void ready.catch(() => undefined);
        const handle = randomUUID() as WorkerProcessHandle;
        const record: WorkerRecord = {
            handle,
            owner,
            workerId,
            slot,
            state: "starting",
            abort: new AbortController(),
            ready,
            resolveReady,
            rejectReady,
            startupId: `pptb:initialize:${randomUUID()}`,
            exitSeen: false,
            outputClosed: new Set(),
            preparationSettled: false,
            treeKillDispatched: false,
            treeKillSucceeded: false,
            verificationWaiters: new Set(),
            writes: [],
            pendingBytes: 0,
            early: [],
            earlyBytes: 0,
            subscribers: new Map(),
            terminalSubscribers: new Map(),
            delivering: false,
            stderrBytes: 0,
            stderrTruncated: false,
            forcing: false,
            closingInput: false,
            cleaned: false,
        };
        this.records.set(handle, record);
        this.slots.set(slot, handle);
        if (!this.dependencies.deferStartupTimeoutUntilLaunch) record.startupTimer = setTimeout(() => this.fail(record, "STARTUP_TIMEOUT"), this.limits.startupTimeoutMs);
        record.preparation = this.prepare(record);
        return Object.freeze({ handle, ready });
    }

    private async prepare(record: WorkerRecord): Promise<void> {
        try {
            const prepared = await this.dependencies.prepare(record.owner, record.workerId, record.abort.signal);
            if (record.state !== "starting") return;
            const descriptor = validateWorkerLaunchDescriptor(prepared, this.platform);
            const options: WorkerLaunchOptions = Object.freeze({
                cwd: descriptor.cwd,
                env: descriptor.env,
                shell: false,
                stdio: Object.freeze(["pipe", "pipe", "pipe"] as const),
                windowsHide: true,
                detached: this.platform !== "win32",
            });
            this.dependencies.beforeLaunch?.(record.owner, record.workerId);
            if (this.dependencies.deferStartupTimeoutUntilLaunch) record.startupTimer = setTimeout(() => this.fail(record, "STARTUP_TIMEOUT"), this.limits.startupTimeoutMs);
            const child = (this.dependencies.launch ?? defaultLaunch)(descriptor, options);
            record.child = child;
            record.pid = child.pid;
            child.on("error", () => this.fail(record, "PROCESS_ERROR"));
            child.on("exit", (code, signal) => this.exited(record, code, signal));
            for (const stream of ["stdout", "stderr"] as const) {
                const closed = (): void => {
                    record.outputClosed.add(stream);
                    this.cleanup(record);
                };
                child[stream].once("end", closed);
                child[stream].once("close", closed);
                if (child[stream].destroyed || child[stream].readableEnded) closed();
            }
            child.stdin.on("error", () => this.fail(record, "WRITE_FAILED"));
            child.stdin.on("close", () => {
                if (record.state === "starting" || record.state === "running") this.fail(record, "WRITE_CLOSED");
            });
            child.stdout.on("error", () => this.fail(record, "READ_FAILED"));
            child.stderr.on("error", () => this.fail(record, "STDERR_FAILED"));
            child.stderr.on("data", (chunk: unknown) => {
                if (record.cleaned) return;
                const bytes = Buffer.isBuffer(chunk) ? chunk.length : typeof chunk === "string" ? Buffer.byteLength(chunk) : this.limits.maxStderrBytes + 1;
                record.stderrTruncated ||= record.stderrBytes + bytes > this.limits.maxStderrBytes;
                record.stderrBytes = Math.min(this.limits.maxStderrBytes, record.stderrBytes + bytes);
            });
            if (!Number.isSafeInteger(record.pid) || !record.pid || record.pid <= 0 || record.pid === process.pid) return this.fail(record, "INVALID_PID");
            record.writer = new StreamMessageWriter(child.stdin);
            record.writer.onError(() => this.fail(record, "WRITE_FAILED"));
            record.reader = new BoundedWorkerReader(
                child.stdout,
                this.limits,
                (message, bytes) => this.receive(record, message, bytes),
                () => this.fail(record, "PROTOCOL_INVALID"),
                () => {
                    if (record.state !== "stopping" && !record.cleaned) this.fail(record, "STDOUT_ENDED");
                },
            );
            if (child.stdout.destroyed || child.stdout.readableEnded || child.stdin.destroyed || child.stdin.writableEnded) return this.fail(record, "STDIO_CLOSED");
            await this.enqueue(record, { jsonrpc: "2.0", id: record.startupId, method: "platform/initialize", params: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } });
        } catch (error) {
            if (error instanceof Error && "code" in error && (error.code === "WORKSPACE_INVALID" || error.code === "RESTORE_STOP_UNVERIFIED")) record.preparationFailure = error;
            if (record.state === "starting" || record.state === "running") {
                const code =
                    this.dependencies.preserveStartupErrorCodes && error instanceof Error && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
                        ? error.code
                        : "STARTUP_FAILED";
                this.fail(record, code);
            }
        } finally {
            record.preparationSettled = true;
            this.cleanup(record);
        }
    }

    private authorize(owner: WorkerOwner, handle: WorkerProcessHandle): WorkerRecord {
        const record = this.records.get(handle);
        if (!record || !owner || record.owner.toolId !== owner.toolId || record.owner.instanceId !== owner.instanceId) throw new WorkerProcessError("NOT_AUTHORIZED");
        return record;
    }

    snapshot(owner: WorkerOwner, handle: WorkerProcessHandle): WorkerProcessSnapshot {
        const record = this.authorize(owner, handle);
        return Object.freeze({
            state: record.state,
            ...(record.failure ? { failure: record.failure } : {}),
            stderr: Object.freeze({ bytes: record.stderrBytes, truncated: record.stderrTruncated, summary: "Worker stderr redacted" as const }),
        });
    }

    send(owner: WorkerOwner, handle: WorkerProcessHandle, message: unknown): Promise<void> {
        const record = this.authorize(owner, handle);
        if (record.state !== "running") return Promise.reject(new WorkerProcessError("NOT_RUNNING"));
        const normalized = immutableWorkerMessage(message, this.limits.maxFrameBytes);
        if (
            ("method" in normalized.message && ["platform/initialize", "platform/shutdown"].includes(normalized.message.method)) ||
            ("id" in normalized.message && normalized.message.id === record.startupId)
        )
            throw new WorkerProcessError("RESERVED_MESSAGE");
        return this.enqueue(record, normalized.message);
    }

    onMessage(owner: WorkerOwner, handle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void): () => void {
        const record = this.authorize(owner, handle);
        if (record.state !== "starting" && record.state !== "running") throw new WorkerProcessError("NOT_RUNNING");
        if (typeof callback !== "function") throw new WorkerProcessError("INVALID_SUBSCRIBER");
        if (record.subscribers.size >= this.limits.maxEarlyMessages) throw new WorkerProcessError("SUBSCRIBER_LIMIT");
        const key = Symbol();
        record.subscribers.set(key, callback);
        this.deliver(record);
        return () => {
            record.subscribers.delete(key);
        };
    }

    onTerminal(owner: WorkerOwner, handle: WorkerProcessHandle, callback: () => void): () => void {
        const record = this.authorize(owner, handle);
        if (typeof callback !== "function") throw new WorkerProcessError("INVALID_SUBSCRIBER");
        if (record.terminalSubscribers.size >= this.limits.maxEarlyMessages) throw new WorkerProcessError("SUBSCRIBER_LIMIT");
        const key = Symbol();
        record.terminalSubscribers.set(key, callback);
        if (record.state === "failed" || record.state === "exited") this.notifyTerminal(record);
        return () => record.terminalSubscribers.delete(key);
    }

    private notifyTerminal(record: WorkerRecord): void {
        const callbacks = [...record.terminalSubscribers.values()];
        record.terminalSubscribers.clear();
        for (const callback of callbacks) {
            try {
                callback();
            } catch {
                continue;
            }
        }
    }

    private receive(record: WorkerRecord, message: WorkerRpcMessage, bytes: number): void {
        if (record.state !== "starting" && record.state !== "running") return;
        if ("id" in message && message.id === record.startupId) {
            if (record.state !== "starting" || !("result" in message)) return this.fail(record, "READY_MISMATCH");
            const result = message.result;
            if (
                !result ||
                typeof result !== "object" ||
                Array.isArray(result) ||
                Object.keys(result).length !== 2 ||
                (result as Record<string, unknown>).protocol !== "jsonrpc-stdio-v1" ||
                (result as Record<string, unknown>).protocolVersion !== 1
            )
                return this.fail(record, "READY_MISMATCH");
            clearTimeout(record.startupTimer);
            record.state = "running";
            record.resolveReady();
            this.deliver(record);
            return;
        }
        if ("method" in message && ["platform/initialize", "platform/shutdown"].includes(message.method)) return this.fail(record, "RESERVED_MESSAGE");
        if (record.early.length >= this.limits.maxEarlyMessages || record.earlyBytes + bytes > this.limits.maxEarlyBytes) return this.fail(record, "EARLY_QUEUE_LIMIT");
        record.early.push({ message, bytes });
        record.earlyBytes += bytes;
        this.deliver(record);
    }

    private deliver(record: WorkerRecord): void {
        if (record.delivering) return;
        record.delivering = true;
        try {
            while (record.state === "running" && record.subscribers.size && record.early.length) {
                const next = record.early.shift()!;
                record.earlyBytes -= next.bytes;
                for (const [key, callback] of [...record.subscribers]) {
                    if (record.state !== "running") break;
                    if (!record.subscribers.has(key)) continue;
                    try {
                        callback(next.message);
                    } catch {
                        record.subscribers.delete(key);
                    }
                }
            }
        } finally {
            record.delivering = false;
        }
    }

    private enqueue(record: WorkerRecord, message: WorkerRpcMessage): Promise<void> {
        const immutable = immutableWorkerMessage(message, this.limits.maxFrameBytes);
        const bytes = immutable.bytes + Buffer.byteLength(`Content-Length: ${immutable.bytes}\r\n\r\n`);
        if (record.writes.length + (record.active ? 1 : 0) >= this.limits.maxPendingWrites || record.pendingBytes + bytes > this.limits.maxPendingWriteBytes)
            return Promise.reject(new WorkerProcessError("WRITE_QUEUE_LIMIT"));
        return new Promise((resolve, reject) => {
            record.writes.push({ message: immutable.message, bytes, resolve, reject, settled: false });
            record.pendingBytes += bytes;
            this.pumpWrites(record);
        });
    }

    private pumpWrites(record: WorkerRecord): void {
        if (record.active || !record.writer || (record.state !== "starting" && record.state !== "running")) return;
        const pending = record.writes.shift();
        if (!pending) return;
        record.active = pending;
        void limited(record.writer.write(pending.message), this.limits.writeTimeoutMs)
            .then(
                () => {
                    if (!pending.settled) {
                        pending.settled = true;
                        pending.resolve();
                    }
                },
                () => {
                    if (!pending.settled) {
                        pending.settled = true;
                        pending.reject(new WorkerProcessError("WRITE_FAILED"));
                    }
                    this.fail(record, "WRITE_FAILED");
                },
            )
            .finally(() => {
                record.pendingBytes -= pending.bytes;
                record.active = undefined;
                if (record.state === "stopping") this.closeInput(record, true);
                else this.pumpWrites(record);
            });
    }

    private rejectWrites(record: WorkerRecord): void {
        for (const pending of [...record.writes, ...(record.active ? [record.active] : [])]) {
            if (!pending.settled) {
                pending.settled = true;
                pending.reject(new WorkerProcessError("WORKER_STOPPED"));
            }
        }
        for (const pending of record.writes) record.pendingBytes -= pending.bytes;
        record.writes.length = 0;
    }

    stop(owner: WorkerOwner, handle: WorkerProcessHandle): Promise<void> {
        const record = this.authorize(owner, handle);
        if (record.cleaned) return Promise.resolve();
        if (record.stopPromise) return record.stopPromise;
        if (record.state === "starting" || record.state === "running") record.state = "stopping";
        return this.beginStop(record, true);
    }

    async stopAndVerify(owner: WorkerOwner, handle: WorkerProcessHandle): Promise<void> {
        const record = this.authorize(owner, handle);
        await this.stop(owner, handle);
        await limited(record.preparation ?? Promise.resolve(), this.limits.startupTimeoutMs);
        if (record.preparationFailure) throw record.preparationFailure;
        if (record.treeKillSucceeded && !record.cleaned) {
            await new Promise<void>((resolve) => {
                const settled = (): void => {
                    clearTimeout(timer);
                    record.verificationWaiters.delete(settled);
                    resolve();
                };
                const timer = setTimeout(settled, this.limits.killTimeoutMs);
                record.verificationWaiters.add(settled);
            });
        }
        if (record.pid && !record.exitSeen) throw new WorkerProcessError("EXIT_NOT_OBSERVED");
        if (!record.cleaned) throw new WorkerProcessError("STOP_UNVERIFIED");
    }

    private beginStop(record: WorkerRecord, graceful: boolean): Promise<void> {
        if (record.stopPromise) return record.stopPromise;
        record.stopPromise = new Promise((resolve) => {
            record.resolveStop = resolve;
        });
        clearTimeout(record.startupTimer);
        record.abort.abort();
        record.rejectReady(new WorkerProcessError(record.failure ?? "WORKER_STOPPED"));
        this.rejectWrites(record);
        record.subscribers.clear();
        record.early.length = 0;
        record.earlyBytes = 0;
        record.reader?.dispose();
        if (!record.child) {
            this.cleanup(record);
            record.resolveStop?.();
        } else {
            record.stopTimer = setTimeout(() => {
                void this.force(record);
            }, this.limits.stopTimeoutMs);
            record.child.stdout.resume();
            record.child.stderr.resume();
            if (!record.exitSeen) this.closeInput(record, graceful);
            this.cleanup(record);
        }
        return record.stopPromise;
    }

    private closeInput(record: WorkerRecord, graceful: boolean): void {
        if (!record.child || record.closingInput || record.cleaned || (graceful && record.active)) return;
        record.closingInput = true;
        const end = (): void => {
            if (!record.cleaned) {
                try {
                    record.child?.stdin.end();
                } catch {
                    void this.force(record);
                }
            }
        };
        const shutdown: WorkerRpcMessage = { jsonrpc: "2.0", method: "platform/shutdown" };
        if (graceful && record.writer)
            void record.writer.write(shutdown).then(end, () => {
                void this.force(record);
            });
        else end();
    }

    private fail(record: WorkerRecord, code: string): void {
        if (record.cleaned || record.state === "failed" || record.state === "exited") return;
        record.state = "failed";
        record.failure = code;
        record.rejectReady(new WorkerProcessError(code));
        void this.beginStop(record, false);
        this.notifyTerminal(record);
    }

    private exited(record: WorkerRecord, code: number | null, signal: NodeJS.Signals | null): void {
        record.exitSeen = true;
        if (record.cleaned) return;
        if (record.state === "starting") {
            record.state = "failed";
            record.failure = "STARTUP_EXIT";
        } else if (record.state !== "failed") {
            record.state = code === 0 && signal === null ? "exited" : "failed";
            if (record.state === "failed") record.failure = "PROCESS_EXIT";
        }
        record.rejectReady(new WorkerProcessError(record.failure ?? "WORKER_EXITED"));
        void this.beginStop(record, false);
        this.cleanup(record);
        this.notifyTerminal(record);
    }

    private async force(record: WorkerRecord): Promise<void> {
        if (record.cleaned || record.forcing) return;
        if (record.exitSeen) {
            this.cleanup(record);
            record.resolveStop?.();
            return;
        }
        record.forcing = true;
        try {
            if (!Number.isSafeInteger(record.pid) || !record.pid || record.pid <= 0 || record.pid === process.pid) throw new WorkerProcessError("INVALID_PID");
            await limited(
                Promise.resolve().then(() => {
                    if (record.exitSeen || record.cleaned) return;
                    record.treeKillDispatched = true;
                    return (this.dependencies.killTree ?? defaultKillTree)(record.pid!, this.platform);
                }),
                this.limits.killTimeoutMs,
            );
            record.treeKillSucceeded = record.treeKillDispatched;
            if (!record.cleaned && record.treeKillDispatched) {
                record.state = "failed";
                record.failure ??= "FORCED_STOP";
            }
        } catch {
            if (!record.cleaned) {
                record.state = "failed";
                record.failure ??= "TREE_KILL_FAILED";
            }
        } finally {
            record.forcing = false;
            this.cleanup(record);
            record.resolveStop?.();
            if (record.state === "failed") this.notifyTerminal(record);
        }
    }

    private cleanup(record: WorkerRecord): void {
        if (record.cleaned || !record.stopPromise || !record.preparationSettled || record.preparationFailure || record.forcing) return;
        if (record.child && (!record.exitSeen || record.outputClosed.size !== 2 || (record.treeKillDispatched && !record.treeKillSucceeded))) return;
        record.cleaned = true;
        clearTimeout(record.startupTimer);
        clearTimeout(record.stopTimer);
        record.abort.abort();
        this.rejectWrites(record);
        record.reader?.dispose();
        record.writer?.dispose();
        record.reader = undefined;
        record.writer = undefined;
        record.subscribers.clear();
        record.early.length = 0;
        record.earlyBytes = 0;
        if (record.state === "stopping") record.state = "exited";
        if (record.child) {
            record.child.stdin.destroy();
        }
        record.child = undefined;
        if (this.slots.get(record.slot) === record.handle) this.slots.delete(record.slot);
        record.resolveStop?.();
        for (const settled of [...record.verificationWaiters]) settled();
        this.notifyTerminal(record);
    }

    async disposeOwner(owner: WorkerOwner): Promise<void> {
        const validated = validateOwner(owner);
        const records = [...this.records.values()].filter((record) => record.owner.toolId === validated.toolId && record.owner.instanceId === validated.instanceId);
        await Promise.all(records.map((record) => this.stopAndVerify(validated, record.handle)));
        for (const record of records) this.records.delete(record.handle);
    }
}
