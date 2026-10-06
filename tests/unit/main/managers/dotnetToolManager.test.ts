import { execFile, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import { EventEmitter } from "events";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, relative, sep } from "path";
import { PassThrough } from "stream";
import type { DotNetToolPreparationRequest } from "../../../../src/common/types/dotnetTool";
import type { DotNetDiscoverySelection } from "../../../../src/common/types/dotnetWorker";
import { defaultExec, DotNetToolManager, type DotNetToolExecOptions, type DotNetToolPreparationDependencies } from "../../../../src/main/managers/dotnetToolManager";
import { dotNetHash, dotNetStableJson, normalizeDotNetNuGetVersion, parseDotNetPackageXml } from "../../../../src/main/utilities/dotnetToolPreparation";

jest.mock("child_process", () => ({ execFile: jest.fn() }));

class RestoreChild extends EventEmitter {
    readonly stdin = new PassThrough();
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    readonly kill = jest.fn(() => true);
    close(): void {
        this.stdout.destroy();
        this.stderr.destroy();
        this.emit("close", null, "SIGKILL");
    }
}

type RestoreCallback = (error: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void;

describe("DotNet default exec close barrier", () => {
    let child: RestoreChild;
    let callback: RestoreCallback;
    let options: DotNetToolExecOptions;
    let abort: AbortController;

    beforeEach(() => {
        jest.useFakeTimers();
        child = new RestoreChild();
        abort = new AbortController();
        options = {
            signal: abort.signal,
            cwd: "/cache/stage",
            env: {},
            encoding: "utf8",
            shell: false,
            timeout: 100,
            terminationTimeoutMs: 20,
            killSignal: "SIGKILL",
            maxBuffer: 1024,
            windowsHide: true,
        };
        jest.mocked(execFile).mockReset();
        jest.mocked(execFile).mockImplementation(((_host: string, _args: string[], _options: unknown, complete: RestoreCallback) => {
            callback = complete;
            return child as unknown as ChildProcess;
        }) as typeof execFile);
    });

    afterEach(() => {
        jest.useRealTimers();
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
    });

    test("abort kills with configured SIGKILL but early AbortError callback cannot settle before close", async () => {
        const result = defaultExec("/dotnet/dotnet", ["tool", "restore"], options);
        let settled = false;
        const observed = result.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        const rejected = expect(result).rejects.toMatchObject({ code: "RESTORE_FAILED" });
        abort.abort();
        callback(Object.assign(new Error("aborted"), { name: "AbortError" }), "", "private diagnostics");
        child.emit("exit", null, "SIGKILL");
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        const passedOptions = jest.mocked(execFile).mock.calls[0][2];
        expect(passedOptions).not.toHaveProperty("signal");
        expect(passedOptions).not.toHaveProperty("timeout");
        expect(passedOptions).not.toHaveProperty("terminationTimeoutMs");
        child.close();
        await rejected;
        await observed;
        expect(jest.getTimerCount()).toBe(0);
    });

    test("already aborted control never starts a child", async () => {
        abort.abort();
        await expect(defaultExec("/dotnet/dotnet", [], options)).rejects.toMatchObject({ code: "CANCELLED" });
        expect(execFile).not.toHaveBeenCalled();
    });

    test("abort during execFile return is caught after listener installation", async () => {
        jest.mocked(execFile).mockImplementation(((_host: string, _args: string[], _options: unknown, complete: RestoreCallback) => {
            callback = complete;
            abort.abort();
            return child as unknown as ChildProcess;
        }) as typeof execFile);
        const result = defaultExec("/dotnet/dotnet", [], options);
        const rejected = expect(result).rejects.toMatchObject({ code: "RESTORE_FAILED" });
        expect(child.kill).toHaveBeenCalledTimes(1);
        callback(new Error("aborted"), "", "");
        child.close();
        await rejected;
    });

    test.each(["abort", "timeout", "max-buffer"])("%s without close yields bounded redacted unverified failure", async (cause) => {
        const result = defaultExec("/dotnet/dotnet", [], options);
        const rejected = expect(result).rejects.toMatchObject({ code: "RESTORE_STOP_UNVERIFIED", message: "DotNet preparation failed: RESTORE_STOP_UNVERIFIED" });
        if (cause === "abort") abort.abort();
        if (cause === "timeout") jest.advanceTimersByTime(options.timeout);
        callback(new Error(cause), "", "secret stderr");
        jest.advanceTimersByTime(20);
        await rejected;
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        expect(child.listenerCount("close")).toBe(0);
        expect(jest.getTimerCount()).toBe(0);
    });

    test.each(["timeout", "max-buffer"])("%s waits for close even after an error callback", async (cause) => {
        const result = defaultExec("/dotnet/dotnet", [], options);
        const rejected = expect(result).rejects.toMatchObject({ code: "RESTORE_FAILED" });
        if (cause === "timeout") jest.advanceTimersByTime(options.timeout);
        callback(new Error(cause), "", "");
        expect(child.kill).toHaveBeenCalledWith("SIGKILL");
        child.close();
        await rejected;
    });

    test.each(["callback-first", "close-first"])("normal result requires both callback and close (%s)", async (order) => {
        const result = defaultExec("/dotnet/dotnet", [], options);
        let settled = false;
        const observed = result.then(() => {
            settled = true;
        });
        if (order === "callback-first") callback(null, "10.0.100", "");
        else child.close();
        await Promise.resolve();
        expect(settled).toBe(false);
        if (order === "callback-first") child.close();
        else callback(null, "10.0.100", "");
        await expect(result).resolves.toBe("10.0.100");
        await observed;
        abort.abort();
        expect(child.kill).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
});

function selection(): DotNetDiscoverySelection {
    const installation = (version: string, directory: string) => {
        const [major, minor, patch] = version.split(".").map(Number);
        return { version, major, minor, patch, directory };
    };
    return {
        hostPath: "/usr/local/share/dotnet/dotnet",
        hostRoot: "/usr/local/share/dotnet",
        architecture: "arm64",
        platform: "macos-arm64",
        nativeRid: "osx-arm64",
        platformMatrixVersion: 1,
        sdk: installation("10.0.100", "/usr/local/share/dotnet/sdk"),
        sdkRuntime: installation("10.0.1", "/usr/local/share/dotnet/shared/Microsoft.NETCore.App"),
        sdkRuntimeConfigPath: "/usr/local/share/dotnet/sdk/10.0.100/dotnet.runtimeconfig.json",
        runtime: installation("8.0.12", "/usr/local/share/dotnet/shared/Microsoft.NETCore.App"),
        nativeRollForward: "Major",
        sdkPin: { sdk: { version: "10.0.100", rollForward: "disable", allowPrerelease: false, paths: ["$host$"] } },
        attempts: [],
    };
}

function request(): DotNetToolPreparationRequest {
    return {
        identity: { toolId: "resolved-tool", toolVersion: "2.0.0", workerId: "engine", sourceFingerprint: "a".repeat(64) },
        declaration: {
            kind: "dotnet-tool",
            packageId: "Contoso.Worker",
            packageVersion: "01.2+build.7",
            command: "contoso-worker",
            dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0", rollForward: "Major" },
            platforms: ["all"],
        },
        selection: selection(),
    };
}

async function restore(workspace: string, input: DotNetToolPreparationRequest): Promise<void> {
    const packageId = input.declaration.packageId.toLowerCase();
    const version = normalizeDotNetNuGetVersion(input.declaration.packageVersion);
    const packageRoot = join(workspace, "packages", packageId, version);
    const artifacts = join(packageRoot, "tools", input.declaration.dotnet.targetFramework, "any");
    await fs.mkdir(artifacts, { recursive: true });
    await fs.writeFile(
        join(packageRoot, `${packageId}.nuspec`),
        `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd"><metadata><id>${input.declaration.packageId}</id><version>${version}</version><description>Test &amp; fixture</description></metadata></package>`,
    );
    const archive = join(packageRoot, `${packageId}.${version}.nupkg`);
    const archiveBytes = "fake downloaded archive";
    const contentHash = createHash("sha512").update(archiveBytes).digest("base64");
    await fs.writeFile(archive, archiveBytes);
    await fs.writeFile(`${archive}.sha512`, contentHash);
    await fs.writeFile(join(packageRoot, ".nupkg.metadata"), JSON.stringify({ version: 2, contentHash, source: "https://api.nuget.org/v3/index.json" }));
    await fs.writeFile(
        join(artifacts, "DotnetToolSettings.xml"),
        `<DotNetCliTool Version="1"><Commands><Command Name="${input.declaration.command}" EntryPoint="Worker.dll" Runner="dotnet" /></Commands></DotNetCliTool>`,
    );
    await fs.writeFile(join(artifacts, "Worker.dll"), "fixture assembly bytes");
    await fs.writeFile(join(artifacts, "Dependency.dll"), "fixture dependency bytes");
    await fs.writeFile(
        join(artifacts, "Worker.runtimeconfig.json"),
        JSON.stringify({
            runtimeOptions: {
                tfm: input.declaration.dotnet.targetFramework,
                framework: { name: "Microsoft.NETCore.App", version: input.declaration.dotnet.minimumRuntimeVersion },
                rollForward: input.selection.nativeRollForward,
            },
        }),
    );
    await fs.writeFile(
        join(artifacts, "Worker.deps.json"),
        JSON.stringify({
            runtimeTarget: { name: ".NETCoreApp,Version=v8.0" },
            targets: {
                ".NETCoreApp,Version=v8.0": {
                    "Worker/1.2.0": { runtime: { "Worker.dll": {} }, dependencies: { Dependency: "1.0.0" } },
                    "Dependency/1.0.0": { runtime: { "lib/net8.0/Dependency.dll": {} } },
                },
            },
            libraries: { "Worker/1.2.0": { type: "project" }, "Dependency/1.0.0": { type: "package" } },
        }),
    );
    const resolver = join(workspace, "cli-home", ".dotnet", "toolResolverCache", "1", packageId);
    await fs.mkdir(dirname(resolver), { recursive: true });
    await fs.writeFile(
        resolver,
        JSON.stringify([
            { Version: version, TargetFramework: "net10.0", RuntimeIdentifier: "any", Name: input.declaration.command, Runner: "dotnet", PathToExecutable: join(artifacts, "Worker.dll") },
        ]),
    );
}

async function resealChangedArtifact(workspace: string, file: string): Promise<void> {
    const markerPath = join(workspace, "complete.json");
    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    marker.files[relative(workspace, file).split(sep).join("/")] = dotNetHash(await fs.readFile(file));
    marker.integrityHash = dotNetHash(dotNetStableJson(marker.files));
    await fs.writeFile(markerPath, dotNetStableJson(marker));
}

describe("DotNet pinned preparation", () => {
    let root: string;
    let input: DotNetToolPreparationRequest;
    let dependencies: DotNetToolPreparationDependencies;
    let executor: jest.Mock<Promise<string>, [string, readonly string[], DotNetToolExecOptions]>;
    let afterRestore: (workspace: string) => Promise<void>;
    let manager: DotNetToolManager;

    beforeEach(async () => {
        root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pptb-pr3-")));
        input = request();
        afterRestore = async () => undefined;
        executor = jest.fn(async (_host, args, options) => {
            if (args[0] === "--version") return "10.0.100\n";
            await restore(options.cwd, input);
            await afterRestore(options.cwd);
            return "restored";
        });
        dependencies = {
            approve: jest.fn(async () => true),
            rediscover: jest.fn(async () => ({ ok: true as const, value: input.selection })),
            exec: executor,
            inventory: jest.fn(async (_file, contents) => JSON.parse(contents)),
        };
        manager = new DotNetToolManager(root, dependencies);
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    test("denial occurs before any filesystem, discovery, execution or cache access", async () => {
        const lstat = jest.fn(async () => {
            throw new Error("filesystem must not be touched");
        });
        dependencies.approve = jest.fn(async () => false);
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, lstat } });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "APPROVAL_DENIED" });
        expect(lstat).not.toHaveBeenCalled();
        expect(dependencies.rediscover).not.toHaveBeenCalled();
        expect(executor).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("revoked approval after rediscovery prevents preparation filesystem access", async () => {
        const abort = new AbortController();
        const lstat = jest.fn(async () => {
            throw new Error("filesystem must not be touched");
        });
        dependencies.rediscover = jest.fn(async () => {
            abort.abort();
            return { ok: true as const, value: input.selection };
        });
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, lstat } });
        await expect(manager.prepare(input, { signal: abort.signal, assertCurrent: () => undefined })).rejects.toMatchObject({ code: "CANCELLED" });
        expect(lstat).not.toHaveBeenCalled();
        expect(executor).not.toHaveBeenCalled();
    });

    test("revocation during SDK check prevents the next restore command and rolls back", async () => {
        const abort = new AbortController();
        executor.mockImplementation(async (_host, _args, options) => {
            expect(options.signal).toBe(abort.signal);
            abort.abort();
            return "10.0.100";
        });
        await expect(manager.prepare(input, { signal: abort.signal, assertCurrent: () => undefined })).rejects.toMatchObject({ code: "CANCELLED" });
        expect(executor).toHaveBeenCalledTimes(1);
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("active restore receives cancellation and cannot publish a descriptor", async () => {
        const abort = new AbortController();
        executor.mockImplementation(async (_host, args, options) => {
            if (args[0] === "--version") return "10.0.100";
            expect(options.signal).toBe(abort.signal);
            abort.abort();
            throw new Error("aborted execFile");
        });
        await expect(manager.prepare(input, { signal: abort.signal, assertCurrent: () => undefined })).rejects.toMatchObject({ code: "CANCELLED" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test.each([false, true])("default adapter retains staging until observed close (unverified=%s)", async (unverified) => {
        const abort = new AbortController();
        const child = new RestoreChild();
        let callback!: RestoreCallback;
        let entered!: () => void;
        const restoring = new Promise<void>((complete) => {
            entered = complete;
        });
        jest.mocked(execFile).mockReset();
        jest.mocked(execFile).mockImplementation(((_host: string, args: string[], _options: unknown, complete: RestoreCallback) => {
            if (args[0] === "--version") {
                const sdk = new RestoreChild();
                void Promise.resolve().then(() => {
                    complete(null, "10.0.100", "");
                    sdk.close();
                });
                return sdk as unknown as ChildProcess;
            }
            callback = complete;
            entered();
            return child as unknown as ChildProcess;
        }) as typeof execFile);
        const { exec: discarded, ...defaultDependencies } = dependencies;
        void discarded;
        manager = new DotNetToolManager(root, defaultDependencies);
        jest.useFakeTimers();
        const preparation = manager.prepare(input, { signal: abort.signal, assertCurrent: () => undefined });
        const rejected = expect(preparation).rejects.toMatchObject({ code: unverified ? "RESTORE_STOP_UNVERIFIED" : "CANCELLED" });
        let settled = false;
        const observed = preparation.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        try {
            await restoring;
            abort.abort();
            callback(Object.assign(new Error("aborted"), { name: "AbortError" }), "", "");
            await Promise.resolve();
            expect(settled).toBe(false);
            expect(child.kill).toHaveBeenCalledWith("SIGKILL");
            const retained = await fs.readdir(root);
            expect(retained.filter((name) => name.includes(".stage-"))).toHaveLength(1);
            expect(retained.filter((name) => name.endsWith(".lock"))).toHaveLength(1);
            if (unverified) jest.advanceTimersByTime(5000);
            else child.close();
        } finally {
            jest.useRealTimers();
        }
        await rejected;
        await observed;
        if (unverified) {
            expect(await fs.readdir(root)).toHaveLength(2);
            await expect(new DotNetToolManager(root, defaultDependencies).prepare(input)).rejects.toMatchObject({ code: "PREPARATION_BUSY" });
            child.close();
            expect(await fs.readdir(root)).toHaveLength(2);
        } else expect(await fs.readdir(root)).toEqual([]);
    });

    test("restores a normalized exact version with isolated direct commands and root manifest", async () => {
        const prepared = await manager.prepare(input);
        expect(prepared).toMatchObject({ packageId: "contoso.worker", packageVersion: "1.2.0", command: "contoso-worker", reused: false });
        expect(prepared.entryPoint.startsWith(prepared.workspace)).toBe(true);
        const manifest = JSON.parse(await fs.readFile(prepared.manifestPath, "utf8"));
        expect(manifest).toEqual({ version: 1, isRoot: true, tools: { "contoso.worker": { version: "1.2.0", commands: ["contoso-worker"] } } });
        const [host, args, options] = executor.mock.calls[1];
        expect(host).toBe(input.selection.hostPath);
        expect(args).toEqual([
            "tool",
            "restore",
            "--tool-manifest",
            join(options.cwd, ".config", "dotnet-tools.json"),
            "--configfile",
            join(options.cwd, "NuGet.Config"),
            "--no-cache",
            "--disable-parallel",
            "--verbosity",
            "minimal",
        ]);
        expect(options).toMatchObject({ shell: false, timeout: 120000, maxBuffer: 256 * 1024, killSignal: "SIGKILL" });
        expect(options.env).not.toHaveProperty("PATH");
        expect(options.env).not.toHaveProperty("DOTNET_STARTUP_HOOKS");
        expect(options.env.NUGET_PACKAGES).toBe(join(options.cwd, "packages"));
        expect(options.env.DOTNET_CLI_HOME).toBe(join(options.cwd, "cli-home"));
        expect(JSON.parse(await fs.readFile(join(prepared.workspace, "global.json"), "utf8"))).toEqual(input.selection.sdkPin);
        expect(await fs.readFile(join(prepared.workspace, "NuGet.Config"), "utf8")).toContain('<clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json"');
        expect(JSON.parse(await fs.readFile(join(prepared.workspace, "cli-home", ".dotnet", "toolResolverCache", "1", "contoso.worker"), "utf8"))[0].PathToExecutable).toBe(prepared.entryPoint);
        expect((await fs.readdir(root)).length).toBe(1);
    });

    test("warm cache is reapproved and rediscovered without any preparation command", async () => {
        const cold = await manager.prepare(input);
        executor.mockClear();
        const warm = await new DotNetToolManager(root, dependencies).prepare(input);
        expect(warm).toMatchObject({ workspace: cold.workspace, integrityHash: cold.integrityHash, reused: true });
        expect(executor).not.toHaveBeenCalled();
        expect(dependencies.approve).toHaveBeenCalledTimes(2);
        expect(dependencies.rediscover).toHaveBeenCalledTimes(2);
    });

    test.each([false, true])("successful preparation awaits lock cleanup before returning (reused=%s)", async (reused) => {
        if (reused) await manager.prepare(input);
        executor.mockClear();
        let release: () => void = () => undefined;
        let entered: () => void = () => undefined;
        const blocked = new Promise<void>((complete) => {
            release = complete;
        });
        const cleaning = new Promise<void>((complete) => {
            entered = complete;
        });
        const rmdir: typeof fs.rmdir = async (path, options) => {
            entered();
            await blocked;
            return fs.rmdir(path, options);
        };
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, rmdir } });
        let settled = false;
        const preparation = manager.prepare(input);
        const observed = preparation.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        await cleaning;
        try {
            expect(settled).toBe(false);
            expect((await fs.readdir(root)).filter((name) => name.endsWith(".lock"))).toHaveLength(1);
        } finally {
            release();
        }
        const prepared = await preparation;
        await observed;
        expect(prepared.reused).toBe(reused);
        expect(await fs.readdir(root)).toEqual([relative(root, prepared.workspace)]);
        expect(executor).toHaveBeenCalledTimes(reused ? 0 : 2);
    });

    test.each([false, true])("lock cleanup failure rejects a successful descriptor without rolling back the completed workspace (reused=%s)", async (reused) => {
        if (reused) await manager.prepare(input);
        executor.mockClear();
        const rmdir = jest.fn(async () => {
            throw new Error("lock removal failed");
        });
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, rmdir } });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "WORKSPACE_INVALID", message: "DotNet preparation failed: WORKSPACE_INVALID" });
        expect(rmdir).toHaveBeenCalledTimes(1);
        const names = await fs.readdir(root);
        const workspace = names.find((name) => !name.endsWith(".lock"));
        expect(workspace).toBeDefined();
        expect(names).toHaveLength(2);
        expect(JSON.parse(await fs.readFile(join(root, workspace!, "complete.json"), "utf8"))).toHaveProperty("integrityHash");
        expect(await fs.readdir(join(root, `${workspace}.lock`))).toEqual([]);
        expect(executor).toHaveBeenCalledTimes(reused ? 0 : 2);
    });

    test("lock cleanup failure takes precedence over SDK failure after removing staging", async () => {
        executor.mockResolvedValue("11.0.100\n");
        const rmdir = jest.fn(async () => {
            throw new Error("lock removal failed");
        });
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, rmdir } });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "WORKSPACE_INVALID" });
        expect(rmdir).toHaveBeenCalledTimes(1);
        const names = await fs.readdir(root);
        expect(names).toHaveLength(1);
        expect(names[0]).toMatch(/\.lock$/);
        expect(await fs.readdir(join(root, names[0]))).toEqual([]);
        expect(executor).toHaveBeenCalledTimes(1);
    });

    test("staging cleanup failure takes precedence over SDK failure without continuing lock cleanup", async () => {
        executor.mockResolvedValue("11.0.100\n");
        const rm = jest.fn(async () => {
            throw new Error("staging removal failed");
        });
        const rmdir = jest.fn(fs.rmdir);
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, rm, rmdir } });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "WORKSPACE_INVALID" });
        expect(rm).toHaveBeenCalledTimes(1);
        expect(rmdir).not.toHaveBeenCalled();
        const names = await fs.readdir(root);
        expect(names).toHaveLength(2);
        expect(names.filter((name) => name.includes(".stage-"))).toHaveLength(1);
        const lock = names.find((name) => name.endsWith(".lock"));
        expect(lock).toBeDefined();
        expect(await fs.readFile(join(root, lock!, "owner"), "utf8")).not.toBe("");
        expect(executor).toHaveBeenCalledTimes(1);
    });

    test("denied warm reuse makes no further discovery or execution", async () => {
        await manager.prepare(input);
        dependencies.approve = jest.fn(async () => false);
        (dependencies.rediscover as jest.Mock).mockClear();
        executor.mockClear();
        await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: "APPROVAL_DENIED" });
        expect(dependencies.rediscover).not.toHaveBeenCalled();
        expect(executor).not.toHaveBeenCalled();
    });

    test("concurrent calls deduplicate restoration but independently require approval", async () => {
        const [first, second, third] = await Promise.all([manager.prepare(input), manager.prepare(input), manager.prepare(input)]);
        expect(first).toEqual(second);
        expect(second).toEqual(third);
        expect(executor).toHaveBeenCalledTimes(2);
        expect(dependencies.approve).toHaveBeenCalledTimes(3);
    });

    test("wrong SDK is rejected before restore and cleans staging and lock", async () => {
        executor.mockResolvedValue("11.0.100\n");
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "SDK_MISMATCH" });
        expect(executor).toHaveBeenCalledTimes(1);
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("changed discovery rejects supplied paths before workspace access", async () => {
        input.selection.hostPath = "/untrusted/dotnet";
        input.selection.hostRoot = "/untrusted";
        dependencies.rediscover = jest.fn(async () => ({ ok: true as const, value: selection() }));
        await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: "DISCOVERY_CHANGED" });
        expect(executor).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("failed restore removes all partial preparation and permits retry", async () => {
        afterRestore = async () => {
            throw new Error("untrusted package diagnostics and secrets");
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "RESTORE_FAILED", message: "DotNet preparation failed: RESTORE_FAILED" });
        expect(await fs.readdir(root)).toEqual([]);
        afterRestore = async () => undefined;
        expect((await manager.prepare(input)).reused).toBe(false);
    });

    test.each([
        "global.json",
        "NuGet.Config",
        ".config/dotnet-tools.json",
        "packages/contoso.worker/1.2.0/tools/net8.0/any/Worker.dll",
        "cli-home/.dotnet/toolResolverCache/1/contoso.worker",
        "complete.json",
    ])("tampered warm %s fails closed without restore", async (file) => {
        const prepared = await manager.prepare(input);
        await fs.appendFile(join(prepared.workspace, file), "tamper");
        executor.mockClear();
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "CACHE_INVALID" });
        expect(executor).not.toHaveBeenCalled();
        expect(await fs.readFile(join(prepared.workspace, file), "utf8")).toContain("tamper");
    });

    test.each(["command", "version", "entrypoint", "framework", "policy", "deps", "nuspec"])("restored %s mismatch is rejected and rolled back", async (field) => {
        afterRestore = async (workspace) => {
            const artifacts = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any");
            const resolver = join(workspace, "cli-home", ".dotnet", "toolResolverCache", "1", "contoso.worker");
            if (["command", "version", "entrypoint"].includes(field)) {
                const rows = JSON.parse(await fs.readFile(resolver, "utf8"));
                if (field === "command") rows[0].Name = "other";
                if (field === "version") rows[0].Version = "1.2.1";
                if (field === "entrypoint") rows[0].PathToExecutable = join(root, "elsewhere.dll");
                await fs.writeFile(resolver, JSON.stringify(rows));
            } else if (field === "framework" || field === "policy") {
                const config = JSON.parse(await fs.readFile(join(artifacts, "Worker.runtimeconfig.json"), "utf8"));
                if (field === "framework") config.runtimeOptions.framework.name = "Microsoft.AspNetCore.App";
                else config.runtimeOptions.rollForward = "Disable";
                await fs.writeFile(join(artifacts, "Worker.runtimeconfig.json"), JSON.stringify(config));
            } else if (field === "deps") {
                await fs.writeFile(join(artifacts, "Worker.deps.json"), JSON.stringify({ runtimeTarget: { name: ".NETCoreApp,Version=v9.0" } }));
            } else
                await fs.writeFile(join(workspace, "packages", "contoso.worker", "1.2.0", "contoso.worker.nuspec"), "<package><metadata><id>Other</id><version>1.2.0</version></metadata></package>");
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("package settings traversal fails even with a matching resolver", async () => {
        afterRestore = async (workspace) => {
            await fs.writeFile(
                join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "DotnetToolSettings.xml"),
                '<DotNetCliTool Version="1"><Commands><Command Name="contoso-worker" EntryPoint="../../Worker.dll" Runner="dotnet" /></Commands></DotNetCliTool>',
            );
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("cold symlink entrypoint cannot escape staging", async () => {
        afterRestore = async (workspace) => {
            const assembly = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "Worker.dll");
            await fs.unlink(assembly);
            await fs.symlink(join(root, "outside.dll"), assembly);
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("warm symlink and missing complete marker reject without network", async () => {
        const prepared = await manager.prepare(input);
        await fs.unlink(prepared.entryPoint);
        await fs.symlink(join(root, "outside.dll"), prepared.entryPoint);
        executor.mockClear();
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "CACHE_INVALID" });
        await fs.unlink(join(prepared.workspace, "complete.json"));
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "CACHE_INVALID" });
        expect(executor).not.toHaveBeenCalled();
    });

    test("a pre-existing lock is not stolen or deleted", async () => {
        const prepared = await manager.prepare(input);
        const lock = `${prepared.workspace}.lock`;
        await fs.mkdir(lock);
        await fs.writeFile(join(lock, "owner"), "another process");
        executor.mockClear();
        await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: "PREPARATION_BUSY" });
        expect(await fs.readFile(join(lock, "owner"), "utf8")).toBe("another process");
        expect(executor).not.toHaveBeenCalled();
    });

    test("separate managers cannot restore the same workspace concurrently", async () => {
        let release: () => void = () => undefined;
        let entered: () => void = () => undefined;
        const blocked = new Promise<void>((complete) => {
            release = complete;
        });
        const restoring = new Promise<void>((complete) => {
            entered = complete;
        });
        afterRestore = async () => {
            entered();
            await blocked;
        };
        const first = manager.prepare(input);
        await restoring;
        try {
            await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: "PREPARATION_BUSY" });
            expect(executor).toHaveBeenCalledTimes(2);
        } finally {
            release();
        }
        expect((await first).reused).toBe(false);
    });

    test.each(["archive", "source", "digest", "manifest", "settings", "dependencyTraversal", "missingDependency"])("cold %s inconsistency fails artifact verification", async (field) => {
        afterRestore = async (workspace) => {
            const packageRoot = join(workspace, "packages", "contoso.worker", "1.2.0");
            const artifacts = join(packageRoot, "tools", "net8.0", "any");
            if (field === "archive") await fs.appendFile(join(packageRoot, "contoso.worker.1.2.0.nupkg"), "changed");
            if (field === "source") {
                const metadata = JSON.parse(await fs.readFile(join(packageRoot, ".nupkg.metadata"), "utf8"));
                metadata.source = "https://untrusted.invalid/v3/index.json";
                await fs.writeFile(join(packageRoot, ".nupkg.metadata"), JSON.stringify(metadata));
            }
            if (field === "digest") await fs.writeFile(join(packageRoot, "contoso.worker.1.2.0.nupkg.sha512"), "wrong digest");
            if (field === "manifest") {
                const file = join(workspace, ".config", "dotnet-tools.json");
                const manifest = JSON.parse(await fs.readFile(file, "utf8"));
                manifest.tools["contoso.worker"].version = "1.2.1";
                await fs.writeFile(file, JSON.stringify(manifest));
            }
            if (field === "settings")
                await fs.writeFile(
                    join(artifacts, "DotnetToolSettings.xml"),
                    '<DotNetCliTool Version="1"><Commands><Command Name="other-command" EntryPoint="Worker.dll" Runner="dotnet" /></Commands></DotNetCliTool>',
                );
            if (field === "dependencyTraversal") {
                const file = join(artifacts, "Worker.deps.json");
                const deps = JSON.parse(await fs.readFile(file, "utf8"));
                deps.targets[".NETCoreApp,Version=v8.0"]["Worker/1.2.0"].runtime["../escape.dll"] = {};
                await fs.writeFile(file, JSON.stringify(deps));
            }
            if (field === "missingDependency") await fs.unlink(join(artifacts, "Dependency.dll"));
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("a changed SDK pin is checked again before the download command", async () => {
        executor.mockImplementation(async (_host, args, options) => {
            if (args[0] === "--version") {
                await fs.writeFile(join(options.cwd, "global.json"), JSON.stringify({ sdk: { version: "11.0.100" } }));
                return "10.0.100\n";
            }
            throw new Error("download must not occur");
        });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(executor).toHaveBeenCalledTimes(1);
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("root symlink is rejected without a CLI call", async () => {
        const actual = join(root, "actual");
        const alias = join(root, "alias");
        await fs.mkdir(actual);
        await fs.symlink(actual, alias);
        await expect(new DotNetToolManager(alias, dependencies).prepare(input)).rejects.toMatchObject({ code: "WORKSPACE_INVALID" });
        expect(executor).not.toHaveBeenCalled();
        expect(await fs.readdir(actual)).toEqual([]);
    });

    test("filesystem lock symlink is never followed or removed", async () => {
        const prepared = await manager.prepare(input);
        const target = join(root, "foreign-lock");
        await fs.mkdir(target);
        await fs.writeFile(join(target, "owner"), "foreign");
        const lock = `${prepared.workspace}.lock`;
        await fs.symlink(target, lock);
        executor.mockClear();
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "PREPARATION_BUSY" });
        expect((await fs.lstat(lock)).isSymbolicLink()).toBe(true);
        expect(await fs.readFile(join(target, "owner"), "utf8")).toBe("foreign");
        expect(executor).not.toHaveBeenCalled();
    });

    test("unexpected renderer-style override fields are rejected", async () => {
        const overridden = { ...input, cwd: "/untrusted", feed: "https://untrusted.invalid" };
        await expect(manager.prepare(overridden)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
        expect(executor).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("completion-marker write failure rolls back the renamed workspace", async () => {
        const writeFile: typeof fs.writeFile = async (file, data, options) => {
            if (String(file).endsWith("complete.json")) throw new Error("disk full");
            return fs.writeFile(file, data, options);
        };
        manager = new DotNetToolManager(root, { ...dependencies, fs: { ...fs, writeFile } });
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "WORKSPACE_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("Latest is accepted only with packaged LatestMajor", async () => {
        input.declaration.dotnet.rollForward = "Latest";
        input.selection.nativeRollForward = "LatestMajor";
        expect((await manager.prepare(input)).command).toBe("contoso-worker");
    });

    test.each(["Disable", "Minor", "Major", "Latest"] as const)("matching packaged %s policy prepares without a policy override", async (policy) => {
        input.declaration.dotnet.rollForward = policy;
        input.selection.nativeRollForward = policy === "Latest" ? "LatestMajor" : policy;
        if (policy === "Disable") input.selection.runtime = { ...input.selection.runtime, patch: 0, version: "8.0.0" };
        expect((await manager.prepare(input)).selection.nativeRollForward).toBe(input.selection.nativeRollForward);
    });

    test("omitted packaged policy cannot be broadened to default Major", async () => {
        afterRestore = async (workspace) => {
            const file = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "Worker.runtimeconfig.json");
            const config = JSON.parse(await fs.readFile(file, "utf8"));
            delete config.runtimeOptions.rollForward;
            await fs.writeFile(file, JSON.stringify(config));
        };
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
        expect(await fs.readdir(root)).toEqual([]);
    });

    test("omitted packaged policy uses native Minor when the declaration matches", async () => {
        input.declaration.dotnet.rollForward = "Minor";
        input.selection.nativeRollForward = "Minor";
        afterRestore = async (workspace) => {
            const file = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "Worker.runtimeconfig.json");
            const config = JSON.parse(await fs.readFile(file, "utf8"));
            delete config.runtimeOptions.rollForward;
            await fs.writeFile(file, JSON.stringify(config));
        };
        const prepared = await manager.prepare(input);
        expect(prepared.selection.nativeRollForward).toBe("Minor");
        executor.mockClear();
        expect((await new DotNetToolManager(root, dependencies).prepare(input)).reused).toBe(true);
        expect(executor).not.toHaveBeenCalled();
    });

    describe.each(["cold", "warm"] as const)("%s runtime configuration rejection", (phase) => {
        const cases: { name: string; scope: "runtimeOptions" | "framework"; fields: Record<string, unknown> }[] = [
            ...["Disable", "Minor", "Major", "LatestMajor"].map((rollForward) => ({ name: `nested ${rollForward}`, scope: "framework" as const, fields: { rollForward } })),
            ...[true, false].map((applyPatches) => ({ name: `explicit rollForward with applyPatches ${applyPatches}`, scope: "runtimeOptions" as const, fields: { applyPatches } })),
            ...[0, 1, 2].map((rollForwardOnNoCandidateFx) => ({
                name: `explicit rollForward with legacy policy ${rollForwardOnNoCandidateFx}`,
                scope: "runtimeOptions" as const,
                fields: { rollForwardOnNoCandidateFx },
            })),
            { name: "nested applyPatches", scope: "framework", fields: { applyPatches: true } },
            { name: "nested legacy policy", scope: "framework", fields: { rollForwardOnNoCandidateFx: 2 } },
            { name: "nested rollForward with applyPatches", scope: "framework", fields: { rollForward: "Major", applyPatches: true } },
            { name: "nested rollForward with legacy policy", scope: "framework", fields: { rollForward: "Major", rollForwardOnNoCandidateFx: 2 } },
            { name: "null explicit policy is not omission", scope: "runtimeOptions", fields: { rollForward: null } },
        ];

        test.each(cases)("rejects $name", async ({ scope, fields }) => {
            const mutate = async (workspace: string): Promise<void> => {
                const file = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "Worker.runtimeconfig.json");
                const config = JSON.parse(await fs.readFile(file, "utf8"));
                Object.assign(scope === "framework" ? config.runtimeOptions.framework : config.runtimeOptions, fields);
                await fs.writeFile(file, JSON.stringify(config));
                if (phase === "warm") await resealChangedArtifact(workspace, file);
            };
            if (phase === "cold") afterRestore = mutate;
            else {
                const prepared = await manager.prepare(input);
                await mutate(prepared.workspace);
                executor.mockClear();
                (dependencies.inventory as jest.Mock).mockClear();
            }
            await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: phase === "cold" ? "ARTIFACT_INVALID" : "CACHE_INVALID" });
            if (phase === "cold") expect(await fs.readdir(root)).toEqual([]);
            else {
                expect(executor).not.toHaveBeenCalled();
                expect(dependencies.inventory).toHaveBeenCalledTimes(1);
            }
        });

        test("rejects adjacent development runtimeconfig even with a valid hash inventory", async () => {
            const mutate = async (workspace: string): Promise<void> => {
                const file = join(workspace, "packages", "contoso.worker", "1.2.0", "tools", "net8.0", "any", "Worker.runtimeconfig.dev.json");
                await fs.writeFile(file, JSON.stringify({ runtimeOptions: { additionalProbingPaths: ["/untrusted/probing"], framework: { name: "Microsoft.NETCore.App", version: "9.0.0" } } }));
                if (phase === "warm") await resealChangedArtifact(workspace, file);
            };
            if (phase === "cold") afterRestore = mutate;
            else {
                const prepared = await manager.prepare(input);
                await mutate(prepared.workspace);
                executor.mockClear();
                (dependencies.inventory as jest.Mock).mockClear();
            }
            await expect(new DotNetToolManager(root, dependencies).prepare(input)).rejects.toMatchObject({ code: phase === "cold" ? "ARTIFACT_INVALID" : "CACHE_INVALID" });
            if (phase === "cold") expect(await fs.readdir(root)).toEqual([]);
            else {
                expect(executor).not.toHaveBeenCalled();
                expect(dependencies.inventory).toHaveBeenCalledTimes(1);
            }
        });
    });

    test("different resolved tool version has a separate workspace", async () => {
        const first = await manager.prepare(input);
        input.identity.toolVersion = "2.0.1";
        const second = await manager.prepare(input);
        expect(second.workspace).not.toBe(first.workspace);
        expect(executor).toHaveBeenCalledTimes(4);
    });

    test.each([
        ["1", "1.0.0"],
        ["01.002.3.0+build", "1.2.3"],
        ["1.2.3.4", "1.2.3.4"],
        ["1.2.3-Beta.2+hash", "1.2.3-beta.2"],
    ])("normalizes exact NuGet %s to %s", (version, expected) => {
        expect(normalizeDotNetNuGetVersion(version)).toBe(expected);
    });

    test.each(["<root><!DOCTYPE anything></root>", "<root>&unknown;</root>", "<root><child></root>", '<root Name="one" Name="two"/>'])("bounded XML rejects unsupported structure %#", (xml) => {
        expect(() => parseDotNetPackageXml(xml)).toThrow();
    });

    test("stable authority encoding ignores object insertion order", () => {
        expect(dotNetStableJson({ second: 2, first: 1 })).toBe(dotNetStableJson({ first: 1, second: 2 }));
    });
});
