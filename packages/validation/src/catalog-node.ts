import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BUNDLED_CAPABILITY_CATALOG, parseCapabilityCatalog, type CapabilityCatalog } from "./capabilities";

export interface CatalogResolution {
    catalog: CapabilityCatalog;
    source: "live" | "cache" | "bundled";
    fetchedAt?: string;
    warnings: string[];
}

export interface ResolveCatalogOptions {
    url?: string;
    offline?: boolean;
    requireLive?: boolean;
    cacheDirectory?: string;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown): boolean {
    return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

/** Read only the catalog setting; process.env takes precedence, including an explicit empty value. */
export async function readCatalogUrl(cwd: string, environment: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
    if (environment.PPTB_CAPABILITY_CATALOG_URL !== undefined) return environment.PPTB_CAPABILITY_CATALOG_URL.trim() || undefined;
    let content: string;
    try {
        content = await fs.readFile(path.join(cwd, ".env"), "utf8");
    } catch (error) {
        if (isMissingFile(error)) return undefined;
        throw error;
    }
    let result: string | undefined;
    for (const line of content.split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?PPTB_CAPABILITY_CATALOG_URL\s*=\s*(.*?)\s*$/.exec(line);
        if (!match) continue;
        const value = match[1];
        if (value.startsWith('"') || value.startsWith("'")) {
            const quoted = /^(["'])(.*?)\1\s*(?:#.*)?$/.exec(value);
            if (!quoted) throw new Error("Invalid quoted PPTB_CAPABILITY_CATALOG_URL in .env");
            result = quoted[2].trim() || undefined;
        } else {
            result = value.replace(/\s+#.*$/, "").trim() || undefined;
        }
    }
    return result;
}

export async function resolveCapabilityCatalog(options: ResolveCatalogOptions = {}): Promise<CatalogResolution> {
    if (options.offline && options.requireLive) throw new Error("--offline and --require-live cannot be combined");
    const warnings: string[] = [];
    let url: string | undefined;
    if (options.url) {
        const parsed = new URL(options.url);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
            throw new Error("PPTB_CAPABILITY_CATALOG_URL must be an HTTPS URL without credentials or a fragment");
        }
        url = parsed.href;
    }
    if (options.requireLive && !url) throw new Error("Live capability validation requires PPTB_CAPABILITY_CATALOG_URL");
    const cacheFile = url ? path.join(options.cacheDirectory ?? path.join(os.homedir(), ".pptb", "cache", "capabilities"), `${createHash("sha256").update(url).digest("hex")}.json`) : undefined;
    if (url && !options.offline) {
        let catalog: CapabilityCatalog | undefined;
        try {
            const response = await fetch(url, { headers: { Accept: "application/json", "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000), redirect: "error" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            catalog = parseCapabilityCatalog(await response.json());
        } catch (error) {
            if (options.requireLive) throw new Error(`Live capability catalog unavailable: ${errorMessage(error)}`);
            warnings.push(`Live capability catalog unavailable: ${errorMessage(error)}`);
        }
        if (catalog && cacheFile) {
            const fetchedAt = new Date().toISOString();
            try {
                await fs.mkdir(path.dirname(cacheFile), { recursive: true });
                await fs.writeFile(cacheFile, JSON.stringify({ url, fetchedAt, catalog }), "utf8");
            } catch (error) {
                warnings.push(`Could not persist capability catalog cache: ${errorMessage(error)}`);
            }
            return { catalog, source: "live", fetchedAt, warnings };
        }
    }
    if (cacheFile) {
        try {
            const cached: unknown = JSON.parse(await fs.readFile(cacheFile, "utf8"));
            if (cached === null || typeof cached !== "object" || !("url" in cached) || cached.url !== url || !("catalog" in cached) || !("fetchedAt" in cached)) {
                throw new Error("Invalid capability cache envelope");
            }
            if (typeof cached.fetchedAt !== "string" || !Number.isFinite(Date.parse(cached.fetchedAt))) throw new Error("Invalid capability cache timestamp");
            const catalog = parseCapabilityCatalog(cached.catalog);
            warnings.push("Using last-known-good capability catalog; current registry approval is not verified.");
            return { catalog, source: "cache", fetchedAt: cached.fetchedAt, warnings };
        } catch (error) {
            if (!isMissingFile(error)) warnings.push(`Could not read capability catalog cache: ${errorMessage(error)}`);
        }
    }
    warnings.push(`${url ? "No usable cached catalog." : "PPTB_CAPABILITY_CATALOG_URL is not configured."} Using bundled capability snapshot; current registry approval is not verified.`);
    return { catalog: BUNDLED_CAPABILITY_CATALOG, source: "bundled", warnings };
}
