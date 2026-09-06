import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "events";
import * as fs from "fs";
import { createWriteStream } from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { pipeline } from "stream/promises";
import { logError, logInfo, logWarn } from "../../common/logger";
import { captureException } from "../../common/sentryHelper";
import { CapabilityTagEntry, CommunityLinksCollection, CommunityLinksGroup, CommunityLinksItem, MarketplaceSource, ToolManifest, ToolRegistryEntry } from "../../common/types";
import { AZURE_BLOB_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "../constants";
import { loadOfflineMockRegistryTools, OfflineMockRegistryTool } from "../utilities/mockRegistry";
import { InstallIdManager } from "./installIdManager";

/**
 * Supabase database types
 */
interface SupabaseCategoryRow {
    categories?: {
        name?: string;
    };
}

interface SupabaseContributorRow {
    contributors?: {
        name?: string;
        profile_url?: string;
    };
}

interface SupabaseAnalyticsRow {
    downloads?: number;
    rating?: number;
    mau?: number; // Monthly Active Users
}

interface SupabaseMaturityRow {
    status?: string;
}

export function getSupabaseMaturityStatus(relation: SupabaseMaturityRow | SupabaseMaturityRow[] | undefined): string | undefined {
    return (Array.isArray(relation) ? relation[0] : relation)?.status;
}

function getOptionalAnalyticsNumber(value: number | null | undefined): number | undefined {
    return typeof value === "number" ? value : undefined;
}

interface SupabaseCategoryRow {
    categories?: {
        name?: string;
    };
}

interface SupabaseContributorRow {
    contributors?: {
        name?: string;
        profile_url?: string;
    };
}

interface SupabaseAnalyticsRow {
    downloads?: number;
    rating?: number;
    mau?: number; // Monthly Active Users
}

interface SupabaseTool {
    id: string;
    packagename?: string;
    name: string;
    description: string;
    download?: string; // new Azure Blob download URL (used by app v1.2+)
    downloadurl: string; // legacy download URL (used by app v1.1.3 and older)
    icon?: string; // New column for SVG icon URLs (GitHub Release URL)
    iconurl: string; // Legacy column, kept for backward compatibility
    readmeurl?: string;
    version?: string;
    checksum?: string;
    size?: string; // stored as text in schema
    published_at?: string;
    created_at?: string;
    csp_exceptions?: unknown;
    features?: unknown; // JSON column for tool features
    license?: string;
    status?: string; // Tool lifecycle status: active, deprecated, archived
    repository?: string;
    website?: string;
    min_api?: string; // Minimum ToolBox API version required
    tool_maturity?: SupabaseMaturityRow | SupabaseMaturityRow[];
    tool_categories?: SupabaseCategoryRow[];
    tool_contributors?: SupabaseContributorRow[];
    tool_analytics?: SupabaseAnalyticsRow | SupabaseAnalyticsRow[]; // sometimes array depending on RLS / joins
}

interface AzureBlobRegistryFile {
    tools?: Array<
        OfflineMockRegistryTool & {
            downloadurl?: string;
            readmeurl?: string;
            website?: string;
            published_at?: string;
            authors?: string[] | string;
        }
    >;
}

/**
 * Supabase community_links table row
 */
interface SupabaseCommunityLink {
    id: string;
    group_id: string;
    group_title: string;
    label: string;
    url: string;
    sort_order: number;
    is_active: boolean;
}

/**
 * Supabase capability_tags table row
 */
interface SupabaseCapabilityTagRow {
    tag: string;
    description: string;
}

/**
 * Built-in fallback capability tags used when Supabase is unreachable.
 * The authoritative list is stored in the Supabase `capability_tags` table and
 * fetched at startup; this list ensures the app always has a baseline set of
 * known tags so tools can be validated even in an offline scenario.
 *
 * **Keep in sync with `KNOWN_CAPABILITY_TAGS` in `packages/lib/validate.js`.**
 * Since the validator is a standalone Node.js CLI that cannot import from the
 * Electron/TypeScript source tree, both lists must be updated together whenever
 * new tags are added to the Supabase `capability_tags` table.
 */
const BUILT_IN_CAPABILITY_TAGS: CapabilityTagEntry[] = [
    { tag: "fetchxml", description: "Accept or process FetchXML queries" },
    { tag: "entity-picker", description: "Browse and select a Dataverse entity (table)" },
    { tag: "record-selector", description: "Browse and select a Dataverse record" },
    { tag: "solution-selector", description: "Pick a Power Platform solution" },
    { tag: "webresource-editor", description: "Edit or manage web resources" },
    { tag: "plugin-inspector", description: "Inspect or manage plugins and assemblies" },
    { tag: "pcf-control-builder", description: "Build or scaffold PCF controls" },
];

/**
 * Manages tool installation from a registry (marketplace)
 * Registry for discovering and managing tool installations
 */
export class ToolRegistryManager extends EventEmitter {
    private toolsDirectory: string;
    private manifestPath: string;
    private supabase: SupabaseClient | null = null;
    private useLocalFallback: boolean = false;
    private installIdManager: InstallIdManager | null = null;
    private azureBlobBaseUrl: string;
    private settingsManager: { getMarketplaceSources(): MarketplaceSource[] } | null = null;

    // Registry fetch de-duping + caching
    private registryFetchInFlight: Promise<ToolRegistryEntry[]> | null = null;
    private registryCache: {
        tools: ToolRegistryEntry[];
        fetchedAtMs: number;
        source: "supabase" | "azureBlob" | "local";
    } | null = null;

    // Capability tags cache (fetched from Supabase `capability_tags` table)
    private capabilityTagsCache: CapabilityTagEntry[] | null = null;
    private capabilityTagsFetchedAtMs = 0;

    // Multiple renderer modules request the registry during startup (homepage stats, marketplace, etc.).
    // Keep this short so the marketplace stays fresh, but long enough to prevent thrash.
    private static readonly REGISTRY_CACHE_TTL_MS = 30_000;

    // Capability tags change rarely; use a longer TTL so the fetch happens at most once per session.
    private static readonly CAPABILITY_TAGS_CACHE_TTL_MS = 300_000; // 5 minutes

    constructor(
        toolsDirectory: string,
        supabaseUrl?: string,
        supabaseKey?: string,
        installIdManager?: InstallIdManager,
        azureBlobBaseUrl?: string,
        settingsManager?: { getMarketplaceSources(): MarketplaceSource[] },
    ) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.manifestPath = path.join(toolsDirectory, "manifest.json");
        this.installIdManager = installIdManager || null;
        this.azureBlobBaseUrl = azureBlobBaseUrl || AZURE_BLOB_BASE_URL;
        this.settingsManager = settingsManager || null;

        // Initialize Supabase client
        const url = supabaseUrl || SUPABASE_URL;
        const key = supabaseKey || SUPABASE_ANON_KEY;
        const useTestRegistry = process.env.PPTB_TEST_MODE === "1" && !!process.env.PPTB_TEST_REGISTRY_PATH;

        // Validate Supabase credentials and create client
        if (useTestRegistry || !url || !key || url === "" || key === "") {
            logWarn("[ToolRegistry] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
            logWarn("[ToolRegistry] Falling back to local registry.json file.");
            this.useLocalFallback = true;
        } else {
            logInfo("[ToolRegistry] Initializing Supabase client");
            this.supabase = createClient(url, key);
        }

        this.ensureToolsDirectory();
    }

    /**
     * Ensure the tools directory exists
     */
    private ensureToolsDirectory(): void {
        if (!fs.existsSync(this.toolsDirectory)) {
            fs.mkdirSync(this.toolsDirectory, { recursive: true });
        }
    }

    /**
     * Fetch the tool registry from Supabase database or local fallback
     */
    async fetchRegistry(): Promise<ToolRegistryEntry[]> {
        const now = Date.now();

        // Serve from cache when still fresh
        if (this.registryCache && now - this.registryCache.fetchedAtMs < ToolRegistryManager.REGISTRY_CACHE_TTL_MS) {
            return this.registryCache.tools;
        }

        // If a fetch is already running, await it instead of starting another one.
        if (this.registryFetchInFlight) {
            return this.registryFetchInFlight;
        }

        this.registryFetchInFlight = (async () => {
            const tools = await this.fetchRegistryFromConfiguredSources();
            this.registryCache = {
                tools,
                fetchedAtMs: Date.now(),
                source: "supabase",
            };
            return tools;
        })();

        try {
            return await this.registryFetchInFlight;
        } finally {
            this.registryFetchInFlight = null;
        }
    }

    private async fetchRegistryFromConfiguredSources(): Promise<ToolRegistryEntry[]> {
        const configuredSources = this.settingsManager?.getMarketplaceSources() ?? [];
        const enabledSources = configuredSources.filter((source) => source.enabled);

        if (enabledSources.length === 0) {
            return [];
        }

        const mergedTools = new Map<string, ToolRegistryEntry>();

        for (const source of enabledSources) {
            const tools = source.type === "builtin" ? await this.fetchBuiltinRegistryForSource(source) : await this.fetchRegistryFromMarketplaceUrl(source);
            tools.forEach((tool) => {
                const existingTool = mergedTools.get(tool.id);
                const shouldOverride = !existingTool || source.type === "private" || existingTool.marketplaceSourceType !== "private";
                if (!shouldOverride) {
                    return;
                }

                mergedTools.set(tool.id, {
                    ...tool,
                    marketplaceSourceId: source.id,
                    marketplaceSourceLabel: source.label,
                    marketplaceSourceType: source.type,
                });
            });
        }

        return Array.from(mergedTools.values());
    }

    private async fetchBuiltinRegistryForSource(_: MarketplaceSource): Promise<ToolRegistryEntry[]> {
        if (this.useLocalFallback) {
            return this.fetchFallbackRegistry();
        }

        try {
            return await this.fetchRegistryFromSupabase();
        } catch (error) {
            logWarn(`[ToolRegistry] Built-in marketplace fetch failed, falling back to local/azure registry`, error);
            return this.fetchFallbackRegistry();
        }
    }

    private async fetchRegistryFromMarketplaceUrl(source: MarketplaceSource): Promise<ToolRegistryEntry[]> {
        if (!source.url) {
            logWarn(`[ToolRegistry] Marketplace source ${source.id} is missing a URL`);
            return [];
        }

        try {
            const registryUrl = source.url;
            logInfo(`[ToolRegistry] Fetching registry from marketplace source ${source.id}: ${registryUrl}`);

            const rawJson = await new Promise<string>((resolve, reject) => {
                const protocol = registryUrl.startsWith("https") ? https : http;
                protocol
                    .get(registryUrl, (res) => {
                        if (res.statusCode !== 200) {
                            reject(new Error(`Marketplace registry request failed: HTTP ${res.statusCode} for ${registryUrl}`));
                            return;
                        }
                        const chunks: Buffer[] = [];
                        res.on("data", (chunk: Buffer) => chunks.push(chunk));
                        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
                        res.on("error", reject);
                    })
                    .on("error", reject);
            });

            let registryData: AzureBlobRegistryFile;
            try {
                registryData = JSON.parse(rawJson) as AzureBlobRegistryFile;
            } catch (parseError) {
                throw new Error(`Failed to parse registry JSON from ${registryUrl}: ${(parseError as Error).message}`);
            }

            if (!registryData.tools || registryData.tools.length === 0) {
                logInfo(`[ToolRegistry] No tools found in marketplace source ${source.id}`);
                return [];
            }

            return registryData.tools
                .filter((tool) => tool.status === "active" || tool.status === "deprecated" || !tool.status)
                .map((tool) => ({
                    id: tool.id,
                    name: tool.name,
                    description: tool.description,
                    authors: this.normalizeAuthorList(tool.authors),
                    version: tool.version,
                    downloadUrl: this.resolveDownloadUrl(tool.downloadUrl || tool.downloadurl || "", registryUrl),
                    checksum: tool.checksum,
                    size: tool.size,
                    publishedAt: tool.publishedAt || tool.published_at || new Date().toISOString(),
                    repository: tool.repository,
                    website: tool.homepage || tool.website,
                    icon: tool.icon,
                    cspExceptions: tool.cspExceptions,
                    features: tool.features,
                    license: tool.license,
                    status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
                    maturity: tool.maturity,
                    marketplaceSourceId: source.id,
                    marketplaceSourceLabel: source.label,
                    marketplaceSourceType: source.type,
                }));
        } catch (error) {
            logWarn(`[ToolRegistry] Failed to fetch marketplace source ${source.id}`, error);
            return [];
        }
    }

    private async fetchRegistryFromSupabase(): Promise<ToolRegistryEntry[]> {
        try {
            logInfo(`[ToolRegistry] Fetching registry from Supabase (new schema)`);

            const selectColumns = [
                "id",
                "packagename",
                "name",
                "description",
                "download",
                "downloadurl",
                "icon",
                "iconurl",
                "readmeurl",
                "version",
                "checksum",
                "size",
                "published_at",
                "created_at",
                "license",
                "csp_exceptions",
                "features",
                "status",
                "repository",
                "website",
                "min_api",
                // embedded relations
                "tool_maturity(status)",
                "tool_categories(categories(name))",
                "tool_contributors(contributors(name,profile_url))",
                "tool_analytics(downloads,rating,mau)",
            ].join(", ");

            if (!this.supabase) {
                throw new Error("Supabase client is not initialized");
            }
            const { data: toolsData, error } = await this.supabase.from("tools").select(selectColumns).in("status", ["active", "deprecated"]).order("name", { ascending: true });

            if (error) {
                throw new Error(`Supabase query failed: ${error.message}`);
            }

            if (!toolsData || toolsData.length === 0) {
                logInfo(`[ToolRegistry] No tools found in registry`);
                return [];
            }

            // toolsData typing from supabase-js is loose; coerce via unknown first to satisfy TS
            const tools: ToolRegistryEntry[] = (toolsData as unknown as SupabaseTool[]).map((tool) => {
                const categories = (tool.tool_categories || []).map((row) => row.categories?.name?.trim()).filter((n): n is string => !!n);
                const contributors = (tool.tool_contributors || []).map((row) => row.contributors?.name?.trim()).filter((n): n is string => !!n);
                let downloads: number | undefined;
                let rating: number | undefined;
                let mau: number | undefined;
                if (tool.tool_analytics) {
                    const analytics = Array.isArray(tool.tool_analytics) ? tool.tool_analytics[0] : tool.tool_analytics;
                    downloads = getOptionalAnalyticsNumber(analytics?.downloads);
                    rating = getOptionalAnalyticsNumber(analytics?.rating);
                    mau = getOptionalAnalyticsNumber(analytics?.mau);
                }

                return {
                    id: tool.id,
                    name: tool.name,
                    description: tool.description,
                    authors: contributors,
                    version: tool.version || "1.0.0",
                    downloadUrl: tool.download || tool.downloadurl,
                    icon: tool.icon || tool.iconurl, // Prefer new 'icon' column, fallback to 'iconurl' for backward compatibility
                    readmeUrl: tool.readmeurl,
                    repository: tool.repository,
                    website: tool.website,
                    publishedAt: tool.published_at || new Date().toISOString(),
                    createdAt: tool.created_at || new Date().toISOString(),
                    checksum: tool.checksum,
                    size: tool.size ? Number(tool.size) || undefined : undefined,
                    categories: categories,
                    cspExceptions: (tool.csp_exceptions as Record<string, unknown> | undefined) || undefined,
                    features: (tool.features as Record<string, unknown> | undefined) || undefined,
                    license: tool.license,
                    downloads,
                    rating,
                    mau,
                    status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
                    minAPI: tool.min_api, // Include min API version from database
                    npmPackageName: tool.packagename || undefined, // npm package name for pre-release detection
                    maturity: getSupabaseMaturityStatus(tool.tool_maturity),
                } as ToolRegistryEntry;
            });

            logInfo(`[ToolRegistry] Fetched ${tools.length} tools (enhanced) from Supabase registry`);
            return tools;
        } catch (error) {
            logError("[ToolRegistry] Failed to fetch registry from Supabase", error);
            throw new Error(`Failed to fetch registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch the tool registry from Azure Blob Storage or local JSON file.
     * Azure Blob is tried first (when configured), then the local registry.json.
     */
    private async fetchFallbackRegistry(): Promise<ToolRegistryEntry[]> {
        if (process.env.PPTB_TEST_MODE === "1" && process.env.PPTB_TEST_REGISTRY_PATH) {
            return this.fetchLocalRegistry();
        }

        if (this.azureBlobBaseUrl) {
            try {
                const tools = await this.fetchAzureBlobRegistry();
                if (tools.length > 0) {
                    return tools;
                }
            } catch (error) {
                logWarn(`[ToolRegistry] Azure Blob registry fetch failed`);
            }
        }
        return this.fetchLocalRegistry();
    }

    /**
     * Fetch the tool registry from an Azure Blob Storage container.
     * Expects a registry.json file at <azureBlobBaseUrl>/registry.json with the
     * same shape as the local registry.json fallback file.
     */
    private async fetchAzureBlobRegistry(): Promise<ToolRegistryEntry[]> {
        const registryUrl = `${this.azureBlobBaseUrl}/registry.json`;
        logInfo(`[ToolRegistry] Fetching registry from Azure Blob: ${registryUrl}`);

        const rawJson = await new Promise<string>((resolve, reject) => {
            const protocol = registryUrl.startsWith("https") ? https : http;
            protocol
                .get(registryUrl, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Azure Blob registry request failed: HTTP ${res.statusCode} for ${registryUrl}`));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => chunks.push(chunk));
                    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
                    res.on("error", reject);
                })
                .on("error", reject);
        });

        let registryData: AzureBlobRegistryFile;
        try {
            registryData = JSON.parse(rawJson) as AzureBlobRegistryFile;
        } catch (parseError) {
            throw new Error(`Failed to parse Azure Blob registry.json from ${registryUrl}: ${(parseError as Error).message}`);
        }

        if (!registryData.tools || registryData.tools.length === 0) {
            logInfo(`[ToolRegistry] No tools found in Azure Blob registry`);
            return [];
        }

        const tools: ToolRegistryEntry[] = registryData.tools
            .filter((tool) => tool.status === "active" || tool.status === "deprecated" || !tool.status)
            .map((tool) => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                authors: this.normalizeAuthorList(tool.authors),
                version: tool.version,
                downloadUrl: this.resolveDownloadUrl(tool.downloadUrl || tool.downloadurl || ""),
                checksum: tool.checksum,
                size: tool.size,
                publishedAt: tool.publishedAt || tool.published_at || new Date().toISOString(),
                repository: tool.repository,
                website: tool.homepage || tool.website,
                icon: tool.icon,
                cspExceptions: tool.cspExceptions,
                features: tool.features,
                license: tool.license,
                status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
                maturity: tool.maturity,
            }));

        logInfo(`[ToolRegistry] Fetched ${tools.length} tools from Azure Blob registry`);
        return tools;
    }

    /**
     * Resolve a (potentially relative) download URL.
     * If the URL is already absolute (starts with http:// or https://) it is returned as-is.
     * Otherwise it is treated as a filename where the folder is derived by stripping the
     * `.tar.gz` extension from the filename, mirroring the per-tool folder layout used on
     * Azure Blob Storage (e.g. "my-tool-1.0.0.tar.gz" → "<base>/packages/my-tool-1.0.0/my-tool-1.0.0.tar.gz").
     * Returns an empty string when the URL is relative but azureBlobBaseUrl is not configured.
     */
    private resolveDownloadUrl(downloadUrl: string, baseUrl?: string): string {
        if (!downloadUrl) {
            logWarn("[ToolRegistry] Tool entry has no downloadUrl; tool cannot be installed from this registry source");
            return "";
        }
        if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
            return downloadUrl;
        }

        if (baseUrl) {
            try {
                return new URL(downloadUrl, baseUrl).toString();
            } catch {
                // Fall back to the existing behavior below if the URL cannot be resolved.
            }
        }
        // Relative filename – resolve to <base>/packages/<folder>/<filename>
        // where <folder> = filename without the .tar.gz extension
        if (this.azureBlobBaseUrl) {
            const base = this.azureBlobBaseUrl.replace(/\/$/, "");
            const filename = downloadUrl.replace(/^\//, "");
            const folder = filename.replace(/\.tar\.gz$/, "");
            return `${base}/packages/${folder}/${filename}`;
        }
        // No base URL configured – cannot resolve
        logWarn(`[ToolRegistry] Cannot resolve relative download URL "${downloadUrl}": AZURE_BLOB_BASE_URL is not configured`);
        return "";
    }

    /**
     * Fetch the tool registry from the local registry.json file
     */
    private async fetchLocalRegistry(): Promise<ToolRegistryEntry[]> {
        try {
            const { tools: localTools, sourcePath } = loadOfflineMockRegistryTools();

            if (sourcePath) {
                logInfo(`[ToolRegistry] Fetching registry via mock utility from: ${sourcePath}`);
            } else {
                logWarn("[ToolRegistry] Offline mock registry source could not be resolved by utility");
            }

            if (!localTools.length) {
                logInfo("[ToolRegistry] No tools available from utility-managed offline mock registry");
                return [];
            }

            const tools: ToolRegistryEntry[] = this.mapLocalRegistryTools(localTools);

            logInfo(`[ToolRegistry] Fetched ${tools.length} tools from local registry`);
            return tools;
        } catch (error) {
            logError("[ToolRegistry] Failed to fetch local registry", error);
            throw new Error(`Failed to fetch local registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Normalize local-registry rows into runtime tool entries.
     */
    private mapLocalRegistryTools(localTools: OfflineMockRegistryTool[]): ToolRegistryEntry[] {
        return localTools
            .filter((tool) => tool.status === "active" || tool.status === "deprecated" || !tool.status)
            .map((tool) => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                authors: this.normalizeAuthorList(tool.authors),
                version: tool.version,
                icon: tool.icon,
                downloadUrl: this.resolveDownloadUrl(tool.downloadUrl),
                checksum: tool.checksum,
                size: tool.size,
                publishedAt: tool.publishedAt || new Date().toISOString(),
                tags: tool.tags,
                readme: tool.readme,
                repository: tool.repository,
                website: tool.homepage,
                cspExceptions: tool.cspExceptions,
                features: tool.features,
                license: tool.license,
                status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
                minAPI: tool.minAPI,
                maturity: tool.maturity,
            }));
    }

    /**
     * Normalize legacy/malformed author values into a string array.
     */
    private normalizeAuthorList(authors: unknown): string[] | undefined {
        if (Array.isArray(authors)) {
            const normalized = authors.filter((a): a is string => typeof a === "string" && a.trim().length > 0);
            return normalized.length ? normalized : undefined;
        }

        if (typeof authors === "string" && authors.trim().length > 0) {
            const splitAuthors = authors
                .split(",")
                .map((a) => a.trim())
                .filter((a) => a.length > 0);
            return splitAuthors.length ? splitAuthors : [authors.trim()];
        }

        return undefined;
    }

    /**
     * Download a tool from the registry
     */
    async downloadTool(tool: ToolRegistryEntry): Promise<string> {
        const toolPath = path.join(this.toolsDirectory, tool.id);
        const downloadPath = path.join(this.toolsDirectory, `${tool.id}.tar.gz`);

        logInfo(`[ToolRegistry] Downloading tool ${tool.id} from ${tool.downloadUrl}`);

        return new Promise((resolve, reject) => {
            const protocol = tool.downloadUrl.startsWith("https") ? https : http;

            protocol
                .get(tool.downloadUrl, (res) => {
                    if (res.statusCode === 302 || res.statusCode === 301) {
                        // Handle redirects
                        const redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            logInfo(`[ToolRegistry] Following redirect to ${redirectUrl}`);
                            const redirectProtocol = redirectUrl.startsWith("https") ? https : http;
                            redirectProtocol
                                .get(redirectUrl, (redirectRes) => {
                                    this.handleDownloadResponse(redirectRes, downloadPath, toolPath, resolve, reject);
                                })
                                .on("error", reject);
                        } else {
                            reject(new Error("Redirect without location header"));
                        }
                    } else {
                        this.handleDownloadResponse(res, downloadPath, toolPath, resolve, reject);
                    }
                })
                .on("error", (error) => {
                    reject(new Error(`Failed to download tool: ${error.message}`));
                });
        });
    }

    /**
     * Handle the download response
     */
    private handleDownloadResponse(res: http.IncomingMessage, downloadPath: string, toolPath: string, resolve: (path: string) => void, reject: (error: Error) => void): void {
        if (res.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
            return;
        }

        try {
            const fileStream = createWriteStream(downloadPath);

            pipeline(res, fileStream)
                .then(() => {
                    logInfo(`[ToolRegistry] Download complete, extracting to ${toolPath}`);
                    this.extractTool(downloadPath, toolPath)
                        .then(() => {
                            // Clean up download file
                            fs.unlinkSync(downloadPath);
                            resolve(toolPath);
                        })
                        .catch(reject);
                })
                .catch((error) => {
                    reject(new Error(`Download failed: ${error.message}`));
                });
        } catch (err) {
            reject(new Error(`Failed to download tool: ${err}`));
        }
    }

    /**
     * Extract a downloaded tool archive
     */
    private async extractTool(archivePath: string, targetPath: string): Promise<void> {
        // For now, we'll use Node's zlib and tar modules
        // Use spawn instead of exec to prevent command injection
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawn } = require("child_process");

        try {
            // Ensure target directory exists
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }

            // Use tar command to extract (works on Unix and modern Windows)
            // Pass arguments separately to prevent command injection
            await new Promise<void>((resolve, reject) => {
                const tar = spawn("tar", ["-xzf", archivePath, "-C", targetPath]);

                let stderr = "";
                tar.stderr.on("data", (data: Buffer) => {
                    stderr += data.toString();
                });

                tar.on("close", (code: number | null) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`tar extraction failed with code ${code}: ${stderr}`));
                    }
                });

                tar.on("error", (err: Error) => {
                    reject(err);
                });
            });

            logInfo(`[ToolRegistry] Tool extracted successfully to ${targetPath}`);
        } catch (error) {
            throw new Error(`Failed to extract tool: ${error}`);
        }
    }

    /**
     * Install a tool from the registry
     */
    async installTool(toolId: string): Promise<ToolManifest> {
        // Fetch registry
        const registry = await this.fetchRegistry();

        // Find tool
        const tool = registry.find((t) => t.id === toolId);
        if (!tool) {
            throw new Error(`Tool ${toolId} not found in registry`);
        }

        // Download and extract
        const toolPath = await this.downloadTool(tool);

        // Load tool metadata from package.json
        const packageJsonPath = path.join(toolPath, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`Tool ${toolId} is missing package.json`);
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

        // Read optional pptb.config.json for invocation capabilities
        let capabilities: string[] | undefined;
        let mcpHeadlessEnabled = false;
        const pptbConfigPath = path.join(toolPath, "pptb.config.json");
        if (fs.existsSync(pptbConfigPath)) {
            try {
                const pptbConfig = JSON.parse(fs.readFileSync(pptbConfigPath, "utf-8"));
                const caps = pptbConfig?.invocation?.capabilities;
                if (Array.isArray(caps) && caps.length > 0) {
                    capabilities = (caps as unknown[]).filter((c): c is string => typeof c === "string" && c.trim().length > 0);
                }

                const agentsConfig = pptbConfig?.agents;
                if (agentsConfig && typeof agentsConfig === "object" && !Array.isArray(agentsConfig)) {
                    const agentsRecord = agentsConfig as Record<string, unknown>;
                    const invokable = agentsRecord.invokable === true;
                    const supportsHeadlessFlag = agentsRecord.headless === true;
                    const executionModes = agentsRecord.executionModes;
                    const supportsHeadlessExecutionMode = Array.isArray(executionModes) && executionModes.some((mode) => mode === "headless");

                    mcpHeadlessEnabled = invokable && (supportsHeadlessFlag || supportsHeadlessExecutionMode);
                }
            } catch (err) {
                logWarn(`[ToolRegistry] Could not read pptb.config.json for ${toolId}`, err);
            }
        }

        // Validate declared capabilities against the known registry (warn on unknown tags)
        if (capabilities && capabilities.length > 0) {
            const knownTags = await this.getKnownCapabilityTags();
            const knownTagSet = new Set(knownTags.map((t) => t.tag));
            const unknownCaps = capabilities.filter((c) => !knownTagSet.has(c));
            if (unknownCaps.length > 0) {
                logWarn(`[ToolRegistry] Tool ${toolId} declares unrecognised capability tags: ${unknownCaps.join(", ")}. Ensure these tags exist in the capability registry or check for typos.`);
            }
        }

        // Extract version information from registry (Supabase)
        // These are pre-processed during tool intake and stored in the database
        const minAPI: string | undefined = tool.minAPI; // From Supabase tools table (min_api column)

        // Log if version info is missing (informational only, tools will still work as legacy)
        if (!minAPI) {
            logInfo(`[ToolRegistry] Tool ${toolId} does not have version information in registry. Tool will be treated as compatible with all versions (legacy behavior).`);
        }

        // Create manifest
        // Normalize authors list: prefer registry contributors, fallback to package.json author
        let authors: string[] | undefined = tool.authors;
        const pkgAuthor = packageJson?.author;
        if ((!authors || authors.length === 0) && pkgAuthor) {
            if (typeof pkgAuthor === "string") {
                authors = [pkgAuthor];
            } else if (typeof pkgAuthor === "object" && typeof pkgAuthor.name === "string") {
                authors = [pkgAuthor.name];
            }
        }

        const manifest: ToolManifest = {
            id: tool.id || packageJson.name,
            packageName: packageJson.name,
            name: tool.name || packageJson.displayName || packageJson.name,
            version: tool.version || packageJson.version,
            description: tool.description || packageJson.description,
            authors,
            icon: tool.icon || packageJson.icon,
            installPath: toolPath,
            installedAt: new Date().toISOString(),
            source: "registry",
            sourceUrl: tool.downloadUrl,
            readme: tool.readmeUrl, // Include readme URL from registry
            cspExceptions: tool.cspExceptions || packageJson.cspExceptions, // Include CSP exceptions
            features: tool.features || packageJson.features, // Include features from registry or package.json
            categories: tool.categories,
            license: tool.license || packageJson.license,
            status: tool.status,
            repository: tool.repository, // Include repository URL from registry
            website: tool.website, // Include website URL from registry
            createdAt: tool.createdAt,
            publishedAt: tool.publishedAt,
            minAPI, // Minimum API version required
            mcpHeadlessEnabled,
            capabilities, // Invocation capability tags from pptb.config.json
            marketplaceSourceId: tool.marketplaceSourceId,
            marketplaceSourceLabel: tool.marketplaceSourceLabel,
            marketplaceSourceType: tool.marketplaceSourceType,
            maturity: tool.maturity,
        };

        // Save to manifest file
        await this.saveManifest(manifest);

        logInfo(`[ToolRegistry] Tool ${toolId} installed successfully`);
        this.emit("tool:installed", manifest);

        // Track the download (async, don't wait for completion)
        this.trackToolDownload(toolId).catch((error) => {
            logError("[ToolRegistry] Failed to track download asynchronously", error);
        });

        return manifest;
    }

    /**
     * Uninstall a tool
     */
    async uninstallTool(toolId: string): Promise<void> {
        const manifest = await this.getInstalledManifest(toolId);
        if (!manifest) {
            throw new Error(`Tool ${toolId} is not installed`);
        }

        // Remove tool directory
        if (fs.existsSync(manifest.installPath) && (manifest.source === "registry" || manifest.source === "npm")) {
            fs.rmSync(manifest.installPath, { recursive: true, force: true });
        }

        // Remove from manifest
        await this.removeFromManifest(toolId);

        logInfo(`[ToolRegistry] Tool ${toolId} uninstalled successfully`);
        this.emit("tool:uninstalled", toolId);
    }

    /**
     * Get list of installed tools
     */
    async getInstalledTools(): Promise<ToolManifest[]> {
        return this.readInstalledManifest();
    }

    getInstalledToolsSync(): ToolManifest[] {
        return this.readInstalledManifest();
    }

    getInstalledManifestSync(toolId: string): ToolManifest | null {
        const tools = this.readInstalledManifest();
        return tools.find((tool) => tool.id === toolId) || null;
    }

    private readInstalledManifest(): ToolManifest[] {
        if (!fs.existsSync(this.manifestPath)) {
            return [];
        }

        try {
            const data = fs.readFileSync(this.manifestPath, "utf-8");
            const manifest = JSON.parse(data);
            const tools: Record<string, unknown>[] = manifest.tools || [];
            return tools.map((entry) => this.normalizeManifestEntry(entry));
        } catch (error) {
            logError("[ToolRegistry] Failed to read manifest", error);
            return [];
        }
    }

    private normalizeManifestEntry(entry: Record<string, unknown>): ToolManifest {
        const manifestEntry = entry as unknown as ToolManifest & { tags?: string[]; author?: string | { name?: string } };
        const categories = (manifestEntry.categories as string[] | undefined) ?? (manifestEntry as unknown as { tags?: string[] }).tags ?? [];
        let packageName = manifestEntry.packageName;
        let authors: string[] | undefined = this.normalizeAuthorList((manifestEntry as unknown as { authors?: unknown }).authors);
        const legacyAuthor = (manifestEntry as unknown as { author?: string | { name?: string } }).author;

        if (!packageName && typeof manifestEntry.installPath === "string") {
            try {
                const toolsRoot = fs.realpathSync(this.toolsDirectory);
                const installPath = fs.realpathSync(manifestEntry.installPath);
                const relativeInstallPath = path.relative(toolsRoot, installPath);
                const isWithinToolsDirectory = relativeInstallPath !== "" && !relativeInstallPath.startsWith(`..${path.sep}`) && relativeInstallPath !== ".." && !path.isAbsolute(relativeInstallPath);

                if (isWithinToolsDirectory) {
                    const packageJsonPath = fs.realpathSync(path.join(installPath, "package.json"));
                    const relativePackageJsonPath = path.relative(installPath, packageJsonPath);
                    const isWithinInstallPath =
                        relativePackageJsonPath !== "" && !relativePackageJsonPath.startsWith(`..${path.sep}`) && relativePackageJsonPath !== ".." && !path.isAbsolute(relativePackageJsonPath);
                    const packageJsonStats = fs.statSync(packageJsonPath);

                    if (isWithinInstallPath && packageJsonStats.isFile() && packageJsonStats.size <= 1_048_576) {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { name?: unknown };
                        if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
                            packageName = packageJson.name;
                        }
                    }
                }
            } catch {
                // Legacy manifests may reference packages that are no longer present.
            }
        }

        if ((!authors || authors.length === 0) && legacyAuthor) {
            if (typeof legacyAuthor === "string") {
                authors = [legacyAuthor];
            } else if (typeof legacyAuthor === "object" && typeof legacyAuthor.name === "string") {
                authors = [legacyAuthor.name];
            }
        }

        return {
            id: manifestEntry.id,
            packageName,
            name: manifestEntry.name,
            version: manifestEntry.version,
            description: manifestEntry.description,
            authors,
            icon: manifestEntry.icon,
            installPath: manifestEntry.installPath,
            installedAt: manifestEntry.installedAt,
            source: manifestEntry.source,
            sourceUrl: manifestEntry.sourceUrl,
            readme: manifestEntry.readme,
            cspExceptions: manifestEntry.cspExceptions,
            features: manifestEntry.features,
            categories,
            license: manifestEntry.license,
            status: manifestEntry.status,
            repository: manifestEntry.repository,
            website: manifestEntry.website,
            downloads: manifestEntry.downloads,
            rating: manifestEntry.rating,
            mau: manifestEntry.mau,
            publishedAt: manifestEntry.publishedAt,
            createdAt: manifestEntry.createdAt,
            minAPI: manifestEntry.minAPI,
            mcpHeadlessEnabled: manifestEntry.mcpHeadlessEnabled,
            capabilities: manifestEntry.capabilities,
            marketplaceSourceId: manifestEntry.marketplaceSourceId,
            marketplaceSourceLabel: manifestEntry.marketplaceSourceLabel,
            marketplaceSourceType: manifestEntry.marketplaceSourceType,
        };
    }

    canFetchRemoteAnalytics(): boolean {
        return !this.useLocalFallback && !!this.supabase;
    }

    async fetchAnalytics(toolIds: string[]): Promise<Map<string, SupabaseAnalyticsRow>> {
        const map = new Map<string, SupabaseAnalyticsRow>();
        if (!this.canFetchRemoteAnalytics() || !toolIds.length) {
            return map;
        }

        try {
            const { data, error } = await this.supabase!.from("tools").select("id, tool_analytics(downloads,rating,mau)").in("id", toolIds);

            if (error) {
                logError(`[ToolRegistry] Failed to fetch analytics: ${(error as Error).message}`);
                return map;
            }

            (data || []).forEach((row: any) => {
                const analytics = Array.isArray(row.tool_analytics) ? row.tool_analytics[0] : row.tool_analytics;
                if (analytics) {
                    map.set(row.id as string, {
                        downloads: getOptionalAnalyticsNumber(analytics.downloads),
                        rating: getOptionalAnalyticsNumber(analytics.rating),
                        mau: getOptionalAnalyticsNumber(analytics.mau),
                    });
                }
            });
        } catch (error) {
            logError("[ToolRegistry] Error fetching analytics", error);
        }

        return map;
    }

    /**
     * Get installed manifest for a specific tool
     */
    async getInstalledManifest(toolId: string): Promise<ToolManifest | null> {
        const tools = await this.getInstalledTools();
        return tools.find((t) => t.id === toolId) || null;
    }

    /**
     * Save tool manifest
     */
    private async saveManifest(toolManifest: ToolManifest): Promise<void> {
        const tools = await this.getInstalledTools();

        // Remove existing entry if present
        const filtered = tools.filter((t) => t.id !== toolManifest.id);
        // Do not persist transient analytics fields
        const sanitizedManifest = { ...toolManifest } as Partial<ToolManifest>;
        delete (sanitizedManifest as any).downloads;
        delete (sanitizedManifest as any).rating;
        delete (sanitizedManifest as any).mau;

        filtered.push(sanitizedManifest as ToolManifest);

        const manifest = {
            version: "1.0",
            tools: filtered,
        };

        fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
    }

    /**
     * Remove tool from manifest
     */
    private async removeFromManifest(toolId: string): Promise<void> {
        const tools = await this.getInstalledTools();
        const filtered = tools.filter((t) => t.id !== toolId);

        const manifest = {
            version: "1.0",
            tools: filtered,
        };

        fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
    }

    /**
     * Check for tool updates
     */
    async checkForUpdates(toolId: string): Promise<{ hasUpdate: boolean; latestVersion?: string }> {
        const installed = await this.getInstalledManifest(toolId);
        if (!installed) {
            return { hasUpdate: false };
        }

        const registry = await this.fetchRegistry();
        const registryTool = registry.find((t) => t.id === toolId);

        if (!registryTool) {
            return { hasUpdate: false };
        }

        const hasUpdate = registryTool.version !== installed.version;
        return {
            hasUpdate,
            latestVersion: registryTool.version,
        };
    }

    /**
     * Update Supabase credentials (if needed)
     */
    updateSupabaseClient(url: string, key: string): void {
        this.supabase = createClient(url, key);
        this.useLocalFallback = false;
        logInfo(`[ToolRegistry] Supabase client updated`);
    }

    /**
     * Track a tool download
     * Increments the download count for the tool in the analytics table
     * @param toolId - The unique identifier of the tool
     */
    async trackToolDownload(toolId: string): Promise<void> {
        // Skip tracking if using local fallback (no Supabase)
        if (this.useLocalFallback || !this.supabase) {
            logInfo(`[ToolRegistry] Skipping download tracking (no Supabase connection)`);
            return;
        }

        try {
            logInfo(`[ToolRegistry] Tracking download for tool: ${toolId}`);

            // Use the atomic DB-side RPC to avoid read-modify-write race conditions
            // when multiple machines download the same tool concurrently.
            const { error } = await this.supabase.rpc("increment_tool_downloads", { p_tool_id: toolId });

            if (error) {
                // Supabase errors are plain objects, not Error instances — convert so the message
                // is always visible in logs and Sentry instead of appearing as "[object Object]".
                throw new Error(error.message ?? JSON.stringify(error));
            }

            logInfo(`[ToolRegistry] Download tracked successfully for ${toolId}`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool installation
            logError(`[ToolRegistry] Failed to track download for ${toolId}`, error);
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: { operation: "trackToolDownload" },
                extra: { toolId },
            });
        }
    }

    /**
     * Track tool usage for Monthly Active Users (MAU) analytics
     * Records a unique install-tool-month combination for MAU tracking
     * @param toolId - The unique identifier of the tool
     */
    async trackToolUsage(toolId: string): Promise<void> {
        // Skip tracking if using local fallback (no Supabase)
        if (this.useLocalFallback || !this.supabase) {
            logInfo(`[ToolRegistry] Skipping usage tracking (no Supabase connection)`);
            return;
        }

        // Skip if no install ID manager available
        if (!this.installIdManager) {
            logWarn(`[ToolRegistry] Skipping usage tracking (no InstallIdManager)`);
            return;
        }

        try {
            logInfo(`[ToolRegistry] Tracking usage for tool: ${toolId}`);

            // Get the install ID
            const installId = this.installIdManager.getInstallId();

            // Calculate current year-month for MAU tracking
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

            // Single atomic RPC: upserts the usage row, recounts MAU, and updates tool_analytics
            // — all in one DB round-trip with no race conditions.
            const { error } = await this.supabase.rpc("track_tool_usage", {
                p_tool_id: toolId,
                p_install_id: installId,
                p_year_month: yearMonth,
                p_last_used_at: now.toISOString(),
            });

            if (error) {
                // Supabase errors are plain objects, not Error instances — convert so the message
                // is always visible in logs and Sentry instead of appearing as "[object Object]".
                throw new Error(error.message ?? JSON.stringify(error));
            }

            logInfo(`[ToolRegistry] Usage tracked successfully for ${toolId}`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool functionality
            logError(`[ToolRegistry] Failed to track usage for ${toolId}`, error);
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: { operation: "trackToolUsage" },
                extra: { toolId },
            });
        }
    }

    /**
     * Fetch community resource links from the Supabase community_links table.
     * Returns null when Supabase is not configured or the query fails, so the caller
     * can fall back to bundled static data.
     */
    async fetchCommunityLinks(): Promise<CommunityLinksCollection | null> {
        if (!this.supabase || this.useLocalFallback) {
            return null;
        }

        try {
            logInfo("[ToolRegistry] Fetching community links from Supabase");

            const { data, error } = await this.supabase
                .from("community_links")
                .select("id, group_id, group_title, label, url, sort_order")
                .eq("is_active", true)
                .order("sort_order", { ascending: true });

            if (error) {
                throw new Error(`Supabase community_links query failed: ${error.message}`);
            }

            if (!data || data.length === 0) {
                logInfo("[ToolRegistry] No community links found in Supabase");
                const emptyCollection: CommunityLinksCollection = {
                    groups: [],
                };
                return emptyCollection;
            }

            // Transform flat rows into grouped structure
            const groupMap = new Map<string, CommunityLinksGroup>();
            const rows = data as SupabaseCommunityLink[];
            for (const row of rows) {
                if (typeof row.url !== "string" || !row.url.startsWith("https://")) {
                    logWarn("[ToolRegistry] Skipping community link with non-https URL", { id: row.id, url: row.url });
                    continue;
                }

                if (!groupMap.has(row.group_id)) {
                    groupMap.set(row.group_id, {
                        id: row.group_id,
                        title: row.group_title,
                        links: [],
                    });
                }

                const item: CommunityLinksItem = {
                    id: row.id,
                    label: row.label,
                    url: row.url,
                };
                groupMap.get(row.group_id)!.links.push(item);
            }

            const collection: CommunityLinksCollection = {
                groups: Array.from(groupMap.values()),
            };

            logInfo(`[ToolRegistry] Fetched ${data.length} community links in ${collection.groups.length} groups`);
            return collection;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logWarn("[ToolRegistry] Failed to fetch community links from Supabase, caller should use local fallback", { error: errorMessage });
            return null;
        }
    }

    /**
     * Returns the list of known capability tags.
     *
     * On first call (or after the TTL expires) the list is fetched from the Supabase
     * `capability_tags` table and cached.  When Supabase is unavailable the built-in
     * fallback list (`BUILT_IN_CAPABILITY_TAGS`) is returned so validation and
     * auto-complete still work in offline scenarios.
     */
    async getKnownCapabilityTags(): Promise<CapabilityTagEntry[]> {
        const now = Date.now();
        if (this.capabilityTagsCache && now - this.capabilityTagsFetchedAtMs < ToolRegistryManager.CAPABILITY_TAGS_CACHE_TTL_MS) {
            return this.capabilityTagsCache;
        }

        try {
            const tags = await this.fetchKnownCapabilityTagsFromSupabase();
            if (tags !== null) {
                this.capabilityTagsCache = tags;
                this.capabilityTagsFetchedAtMs = now;
                return tags;
            }
        } catch (error) {
            logWarn("[ToolRegistry] Could not fetch capability tags from Supabase, using built-in fallback", { error: error instanceof Error ? error.message : String(error) });
        }

        // Supabase unavailable: update the timestamp so we do not retry on every subsequent call
        // while Supabase is down (rate-limit retries to once per TTL interval).
        // If a previous successful fetch populated the cache, keep returning it; otherwise fall back
        // to the built-in list so callers always receive a non-empty result.
        this.capabilityTagsFetchedAtMs = now;
        return this.capabilityTagsCache ?? BUILT_IN_CAPABILITY_TAGS;
    }

    /**
     * Fetches capability tags from the Supabase `capability_tags` table.
     * Returns `null` when Supabase is not configured or the query fails.
     */
    private async fetchKnownCapabilityTagsFromSupabase(): Promise<CapabilityTagEntry[] | null> {
        if (!this.supabase || this.useLocalFallback) {
            return null;
        }

        try {
            logInfo("[ToolRegistry] Fetching capability tags from Supabase");

            const { data, error } = await this.supabase.from("capability_tags").select("tag, description").eq("is_active", true).order("tag", { ascending: true });

            if (error) {
                throw new Error(`Supabase capability_tags query failed: ${error.message}`);
            }

            if (!data || data.length === 0) {
                logInfo("[ToolRegistry] No capability tags found in Supabase, using built-in fallback");
                return null;
            }

            const rows = data as SupabaseCapabilityTagRow[];
            const tags: CapabilityTagEntry[] = rows
                .filter((r) => typeof r.tag === "string" && r.tag.trim().length > 0)
                .map((r) => ({ tag: r.tag.trim(), description: typeof r.description === "string" ? r.description : "" }));

            logInfo(`[ToolRegistry] Fetched ${tags.length} capability tags from Supabase`);
            return tags;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logWarn("[ToolRegistry] Failed to fetch capability tags from Supabase", { error: errorMessage });
            return null;
        }
    }

    /**
     * Check whether an npm package has a beta (pre-release) dist-tag on the npm registry.
     * Uses the public npm registry REST API — no npm CLI required.
     * @param npmPackageName - the npm package name (e.g. "@pptoolbox/my-tool")
     * @returns an object with `hasBeta` flag and the `betaVersion` string when available
     */
    async checkBetaPackage(npmPackageName: string): Promise<{ hasBeta: boolean; betaVersion?: string }> {
        if (!npmPackageName || typeof npmPackageName !== "string") {
            return { hasBeta: false };
        }

        try {
            logInfo(`[ToolRegistry] Checking for beta package: ${npmPackageName}`);

            // encodeURIComponent handles both scoped (@org/name → %40org%2Fname) and plain names.
            const encodedName = encodeURIComponent(npmPackageName);

            const url = `https://registry.npmjs.org/-/package/${encodedName}/dist-tags`;

            const rawJson = await new Promise<string>((resolve, reject) => {
                https
                    .get(url, { timeout: 10000 }, (res) => {
                        if (res.statusCode === 404) {
                            // Package not found on npm — no beta available
                            resolve("{}");
                            return;
                        }
                        if (res.statusCode !== 200) {
                            reject(new Error(`npm registry request failed: HTTP ${res.statusCode}`));
                            return;
                        }
                        const chunks: Buffer[] = [];
                        res.on("data", (chunk: Buffer) => chunks.push(chunk));
                        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
                        res.on("error", reject);
                    })
                    .on("error", reject)
                    .on("timeout", () => reject(new Error("npm registry request timed out")));
            });

            const distTags = JSON.parse(rawJson) as Record<string, string>;
            const betaVersion = distTags["beta"];

            if (betaVersion && typeof betaVersion === "string") {
                logInfo(`[ToolRegistry] Beta version found for ${npmPackageName}: ${betaVersion}`);
                return { hasBeta: true, betaVersion };
            }

            logInfo(`[ToolRegistry] No beta version found for ${npmPackageName}`);
            return { hasBeta: false };
        } catch (error) {
            logWarn(`[ToolRegistry] Failed to check beta package for ${npmPackageName}`, { error: error instanceof Error ? error.message : String(error) });
            return { hasBeta: false };
        }
    }
}
