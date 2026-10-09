import { validatePPTBConfig, type PPTBConfig, type WorkerDeclaration, type WorkerPlatform } from "../../../packages/validation/src/validate";

const worker: WorkerDeclaration = {
    kind: "dotnet-tool",
    packageId: "Contoso.SqlWorker",
    packageVersion: "1.4.2",
    command: "contoso-sql-worker",
    dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0" },
    platforms: ["windows-x64", "macos-arm64"],
};

describe("worker declarations", () => {
    it.each(["net8.0", "net9.0", "net10.0"] as const)("accepts supported console target %s", (targetFramework) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, dotnet: { targetFramework, minimumRuntimeVersion: `${targetFramework.slice(3)}.0` } } } }).valid).toBe(true);
    });
    it("requires minAPI when package context is supplied", () => {
        expect(validatePPTBConfig({ workers: { engine: worker } }, {}).valid).toBe(false);
        expect(validatePPTBConfig({ workers: { engine: worker } }, { features: { minAPI: "1.2.0" } }).valid).toBe(true);
        expect(validatePPTBConfig({}, {}).valid).toBe(true);
    });
    it("normalizes omission and explicit Major identically", () => {
        const omitted = validatePPTBConfig({ workers: { engine: worker } });
        const explicit = validatePPTBConfig({ workers: { engine: { ...worker, dotnet: { ...worker.dotnet, rollForward: "Major" } } } });
        expect(omitted.valid).toBe(true);
        expect(omitted.packageInfo).toEqual(explicit.packageInfo);
        expect((omitted.packageInfo as PPTBConfig).workers?.engine.dotnet.rollForward).toBe("Major");
    });
    it("canonicalizes declaration and platform ordering without mutating input", () => {
        const before = JSON.stringify(worker);
        const first = validatePPTBConfig({ workers: { zebra: worker, engine: worker } });
        const second = validatePPTBConfig({ workers: { engine: { ...worker, platforms: [...worker.platforms].reverse() }, zebra: worker } });
        expect(JSON.stringify(first.packageInfo)).toBe(JSON.stringify(second.packageInfo));
        expect(JSON.stringify(worker)).toBe(before);
        expect((first.packageInfo as PPTBConfig).workers?.engine.platforms).toEqual(["macos-arm64", "windows-x64"]);
        expect((first.packageInfo as PPTBConfig).workers?.engine).not.toHaveProperty("transport");
    });
    it.each(["kind", "packageId", "packageVersion", "command", "dotnet", "platforms"])("requires %s", (field) => {
        const incomplete = { ...worker } as Record<string, unknown>;
        delete incomplete[field];
        expect(validatePPTBConfig({ workers: { engine: incomplete } } as unknown as PPTBConfig).valid).toBe(false);
    });
    it.each<WorkerPlatform>(["all", "windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"])("accepts platform alias %s without expanding it", (platform) => {
        const result = validatePPTBConfig({ workers: { engine: { ...worker, platforms: [platform] } } });
        expect(result.valid).toBe(true);
        expect((result.packageInfo as PPTBConfig).workers?.engine.platforms).toEqual([platform]);
        expect((result.packageInfo as PPTBConfig).workers?.engine).not.toHaveProperty("transport");
    });
    it("roundtrips canonical JSON with sorted aliases and literal all without transport", () => {
        const concrete: WorkerDeclaration = { ...worker, platforms: ["windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"] };
        const result = validatePPTBConfig({ workers: { engine: concrete, everywhere: { ...worker, platforms: ["all"] } } });
        expect(result.valid).toBe(true);
        const canonical = result.packageInfo as PPTBConfig;
        expect(canonical.workers?.engine.platforms).toEqual(["linux-arm64", "linux-x64", "macos-arm64", "macos-x64", "windows-arm64", "windows-x64"]);
        expect(canonical.workers?.everywhere.platforms).toEqual(["all"]);
        expect(canonical.workers?.engine).not.toHaveProperty("transport");
        expect(canonical.workers?.everywhere).not.toHaveProperty("transport");
        const restored = validatePPTBConfig(JSON.parse(JSON.stringify(canonical)));
        expect(restored.valid).toBe(true);
        expect(restored.packageInfo).toEqual(canonical);
    });
    it.each(["windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"] as const)("rejects all combined with %s in either order", (platform) => {
        for (const platforms of [
            ["all", platform],
            [platform, "all"],
        ]) {
            const result = validatePPTBConfig({ workers: { engine: { ...worker, platforms } } } as PPTBConfig);
            expect(result.valid).toBe(false);
            expect(result.packageInfo).toBeUndefined();
        }
    });
    it.each(["win-x64", "win-arm64", "osx-x64", "osx-arm64", "linux-musl-x64", "unknown", "ALL"])("rejects legacy RID or unknown platform %s", (platform) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, platforms: [platform] } } } as PPTBConfig).valid).toBe(false);
    });
    it.each<WorkerPlatform>(["all", "windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"])("rejects duplicate platform %s", (platform) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, platforms: [platform, platform] } } }).valid).toBe(false);
    });
    it.each(["jsonrpc-stdio-v1", "stdio", null, undefined])("rejects explicit transport %p as an unknown key", (transport) => {
        const result = validatePPTBConfig({ workers: { engine: { ...worker, transport } } } as PPTBConfig);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("workers.engine.transport is not supported");
        expect(result.packageInfo).toBeUndefined();
    });
    it.each(["1", "1.2", "1.2.3", "1.2.3.4", "1.2.3-beta.01+build.2"])("accepts exact NuGet version %s", (packageVersion) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, packageVersion } } }).valid).toBe(true);
    });
    it.each(["Disable", "Latest", "Minor", "Major"])("accepts policy %s", (rollForward) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, dotnet: { ...worker.dotnet, rollForward } } } } as PPTBConfig).valid).toBe(true);
    });
    it.each([null, "", "LatestMajor", "major", undefined, 1])("rejects explicit invalid policy %p", (rollForward) => {
        expect(validatePPTBConfig({ workers: { engine: { ...worker, dotnet: { ...worker.dotnet, rollForward } } } } as unknown as PPTBConfig).valid).toBe(false);
    });
    it.each([
        { packageVersion: "*" },
        { packageVersion: "[1.0,2.0)" },
        { packageVersion: "latest" },
        { packageVersion: "^1.2.3" },
        { command: "../worker" },
        { command: "--help" },
        { command: "worker.exe" },
        { packageId: "../evil" },
        { command: "worker\n" },
        { packageVersion: "1.2.3\n" },
        { packageId: "Contoso.Worker\n" },
        { packageVersion: "2147483648.0.0" },
        { kind: "executable" },
        { flags: [] },
        { env: {} },
        { source: "https://example.com" },
        { platforms: [] },
        { platforms: ["linux-musl-x64"] },
        { platforms: ["windows-x64", "windows-x64"] },
        { dotnet: { ...worker.dotnet, targetFramework: "net8.0-windows" } },
        { dotnet: { ...worker.dotnet, minimumRuntimeVersion: "9.0.0" } },
        { dotnet: { ...worker.dotnet, minimumRuntimeVersion: "8.0" } },
        { dotnet: { ...worker.dotnet, sdkMajor: 10 } },
    ])("fails closed for %p", (change) => {
        const result = validatePPTBConfig({ workers: { engine: { ...worker, ...change } } } as unknown as PPTBConfig);
        expect(result.valid).toBe(false);
        expect(result.packageInfo).toBeUndefined();
    });
    it.each<[unknown]>([[null], [[]], [{}], [{ engine: null }], [{ "../engine": worker }], [{ constructor: worker }]])("rejects invalid map %p", (workers) => {
        expect(validatePPTBConfig({ workers } as unknown as PPTBConfig).valid).toBe(false);
    });
});
