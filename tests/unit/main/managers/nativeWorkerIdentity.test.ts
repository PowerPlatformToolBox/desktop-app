import type { WebContents } from "electron";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NATIVE_WORKER_CONSENT_CHANNELS } from "../../../../src/common/ipc/channels";
import type { NativeWorkerConsentRecord, NativeWorkerConsentRequest, Tool, WorkerDeclaration } from "../../../../src/common/types";
import { NativeWorkerConsentManager } from "../../../../src/main/managers/nativeWorkerConsentManager";
import { resolveNativeWorkerIdentity, type LoadedToolIdentity } from "../../../../src/main/utilities/nativeWorkerIdentity";

class Sender extends EventEmitter {
    readonly send = jest.fn();
    isDestroyed(): boolean {
        return false;
    }
}

describe("native worker launch-bound identity", () => {
    let root: string;
    let tool: Tool;
    let worker: WorkerDeclaration;
    let loaded: LoadedToolIdentity;
    let rows: NativeWorkerConsentRecord[];
    let main: Sender;
    let oldSender: Sender;
    let currentSender: Sender;
    let manager: NativeWorkerConsentManager;

    function writePackage(version = tool.version, config: unknown = { workers: { engine: worker } }, minAPI = "1.0.22"): void {
        fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "trusted-ui", version, features: { minAPI } }));
        fs.writeFileSync(path.join(root, "pptb.config.json"), JSON.stringify(config));
    }

    const resolve = (owner = oldSender) => resolveNativeWorkerIdentity(owner === oldSender ? loaded : { ...loaded, toolVersion: tool.version }, tool, tool.localPath, "engine");
    const authorize = (owner = oldSender) => manager.authorize(owner as unknown as WebContents, "engine");
    const request = (): NativeWorkerConsentRequest => main.send.mock.calls.find(([channel]) => channel === NATIVE_WORKER_CONSENT_CHANNELS.REQUEST)?.[1];

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-consent-identity-"));
        tool = { id: "trusted-ui", name: "Trusted UI", version: "1.0.0", description: "", localPath: root };
        worker = {
            kind: "dotnet-tool",
            packageId: "Trusted.Worker",
            packageVersion: "1.2.3",
            command: "trusted-worker",
            dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0" },
            platforms: ["all"],
        };
        loaded = Object.freeze({ toolId: tool.id, toolName: tool.name, toolVersion: tool.version, sourcePath: root });
        rows = [];
        main = new Sender();
        oldSender = new Sender();
        currentSender = new Sender();
        manager = new NativeWorkerConsentManager(
            {
                getNativeWorkerConsentRows: () => rows,
                setNativeWorkerConsentRows: (value) => {
                    rows = value;
                },
            },
            () => main as unknown as WebContents,
            (sender) =>
                sender === (oldSender as unknown as WebContents) || sender === (currentSender as unknown as WebContents)
                    ? resolve(sender === (oldSender as unknown as WebContents) ? oldSender : currentSender)
                    : null,
        );
        writePackage();
    });

    afterEach(() => {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("rejects a loaded v1 sender instead of reusing current v2 consent, while a v2 caller succeeds", async () => {
        tool.version = "2.0.0";
        writePackage();
        const approval = authorize(currentSender);
        expect(request().toolVersion).toBe("2.0.0");
        manager.respond(main as unknown as WebContents, request().requestId, "allow-tool");
        await expect(approval).resolves.toMatchObject({ toolVersion: "2.0.0" });
        main.send.mockClear();
        await expect(authorize()).rejects.toThrow("untrusted");
        await expect(authorize(currentSender)).resolves.toMatchObject({ toolVersion: "2.0.0" });
        expect(main.send).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1);
    });

    it("rejects disk-only version changes even when current metadata still reports v1", async () => {
        writePackage("2.0.0");
        await expect(authorize()).rejects.toThrow("untrusted");
        expect(main.send).not.toHaveBeenCalled();
    });

    it("rejects a current source path change rather than rebinding the live sender", () => {
        expect(resolve()).toMatchObject({ toolVersion: "1.0.0" });
        tool.localPath = path.join(root, "replacement");
        expect(resolve()).toBeNull();
        expect(resolveNativeWorkerIdentity({ ...loaded, sourcePath: null }, tool, tool.localPath, "engine")).toBeNull();
    });

    it("rejects an update while the original sender's prompt is pending without persisting approval", async () => {
        const pending = authorize();
        const requestId = request().requestId;
        tool.version = "2.0.0";
        writePackage();
        manager.respond(main as unknown as WebContents, requestId, "allow-tool");
        await expect(pending).rejects.toThrow("untrusted");
        expect(rows).toEqual([]);
    });

    it("revalidates same-version local config and requires fresh consent for a changed declaration", async () => {
        const approval = authorize();
        manager.respond(main as unknown as WebContents, request().requestId, "allow-tool");
        const original = await approval;
        main.send.mockClear();
        worker.packageVersion = "1.2.4";
        writePackage();
        const changed = authorize();
        expect(request().fingerprint).not.toBe(original.fingerprint);
        manager.respond(main as unknown as WebContents, request().requestId, "allow-once");
        await expect(changed).resolves.toMatchObject({ declaration: { packageVersion: "1.2.4" } });
    });

    it.each([
        ["command traversal", () => ({ workers: { engine: { ...worker, command: "../evil" } } })],
        ["arbitrary source", () => ({ workers: { engine: { ...worker, source: "https://evil.example" } } })],
        ["unknown executable", () => ({ workers: { engine: { ...worker, executable: "/evil" } } })],
    ])("does not bypass live declaration validation for %s", async (_name, config) => {
        const approval = authorize();
        manager.respond(main as unknown as WebContents, request().requestId, "allow-tool");
        await approval;
        main.send.mockClear();
        writePackage(tool.version, config());
        await expect(authorize()).rejects.toThrow("untrusted");
        expect(main.send).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1);
    });
});
