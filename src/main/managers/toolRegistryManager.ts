import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "events";
import * as fs from "fs";
import { createWriteStream } from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { pipeline } from "stream/promises";
import { CspExceptions, ToolManifest, ToolRegistryEntry } from "../../common/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../constants";
import { MachineIdManager } from "./machineIdManager";

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
    downloadurl: string;
    iconurl: string;
    readmeurl?: string;
    version?: string;
    checksum?: string;
    size?: string; // stored as text in schema
    published_at?: string;
    csp_exceptions?: unknown;
    features?: unknown; // JSON column for tool features
    license?: string;
    status?: string; // Tool lifecycle status: active, deprecated, archived
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
    private machineIdManager: MachineIdManager | null = null;

    constructor(toolsDirectory: string, supabaseUrl?: string, supabaseKey?: string, machineIdManager?: MachineIdManager) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.manifestPath = path.join(toolsDirectory, "manifest.json");
        this.localRegistryPath = path.join(__dirname, "data", "registry.json");
        this.machineIdManager = machineIdManager || null;

        // Initialize Supabase client
        const url = supabaseUrl || SUPABASE_URL;
        const key = supabaseKey || SUPABASE_ANON_KEY;

        // Validate Supabase credentials and create client
        if (!url || !key || url === "" || key === "") {
            console.warn("[ToolRegistry] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
            console.warn("[ToolRegistry] Falling back to local registry.json file.");
            this.useLocalFallback = true;
        } else {
            console.log("[ToolRegistry] Initializing Supabase client with URL:", url.substring(0, 30) + "...");
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
        // Use local fallback if Supabase is not configured
        if (this.useLocalFallback) {
            return this.fetchLocalRegistry();
        }

        try {
            console.log(`[ToolRegistry] Fetching registry from Supabase (new schema)`);

            const selectColumns = [
                "id",
                "packagename",
                "name",
                "description",
                "downloadurl",
                "iconurl",
                "readmeurl",
                "version",
                "checksum",
                "size",
                "published_at",
                "license",
                "csp_exceptions",
                "features",
                "status",
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
                console.log(`[ToolRegistry] No tools found in registry`);
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
                    iconUrl: tool.iconurl,
                    downloadUrl: tool.downloadurl,
                    readmeUrl: tool.readmeurl,
                    publishedAt: tool.published_at || new Date().toISOString(),
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
                } as ToolRegistryEntry;
            });

            console.log(`[ToolRegistry] Fetched ${tools.length} tools (enhanced) from Supabase registry`);
            return tools;
        } catch (error) {
            console.error(`[ToolRegistry] Failed to fetch registry from Supabase:`, error);
            throw new Error(`Failed to fetch registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch the tool registry from the local registry.json file
     */
    private async fetchLocalRegistry(): Promise<ToolRegistryEntry[]> {
        try {
            console.log(`[ToolRegistry] Fetching registry from local file: ${this.localRegistryPath}`);

            if (!fs.existsSync(this.localRegistryPath)) {
                console.warn(`[ToolRegistry] Local registry file not found at ${this.localRegistryPath}`);
                return [];
            }

            const data = fs.readFileSync(this.localRegistryPath, "utf-8");
            const registryData: LocalRegistryFile = JSON.parse(data);

            if (!registryData.tools || registryData.tools.length === 0) {
                console.log(`[ToolRegistry] No tools found in local registry`);
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
                    downloadUrl: tool.downloadUrl,
                    checksum: tool.checksum,
                    size: tool.size,
                    publishedAt: tool.publishedAt || new Date().toISOString(),
                    tags: tool.tags,
                    readme: tool.readme,
                    cspExceptions: tool.cspExceptions,
                    features: tool.features,
                    license: tool.license,
                    status: (tool.status as "active" | "deprecated" | "archived" | undefined) || "active",
                }));

            console.log(`[ToolRegistry] Fetched ${tools.length} tools from local registry`);
            return tools;
        } catch (error) {
            console.error(`[ToolRegistry] Failed to fetch local registry:`, error);
            throw new Error(`Failed to fetch local registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Download a tool from the registry
     */
    async downloadTool(tool: ToolRegistryEntry): Promise<string> {
        const toolPath = path.join(this.toolsDirectory, tool.id);
        const downloadPath = path.join(this.toolsDirectory, `${tool.id}.tar.gz`);

        console.log(`[ToolRegistry] Downloading tool ${tool.id} from ${tool.downloadUrl}`);

        return new Promise((resolve, reject) => {
            const protocol = tool.downloadUrl.startsWith("https") ? https : http;

            protocol
                .get(tool.downloadUrl, (res) => {
                    if (res.statusCode === 302 || res.statusCode === 301) {
                        // Handle redirects
                        const redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            console.log(`[ToolRegistry] Following redirect to ${redirectUrl}`);
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
                    console.log(`[ToolRegistry] Download complete, extracting to ${toolPath}`);
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

            console.log(`[ToolRegistry] Tool extracted successfully to ${targetPath}`);
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
            icon: tool.iconUrl || packageJson.icon,
            installPath: toolPath,
            installedAt: new Date().toISOString(),
            source: "registry",
            sourceUrl: tool.downloadUrl,
            readme: tool.readmeUrl, // Include readme URL from registry
            cspExceptions: tool.cspExceptions || packageJson.cspExceptions, // Include CSP exceptions
            features: tool.features || packageJson.features, // Include features from registry or package.json
            categories: tool.categories,
            license: tool.license || packageJson.license,
            downloads: tool.downloads,
            rating: tool.rating,
            mau: tool.mau,
            status: tool.status,
        };

        // Save to manifest file
        await this.saveManifest(manifest);

        console.log(`[ToolRegistry] Tool ${toolId} installed successfully`);
        this.emit("tool:installed", manifest);

        // Track the download (async, don't wait for completion)
        this.trackToolDownload(toolId).catch((error) => {
            console.error(`[ToolRegistry] Failed to track download asynchronously:`, error);
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

        console.log(`[ToolRegistry] Tool ${toolId} uninstalled successfully`);
        this.emit("tool:uninstalled", toolId);
    }

    /**
     * Get list of installed tools
     */
    async getInstalledTools(): Promise<ToolManifest[]> {
        if (!fs.existsSync(this.manifestPath)) {
            return [];
        }

        try {
            const data = fs.readFileSync(this.manifestPath, "utf-8");
            const manifest = JSON.parse(data);
            const tools: any[] = manifest.tools || [];
            // Normalize installed entries to new schema (categories, authors[])
            const normalized: ToolManifest[] = tools.map((t) => {
                const categories = t.categories ?? t.tags ?? [];
                let authors: string[] | undefined = t.authors;
                if ((!authors || authors.length === 0) && t.author) {
                    if (typeof t.author === "string") authors = [t.author];
                    else if (typeof t.author === "object" && typeof t.author.name === "string") authors = [t.author.name];
                }
                const { id, name, version, description, icon, installPath, installedAt, source, sourceUrl, readme, cspExceptions, features, license, downloads, rating, mau, status } = t as any;
                return {
                    id,
                    name,
                    version,
                    description,
                    authors,
                    icon,
                    installPath,
                    installedAt,
                    source,
                    sourceUrl,
                    readme,
                    cspExceptions,
                    features,
                    categories,
                    license,
                    downloads,
                    rating,
                    mau,
                    status,
                } as ToolManifest;
            });
            return normalized;
        } catch (error) {
            console.error(`[ToolRegistry] Failed to read manifest:`, error);
            return [];
        }
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
        filtered.push(toolManifest);

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
        console.log(`[ToolRegistry] Supabase client updated`);
    }

    /**
     * Track a tool download
     * Increments the download count for the tool in the analytics table
     * @param toolId - The unique identifier of the tool
     */
    async trackToolDownload(toolId: string): Promise<void> {
        // Skip tracking if using local fallback (no Supabase)
        if (this.useLocalFallback || !this.supabase) {
            console.log(`[ToolRegistry] Skipping download tracking (no Supabase connection)`);
            return;
        }

        try {
            console.log(`[ToolRegistry] Tracking download for tool: ${toolId}`);

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

            console.log(`[ToolRegistry] Download tracked successfully for ${toolId} (total: ${newDownloads})`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool installation
            console.error(`[ToolRegistry] Failed to track download for ${toolId}:`, error);
        }
    }

    /**
     * Track tool usage for Monthly Active Users (MAU) analytics
     * Records a unique machine-tool-month combination for MAU tracking
     * @param toolId - The unique identifier of the tool
     */
    async trackToolUsage(toolId: string): Promise<void> {
        // Skip tracking if using local fallback (no Supabase)
        if (this.useLocalFallback || !this.supabase) {
            console.log(`[ToolRegistry] Skipping usage tracking (no Supabase connection)`);
            return;
        }

        // Skip if no machine ID manager available
        if (!this.machineIdManager) {
            console.warn(`[ToolRegistry] Skipping usage tracking (no MachineIdManager)`);
            return;
        }

        try {
            console.log(`[ToolRegistry] Tracking usage for tool: ${toolId}`);

            // Get the machine ID
            const machineId = this.machineIdManager.getMachineId();

            // Calculate current year-month for MAU tracking
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

            // Insert or update the usage record
            // This table should have a unique constraint on (tool_id, machine_id, year_month)
            const { error: usageError } = await this.supabase.from("tool_usage_tracking").upsert(
                {
                    tool_id: toolId,
                    machine_id: machineId,
                    year_month: yearMonth,
                    last_used_at: now.toISOString(),
                },
                {
                    onConflict: "tool_id,machine_id,year_month",
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

            console.log(`[ToolRegistry] Usage tracked successfully for ${toolId} (MAU: ${count})`);
        } catch (error) {
            // Log but don't throw - analytics failures shouldn't break tool functionality
            console.error(`[ToolRegistry] Failed to track usage for ${toolId}:`, error);
        }
    }
}
