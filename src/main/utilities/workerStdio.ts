import { PassThrough, Readable } from "stream";
import { TextDecoder } from "util";
import { StreamMessageReader } from "vscode-jsonrpc/node";
import type { WorkerProcessLimits, WorkerRpcMessage } from "../../common/types/workerProcess";

export const WORKER_PROCESS_LIMITS: Readonly<WorkerProcessLimits> = Object.freeze({
    maxFrameBytes: 1024 * 1024,
    maxHeaderBytes: 1024,
    maxInboundCount: 64,
    maxInboundBytes: 4 * 1024 * 1024,
    maxPendingWrites: 64,
    maxPendingWriteBytes: 4 * 1024 * 1024,
    maxEarlyMessages: 64,
    maxEarlyBytes: 4 * 1024 * 1024,
    maxStderrBytes: 16 * 1024,
    maxRecords: 256,
    startupTimeoutMs: 10000,
    partialFrameTimeoutMs: 10000,
    writeTimeoutMs: 10000,
    stopTimeoutMs: 2000,
    killTimeoutMs: 3000,
});

function objectValue(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validId(value: unknown): boolean {
    return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}

export function validateWorkerEnvelope(value: unknown): asserts value is WorkerRpcMessage {
    if (!objectValue(value) || value.jsonrpc !== "2.0") throw new Error("Invalid JSON-RPC envelope");
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
    let allowed: string[];
    if (has("method")) {
        if (typeof value.method !== "string" || !value.method.length || (has("id") && !validId(value.id))) throw new Error("Invalid JSON-RPC request");
        if (has("params") && !Array.isArray(value.params) && !objectValue(value.params)) throw new Error("Invalid JSON-RPC parameters");
        allowed = ["jsonrpc", "method", "id", "params"];
    } else {
        if (!has("id") || (value.id !== null && !validId(value.id)) || has("result") === has("error")) throw new Error("Invalid JSON-RPC response");
        if (has("error")) {
            const error = value.error;
            if (!objectValue(error) || !Number.isSafeInteger(error.code) || typeof error.message !== "string" || Object.keys(error).some((key) => !["code", "message", "data"].includes(key)))
                throw new Error("Invalid JSON-RPC error");
        }
        allowed = ["jsonrpc", "id", "result", "error"];
    }
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unexpected JSON-RPC field");
}

export function immutableWorkerMessage(value: unknown, maxBytes: number): { message: WorkerRpcMessage; bytes: number } {
    let budget = 0;
    const visit = (item: unknown, depth: number): void => {
        if (depth > 64) throw new Error("JSON nesting limit");
        budget += 1;
        if (typeof item === "string") budget += Buffer.byteLength(item, "utf8");
        else if (typeof item === "number") {
            if (!Number.isFinite(item)) throw new Error("Non-finite JSON number");
        } else if (item !== null && typeof item !== "boolean") {
            if (Array.isArray(item)) {
                if (item.length > Math.floor((maxBytes - budget - 1) / 2)) throw new Error("JSON byte limit");
                budget += item.length + 1;
                for (let index = 0; index < item.length; index++) {
                    const descriptor = Object.getOwnPropertyDescriptor(item, index);
                    if (!descriptor) throw new Error("Sparse JSON arrays forbidden");
                    if (!("value" in descriptor)) throw new Error("JSON accessors forbidden");
                    visit(descriptor.value, depth + 1);
                }
                if (Object.keys(item).some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) throw new Error("JSON array properties forbidden");
            } else {
                if (!objectValue(item)) throw new Error("Non-JSON value");
                for (const key of Object.keys(item)) {
                    budget += Buffer.byteLength(key, "utf8");
                    if (budget > maxBytes) throw new Error("JSON byte limit");
                    const descriptor = Object.getOwnPropertyDescriptor(item, key);
                    if (!descriptor || !("value" in descriptor)) throw new Error("JSON accessors forbidden");
                    visit(descriptor.value, depth + 1);
                }
            }
        }
        if (budget > maxBytes) throw new Error("JSON byte limit");
    };
    visit(value, 0);
    validateWorkerEnvelope(value);
    const json = JSON.stringify(value);
    const bytes = Buffer.byteLength(json, "utf8");
    if (bytes > maxBytes) throw new Error("JSON byte limit");
    const message: WorkerRpcMessage = JSON.parse(json);
    const freeze = (item: unknown): void => {
        if (item !== null && typeof item === "object") {
            for (const child of Object.values(item)) freeze(child);
            Object.freeze(item);
        }
    };
    freeze(message);
    return { message, bytes };
}

export class BoundedWorkerReader {
    private readonly input = new PassThrough();
    private readonly reader = new StreamMessageReader(this.input);
    private readonly header: Buffer;
    private headerLength = 0;
    private frame?: Buffer;
    private frameOffset = 0;
    private bodyOffset = 0;
    private readonly frames: { frame: Buffer; bytes: number }[] = [];
    private reservedBytes = 0;
    private reservedCount = 0;
    private inFlight = false;
    private ended = false;
    private disposed = false;
    private partialTimer?: ReturnType<typeof setTimeout>;
    private readonly listening: { dispose(): void };

    constructor(
        private readonly source: Readable,
        private readonly limits: WorkerProcessLimits,
        private readonly onMessage: (message: WorkerRpcMessage, bytes: number) => void,
        private readonly onFailure: () => void,
        private readonly onEnd: () => void,
    ) {
        this.header = Buffer.alloc(limits.maxHeaderBytes);
        this.reader.partialMessageTimeout = 0;
        this.reader.onError(() => this.fail());
        this.listening = this.reader.listen((message) => {
            if (this.disposed) return;
            const current = this.frames.shift();
            if (!current) return this.fail();
            try {
                validateWorkerEnvelope(message);
                const immutable = immutableWorkerMessage(message, limits.maxFrameBytes);
                this.onMessage(immutable.message, current.bytes);
            } catch {
                this.fail();
            }
            this.reservedBytes -= current.frame.length;
            this.reservedCount -= 1;
            this.inFlight = false;
            queueMicrotask(() => this.pump());
        });
        source.on("data", this.data);
        source.on("end", this.end);
        source.on("close", this.close);
        source.on("error", this.fail);
    }

    private readonly data = (chunk: unknown): void => {
        if (this.disposed) return;
        if (!Buffer.isBuffer(chunk)) return this.fail();
        let offset = 0;
        try {
            while (offset < chunk.length && !this.disposed) {
                if (!this.partialTimer) this.partialTimer = setTimeout(this.fail, this.limits.partialFrameTimeoutMs);
                if (!this.frame) {
                    const byte = chunk[offset++];
                    const previous = this.headerLength ? this.header[this.headerLength - 1] : undefined;
                    if (byte > 126 || (byte < 32 && byte !== 13 && byte !== 10) || (byte === 10 && previous !== 13) || (previous === 13 && byte !== 10)) throw new Error("Invalid header byte");
                    if (this.headerLength >= this.header.length) throw new Error("Header limit");
                    this.header[this.headerLength++] = byte;
                    if (this.headerLength < 4 || this.header.subarray(this.headerLength - 4, this.headerLength).toString("ascii") !== "\r\n\r\n") continue;
                    const lines = this.header
                        .subarray(0, this.headerLength - 4)
                        .toString("ascii")
                        .split("\r\n");
                    const lengths = lines.filter((line) => /^Content-Length: /i.test(line));
                    if (lengths.length !== 1 || !/^Content-Length: (0|[1-9][0-9]*)$/i.test(lengths[0])) throw new Error("Invalid Content-Length");
                    if (lines.some((line) => line !== lengths[0] && !/^Content-Type: application\/(?:vscode-jsonrpc|json); charset=utf-8$/i.test(line))) throw new Error("Invalid header");
                    if (lines.length > 2) throw new Error("Duplicate header");
                    const length = Number(lengths[0].slice("Content-Length: ".length));
                    if (!Number.isSafeInteger(length) || length < 1 || length > this.limits.maxFrameBytes) throw new Error("Body limit");
                    const frameBytes = this.headerLength + length;
                    if (this.reservedCount >= this.limits.maxInboundCount || this.reservedBytes + frameBytes > this.limits.maxInboundBytes) throw new Error("Inbound queue limit");
                    this.reservedCount += 1;
                    this.reservedBytes += frameBytes;
                    this.frame = Buffer.alloc(frameBytes);
                    this.header.copy(this.frame, 0, 0, this.headerLength);
                    this.bodyOffset = this.headerLength;
                    this.frameOffset = this.headerLength;
                    this.headerLength = 0;
                }
                const count = Math.min(chunk.length - offset, this.frame.length - this.frameOffset);
                chunk.copy(this.frame, this.frameOffset, offset, offset + count);
                offset += count;
                this.frameOffset += count;
                if (this.frameOffset === this.frame.length) {
                    const body = this.frame.subarray(this.bodyOffset);
                    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
                    const parsed: unknown = JSON.parse(text);
                    immutableWorkerMessage(parsed, this.limits.maxFrameBytes);
                    this.frames.push({ frame: this.frame, bytes: body.length });
                    this.frame = undefined;
                    clearTimeout(this.partialTimer);
                    this.partialTimer = undefined;
                    this.pump();
                }
            }
        } catch {
            this.fail();
        }
    };

    private pump(): void {
        if (this.disposed || this.inFlight) return;
        if (this.frames.length) {
            this.inFlight = true;
            this.input.write(this.frames[0].frame);
        } else if (this.ended) {
            this.dispose();
            this.onEnd();
        }
    }

    private readonly end = (): void => {
        if (this.headerLength || this.frame) return this.fail();
        this.ended = true;
        this.pump();
    };

    private readonly close = (): void => {
        if (!this.ended) this.fail();
    };

    private readonly fail = (): void => {
        if (this.disposed) return;
        this.dispose();
        this.onFailure();
    };

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        clearTimeout(this.partialTimer);
        this.source.off("data", this.data);
        this.source.off("end", this.end);
        this.source.off("close", this.close);
        this.source.off("error", this.fail);
        this.listening.dispose();
        this.reader.dispose();
        this.input.destroy();
        this.frames.length = 0;
        this.frame = undefined;
    }
}
