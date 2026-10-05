import type { DotNetInstallation, DotNetResult, DotNetVersion, NativeWorkerPlatform } from "../../common/types/dotnetWorker";
import type { WorkerDeclaration, WorkerRollForward } from "../../common/types/tool";

export const DOTNET_PLATFORM_MATRIX = {
    "windows-x64": "win-x64",
    "windows-arm64": "win-arm64",
    "macos-x64": "osx-x64",
    "macos-arm64": "osx-arm64",
    "linux-x64": "linux-x64",
    "linux-arm64": "linux-arm64",
} as const;

export function nativeDotNetArchitecture(osPlatform: string, machineName: string, cpuModels: readonly string[] = []): string {
    if (osPlatform === "darwin" && cpuModels.some((model) => /^Apple\s/.test(model))) return "arm64";
    const nativeMachine = machineName.toLowerCase();
    return ["arm64", "aarch64"].includes(nativeMachine) ? "arm64" : ["x86_64", "amd64", "x64"].includes(nativeMachine) ? "x64" : nativeMachine;
}

export function parseDotNetVersion(value: unknown): DotNetVersion | undefined {
    if (typeof value !== "string" || /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value)?.[0] !== value) return undefined;
    const components = value.split(".").map(Number);
    if (components.some((component) => component > 2_147_483_647)) return undefined;
    return { major: components[0], minor: components[1], patch: components[2], version: value };
}

export function compareDotNetVersions(left: DotNetVersion, right: DotNetVersion): number {
    return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function resolveWorkerPlatform(platforms: unknown, osPlatform: string, architecture: string): DotNetResult<{ platform: NativeWorkerPlatform; nativeRid: string }> {
    if (
        !Array.isArray(platforms) ||
        platforms.length === 0 ||
        Array.from(platforms).some((platform) => typeof platform !== "string" || (platform !== "all" && !Object.hasOwn(DOTNET_PLATFORM_MATRIX, platform))) ||
        new Set(platforms).size !== platforms.length ||
        (platforms.includes("all") && platforms.length !== 1)
    ) {
        return { ok: false, error: { code: "INVALID_PLATFORM", message: "Invalid worker platform declaration" } };
    }
    const osAlias = osPlatform === "win32" ? "windows" : osPlatform === "darwin" ? "macos" : osPlatform === "linux" ? "linux" : undefined;
    if (!osAlias) return { ok: false, error: { code: "PLATFORM_UNSUPPORTED", message: "Operating system is outside platform matrix v1" } };
    if (architecture !== "x64" && architecture !== "arm64") return { ok: false, error: { code: "ARCHITECTURE_UNSUPPORTED", message: "Only native x64 and arm64 hosts are supported" } };
    const platform = `${osAlias}-${architecture}` as NativeWorkerPlatform;
    if (!platforms.includes("all") && !platforms.includes(platform)) return { ok: false, error: { code: "PLATFORM_UNSUPPORTED", message: "Worker does not declare the native platform" } };
    return { ok: true, value: { platform, nativeRid: DOTNET_PLATFORM_MATRIX[platform] } };
}

export function validateRuntimeRequirement(value: unknown): DotNetResult<{ minimum: DotNetVersion; policy: WorkerRollForward }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: { code: "INVALID_RUNTIME_REQUIREMENT", message: "Missing runtime requirement" } };
    const requirement = value as Record<string, unknown>;
    const minimum = parseDotNetVersion(requirement.minimumRuntimeVersion);
    const policy = Object.hasOwn(requirement, "rollForward") ? requirement.rollForward : "Major";
    if (
        !minimum ||
        !["net8.0", "net9.0", "net10.0"].includes(requirement.targetFramework as string) ||
        `net${minimum.major}.${minimum.minor}` !== requirement.targetFramework ||
        !["Disable", "Latest", "Minor", "Major"].includes(policy as string) ||
        Object.keys(requirement).some((key) => !["targetFramework", "minimumRuntimeVersion", "rollForward"].includes(key))
    ) {
        return { ok: false, error: { code: "INVALID_RUNTIME_REQUIREMENT", message: "Invalid TFM, stable minimum version or roll-forward policy" } };
    }
    return { ok: true, value: { minimum, policy: policy as WorkerRollForward } };
}

export function selectWorkerRuntime(inventory: readonly DotNetInstallation[], requirement: WorkerDeclaration["dotnet"]): DotNetResult<DotNetInstallation> {
    const validated = validateRuntimeRequirement(requirement);
    if (!validated.ok) return validated;
    const { minimum, policy } = validated.value;
    const eligible = stableInstallations(inventory)
        .filter((runtime) => compareDotNetVersions(runtime, minimum) >= 0)
        .sort(compareDotNetVersions);
    let selected: DotNetInstallation | undefined;
    if (policy === "Disable") selected = eligible.find((runtime) => compareDotNetVersions(runtime, minimum) === 0);
    else if (policy === "Latest") selected = eligible.at(-1);
    else {
        const allowed = eligible.filter((runtime) => policy === "Major" || runtime.major === minimum.major);
        const first = allowed[0];
        if (first) selected = allowed.filter((runtime) => runtime.major === first.major && runtime.minor === first.minor).at(-1);
    }
    return selected ? { ok: true, value: selected } : { ok: false, error: { code: "RUNTIME_NOT_FOUND", message: "No installed Microsoft.NETCore.App runtime satisfies the policy" } };
}

export function selectDotNetSdk(inventory: readonly DotNetInstallation[]): DotNetResult<DotNetInstallation> {
    const selected = stableInstallations(inventory)
        .filter((sdk) => sdk.major === 10 && sdk.minor === 0 && sdk.patch >= 100)
        .sort(compareDotNetVersions)
        .at(-1);
    return selected
        ? { ok: true, value: selected }
        : { ok: false, error: { code: "SDK_NOT_FOUND", message: "An installed stable .NET 10.0 SDK (10.0.100 or newer) is required; runtimes alone are insufficient" } };
}

function stableInstallations(inventory: readonly DotNetInstallation[]): DotNetInstallation[] {
    return inventory.flatMap((installation) => {
        const version = parseDotNetVersion(installation.version);
        return version ? [{ ...version, directory: installation.directory }] : [];
    });
}

export function selectSdkRuntime(configText: string, inventory: readonly DotNetInstallation[]): DotNetResult<DotNetInstallation> {
    try {
        const config = JSON.parse(configText) as {
            runtimeOptions?: { tfm?: unknown; framework?: { name?: unknown; version?: unknown }; rollForward?: unknown; applyPatches?: unknown; frameworks?: unknown; includedFrameworks?: unknown };
        };
        const options = config?.runtimeOptions;
        const minimum = parseDotNetVersion(options?.framework?.version);
        if (
            !minimum ||
            minimum.major !== 10 ||
            minimum.minor !== 0 ||
            options?.tfm !== "net10.0" ||
            options.framework?.name !== "Microsoft.NETCore.App" ||
            (options.rollForward !== undefined && options.rollForward !== "LatestPatch" && options.rollForward !== "Minor") ||
            (options.applyPatches !== undefined && options.applyPatches !== true) ||
            options.frameworks !== undefined ||
            options.includedFrameworks !== undefined
        )
            return { ok: false, error: { code: "SDK_CONFIG_INVALID", message: "Installed SDK runtime configuration is outside the supported .NET 10 SDK contract" } };
        const selected = stableInstallations(inventory)
            .filter((runtime) => runtime.major === 10 && runtime.minor === 0 && compareDotNetVersions(runtime, minimum) >= 0)
            .sort(compareDotNetVersions)
            .at(-1);
        return selected ? { ok: true, value: selected } : { ok: false, error: { code: "SDK_RUNTIME_NOT_FOUND", message: "The selected .NET 10 SDK's required runtime is not installed on this host" } };
    } catch {
        return { ok: false, error: { code: "SDK_CONFIG_INVALID", message: "Installed SDK runtime configuration is invalid JSON" } };
    }
}

export function parseDotNetListing(output: string, kind: "sdk" | "runtime"): DotNetResult<DotNetInstallation[]> {
    const entries: DotNetInstallation[] = [];
    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = (kind === "sdk" ? /^(\S+)\s+\[([^\]\r\n]+)\]$/ : /^(Microsoft\.[A-Za-z0-9.]+)\s+(\S+)\s+\[([^\]\r\n]+)\]$/).exec(line);
        if (!match) return { ok: false, error: { code: "PROBE_OUTPUT_INVALID", message: "Malformed .NET inventory listing" } };
        const versionText = match[kind === "sdk" ? 1 : 2];
        const stable = parseDotNetVersion(versionText);
        if (!stable) {
            if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/.test(versionText) && parseDotNetVersion(versionText.split("-")[0])) continue;
            return { ok: false, error: { code: "PROBE_OUTPUT_INVALID", message: "Malformed .NET inventory version" } };
        }
        if (kind === "runtime" && match[1] !== "Microsoft.NETCore.App") continue;
        entries.push({ ...stable, directory: match[kind === "sdk" ? 2 : 3].trim() });
    }
    return { ok: true, value: entries };
}

export function parseDotNetHostInfo(output: string): DotNetResult<{ architecture: "x64" | "arm64"; rid?: string }> {
    const hosts = [...output.matchAll(/^Host:\s*\r?$/gm)];
    if (hosts.length !== 1) return { ok: false, error: { code: "PROBE_OUTPUT_INVALID", message: "Missing or ambiguous .NET Host information" } };
    const hostSection = output.slice((hosts[0].index ?? 0) + hosts[0][0].length).split(/^\S/m)[0];
    const architectures = [...hostSection.matchAll(/^\s+Architecture:\s*(\S+)\s*\r?$/gm)];
    if (architectures.length !== 1) return { ok: false, error: { code: "PROBE_OUTPUT_INVALID", message: "Missing or ambiguous host architecture" } };
    const architecture = architectures[0][1];
    if (architecture !== "x64" && architecture !== "arm64") return { ok: false, error: { code: "ARCHITECTURE_UNSUPPORTED", message: "Unsupported .NET host architecture" } };
    const rids = [...output.matchAll(/^\s+RID:\s*(\S+)\s*\r?$/gm)];
    if (rids.length > 1) return { ok: false, error: { code: "PROBE_OUTPUT_INVALID", message: "Ambiguous SDK runtime identifier" } };
    return { ok: true, value: { architecture, rid: rids[0]?.[1] } };
}
