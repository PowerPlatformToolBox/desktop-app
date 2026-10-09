/// <reference types="jest" />
import { execFile, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import type { WebContents } from "electron";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { StreamMessageReader } from "vscode-jsonrpc/node";
import { NATIVE_WORKER_CONSENT_CHANNELS } from "../../../../src/common/ipc/channels";
import type { DotNetPreparedTool, DotNetToolPreparationRequest } from "../../../../src/common/types/dotnetTool";
import type { DotNetDiscoveryResult, DotNetDiscoverySelection } from "../../../../src/common/types/dotnetWorker";
import { defaultExec, DotNetToolPreparationError } from "../../../../src/main/managers/dotnetToolManager";
import { NativeWorkerConsentManager, type NativeWorkerIdentity } from "../../../../src/main/managers/nativeWorkerConsentManager";
import { WorkerBrokerManager, type WorkerBrokerIdentity } from "../../../../src/main/managers/workerBrokerManager";
import type { WorkerChild, WorkerLaunchOptions } from "../../../../src/main/managers/workerProcessManager";
import { dotNetStableJson } from "../../../../src/main/utilities/dotnetToolPreparation";

jest.mock("child_process", () => ({ execFile: jest.fn(), spawn: jest.fn() }));

class Sender extends EventEmitter {
    readonly send = jest.fn();
    destroyed = false;
    constructor(readonly id: number) {
        super();
    }
    isDestroyed(): boolean {
        return this.destroyed;
    }
}

const web = (sender: Sender): WebContents => sender as unknown as WebContents;
const tick = async (): Promise<void> => {
    for (let index = 0; index < 8; index++) await new Promise<void>((resolve) => setImmediate(resolve));
};

class Child extends EventEmitter implements WorkerChild {
    readonly pid = 12345;
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    readonly messages: Record<string, unknown>[] = [];
    readonly stdin = new PassThrough();
    autoExit = true;
    constructor() {
        super();
        const reader = new StreamMessageReader(this.stdin);
        reader.listen((input) => {
            const message = input as unknown as Record<string, unknown>;
            this.messages.push(message);
            if (message.method === "platform/initialize") this.frame({ jsonrpc: "2.0", id: message.id, result: { protocol: "jsonrpc-stdio-v1", protocolVersion: 1 } });
        });
        this.stdin.on("finish", () => {
            reader.dispose();
            if (this.autoExit) this.exit();
        });
    }
    exit(code = 0, closeOutputs = true): void {
        this.emit("exit", code, null);
        if (closeOutputs) this.closeOutputs();
    }
    closeOutputs(): void {
        this.stdout.destroy();
        this.stderr.destroy();
    }
    frame(message: unknown): void {
        const body = JSON.stringify(message);
        this.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    }
}

function selection(): DotNetDiscoverySelection {
    const version = { major: 10, minor: 0, patch: 100, version: "10.0.100", directory: "/dotnet/sdk" };
    return {
        hostPath: "/dotnet/dotnet",
        hostRoot: "/dotnet",
        architecture: "arm64",
        platform: "macos-arm64",
        nativeRid: "osx-arm64",
        platformMatrixVersion: 1,
        sdk: version,
        sdkRuntime: version,
        runtime: { ...version, version: "10.0.1", patch: 1 },
        sdkRuntimeConfigPath: "/dotnet/sdk/dotnet.runtimeconfig.json",
        nativeRollForward: "Major",
        sdkPin: { sdk: { version: version.version, rollForward: "disable", allowPrerelease: false, paths: ["$host$"] } },
        attempts: [],
    };
}

describe("WorkerBrokerManager", () => {
    let main: Sender;
    let first: Sender;
    let second: Sender;
    let identity: NativeWorkerIdentity;
    let identities: Map<WebContents, WorkerBrokerIdentity>;
    let consent: NativeWorkerConsentManager;
    let broker: WorkerBrokerManager;
    let discover: jest.Mock;
    let prepare: jest.Mock;
    let launch: jest.Mock;
    let errors: jest.Mock;
    let startupFailures: jest.Mock;
    let children: Child[];
    let expectedShutdownFailure: string | undefined;

    const prompt = () => main.send.mock.calls.filter(([channel]) => channel === NATIVE_WORKER_CONSENT_CHANNELS.REQUEST).at(-1)?.[1];
    const allow = () => consent.respond(web(main), prompt().requestId, "allow-once");
    const start = async (sender = first) => {
        const started = broker.start(web(sender), "engine");
        allow();
        await started.ready;
        return started;
    };

    beforeEach(() => {
        expectedShutdownFailure = undefined;
        main = new Sender(1);
        first = new Sender(2);
        second = new Sender(3);
        identity = {
            toolId: "tool-a",
            toolName: "A",
            toolVersion: "1.0.0",
            declaration: {
                kind: "dotnet-tool",
                packageId: "Trusted.Worker",
                packageVersion: "1.0.0",
                command: "trusted-worker",
                dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0", rollForward: "Major" },
                platforms: ["macos-arm64"],
            },
        };
        identities = new Map([first, second].map((sender) => [web(sender), { owner: { toolId: "tool-a", instanceId: `instance-${sender.id}` }, identity, sourceFingerprint: "a".repeat(64) }]));
        consent = new NativeWorkerConsentManager(
            { getNativeWorkerConsentRows: () => [], setNativeWorkerConsentRows: () => undefined },
            () => web(main),
            (sender, workerId) => (workerId === "engine" ? (identities.get(sender)?.identity ?? null) : null),
        );
        discover = jest.fn(async (): Promise<DotNetDiscoveryResult> => ({ ok: true, value: selection() }));
        prepare = jest.fn(
            async (request: DotNetToolPreparationRequest): Promise<DotNetPreparedTool> => ({
                identity: request.identity,
                declarationFingerprint: createHash("sha256").update(dotNetStableJson(request.declaration)).digest("hex"),
                preparationFingerprint: "b".repeat(64),
                workspace: "/cache/worker",
                manifestPath: "/cache/worker/.config/dotnet-tools.json",
                packageId: request.declaration.packageId,
                packageVersion: request.declaration.packageVersion,
                command: request.declaration.command,
                entryPoint: "/cache/worker/Worker.dll",
                runtimeConfigPath: "/cache/worker/Worker.runtimeconfig.json",
                depsPath: "/cache/worker/Worker.deps.json",
                selection: request.selection,
                integrityHash: "c".repeat(64),
                reused: false,
            }),
        );
        children = [];
        errors = jest.fn();
        startupFailures = jest.fn();
        launch = jest.fn((_descriptor, _options: WorkerLaunchOptions) => {
            const child = new Child();
            children.push(child);
            return child;
        });
        broker = new WorkerBrokerManager({
            resolve: (sender, workerId) => (workerId === "engine" ? (identities.get(sender) ?? null) : null),
            consent,
            discovery: { discover },
            preparationRoot: "/cache",
            createPreparation: (approve) => ({
                prepare: async (request, control) => {
                    if (!(await approve(request))) throw new Error("denied");
                    control?.assertCurrent();
                    return prepare(request, control);
                },
            }),
            process: { launch, platform: "darwin", killTree: async () => undefined, limits: { stopTimeoutMs: 10, killTimeoutMs: 10 } },
            onError: errors,
            onStartupFailure: startupFailures,
            cleanupTimeoutMs: 100,
        });
    });

    afterEach(async () => {
        if (expectedShutdownFailure) await expect(broker.shutdown()).rejects.toThrow(expectedShutdownFailure);
        else await broker.shutdown();
        consent.dispose();
    });

    it("rejects main, unknown, spoofed and undeclared callers before consent or discovery", () => {
        for (const sender of [main, new Sender(99), new Sender(first.id)]) expect(() => broker.start(web(sender), "engine")).toThrow("NOT_AUTHORIZED");
        expect(() => broker.start(web(first), "missing")).toThrow("NOT_AUTHORIZED");
        expect(discover).not.toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
        expect(main.send).not.toHaveBeenCalled();
    });

    it("denial never discovers, prepares or launches", async () => {
        const started = broker.start(web(first), "engine");
        consent.respond(web(main), prompt().requestId, "reject");
        await expect(started.ready).rejects.toThrow("CONSENT_REJECTED");
        await tick();
        expect(startupFailures).not.toHaveBeenCalled();
        expect(discover).not.toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    });

    it("allows once through initialize using an immutable descriptor and sanitized environment", async () => {
        const started = await start();
        expect(main.send.mock.calls.filter(([channel]) => channel === NATIVE_WORKER_CONSENT_CHANNELS.REQUEST)).toHaveLength(1);
        expect(consent.getAll(web(main))).toEqual([]);
        const [descriptor, options] = launch.mock.calls[0];
        expect(Object.isFrozen(descriptor)).toBe(true);
        expect(Object.isFrozen(descriptor.args)).toBe(true);
        expect(options.shell).toBe(false);
        expect(options.env.PATH).toBeUndefined();
        expect(options.env.ACCESS_TOKEN).toBeUndefined();
        expect(descriptor.args).toContain("/cache/worker/Worker.dll");
        expect(children[0].messages[0].method).toBe("platform/initialize");
        expect(broker.snapshot(web(first), started.handle).state).toBe("running");
        expect(prepare.mock.calls[0][0].identity.sourceFingerprint).not.toBe("a".repeat(64));
    });

    it("targets subscriptions and rejects all foreign-handle operations", async () => {
        const started = await start();
        const receive = jest.fn();
        broker.onMessage(web(first), started.handle, receive);
        children[0].frame({ jsonrpc: "2.0", method: "progress", params: { value: 1 } });
        await tick();
        expect(receive).toHaveBeenCalledTimes(1);
        expect(second.send).not.toHaveBeenCalled();
        expect(() => broker.send(web(second), started.handle, { jsonrpc: "2.0", method: "ping" })).toThrow("NOT_AUTHORIZED");
        expect(() => broker.onMessage(web(second), started.handle, receive)).toThrow("NOT_AUTHORIZED");
        expect(() => broker.snapshot(web(second), started.handle)).toThrow("NOT_AUTHORIZED");
        await expect(broker.stop(web(second), started.handle)).rejects.toThrow("NOT_AUTHORIZED");
    });

    it("owner disposal stops only that instance and blocks further starts", async () => {
        const firstStart = await start();
        const secondStart = await start(second);
        await broker.disposeOwner(identities.get(web(first))!.owner);
        expect(children[0].stdin.destroyed).toBe(true);
        expect(broker.snapshot(web(second), secondStart.handle).state).toBe("running");
        expect(() => broker.snapshot(web(first), firstStart.handle)).toThrow();
        expect(() => broker.start(web(first), "engine")).toThrow("OWNER_UNAVAILABLE");
    });

    it("cancels a pending consent prompt on owner disposal", async () => {
        const started = broker.start(web(first), "engine");
        await broker.disposeOwner(identities.get(web(first))!.owner);
        await expect(started.ready).rejects.toThrow();
        expect(launch).not.toHaveBeenCalled();
        expect(consent.respond(web(main), prompt().requestId, "allow-once")).toBe(false);
    });

    it("unsupported discovery never prepares or launches", async () => {
        discover.mockResolvedValue({ ok: false, error: { code: "PLATFORM_UNSUPPORTED", message: "unsupported" }, attempts: [] });
        const started = broker.start(web(first), "engine");
        allow();
        await expect(started.ready).rejects.toThrow();
        await tick();
        expect(prepare).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    });

    it.each(["revoke", "source", "declaration", "closed"])("rejects %s while discovery is pending", async (change) => {
        let finish!: (value: DotNetDiscoveryResult) => void;
        discover.mockImplementation(
            () =>
                new Promise<DotNetDiscoveryResult>((resolve) => {
                    finish = resolve;
                }),
        );
        const started = broker.start(web(first), "engine");
        const fingerprint = prompt().fingerprint;
        allow();
        await tick();
        if (change === "revoke") consent.revoke(web(main), fingerprint);
        if (change === "source") identities.set(web(first), { ...identities.get(web(first))!, sourceFingerprint: "d".repeat(64) });
        if (change === "declaration") identity.declaration.packageVersion = "2.0.0";
        if (change === "closed") first.destroyed = true;
        finish({ ok: true, value: selection() });
        await expect(started.ready).rejects.toThrow();
        await tick();
        expect(prepare).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    });

    it("revocation aborts preparation and stops every matching live instance", async () => {
        const firstStart = await start();
        const secondStart = await start(second);
        consent.revoke(web(main), prompt().fingerprint);
        await tick();
        expect(children.every((child) => child.stdin.destroyed)).toBe(true);
        expect(() => broker.snapshot(web(first), firstStart.handle)).toThrow();
        expect(() => broker.snapshot(web(second), secondStart.handle)).toThrow();
    });

    it("blocks starts throughout tool mutation and waits for preparation to settle before deleting", async () => {
        let finish!: (value: DotNetPreparedTool) => void;
        const original = prepare.getMockImplementation()!;
        prepare.mockImplementation(
            () =>
                new Promise<DotNetPreparedTool>((resolve) => {
                    finish = resolve;
                }),
        );
        const started = broker.start(web(first), "engine");
        allow();
        await tick();
        const mutate = jest.fn(async () => "updated");
        const mutation = broker.withToolMutation("tool-a", mutate);
        await tick();
        expect(mutate).not.toHaveBeenCalled();
        expect(() => broker.start(web(second), "engine")).toThrow("OWNER_UNAVAILABLE");
        const request = prepare.mock.calls[0][0];
        finish(await original(request));
        await expect(mutation).resolves.toBe("updated");
        await expect(started.ready).rejects.toThrow();
        expect(launch).not.toHaveBeenCalled();
    });

    it("rejects a substituted prepared identity before launch", async () => {
        const original = prepare.getMockImplementation()!;
        prepare.mockImplementation(async (request) => ({ ...(await original(request)), identity: { ...request.identity, toolId: "foreign" } }));
        const started = broker.start(web(first), "engine");
        allow();
        await expect(started.ready).rejects.toThrow();
        await tick();
        expect(launch).not.toHaveBeenCalled();
    });

    it("revocation during preparation aborts the signal and prevents launch", async () => {
        let finish!: () => void;
        const original = prepare.getMockImplementation()!;
        prepare.mockImplementation(async (request, control) => {
            await new Promise<void>((resolve) => {
                finish = resolve;
            });
            expect(control.signal.aborted).toBe(true);
            return original(request);
        });
        const started = broker.start(web(first), "engine");
        const fingerprint = prompt().fingerprint;
        allow();
        await tick();
        consent.revoke(web(main), fingerprint);
        finish();
        await expect(started.ready).rejects.toThrow();
        await tick();
        expect(launch).not.toHaveBeenCalled();
    });

    it("failed verified stop prevents update or uninstall while a child may still be alive", async () => {
        await start();
        children[0].autoExit = false;
        const remove = jest.fn(async () => undefined);
        await expect(broker.withToolMutation("tool-a", remove)).rejects.toThrow("EXIT_NOT_OBSERVED");
        expect(remove).not.toHaveBeenCalled();
        children[0].exit();
        await tick();
        await broker.withToolMutation("tool-a", remove);
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it.each(["exit", "crash", "error"])("releases a ready worker after %s for explicit restart without replay", async (terminal) => {
        const started = await start();
        const unsubscribe = broker.onMessage(web(first), started.handle, jest.fn());
        await broker.send(web(first), started.handle, { jsonrpc: "2.0", id: 42, method: "write" });
        if (terminal === "error") children[0].emit("error", new Error("process failed"));
        else children[0].exit(terminal === "crash" ? 1 : 0);
        await tick();
        expect(launch).toHaveBeenCalledTimes(1);
        expect(() => broker.snapshot(web(first), started.handle)).toThrow("NOT_AUTHORIZED");
        expect(() => unsubscribe()).not.toThrow();
        const restarted = await start();
        expect(restarted.handle).not.toBe(started.handle);
        expect(launch).toHaveBeenCalledTimes(2);
        expect(children[1].messages.map((message) => message.method)).toEqual(["platform/initialize"]);
    });

    it("allows intentional stop followed by explicit restart", async () => {
        const started = await start();
        await broker.stop(web(first), started.handle);
        const restarted = await start();
        expect(restarted.handle).not.toBe(started.handle);
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it("retains an owner-close quarantine as a mutation and shutdown blocker until pipes close", async () => {
        await start();
        children[0].autoExit = false;
        children[0].exit(0, false);
        const owner = identities.get(web(first))!.owner;
        await expect(broker.disposeOwner(owner)).rejects.toThrow("STOP_UNVERIFIED");
        const mutate = jest.fn(async () => undefined);
        await expect(broker.withToolMutation("tool-a", mutate)).rejects.toThrow("STOP_UNVERIFIED");
        await expect(broker.shutdown()).rejects.toThrow("STOP_UNVERIFIED");
        expect(mutate).not.toHaveBeenCalled();
        expect(() => broker.start(web(first), "engine")).toThrow("OWNER_UNAVAILABLE");
        children[0].closeOutputs();
        await tick();
        await broker.withToolMutation("tool-a", mutate);
        expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("waits for canceled preparation settlement before owner cleanup completes", async () => {
        let cancel!: () => void;
        prepare.mockImplementation(
            (_request, control) =>
                new Promise((_resolve, reject) => {
                    cancel = () => {
                        expect(control.signal.aborted).toBe(true);
                        reject(new DotNetToolPreparationError("CANCELLED"));
                    };
                }),
        );
        const started = broker.start(web(first), "engine");
        allow();
        await tick();
        const disposed = broker.disposeOwner(identities.get(web(first))!.owner);
        const settled = jest.fn();
        void disposed.then(settled);
        await tick();
        expect(settled).not.toHaveBeenCalled();
        cancel();
        await disposed;
        await expect(started.ready).rejects.toThrow("WORKER_STOPPED");
        expect(launch).not.toHaveBeenCalled();
    });

    it("mutation waits for the default restore adapter close, not its early abort callback", async () => {
        const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true) });
        let callback!: (error: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void;
        jest.mocked(execFile).mockImplementation(((_host: string, _args: string[], _options: unknown, complete: typeof callback) => {
            callback = complete;
            return child as unknown as ChildProcess;
        }) as typeof execFile);
        prepare.mockImplementation((_request, control) =>
            defaultExec("/dotnet/dotnet", ["tool", "restore"], {
                signal: control.signal,
                cwd: "/cache/stage",
                env: {},
                encoding: "utf8",
                shell: false,
                timeout: 1000,
                terminationTimeoutMs: 1000,
                killSignal: "SIGKILL",
                maxBuffer: 1024,
                windowsHide: true,
            }),
        );
        const started = broker.start(web(first), "engine");
        allow();
        await tick();
        const rejected = expect(started.ready).rejects.toThrow("WORKER_STOPPED");
        const mutate = jest.fn(async () => "updated");
        const mutation = broker.withToolMutation("tool-a", mutate);
        let settled = false;
        const observed = mutation.then(() => {
            settled = true;
        });
        callback(Object.assign(new Error("aborted"), { name: "AbortError" }), "", "");
        child.emit("exit", null, "SIGKILL");
        await tick();
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        expect(settled).toBe(false);
        expect(mutate).not.toHaveBeenCalled();
        child.stdout.destroy();
        child.stderr.destroy();
        child.emit("close", null, "SIGKILL");
        await expect(mutation).resolves.toBe("updated");
        await observed;
        await rejected;
        expect(mutate).toHaveBeenCalledTimes(1);
        expect(launch).not.toHaveBeenCalled();
        child.stdin.destroy();
    });

    it.each(["WORKSPACE_INVALID", "RESTORE_STOP_UNVERIFIED"] as const)("rejects mutation and shutdown when aborted preparation cleanup fails: %s", async (code) => {
        prepare.mockImplementation(
            (_request, control) =>
                new Promise((_resolve, reject) => {
                    control.signal.addEventListener("abort", () => reject(new DotNetToolPreparationError(code)), { once: true });
                }),
        );
        const started = broker.start(web(first), "engine");
        allow();
        await tick();
        const mutate = jest.fn(async () => undefined);
        expectedShutdownFailure = code;
        await expect(broker.withToolMutation("tool-a", mutate)).rejects.toThrow(code);
        await expect(broker.disposeOwner(identities.get(web(first))!.owner)).rejects.toThrow(code);
        await expect(started.ready).rejects.toThrow("WORKER_STOPPED");
        expect(mutate).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
    });

    it.each(["WORKSPACE_INVALID", "RESTORE_STOP_UNVERIFIED", "RESTORE_FAILED"] as const)("retains spontaneous preparation failure details: %s", async (code) => {
        prepare.mockRejectedValue(new DotNetToolPreparationError(code));
        const started = broker.start(web(first), "engine");
        allow();
        await expect(started.ready).rejects.toThrow(code);
        await tick();
        expect(startupFailures).toHaveBeenCalledWith(code);
        if (code === "WORKSPACE_INVALID" || code === "RESTORE_STOP_UNVERIFIED") {
            const mutate = jest.fn(async () => undefined);
            expectedShutdownFailure = code;
            await expect(broker.withToolMutation("tool-a", mutate)).rejects.toThrow(code);
            expect(mutate).not.toHaveBeenCalled();
            expect(() => broker.start(web(first), "engine")).toThrow("ALREADY_STARTED");
        }
        if (code !== "RESTORE_FAILED") expect(errors).toHaveBeenCalledWith(expect.objectContaining({ code }));
    });

    it("rejects mutation on preparation timeout and permits cleanup retry only after settlement", async () => {
        let cancel!: () => void;
        prepare.mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    cancel = () => reject(new DotNetToolPreparationError("CANCELLED"));
                }),
        );
        const started = broker.start(web(first), "engine");
        allow();
        await tick();
        const mutate = jest.fn(async () => undefined);
        await expect(broker.withToolMutation("tool-a", mutate)).rejects.toThrow("PREPARATION_STOP_TIMEOUT");
        expect(mutate).not.toHaveBeenCalled();
        expect(() => broker.start(web(first), "engine")).toThrow("ALREADY_STARTED");
        cancel();
        await tick();
        await broker.withToolMutation("tool-a", mutate);
        await expect(started.ready).rejects.toThrow("WORKER_STOPPED");
        expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("mutation of one tool does not stop another tool", async () => {
        await start();
        identities.set(web(second), { ...identities.get(web(second))!, owner: { toolId: "tool-b", instanceId: "instance-b" }, identity: { ...identity, toolId: "tool-b" } });
        const other = await start(second);
        await broker.withToolMutation("tool-a", async () => undefined);
        expect(broker.snapshot(web(second), other.handle).state).toBe("running");
    });
});
