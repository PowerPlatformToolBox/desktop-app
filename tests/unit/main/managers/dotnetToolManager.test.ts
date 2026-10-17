import { createHash } from "crypto";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { DotNetToolPreparationRequest } from "../../../../src/common/types/dotnetTool";
import type { DotNetDiscoverySelection } from "../../../../src/common/types/dotnetWorker";
import { DotNetToolManager, DotNetToolPreparationError, type DotNetPreparationControl, type DotNetToolPreparationDependencies } from "../../../../src/main/managers/dotnetToolManager";
import { resolveDotNetPackageSource } from "../../../../src/main/utils/dotnetLocalFeed";
import { parseDotNetPackageXml, verifyDotNetRuntimeConfig } from "../../../../src/main/utils/dotnetToolPreparation";
import { buildToolPackage, buildZip, toolPackageEntries, type ToolPackageFixture } from "../../../fixtures/dotnetToolPackage";

function selection(): DotNetDiscoverySelection {
    return {
        hostPath: "/usr/local/share/dotnet/dotnet",
        hostRoot: "/usr/local/share/dotnet",
        architecture: "arm64",
        platform: "macos-arm64",
        nativeRid: "osx-arm64",
        platformMatrixVersion: 1,
        runtime: { version: "8.0.12", major: 8, minor: 0, patch: 12, directory: "/usr/local/share/dotnet/shared/Microsoft.NETCore.App" },
        nativeRollForward: "Major",
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
        source: { kind: "nuget.org", url: "https://api.nuget.org/v3/index.json" },
    };
}

const sha512 = (bytes: Buffer): string => createHash("sha512").update(bytes).digest("base64");
const packageFixture = (overrides: Partial<ToolPackageFixture> = {}): ToolPackageFixture => ({ packageId: "Contoso.Worker", version: "1.2.0", command: "contoso-worker", ...overrides });

function control(): DotNetPreparationControl & { abort: AbortController } {
    const abort = new AbortController();
    return { abort, signal: abort.signal, assertCurrent: () => undefined };
}

async function exists(file: string): Promise<boolean> {
    return fs.lstat(file).then(
        () => true,
        () => false,
    );
}

describe("DotNetToolManager direct package preparation", () => {
    let root: string;
    let input: DotNetToolPreparationRequest;
    let packageBytes: Buffer;
    let download: jest.Mock<Promise<Buffer>, [string, AbortSignal]>;
    let dependencies: DotNetToolPreparationDependencies;
    let manager: DotNetToolManager;
    let localFeed: string | undefined;

    const workspace = (): string => join(root, "contoso.worker", "1.2.0");

    beforeEach(async () => {
        root = join(await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pptb-dotnet-"))), "native-workers");
        input = request();
        packageBytes = buildToolPackage(packageFixture());
        download = jest.fn(async (_url: string, _signal: AbortSignal) => packageBytes);
        localFeed = undefined;
        dependencies = {
            approve: jest.fn(async () => true),
            localFeedPath: () => localFeed ?? null,
            isDeveloperBuild: true,
            download,
        };
        manager = new DotNetToolManager(root, dependencies);
    });

    afterEach(async () => {
        await fs.rm(dirname(root), { recursive: true, force: true });
        if (localFeed) await fs.rm(localFeed, { recursive: true, force: true });
    });

    test("downloads the exact package from the nuget.org flat container and returns a launch descriptor", async () => {
        const prepared = await manager.prepare(input);
        expect(download).toHaveBeenCalledWith("https://api.nuget.org/v3-flatcontainer/contoso.worker/1.2.0/contoso.worker.1.2.0.nupkg", expect.any(AbortSignal));
        const artifacts = join(workspace(), "tools", "net8.0", "any");
        expect(prepared).toMatchObject({
            identity: input.identity,
            workspace: workspace(),
            packageId: "contoso.worker",
            packageVersion: "1.2.0",
            packageSha512: sha512(packageBytes),
            command: "contoso-worker",
            entryPoint: join(artifacts, "Worker.dll"),
            runtimeConfigPath: join(artifacts, "Worker.runtimeconfig.json"),
            depsPath: join(artifacts, "Worker.deps.json"),
            selection: input.selection,
            reused: false,
        });
        expect(prepared.declarationFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.parse(await fs.readFile(join(workspace(), "complete.json"), "utf8"))).toMatchObject({ schema: 1, packageSha512: sha512(packageBytes) });
        expect(await exists(join(workspace(), "contoso.worker.nuspec"))).toBe(true);
        for (const skipped of ["[Content_Types].xml", "_rels", "package"]) expect(await exists(join(workspace(), skipped))).toBe(false);
        expect(await fs.readdir(join(root, ".tmp"))).toEqual([]);
    });

    test("never creates SDK restore artifacts", async () => {
        await manager.prepare(input);
        for (const artifact of ["global.json", "NuGet.Config", ".config", "cli-home", "packages"]) expect(await exists(join(workspace(), artifact))).toBe(false);
    });

    test("denial occurs before any download or filesystem work", async () => {
        dependencies.approve = jest.fn(async () => false);
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "APPROVAL_DENIED" });
        expect(download).not.toHaveBeenCalled();
        expect(await exists(root)).toBe(false);
    });

    test("warm cache is reused without downloading but still requires approval", async () => {
        await manager.prepare(input);
        const warm = await manager.prepare(input);
        expect(warm).toMatchObject({ reused: true, packageSha512: sha512(packageBytes) });
        expect(download).toHaveBeenCalledTimes(1);
        expect(dependencies.approve).toHaveBeenCalledTimes(2);
        dependencies.approve = jest.fn(async () => false);
        await expect(manager.prepare(input)).rejects.toMatchObject({ code: "APPROVAL_DENIED" });
    });

    test.each([
        ["modified", async (file: string) => fs.writeFile(file, "tampered and longer bytes")],
        ["deleted", async (file: string) => fs.rm(file)],
    ])("a %s cached file is detected and the package is fetched again", async (_label, damage) => {
        await manager.prepare(input);
        await damage(join(workspace(), "tools", "net8.0", "any", "Dependency.dll"));
        const repaired = await manager.prepare(input);
        expect(repaired.reused).toBe(false);
        expect(download).toHaveBeenCalledTimes(2);
        expect(await fs.readFile(join(workspace(), "tools", "net8.0", "any", "Dependency.dll"), "utf8")).toBe("fixture dependency bytes");
    });

    test("concurrent preparations share one download", async () => {
        let release!: () => void;
        download.mockImplementation(() => new Promise<Buffer>((resolve) => (release = () => resolve(packageBytes))));
        const first = manager.prepare(input);
        const second = new DotNetToolManager(root, dependencies).prepare(input);
        await new Promise((resolve) => setTimeout(resolve, 20));
        release();
        const results = await Promise.all([first, second]);
        expect(download).toHaveBeenCalledTimes(1);
        expect(results.map((result) => result.entryPoint)).toEqual([results[0].entryPoint, results[0].entryPoint]);
    });

    test("cancelling the only waiter aborts the download and publishes nothing", async () => {
        let downloadSignal!: AbortSignal;
        download.mockImplementation(
            (_url, signal) =>
                new Promise<Buffer>((_resolve, reject) => {
                    downloadSignal = signal;
                    signal.addEventListener("abort", () => reject(new DotNetToolPreparationError("CANCELLED")), { once: true });
                }),
        );
        const cancel = control();
        const pending = manager.prepare(input, cancel);
        await new Promise((resolve) => setTimeout(resolve, 20));
        cancel.abort.abort();
        await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
        expect(downloadSignal.aborted).toBe(true);
        expect(await exists(workspace())).toBe(false);
    });

    test("one caller cancelling does not cancel another caller's shared download", async () => {
        let release!: () => void;
        let downloadSignal!: AbortSignal;
        download.mockImplementation((_url, signal) => {
            downloadSignal = signal;
            return new Promise<Buffer>((resolve) => (release = () => resolve(packageBytes)));
        });
        const cancelled = control();
        const first = manager.prepare(input, cancelled);
        const second = manager.prepare(input, control());
        await new Promise((resolve) => setTimeout(resolve, 20));
        cancelled.abort.abort();
        await expect(first).rejects.toMatchObject({ code: "CANCELLED" });
        expect(downloadSignal.aborted).toBe(false);
        release();
        await expect(second).resolves.toMatchObject({ reused: false });
    });

    test("a revoked control is rejected before preparation work", async () => {
        const revoked: DotNetPreparationControl = {
            signal: new AbortController().signal,
            assertCurrent: () => {
                throw new Error("revoked");
            },
        };
        await expect(manager.prepare(input, revoked)).rejects.toMatchObject({ code: "CANCELLED" });
        expect(download).not.toHaveBeenCalled();
    });

    test("removes workspaces, staging folders and locks left by the previous dotnet tool restore layout", async () => {
        const legacy = [`${"a".repeat(64)}-osx-arm64`, `${"a".repeat(64)}-osx-arm64.lock`, `${"b".repeat(64)}.stage-kVab4D`];
        await fs.mkdir(root, { recursive: true });
        for (const name of [...legacy, "unrelated"]) await fs.mkdir(join(root, name, "cli-home"), { recursive: true });
        await manager.prepare(input);
        for (const name of legacy) expect(await exists(join(root, name))).toBe(false);
        expect(await exists(join(root, "unrelated"))).toBe(true);
    });

    test.each(["PACKAGE_NOT_FOUND", "DOWNLOAD_FAILED"] as const)("surfaces %s from the download", async (code) => {
        download.mockRejectedValue(new DotNetToolPreparationError(code, undefined, "details"));
        await expect(manager.prepare(input)).rejects.toMatchObject({ code, details: "details" });
        expect(await exists(workspace())).toBe(false);
    });

    test.each([
        ["not a ZIP archive", () => Buffer.from("not a zip"), /not a valid ZIP/],
        ["missing DotnetTool package type", () => buildToolPackage(packageFixture({ packageType: null })), /PackAsTool/],
        ["wrong package type", () => buildToolPackage(packageFixture({ packageType: "Dependency" })), /PackAsTool/],
        ["nuspec identity mismatch", () => buildToolPackage(packageFixture({ nuspecId: "Other.Worker" })), /identity/],
        ["missing nuspec", () => buildToolPackage(packageFixture({ omit: ["Contoso.Worker.nuspec"] })), /no nuspec/],
        ["missing target framework folder", () => buildToolPackage(packageFixture({ targetFramework: "net9.0", minimumRuntimeVersion: "9.0.0" })), /tools\/net8\.0\/any.*found: net9\.0/],
        ["command mismatch", () => buildToolPackage(packageFixture({ command: "other-command" })), /does not match the declared command/],
        [
            "RID-specific or native tool",
            () =>
                buildToolPackage(
                    packageFixture({ toolSettings: `<DotNetCliTool Version="2"><Commands><Command Name="contoso-worker" EntryPoint="Worker" Runner="executable" /></Commands></DotNetCliTool>` }),
                ),
            /framework-dependent/,
        ],
        ["missing entry point", () => buildToolPackage(packageFixture({ omit: ["tools/net8.0/any/Worker.dll"] })), /Entry point Worker\.dll is missing/],
        ["development runtimeconfig", () => buildToolPackage(packageFixture({ extra: [{ name: "tools/net8.0/any/Worker.runtimeconfig.dev.json", data: "{}" }] })), /runtimeconfig\.dev\.json/],
        ["runtime framework version mismatch", () => buildToolPackage(packageFixture({ minimumRuntimeVersion: "8.0.5" })), /must equal declared minimumRuntimeVersion/],
        ["conflicting roll-forward policy", () => buildToolPackage(packageFixture({ rollForward: "Disable" })), /roll-forward/],
        ["missing dependency asset", () => buildToolPackage(packageFixture({ omit: ["tools/net8.0/any/Dependency.dll"] })), /Dependency\.dll" is missing/],
    ])("rejects an invalid package: %s", async (_label, build, details) => {
        packageBytes = build();
        const error = await manager.prepare(input).catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: "PACKAGE_INVALID" });
        expect((error as DotNetToolPreparationError).details).toMatch(details);
    });

    test.each([
        ["path traversal", { name: "tools/net8.0/any/../../../../../evil.txt", data: "x" }, /invalid relative path|unsafe path/],
        ["escaped path traversal", { name: "tools/net8.0/any/%2E%2E/%2E%2E/%2E%2E/%2E%2E/%2E%2E/evil.txt", data: "x" }, /unsafe path/],
        ["symbolic link", { name: "tools/net8.0/any/link.dll", data: "/etc/passwd", mode: 0o120777 }, /symbolic link/],
        ["case-insensitive duplicate", { name: "tools/net8.0/any/worker.DLL", data: "x" }, /duplicate entry/],
        ["drive or stream separator", { name: "tools/net8.0/any/a:b.dll", data: "x" }, /unsafe path/],
    ])("rejects unsafe archive entries: %s", async (_label, entry, details) => {
        packageBytes = buildZip([...toolPackageEntries(packageFixture()), entry]);
        const error = await manager.prepare(input).catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: "PACKAGE_INVALID" });
        expect((error as DotNetToolPreparationError).details).toMatch(details);
        expect(await exists(workspace())).toBe(false);
        expect(await exists(join(dirname(root), "evil.txt"))).toBe(false);
        expect(await fs.readdir(join(root, ".tmp"))).toEqual([]);
    });

    test("decodes NuGet-escaped entry names", async () => {
        packageBytes = buildZip([...toolPackageEntries(packageFixture()), { name: "tools/net8.0/any/Read%20Me.txt", data: "notes" }]);
        await manager.prepare(input);
        expect(await fs.readFile(join(workspace(), "tools", "net8.0", "any", "Read Me.txt"), "utf8")).toBe("notes");
    });

    test("retries a transient Windows rename failure while antivirus scans new files", async () => {
        const platform = Object.getOwnPropertyDescriptor(process, "platform") as PropertyDescriptor;
        const fsModule = jest.requireActual<typeof fs>("fs/promises");
        const realRename = fsModule.rename;
        const rename = jest.spyOn(fsModule, "rename");
        let failures = 2;
        rename.mockImplementation(async (from, to) => {
            if (failures-- > 0) throw Object.assign(new Error("locked"), { code: "EPERM" });
            return realRename(from, to);
        });
        Object.defineProperty(process, "platform", { value: "win32" });
        try {
            await expect(manager.prepare(input)).resolves.toMatchObject({ reused: false });
            expect(rename).toHaveBeenCalledTimes(3);
        } finally {
            Object.defineProperty(process, "platform", platform);
            rename.mockRestore();
        }
    });

    test("unexpected request fields are rejected before download", async () => {
        await expect(manager.prepare({ ...input, executable: "/bin/sh" } as DotNetToolPreparationRequest)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
        await expect(manager.prepare({ ...input, source: { kind: "nuget.org", url: "https://evil.example/v3/index.json" } } as unknown as DotNetToolPreparationRequest)).rejects.toMatchObject({
            code: "INVALID_REQUEST",
        });
        expect(download).not.toHaveBeenCalled();
    });

    test("Latest is accepted only when the package uses LatestMajor", async () => {
        input.declaration.dotnet.rollForward = "Latest";
        input.selection.nativeRollForward = "LatestMajor";
        packageBytes = buildToolPackage(packageFixture({ rollForward: "LatestMajor" }));
        await expect(manager.prepare(input)).resolves.toMatchObject({ reused: false });
    });

    describe("developer local feed", () => {
        beforeEach(async () => {
            localFeed = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pptb-feed-")));
            await fs.writeFile(join(localFeed, "contoso.worker.1.2.0.nupkg"), packageBytes);
            input.source = resolveDotNetPackageSource(localFeed, input.declaration, false, true);
        });

        test("reads the pinned local package without downloading and keys the cache by content", async () => {
            const prepared = await manager.prepare(input);
            expect(download).not.toHaveBeenCalled();
            expect(prepared.workspace).toMatch(/contoso\.worker[\\/]1\.2\.0-local-[a-f0-9]{16}$/);
            expect(prepared.packageSha512).toBe(sha512(packageBytes));
        });

        test("rebuilt local bytes invalidate the old approval and use a new cache directory", async () => {
            const first = await manager.prepare(input);
            const rebuilt = buildToolPackage(packageFixture({ extra: [{ name: "tools/net8.0/any/notes.txt", data: "rebuilt" }] }));
            await fs.writeFile(join(localFeed as string, "contoso.worker.1.2.0.nupkg"), rebuilt);
            await expect(manager.prepare(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
            input.source = resolveDotNetPackageSource(localFeed as string, input.declaration, false, true);
            const second = await manager.prepare(input);
            expect(second.workspace).not.toBe(first.workspace);
            expect(await fs.readFile(join(second.workspace, "tools", "net8.0", "any", "notes.txt"), "utf8")).toBe("rebuilt");
        });
    });
});

describe("DotNet package metadata helpers", () => {
    test("accepts SDK-generated runtimeconfig without rollForward because launch policy is explicit", () => {
        const input = request();
        const config = JSON.stringify({
            runtimeOptions: {
                tfm: "net8.0",
                framework: { name: "Microsoft.NETCore.App", version: "8.0.0" },
                configProperties: { "System.Reflection.Metadata.MetadataUpdater.IsSupported": false },
            },
        });
        expect(() => verifyDotNetRuntimeConfig(config, input.declaration, input.selection)).not.toThrow();
    });

    test.each([
        { tfm: "net8.0", framework: { name: "Microsoft.AspNetCore.App", version: "8.0.0" } },
        { tfm: "net8.0", frameworks: [{ name: "Microsoft.NETCore.App", version: "8.0.0" }] },
        { tfm: "net8.0", framework: { name: "Microsoft.NETCore.App", version: "8.0.0", rollForward: "Major" } },
        { tfm: "net8.0", framework: { name: "Microsoft.NETCore.App", version: "8.0.0" }, applyPatches: false },
    ])("rejects runtime configurations that broaden or bypass the declaration %#", (runtimeOptions) => {
        const input = request();
        expect(() => verifyDotNetRuntimeConfig(JSON.stringify({ runtimeOptions }), input.declaration, input.selection)).toThrow(DotNetToolPreparationError);
    });

    test("XML parser accepts comments and standalone declarations but rejects DOCTYPE and entities", () => {
        expect(parseDotNetPackageXml(`<?xml version="1.0" encoding="utf-8" standalone="yes"?><!-- note --><package><id>A</id></package>`).name).toBe("package");
        expect(() => parseDotNetPackageXml(`<!DOCTYPE package [<!ENTITY x "y">]><package>&x;</package>`)).toThrow();
        expect(() => parseDotNetPackageXml(`<package><![CDATA[x]]></package>`)).toThrow();
        expect(() => parseDotNetPackageXml(`<package><!-- unterminated </package>`)).toThrow("Unclosed XML comment");
    });

    test("comment stripping stays linear for adversarial input", () => {
        const started = Date.now();
        expect(() => parseDotNetPackageXml("<!--".repeat(64 * 1024))).toThrow();
        expect(Date.now() - started).toBeLessThan(500);
    });
});
