import { execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import * as filesystem from "fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "path";
import { validateWorkers } from "../../../packages/validation/src/validate";
import type { DotNetPreparedTool, DotNetToolPreparationErrorCode, DotNetToolPreparationRequest } from "../../common/types/dotnetTool";
import type { DotNetDiscoveryResult, DotNetDiscoverySelection } from "../../common/types/dotnetWorker";
import {
    dotNetHasControlCharacters,
    dotNetHash,
    dotNetPackageRelativePath,
    dotNetStableJson,
    dotNetToolSettings,
    normalizeDotNetNuGetVersion,
    parseDotNetPackageXml,
    verifyDotNetRuntimeConfig,
} from "../utilities/dotnetToolPreparation";
import { DotNetDiscoveryManager, dotNetProbeOptions } from "./dotnetDiscoveryManager";

export interface DotNetToolExecOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: "utf8";
    shell: false;
    timeout: number;
    killSignal: "SIGKILL";
    maxBuffer: number;
    windowsHide: true;
}

export interface DotNetToolResolverEntry {
    Version: string;
    TargetFramework: string;
    RuntimeIdentifier: string;
    Name: string;
    Runner: string;
    PathToExecutable: string;
}

export interface DotNetToolPreparationDependencies {
    approve(request: DotNetToolPreparationRequest): Promise<boolean>;
    rediscover?(request: DotNetToolPreparationRequest): Promise<DotNetDiscoveryResult>;
    fs?: typeof filesystem;
    exec?(host: string, args: readonly string[], options: DotNetToolExecOptions): Promise<string>;
    inventory?(resolverPath: string, contents: string): Promise<DotNetToolResolverEntry[]>;
}

export class DotNetToolPreparationError extends Error {
    constructor(readonly code: DotNetToolPreparationErrorCode) {
        super(`DotNet preparation failed: ${code}`);
        this.name = "DotNetToolPreparationError";
    }
}

const nuGetConfig =
    '<?xml version="1.0" encoding="utf-8"?>\n<configuration><packageSources><clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" /></packageSources><fallbackPackageFolders><clear /></fallbackPackageFolders><disabledPackageSources><clear /></disabledPackageSources><packageSourceMapping><clear /><packageSource key="nuget.org"><package pattern="*" /></packageSource></packageSourceMapping></configuration>\n';
const markerName = "complete.json";

function authoritySelection(selection: DotNetDiscoverySelection): Omit<DotNetDiscoverySelection, "attempts"> {
    const { attempts: discarded, ...authority } = selection;
    void discarded;
    return authority;
}

function defaultExec(host: string, args: readonly string[], options: DotNetToolExecOptions): Promise<string> {
    return new Promise((complete, reject) => {
        execFile(host, [...args], options, (error, stdout) => (error ? reject(new DotNetToolPreparationError("RESTORE_FAILED")) : complete(stdout)));
    });
}

export class DotNetToolManager {
    private readonly fs: typeof filesystem;
    private readonly inflight = new Map<string, Promise<DotNetPreparedTool>>();

    constructor(
        private readonly root: string,
        private readonly dependencies: DotNetToolPreparationDependencies,
    ) {
        this.fs = dependencies.fs ?? filesystem;
    }

    async prepare(input: DotNetToolPreparationRequest): Promise<DotNetPreparedTool> {
        let request: DotNetToolPreparationRequest;
        try {
            request = JSON.parse(JSON.stringify(input)) as DotNetToolPreparationRequest;
        } catch {
            throw new DotNetToolPreparationError("INVALID_REQUEST");
        }
        let approved = false;
        try {
            approved = await this.dependencies.approve(JSON.parse(JSON.stringify(request)) as DotNetToolPreparationRequest);
        } catch {
            throw new DotNetToolPreparationError("APPROVAL_DENIED");
        }
        if (approved !== true) throw new DotNetToolPreparationError("APPROVAL_DENIED");
        try {
            const identity = request.identity;
            if (
                Object.keys(request).sort().join(",") !== "declaration,identity,selection" ||
                !identity ||
                Object.keys(identity).sort().join(",") !== "sourceFingerprint,toolId,toolVersion,workerId" ||
                typeof identity.toolId !== "string" ||
                typeof identity.toolVersion !== "string" ||
                typeof identity.sourceFingerprint !== "string" ||
                typeof identity.workerId !== "string" ||
                !identity.toolId ||
                identity.toolId.length > 256 ||
                dotNetHasControlCharacters(identity.toolId) ||
                !identity.toolVersion ||
                identity.toolVersion.length > 128 ||
                dotNetHasControlCharacters(identity.toolVersion) ||
                !/^[a-f0-9]{64}$/.test(identity.sourceFingerprint)
            )
                throw new Error("Invalid identity");
            const validated = validateWorkers({ [identity.workerId]: request.declaration });
            if (validated.errors.length || !validated.workers || dotNetStableJson(validated.workers[identity.workerId]) !== dotNetStableJson(request.declaration))
                throw new Error("Noncanonical declaration");
            const selection = request.selection;
            if (
                !selection ||
                !isAbsolute(selection.hostPath) ||
                !isAbsolute(selection.hostRoot) ||
                dirname(selection.hostPath) !== selection.hostRoot ||
                !/^[a-z0-9-]+$/.test(selection.nativeRid) ||
                selection.platformMatrixVersion !== 1 ||
                dotNetStableJson(selection.sdkPin) !== dotNetStableJson({ sdk: { version: selection.sdk.version, rollForward: "disable", allowPrerelease: false, paths: ["$host$"] } })
            )
                throw new Error("Invalid selection");
        } catch {
            throw new DotNetToolPreparationError("INVALID_REQUEST");
        }
        const authority = { schema: 1, identity: request.identity, declaration: request.declaration, selection: authoritySelection(request.selection) };
        const fingerprint = dotNetHash(dotNetStableJson(authority));
        const pending = this.inflight.get(fingerprint);
        if (pending) return pending;
        const preparation = this.prepareApproved(request, authority, fingerprint);
        this.inflight.set(fingerprint, preparation);
        try {
            return await preparation;
        } finally {
            if (this.inflight.get(fingerprint) === preparation) this.inflight.delete(fingerprint);
        }
    }

    private async safePath(file: string, directory: boolean): Promise<void> {
        if (!isAbsolute(file) || resolve(file) !== file || dotNetHasControlCharacters(file)) throw new DotNetToolPreparationError("WORKSPACE_INVALID");
        const volume = parse(file).root;
        let current = volume;
        const components = relative(volume, file).split(sep).filter(Boolean);
        for (let index = 0; index < components.length; index++) {
            current = join(current, components[index]);
            const metadata = await this.fs.lstat(current);
            const isDirectory = index < components.length - 1 || directory;
            if (metadata.isSymbolicLink() || (isDirectory ? !metadata.isDirectory() : !metadata.isFile() || metadata.nlink !== 1) || (await this.fs.realpath(current)) !== current) {
                throw new DotNetToolPreparationError("WORKSPACE_INVALID");
            }
        }
    }

    private async exists(file: string): Promise<boolean> {
        try {
            await this.fs.lstat(file);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    private async read(file: string, maxBytes = 256 * 1024): Promise<string> {
        await this.safePath(file, false);
        const handle = await this.fs.open(file, "r");
        try {
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.size > maxBytes || metadata.nlink !== 1) throw new DotNetToolPreparationError("ARTIFACT_INVALID");
            const buffer = Buffer.alloc(maxBytes + 1);
            let total = 0;
            while (total < buffer.length) {
                const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
                if (!bytesRead) break;
                total += bytesRead;
            }
            if (total > maxBytes) throw new DotNetToolPreparationError("ARTIFACT_INVALID");
            return buffer.subarray(0, total).toString("utf8");
        } finally {
            await handle.close();
        }
    }

    private manifest(request: DotNetToolPreparationRequest): unknown {
        return {
            version: 1,
            isRoot: true,
            tools: { [request.declaration.packageId.toLowerCase()]: { version: normalizeDotNetNuGetVersion(request.declaration.packageVersion), commands: [request.declaration.command] } },
        };
    }

    private async digest(file: string, algorithm: "sha256" | "sha512"): Promise<string> {
        await this.safePath(file, false);
        const handle = await this.fs.open(file, "r");
        try {
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 256 * 1024 * 1024) throw new Error("Invalid artifact size");
            const hash = createHash(algorithm);
            const buffer = Buffer.alloc(64 * 1024);
            let total = 0;
            let bytesRead: number;
            do {
                bytesRead = (await handle.read(buffer, 0, buffer.length, null)).bytesRead;
                if ((total += bytesRead) > metadata.size) throw new Error("Artifact changed during hashing");
                hash.update(buffer.subarray(0, bytesRead));
            } while (bytesRead > 0);
            if (total !== metadata.size) throw new Error("Artifact changed during hashing");
            return hash.digest(algorithm === "sha512" ? "base64" : "hex");
        } finally {
            await handle.close();
        }
    }

    private async validateConfiguration(workspace: string, request: DotNetToolPreparationRequest): Promise<void> {
        await this.safePath(workspace, true);
        if (
            dotNetStableJson(JSON.parse(await this.read(join(workspace, "global.json")))) !== dotNetStableJson(request.selection.sdkPin) ||
            (await this.read(join(workspace, "NuGet.Config"))) !== nuGetConfig ||
            dotNetStableJson(JSON.parse(await this.read(join(workspace, ".config", "dotnet-tools.json")))) !== dotNetStableJson(this.manifest(request))
        )
            throw new DotNetToolPreparationError("ARTIFACT_INVALID");
    }

    private options(workspace: string, selection: DotNetDiscoverySelection, restore: boolean): DotNetToolExecOptions {
        const osPlatform = selection.platform.startsWith("windows-") ? "win32" : selection.platform.startsWith("macos-") ? "darwin" : "linux";
        const home = join(workspace, "cli-home");
        return {
            ...dotNetProbeOptions(selection.hostRoot, osPlatform),
            cwd: workspace,
            timeout: restore ? 120000 : 5000,
            maxBuffer: 256 * 1024,
            env: {
                ...dotNetProbeOptions(selection.hostRoot, osPlatform).env,
                HOME: home,
                USERPROFILE: home,
                DOTNET_CLI_HOME: home,
                NUGET_PACKAGES: join(workspace, "packages"),
                NUGET_HTTP_CACHE_PATH: join(workspace, "http-cache"),
                NUGET_PLUGINS_CACHE_PATH: join(workspace, "plugin-cache"),
                TMPDIR: join(workspace, "tmp"),
                TMP: join(workspace, "tmp"),
                TEMP: join(workspace, "tmp"),
                DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
                DOTNET_CLI_TELEMETRY_OPTOUT: "1",
                DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
            },
        };
    }

    private async command(workspace: string, request: DotNetToolPreparationRequest, args: readonly string[], restore: boolean): Promise<string> {
        await this.validateConfiguration(workspace, request);
        try {
            const options = this.options(workspace, request.selection, restore);
            const output = await (this.dependencies.exec ?? defaultExec)(request.selection.hostPath, args, options);
            if (typeof output !== "string" || Buffer.byteLength(output) > options.maxBuffer || output.includes("\0")) throw new Error("Invalid output");
            return output;
        } catch {
            throw new DotNetToolPreparationError("RESTORE_FAILED");
        }
    }

    private resolverPath(workspace: string, packageId: string): string {
        return join(workspace, "cli-home", ".dotnet", "toolResolverCache", "1", packageId);
    }

    private async verifyArtifacts(workspace: string, request: DotNetToolPreparationRequest): Promise<{ entryPoint: string; runtimeConfigPath: string; depsPath: string }> {
        await this.validateConfiguration(workspace, request);
        const { declaration, selection } = request;
        const packageId = declaration.packageId.toLowerCase();
        const version = normalizeDotNetNuGetVersion(declaration.packageVersion);
        const packageRoot = join(workspace, "packages", packageId, version);
        await this.safePath(packageRoot, true);
        const archive = join(packageRoot, `${packageId}.${version}.nupkg`);
        const archiveHash = await this.digest(archive, "sha512");
        const packageMetadata = JSON.parse(await this.read(join(packageRoot, ".nupkg.metadata")));
        if (
            (await this.read(`${archive}.sha512`)).trim() !== archiveHash ||
            packageMetadata.version !== 2 ||
            packageMetadata.contentHash !== archiveHash ||
            packageMetadata.source !== "https://api.nuget.org/v3/index.json"
        )
            throw new Error("Package archive or source mismatch");
        const nuspec = parseDotNetPackageXml(await this.read(join(packageRoot, `${packageId}.nuspec`)));
        const metadata = nuspec.children.filter((node) => node.name === "metadata");
        const packageIdentity = (name: string): string => {
            const nodes = metadata[0]?.children.filter((node) => node.name === name);
            if (nodes?.length !== 1 || nodes[0].children.length) throw new Error("Invalid package identity");
            return nodes[0].text.trim();
        };
        if (nuspec.name !== "package" || metadata.length !== 1 || packageIdentity("id").toLowerCase() !== packageId || normalizeDotNetNuGetVersion(packageIdentity("version")) !== version)
            throw new Error("Package identity mismatch");
        const path = this.resolverPath(workspace, packageId);
        const contents = await this.read(path);
        const parsed = JSON.parse(contents) as DotNetToolResolverEntry[];
        const entries = this.dependencies.inventory ? await this.dependencies.inventory(path, contents) : parsed;
        if (dotNetStableJson(entries) !== dotNetStableJson(parsed) || !Array.isArray(entries) || entries.length !== 1) throw new Error("Invalid resolver inventory");
        const entry = entries[0];
        if (
            Object.keys(entry).sort().join(",") !== "Name,PathToExecutable,Runner,RuntimeIdentifier,TargetFramework,Version" ||
            entry.Version !== version ||
            entry.Name !== declaration.command ||
            entry.Runner !== "dotnet" ||
            ![declaration.dotnet.targetFramework, `net${selection.sdk.major}.${selection.sdk.minor}`].includes(entry.TargetFramework) ||
            !["any", selection.nativeRid].includes(entry.RuntimeIdentifier) ||
            !isAbsolute(entry.PathToExecutable)
        )
            throw new Error("Resolver mismatch");
        const artifactRoot = join(packageRoot, "tools", declaration.dotnet.targetFramework, "any");
        const executableName = dotNetToolSettings(await this.read(join(artifactRoot, "DotnetToolSettings.xml")), declaration.command);
        const entryPoint = join(artifactRoot, dotNetPackageRelativePath(executableName));
        if (entry.PathToExecutable !== entryPoint) throw new Error("Entrypoint mismatch");
        await this.safePath(entryPoint, false);
        const runtimeConfigPath = entryPoint.slice(0, -4) + ".runtimeconfig.json";
        const depsPath = entryPoint.slice(0, -4) + ".deps.json";
        if (await this.exists(entryPoint.slice(0, -4) + ".runtimeconfig.dev.json")) throw new Error("Development runtime configuration is unsupported");
        verifyDotNetRuntimeConfig(await this.read(runtimeConfigPath), declaration, selection);
        const deps = JSON.parse(await this.read(depsPath, 4 * 1024 * 1024));
        const targetName = deps?.runtimeTarget?.name;
        if (
            typeof targetName !== "string" ||
            !new RegExp(`^\\.NETCoreApp,Version=v${declaration.dotnet.targetFramework.slice(3).replace(".", "\\.")}(?:/${selection.nativeRid})?$`).test(targetName) ||
            !deps.targets ||
            !deps.targets[targetName] ||
            !deps.libraries ||
            typeof deps.libraries !== "object"
        )
            throw new Error("Invalid dependency target");
        let entryFound = false;
        for (const [libraryId, library] of Object.entries(deps.targets[targetName]) as [
            string,
            { runtime?: Record<string, unknown>; native?: Record<string, unknown>; runtimeTargets?: Record<string, unknown>; dependencies?: Record<string, unknown> },
        ][]) {
            dotNetPackageRelativePath(libraryId);
            if (libraryId.split("/").length !== 2 || !Object.hasOwn(deps.libraries, libraryId) || !library || typeof library !== "object") throw new Error("Missing dependency identity");
            const metadata = deps.libraries[libraryId];
            if (!metadata || !["project", "package", "reference"].includes(metadata.type)) throw new Error("Invalid dependency metadata");
            if (metadata.path !== undefined) dotNetPackageRelativePath(metadata.path);
            if (metadata.hashPath !== undefined) dotNetPackageRelativePath(metadata.hashPath);
            for (const group of [library.runtime, library.native, library.runtimeTargets]) {
                if (group !== undefined && (!group || typeof group !== "object" || Array.isArray(group))) throw new Error("Invalid artifact group");
                for (const file of Object.keys(group ?? {})) {
                    dotNetPackageRelativePath(file);
                    if (file.endsWith("/_._") || file === "_._") continue;
                    const exactArtifact = join(artifactRoot, file);
                    const artifact = (await this.exists(exactArtifact)) ? exactArtifact : join(artifactRoot, basename(file));
                    await this.safePath(artifact, false);
                    if (artifact === entryPoint) entryFound = true;
                }
            }
            for (const [dependency, dependencyVersion] of Object.entries(library.dependencies ?? {})) {
                if (typeof dependencyVersion !== "string" || !Object.hasOwn(deps.libraries, `${dependency}/${dependencyVersion}`)) throw new Error("Unresolved dependency");
            }
        }
        if (!entryFound) throw new Error("Entrypoint absent from deps");
        return { entryPoint, runtimeConfigPath, depsPath };
    }

    private async inventoryHash(workspace: string): Promise<Record<string, string>> {
        const hashes: Record<string, string> = {};
        let total = 0;
        let count = 0;
        const walk = async (directory: string): Promise<void> => {
            await this.safePath(directory, true);
            for (const name of (await this.fs.readdir(directory)).sort()) {
                if (++count > 10000) throw new Error("Cache inventory exceeds bound");
                const file = join(directory, name);
                if (file === join(workspace, markerName)) continue;
                const metadata = await this.fs.lstat(file);
                if (metadata.isDirectory()) await walk(file);
                else {
                    await this.safePath(file, false);
                    if ((total += metadata.size) > 1024 * 1024 * 1024) throw new Error("Cache inventory exceeds bound");
                    hashes[relative(workspace, file).split(sep).join("/")] = await this.digest(file, "sha256");
                }
            }
        };
        await walk(workspace);
        return hashes;
    }

    private async prepareApproved(request: DotNetToolPreparationRequest, authority: unknown, fingerprint: string): Promise<DotNetPreparedTool> {
        let discovered: DotNetDiscoveryResult;
        try {
            discovered = await (this.dependencies.rediscover
                ? this.dependencies.rediscover(JSON.parse(JSON.stringify(request)) as DotNetToolPreparationRequest)
                : new DotNetDiscoveryManager().discover(request.declaration.dotnet, request.declaration.platforms));
        } catch {
            throw new DotNetToolPreparationError("DISCOVERY_CHANGED");
        }
        if (!discovered.ok || dotNetStableJson(authoritySelection(discovered.value)) !== dotNetStableJson(authoritySelection(request.selection)))
            throw new DotNetToolPreparationError("DISCOVERY_CHANGED");
        let lockOwned = false;
        let lockInode: number | undefined;
        let stage: string | undefined;
        let published = false;
        let finished = false;
        const workspace = join(this.root, `${fingerprint}-${request.selection.nativeRid}`);
        const lock = `${workspace}.lock`;
        const token = randomUUID();
        const operation = async (): Promise<DotNetPreparedTool> => {
            try {
                if (!isAbsolute(this.root) || resolve(this.root) !== this.root) throw new DotNetToolPreparationError("WORKSPACE_INVALID");
                if (!(await this.exists(this.root))) {
                    await this.safePath(dirname(this.root), true);
                    await this.fs.mkdir(this.root, { mode: 0o700 });
                }
                await this.safePath(this.root, true);
                try {
                    await this.fs.mkdir(lock, { mode: 0o700 });
                    lockOwned = true;
                    lockInode = (await this.fs.lstat(lock)).ino;
                    await this.fs.writeFile(join(lock, "owner"), token, { flag: "wx", mode: 0o600 });
                } catch {
                    throw new DotNetToolPreparationError("PREPARATION_BUSY");
                }
                const descriptor = async (reused: boolean, integrityHash: string): Promise<DotNetPreparedTool> => ({
                    identity: request.identity,
                    declarationFingerprint: dotNetHash(dotNetStableJson(request.declaration)),
                    preparationFingerprint: fingerprint,
                    workspace,
                    manifestPath: join(workspace, ".config", "dotnet-tools.json"),
                    packageId: request.declaration.packageId.toLowerCase(),
                    packageVersion: normalizeDotNetNuGetVersion(request.declaration.packageVersion),
                    command: request.declaration.command,
                    ...(await this.verifyArtifacts(workspace, request)),
                    selection: request.selection,
                    integrityHash,
                    reused,
                });
                if (await this.exists(workspace)) {
                    try {
                        const marker = JSON.parse(await this.read(join(workspace, markerName), 2 * 1024 * 1024));
                        if (dotNetStableJson(marker.authority) !== dotNetStableJson(authority)) throw new Error("Authority changed");
                        const files = await this.inventoryHash(workspace);
                        const integrityHash = dotNetHash(dotNetStableJson(files));
                        if (
                            marker.integrityHash !== integrityHash ||
                            dotNetStableJson(marker.files) !== dotNetStableJson(files) ||
                            Object.keys(marker).sort().join(",") !== "authority,files,integrityHash"
                        )
                            throw new Error("Cache changed");
                        const result = await descriptor(true, integrityHash);
                        finished = true;
                        return result;
                    } catch {
                        throw new DotNetToolPreparationError("CACHE_INVALID");
                    }
                }
                stage = await this.fs.mkdtemp(join(this.root, `${fingerprint}.stage-`));
                for (const directory of [".config", "cli-home", "packages", "http-cache", "plugin-cache", "tmp"]) await this.fs.mkdir(join(stage, directory), { mode: 0o700 });
                await this.fs.writeFile(join(stage, "global.json"), dotNetStableJson(request.selection.sdkPin), { flag: "wx", mode: 0o600 });
                await this.fs.writeFile(join(stage, "NuGet.Config"), nuGetConfig, { flag: "wx", mode: 0o600 });
                await this.fs.writeFile(join(stage, ".config", "dotnet-tools.json"), dotNetStableJson(this.manifest(request)), { flag: "wx", mode: 0o600 });
                const sdkVersion = await this.command(stage, request, ["--version"], false);
                if (sdkVersion.trim() !== request.selection.sdk.version) throw new DotNetToolPreparationError("SDK_MISMATCH");
                await this.command(
                    stage,
                    request,
                    [
                        "tool",
                        "restore",
                        "--tool-manifest",
                        join(stage, ".config", "dotnet-tools.json"),
                        "--configfile",
                        join(stage, "NuGet.Config"),
                        "--no-cache",
                        "--disable-parallel",
                        "--verbosity",
                        "minimal",
                    ],
                    true,
                );
                let artifacts: Awaited<ReturnType<DotNetToolManager["verifyArtifacts"]>>;
                try {
                    artifacts = await this.verifyArtifacts(stage, request);
                    await this.inventoryHash(stage);
                } catch {
                    throw new DotNetToolPreparationError("ARTIFACT_INVALID");
                }
                const resolverPath = this.resolverPath(stage, request.declaration.packageId.toLowerCase());
                const records = JSON.parse(await this.read(resolverPath)) as DotNetToolResolverEntry[];
                records[0].PathToExecutable = join(workspace, relative(stage, artifacts.entryPoint));
                await this.fs.writeFile(resolverPath, JSON.stringify(records), { mode: 0o600 });
                await this.safePath(stage, true);
                await this.safePath(lock, true);
                if (await this.exists(workspace)) throw new DotNetToolPreparationError("PREPARATION_BUSY");
                await this.fs.rename(stage, workspace);
                published = true;
                stage = undefined;
                const files = await this.inventoryHash(workspace);
                const integrityHash = dotNetHash(dotNetStableJson(files));
                const result = await descriptor(false, integrityHash);
                const marker = dotNetStableJson({ authority, files, integrityHash });
                if (Buffer.byteLength(marker) > 2 * 1024 * 1024) throw new DotNetToolPreparationError("ARTIFACT_INVALID");
                await this.fs.writeFile(join(workspace, markerName), marker, { flag: "wx", mode: 0o600 });
                finished = true;
                return result;
            } catch (error) {
                if (error instanceof DotNetToolPreparationError) throw error;
                throw new DotNetToolPreparationError("WORKSPACE_INVALID");
            }
        };
        const cleanup = async (): Promise<void> => {
            try {
                if (stage) await this.fs.rm(stage, { recursive: true, force: true });
                if (published && !finished) await this.fs.rm(workspace, { recursive: true, force: true });
                if (lockOwned) {
                    await this.safePath(lock, true);
                    if ((await this.fs.lstat(lock)).ino === lockInode) {
                        const owner = join(lock, "owner");
                        if (await this.exists(owner)) {
                            if ((await this.read(owner)) !== token) throw new DotNetToolPreparationError("WORKSPACE_INVALID");
                            await this.fs.unlink(owner);
                        }
                        await this.fs.rmdir(lock);
                    }
                }
            } catch {
                throw new DotNetToolPreparationError("WORKSPACE_INVALID");
            }
        };
        return operation().then(
            async (result) => {
                await cleanup();
                return result;
            },
            async (error: unknown) => {
                await cleanup();
                throw error;
            },
        );
    }
}
