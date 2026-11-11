import { execFile } from "child_process";
import { constants } from "fs";
import { access, realpath, stat } from "fs/promises";
import { cpus, machine, platform } from "os";
import { posix, win32 } from "path";
import type { DotNetDiscoveryFailure, DotNetDiscoveryResult, DotNetHostAttempt } from "../../common/types/dotnetWorker";
import type { WorkerDeclaration } from "../../common/types/tool";
import { nativeDotNetArchitecture, parseDotNetHostInfo, parseDotNetListing, resolveWorkerPlatform, selectWorkerRuntime, validateRuntimeRequirement } from "../utils/dotnetDiscovery";

export type DotNetDiagnostic = "--list-runtimes" | "--info";

export interface DotNetProbeOptions {
    signal?: AbortSignal;
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: "utf8";
    shell: false;
    timeout: number;
    killSignal: "SIGKILL";
    maxBuffer: number;
    windowsHide: true;
}

export interface DotNetDiscoveryAdapter {
    system(): { platform: string; architecture: string };
    realpath(file: string): Promise<string>;
    isExecutable(file: string): Promise<boolean>;
    probe(file: string, args: readonly DotNetDiagnostic[], options: DotNetProbeOptions): Promise<string>;
}

const defaultAdapter: DotNetDiscoveryAdapter = {
    system: () => {
        const osPlatform = platform();
        return { platform: osPlatform, architecture: nativeDotNetArchitecture(osPlatform, machine(), osPlatform === "darwin" ? cpus().map((cpu) => cpu.model) : []) };
    },
    realpath,
    isExecutable: async (file) => {
        if (!(await stat(file)).isFile()) return false;
        await access(file, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return true;
    },
    probe: (file, args, options) =>
        new Promise((resolve, reject) => {
            execFile(file, [...args], options, (error, stdout) => {
                if (error) reject(Object.assign(error, { stdout }));
                else resolve(stdout);
            });
        }),
};

export function dotNetHostCandidates(osPlatform: string): string[] {
    if (osPlatform === "win32") return ["C:\\Program Files\\dotnet\\dotnet.exe", "C:\\Program Files\\dotnet\\x64\\dotnet.exe"];
    if (osPlatform === "darwin") return ["/usr/local/share/dotnet/dotnet", "/usr/local/share/dotnet/x64/dotnet"];
    if (osPlatform === "linux") return ["/usr/share/dotnet/dotnet", "/usr/lib/dotnet/dotnet", "/usr/lib64/dotnet/dotnet", "/usr/local/share/dotnet/dotnet"];
    return [];
}

export function dotNetProbeOptions(hostRoot: string, osPlatform: string): DotNetProbeOptions {
    const paths = osPlatform === "win32" ? win32 : posix;
    return {
        cwd: paths.parse(hostRoot).root,
        env: {
            ...(osPlatform === "win32" ? { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" } : {}),
            DOTNET_ROOT: hostRoot,
            DOTNET_MULTILEVEL_LOOKUP: "0",
            DOTNET_CLI_TELEMETRY_OPTOUT: "1",
            DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
            DOTNET_NOLOGO: "1",
            DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
            DOTNET_CLI_UI_LANGUAGE: "en-US",
            LANG: "C",
            LC_ALL: "C",
        },
        encoding: "utf8",
        shell: false,
        timeout: 3000,
        killSignal: "SIGKILL",
        maxBuffer: 256 * 1024,
        windowsHide: true,
    };
}

function probeFailure(error: unknown): DotNetDiscoveryFailure {
    const details = error && typeof error === "object" ? (error as { code?: unknown; killed?: unknown; signal?: unknown }) : {};
    if (details.code === "ETIMEDOUT" || (details.killed === true && (details.signal === "SIGTERM" || details.signal === "SIGKILL")))
        return { code: "PROBE_TIMEOUT", message: "A bounded .NET diagnostic timed out" };
    if (details.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return { code: "PROBE_OUTPUT_INVALID", message: "Diagnostic output exceeded its bound" };
    return { code: "PROBE_FAILED", message: "A .NET diagnostic failed" };
}

function hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}

export class DotNetDiscoveryManager {
    constructor(private readonly adapter: DotNetDiscoveryAdapter = defaultAdapter) {}

    async discover(requirement: WorkerDeclaration["dotnet"], platforms: unknown, control?: { signal: AbortSignal; assertCurrent(): void }): Promise<DotNetDiscoveryResult> {
        const check = (): void => {
            control?.signal.throwIfAborted();
            control?.assertCurrent();
        };
        check();
        const attempts: DotNetHostAttempt[] = [];
        const runtimeRequirement = validateRuntimeRequirement(requirement);
        if (!runtimeRequirement.ok) return { ...runtimeRequirement, attempts };
        let system: ReturnType<DotNetDiscoveryAdapter["system"]>;
        try {
            system = this.adapter.system();
        } catch {
            return { ok: false, error: { code: "ARCHITECTURE_UNSUPPORTED", message: "Native operating system architecture could not be determined" }, attempts };
        }
        const resolved = resolveWorkerPlatform(platforms, system.platform, system.architecture);
        if (!resolved.ok) return { ...resolved, attempts };
        const paths = system.platform === "win32" ? win32 : posix;
        const normalize = (file: string): string => (system.platform === "win32" ? paths.normalize(file).toLowerCase() : paths.normalize(file));
        const candidates = dotNetHostCandidates(system.platform);
        const approved = new Set(candidates.map(normalize));
        const visited = new Set<string>();
        for (const candidate of candidates) {
            check();
            let hostPath: string;
            try {
                hostPath = await this.adapter.realpath(candidate);
                if (!paths.isAbsolute(hostPath) || hasControlCharacters(hostPath) || !approved.has(normalize(hostPath))) {
                    attempts.push({ hostPath: candidate, error: { code: "INVALID_HOST", message: "Host real path is outside approved installation locations" } });
                    continue;
                }
                if (visited.has(normalize(hostPath))) continue;
                visited.add(normalize(hostPath));
                if (!(await this.adapter.isExecutable(hostPath))) {
                    attempts.push({ hostPath: candidate, error: { code: "INVALID_HOST", message: "Host is not an executable regular file" } });
                    continue;
                }
            } catch (error) {
                const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
                attempts.push({ hostPath: candidate, error: { code: code === "ENOENT" || code === "ENOTDIR" ? "HOST_NOT_FOUND" : "INVALID_HOST", message: "Approved host could not be accessed" } });
                continue;
            }
            const hostRoot = paths.dirname(hostPath);
            const options = dotNetProbeOptions(hostRoot, system.platform);
            const outputs: Partial<Record<DotNetDiagnostic, string>> = {};
            let failure: DotNetDiscoveryFailure | undefined;
            for (const diagnostic of ["--info", "--list-runtimes"] as const) {
                check();
                try {
                    const output = await this.adapter.probe(hostPath, [diagnostic], { ...options, env: { ...options.env }, ...(control ? { signal: control.signal } : {}) });
                    check();
                    if (typeof output !== "string" || Buffer.byteLength(output, "utf8") > options.maxBuffer || output.includes("\0")) {
                        failure = { code: "PROBE_OUTPUT_INVALID", message: "Invalid or oversized diagnostic output" };
                        break;
                    }
                    outputs[diagnostic] = output;
                } catch (error) {
                    const details = error && typeof error === "object" ? (error as { code?: unknown; killed?: unknown; signal?: unknown; stdout?: unknown }) : {};
                    if (
                        diagnostic === "--info" &&
                        typeof details.code === "number" &&
                        details.code !== 0 &&
                        !details.killed &&
                        !details.signal &&
                        typeof details.stdout === "string" &&
                        Buffer.byteLength(details.stdout, "utf8") <= options.maxBuffer &&
                        !details.stdout.includes("\0")
                    ) {
                        outputs[diagnostic] = details.stdout;
                        continue;
                    }
                    failure = probeFailure(error);
                    break;
                }
            }
            if (failure) {
                attempts.push({ hostPath, error: failure });
                continue;
            }
            const info = parseDotNetHostInfo(outputs["--info"] ?? "");
            const runtimes = parseDotNetListing(outputs["--list-runtimes"] ?? "");
            if (!info.ok || !runtimes.ok) {
                attempts.push({ hostPath, error: !info.ok ? info.error : !runtimes.ok ? runtimes.error : { code: "PROBE_OUTPUT_INVALID", message: "Invalid inventory" } });
                continue;
            }
            const rid = info.value.rid;
            const ridPattern = system.platform === "win32" ? /^win(?:\d+(?:\.\d+)*)?-(x64|arm64)$/ : system.platform === "darwin" ? /^osx(?:\.\d+)*-(x64|arm64)$/ : /^linux-(x64|arm64)$/;
            const osRidMatches = !rid || ridPattern.test(rid);
            if (info.value.architecture !== system.architecture || (rid && !rid.endsWith(`-${system.architecture}`)) || !osRidMatches) {
                attempts.push({ hostPath, error: { code: "ARCHITECTURE_MISMATCH", message: "Host runtime identifier is not native to this system" } });
                continue;
            }
            const runtimeDirectory = paths.join(hostRoot, "shared", "Microsoft.NETCore.App");
            if (runtimes.value.some((entry) => !paths.isAbsolute(entry.directory) || hasControlCharacters(entry.directory))) {
                attempts.push({ hostPath, error: { code: "PROBE_OUTPUT_INVALID", message: "Inventory has an invalid installation directory" } });
                continue;
            }
            const runtime = selectWorkerRuntime(
                runtimes.value.filter((entry) => normalize(entry.directory) === normalize(runtimeDirectory)),
                requirement,
            );
            if (!runtime.ok) {
                attempts.push({ hostPath, error: runtime.error });
                continue;
            }
            return {
                ok: true,
                value: {
                    hostPath,
                    hostRoot,
                    architecture: info.value.architecture,
                    ...resolved.value,
                    platformMatrixVersion: 1,
                    runtime: runtime.value,
                    nativeRollForward: runtimeRequirement.value.policy === "Latest" ? "LatestMajor" : runtimeRequirement.value.policy,
                    attempts,
                },
            };
        }
        const priority = ["RUNTIME_NOT_FOUND", "ARCHITECTURE_MISMATCH", "ARCHITECTURE_UNSUPPORTED", "PROBE_TIMEOUT", "PROBE_OUTPUT_INVALID", "PROBE_FAILED", "INVALID_HOST", "HOST_NOT_FOUND"];
        const mostRelevant = [...attempts].sort((left, right) => priority.indexOf(left.error.code) - priority.indexOf(right.error.code))[0]?.error;
        return { ok: false, error: mostRelevant ?? { code: "HOST_NOT_FOUND", message: "No approved installed .NET host was found" }, attempts };
    }
}
