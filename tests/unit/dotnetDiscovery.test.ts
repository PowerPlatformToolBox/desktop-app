import { posix, win32 } from "path";
import type { DotNetDiscoveryErrorCode, DotNetInstallation, DotNetResult } from "../../src/common/types/dotnetWorker";
import type { WorkerDeclaration, WorkerRollForward } from "../../src/common/types/tool";
import { DotNetDiscoveryManager, dotNetHostCandidates, dotNetProbeOptions, type DotNetDiagnostic, type DotNetDiscoveryAdapter } from "../../src/main/managers/dotnetDiscoveryManager";
import {
    DOTNET_PLATFORM_MATRIX,
    nativeDotNetArchitecture,
    parseDotNetHostInfo,
    parseDotNetListing,
    parseDotNetVersion,
    resolveWorkerPlatform,
    selectWorkerRuntime,
    validateRuntimeRequirement,
} from "../../src/main/utils/dotnetDiscovery";

function requirement(policy?: WorkerRollForward, minimumRuntimeVersion = "8.0.5"): WorkerDeclaration["dotnet"] {
    return { targetFramework: "net8.0", minimumRuntimeVersion, ...(policy === undefined ? {} : { rollForward: policy }) };
}

function installations(...versions: string[]): DotNetInstallation[] {
    return versions.map((version) => {
        const parsed = parseDotNetVersion(version);
        if (!parsed) throw new Error("Invalid test version");
        return { ...parsed, directory: "/fixture" };
    });
}

function selected(result: DotNetResult<DotNetInstallation>): string {
    if (!result.ok) throw new Error(result.error.code);
    return result.value.version;
}

function hostInfo(architecture = "arm64", rid: string | null = "osx-arm64"): string {
    return `Host:\n  Version:      10.0.1\n  Architecture: ${architecture}\n  Commit:       abc123\n${rid ? `  RID:          ${rid}\n` : ""}\n.NET SDKs installed:\n  No SDKs were found.\n\nglobal.json file:\n  Not found\n`;
}

function sdkHostInfo(architecture = "arm64", rid = "osx-arm64"): string {
    return `.NET SDK:\n Version: 10.0.100\n\nRuntime Environment:\n RID: ${rid}\n\nHost:\n  Version: 10.0.1\n  Architecture: ${architecture}\n  RID: ${rid}\n\n.NET SDKs installed:\n  10.0.100 [/usr/local/share/dotnet/sdk]\n`;
}

interface FixtureHost {
    runtimes?: string;
    info?: string;
    realPath?: string;
    executable?: boolean;
    failure?: object;
}

function fixture(hosts: Record<string, FixtureHost>, osPlatform = "darwin", architecture = "arm64") {
    const adapter: DotNetDiscoveryAdapter = {
        system: jest.fn(() => ({ platform: osPlatform, architecture })),
        realpath: jest.fn(async (file: string) => {
            if (!hosts[file]) throw Object.assign(new Error("missing"), { code: "ENOENT" });
            return hosts[file].realPath ?? file;
        }),
        isExecutable: jest.fn(async (file: string) => hosts[file]?.executable !== false),
        probe: jest.fn(async (file: string, args: readonly DotNetDiagnostic[]) => {
            const host = hosts[file];
            if (host.failure) throw host.failure;
            const paths = osPlatform === "win32" ? win32 : posix;
            const root = paths.dirname(file);
            if (args[0] === "--info") return host.info ?? hostInfo(architecture, `${osPlatform === "win32" ? "win" : osPlatform === "linux" ? "linux" : "osx"}-${architecture}`);
            return (
                host.runtimes ??
                `Microsoft.NETCore.App 8.0.12 [${paths.join(root, "shared", "Microsoft.NETCore.App")}]\nMicrosoft.NETCore.App 10.0.1 [${paths.join(root, "shared", "Microsoft.NETCore.App")}]\n`
            );
        }),
    };
    return { adapter, manager: new DotNetDiscoveryManager(adapter) };
}

const macHost = "/usr/local/share/dotnet/dotnet";
const macX64Host = "/usr/local/share/dotnet/x64/dotnet";

describe(".NET runtime policy selection", () => {
    test.each([
        ["Disable", "8.0.5"],
        ["Latest", "12.3.9"],
        ["Minor", "8.0.12"],
        ["Major", "8.0.12"],
    ] as const)("%s selects %s from exact/same/higher lines", (policy, expected) => {
        const inventory = installations("8.0.4", "8.0.5", "8.0.12", "8.1.0", "9.0.1", "10.0.1", "12.3.1", "12.3.9");
        expect(selected(selectWorkerRuntime(inventory, requirement(policy)))).toBe(expected);
        expect(inventory[0].version).toBe("8.0.4");
    });

    test.each(["Disable", "Minor"] as const)("%s does not cross major", (policy) => {
        expect(selectWorkerRuntime(installations("9.0.1", "10.0.1"), requirement(policy))).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test("Disable requires exact patch, not the latest patch", () => {
        expect(selectWorkerRuntime(installations("8.0.12"), requirement("Disable"))).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test.each(["Minor", "Major"] as const)("%s prefers next minor in same major with latest patch", (policy) => {
        expect(selected(selectWorkerRuntime(installations("8.0.4", "8.1.1", "8.1.3", "8.2.9", "9.0.8"), requirement(policy)))).toBe("8.1.3");
    });

    test("Major uses lowest higher major and its lowest minor, Latest uses highest", () => {
        const inventory = installations("8.0.4", "9.1.0", "9.1.2", "9.2.99", "10.0.1", "11.2.9");
        expect(selected(selectWorkerRuntime(inventory, requirement("Major")))).toBe("9.1.2");
        expect(selected(selectWorkerRuntime(inventory, requirement("Latest")))).toBe("11.2.9");
    });

    test.each(["Disable", "Latest", "Minor", "Major"] as const)("%s never selects below minimum", (policy) => {
        expect(selectWorkerRuntime(installations("7.9.99", "8.0.4"), requirement(policy))).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test("minimum patch bounds only the requested line", () => {
        expect(selected(selectWorkerRuntime(installations("8.1.0", "9.0.0"), requirement("Minor", "8.0.99")))).toBe("8.1.0");
        expect(selected(selectWorkerRuntime(installations("9.0.0", "10.0.0"), requirement("Major", "8.0.99")))).toBe("9.0.0");
    });

    test("omission equals explicit Major", () => {
        const inventory = installations("8.0.12", "10.0.1");
        expect(selectWorkerRuntime(inventory, requirement())).toEqual(selectWorkerRuntime(inventory, requirement("Major")));
    });

    test.each(["net8.0", "net9.0", "net10.0"] as const)("accepts matching %s requirement", (targetFramework) => {
        expect(validateRuntimeRequirement({ targetFramework, minimumRuntimeVersion: `${targetFramework.slice(3)}.0` })).toMatchObject({ ok: true });
    });

    test.each([
        null,
        {},
        { ...requirement(), targetFramework: "net11.0" },
        { ...requirement(), minimumRuntimeVersion: "9.0.0" },
        { ...requirement(), minimumRuntimeVersion: "8.0.01" },
        { ...requirement(), rollForward: undefined },
        { ...requirement(), rollForward: null },
        { ...requirement(), rollForward: "LatestMajor" },
        { ...requirement(), flags: "--anything" },
    ])("rejects malformed runtime arguments %#", (value) => {
        expect(validateRuntimeRequirement(value)).toMatchObject({ ok: false, error: { code: "INVALID_RUNTIME_REQUIREMENT" } });
    });
});

describe(".NET listings and host info", () => {
    test("parses CRLF, whitespace and runtime paths with spaces", () => {
        const parsed = parseDotNetListing(" Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]\r\n");
        expect(parsed).toMatchObject({ ok: true, value: [{ version: "10.0.1", directory: "C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App" }] });
    });

    test("runtime listing excludes ASP.NET, Desktop and prereleases", () => {
        expect(
            parseDotNetListing(
                "Microsoft.AspNetCore.App 10.0.1 [/dotnet/shared/Microsoft.AspNetCore.App]\nMicrosoft.WindowsDesktop.App 10.0.1 [/desktop]\nMicrosoft.NETCore.App 11.0.0-preview.1 [/core]\nMicrosoft.NETCore.App 8.0.12 [/core]",
            ),
        ).toMatchObject({ ok: true, value: [{ version: "8.0.12" }] });
    });

    test.each([
        "garbage",
        "Microsoft.NETCore.App 10.0 [/core]",
        "Microsoft.NETCore.App 10.0.1",
        "Microsoft.NETCore.App 010.0.1 [/core]",
        "Microsoft.NETCore.App 2147483648.0.1 [/core]",
        "Microsoft.NETCore.App 10.0.1+build [/core]",
        "Microsoft.NETCore.App 10.0.1 [/core] unexpected",
        "Microsoft.NETCore.App 10.0.1- [/core]",
    ])("rejects malformed runtime listing %s", (listing) => {
        expect(parseDotNetListing(listing)).toMatchObject({ ok: false, error: { code: "PROBE_OUTPUT_INVALID" } });
    });

    test("empty inventory is valid but does not satisfy a runtime requirement", () => {
        expect(parseDotNetListing(" \r\n")).toEqual({ ok: true, value: [] });
        expect(selectWorkerRuntime([], requirement())).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test.each(["8.0.0\n", "8.0.0-preview.1", "8.0.0+build", "8.00.0", "2147483648.0.0", " 8.0.0"])("rejects non-stable version %s", (value) => {
        expect(parseDotNetVersion(value)).toBeUndefined();
    });

    test("selectors derive components from version text, not inconsistent numeric metadata", () => {
        const forgedRuntime = { ...installations("8.0.4")[0], patch: 12 };
        expect(selectWorkerRuntime([forgedRuntime], requirement())).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test("uses Host architecture, not other architecture listings", () => {
        expect(parseDotNetHostInfo(`${hostInfo()}\nOther architectures found:\n x64 [/other]\n`)).toEqual({ ok: true, value: { architecture: "arm64", rid: "osx-arm64" } });
        expect(parseDotNetHostInfo(hostInfo("x64", null))).toEqual({ ok: true, value: { architecture: "x64", rid: undefined } });
    });

    test("accepts the same RID reported by both the SDK and Host sections but rejects conflicting RIDs", () => {
        expect(parseDotNetHostInfo(sdkHostInfo())).toEqual({ ok: true, value: { architecture: "arm64", rid: "osx-arm64" } });
        expect(parseDotNetHostInfo(sdkHostInfo().replace(" RID: osx-arm64\n\nHost", " RID: osx-x64\n\nHost"))).toMatchObject({ ok: false, error: { code: "PROBE_OUTPUT_INVALID" } });
    });

    test.each(["bad", "Host:\n  Version: 10.0.1\n", `${hostInfo()}\nHost:\n Architecture: x64\n`, "Host:\n Architecture: arm64\n Architecture: x64\n"])(
        "rejects missing/ambiguous host info %#",
        (output) => {
            expect(parseDotNetHostInfo(output)).toMatchObject({ ok: false, error: { code: "PROBE_OUTPUT_INVALID" } });
        },
    );
});

describe("platform matrix v1", () => {
    test.each([
        ["win32", "ARM64", [], "arm64"],
        ["win32", "AMD64", [], "x64"],
        ["darwin", "x86_64", ["Apple M3"], "arm64"],
        ["darwin", "x86_64", ["Intel Core"], "x64"],
        ["linux", "aarch64", [], "arm64"],
        ["linux", "i686", [], "i686"],
    ] as [string, string, string[], string][])("native OS architecture detection %#", (osPlatform, machineName, cpuModels, expected) => {
        expect(nativeDotNetArchitecture(osPlatform, machineName, cpuModels)).toBe(expected);
    });

    test.each(Object.entries(DOTNET_PLATFORM_MATRIX))("translates %s to %s without expanding literal all", (alias, nativeRid) => {
        const [osAlias, architecture] = alias.split("-");
        const osPlatform = osAlias === "windows" ? "win32" : osAlias === "macos" ? "darwin" : "linux";
        expect(resolveWorkerPlatform([alias], osPlatform, architecture)).toEqual({ ok: true, value: { platform: alias, nativeRid } });
        const all = ["all"];
        expect(resolveWorkerPlatform(all, osPlatform, architecture)).toEqual(resolveWorkerPlatform([alias], osPlatform, architecture));
        expect(all).toEqual(["all"]);
    });

    test.each([null, [], new Array(1), ["all", "macos-arm64"], ["macos-arm64", "all"], ["win-x64"], ["osx-arm64"], ["unknown"], ["macos-arm64", "macos-arm64"], [1]])(
        "rejects malformed platform arguments %#",
        (platforms) => {
            expect(resolveWorkerPlatform(platforms, "darwin", "arm64")).toMatchObject({ ok: false, error: { code: "INVALID_PLATFORM" } });
        },
    );

    test.each([
        [["all"], "freebsd", "x64", "PLATFORM_UNSUPPORTED"],
        [["all"], "win32", "ia32", "ARCHITECTURE_UNSUPPORTED"],
        [["windows-x64"], "win32", "arm64", "PLATFORM_UNSUPPORTED"],
    ])("rejects unsupported native target %#", (platforms, osPlatform, architecture, code) => {
        expect(resolveWorkerPlatform(platforms, osPlatform as string, architecture as string)).toMatchObject({ ok: false, error: { code } });
    });
});

describe("internal .NET discovery manager", () => {
    test("candidate sets are fixed, absolute and ordered without PATH lookup", () => {
        expect(dotNetHostCandidates("darwin")).toEqual([macHost, macX64Host]);
        expect(dotNetHostCandidates("win32")).toEqual(["C:\\Program Files\\dotnet\\dotnet.exe", "C:\\Program Files\\dotnet\\x64\\dotnet.exe"]);
        expect(dotNetHostCandidates("linux")).toEqual(["/usr/share/dotnet/dotnet", "/usr/lib/dotnet/dotnet", "/usr/lib64/dotnet/dotnet", "/usr/local/share/dotnet/dotnet"]);
        expect(dotNetHostCandidates("freebsd")).toEqual([]);
    });

    test("OS detector failure returns a structured error without filesystem/probe work", async () => {
        const { manager, adapter } = fixture({});
        adapter.system = jest.fn(() => {
            throw new Error("secret system info");
        });
        const result = await manager.discover(requirement(), ["all"]);
        expect(result).toMatchObject({ ok: false, error: { code: "ARCHITECTURE_UNSUPPORTED" } });
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(adapter.realpath).not.toHaveBeenCalled();
        expect(adapter.probe).not.toHaveBeenCalled();
    });

    test.each([
        ["freebsd", "x64", "PLATFORM_UNSUPPORTED"],
        ["win32", "ia32", "ARCHITECTURE_UNSUPPORTED"],
    ])("unsupported OS/architecture stops before discovery %#", async (osPlatform, architecture, code) => {
        const { manager, adapter } = fixture({}, osPlatform, architecture);
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code } });
        expect(adapter.realpath).not.toHaveBeenCalled();
    });

    test("selects the worker runtime on a runtime-only host using only --info and --list-runtimes", async () => {
        const { manager, adapter } = fixture({ [macHost]: {} });
        const result = await manager.discover(requirement(), ["all"]);
        expect(result).toMatchObject({
            ok: true,
            value: {
                hostPath: macHost,
                runtime: { version: "8.0.12" },
            },
        });
        const calls = (adapter.probe as jest.Mock).mock.calls;
        expect(calls.map((call) => call[1])).toEqual([["--info"], ["--list-runtimes"]]);
        for (const [file, args, options] of calls) {
            expect(file).toBe(macHost);
            expect(args).toHaveLength(1);
            expect(options).toMatchObject({ cwd: "/", shell: false, timeout: 3000, killSignal: "SIGKILL", maxBuffer: 262144, encoding: "utf8" });
            expect(options.env).toEqual(dotNetProbeOptions("/usr/local/share/dotnet", "darwin").env);
            expect(options.env.PATH).toBeUndefined();
            expect(options.env.DOTNET_ROLL_FORWARD).toBeUndefined();
        }
    });

    test("a host with an SDK installed is also accepted", async () => {
        const { manager } = fixture({ [macHost]: { info: sdkHostInfo() } });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: true, value: { runtime: { version: "8.0.12" } } });
    });

    test("nonzero --info exit (for example a runtime-only host) still uses its host output", async () => {
        const { manager, adapter } = fixture({ [macHost]: {} });
        const originalProbe = adapter.probe.bind(adapter);
        adapter.probe = jest.fn(async (file, args, options) => {
            if (args[0] === "--info") throw Object.assign(new Error("No SDK"), { code: 150, stdout: hostInfo() });
            return originalProbe(file, args, options);
        });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: true, value: { runtime: { version: "8.0.12" } } });
    });

    test.each([
        { code: 150, stdout: "invalid host output" },
        { code: 150, stdout: "a".repeat(262145) },
        { code: "ENOENT", stdout: hostInfo() },
        { code: 150, killed: true, signal: "SIGKILL", stdout: hostInfo() },
    ])("nonzero info does not bypass output or execution failure validation %#", async (failure) => {
        const { manager, adapter } = fixture({ [macHost]: {} });
        adapter.probe = jest.fn(async () => {
            throw Object.assign(new Error("failure"), failure);
        });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false });
    });

    test.each([
        [{ runtimes: "" }, "RUNTIME_NOT_FOUND"],
        [{ runtimes: "Microsoft.NETCore.App 8.0.4 [/usr/local/share/dotnet/shared/Microsoft.NETCore.App]" }, "RUNTIME_NOT_FOUND"],
    ] as [FixtureHost, DotNetDiscoveryErrorCode][])("reports missing or too-old runtimes %#", async (host, code) => {
        const { manager } = fixture({ [macHost]: host });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code } });
    });

    test("Latest maps to native LatestMajor", async () => {
        const { manager } = fixture({
            [macHost]: {
                runtimes: "Microsoft.NETCore.App 10.0.1 [/usr/local/share/dotnet/shared/Microsoft.NETCore.App]\nMicrosoft.NETCore.App 11.0.1 [/usr/local/share/dotnet/shared/Microsoft.NETCore.App]",
            },
        });
        expect(await manager.discover(requirement("Latest"), ["all"])).toMatchObject({ ok: true, value: { nativeRollForward: "LatestMajor", runtime: { version: "11.0.1" } } });
    });

    test("does not use listings outside the selected host root", async () => {
        const { manager } = fixture({ [macHost]: { runtimes: "Microsoft.NETCore.App 8.0.12 [/other/shared/Microsoft.NETCore.App]" } });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
    });

    test.each([
        [{ info: hostInfo("x64", "osx-x64") }, "ARCHITECTURE_MISMATCH"],
        [{ info: hostInfo("arm64", "osx-x64") }, "ARCHITECTURE_MISMATCH"],
        [{ info: hostInfo("arm64", "win-arm64") }, "ARCHITECTURE_MISMATCH"],
        [{ info: hostInfo("x86", null) }, "ARCHITECTURE_UNSUPPORTED"],
        [{ info: "garbage" }, "PROBE_OUTPUT_INVALID"],
        [{ runtimes: "garbage" }, "PROBE_OUTPUT_INVALID"],
        [{ runtimes: "Microsoft.NETCore.App 8.0.12 [relative/core]" }, "PROBE_OUTPUT_INVALID"],
        [{ info: "a".repeat(262145) }, "PROBE_OUTPUT_INVALID"],
        [{ info: "Host:\0" }, "PROBE_OUTPUT_INVALID"],
        [{ failure: { code: "ETIMEDOUT", message: "secret output" } }, "PROBE_TIMEOUT"],
        [{ failure: { killed: true, signal: "SIGTERM" } }, "PROBE_TIMEOUT"],
        [{ failure: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" } }, "PROBE_OUTPUT_INVALID"],
        [{ failure: { code: "EACCES", stdout: "secret", stderr: "secret" } }, "PROBE_FAILED"],
    ] as [FixtureHost, DotNetDiscoveryErrorCode][])("bounded probe rejects architecture/bad output/failures %#", async (host, code) => {
        const { manager } = fixture({ [macHost]: host });
        const result = await manager.discover(requirement(), ["all"]);
        expect(result).toMatchObject({ ok: false, error: { code } });
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    test("deterministic candidate fallback after wrong architecture", async () => {
        const { manager, adapter } = fixture({ [macHost]: { info: hostInfo("x64", "osx-x64") }, [macX64Host]: {} });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: true, value: { hostPath: macX64Host, attempts: [{ error: { code: "ARCHITECTURE_MISMATCH" } }] } });
        expect((adapter.realpath as jest.Mock).mock.calls.map((call) => call[0])).toEqual([macHost, macX64Host]);
    });

    test.each(["../dotnet", "/tmp/dotnet", "/usr/local/share/dotnet/dotnet\n"])("rejects unapproved real path %s before execution", async (realPath) => {
        const { manager, adapter } = fixture({ [macHost]: { realPath } });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "INVALID_HOST" } });
        expect(adapter.probe).not.toHaveBeenCalled();
    });

    test("non-executable host is not probed", async () => {
        const { manager, adapter } = fixture({ [macHost]: { executable: false } });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "INVALID_HOST" } });
        expect(adapter.probe).not.toHaveBeenCalled();
    });

    test("deduplicates approved real paths", async () => {
        const { manager, adapter } = fixture({ [macHost]: { runtimes: "" }, [macX64Host]: { realPath: macHost } });
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "RUNTIME_NOT_FOUND" } });
        expect(adapter.probe).toHaveBeenCalledTimes(2);
    });

    test("no installed host is distinct from a missing runtime", async () => {
        const { manager, adapter } = fixture({});
        expect(await manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "HOST_NOT_FOUND" } });
        expect(adapter.probe).not.toHaveBeenCalled();
    });

    test.each(["x64", "arm64"])("Windows %s requires native host architecture", async (architecture) => {
        const host = dotNetHostCandidates("win32")[0];
        const native = fixture({ [host]: {} }, "win32", architecture);
        expect(await native.manager.discover(requirement(), ["all"])).toMatchObject({ ok: true, value: { platform: `windows-${architecture}`, nativeRid: `win-${architecture}`, architecture } });
        const mismatch = fixture({ [host]: { info: hostInfo(architecture === "arm64" ? "x64" : "arm64", `win-${architecture === "arm64" ? "x64" : "arm64"}`) } }, "win32", architecture);
        expect(await mismatch.manager.discover(requirement(), ["all"])).toMatchObject({ ok: false, error: { code: "ARCHITECTURE_MISMATCH" } });
    });

    test("Linux portable native host works but musl is not silently qualified", async () => {
        const host = dotNetHostCandidates("linux")[0];
        expect(await fixture({ [host]: {} }, "linux", "x64").manager.discover(requirement(), ["all"])).toMatchObject({ ok: true, value: { nativeRid: "linux-x64" } });
        expect(await fixture({ [host]: { info: hostInfo("x64", "linux-musl-x64") } }, "linux", "x64").manager.discover(requirement(), ["all"])).toMatchObject({
            ok: false,
            error: { code: "ARCHITECTURE_MISMATCH" },
        });
    });

    test("invalid arguments stop before any filesystem or process work", async () => {
        const { manager, adapter } = fixture({});
        expect(await manager.discover(requirement(), ["unknown"])).toMatchObject({ ok: false, error: { code: "INVALID_PLATFORM" } });
        expect(await manager.discover({ ...requirement(), minimumRuntimeVersion: "8.0.0-preview.1" }, ["all"])).toMatchObject({ ok: false, error: { code: "INVALID_RUNTIME_REQUIREMENT" } });
        expect(adapter.realpath).not.toHaveBeenCalled();
        expect(adapter.probe).not.toHaveBeenCalled();
    });
});
