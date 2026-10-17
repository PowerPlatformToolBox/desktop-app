import { app } from "electron";
import * as fs from "fs/promises";
import type { RequestOptions } from "http";
import { dirname, isAbsolute, join, resolve } from "path";
import { validateWorkers } from "../../../packages/validation/src/validate";
import type { DotNetPreparedTool, DotNetToolPreparationRequest } from "../../common/types/dotnetTool";
import { DOTNET_NUGET_ORG_SOURCE } from "../../common/types/dotnetTool";
import { resolveDotNetLocalFeedPath, resolveDotNetPackageSource } from "../utils/dotnetLocalFeed";
import { DOTNET_PACKAGE_LIMITS, dotNetNuGetPackageUrl, dotNetPackageSha512, downloadDotNetPackage, extractDotNetToolPackage } from "../utils/dotnetPackage";
import {
    dotNetHasControlCharacters,
    dotNetHash,
    dotNetPackageInvalid,
    dotNetPackageRelativePath,
    dotNetStableJson,
    DotNetToolPreparationError,
    dotNetToolSettings,
    normalizeDotNetNuGetVersion,
    parseDotNetPackageXml,
    verifyDotNetRuntimeConfig,
} from "../utils/dotnetToolPreparation";

export { DotNetToolPreparationError };

export interface DotNetToolPreparationDependencies {
    approve(request: DotNetToolPreparationRequest): Promise<boolean>;
    localFeedPath?(): string | null;
    isDeveloperBuild?: boolean;
    agentForUrl?(url: string): RequestOptions["agent"];
    download?(url: string, signal: AbortSignal): Promise<Buffer>;
}

export interface DotNetPreparationControl {
    readonly signal: AbortSignal;
    assertCurrent(): void;
}

interface CacheMarker {
    schema: 1;
    packageId: string;
    packageVersion: string;
    packageSha512: string;
    files: Record<string, number>;
}

interface Materialized {
    reused: boolean;
    packageSha512: string;
}

interface SharedMaterialization {
    promise: Promise<Materialized>;
    abort: AbortController;
    waiters: number;
}

const MARKER_FILE = "complete.json";
const TEMP_DIRECTORY = ".tmp";
// Workspaces, staging folders and locks created by the previous `dotnet tool restore` based layout.
const LEGACY_ENTRY = /^[a-f0-9]{64}(?:\.stage-.+|-[a-z0-9-]+(?:\.lock)?)$/;

const materializations = new Map<string, SharedMaterialization>();
const rootCleanups = new Map<string, Promise<void>>();

function checkPreparation(control?: DotNetPreparationControl): void {
    try {
        control?.signal.throwIfAborted();
        control?.assertCurrent();
    } catch {
        throw new DotNetToolPreparationError("CANCELLED");
    }
}

function waitFor<Value>(promise: Promise<Value>, control?: DotNetPreparationControl): Promise<Value> {
    if (!control) return promise;
    return new Promise((resolvePromise, reject) => {
        const onAbort = (): void => reject(new DotNetToolPreparationError("CANCELLED"));
        if (control.signal.aborted) return onAbort();
        control.signal.addEventListener("abort", onAbort, { once: true });
        promise.then(resolvePromise, reject).finally(() => control.signal.removeEventListener("abort", onAbort));
    });
}

function asPreparationError(error: unknown, code: "PACKAGE_INVALID" | "WORKSPACE_INVALID"): DotNetToolPreparationError {
    if (error instanceof DotNetToolPreparationError) return error;
    return new DotNetToolPreparationError(code, undefined, error instanceof Error ? error.message : String(error));
}

async function isFile(file: string): Promise<boolean> {
    try {
        return (await fs.stat(file)).isFile();
    } catch {
        return false;
    }
}

async function isDirectory(file: string): Promise<boolean> {
    try {
        return (await fs.stat(file)).isDirectory();
    } catch {
        return false;
    }
}

async function readText(file: string, missing: string, maxBytes = 4 * 1024 * 1024): Promise<string> {
    let metadata;
    try {
        metadata = await fs.stat(file);
    } catch {
        throw dotNetPackageInvalid(missing);
    }
    if (!metadata.isFile() || metadata.size > maxBytes) throw dotNetPackageInvalid(`${missing} (not a file or too large)`);
    return fs.readFile(file, "utf8");
}

/**
 * Prepares a .NET worker by downloading its NuGet tool package and extracting it into an
 * app-owned cache. No SDK or child process is involved; the worker is launched later with
 * `dotnet exec` against the extracted entry point.
 */
export class DotNetToolManager {
    constructor(
        private readonly root: string,
        private readonly dependencies: DotNetToolPreparationDependencies,
    ) {}

    async prepare(input: DotNetToolPreparationRequest, control?: DotNetPreparationControl): Promise<DotNetPreparedTool> {
        checkPreparation(control);
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
        checkPreparation(control);
        this.validate(request);
        const packageId = request.declaration.packageId.toLowerCase();
        const packageVersion = normalizeDotNetNuGetVersion(request.declaration.packageVersion);
        const workspace = this.workspace(request, packageId, packageVersion);
        await this.ensureRoot();
        checkPreparation(control);
        const materialized = await this.materializeShared(request, workspace, packageId, packageVersion, control);
        checkPreparation(control);
        const layout = await this.verifyLayout(workspace, request);
        checkPreparation(control);
        return {
            identity: request.identity,
            declarationFingerprint: dotNetHash(dotNetStableJson(request.declaration)),
            workspace,
            packageId,
            packageVersion,
            packageSha512: materialized.packageSha512,
            command: request.declaration.command,
            ...layout,
            selection: request.selection,
            reused: materialized.reused,
        };
    }

    private validate(request: DotNetToolPreparationRequest): void {
        try {
            const identity = request.identity;
            if (
                Object.keys(request).sort().join(",") !== "declaration,identity,selection,source" ||
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
                selection.platformMatrixVersion !== 1
            )
                throw new Error("Invalid selection");
            if (request.source.kind === "nuget.org") {
                if (Object.keys(request.source).sort().join(",") !== "kind,url" || request.source.url !== DOTNET_NUGET_ORG_SOURCE) throw new Error("Invalid package source");
            } else if (request.source.kind === "local-feed") {
                if (Object.keys(request.source).sort().join(",") !== "kind,packageSha512,path" || !/^[A-Za-z0-9+/]{86}==$/.test(request.source.packageSha512))
                    throw new Error("Invalid local package source");
                const isDeveloperBuild = this.dependencies.isDeveloperBuild ?? process.env.PPTB_DEVELOPER_BUILD === "1";
                const configuredFeed = this.dependencies.localFeedPath ? this.dependencies.localFeedPath() : resolveDotNetLocalFeedPath(process.env, app.isPackaged, isDeveloperBuild);
                if (configuredFeed !== request.source.path) throw new Error("Local package source is not the configured developer feed");
                const currentSource = resolveDotNetPackageSource(configuredFeed, request.declaration, app.isPackaged, isDeveloperBuild);
                if (dotNetStableJson(currentSource) !== dotNetStableJson(request.source)) throw new Error("Local package changed");
            } else {
                throw new Error("Unknown package source");
            }
        } catch (error) {
            throw new DotNetToolPreparationError("INVALID_REQUEST", undefined, error instanceof Error ? error.message : undefined);
        }
    }

    private workspace(request: DotNetToolPreparationRequest, packageId: string, packageVersion: string): string {
        // Local-feed packages can be rebuilt with the same version, so their cache is keyed by content.
        const version = request.source.kind === "local-feed" ? `${packageVersion}-local-${dotNetHash(request.source.packageSha512).slice(0, 16)}` : packageVersion;
        return join(this.root, packageId, version);
    }

    private ensureRoot(): Promise<void> {
        let cleanup = rootCleanups.get(this.root);
        if (!cleanup) {
            cleanup = (async () => {
                if (!isAbsolute(this.root) || resolve(this.root) !== this.root) throw new DotNetToolPreparationError("WORKSPACE_INVALID", undefined, "Preparation root must be absolute");
                await fs.mkdir(this.root, { recursive: true });
                const entries = await fs.readdir(this.root).catch(() => [] as string[]);
                await Promise.all(
                    entries.filter((name) => name === TEMP_DIRECTORY || LEGACY_ENTRY.test(name)).map((name) => fs.rm(join(this.root, name), { recursive: true, force: true }).catch(() => undefined)),
                );
            })();
            rootCleanups.set(this.root, cleanup);
            cleanup.catch(() => rootCleanups.delete(this.root));
        }
        return cleanup.catch((error: unknown) => {
            throw asPreparationError(error, "WORKSPACE_INVALID");
        });
    }

    private async materializeShared(request: DotNetToolPreparationRequest, workspace: string, packageId: string, packageVersion: string, control?: DotNetPreparationControl): Promise<Materialized> {
        let shared = materializations.get(workspace);
        if (!shared) {
            const abort = new AbortController();
            const entry: SharedMaterialization = { promise: this.materialize(request, workspace, packageId, packageVersion, abort.signal), abort, waiters: 0 };
            materializations.set(workspace, entry);
            entry.promise
                .finally(() => {
                    if (materializations.get(workspace) === entry) materializations.delete(workspace);
                })
                .catch(() => undefined);
            shared = entry;
        }
        const current = shared;
        current.waiters++;
        try {
            return await waitFor(current.promise, control);
        } finally {
            // Stop the shared download only when every caller has given up on it.
            if (--current.waiters === 0 && materializations.get(workspace) === current) {
                current.abort.abort();
                materializations.delete(workspace);
            }
        }
    }

    private async materialize(request: DotNetToolPreparationRequest, workspace: string, packageId: string, packageVersion: string, signal: AbortSignal): Promise<Materialized> {
        const expectedSha512 = request.source.kind === "local-feed" ? request.source.packageSha512 : undefined;
        const cached = await this.readIntactMarker(workspace, packageId, packageVersion);
        if (cached && (!expectedSha512 || cached.packageSha512 === expectedSha512)) return { reused: true, packageSha512: cached.packageSha512 };
        let stage: string | undefined;
        try {
            const bytes = await this.fetchPackage(request, packageId, packageVersion, signal);
            signal.throwIfAborted();
            const packageSha512 = dotNetPackageSha512(bytes);
            if (expectedSha512 && packageSha512 !== expectedSha512) {
                throw new DotNetToolPreparationError("PACKAGE_HASH_MISMATCH", undefined, "Local package bytes no longer match the approved package");
            }
            await fs.mkdir(join(this.root, TEMP_DIRECTORY), { recursive: true });
            stage = await fs.mkdtemp(join(this.root, TEMP_DIRECTORY, `${packageId}.`));
            const files = await extractDotNetToolPackage(bytes, packageId, stage, signal);
            await this.verifyNuspec(stage, packageId, packageVersion);
            const sizes: Record<string, number> = {};
            for (const file of files) sizes[file] = (await fs.stat(join(stage, ...file.split("/")))).size;
            const marker: CacheMarker = { schema: 1, packageId, packageVersion, packageSha512, files: sizes };
            await fs.writeFile(join(stage, MARKER_FILE), JSON.stringify(marker), { flag: "wx" });
            signal.throwIfAborted();
            await fs.rm(workspace, { recursive: true, force: true });
            await fs.mkdir(dirname(workspace), { recursive: true });
            try {
                await this.renameWithRetry(stage, workspace, signal);
                stage = undefined;
            } catch (error) {
                // Another preparation may have published the same package first.
                const published = await this.readIntactMarker(workspace, packageId, packageVersion);
                if (!published || published.packageSha512 !== packageSha512) throw error;
            }
            return { reused: false, packageSha512 };
        } catch (error) {
            if (signal.aborted) throw new DotNetToolPreparationError("CANCELLED");
            throw asPreparationError(error, "WORKSPACE_INVALID");
        } finally {
            if (stage) await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private async renameWithRetry(source: string, target: string, signal: AbortSignal): Promise<void> {
        // Windows antivirus scanners briefly lock newly written DLLs, which makes directory renames fail transiently.
        for (let attempt = 0; ; attempt++) {
            try {
                await fs.rename(source, target);
                return;
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 6) throw error;
                await new Promise((resolveDelay) => setTimeout(resolveDelay, 50 * 2 ** attempt));
                signal.throwIfAborted();
            }
        }
    }

    private async readIntactMarker(workspace: string, packageId: string, packageVersion: string): Promise<CacheMarker | null> {
        try {
            const marker = JSON.parse(await fs.readFile(join(workspace, MARKER_FILE), "utf8")) as CacheMarker;
            if (
                marker?.schema !== 1 ||
                marker.packageId !== packageId ||
                marker.packageVersion !== packageVersion ||
                !/^[A-Za-z0-9+/]{86}==$/.test(marker.packageSha512) ||
                !marker.files ||
                typeof marker.files !== "object"
            )
                return null;
            for (const [file, size] of Object.entries(marker.files)) {
                const metadata = await fs.lstat(join(workspace, ...dotNetPackageRelativePath(file).split("/")));
                if (!metadata.isFile() || metadata.size !== size) return null;
            }
            return marker;
        } catch {
            return null;
        }
    }

    private async fetchPackage(request: DotNetToolPreparationRequest, packageId: string, packageVersion: string, signal: AbortSignal): Promise<Buffer> {
        if (request.source.kind === "local-feed") {
            const expectedName = `${packageId}.${packageVersion}.nupkg`;
            const feed = request.source.path;
            const name = (await fs.readdir(feed).catch(() => [] as string[])).find((entry) => entry.toLowerCase() === expectedName);
            if (!name) throw new DotNetToolPreparationError("PACKAGE_NOT_FOUND", undefined, `${expectedName} was not found in the local feed`);
            const file = join(feed, name);
            const metadata = await fs.stat(file);
            if (!metadata.isFile() || metadata.size > DOTNET_PACKAGE_LIMITS.maxPackageBytes) throw dotNetPackageInvalid("Local package is not a file or is too large");
            return fs.readFile(file);
        }
        const url = dotNetNuGetPackageUrl(packageId, packageVersion);
        if (this.dependencies.download) return this.dependencies.download(url, signal);
        return downloadDotNetPackage(url, { agentForUrl: this.dependencies.agentForUrl, signal });
    }

    private async verifyNuspec(directory: string, packageId: string, packageVersion: string): Promise<void> {
        const text = await readText(join(directory, `${packageId}.nuspec`), "Package has no nuspec");
        let nuspec;
        try {
            nuspec = parseDotNetPackageXml(text);
        } catch (error) {
            throw dotNetPackageInvalid(`Package nuspec could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
        }
        const metadata = nuspec.children.filter((node) => node.name === "metadata");
        const value = (name: string): string | undefined => {
            const nodes = metadata[0]?.children.filter((node) => node.name === name);
            return nodes?.length === 1 && !nodes[0].children.length ? nodes[0].text.trim() : undefined;
        };
        const id = value("id");
        const version = value("version");
        let normalizedVersion: string | undefined;
        try {
            normalizedVersion = version ? normalizeDotNetNuGetVersion(version) : undefined;
        } catch {
            normalizedVersion = undefined;
        }
        if (nuspec.name !== "package" || metadata.length !== 1 || id?.toLowerCase() !== packageId || normalizedVersion !== packageVersion) {
            throw dotNetPackageInvalid(`Package nuspec identity ${id ?? "?"} ${version ?? "?"} does not match ${packageId} ${packageVersion}`);
        }
        const packageTypes = metadata[0].children.filter((node) => node.name === "packageTypes").flatMap((node) => node.children.filter((child) => child.name === "packageType"));
        if (!packageTypes.some((node) => node.attributes.name?.toLowerCase() === "dotnettool")) {
            throw dotNetPackageInvalid("Package is not a .NET tool package (PackageType DotnetTool); build it with PackAsTool=true");
        }
    }

    private async verifyLayout(workspace: string, request: DotNetToolPreparationRequest): Promise<{ entryPoint: string; runtimeConfigPath: string; depsPath: string }> {
        try {
            const { declaration, selection } = request;
            const targetFramework = declaration.dotnet.targetFramework;
            const artifactRoot = join(workspace, "tools", targetFramework, "any");
            if (!(await isDirectory(artifactRoot))) {
                const available = await fs.readdir(join(workspace, "tools")).catch(() => [] as string[]);
                throw dotNetPackageInvalid(`Package has no tools/${targetFramework}/any folder${available.length ? ` (found: ${available.join(", ")})` : ""}`);
            }
            const entryRelative = dotNetToolSettings(await readText(join(artifactRoot, "DotnetToolSettings.xml"), "DotnetToolSettings.xml is missing"), declaration.command);
            const entryPoint = join(artifactRoot, ...entryRelative.split("/"));
            if (!(await isFile(entryPoint))) throw dotNetPackageInvalid(`Entry point ${entryRelative} is missing from the package`);
            const base = entryPoint.slice(0, -4);
            const runtimeConfigPath = `${base}.runtimeconfig.json`;
            const depsPath = `${base}.deps.json`;
            if (await isFile(`${base}.runtimeconfig.dev.json`)) throw dotNetPackageInvalid("Development runtimeconfig.dev.json files are not supported");
            verifyDotNetRuntimeConfig(await readText(runtimeConfigPath, "Entry point runtimeconfig.json is missing"), declaration, selection);
            await this.verifyDependencies(await readText(depsPath, "Entry point deps.json is missing"), artifactRoot, entryPoint, targetFramework, selection.nativeRid);
            return { entryPoint, runtimeConfigPath, depsPath };
        } catch (error) {
            throw asPreparationError(error, "PACKAGE_INVALID");
        }
    }

    private async verifyDependencies(text: string, artifactRoot: string, entryPoint: string, targetFramework: string, nativeRid: string): Promise<void> {
        let deps;
        try {
            deps = JSON.parse(text);
        } catch {
            throw dotNetPackageInvalid("deps.json is not valid JSON");
        }
        const targetName = deps?.runtimeTarget?.name;
        if (
            typeof targetName !== "string" ||
            !new RegExp(`^\\.NETCoreApp,Version=v${targetFramework.slice(3).replace(".", "\\.")}(?:/${nativeRid})?$`).test(targetName) ||
            !deps.targets?.[targetName] ||
            !deps.libraries ||
            typeof deps.libraries !== "object"
        )
            throw dotNetPackageInvalid(`deps.json runtime target "${String(targetName)}" does not match ${targetFramework}`);
        let entryFound = false;
        for (const [libraryId, library] of Object.entries(deps.targets[targetName]) as [
            string,
            { runtime?: Record<string, unknown>; native?: Record<string, unknown>; runtimeTargets?: Record<string, unknown>; dependencies?: Record<string, unknown> },
        ][]) {
            const metadata = deps.libraries[libraryId];
            if (libraryId.split("/").length !== 2 || !metadata || !["project", "package", "reference"].includes(metadata.type) || !library || typeof library !== "object") {
                throw dotNetPackageInvalid(`deps.json library "${libraryId}" is invalid`);
            }
            for (const group of [library.runtime, library.native, library.runtimeTargets]) {
                if (group !== undefined && (!group || typeof group !== "object" || Array.isArray(group))) throw dotNetPackageInvalid(`deps.json library "${libraryId}" has an invalid asset group`);
                for (const file of Object.keys(group ?? {})) {
                    if (file === "_._" || file.endsWith("/_._")) continue;
                    try {
                        dotNetPackageRelativePath(file);
                    } catch {
                        throw dotNetPackageInvalid(`deps.json asset "${file}" has an unsafe path`);
                    }
                    const exact = join(artifactRoot, ...file.split("/"));
                    const artifact = (await isFile(exact)) ? exact : join(artifactRoot, file.split("/").at(-1) as string);
                    if (!(await isFile(artifact))) throw dotNetPackageInvalid(`deps.json asset "${file}" is missing from the package`);
                    if (artifact === entryPoint) entryFound = true;
                }
            }
            for (const [dependency, dependencyVersion] of Object.entries(library.dependencies ?? {})) {
                if (typeof dependencyVersion !== "string" || !Object.hasOwn(deps.libraries, `${dependency}/${dependencyVersion}`)) {
                    throw dotNetPackageInvalid(`deps.json dependency ${dependency}/${String(dependencyVersion)} is unresolved`);
                }
            }
        }
        if (!entryFound) throw dotNetPackageInvalid("Entry point is not listed in deps.json");
    }
}
