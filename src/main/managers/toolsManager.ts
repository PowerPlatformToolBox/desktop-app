import { spawn } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { captureMessage, logInfo } from "../../common/sentryHelper";
import { CspExceptions, Tool, ToolFeatures, ToolManifest } from "../../common/types";
import { InstallIdManager } from "./installIdManager";
import { ToolRegistryManager } from "./toolRegistryManager";
import { VersionManager } from "./versionManager";

/**
 * Package.json structure for tool validation
 */
interface ToolPackageJson {
    name: string;
    version?: string;
    displayName?: string;
    description?: string;
    author?: string;
    icon?: string; // Relative path to SVG icon (e.g., "dist/icon.svg")
    cspExceptions?: CspExceptions;
    features?: ToolFeatures;
    repository?: string | { type: string; url: string };
    homepage?: string;
    readme?: string;
}

/**
 * Manages tool plugins using registry-based installation
 * Tools are HTML-first and loaded directly into webviews
 * Note: Legacy npm installation is only available for debug mode
 */
export class ToolManager extends EventEmitter {
    private tools: Map<string, Tool> = new Map();
    private toolsDirectory: string;
    private registryManager: ToolRegistryManager;
    private analyticsCache: Map<string, { downloads?: number; rating?: number; mau?: number }> = new Map();
    private updatingTools: Set<string> = new Set();

    constructor(toolsDirectory: string, supabaseUrl?: string, supabaseKey?: string, installIdManager?: InstallIdManager, azureBlobBaseUrl?: string) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.registryManager = new ToolRegistryManager(toolsDirectory, supabaseUrl, supabaseKey, installIdManager, azureBlobBaseUrl);
        this.ensureToolsDirectory();

        // Forward registry events
        this.registryManager.on("tool:installed", (manifest) => {
            this.emit("tool:installed", manifest);
        });
        this.registryManager.on("tool:uninstalled", (toolId) => {
            // Clear from cache when uninstalled
            this.tools.delete(toolId);
            this.emit("tool:uninstalled", toolId);
        });
    }

    private createToolFromInstalledManifest(manifest: ToolManifest): Tool {
        const tool: Tool = {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            authors: manifest.authors,
            icon: manifest.icon,
            cspExceptions: manifest.cspExceptions,
            features: manifest.features,
            categories: manifest.categories,
            license: manifest.license,
            downloads: manifest.downloads,
            rating: manifest.rating,
            mau: manifest.mau,
            status: manifest.status,
            repository: manifest.repository,
            website: manifest.website,
            readmeUrl: manifest.readme,
            publishedAt: manifest.publishedAt,
            createdAt: manifest.createdAt,
            minAPI: manifest.minAPI,
            maxAPI: manifest.maxAPI,
            isSupported: VersionManager.isToolSupported(manifest.minAPI, manifest.maxAPI),
        };

        const cached = this.analyticsCache.get(tool.id);
        if (cached) {
            tool.downloads = cached.downloads;
            tool.rating = cached.rating;
            tool.mau = cached.mau;
        }

        return tool;
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
     * Load a tool from registry manifest
     * Loads tool metadata for webview rendering
     */
    async loadTool(toolId: string): Promise<Tool> {
        try {
            // Load from registry manifest
            const manifest = await this.registryManager.getInstalledManifest(toolId);
            if (!manifest) {
                throw new Error(`Tool ${toolId} not found in registry`);
            }
            const tool = this.loadToolFromManifest(manifest);

            // Refresh analytics for this tool only (non-blocking)
            this.refreshAnalyticsForTools([toolId]).catch((error) => {
                captureMessage(`[ToolManager] Failed to refresh analytics for ${toolId}:`, "error", { extra: { error } });
            });

            return tool;
        } catch (error) {
            throw new Error(`Failed to load tool ${toolId}: ${(error as Error).message}`);
        }
    }

    /**
     * Load tool from registry manifest
     */
    private loadToolFromManifest(manifest: ToolManifest): Tool {
        const tool: Tool = {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            authors: manifest.authors,
            icon: manifest.icon,
            cspExceptions: manifest.cspExceptions,
            features: manifest.features,
            categories: manifest.categories,
            license: manifest.license,
            downloads: manifest.downloads,
            rating: manifest.rating,
            mau: manifest.mau,
            status: manifest.status,
            repository: manifest.repository,
            website: manifest.website,
            readmeUrl: manifest.readme,
            minAPI: manifest.minAPI,
            maxAPI: manifest.maxAPI,
            isSupported: VersionManager.isToolSupported(manifest.minAPI, manifest.maxAPI),
        };

        const cached = this.analyticsCache.get(tool.id);
        if (cached) {
            tool.downloads = cached.downloads;
            tool.rating = cached.rating;
            tool.mau = cached.mau;
        }

        this.tools.set(tool.id, tool);
        this.emit("tool:loaded", tool);

        return tool;
    }

    /**
     * Load all installed tools from registry
     */
    async loadAllInstalledTools(): Promise<void> {
        // Load registry-based tools
        const registryTools = await this.registryManager.getInstalledTools();
        const toolIds: string[] = [];

        for (const manifest of registryTools) {
            try {
                await this.loadTool(manifest.id);
                toolIds.push(manifest.id);
            } catch (error) {
                captureMessage(`Failed to load registry tool ${manifest.id}:`, "error", { extra: { error } });
            }
        }

        await this.refreshAnalyticsForTools(toolIds);
    }

    /**
     * Unload a tool
     */
    unloadTool(toolId: string): void {
        const tool = this.tools.get(toolId);
        if (tool) {
            this.tools.delete(toolId);
            this.emit("tool:unloaded", tool);
        }
    }

    /**
     * Get a loaded tool
     */
    getTool(toolId: string): Tool | undefined {
        const tool = this.tools.get(toolId);
        if (tool) {
            // Always recompute isSupported in case ToolBox version changed
            tool.isSupported = VersionManager.isToolSupported(tool.minAPI, tool.maxAPI);
            return tool;
        }

        const manifest = this.registryManager.getInstalledManifestSync(toolId);
        if (manifest) {
            return this.createToolFromInstalledManifest(manifest);
        }

        return undefined;
    }

    getInstalledManifestSync(toolId: string): ToolManifest | null {
        return this.registryManager.getInstalledManifestSync(toolId);
    }

    /**
     * Get all loaded tools
     */
    getAllTools(): Tool[] {
        const toolsById = new Map<string, Tool>();

        // Prefer installed tools from manifest so the sidebar stays stable even
        // when a tool is temporarily unloaded during update.
        const installedManifests = this.registryManager.getInstalledToolsSync();
        installedManifests.forEach((manifest) => {
            const loaded = this.tools.get(manifest.id);
            if (loaded) {
                // Always recompute isSupported in case ToolBox version changed
                loaded.isSupported = VersionManager.isToolSupported(loaded.minAPI, loaded.maxAPI);
                toolsById.set(manifest.id, loaded);
            } else {
                toolsById.set(manifest.id, this.createToolFromInstalledManifest(manifest));
            }
        });

        // Include any loaded tools that might not be in the registry manifest
        // (e.g., local dev tools).
        this.tools.forEach((tool, id) => {
            if (!toolsById.has(id)) {
                // Recompute isSupported for these tools too
                tool.isSupported = VersionManager.isToolSupported(tool.minAPI, tool.maxAPI);
                toolsById.set(id, tool);
            }
        });

        return Array.from(toolsById.values());
    }

    /**
     * Check if a tool is loaded
     */
    isToolLoaded(toolId: string): boolean {
        return this.tools.has(toolId);
    }

    /**
     * Install a tool from the registry (primary method)
     */
    async installToolFromRegistry(toolId: string): Promise<ToolManifest> {
        logInfo(`[ToolManager] Installing tool from registry: ${toolId}`);
        const manifest = await this.registryManager.installTool(toolId);
        return manifest;
    }

    /**
     * Fetch available tools from registry
     */
    async fetchAvailableTools(): Promise<Tool[]> {
        const registryTools = await this.registryManager.fetchRegistry();
        
        // Convert ToolRegistryEntry[] to Tool[] and add isSupported field
        return registryTools.map((registryTool) => {
            const tool: Tool = {
                ...registryTool,
                isSupported: VersionManager.isToolSupported(registryTool.minAPI, registryTool.maxAPI),
            };
            return tool;
        });
    }

    /**
     * Check for tool updates
     */
    async checkForUpdates(toolId: string) {
        return await this.registryManager.checkForUpdates(toolId);
    }

    private async refreshAnalyticsForTools(toolIds: string[]): Promise<void> {
        if (!toolIds.length || !this.registryManager.canFetchRemoteAnalytics()) return;

        const analyticsMap = await this.registryManager.fetchAnalytics(toolIds);
        analyticsMap.forEach((analytics, id) => {
            this.analyticsCache.set(id, analytics);
            const tool = this.tools.get(id);
            if (tool) {
                tool.downloads = analytics.downloads;
                tool.rating = analytics.rating;
                tool.mau = analytics.mau;
            }
        });
    }

    /**
     * Update a tool to the latest version from the registry
     */
    async updateTool(toolId: string): Promise<ToolManifest> {
        logInfo(`[ToolManager] Updating tool: ${toolId}`);

        try {
            // Mark tool as updating
            this.updatingTools.add(toolId);
            this.emit("tool:update-started", toolId);

            // Unload the tool first if it's loaded
            if (this.isToolLoaded(toolId)) {
                this.unloadTool(toolId);
            }

            // Re-install the tool (this will fetch the latest version from registry)
            const manifest = await this.registryManager.installTool(toolId);

            // Load the updated tool
            await this.loadTool(toolId);

            return manifest;
        } finally {
            // Mark tool as no longer updating
            this.updatingTools.delete(toolId);
            this.emit("tool:update-completed", toolId);
        }
    }

    /**
     * Uninstall a tool from registry
     */
    async uninstallTool(toolId: string): Promise<void> {
        await this.registryManager.uninstallTool(toolId);
    }

    /**
     * Check if a tool is currently being updated
     */
    isToolUpdating(toolId: string): boolean {
        return this.updatingTools.has(toolId);
    }

    /**
     * Track tool usage for analytics
     * This should be called when a tool is launched/opened
     */
    async trackToolUsage(toolId: string): Promise<void> {
        await this.registryManager.trackToolUsage(toolId);
    }

    // ========================================================================
    // DEBUG MODE ONLY: Legacy npm-based installation for tool developers
    // ========================================================================

    /**
     * Check if a package manager is available globally (debug mode only)
     */
    private async checkPackageManager(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            const isWindows = process.platform === "win32";
            const cmd = isWindows ? `${command}.cmd` : command;

            // Don't use shell to avoid issues with spaces in paths
            const check = spawn(cmd, ["--version"]);

            check.on("close", (code: number) => {
                resolve(code === 0);
            });

            check.on("error", () => {
                resolve(false);
            });
        });
    }

    /**
     * Get the available package manager (debug mode only)
     * Returns null if neither is available
     */
    private async getAvailablePackageManager(): Promise<{ command: string; name: string } | null> {
        // Check for pnpm first (preferred)
        const hasPnpm = await this.checkPackageManager("pnpm");
        if (hasPnpm) {
            logInfo(`[ToolManager] Found pnpm globally installed`);
            return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", name: "pnpm" };
        }

        // Fallback to npm
        const hasNpm = await this.checkPackageManager("npm");
        if (hasNpm) {
            logInfo(`[ToolManager] Found npm globally installed`);
            return { command: process.platform === "win32" ? "npm.cmd" : "npm", name: "npm" };
        }

        captureMessage(`[ToolManager] Neither pnpm nor npm found globally installed`, "error");
        return null;
    }

    /**
     * Install a tool from npm (DEBUG MODE ONLY - for tool developers)
     * This method is only for debugging and should not be used in production
     * @param packageName - npm package name
     */
    async installToolForDebug(packageName: string): Promise<void> {
        const pkgManager = await this.getAvailablePackageManager();

        if (!pkgManager) {
            const instructions = this.getInstallInstructions();
            throw new Error(`No package manager found. Please install pnpm or npm globally:\n\n${instructions}`);
        }

        return new Promise((resolve, reject) => {
            logInfo(`[ToolManager] [DEBUG] Installing tool: ${packageName} using ${pkgManager.name}`);

            // Build command based on package manager
            const args =
                pkgManager.name === "pnpm"
                    ? ["add", packageName, "--dir", this.toolsDirectory, "--no-optional", "--prod"]
                    : ["install", packageName, "--prefix", this.toolsDirectory, "--no-optional", "--production"];

            // Don't use shell: true to avoid issues with spaces in paths
            // The command array is already in the correct format for spawn
            const install = spawn(pkgManager.command, args);

            let stderr = "";

            install.stdout?.on("data", (data: Buffer) => {
                const output = data.toString();
                logInfo(`[ToolManager] ${pkgManager.name} stdout: ${output}`);
            });

            install.stderr?.on("data", (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                captureMessage(`[ToolManager] ${pkgManager.name} stderr: ${output}`, "error");
            });

            install.on("close", (code: number) => {
                logInfo(`[ToolManager] ${pkgManager.name} process closed with code: ${code}`);
                if (code !== 0) {
                    reject(new Error(`Tool installation failed with code ${code}${stderr ? `\n${stderr}` : ""}`));
                } else {
                    resolve();
                }
            });

            install.on("error", (err: Error) => {
                captureMessage(`[ToolManager] ${pkgManager.name} process error: ${err.message}`, "error");
                if (err.message.includes("ENOENT")) {
                    const instructions = this.getInstallInstructions();
                    reject(new Error(`${pkgManager.name} command not found. Please install it globally:\n\n${instructions}`));
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Get installation instructions for package managers (debug mode only)
     */
    private getInstallInstructions(): string {
        const platform = process.platform;
        let instructions = "To install a package manager, choose one of the following:\n\n";

        instructions += "**Install pnpm (recommended):**\n";
        if (platform === "win32") {
            instructions += "  • Using npm: npm install -g pnpm\n";
            instructions += "  • Using PowerShell: iwr https://get.pnpm.io/install.ps1 -useb | iex\n";
        } else if (platform === "darwin") {
            instructions += "  • Using npm: npm install -g pnpm\n";
            instructions += "  • Using Homebrew: brew install pnpm\n";
            instructions += "  • Using curl: curl -fsSL https://get.pnpm.io/install.sh | sh -\n";
        } else {
            instructions += "  • Using npm: npm install -g pnpm\n";
            instructions += "  • Using curl: curl -fsSL https://get.pnpm.io/install.sh | sh -\n";
        }

        instructions += "\n**Or use npm (comes with Node.js):**\n";
        instructions += "  • Download from: https://nodejs.org/\n";

        return instructions;
    }

    /**
     * Load an npm-installed tool from node_modules (DEBUG MODE ONLY)
     * This is called after installToolForDebug to register the tool in the tools map
     * @param packageName - npm package name
     */
    async loadNpmTool(packageName: string): Promise<Tool> {
        logInfo(`[ToolManager] [DEBUG] Loading npm tool: ${packageName}`);

        // Construct path to the installed package
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageName);

        // Verify the path exists
        if (!fs.existsSync(toolPath)) {
            throw new Error(`Npm tool not found at: ${toolPath}\n\nPlease install the tool first.`);
        }

        // Look for package.json
        const packageJsonPath = path.join(toolPath, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`No package.json found in: ${toolPath}`);
        }

        // Read and parse package.json
        let packageJson: ToolPackageJson;
        try {
            const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
            packageJson = JSON.parse(packageJsonContent) as ToolPackageJson;
        } catch (error) {
            throw new Error(`Failed to read or parse package.json: ${(error as Error).message}`);
        }

        // Verify required fields
        if (!packageJson.name) {
            throw new Error("package.json missing required field: name");
        }

        // Check for dist directory and index.html
        const distPath = path.join(toolPath, "dist");
        const indexHtmlPath = path.join(distPath, "index.html");

        if (!fs.existsSync(indexHtmlPath)) {
            throw new Error(`No dist/index.html found in: ${toolPath}\n\nThe tool package may not be built correctly or may not be compatible with Power Platform Toolbox.`);
        }

        // Exact behavior: remove all '@', replace all '/' with '-'
        const sanitizedToolId = packageJson.name.replace(/@/g, "").replace(/\//g, "-");

        // Create a tool object with npm path metadata
        const toolId = `npm-${sanitizedToolId}`;
        const tool: Tool = {
            id: toolId,
            name: packageJson.displayName || packageJson.name,
            version: packageJson.version || "0.0.0",
            description: packageJson.description || "Tool installed from npm",
            authors: typeof packageJson.author === "string" ? [packageJson.author] : undefined,
            icon: packageJson.icon,
            npmPackageName: packageName, // Store the npm package name for loading
            cspExceptions: packageJson.cspExceptions, // Load CSP exceptions from package.json
            features: packageJson.features, // Load features from package.json (e.g., multi-connection)
            repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url,
            website: packageJson.homepage,
            readmeUrl: packageJson.readme,
        };

        this.tools.set(toolId, tool);
        this.emit("tool:loaded", tool);

        logInfo(`[ToolManager] [DEBUG] Npm tool loaded: ${tool.name} (${toolId})`);
        return tool;
    }

    /**
     * Get webview HTML for a tool with absolute file paths
     * Context (connection URL, token) is passed via postMessage after iframe loads
     */
    getToolWebviewHtml(packageName: string): string | undefined {
        const toolPath = path.join(this.toolsDirectory, packageName);
        const distPath = path.join(toolPath, "dist");
        const distHtmlPath = path.join(distPath, "index.html");

        if (fs.existsSync(distHtmlPath)) {
            let html = fs.readFileSync(distHtmlPath, "utf-8");

            // Convert relative CSS paths to absolute file:// URLs
            html = html.replace(/<link\s+([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi, (match, before, cssFile, after) => {
                const cssPath = path.join(distPath, cssFile);
                if (fs.existsSync(cssPath)) {
                    const absolutePath = this.pathToFileUrl(cssPath);
                    return `<link ${before}href="${absolutePath}"${after}>`;
                }
                return match;
            });

            // Convert relative JavaScript paths to absolute file:// URLs
            html = html.replace(/<script\s+([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, before, jsFile, after) => {
                const jsPath = path.join(distPath, jsFile);
                if (fs.existsSync(jsPath)) {
                    const absolutePath = this.pathToFileUrl(jsPath);
                    return `<script ${before}src="${absolutePath}"${after}></script>`;
                }
                return match;
            });

            return html;
        }
        return undefined;
    }

    /**
     * Get tool context (connection URL and tool ID) for a tool
     * This is passed to the renderer for postMessage to iframe
     * NOTE: accessToken is NOT included for security - tools must use secure APIs
     */
    getToolContext(packageName: string, connectionUrl?: string): any {
        return {
            connectionUrl: connectionUrl || null,
            toolId: packageName,
        };
    }

    // ========================================================================
    // LOCAL TOOL DEVELOPMENT: Load tools from local directories
    // ========================================================================

    /**
     * Get system directories to protect from tool loading
     */
    private getSystemDirectories(): string[] {
        const platform = process.platform;

        if (platform === "win32") {
            return ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData", "C:\\System32"];
        } else if (platform === "darwin") {
            return ["/System", "/Library", "/usr", "/bin", "/sbin", "/private"];
        } else {
            // Linux and other Unix-like systems
            return ["/usr", "/bin", "/sbin", "/etc", "/root", "/sys", "/proc"];
        }
    }

    /**
     * Validate that a local path is safe to use (no path traversal)
     */
    private isPathSafe(localPath: string): boolean {
        // Resolve to absolute path
        const resolvedPath = path.resolve(localPath);

        // Ensure path is absolute after resolution
        if (!path.isAbsolute(resolvedPath)) {
            return false;
        }

        // Check if path contains null bytes (security check)
        if (resolvedPath.includes("\0")) {
            return false;
        }

        // Don't allow loading from system directories
        const systemDirs = this.getSystemDirectories();
        const lowerPath = resolvedPath.toLowerCase();

        for (const sysDir of systemDirs) {
            if (lowerPath.startsWith(sysDir.toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    /**
     * Convert file system path to file:// URL properly across platforms
     * Uses Node.js built-in pathToFileURL for proper encoding
     */
    private pathToFileUrl(filePath: string): string {
        return pathToFileURL(filePath).toString();
    }

    /**
     * Load a tool from a local directory (DEBUG MODE ONLY - for tool developers)
     * This allows developers to test their tools without publishing to npm
     * @param localPath - Absolute path to the tool directory
     */
    async loadLocalTool(localPath: string): Promise<Tool> {
        logInfo(`[ToolManager] [DEBUG] Loading local tool from: ${localPath}`);

        // Validate path safety
        if (!this.isPathSafe(localPath)) {
            throw new Error(`Unsafe path detected: ${localPath}\n\nPaths with '..' or system directories are not allowed for security reasons.`);
        }

        // Verify the path exists
        if (!fs.existsSync(localPath)) {
            throw new Error(`Local tool path does not exist: ${localPath}`);
        }

        // Check if it's a directory
        const stats = fs.statSync(localPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${localPath}`);
        }

        // Look for package.json
        const packageJsonPath = path.join(localPath, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`No package.json found in: ${localPath}`);
        }

        // Read and parse package.json
        let packageJson: ToolPackageJson;
        try {
            const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
            packageJson = JSON.parse(packageJsonContent) as ToolPackageJson;
        } catch (error) {
            throw new Error(`Failed to read or parse package.json: ${(error as Error).message}`);
        }

        // Verify required fields
        if (!packageJson.name) {
            throw new Error("package.json missing required field: name");
        }

        // Check for dist directory and index.html
        const distPath = path.join(localPath, "dist");
        const indexHtmlPath = path.join(distPath, "index.html");

        if (!fs.existsSync(indexHtmlPath)) {
            throw new Error(
                `No dist/index.html found in: ${localPath}\n\nPlease build your tool first (e.g., npm run build).\n\nThe tool should have a dist/ directory with an index.html entry point.`,
            );
        }

        // Exact behavior: remove all '@', replace all '/' with '-'
        const sanitizedToolId = packageJson.name.replace(/@/g, "").replace(/\//g, "-");

        // Create a tool object with local path metadata
        const toolId = `local-${sanitizedToolId}`;
        const tool: Tool = {
            id: toolId,
            name: packageJson.displayName || packageJson.name,
            version: packageJson.version || "0.0.0",
            description: packageJson.description || "Local development tool",
            authors: typeof packageJson.author === "string" ? [packageJson.author] : undefined,
            icon: packageJson.icon,
            localPath: localPath, // Store the local path for loading
            cspExceptions: packageJson.cspExceptions, // Load CSP exceptions from package.json
            features: packageJson.features, // Load features from package.json (e.g., multi-connection)
            repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url,
            website: packageJson.homepage,
            readmeUrl: packageJson.readme,
        };

        this.tools.set(toolId, tool);
        this.emit("tool:loaded", tool);

        logInfo(`[ToolManager] [DEBUG] Local tool loaded: ${tool.name} (${toolId})`);
        return tool;
    }

    /**
     * Get webview HTML for a local tool with absolute file paths
     * @param localPath - Absolute path to the tool directory
     */
    getLocalToolWebviewHtml(localPath: string): string | undefined {
        // Validate path safety before loading
        if (!this.isPathSafe(localPath)) {
            captureMessage(`[ToolManager] Unsafe local path rejected: ${localPath}`, "error", { extra: { localPath } });
            return undefined;
        }

        const distPath = path.join(localPath, "dist");
        const distHtmlPath = path.join(distPath, "index.html");

        if (fs.existsSync(distHtmlPath)) {
            let html = fs.readFileSync(distHtmlPath, "utf-8");

            // Convert relative CSS paths to absolute file:// URLs
            html = html.replace(/<link\s+([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi, (match, before, cssFile, after) => {
                const cssPath = path.join(distPath, cssFile);
                if (fs.existsSync(cssPath)) {
                    const absolutePath = this.pathToFileUrl(cssPath);
                    return `<link ${before}href="${absolutePath}"${after}>`;
                }
                return match;
            });

            // Convert relative JavaScript paths to absolute file:// URLs
            html = html.replace(/<script\s+([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, before, jsFile, after) => {
                const jsPath = path.join(distPath, jsFile);
                if (fs.existsSync(jsPath)) {
                    const absolutePath = this.pathToFileUrl(jsPath);
                    return `<script ${before}src="${absolutePath}"${after}></script>`;
                }
                return match;
            });

            return html;
        }
        return undefined;
    }
}
