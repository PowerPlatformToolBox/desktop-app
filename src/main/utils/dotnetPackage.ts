import { createHash } from "crypto";
import { createWriteStream } from "fs";
import * as fs from "fs/promises";
import type { ClientRequest, RequestOptions } from "http";
import * as https from "https";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl";
import { dotNetPackageInvalid, dotNetPackageRelativePath, DotNetToolPreparationError } from "./dotnetToolPreparation";

export const DOTNET_NUGET_FLAT_CONTAINER = "https://api.nuget.org/v3-flatcontainer/";
export const DOTNET_PACKAGE_LIMITS = {
    maxPackageBytes: 256 * 1024 * 1024,
    maxEntries: 10000,
    maxExtractedBytes: 1024 * 1024 * 1024,
    downloadTimeoutMs: 5 * 60 * 1000,
} as const;

export interface DotNetDownloadOptions {
    agentForUrl?(url: string): RequestOptions["agent"];
    signal?: AbortSignal;
    maxBytes?: number;
    timeoutMs?: number;
}

export function dotNetNuGetPackageUrl(packageId: string, normalizedVersion: string): string {
    const id = encodeURIComponent(packageId.toLowerCase());
    const version = encodeURIComponent(normalizedVersion.toLowerCase());
    return `${DOTNET_NUGET_FLAT_CONTAINER}${id}/${version}/${id}.${version}.nupkg`;
}

export function dotNetPackageSha512(bytes: Buffer): string {
    return createHash("sha512").update(bytes).digest("base64");
}

export function downloadDotNetPackage(url: string, options: DotNetDownloadOptions = {}): Promise<Buffer> {
    const maxBytes = options.maxBytes ?? DOTNET_PACKAGE_LIMITS.maxPackageBytes;
    return new Promise((resolve, reject) => {
        let settled = false;
        let request: ClientRequest | undefined;
        const finish = (error: Error | null, value?: Buffer): void => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            options.signal?.removeEventListener("abort", onAbort);
            if (error) {
                request?.destroy();
                reject(error);
            } else resolve(value as Buffer);
        };
        const failed = (details: string): void => finish(new DotNetToolPreparationError("DOWNLOAD_FAILED", undefined, details));
        const onAbort = (): void => finish(new DotNetToolPreparationError("CANCELLED"));
        const deadline = setTimeout(() => failed("Package download timed out"), options.timeoutMs ?? DOTNET_PACKAGE_LIMITS.downloadTimeoutMs);
        const get = (target: URL, redirects: number): void => {
            if (target.protocol !== "https:") return failed("Package downloads require HTTPS");
            try {
                request = https.get(target, { agent: options.agentForUrl?.(target.href), headers: { "User-Agent": "PowerPlatformToolBox" } }, (response) => {
                    const status = response.statusCode ?? 0;
                    if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
                        response.resume();
                        if (redirects >= 5) return failed("Too many redirects while downloading package");
                        let next: URL;
                        try {
                            next = new URL(response.headers.location, target);
                        } catch {
                            return failed("Invalid redirect while downloading package");
                        }
                        return get(next, redirects + 1);
                    }
                    if (status === 404) {
                        response.resume();
                        return finish(new DotNetToolPreparationError("PACKAGE_NOT_FOUND", undefined, `Package not found at ${target.href}`));
                    }
                    if (status !== 200) {
                        response.resume();
                        return failed(`Package download returned HTTP ${status}`);
                    }
                    const declared = Number(response.headers["content-length"]);
                    if (Number.isFinite(declared) && declared > maxBytes) {
                        response.destroy();
                        return finish(dotNetPackageInvalid("Package exceeds the maximum supported size"));
                    }
                    const chunks: Buffer[] = [];
                    let total = 0;
                    response.on("data", (chunk: Buffer) => {
                        total += chunk.length;
                        if (total > maxBytes) {
                            response.destroy();
                            finish(dotNetPackageInvalid("Package exceeds the maximum supported size"));
                            return;
                        }
                        chunks.push(chunk);
                    });
                    response.on("error", (error) => failed(error.message));
                    response.on("end", () => (response.complete ? finish(null, Buffer.concat(chunks, total)) : failed("Package download ended early")));
                });
                request.on("error", (error) => failed(error.message));
            } catch (error) {
                failed(error instanceof Error ? error.message : "Package download failed");
            }
        };
        if (options.signal?.aborted) return onAbort();
        options.signal?.addEventListener("abort", onAbort, { once: true });
        let initial: URL;
        try {
            initial = new URL(url);
        } catch {
            return failed("Invalid package URL");
        }
        get(initial, 0);
    });
}

function decodeEntryName(name: string): string {
    // NuGet percent-escapes some characters in package part names.
    if (!name.includes("%")) return name;
    try {
        return decodeURIComponent(name);
    } catch {
        throw dotNetPackageInvalid(`Package entry "${name}" has an invalid escaped name`);
    }
}

function openZip(bytes: Buffer): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (error, zip) => {
            if (error || !zip) reject(dotNetPackageInvalid(`Package is not a valid ZIP archive: ${error?.message ?? "unknown error"}`));
            else resolve(zip);
        });
    });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
    return new Promise((resolve, reject) => {
        zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) reject(dotNetPackageInvalid(`Package entry "${entry.fileName}" could not be read`));
            else resolve(stream);
        });
    });
}

/**
 * Extracts the nuspec and `tools/**` from a .NET tool package. Returns the extracted package-relative paths.
 */
export async function extractDotNetToolPackage(bytes: Buffer, packageId: string, destination: string, signal?: AbortSignal): Promise<string[]> {
    const zip = await openZip(bytes);
    const nuspecName = `${packageId.toLowerCase()}.nuspec`;
    const seen = new Set<string>();
    const extracted: string[] = [];
    let entries = 0;
    let totalBytes = 0;
    const extractEntry = async (entry: yauzl.Entry): Promise<void> => {
        if (signal?.aborted) throw new DotNetToolPreparationError("CANCELLED");
        if (++entries > DOTNET_PACKAGE_LIMITS.maxEntries) throw dotNetPackageInvalid("Package contains too many entries");
        if (entry.fileName.endsWith("/")) return;
        const name = decodeEntryName(entry.fileName);
        const isNuspec = name.toLowerCase() === nuspecName;
        if (!isNuspec && !name.startsWith("tools/")) return;
        let relativePath: string;
        try {
            relativePath = dotNetPackageRelativePath(name);
        } catch {
            throw dotNetPackageInvalid(`Package entry "${name}" has an unsafe path`);
        }
        if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) {
            throw dotNetPackageInvalid(`Package entry "${name}" is a symbolic link`);
        }
        const key = relativePath.toLowerCase();
        if (seen.has(key)) throw dotNetPackageInvalid(`Package contains duplicate entry "${name}"`);
        seen.add(key);
        totalBytes += entry.uncompressedSize;
        if (totalBytes > DOTNET_PACKAGE_LIMITS.maxExtractedBytes) throw dotNetPackageInvalid("Package expands beyond the maximum supported size");
        const outputPath = isNuspec ? nuspecName : relativePath;
        const target = join(destination, ...outputPath.split("/"));
        await fs.mkdir(dirname(target), { recursive: true });
        await pipeline(await openEntry(zip, entry), createWriteStream(target, { flags: "wx" }));
        extracted.push(outputPath);
    };
    try {
        await new Promise<void>((resolve, reject) => {
            let failed = false;
            const fail = (error: unknown): void => {
                if (failed) return;
                failed = true;
                reject(error instanceof DotNetToolPreparationError ? error : dotNetPackageInvalid(`Package extraction failed: ${error instanceof Error ? error.message : String(error)}`));
            };
            zip.on("error", fail);
            zip.on("end", () => {
                if (!failed) resolve();
            });
            zip.on("entry", (entry: yauzl.Entry) => {
                extractEntry(entry).then(() => {
                    if (!failed) zip.readEntry();
                }, fail);
            });
            zip.readEntry();
        });
    } finally {
        zip.close();
    }
    return extracted;
}
