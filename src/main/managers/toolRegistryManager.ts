import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "events";
import * as fs from "fs";
import { createWriteStream } from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { pipeline } from "stream/promises";
import { ToolManifest, ToolRegistryEntry } from "../../common/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../constants";

/**
 * Supabase database types
 */
interface SupabaseTool {
    id: string;
    name: string;
    description: string;
    iconurl: string;
    category: string;
    author?: string;
    version?: string;
    downloadurl?: string;
    published_at?: string;
    readmeurl?: string;
    checksum?: string;
    size?: number;
    tags?: string[];
}

/**
 * Manages tool installation from a registry (marketplace)
 * Registry for discovering and managing tool installations
 */
export class ToolRegistryManager extends EventEmitter {
    private toolsDirectory: string;
    private manifestPath: string;
    private supabase: SupabaseClient;

    constructor(toolsDirectory: string, supabaseUrl?: string, supabaseKey?: string) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.manifestPath = path.join(toolsDirectory, "manifest.json");

        // Initialize Supabase client
        const url = supabaseUrl || SUPABASE_URL;
        const key = supabaseKey || SUPABASE_ANON_KEY;

        // Validate Supabase credentials and create client
        if (!url || !key || url === "" || key === "") {
            console.warn("[ToolRegistry] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
            console.warn("[ToolRegistry] Tool registry functionality will be limited.");
            // Create a dummy client to prevent errors - it won't be functional but won't crash
            this.supabase = createClient("https://placeholder.supabase.co", "placeholder-key");
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
     * Fetch the tool registry from Supabase database
     */
    async fetchRegistry(): Promise<ToolRegistryEntry[]> {
        try {
            console.log(`[ToolRegistry] Fetching registry from Supabase`);

            // Query tools table from Supabase
            const { data: toolsData, error } = await this.supabase
                .from("tools")
                .select("id, name, description, iconurl, category, author, version, downloadurl, published_at, readmeurl, checksum, size")
                .order("name", { ascending: true });

            if (error) {
                throw new Error(`Supabase query failed: ${error.message}`);
            }

            if (!toolsData || toolsData.length === 0) {
                console.log(`[ToolRegistry] No tools found in registry`);
                return [];
            }

            // Transform Supabase data to ToolRegistryEntry format
            const tools: ToolRegistryEntry[] = toolsData.map((tool: SupabaseTool) => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                author: tool.author || "Unknown",
                version: tool.version || "1.0.0",
                icon: tool.iconurl,
                downloadUrl: tool.downloadurl || "",
                publishedAt: tool.published_at || new Date().toISOString(),
                readme: tool.readmeurl,
                checksum: tool.checksum,
                size: tool.size,
            }));

            console.log(`[ToolRegistry] Fetched ${tools.length} tools from Supabase registry`);
            return tools;
        } catch (error) {
            console.error(`[ToolRegistry] Failed to fetch registry from Supabase:`, error);
            throw new Error(`Failed to fetch registry: ${error instanceof Error ? error.message : String(error)}`);
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
        const manifest: ToolManifest = {
            id: tool.id || packageJson.name,
            name: tool.name || packageJson.displayName || packageJson.name,
            version: tool.version || packageJson.version,
            description: tool.description || packageJson.description,
            author: tool.author || packageJson.author,
            icon: tool.icon || packageJson.icon,
            installPath: toolPath,
            installedAt: new Date().toISOString(),
            source: "registry",
            sourceUrl: tool.downloadUrl,
            readme: tool.readme, // Include readme URL from registry
            cspExceptions: tool.cspExceptions || packageJson.cspExceptions, // Include CSP exceptions
        };

        // Save to manifest file
        await this.saveManifest(manifest);

        console.log(`[ToolRegistry] Tool ${toolId} installed successfully`);
        this.emit("tool:installed", manifest);

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
            return manifest.tools || [];
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
        console.log(`[ToolRegistry] Supabase client updated`);
    }
}
