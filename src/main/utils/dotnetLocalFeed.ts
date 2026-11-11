import { createHash } from "crypto";
import * as fs from "fs";
import { join, parse, relative, resolve, sep } from "path";
import type { NormalizedWorkerDeclaration } from "../../common/types/tool";
import { DOTNET_NUGET_ORG_SOURCE, type DotNetPackageSource } from "../../common/types/dotnetTool";
import { dotNetHasControlCharacters, normalizeDotNetNuGetVersion } from "./dotnetToolPreparation";

const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;
export const DOTNET_LOCAL_NUGET_FEED_ENV = "PPTB_DOTNET_LOCAL_NUGET_FEED" as const;

export class DotNetPackageSourceError extends Error {
    constructor(readonly code: "PACKAGED_BUILD" | "FEED_DIRECTORY_INVALID" | "PACKAGE_MISSING" | "PACKAGE_INVALID") {
        super(`DotNet package source unavailable: ${code}`);
        this.name = "DotNetPackageSourceError";
    }
}

export function validateDotNetLocalFeedDirectory(feedPath: string): string {
    if (typeof feedPath !== "string" || !feedPath || !fs.existsSync(feedPath) || resolve(feedPath) !== feedPath || dotNetHasControlCharacters(feedPath)) {
        throw new DotNetPackageSourceError("FEED_DIRECTORY_INVALID");
    }
    try {
        const root = parse(feedPath).root;
        let current = root;
        for (const component of relative(root, feedPath).split(sep).filter(Boolean)) {
            current = join(current, component);
            const metadata = fs.lstatSync(current);
            if (metadata.isSymbolicLink() || !metadata.isDirectory() || fs.realpathSync(current) !== current) throw new Error("Feed path contains a link");
        }
        const directory = fs.lstatSync(feedPath);
        if (!directory.isDirectory() || fs.realpathSync(feedPath) !== feedPath) throw new Error("Feed path is not canonical");
        const entries = fs.readdirSync(feedPath);
        if (entries.length > 10000) throw new Error("Feed contains too many entries");
        for (const name of entries) {
            const entryPath = join(feedPath, name);
            const entry = fs.lstatSync(entryPath);
            if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || fs.realpathSync(entryPath) !== entryPath) throw new Error("Feed must be flat and contain only regular files");
        }
        return feedPath;
    } catch {
        throw new DotNetPackageSourceError("FEED_DIRECTORY_INVALID");
    }
}

export function resolveDotNetLocalFeedPath(environment: NodeJS.ProcessEnv, isPackaged: boolean, isDeveloperBuild: boolean): string | null {
    const feedPath = environment[DOTNET_LOCAL_NUGET_FEED_ENV];
    if (feedPath === undefined) return null;
    if (isPackaged || !isDeveloperBuild) throw new DotNetPackageSourceError("PACKAGED_BUILD");
    return validateDotNetLocalFeedDirectory(feedPath);
}

function packageSha512(filePath: string): string {
    let descriptor: number | undefined;
    try {
        const before = fs.lstatSync(filePath);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size <= 0 || before.size > MAX_PACKAGE_BYTES || fs.realpathSync(filePath) !== filePath) {
            throw new Error("Invalid package file");
        }
        descriptor = fs.openSync(filePath, "r");
        const openedBefore = fs.fstatSync(descriptor);
        if (openedBefore.dev !== before.dev || openedBefore.ino !== before.ino || openedBefore.size !== before.size) throw new Error("Package changed while opening");
        const hash = createHash("sha512");
        const buffer = Buffer.alloc(64 * 1024);
        let position = 0;
        while (position < openedBefore.size) {
            const bytesRead = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, openedBefore.size - position), position);
            if (!bytesRead) throw new Error("Package changed while hashing");
            hash.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        const openedAfter = fs.fstatSync(descriptor);
        const after = fs.lstatSync(filePath);
        if (
            position !== openedBefore.size ||
            openedAfter.dev !== openedBefore.dev ||
            openedAfter.ino !== openedBefore.ino ||
            openedAfter.size !== openedBefore.size ||
            openedAfter.mtimeMs !== openedBefore.mtimeMs ||
            after.dev !== before.dev ||
            after.ino !== before.ino ||
            after.size !== before.size ||
            after.mtimeMs !== before.mtimeMs
        )
            throw new Error("Package changed while hashing");
        return hash.digest("base64");
    } catch {
        throw new DotNetPackageSourceError("PACKAGE_INVALID");
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

export function resolveDotNetPackageSource(feedPath: string | null, declaration: NormalizedWorkerDeclaration, isPackaged: boolean, isDeveloperBuild: boolean): DotNetPackageSource {
    if (feedPath === null) return { kind: "nuget.org", url: DOTNET_NUGET_ORG_SOURCE };
    if (isPackaged || !isDeveloperBuild) throw new DotNetPackageSourceError("PACKAGED_BUILD");
    const directory = validateDotNetLocalFeedDirectory(feedPath);
    const expectedName = `${declaration.packageId}.${normalizeDotNetNuGetVersion(declaration.packageVersion)}.nupkg`.toLowerCase();
    try {
        const matching = fs.readdirSync(directory).filter((name) => name.toLowerCase() === expectedName);
        if (!matching.length) throw new DotNetPackageSourceError("PACKAGE_MISSING");
        if (matching.length !== 1) throw new DotNetPackageSourceError("PACKAGE_INVALID");
        const packagePath = join(directory, matching[0]);
        const packageFile = fs.lstatSync(packagePath);
        if (!packageFile.isFile() || packageFile.isSymbolicLink()) throw new DotNetPackageSourceError("PACKAGE_INVALID");
        return { kind: "local-feed", path: directory, packageSha512: packageSha512(packagePath) };
    } catch (error) {
        if (error instanceof DotNetPackageSourceError) throw error;
        throw new DotNetPackageSourceError("PACKAGE_MISSING");
    }
}

export function dotNetLocalPackagePath(source: DotNetPackageSource, declaration: NormalizedWorkerDeclaration): string | null {
    if (source.kind !== "local-feed") return null;
    return join(source.path, `${declaration.packageId}.${normalizeDotNetNuGetVersion(declaration.packageVersion)}.nupkg`);
}
