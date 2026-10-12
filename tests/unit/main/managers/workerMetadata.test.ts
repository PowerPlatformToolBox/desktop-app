import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { validatePPTBConfig, type PPTBConfig, type WorkerDeclaration } from "../../../../packages/validation/src/validate";
import type { ToolRegistryEntry } from "../../../../src/common/types";
import { ToolRegistryManager } from "../../../../src/main/managers/toolRegistryManager";
import { ToolManager } from "../../../../src/main/managers/toolsManager";
import { VersionManager } from "../../../../src/main/managers/versionManager";

const worker: WorkerDeclaration = {
    kind: "dotnet-tool",
    packageId: "Contoso.Worker",
    packageVersion: "1.2.3.4",
    command: "contoso-worker",
    dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0" },
    platforms: ["windows-x64", "macos-arm64"],
};
const canonical = { engine: { ...worker, dotnet: { ...worker.dotnet, rollForward: "Major" }, platforms: ["macos-arm64", "windows-x64"] } };

describe("worker metadata loading and persistence", () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-workers-"));
        jest.spyOn(VersionManager, "getToolBoxVersion").mockReturnValue("1.2.7");
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    function writePackage(toolPath: string, config: unknown = { workers: { engine: worker } }, minAPI: unknown = "1.2.0"): void {
        fs.mkdirSync(path.join(toolPath, "dist"), { recursive: true });
        fs.writeFileSync(path.join(toolPath, "dist", "index.html"), "<!doctype html><html></html>");
        fs.writeFileSync(path.join(toolPath, "package.json"), JSON.stringify({ name: "@contoso/worker-ui", version: "1.0.0", features: { minAPI } }));
        fs.writeFileSync(path.join(toolPath, "pptb.config.json"), JSON.stringify(config));
    }

    function registryManager(toolPath: string, minAPI: string | undefined = "1.2.0"): ToolRegistryManager {
        const manager = new ToolRegistryManager(root);
        jest.spyOn(manager, "fetchRegistry").mockResolvedValue([
            { id: "registry-worker", name: "Worker UI", version: "1.0.0", description: "Worker", downloadUrl: "https://example.com/worker.tgz", minAPI } as ToolRegistryEntry,
        ]);
        jest.spyOn(manager, "downloadTool").mockImplementation(async (_tool, targetPath) => {
            if (!targetPath) throw new Error("Expected staged download destination");
            fs.cpSync(toolPath, targetPath, { recursive: true });
            return targetPath;
        });
        jest.spyOn(manager, "trackToolDownload").mockResolvedValue();
        return manager;
    }

    it.each([
        ["registry", "explicit"],
        ["registry", "all"],
        ["npm", "explicit"],
        ["npm", "all"],
        ["local", "explicit"],
        ["local", "all"],
    ] as const)("loads and restores canonical metadata for %s with %s platforms", async (source, platformMode) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        const declaration: WorkerDeclaration = platformMode === "all" ? { ...worker, platforms: ["all"] } : worker;
        const expected = { engine: { ...canonical.engine, platforms: [...declaration.platforms].sort() } };
        writePackage(toolPath, { workers: { engine: declaration } });
        let toolId: string;
        if (source === "registry") {
            const manifest = await registryManager(toolPath).installTool("registry-worker");
            expect(manifest.workers).toEqual(expected);
            expect(manifest.workers?.engine).not.toHaveProperty("transport");
            toolId = manifest.id;
        } else {
            const manager = new ToolManager(root);
            const loaded = source === "npm" ? await manager.loadNpmTool("@contoso/worker-ui") : await manager.loadLocalTool(toolPath);
            expect(loaded.workers).toEqual(expected);
            expect(loaded.workers?.engine).not.toHaveProperty("transport");
            expect(loaded.isSupported).toBe(true);
            toolId = loaded.id;
        }
        const persisted = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8")).tools[0];
        expect(persisted.workers).toEqual(expected);
        expect(persisted.workers.engine).not.toHaveProperty("transport");
        expect(persisted.source).toBe(source);
        const restarted = new ToolManager(root);
        expect(restarted.getTool(toolId)?.workers).toEqual(expected);
        const restored = await restarted.loadTool(toolId);
        expect(restored.workers).toEqual(expected);
        expect(restored.workers?.engine).not.toHaveProperty("transport");
        expect(restored.minAPI).toBe("1.2.0");
        expect(restored.isSupported).toBe(true);
    });

    it.each(["registry", "npm", "local"] as const)("rejects author-declared transport in %s", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath, { workers: { engine: { ...worker, transport: "jsonrpc-stdio-v1" } } });
        const manager = new ToolManager(root);
        const load = source === "registry" ? registryManager(toolPath).installTool("registry-worker") : source === "npm" ? manager.loadNpmTool("@contoso/worker-ui") : manager.loadLocalTool(toolPath);
        await expect(load).rejects.toThrow("workers.engine.transport is not supported");
        expect(manager.getAllTools()).toEqual([]);
        expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(false);
    });

    it.each(["npm", "local"] as const)("revalidates changed %s source on restart", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath);
        const manager = new ToolManager(root);
        const loaded = source === "npm" ? await manager.loadNpmTool("@contoso/worker-ui") : await manager.loadLocalTool(toolPath);
        writePackage(toolPath, { workers: { engine: { ...worker, command: "../evil" } } });
        await expect(new ToolManager(root).loadTool(loaded.id)).rejects.toThrow("Invalid worker declarations");
    });

    it.each(["registry", "npm", "local"] as const)("fails closed for malformed declarations in %s", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath, { workers: { engine: { ...worker, env: { PATH: "/evil" } } } });
        const manager = new ToolManager(root);
        const load = source === "registry" ? registryManager(toolPath).installTool("registry-worker") : source === "npm" ? manager.loadNpmTool("@contoso/worker-ui") : manager.loadLocalTool(toolPath);
        await expect(load).rejects.toThrow("Invalid worker declarations");
        expect(manager.getAllTools()).toEqual([]);
        expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(false);
    });

    it.each([undefined, null, "", "bad"])("requires valid minAPI %p", async (minAPI) => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath, { workers: { engine: worker } }, minAPI === undefined ? null : minAPI);
        await expect(new ToolManager(root).loadLocalTool(toolPath)).rejects.toThrow("features.minAPI");
    });

    it.each(["registry", "npm", "local"] as const)("uses existing compatibility policy for %s", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath, { workers: { engine: worker } }, "99.0.0");
        const manager = new ToolManager(root);
        const tool =
            source === "registry"
                ? await registryManager(toolPath, "99.0.0")
                      .installTool("registry-worker")
                      .then((manifest) => manager.loadTool(manifest.id))
                : source === "npm"
                  ? await manager.loadNpmTool("@contoso/worker-ui")
                  : await manager.loadLocalTool(toolPath);
        expect(tool.isSupported).toBe(false);
        expect(manager.getTool(tool.id)?.isSupported).toBe(false);
        expect(new ToolManager(root).getTool(tool.id)?.isSupported).toBe(false);
    });

    it("rejects registry/package minAPI mismatch", async () => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath);
        await expect(registryManager(toolPath, "1.1.0").installTool("registry-worker")).rejects.toThrow("does not match");
    });

    it("recovers absent registry minAPI from the worker package", async () => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath);
        const manager = registryManager(toolPath);
        const releases = await manager.fetchRegistry();
        delete releases[0].minAPI;
        const manifest = await manager.installTool("registry-worker");
        expect(manifest.minAPI).toBe("1.2.0");
        expect(new ToolManager(root).getTool(manifest.id)?.isSupported).toBe(true);
    });

    it.each(["npm", "local"] as const)("removes persisted workers when %s source stops declaring them", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath);
        const manager = new ToolManager(root);
        const tool = source === "npm" ? await manager.loadNpmTool("@contoso/worker-ui") : await manager.loadLocalTool(toolPath);
        writePackage(toolPath, {});
        const restarted = new ToolManager(root);
        expect((await restarted.loadTool(tool.id)).workers).toBeUndefined();
        expect(new ToolManager(root).getTool(tool.id)?.workers).toBeUndefined();
    });

    it("rejects malformed JSON instead of swallowing worker declarations", async () => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath);
        fs.writeFileSync(path.join(toolPath, "pptb.config.json"), '{"workers":');
        await expect(new ToolManager(root).loadLocalTool(toolPath)).rejects.toThrow();
    });

    it("validates persisted declarations instead of trusting them", async () => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath);
        await registryManager(toolPath).installTool("registry-worker");
        const manifestPath = path.join(root, "manifest.json");
        const persisted = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        persisted.tools[0].workers.engine.dotnet.rollForward = null;
        fs.writeFileSync(manifestPath, JSON.stringify(persisted));
        expect(new ToolManager(root).getTool("registry-worker")).toBeUndefined();
    });

    it.each(["transport", "legacy platform"])("rejects persisted metadata containing %s", async (field) => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath);
        await registryManager(toolPath).installTool("registry-worker");
        const manifestPath = path.join(root, "manifest.json");
        const persisted = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (field === "transport") persisted.tools[0].workers.engine.transport = "jsonrpc-stdio-v1";
        else persisted.tools[0].workers.engine.platforms = ["win-x64"];
        fs.writeFileSync(manifestPath, JSON.stringify(persisted));
        expect(new ToolManager(root).getTool("registry-worker")).toBeUndefined();
    });

    it("keeps worker-free local tools compatible and does not create a manifest", async () => {
        const toolPath = path.join(root, "tool-source");
        writePackage(toolPath, {}, null);
        const tool = await new ToolManager(root).loadLocalTool(toolPath);
        expect(tool.workers).toBeUndefined();
        expect(tool.isSupported).toBe(true);
        expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(false);
    });

    it.each(["registry", "npm", "local"] as const)("validates agents alongside workers in %s", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        const config = { workers: { engine: worker }, agents: { headless: false } };
        const validation = validatePPTBConfig(config as unknown as PPTBConfig, { features: { minAPI: "1.2.0" } });
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain("agents.version is required");
        writePackage(toolPath, config);
        const manager = new ToolManager(root);
        const load = source === "registry" ? registryManager(toolPath).installTool("registry-worker") : source === "npm" ? manager.loadNpmTool("@contoso/worker-ui") : manager.loadLocalTool(toolPath);
        await expect(load).rejects.toThrow("agents.version is required");
        expect(manager.getAllTools()).toEqual([]);
        expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(false);
    });

    it.each([
        ["npm", "workers"],
        ["npm", "minAPI"],
        ["npm", "config JSON"],
        ["npm", "package JSON"],
        ["local", "workers"],
        ["local", "minAPI"],
        ["local", "config JSON"],
        ["local", "package JSON"],
    ] as const)("removes stale %s metadata after rejected %s reload in the same manager and on restart", async (source, invalidation) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath);
        const manager = new ToolManager(root);
        const loaded = source === "npm" ? await manager.loadNpmTool("@contoso/worker-ui") : await manager.loadLocalTool(toolPath);
        if (invalidation === "workers") writePackage(toolPath, { workers: { engine: { ...worker, command: "../evil" } } });
        else if (invalidation === "minAPI") writePackage(toolPath, { workers: { engine: worker } }, "bad");
        else fs.writeFileSync(path.join(toolPath, invalidation === "config JSON" ? "pptb.config.json" : "package.json"), "{");

        await expect(manager.loadTool(loaded.id)).rejects.toThrow();
        expect(manager.getTool(loaded.id)).toBeUndefined();
        expect(manager.isToolLoaded(loaded.id)).toBe(false);
        expect(manager.getAllTools()).toEqual([]);
        expect(manager.getRegistryManager().getInstalledManifestSync(loaded.id)).toBeNull();
        expect(JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8")).tools).toEqual([]);
        const restarted = new ToolManager(root);
        expect(restarted.getTool(loaded.id)).toBeUndefined();
        expect(restarted.getAllTools()).toEqual([]);
        expect(fs.existsSync(path.join(toolPath, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(toolPath, "pptb.config.json"))).toBe(true);
    });

    it.each(["npm", "local"] as const)("clears stale %s metadata when first revalidation happens after restart", async (source) => {
        const toolPath = source === "npm" ? path.join(root, "node_modules", "@contoso", "worker-ui") : path.join(root, "tool-source");
        writePackage(toolPath);
        const manager = new ToolManager(root);
        const loaded = source === "npm" ? await manager.loadNpmTool("@contoso/worker-ui") : await manager.loadLocalTool(toolPath);
        fs.writeFileSync(path.join(toolPath, "pptb.config.json"), "{");
        const restarted = new ToolManager(root);
        await expect(restarted.loadTool(loaded.id)).rejects.toThrow();
        expect(restarted.getTool(loaded.id)).toBeUndefined();
        expect(new ToolManager(root).getTool(loaded.id)).toBeUndefined();
        expect(fs.existsSync(toolPath)).toBe(true);
    });

    it.each([
        ["npm", false],
        ["npm", true],
        ["local", false],
        ["local", true],
    ] as const)("uninstalls persisted %s metadata with restarted manager=%s without deleting local sources", async (source, restart) => {
        const npmPath = path.join(root, "node_modules", "@contoso", "worker-ui");
        const localPath = path.join(root, "tool-source");
        writePackage(npmPath);
        writePackage(localPath);
        const manager = new ToolManager(root);
        const npmTool = await manager.loadNpmTool("@contoso/worker-ui");
        const localTool = await manager.loadLocalTool(localPath);
        const removed = source === "local" ? localTool : npmTool;
        const retained = source === "local" ? npmTool : localTool;
        const active = restart ? new ToolManager(root) : manager;
        expect(active.getTool(localTool.id)?.npmPackageName).toBe("@contoso/worker-ui");
        await active.uninstallTool(removed.id);
        expect(active.getTool(removed.id)).toBeUndefined();
        const restarted = new ToolManager(root);
        expect(restarted.getTool(removed.id)).toBeUndefined();
        expect(restarted.getTool(retained.id)?.workers).toEqual(canonical);
        expect(fs.existsSync(path.join(localPath, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(npmPath, "package.json"))).toBe(source === "local");
    });

    it("unloads worker-free local tools without deleting a separately installed npm copy", async () => {
        const localPath = path.join(root, "tool-source");
        const npmPath = path.join(root, "node_modules", "@contoso", "worker-ui");
        writePackage(localPath, {});
        writePackage(npmPath, {});
        const manager = new ToolManager(root);
        const loaded = await manager.loadLocalTool(localPath);
        await manager.uninstallTool(loaded.id);
        expect(manager.getTool(loaded.id)).toBeUndefined();
        expect(fs.existsSync(path.join(localPath, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(npmPath, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(root, "manifest.json"))).toBe(false);
    });

    it.each(["workers", "minAPI", "config JSON", "download"] as const)("preserves installed binaries and manifest after rejected registry update: %s", async (failure) => {
        const sourcePath = path.join(root, "tool-source");
        writePackage(sourcePath);
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "old binary");
        const manager = registryManager(sourcePath);
        const installed = await manager.installTool("registry-worker");
        const manifestPath = path.join(root, "manifest.json");
        const previousManifest = fs.readFileSync(manifestPath, "utf-8");
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "new binary");
        if (failure === "workers") writePackage(sourcePath, { workers: { engine: { ...worker, command: "../evil" } } });
        else if (failure === "minAPI") writePackage(sourcePath, { workers: { engine: worker } }, "1.1.0");
        else if (failure === "config JSON") fs.writeFileSync(path.join(sourcePath, "pptb.config.json"), "{");
        else
            jest.spyOn(manager, "downloadTool").mockImplementationOnce(async (_tool, targetPath) => {
                if (!targetPath) throw new Error("Expected staged download destination");
                fs.writeFileSync(path.join(targetPath, "worker.bin"), "partial binary");
                fs.writeFileSync(`${targetPath}.tar.gz`, "partial archive");
                throw new Error("Injected download failure");
            });

        await expect(manager.installTool("registry-worker")).rejects.toThrow();
        expect(fs.readFileSync(path.join(installed.installPath, "worker.bin"), "utf-8")).toBe("old binary");
        expect(fs.readFileSync(manifestPath, "utf-8")).toBe(previousManifest);
        expect(new ToolManager(root).getTool(installed.id)?.workers).toEqual(canonical);
        expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".pptb-install-"))).toEqual([]);
        expect(jest.mocked(manager.downloadTool).mock.calls.every(([, targetPath]) => targetPath !== installed.installPath)).toBe(true);
    });

    it.each(["rename", "manifest write"] as const)("rolls back registry directory replacement after %s failure", async (failure) => {
        const sourcePath = path.join(root, "tool-source");
        writePackage(sourcePath);
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "old binary");
        const manager = registryManager(sourcePath);
        const installed = await manager.installTool("registry-worker");
        const manifestPath = path.join(root, "manifest.json");
        const previousManifest = fs.readFileSync(manifestPath, "utf-8");
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "new binary");
        let injected = false;
        const filesystem = jest.requireActual<typeof fs>("fs");
        if (failure === "rename") {
            const rename = filesystem.renameSync;
            jest.spyOn(filesystem, "renameSync").mockImplementation((oldPath, newPath) => {
                if (!injected && newPath === installed.installPath) {
                    injected = true;
                    throw new Error("Injected rename failure");
                }
                rename(oldPath, newPath);
            });
        } else {
            const write = filesystem.writeFileSync;
            jest.spyOn(filesystem, "writeFileSync").mockImplementation((filePath, data, options) => {
                write(filePath, data, options);
                if (!injected && filePath === manifestPath) {
                    injected = true;
                    throw new Error("Injected manifest write failure");
                }
            });
        }
        await expect(manager.installTool("registry-worker")).rejects.toThrow("Injected");
        expect(injected).toBe(true);
        expect(fs.readFileSync(path.join(installed.installPath, "worker.bin"), "utf-8")).toBe("old binary");
        expect(fs.readFileSync(manifestPath, "utf-8")).toBe(previousManifest);
        expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".pptb-install-"))).toEqual([]);
    });

    it("replaces validated registry binaries without retaining obsolete installed files", async () => {
        const sourcePath = path.join(root, "tool-source");
        writePackage(sourcePath);
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "old binary");
        const manager = registryManager(sourcePath);
        const installed = await manager.installTool("registry-worker");
        fs.writeFileSync(path.join(installed.installPath, "obsolete.bin"), "obsolete");
        fs.writeFileSync(path.join(sourcePath, "worker.bin"), "new binary");
        const releases = await manager.fetchRegistry();
        releases[0].version = "2.0.0";
        const updated = await manager.installTool("registry-worker");
        expect(updated.installPath).toBe(installed.installPath);
        expect(updated.version).toBe("2.0.0");
        expect(fs.readFileSync(path.join(updated.installPath, "worker.bin"), "utf-8")).toBe("new binary");
        expect(fs.existsSync(path.join(updated.installPath, "obsolete.bin"))).toBe(false);
        expect(new ToolManager(root).getTool(updated.id)?.version).toBe("2.0.0");
        expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".pptb-install-"))).toEqual([]);
    });
});
