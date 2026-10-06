import { createHash, randomUUID } from "crypto";
import type { WebContents } from "electron";
import { EventEmitter } from "events";
import { NATIVE_WORKER_CONSENT_CHANNELS } from "../../common/ipc/channels";
import type { NativeWorkerConsentDecision, NativeWorkerConsentDescriptor, NativeWorkerConsentRecord, NativeWorkerConsentRequest, WorkerDeclaration } from "../../common/types";
import { normalizeWorkerMetadata } from "../utilities/workerMetadata";

const SOURCE = "https://api.nuget.org/v3/index.json" as const;

export interface NativeWorkerIdentity {
    toolId: string;
    toolName: string;
    toolVersion: string;
    declaration: WorkerDeclaration;
}

export interface NativeWorkerConsentStore {
    getNativeWorkerConsentRows(): unknown;
    setNativeWorkerConsentRows(rows: NativeWorkerConsentRecord[]): void;
}

interface Owner {
    sender: WebContents;
    resolve: (value: NativeWorkerConsentRecord) => void;
    reject: (error: Error) => void;
    closed: () => void;
    signal?: AbortSignal;
}

interface Pending {
    request: NativeWorkerConsentRequest;
    owners: Set<Owner>;
    timer: ReturnType<typeof setTimeout>;
    main?: WebContents;
    mainClosed?: () => void;
}

export function nativeWorkerConsentSnapshot(identity: NativeWorkerIdentity, workerId: string): NativeWorkerConsentDescriptor {
    if (![identity.toolId, identity.toolName, identity.toolVersion, workerId].every((value) => typeof value === "string" && value.length > 0)) throw new Error("Invalid native worker identity");
    const normalized = normalizeWorkerMetadata({ [workerId]: identity.declaration }, "1.0.22")[workerId];
    const declaration = {
        kind: normalized.kind,
        packageId: normalized.packageId.toLowerCase(),
        packageVersion: normalized.packageVersion,
        command: normalized.command,
        dotnet: {
            targetFramework: normalized.dotnet.targetFramework,
            minimumRuntimeVersion: normalized.dotnet.minimumRuntimeVersion,
            rollForward: normalized.dotnet.rollForward,
        },
        platforms: [...normalized.platforms].sort(),
    };
    Object.freeze(declaration.dotnet);
    Object.freeze(declaration.platforms);
    Object.freeze(declaration);
    return Object.freeze({
        toolId: identity.toolId,
        toolName: identity.toolName,
        toolVersion: identity.toolVersion,
        workerId,
        declaration,
        source: SOURCE,
        protocolVersion: 1,
        platformMatrixVersion: 1,
    });
}

export function nativeWorkerConsentFingerprint(snapshot: NativeWorkerConsentDescriptor): string {
    const authority = {
        toolId: snapshot.toolId,
        toolVersion: snapshot.toolVersion,
        workerId: snapshot.workerId,
        declaration: snapshot.declaration,
        source: snapshot.source,
        protocolVersion: snapshot.protocolVersion,
        platformMatrixVersion: snapshot.platformMatrixVersion,
    };
    return createHash("sha256").update(JSON.stringify(authority)).digest("hex");
}

export class NativeWorkerConsentManager extends EventEmitter {
    private readonly pending = new Map<string, Pending>();
    private readonly revisions = new Map<string, number>();
    private active: Pending | null = null;
    private disposed = false;

    constructor(
        private readonly store: NativeWorkerConsentStore,
        private readonly getMain: () => WebContents | null,
        private readonly resolveIdentity: (sender: WebContents, workerId: string) => NativeWorkerIdentity | null,
        private readonly timeoutMs = 120_000,
    ) {
        super();
        this.store.setNativeWorkerConsentRows(this.readRecords());
    }

    private assertMain(sender: WebContents): void {
        if (this.disposed || sender.isDestroyed() || sender !== this.getMain()) throw new Error("Native worker consent requires the trusted main window");
    }

    private snapshot(sender: WebContents, workerId: string): NativeWorkerConsentDescriptor {
        if (this.disposed || sender.isDestroyed()) throw new Error("Native worker consent caller closed or disposed");
        const identity = this.resolveIdentity(sender, workerId);
        if (!identity) throw new Error("Native worker consent untrusted sender or missing declaration");
        return nativeWorkerConsentSnapshot(identity, workerId);
    }

    private readRecords(): NativeWorkerConsentRecord[] {
        const rows = this.store.getNativeWorkerConsentRows();
        if (!Array.isArray(rows)) return [];
        const valid = new Map<string, NativeWorkerConsentRecord>();
        for (const row of rows) {
            try {
                if (!row || row.source !== SOURCE || row.protocolVersion !== 1 || row.platformMatrixVersion !== 1 || typeof row.approvedAt !== "string" || !Number.isFinite(Date.parse(row.approvedAt)))
                    continue;
                const snapshot = nativeWorkerConsentSnapshot({ ...row, declaration: row.declaration }, row.workerId);
                const fingerprint = nativeWorkerConsentFingerprint(snapshot);
                if (row.fingerprint !== fingerprint) continue;
                valid.set(fingerprint, Object.freeze({ ...snapshot, fingerprint, approvedAt: row.approvedAt }));
            } catch {
                continue;
            }
        }
        return [...valid.values()];
    }

    getAll(sender: WebContents): NativeWorkerConsentRecord[] {
        this.assertMain(sender);
        return this.readRecords();
    }

    async authorizeLease(sender: WebContents, workerId: string, signal?: AbortSignal): Promise<{ readonly approval: NativeWorkerConsentRecord; readonly assertCurrent: () => void }> {
        const fingerprint = nativeWorkerConsentFingerprint(this.snapshot(sender, workerId));
        const revision = this.revisions.get(fingerprint) ?? 0;
        const approval = await this.authorize(sender, workerId, signal);
        const assertCurrent = (): void => {
            signal?.throwIfAborted();
            if ((this.revisions.get(fingerprint) ?? 0) !== revision || approval.fingerprint !== fingerprint || nativeWorkerConsentFingerprint(this.snapshot(sender, workerId)) !== fingerprint)
                throw new Error("Native worker consent revoked or source changed");
        };
        assertCurrent();
        return Object.freeze({ approval, assertCurrent });
    }

    async authorize(sender: WebContents, workerId: string, signal?: AbortSignal): Promise<NativeWorkerConsentRecord> {
        signal?.throwIfAborted();
        const snapshot = this.snapshot(sender, workerId);
        const fingerprint = nativeWorkerConsentFingerprint(snapshot);
        const revision = this.revisions.get(fingerprint) ?? 0;
        const existing = this.readRecords().find((record) => record.fingerprint === fingerprint);
        const result = existing
            ? await Promise.resolve(existing)
            : await new Promise<NativeWorkerConsentRecord>((resolve, reject) => {
                  let pending = this.pending.get(fingerprint);
                  if (!pending) {
                      pending = {
                          request: Object.freeze({ ...snapshot, fingerprint, requestId: randomUUID() }),
                          owners: new Set(),
                          timer: setTimeout(() => this.finish(fingerprint, new Error("Native worker consent timed out")), this.timeoutMs),
                      };
                      this.pending.set(fingerprint, pending);
                  }
                  const owner: Owner = {
                      sender,
                      signal,
                      resolve,
                      reject,
                      closed: () => {
                          pending.owners.delete(owner);
                          sender.removeListener("destroyed", owner.closed);
                          signal?.removeEventListener("abort", owner.closed);
                          reject(new Error("Native worker consent caller closed"));
                          if (!pending.owners.size) this.finish(fingerprint, new Error("Native worker consent caller closed"));
                      },
                  };
                  pending.owners.add(owner);
                  sender.once("destroyed", owner.closed);
                  signal?.addEventListener("abort", owner.closed, { once: true });
                  if (signal?.aborted) owner.closed();
                  this.showNext();
              });
        if ((this.revisions.get(fingerprint) ?? 0) !== revision || nativeWorkerConsentFingerprint(this.snapshot(sender, workerId)) !== fingerprint)
            throw new Error("Native worker consent revoked or source changed");
        return result;
    }

    respond(sender: WebContents, requestId: string, decision: NativeWorkerConsentDecision): boolean {
        this.assertMain(sender);
        const pending = this.active;
        if (!pending || pending.main !== sender || pending.request.requestId !== requestId || !["allow-tool", "allow-once", "reject"].includes(decision)) return false;
        const fingerprint = pending.request.fingerprint;
        for (const owner of [...pending.owners]) {
            try {
                if (nativeWorkerConsentFingerprint(this.snapshot(owner.sender, pending.request.workerId)) !== fingerprint) throw new Error("Native worker consent source changed");
            } catch (error) {
                pending.owners.delete(owner);
                owner.sender.removeListener("destroyed", owner.closed);
                owner.signal?.removeEventListener("abort", owner.closed);
                owner.reject(error instanceof Error ? error : new Error("Native worker consent source changed"));
            }
        }
        if (!pending.owners.size || decision === "reject") {
            this.finish(fingerprint, new Error("Native worker consent rejected"));
            return true;
        }
        const descriptor = nativeWorkerConsentSnapshot({ ...pending.request, declaration: pending.request.declaration }, pending.request.workerId);
        const record = Object.freeze({ ...descriptor, fingerprint, approvedAt: new Date().toISOString() });
        if (decision === "allow-tool") {
            try {
                this.store.setNativeWorkerConsentRows([...this.readRecords().filter((row) => row.fingerprint !== fingerprint), record]);
            } catch {
                this.finish(fingerprint, new Error("Native worker consent could not be saved"));
                return false;
            }
        }
        this.finish(fingerprint, undefined, record);
        return true;
    }

    revoke(sender: WebContents, fingerprint: string): void {
        this.assertMain(sender);
        if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid consent fingerprint");
        this.store.setNativeWorkerConsentRows(this.readRecords().filter((row) => row.fingerprint !== fingerprint));
        this.revisions.set(fingerprint, (this.revisions.get(fingerprint) ?? 0) + 1);
        this.finish(fingerprint, new Error("Native worker consent revoked"));
        this.emit("revoked", Object.freeze({ fingerprint }));
    }

    dispose(): void {
        this.disposed = true;
        for (const fingerprint of [...this.pending.keys()]) this.finish(fingerprint, new Error("Native worker consent disposed"));
        this.removeAllListeners();
    }

    private showNext(): void {
        if (this.active || this.disposed) return;
        const pending = this.pending.values().next().value as Pending | undefined;
        if (!pending) return;
        const main = this.getMain();
        if (!main || main.isDestroyed()) {
            this.finish(pending.request.fingerprint, new Error("Native worker consent UI unavailable"));
            return;
        }
        this.active = pending;
        pending.main = main;
        pending.mainClosed = () => {
            for (const fingerprint of [...this.pending.keys()]) this.finish(fingerprint, new Error("Native worker consent UI closed"));
        };
        main.once("destroyed", pending.mainClosed);
        try {
            main.send(NATIVE_WORKER_CONSENT_CHANNELS.REQUEST, pending.request);
        } catch {
            this.finish(pending.request.fingerprint, new Error("Native worker consent UI unavailable"));
        }
    }

    private finish(fingerprint: string, error?: Error, record?: NativeWorkerConsentRecord): void {
        const pending = this.pending.get(fingerprint);
        if (!pending) return;
        this.pending.delete(fingerprint);
        clearTimeout(pending.timer);
        if (this.active === pending) this.active = null;
        if (pending.mainClosed) pending.main?.removeListener("destroyed", pending.mainClosed);
        if (pending.main && !pending.main.isDestroyed()) {
            try {
                pending.main.send(NATIVE_WORKER_CONSENT_CHANNELS.CLOSED, pending.request.requestId);
            } catch {
                pending.main = undefined;
            }
        }
        for (const owner of pending.owners) {
            owner.sender.removeListener("destroyed", owner.closed);
            owner.signal?.removeEventListener("abort", owner.closed);
            if (error || !record) owner.reject(error ?? new Error("Native worker consent cancelled"));
            else owner.resolve(record);
        }
        pending.owners.clear();
        this.showNext();
    }
}
