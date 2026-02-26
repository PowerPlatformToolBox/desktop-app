import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "events";
import * as fs from "fs";
import { createWriteStream } from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { pipeline } from "stream/promises";
import { captureMessage, logInfo } from "../../common/sentryHelper";
import { CspExceptions, ToolManifest, ToolRegistryEntry } from "../../common/types";
import { AZURE_BLOB_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "../constants";
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
    max_api?: string; // Maximum ToolBox API version tested
    tool_categories?: SupabaseCategoryRow[];
    tool_contributors?: SupabaseContributorRow[];
    tool_analytics?: SupabaseAnalyticsRow | SupabaseAnalyticsRow[]; // sometimes array depending on RLS / joins
}

/**
 * Local registry JSON file structure
 */
interface LocalRegistryFile {
    version?: string;
    updatedAt?: string;
    description?: string;
    tools: LocalRegistryTool[];
}

interface LocalRegistryTool {
    id: string;
    name: string;
    description: string;
    authors?: string[];
    version: string;
    downloadUrl: string;
    icon?: string;
    checksum?: string;
    size?: number;
    publishedAt?: string;
    tags?: string[];
    readme?: string;
    minToolboxVersion?: string;
    repository?: string;
    homepage?: string;
    license?: string;
    cspExceptions?: CspExceptions;
    features?: Record<string, unknown>;
    status?: string; // Tool lifecycle status: active, deprecated, archived
    minAPI?: string; // Minimum ToolBox API version required
    maxAPI?: string; // Maximum ToolBox API version tested
}

/**
 * Manages tool installation from a registry (marketplace)
 * Registry for discovering and managing tool installations
 */
export class ToolRegistryManager extends EventEmitter {
    private toolsDirectory: string;
    private manifestPath: string;
    private supabase: SupabaseClient | null = null;
    private useLocalFallback: boolean = false;
    private localRegistryPath: string;
    private installIdManager: InstallIdManager | null = null;
    private azureBlobBaseUrl: string;

    // Registry fetch de-duping + caching
    private registryFetchInFlight: Promise<ToolRegistryEntry[]> | null = null;
    private registryCache: {
        tools: ToolRegistryEntry[];
        fetchedAtMs: number;
        source: "supabase" | "azureBlob" | "local";
    } | null = null;

    // Multiple renderer modules request the registry during startup (homepage stats, marketplace, etc.).
    // Keep this short so the marketplace stays fresh, but long enough to prevent thrash.
    private static readonly REGISTRY_CACHE_TTL_MS = 30_000;

    constructor(toolsDirectory: string, supabaseUrl?: string, supabaseKey?: string, installIdManager?: InstallIdManager, azureBlobBaseUrl?: string) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.manifestPath = path.join(toolsDirectory, "manifest.json");
        this.localRegistryPath = path.join(__dirname, "data", "registry.json");
        this.installIdManager = installIdManager || null;
        this.azureBlobBaseUrl = azureBlobBaseUrl || AZURE_BLOB_BASE_URL;

        // Initialize Supabase client
        const url = supabaseUrl || SUPABASE_URL;
        const key = supabaseKey || SUPABASE_ANON_KEY;

        // Validate Supabase credentials and create client
        if (!url || !key || url === "" || key === "") {
            captureMessage("[ToolRegistry] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.", "warning");
            captureMessage("[ToolRegistry] Falling back to local registry.json file.", "warning");
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
            // Use remote/local fallback if Supabase is not configured
            if (this.useLocalFallback) {
                const tools = await this.fetchFallbackRegistry();
                this.registryCache = {
                    tools,
                    fetchedAtMs: Date.now(),
                    source: this.azureBlobBaseUrl ? "azureBlob" : "local",
                };
                return tools;
            }

            const tools = await this.fetchRegistryFromSupabase();
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
                "max_api",
                // embedded relations
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
                    downloads = analytics?.downloads;
                    rating = analytics?.rating;
                    mau = analytics?.mau;
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
                    maxAPI: tool.max_api, // Include max API version from database
                } as ToolRegistryEntry;
            });

            logInfo(`[ToolRegistry] Fetched ${tools.length} tools (enhanced) from Supabase registry`);
            return tools;
        } catch (error) {
            captureMessage(`[ToolRegistry] Failed to fetch registry from Supabase: ${(error as Error).message}`, "error", {
                extra: { error },
            });
            throw new Error(`Failed to fetch registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch the tool registry from Azure Blob Storage or local JSON file.
     * Azure Blob is tried first (when configured), then the local registry.json.
     */
    private async fetchFallbackRegistry(): Promise<ToolRegistryEntry[]> {
        if (this.azureBlobBaseUrl) {
            try {
                const tools = await this.fetchAzureBlobRegistry();
                if (tools.length > 0) {
                    return tools;
                }
            } catch (error) {
                captureMessage(`[ToolRegistry] Azure Blob registry fetch failed, falling back to local: ${(error as Error).message}`, "warning", {
                    extra: { error },
                });
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

        let registryData: LocalRegistryFile;
        try {
            registryData = JSON.parse(rawJson) as LocalRegistryFile;
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
                authors: tool.authors,
                version: tool.version,
                downloadUrl: this.resolveDownloadUrl(tool.downloadUrl),
                checksum: tool.checksum,
                size: tool.size,
                publishedAt: tool.publishedAt || new Date().toISOString(),
                repository: tool.repository,
                website: tool.homepage,
                icon: tool.icon,
                cspExceptions: tool.cspExceptions,
                features: tool.features,
                license: tool.license,
                status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
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
    private resolveDownloadUrl(downloadUrl: string): string {
        if (!downloadUrl) {
            captureMessage("[ToolRegistry] Tool entry has no downloadUrl; tool cannot be installed from this registry source", "warning");
            return "";
        }
        if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
            return downloadUrl;
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
        captureMessage(`[ToolRegistry] Cannot resolve relative download URL "${downloadUrl}": AZURE_BLOB_BASE_URL is not configured`, "warning");
        return "";
    }

    /**
     * Fetch the tool registry from the local registry.json file
     */
    private async fetchLocalRegistry(): Promise<ToolRegistryEntry[]> {
        try {
            logInfo(`[ToolRegistry] Fetching registry from local file: ${this.localRegistryPath}`);

            if (!fs.existsSync(this.localRegistryPath)) {
                captureMessage(`[ToolRegistry] Local registry file not found at ${this.localRegistryPath}`, "warning");
                return [];
            }

            const data = fs.readFileSync(this.localRegistryPath, "utf-8");
            const registryData: LocalRegistryFile = JSON.parse(data);

            if (!registryData.tools || registryData.tools.length === 0) {
                logInfo(`[ToolRegistry] No tools found in local registry`);
                return [];
            }

            const tools: ToolRegistryEntry[] = registryData.tools
                .filter((tool) => tool.status === "active" || tool.status === "deprecated" || !tool.status)
                .map((tool) => ({
                    id: tool.id,
                    name: tool.name,
                    description: tool.description,
                    authors: tool.authors,
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
                    maxAPI: tool.maxAPI,
                }));

            logInfo(`[ToolRegistry] Fetched ${tools.length} tools from local registry`);
            return tools;
        } catch (error) {
            captureMessage(`[ToolRegistry] Failed to fetch local registry: ${(error as Error).message}`, "error", {
                extra: { error },
            });
            throw new Error(`Failed to fetch local registry: ${error instanceof Error ? error.message : String(error)}`);
        }
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

        // Extract version information from registry (Supabase)
        // These are pre-processed during tool intake and stored in the database
        const minAPI: string | undefined = tool.minAPI; // From Supabase tools table (min_api column)
        const maxAPI: string | undefined = tool.maxAPI; // From Supabase tools table (max_api column)

        // Log if version info is missing (informational only, tools will still work as legacy)
        if (!minAPI && !maxAPI) {
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
            maxAPI, // Maximum API version tested (from @pptb/types)
        };

        // Save to manifest file
        await this.saveManifest(manifest);

        logInfo(`[ToolRegistry] Tool ${toolId} installed successfully`);
        this.emit("tool:installed", manifest);

        // Track the download (async, don't wait for completion)
        this.trackToolDownload(toolId).catch((error) => {
            captureMessage(`[ToolRegistry] Failed to track download asynchronously: ${(error as Error).message}`, "error", {
                extra: { error },
            });
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
        if (fs.existsSync(manifest.installPath)) {
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
            captureMessage(`[ToolRegistry] Failed to read manifest: ${(error as Error).message}`, "error", {
                extra: { error },
            });
            return [];
        }
    }

    private normalizeManifestEntry(entry: Record<string, unknown>): ToolManifest {
        const manifestEntry = entry as unknown as ToolManifest & { tags?: string[]; author?: string | { name?: string } };
        const categories = (manifestEntry.categories as string[] | undefined) ?? (manifestEntry as unknown as { tags?: string[] }).tags ?? [];
        let authors: string[] | undefined = manifestEntry.authors;
        const legacyAuthor = (manifestEntry as unknown as { author?: string | { name?: string } }).author;

        if ((!authors || authors.length === 0) && legacyAuthor) {
            if (typeof legacyAuthor === "string") {
                authors = [legacyAuthor];
            } else if (typeof legacyAuthor === "object" && typeof legacyAuthor.name === "string") {
                authors = [legacyAuthor.name];
            }
        }

        return {
            id: manifestEntry.id,
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
            maxAPI: manifestEntry.maxAPI,
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
                captureMessage(`[ToolRegistry] Failed to fetch analytics: ${(error as Error).message}`, "error", {
                    extra: { error },
                });
                return map;
            }

            (data || []).forEach((row: any) => {
                const analytics = Array.isArray(row.tool_analytics) ? row.tool_analytics[0] : row.tool_analytics;
                if (analytics) {
                    map.set(row.id as string, analytics as SupabaseAnalyticsRow);
                }
            });
        } catch (error) {
            captureMessage(`[ToolRegistry] Error fetching analytics: ${(error as Error).message}`, "error", {
                extra: { error },
            });
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

            // Fetch current analytics
            const { data: existingAnalytics, error: fetchError } = await this.supabase.from("tool_analytics").select("downloads").eq("tool_id", toolId).maybeSingle();

            if (fetchError && fetchError.code !== "PGRST116") {
                // PGRST116 is "no rows found" - that's okay
                throw fetchError;
            }

            const currentDownloads = existingAnalytics?.downloads || 0;
            const newDownloads = currentDownloads + 1;

            // Upsert the analytics record
            const { error: upsertError } = await this.supabase.from("tool_analytics").upsert(
                {
                    tool_id: toolId,
                    downloads: newDownloads,
                },
                {
                    onConflict: "tool_id",
                },
            );

            if (upsertError) {
                throw upsertError;
            }

            logInfo(`[ToolRegistry] Download tracked successfully for ${toolId} (total: ${newDownloads})`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool installation
            captureMessage(`[ToolRegistry] Failed to track download for ${toolId}: ${(error as Error).message}`, "error", {
                extra: { error },
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
            captureMessage(`[ToolRegistry] Skipping usage tracking (no InstallIdManager)`, "warning");
            return;
        }

        try {
            logInfo(`[ToolRegistry] Tracking usage for tool: ${toolId}`);

            // Get the install ID
            const installId = this.installIdManager.getInstallId();

            // Calculate current year-month for MAU tracking
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

            // Insert or update the usage record
            // This table should have a unique constraint on (tool_id, install_id, year_month)
            const { error: usageError } = await this.supabase.from("tool_usage_tracking").upsert(
                {
                    tool_id: toolId,
                    install_id: installId,
                    year_month: yearMonth,
                    last_used_at: now.toISOString(),
                },
                {
                    onConflict: "tool_id,install_id,year_month",
                },
            );

            if (usageError) {
                throw usageError;
            }

            // Now update the aggregated MAU count in tool_analytics
            // Count distinct machines for this tool in the current month
            const { count, error: countError } = await this.supabase.from("tool_usage_tracking").select("*", { count: "exact", head: true }).eq("tool_id", toolId).eq("year_month", yearMonth);

            if (countError) {
                throw countError;
            }

            // Update the tool_analytics table with current month's MAU
            const { error: analyticsError } = await this.supabase.from("tool_analytics").upsert(
                {
                    tool_id: toolId,
                    mau: count || 0,
                },
                {
                    onConflict: "tool_id",
                },
            );

            if (analyticsError) {
                throw analyticsError;
            }

            logInfo(`[ToolRegistry] Usage tracked successfully for ${toolId} (MAU: ${count})`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool functionality
            captureMessage(`[ToolRegistry] Failed to track usage for ${toolId}: ${(error as Error).message}`, "error", {
                extra: { error },
            });
        }
    }
}
