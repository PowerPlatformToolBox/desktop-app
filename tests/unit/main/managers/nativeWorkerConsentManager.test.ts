/// <reference types="jest" />

import type { WebContents } from "electron";
import { EventEmitter } from "events";
import { NATIVE_WORKER_CONSENT_CHANNELS } from "../../../../src/common/ipc/channels";
import type { NativeWorkerConsentRecord, NativeWorkerConsentRequest, WorkerDeclaration } from "../../../../src/common/types";
import type { NativeWorkerConsentStore, NativeWorkerIdentity } from "../../../../src/main/managers/nativeWorkerConsentManager";
import { NativeWorkerConsentManager, nativeWorkerConsentFingerprint, nativeWorkerConsentSnapshot } from "../../../../src/main/managers/nativeWorkerConsentManager";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";
import { NATIVE_WORKER_WARNING, nativeWorkerConsentDetails } from "../../../../src/renderer/modules/consent/nativeWorkerConsentModal";

class FakeWebContents extends EventEmitter {
    readonly send = jest.fn();
    private destroyed = false;

    constructor(readonly id: number) {
        super();
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    destroy(): void {
        this.destroyed = true;
        this.emit("destroyed");
    }
}

function webContents(sender: FakeWebContents): WebContents {
    return sender as unknown as WebContents;
}

function declaration(): WorkerDeclaration {
    return {
        kind: "dotnet-tool",
        packageId: "Trusted.Worker",
        packageVersion: "1.2.3",
        command: "trusted-worker",
        dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0" },
        platforms: ["windows-x64", "linux-x64"],
    };
}

describe("NativeWorkerConsentManager", () => {
    let main: FakeWebContents;
    let sender: FakeWebContents;
    let second: FakeWebContents;
    let identities: Map<number, NativeWorkerIdentity>;
    let identity: NativeWorkerIdentity;
    let rows: unknown;
    let store: NativeWorkerConsentStore;
    let manager: NativeWorkerConsentManager;

    const request = (): NativeWorkerConsentRequest => main.send.mock.calls.filter(([channel]) => channel === NATIVE_WORKER_CONSENT_CHANNELS.REQUEST).at(-1)?.[1];
    const authorize = (owner = sender) => manager.authorize(webContents(owner), "worker");
    const respond = (decision: "allow-tool" | "allow-once" | "reject") => manager.respond(webContents(main), request().requestId, decision);
    const records = (): NativeWorkerConsentRecord[] => manager.getAll(webContents(main));

    beforeEach(() => {
        jest.useFakeTimers();
        main = new FakeWebContents(1);
        sender = new FakeWebContents(10);
        second = new FakeWebContents(11);
        identity = { toolId: "tool-a", toolName: "Tool A", toolVersion: "2.0.0", declaration: declaration() };
        identities = new Map([
            [sender.id, identity],
            [second.id, identity],
        ]);
        rows = [];
        store = {
            getNativeWorkerConsentRows: jest.fn(() => rows),
            setNativeWorkerConsentRows: jest.fn((value) => {
                rows = value;
            }),
        };
        manager = new NativeWorkerConsentManager(
            store,
            () => webContents(main),
            (owner) => identities.get(owner.id) ?? null,
            1_000,
        );
    });

    afterEach(() => {
        manager.dispose();
        expect(jest.getTimerCount()).toBe(0);
        jest.useRealTimers();
    });

    it("rejects untrusted callers and unknown declarations without a prompt", async () => {
        await expect(authorize(main)).rejects.toThrow("untrusted");
        identities.delete(sender.id);
        await expect(authorize()).rejects.toThrow("untrusted");
        expect(main.send).not.toHaveBeenCalled();
    });

    it("keeps an allow-once lease current without storage and invalidates it on revoke", async () => {
        const pending = manager.authorizeLease(webContents(sender), "worker");
        respond("allow-once");
        const lease = await pending;
        expect(records()).toEqual([]);
        expect(() => lease.assertCurrent()).not.toThrow();
        manager.revoke(webContents(main), lease.approval.fingerprint);
        expect(() => lease.assertCurrent()).toThrow("revoked");
    });

    it("cancels only the aborted owner of a shared prompt", async () => {
        const abort = new AbortController();
        const firstLease = manager.authorizeLease(webContents(sender), "worker", abort.signal);
        const secondLease = manager.authorizeLease(webContents(second), "worker");
        abort.abort();
        await expect(firstLease).rejects.toThrow("closed");
        respond("allow-once");
        await expect(secondLease).resolves.toHaveProperty("approval");
    });

    it("guards every controller method, including a spoofed object with the same main id", () => {
        const spoofed = new FakeWebContents(main.id);
        for (const attacker of [sender, spoofed]) {
            expect(() => manager.getAll(webContents(attacker))).toThrow("trusted main");
            expect(() => manager.revoke(webContents(attacker), "a".repeat(64))).toThrow("trusted main");
            expect(() => manager.respond(webContents(attacker), "forged", "allow-tool")).toThrow("trusted main");
        }
        expect(records()).toEqual([]);
    });

    it("does not let a tool approve a live request on the new response channel", async () => {
        const pending = authorize();
        expect(() => manager.respond(webContents(sender), request().requestId, "allow-tool")).toThrow("trusted main");
        expect(records()).toEqual([]);
        respond("reject");
        await expect(pending).rejects.toThrow("rejected");
    });

    it("rejects without writing a denial or approval record", async () => {
        const pending = authorize();
        (store.setNativeWorkerConsentRows as jest.Mock).mockClear();
        respond("reject");
        await expect(pending).rejects.toThrow("rejected");
        expect(store.setNativeWorkerConsentRows).not.toHaveBeenCalled();
        expect(records()).toEqual([]);
    });

    it("allows once with an immutable reviewed snapshot and no persistent grant", async () => {
        const pending = authorize();
        const reviewed = request();
        expect(Object.isFrozen(reviewed.declaration.dotnet)).toBe(true);
        expect(Object.isFrozen(reviewed.declaration.platforms)).toBe(true);
        respond("allow-once");
        await expect(pending).resolves.toMatchObject({ fingerprint: reviewed.fingerprint, declaration: reviewed.declaration });
        expect(records()).toEqual([]);
        const again = authorize();
        expect(request().requestId).not.toBe(reviewed.requestId);
        respond("reject");
        await expect(again).rejects.toThrow("rejected");
    });

    it("persists a timestamp and descriptors, then uses the exact approval", async () => {
        const pending = authorize();
        const reviewed = request();
        respond("allow-tool");
        await pending;
        expect(records()).toEqual([expect.objectContaining({ fingerprint: reviewed.fingerprint, toolId: "tool-a", toolVersion: "2.0.0", workerId: "worker", approvedAt: expect.any(String) })]);
        main.send.mockClear();
        await expect(authorize()).resolves.toMatchObject({ fingerprint: reviewed.fingerprint });
        expect(main.send).not.toHaveBeenCalled();
    });

    it("normalizes omitted/explicit Major, package casing, property and platform order", () => {
        const first = nativeWorkerConsentSnapshot(identity, "worker");
        const secondSnapshot = nativeWorkerConsentSnapshot(
            {
                ...identity,
                declaration: {
                    ...identity.declaration,
                    packageId: "trusted.worker",
                    platforms: ["linux-x64", "windows-x64"],
                    dotnet: { rollForward: "Major", minimumRuntimeVersion: "8.0.0", targetFramework: "net8.0" },
                },
            },
            "worker",
        );
        expect(nativeWorkerConsentFingerprint(first)).toBe(nativeWorkerConsentFingerprint(secondSnapshot));
        expect(first.source).toBe("https://api.nuget.org/v3/index.json");
        expect(first.protocolVersion).toBe(1);
        expect(first.platformMatrixVersion).toBe(1);
    });

    it.each(["toolId", "toolVersion", "workerId"] as const)("binds %s into the fingerprint", (field) => {
        const original = nativeWorkerConsentFingerprint(nativeWorkerConsentSnapshot(identity, "worker"));
        const changed = field === "workerId" ? nativeWorkerConsentSnapshot(identity, "other") : nativeWorkerConsentSnapshot({ ...identity, [field]: "changed" }, "worker");
        expect(nativeWorkerConsentFingerprint(changed)).not.toBe(original);
    });

    it("requires fresh consent after a tool version change", async () => {
        const first = authorize();
        respond("allow-tool");
        await first;
        identity.toolVersion = "2.0.1";
        const next = authorize();
        expect(request().toolVersion).toBe("2.0.1");
        respond("reject");
        await expect(next).rejects.toThrow("rejected");
    });

    it.each([
        [
            "package",
            (worker: WorkerDeclaration) => {
                worker.packageVersion = "1.2.4";
            },
        ],
        [
            "command",
            (worker: WorkerDeclaration) => {
                worker.command = "changed-command";
            },
        ],
        [
            "runtime",
            (worker: WorkerDeclaration) => {
                worker.dotnet.minimumRuntimeVersion = "8.0.1";
            },
        ],
        [
            "rollForward",
            (worker: WorkerDeclaration) => {
                worker.dotnet.rollForward = "Disable";
            },
        ],
        [
            "targetFramework",
            (worker: WorkerDeclaration) => {
                worker.dotnet.targetFramework = "net9.0";
                worker.dotnet.minimumRuntimeVersion = "9.0.0";
            },
        ],
        [
            "platforms",
            (worker: WorkerDeclaration) => {
                worker.platforms = ["linux-arm64"];
            },
        ],
    ] as Array<[string, (worker: WorkerDeclaration) => void]>)("rejects local canonical %s mutation while approval is pending", async (_field, mutate) => {
        const pending = authorize();
        const fingerprint = request().fingerprint;
        mutate(identity.declaration);
        respond("allow-tool");
        await expect(pending).rejects.toThrow("source changed");
        expect(records()).toEqual([]);
        const fresh = authorize();
        expect(request().fingerprint).not.toBe(fingerprint);
        respond("reject");
        await expect(fresh).rejects.toThrow("rejected");
    });

    it("deduplicates owners and closing one does not invalidate a live caller", async () => {
        const first = authorize();
        const live = authorize(second);
        expect(main.send.mock.calls.filter(([channel]) => channel === NATIVE_WORKER_CONSENT_CHANNELS.REQUEST)).toHaveLength(1);
        sender.destroy();
        await expect(first).rejects.toThrow("caller closed");
        respond("allow-once");
        await expect(live).resolves.toMatchObject({ toolId: "tool-a" });
        expect(second.listenerCount("destroyed")).toBe(0);
        expect(main.listenerCount("destroyed")).toBe(0);
    });

    it("grants only the still-correct owner when a duplicate changes source", async () => {
        const first = authorize();
        const live = authorize(second);
        identities.set(sender.id, { ...identity, toolVersion: "3.0.0" });
        respond("allow-tool");
        await expect(first).rejects.toThrow("source changed");
        await expect(live).resolves.toMatchObject({ toolVersion: "2.0.0" });
        expect(records()).toHaveLength(1);
    });

    it("rejects an invalid decision and a stale response without a grant", async () => {
        const pending = authorize();
        expect(manager.respond(webContents(main), "stale", "allow-tool")).toBe(false);
        expect(manager.respond(webContents(main), request().requestId, "invalid" as "reject")).toBe(false);
        respond("reject");
        await expect(pending).rejects.toThrow("rejected");
    });

    it("revokes a pending prompt and emits a targeted internal event", async () => {
        const pending = authorize();
        const reviewed = request();
        const revoked = jest.fn();
        manager.on("revoked", revoked);
        manager.revoke(webContents(main), reviewed.fingerprint);
        expect(revoked).toHaveBeenCalledWith({ fingerprint: reviewed.fingerprint });
        expect(manager.respond(webContents(main), reviewed.requestId, "allow-tool")).toBe(false);
        await expect(pending).rejects.toThrow("revoked");
        expect(records()).toEqual([]);
        expect(main.send).toHaveBeenCalledWith(NATIVE_WORKER_CONSENT_CHANNELS.CLOSED, reviewed.requestId);
    });

    it("rejects authorization settled by a prompt but revoked before its continuation", async () => {
        const pending = authorize();
        const fingerprint = request().fingerprint;
        respond("allow-tool");
        manager.revoke(webContents(main), fingerprint);
        await expect(pending).rejects.toThrow("revoked");
        expect(records()).toEqual([]);
    });

    it("checks revocation on the cached-approval continuation too", async () => {
        const first = authorize();
        const fingerprint = request().fingerprint;
        respond("allow-tool");
        await first;
        const cached = authorize();
        manager.revoke(webContents(main), fingerprint);
        await expect(cached).rejects.toThrow("revoked");
    });

    it("checks source mutation after a prompt decision before returning authorization", async () => {
        const pending = authorize();
        respond("allow-once");
        identity.declaration.command = "different";
        await expect(pending).rejects.toThrow("source changed");
    });

    it("cancels active and queued owners at disposal and rejects subsequent calls", async () => {
        const active = authorize();
        identities.set(second.id, { ...identity, toolId: "tool-b" });
        const queued = authorize(second);
        manager.dispose();
        await expect(active).rejects.toThrow("disposed");
        await expect(queued).rejects.toThrow("disposed");
        await expect(authorize()).rejects.toThrow("disposed");
        expect(sender.listenerCount("destroyed")).toBe(0);
        expect(second.listenerCount("destroyed")).toBe(0);
        expect(main.listenerCount("destroyed")).toBe(0);
    });

    it("rejects even settled allow-once if disposed before continuation", async () => {
        const pending = authorize();
        respond("allow-once");
        manager.dispose();
        await expect(pending).rejects.toThrow("disposed");
    });

    it("times out active and queued prompts within the original deadline", async () => {
        const active = authorize();
        identities.set(second.id, { ...identity, toolId: "tool-b" });
        const queued = authorize(second);
        jest.advanceTimersByTime(1_000);
        await expect(active).rejects.toThrow("timed out");
        await expect(queued).rejects.toThrow("timed out");
        expect(main.listenerCount("destroyed")).toBe(0);
        expect(sender.listenerCount("destroyed")).toBe(0);
    });

    it("rejects active and queued prompts when the main UI is destroyed", async () => {
        const active = authorize();
        identities.set(second.id, { ...identity, toolId: "tool-b" });
        const queued = authorize(second);
        main.destroy();
        await expect(active).rejects.toThrow("UI closed");
        await expect(queued).rejects.toThrow(/UI/);
    });

    it("fails closed when the main UI cannot receive the prompt", async () => {
        main.send.mockImplementation(() => {
            throw new Error("delivery failed");
        });
        await expect(authorize()).rejects.toThrow("UI unavailable");
        expect(sender.listenerCount("destroyed")).toBe(0);
    });

    it("does not reuse a prompt approved by a replaced main window", async () => {
        const pending = authorize();
        const oldMain = main;
        main = new FakeWebContents(2);
        expect(() => manager.respond(webContents(oldMain), request()?.requestId ?? "stale", "allow-tool")).toThrow("trusted main");
        expect(manager.respond(webContents(main), "stale", "allow-tool")).toBe(false);
        jest.advanceTimersByTime(1_000);
        await expect(pending).rejects.toThrow("timed out");
    });

    it("fails closed if persistence fails", async () => {
        const pending = authorize();
        (store.setNativeWorkerConsentRows as jest.Mock).mockImplementation(() => {
            throw new Error("disk full");
        });
        expect(respond("allow-tool")).toBe(false);
        await expect(pending).rejects.toThrow("could not be saved");
    });

    it("sanitizes invalid/stale records and removes arbitrary machine path fields", () => {
        manager.dispose();
        const snapshot = nativeWorkerConsentSnapshot(identity, "worker");
        const record = { ...snapshot, fingerprint: nativeWorkerConsentFingerprint(snapshot), approvedAt: "2026-10-05T00:00:00.000Z" };
        rows = [
            null,
            {},
            { ...record, fingerprint: "forged" },
            { ...record, protocolVersion: 2 },
            { ...record, platformMatrixVersion: 2 },
            { ...record, source: "https://private.example" },
            { ...record, approvedAt: "invalid" },
            { ...record, declaration: { ...record.declaration, arbitraryPath: "/private/path" } },
            { ...record, machinePath: "/private/home/user" },
        ];
        manager = new NativeWorkerConsentManager(
            store,
            () => webContents(main),
            () => identity,
        );
        expect(records()).toEqual([record]);
        expect(JSON.stringify(rows)).not.toContain("/private/");
    });

    it("migrates malformed consent collections to an empty store", () => {
        manager.dispose();
        rows = { legacy: true };
        manager = new NativeWorkerConsentManager(
            store,
            () => webContents(main),
            () => identity,
        );
        expect(records()).toEqual([]);
        expect(rows).toEqual([]);
    });

    it("keeps approvals isolated from generic user and tool settings writes", () => {
        const settings = new SettingsManager();
        const record = { ...nativeWorkerConsentSnapshot(identity, "worker"), fingerprint: "a".repeat(64), approvedAt: "2026-10-05T00:00:00.000Z" };
        settings.setNativeWorkerConsentRows([record]);
        settings.updateUserSettings({ nativeWorkerConsents: [] } as Parameters<SettingsManager["updateUserSettings"]>[0]);
        expect(settings.getNativeWorkerConsentRows()).toEqual([record]);
        expect(settings.getUserSettings()).not.toHaveProperty("records");
    });

    it("formats native disclosure without markup parsing and shows effective policy", () => {
        const snapshot = nativeWorkerConsentSnapshot(
            { ...identity, toolName: "<img src=x onerror=attack()>", declaration: { ...identity.declaration, dotnet: { ...identity.declaration.dotnet, rollForward: "Latest" } } },
            "worker",
        );
        expect(nativeWorkerConsentDetails(snapshot)).toContain("Effective roll-forward: LatestMajor");
        expect(nativeWorkerConsentDetails(snapshot)[0]).toContain("<img src=x onerror=attack()>");
        expect(NATIVE_WORKER_WARNING).toContain("NOT in a sandbox");
        expect(NATIVE_WORKER_WARNING).toContain("same-user filesystem");
        expect(NATIVE_WORKER_WARNING).toContain("network");
        expect(NATIVE_WORKER_WARNING).toContain("child processes");
        expect(NATIVE_WORKER_WARNING).toContain("explicit installation");
    });
});
