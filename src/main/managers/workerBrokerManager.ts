import { createHash } from "crypto";
import type { WebContents } from "electron";
import type { DotNetToolPreparationRequest } from "../../common/types/dotnetTool";
import type { WorkerLaunchDescriptor, WorkerOwner, WorkerProcessHandle, WorkerProcessStart, WorkerRpcMessage } from "../../common/types/workerProcess";
import { dotNetStableJson } from "../utilities/dotnetToolPreparation";
import { DotNetDiscoveryManager } from "./dotnetDiscoveryManager";
import { DotNetToolManager } from "./dotnetToolManager";
import type { NativeWorkerIdentity } from "./nativeWorkerConsentManager";
import { NativeWorkerConsentManager, nativeWorkerConsentFingerprint, nativeWorkerConsentSnapshot } from "./nativeWorkerConsentManager";
import { WorkerProcessError, WorkerProcessManager, type WorkerProcessDependencies } from "./workerProcessManager";

export interface WorkerBrokerIdentity {
    readonly owner: WorkerOwner;
    readonly identity: NativeWorkerIdentity;
    readonly sourceFingerprint: string;
}

export interface WorkerBrokerDependencies {
    resolve(sender: WebContents, workerId: string): WorkerBrokerIdentity | null;
    consent: NativeWorkerConsentManager;
    discovery: Pick<DotNetDiscoveryManager, "discover">;
    preparationRoot: string;
    createPreparation?: (approve: (request: DotNetToolPreparationRequest) => Promise<boolean>) => Pick<DotNetToolManager, "prepare">;
    process?: Omit<WorkerProcessDependencies, "prepare">;
    cleanupTimeoutMs?: number;
    onStartupFailure?(code: string): void;
    onError(error: unknown): void;
}

interface Launch {
    sender: WebContents;
    owner: WorkerOwner;
    workerId: string;
    source: string;
    fingerprint: string;
    abort: AbortController;
    handle?: WorkerProcessHandle;
    preparing?: Promise<WorkerLaunchDescriptor>;
    request?: DotNetToolPreparationRequest;
    lease?: Awaited<ReturnType<NativeWorkerConsentManager["authorizeLease"]>>;
    unsubscribeTerminal?: () => void;
    stopping?: Promise<void>;
}

function ownerKey(owner: WorkerOwner): string {
    return JSON.stringify([owner.toolId, owner.instanceId]);
}

function launchKey(owner: WorkerOwner, workerId: string): string {
    return JSON.stringify([owner.toolId, owner.instanceId, workerId]);
}

function freezeAuthority<Value>(value: Value): Value {
    if (value !== null && typeof value === "object") {
        for (const nested of Object.values(value)) freezeAuthority(nested);
        Object.freeze(value);
    }
    return value;
}

function startupFailureCode(error: unknown): string {
    return error instanceof Error && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : "STARTUP_FAILED";
}

export class WorkerBrokerManager {
    private readonly launches = new Map<string, Launch>();
    private readonly closedOwners = new Set<string>();
    private readonly mutations = new Set<string>();
    private readonly processes: WorkerProcessManager;
    private shuttingDown = false;
    private readonly revoked = ({ fingerprint }: { fingerprint: string }): void => {
        const affected = [...this.launches.values()].filter((launch) => launch.fingerprint === fingerprint);
        for (const launch of affected) launch.abort.abort();
        void this.stopLaunches(affected).catch(this.dependencies.onError);
    };

    constructor(private readonly dependencies: WorkerBrokerDependencies) {
        this.processes = new WorkerProcessManager({
            ...dependencies.process,
            deferStartupTimeoutUntilLaunch: true,
            preserveStartupErrorCodes: true,
            beforeLaunch: (owner, workerId) => {
                const launch = this.launches.get(launchKey(owner, workerId));
                if (!launch) throw new WorkerProcessError("NOT_AUTHORIZED");
                this.check(launch);
                dependencies.process?.beforeLaunch?.(owner, workerId);
            },
            prepare: (owner, workerId, signal) => {
                const launch = this.launches.get(launchKey(owner, workerId));
                if (!launch) return Promise.reject(new WorkerProcessError("NOT_AUTHORIZED"));
                const abort = (): void => launch.abort.abort();
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) abort();
                launch.preparing = this.prepare(launch).finally(() => signal.removeEventListener("abort", abort));
                return launch.preparing;
            },
        });
        dependencies.consent.on("revoked", this.revoked);
    }

    private resolve(sender: WebContents, workerId: string): WorkerBrokerIdentity {
        if (sender.isDestroyed()) throw new WorkerProcessError("NOT_AUTHORIZED");
        const resolved = this.dependencies.resolve(sender, workerId);
        if (!resolved || resolved.owner.toolId !== resolved.identity.toolId || !/^[a-f0-9]{64}$/.test(resolved.sourceFingerprint)) throw new WorkerProcessError("NOT_AUTHORIZED");
        return resolved;
    }

    private check(launch: Launch): void {
        launch.abort.signal.throwIfAborted();
        if (this.shuttingDown || this.closedOwners.has(ownerKey(launch.owner)) || this.mutations.has(launch.owner.toolId)) throw new WorkerProcessError("OWNER_UNAVAILABLE");
        const live = this.resolve(launch.sender, launch.workerId);
        if (
            ownerKey(live.owner) !== ownerKey(launch.owner) ||
            live.sourceFingerprint !== launch.source ||
            nativeWorkerConsentFingerprint(nativeWorkerConsentSnapshot(live.identity, launch.workerId)) !== launch.fingerprint
        )
            throw new WorkerProcessError("SOURCE_CHANGED");
        launch.lease?.assertCurrent();
    }

    start(sender: WebContents, workerId: string): WorkerProcessStart {
        const resolved = this.resolve(sender, workerId);
        const launch: Launch = {
            sender,
            owner: Object.freeze({ ...resolved.owner }),
            workerId,
            source: resolved.sourceFingerprint,
            fingerprint: nativeWorkerConsentFingerprint(nativeWorkerConsentSnapshot(resolved.identity, workerId)),
            abort: new AbortController(),
        };
        this.check(launch);
        const key = launchKey(launch.owner, workerId);
        if (this.launches.has(key)) throw new WorkerProcessError("ALREADY_STARTED");
        this.launches.set(key, launch);
        try {
            const started = this.processes.start(launch.owner, workerId);
            void started.ready.catch((error: unknown) => {
                const code = startupFailureCode(error);
                if (["APPROVAL_DENIED", "CANCELLED", "CONSENT_REJECTED", "NOT_AUTHORIZED", "OWNER_UNAVAILABLE", "SOURCE_CHANGED", "TOOL_UNAVAILABLE", "WORKER_STOPPED"].includes(code)) return;
                try {
                    this.dependencies.onStartupFailure?.(code);
                } catch {
                    return;
                }
            });
            launch.handle = started.handle;
            launch.unsubscribeTerminal = this.processes.onTerminal(launch.owner, started.handle, () => {
                queueMicrotask(() => {
                    void this.stopLaunches([launch]).catch(this.dependencies.onError);
                });
            });
            return started;
        } catch (error) {
            this.launches.delete(key);
            throw error;
        }
    }

    private async prepare(launch: Launch): Promise<WorkerLaunchDescriptor> {
        this.check(launch);
        try {
            launch.lease = await this.dependencies.consent.authorizeLease(launch.sender, launch.workerId, launch.abort.signal);
        } catch (error) {
            if (launch.abort.signal.aborted) throw new WorkerProcessError("CANCELLED");
            if (error instanceof Error && error.message === "Native worker consent rejected") throw new WorkerProcessError("CONSENT_REJECTED");
            throw error;
        }
        this.check(launch);
        const declaration = launch.lease.approval.declaration;
        const control = { signal: launch.abort.signal, assertCurrent: () => this.check(launch) };
        const discovered = await this.dependencies.discovery.discover(declaration.dotnet, declaration.platforms, control);
        this.check(launch);
        if (!discovered.ok) throw new WorkerProcessError(discovered.error.code);
        const request = freezeAuthority(
            JSON.parse(
                dotNetStableJson({
                    identity: {
                        toolId: launch.owner.toolId,
                        toolVersion: launch.lease.approval.toolVersion,
                        workerId: launch.workerId,
                        sourceFingerprint: createHash("sha256")
                            .update(JSON.stringify([launch.fingerprint, launch.source]))
                            .digest("hex"),
                    },
                    declaration,
                    selection: discovered.value,
                    source: launch.lease.approval.source,
                }),
            ) as DotNetToolPreparationRequest,
        );
        launch.request = request;
        const approve = async (candidate: DotNetToolPreparationRequest): Promise<boolean> => {
            this.check(launch);
            return dotNetStableJson(candidate) === dotNetStableJson(request);
        };
        const preparation =
            this.dependencies.createPreparation?.(approve) ??
            new DotNetToolManager(this.dependencies.preparationRoot, {
                approve,
                rediscover: () => this.dependencies.discovery.discover(declaration.dotnet, declaration.platforms, control),
            });
        const prepared = await preparation.prepare(request, control);
        this.check(launch);
        if (
            dotNetStableJson(prepared.identity) !== dotNetStableJson(request.identity) ||
            dotNetStableJson(prepared.selection) !== dotNetStableJson(request.selection) ||
            prepared.declarationFingerprint !== createHash("sha256").update(dotNetStableJson(declaration)).digest("hex")
        )
            throw new WorkerProcessError("PREPARATION_CHANGED");
        return Object.freeze({
            executable: prepared.selection.hostPath,
            args: Object.freeze([
                "exec",
                "--runtimeconfig",
                prepared.runtimeConfigPath,
                "--depsfile",
                prepared.depsPath,
                "--fx-version",
                prepared.selection.runtime.version,
                "--roll-forward",
                prepared.selection.nativeRollForward,
                prepared.entryPoint,
            ]),
            cwd: prepared.workspace,
            env: Object.freeze({ DOTNET_ROOT: prepared.selection.hostRoot, DOTNET_ROLL_FORWARD: prepared.selection.nativeRollForward }),
        });
    }

    private owned(sender: WebContents, handle: WorkerProcessHandle): Launch {
        const launch = [...this.launches.values()].find((candidate) => candidate.handle === handle);
        if (!launch || sender !== launch.sender || ownerKey(this.resolve(sender, launch.workerId).owner) !== ownerKey(launch.owner)) throw new WorkerProcessError("NOT_AUTHORIZED");
        return launch;
    }

    send(sender: WebContents, handle: WorkerProcessHandle, message: unknown): Promise<void> {
        const launch = this.owned(sender, handle);
        this.check(launch);
        return this.processes.send(launch.owner, handle, message);
    }

    onMessage(sender: WebContents, handle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void): () => void {
        const launch = this.owned(sender, handle);
        this.check(launch);
        return this.processes.onMessage(launch.owner, handle, (message) => {
            this.check(launch);
            callback(message);
        });
    }

    snapshot(sender: WebContents, handle: WorkerProcessHandle) {
        const launch = this.owned(sender, handle);
        return this.processes.snapshot(launch.owner, handle);
    }

    onTerminal(sender: WebContents, handle: WorkerProcessHandle, callback: () => void): () => void {
        const launch = this.owned(sender, handle);
        return this.processes.onTerminal(launch.owner, handle, callback);
    }

    async stop(sender: WebContents, handle: WorkerProcessHandle): Promise<void> {
        await this.stopLaunches([this.owned(sender, handle)]);
    }

    private async stopLaunches(launches: Launch[]): Promise<void> {
        for (const launch of launches) launch.abort.abort();
        await Promise.all(launches.map((launch) => this.stopLaunch(launch)));
    }

    private stopLaunch(launch: Launch): Promise<void> {
        if (launch.stopping) return launch.stopping;
        const stopping = (async (): Promise<void> => {
            if (launch.handle) void this.processes.stop(launch.owner, launch.handle);
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new WorkerProcessError("PREPARATION_STOP_TIMEOUT")), this.dependencies.cleanupTimeoutMs ?? 5000);
                Promise.resolve(launch.preparing).then(
                    () => {
                        clearTimeout(timer);
                        resolve();
                    },
                    (error: unknown) => {
                        clearTimeout(timer);
                        if (error instanceof Error && "code" in error && (error.code === "WORKSPACE_INVALID" || error.code === "RESTORE_STOP_UNVERIFIED")) reject(error);
                        else resolve();
                    },
                );
            });
            if (launch.handle) await this.processes.stopAndVerify(launch.owner, launch.handle);
            launch.unsubscribeTerminal?.();
            launch.unsubscribeTerminal = undefined;
            launch.lease = undefined;
            launch.request = undefined;
            launch.preparing = undefined;
            if (this.launches.get(launchKey(launch.owner, launch.workerId)) === launch) this.launches.delete(launchKey(launch.owner, launch.workerId));
        })();
        launch.stopping = stopping;
        void stopping.catch(() => {
            if (launch.stopping === stopping) launch.stopping = undefined;
        });
        return stopping;
    }

    async disposeOwner(owner: WorkerOwner): Promise<void> {
        this.closedOwners.add(ownerKey(owner));
        await this.stopLaunches([...this.launches.values()].filter((launch) => ownerKey(launch.owner) === ownerKey(owner)));
    }

    async withToolMutation<Value>(toolId: string, mutate: () => Promise<Value>): Promise<Value> {
        if (this.shuttingDown || this.mutations.has(toolId)) throw new WorkerProcessError("TOOL_UNAVAILABLE");
        this.mutations.add(toolId);
        try {
            await this.stopLaunches([...this.launches.values()].filter((launch) => launch.owner.toolId === toolId));
            return await mutate();
        } finally {
            this.mutations.delete(toolId);
        }
    }

    async shutdown(): Promise<void> {
        this.shuttingDown = true;
        try {
            await this.stopLaunches([...this.launches.values()]);
            this.dependencies.consent.removeListener("revoked", this.revoked);
        } catch (error) {
            this.shuttingDown = false;
            throw error;
        }
    }
}
