import { spawn } from "child_process";
import { createHash } from "crypto";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { logError, logInfo, logWarn } from "../../common/logger";
import { describePath } from "../launchArgs";
import {
    CapabilityTagEntry,
    CommunityLinksCollection,
    CspExceptions,
    MarketplaceSource,
    Tool,
    ToolConcernReportResult,
    ToolConcernReportSubmission,
    ToolFeatures,
    ToolManifest,
    LocalToolIdentity,
} from "../../common/types";
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
    private provisionalLocalTools: Map<string, Tool> = new Map();
    private toolsDirectory: string;
    private registryManager: ToolRegistryManager;
    private analyticsCache: Map<string, { downloads?: number; rating?: number; mau?: number }> = new Map();
    private updatingTools: Set<string> = new Set();

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
        this.registryManager = new ToolRegistryManager(toolsDirectory, supabaseUrl, supabaseKey, installIdManager, azureBlobBaseUrl, settingsManager);
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

    getRegistryManager(): ToolRegistryManager {
        return this.registryManager;
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
            isSupported: VersionManager.isToolSupported(manifest.minAPI),
            mcpHeadlessEnabled: manifest.mcpHeadlessEnabled,
            capabilities: manifest.capabilities,
            marketplaceSourceId: manifest.marketplaceSourceId,
            marketplaceSourceLabel: manifest.marketplaceSourceLabel,
            marketplaceSourceType: manifest.marketplaceSourceType,
            maturity: manifest.maturity,
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
                logError(`[ToolManager] Failed to refresh analytics for ${toolId}`, error);
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
            isSupported: VersionManager.isToolSupported(manifest.minAPI),
            mcpHeadlessEnabled: manifest.mcpHeadlessEnabled,
            capabilities: manifest.capabilities,
            marketplaceSourceId: manifest.marketplaceSourceId,
            marketplaceSourceLabel: manifest.marketplaceSourceLabel,
            marketplaceSourceType: manifest.marketplaceSourceType,
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
                logError(`Failed to load registry tool ${manifest.id}`, error);
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
            // Too soon to delete it
            //this.tools.delete(toolId);
            this.emit("tool:unloaded", tool);
        }
    }

    removeLocalTool(toolId: string, expectedIdentity: LocalToolIdentity): boolean {
        const tool = this.provisionalLocalTools.get(toolId) ?? this.tools.get(toolId);
        if (
            !expectedIdentity ||
            typeof expectedIdentity.id !== "string" ||
            typeof expectedIdentity.resolvedPath !== "string" ||
            typeof expectedIdentity.name !== "string" ||
            !tool?.localPath ||
            tool.id !== expectedIdentity.id ||
            tool.localPath !== expectedIdentity.resolvedPath ||
            tool.npmPackageName !== expectedIdentity.name
        ) {
            return false;
        }

        const wasCommitted = this.tools.delete(toolId);
        this.provisionalLocalTools.delete(toolId);
        if (wasCommitted) {
            this.emit("tool:unloaded", tool);
        }
        return true;
    }

    commitLocalTool(toolId: string, expectedIdentity: LocalToolIdentity): boolean {
        const tool = this.provisionalLocalTools.get(toolId);
        if (!tool || tool.id !== expectedIdentity.id || tool.localPath !== expectedIdentity.resolvedPath || tool.npmPackageName !== expectedIdentity.name) {
            return false;
        }

        this.provisionalLocalTools.delete(toolId);
        this.tools.set(toolId, tool);
        this.emit("tool:loaded", tool);
        return true;
    }

    getToolForWebview(toolId: string): Tool | undefined {
        return this.provisionalLocalTools.get(toolId) ?? this.getTool(toolId);
    }

    /**
     * Get a loaded tool
     */
    getTool(toolId: string): Tool | undefined {
        const tool = this.tools.get(toolId);
        if (tool) {
            // Always recompute isSupported in case ToolBox version changed
            tool.isSupported = VersionManager.isToolSupported(tool.minAPI);
            return tool;
        }

        const manifest = this.registryManager.getInstalledManifestSync(toolId);
        if (manifest) {
            return this.createToolFromInstalledManifest(manifest);
        }

        return undefined;
    }

    resolveInvocationTarget(targetIdentifier: string): Tool | undefined {
        const toolById = this.getTool(targetIdentifier);
        if (toolById) {
            return toolById;
        }

        const matchingTools = new Map<string, Tool>();
        this.tools.forEach((tool) => {
            if (tool.npmPackageName === targetIdentifier) {
                matchingTools.set(tool.id, tool);
            }
        });
        this.registryManager.getInstalledToolsSync().forEach((manifest) => {
            if (manifest.packageName === targetIdentifier && !matchingTools.has(manifest.id)) {
                matchingTools.set(manifest.id, this.createToolFromInstalledManifest(manifest));
            }
        });

        if (matchingTools.size > 1) {
            throw new Error(`Multiple installed tools match package name: ${targetIdentifier}`);
        }

        return matchingTools.values().next().value;
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
                loaded.isSupported = VersionManager.isToolSupported(loaded.minAPI);
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
                tool.isSupported = VersionManager.isToolSupported(tool.minAPI);
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
                isSupported: VersionManager.isToolSupported(registryTool.minAPI),
            };
            return tool;
        });
    }

    /**
     * Fetch community resource links from Supabase.
     * Returns null when Supabase is not configured or the query fails.
     */
    async fetchCommunityLinks(): Promise<CommunityLinksCollection | null> {
        return this.registryManager.fetchCommunityLinks();
    }

    /**
     * Returns the list of known capability tags from the registry (backed by Supabase with fallback).
     */
    async getKnownCapabilityTags(): Promise<CapabilityTagEntry[]> {
        return this.registryManager.getKnownCapabilityTags();
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
     * Uninstall a tool (handles registry, npm, and local tools)
     */
    async uninstallTool(toolId: string): Promise<void> {
        const tool = this.tools.get(toolId);

        if (tool) {
            this.tools.delete(toolId);
            this.emit("tool:unloaded", tool);
        }

        if (tool?.npmPackageName) {
            const packageDir = this.resolvePackageDirectoryName(tool.npmPackageName);
            const toolPath = path.join(this.toolsDirectory, "node_modules", packageDir);
            if (fs.existsSync(toolPath)) {
                fs.rmSync(toolPath, { recursive: true, force: true });
            }
        } else if (tool?.localPath) {
            // Do not delete local development tools, just unload them
        } else {
            await this.registryManager.uninstallTool(toolId);
        }
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

    /**
     * Submit (or update) this install's star rating/comment for a tool
     */
    async submitToolRating(toolId: string, rating: number, comment?: string): Promise<{ rating?: number; ratingCount?: number }> {
        return this.registryManager.submitToolRating(toolId, rating, comment);
    }

    /**
     * Submit a "Report a Concern" for a tool
     */
    async submitConcernReport(report: ToolConcernReportSubmission): Promise<ToolConcernReportResult> {
        return this.registryManager.submitConcernReport(report);
    }

    // ========================================================================
    // DEBUG MODE ONLY: Legacy npm-based installation for tool developers
    // ========================================================================

    /**
     * Check if a package manager is available globally (debug mode only)
     */
    private buildEnv(): Record<string, string> {
        const paths = [...(process.env.PATH || "").split(path.delimiter).filter(Boolean)];

        if (process.platform === "darwin") {
            paths.push("/usr/local/bin", "/opt/homebrew/bin");
        } else if (process.platform === "linux") {
            paths.push("/usr/local/bin", path.join(process.env.HOME || "", ".local", "bin"));
        }

        const home = process.env.HOME || "";
        if (home) {
            paths.push(path.join(home, ".npm-global", "bin"));
            paths.push(path.join(home, ".nvm", "versions", "node", process.version, "bin"));
        }

        return {
            ...process.env,
            PATH: [...new Set(paths)].join(path.delimiter),
        };
    }

    private async checkPackageManager(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            const isWindows = process.platform === "win32";
            const cmd = isWindows ? `${command}.cmd` : command;
            const env = this.buildEnv();

            const check = spawn(cmd, ["--version"], { env });

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
    private async getAvailablePackageManager(): Promise<{ command: string; name: string; env: Record<string, string> } | null> {
        // Check for pnpm first (preferred)
        const hasPnpm = await this.checkPackageManager("pnpm");
        if (hasPnpm) {
            logInfo(`[ToolManager] Found pnpm globally installed`);
            return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", name: "pnpm", env: this.buildEnv() };
        }

        // Fallback to npm
        const hasNpm = await this.checkPackageManager("npm");
        if (hasNpm) {
            logInfo(`[ToolManager] Found npm globally installed`);
            return { command: process.platform === "win32" ? "npm.cmd" : "npm", name: "npm", env: this.buildEnv() };
        }

        logError(`[ToolManager] Neither pnpm nor npm found globally installed`);
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
            const install = spawn(pkgManager.command, args, { env: pkgManager.env });

            let stderr = "";

            install.stdout?.on("data", (data: Buffer) => {
                const output = data.toString();
                logInfo(`[ToolManager] ${pkgManager.name} stdout: ${output}`);
            });

            install.stderr?.on("data", (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                logError(`[ToolManager] ${pkgManager.name} stderr: ${output}`);
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
                logError(`[ToolManager] ${pkgManager.name} process error: ${err.message}`);
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
     * Resolve the actual directory name for an npm package inside node_modules.
     * Strips any trailing version/tag specifier so the path is valid on disk.
     * Examples:
     *   "@org/name@1.0.0"  → "@org/name"
     *   "@org/name@beta"   → "@org/name"
     *   "my-tool@beta"     → "my-tool"
     *   "@org/name"        → "@org/name"  (unchanged)
     *   "my-tool"          → "my-tool"    (unchanged)
     */
    private resolvePackageDirectoryName(packageName: string): string {
        if (packageName.startsWith("@")) {
            // Scoped package: @scope/name[@version]
            // Find the '@' that separates the name from the version specifier.
            const withoutLeadingAt = packageName.slice(1); // "scope/name@version"
            const versionAtIndex = withoutLeadingAt.indexOf("@");
            if (versionAtIndex !== -1) {
                return "@" + withoutLeadingAt.slice(0, versionAtIndex);
            }
            return packageName;
        } else {
            // Regular package: name[@version]
            const atIndex = packageName.indexOf("@");
            if (atIndex !== -1) {
                return packageName.slice(0, atIndex);
            }
            return packageName;
        }
    }

    /**
     * Check whether a beta (pre-release) npm package version is available.
     * @param npmPackageName - the npm package name (e.g. "@pptoolbox/my-tool")
     */
    async checkBetaPackage(npmPackageName: string): Promise<{ hasBeta: boolean; betaVersion?: string }> {
        return this.registryManager.checkBetaPackage(npmPackageName);
    }

    /**
     * Install the beta (pre-release) version of a registry tool via npm.
     * Installs the `@beta` dist-tag of the given npm package and loads it.
     * @param npmPackageName - the npm package name (e.g. "@pptoolbox/my-tool")
     */
    async installPrereleaseToolFromNpm(npmPackageName: string): Promise<Tool> {
        logInfo(`[ToolManager] Installing pre-release (beta) tool: ${npmPackageName}`);
        const betaPackageSpec = `${npmPackageName}@beta`;
        try {
            await this.installToolForDebug(betaPackageSpec);
        } catch (installError) {
            const msg = installError instanceof Error ? installError.message : String(installError);
            throw new Error(`Failed to install pre-release package '${betaPackageSpec}': ${msg}`);
        }
        // Use the base package name (no version specifier) to locate the installed directory.
        try {
            const tool = await this.loadNpmTool(npmPackageName);
            return tool;
        } catch (loadError) {
            const msg = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`Pre-release package '${betaPackageSpec}' was installed but could not be loaded: ${msg}`);
        }
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
     * @param packageName - npm package name (may include a version/tag specifier like "@beta" or "@1.0.0")
     */
    async loadNpmTool(packageName: string): Promise<Tool> {
        logInfo(`[ToolManager] [DEBUG] Loading npm tool: ${packageName}`);

        // Resolve the actual directory name in node_modules — strip any version/tag specifier.
        // For scoped packages: @org/name@version → @org/name
        // For regular packages: name@version → name
        const packageDirName = this.resolvePackageDirectoryName(packageName);

        // Construct path to the installed package
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageDirName);

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

        const tool: Tool = {
            id: toolId,
            name: packageJson.displayName || packageJson.name,
            version: packageJson.version || "0.0.0",
            description: packageJson.description || "Tool installed from npm",
            authors: typeof packageJson.author === "string" ? [packageJson.author] : undefined,
            icon: packageJson.icon,
            npmPackageName: packageJson.name, // Store the canonical npm package name for loading and invocation lookup
            cspExceptions: packageJson.cspExceptions, // Load CSP exceptions from package.json
            features: packageJson.features, // Load features from package.json (e.g., multi-connection)
            repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url,
            website: packageJson.homepage,
            readmeUrl: packageJson.readme,
            mcpHeadlessEnabled,
            capabilities, // Invocation capability tags from pptb.config.json
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

    private canonicalizeSafeLocalPath(localPath: string): string | null {
        try {
            if (typeof localPath !== "string" || localPath.includes("\0")) {
                return null;
            }

            const canonicalPath = fs.realpathSync.native(path.resolve(localPath));
            if (!path.isAbsolute(canonicalPath)) {
                return null;
            }

            const isProtected = this.getSystemDirectories().some((systemDirectory) => {
                const relativePath = path.relative(systemDirectory, canonicalPath);
                return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
            });

            return isProtected ? null : canonicalPath;
        } catch {
            return null;
        }
    }

    private getLocalToolId(packageName: string, canonicalPath: string): string {
        const sanitizedPackageName = packageName.replace(/@/g, "").replace(/\//g, "-");
        const identityHash = createHash("sha256")
            .update(JSON.stringify([canonicalPath, packageName]))
            .digest("hex")
            .slice(0, 12);
        return `local-${sanitizedPackageName}-${identityHash}`;
    }

    private canonicalizeContainedPath(canonicalRoot: string, candidatePath: string): string | null {
        try {
            const canonicalCandidate = fs.realpathSync.native(candidatePath);
            const relativePath = path.relative(canonicalRoot, canonicalCandidate);
            return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath)) ? canonicalCandidate : null;
        } catch {
            return null;
        }
    }

    private getValidatedLocalToolPaths(canonicalPath: string): { packageJsonPath: string; distPath: string; indexHtmlPath: string } | null {
        const packageJsonPath = this.canonicalizeContainedPath(canonicalPath, path.join(canonicalPath, "package.json"));
        const distPath = this.canonicalizeContainedPath(canonicalPath, path.join(canonicalPath, "dist"));
        if (!packageJsonPath || !distPath) {
            return null;
        }

        const indexHtmlPath = this.canonicalizeContainedPath(distPath, path.join(distPath, "index.html"));
        if (!indexHtmlPath || !fs.statSync(packageJsonPath).isFile() || !fs.statSync(distPath).isDirectory() || !fs.statSync(indexHtmlPath).isFile()) {
            return null;
        }

        return { packageJsonPath, distPath, indexHtmlPath };
    }

    /**
     * Convert file system path to file:// URL properly across platforms
     * Uses Node.js built-in pathToFileURL for proper encoding
     */
    private pathToFileUrl(filePath: string): string {
        return pathToFileURL(filePath).toString();
    }

    /**
     * Read the identity of a candidate local tool directory without registering it.
     *
     * Used to populate the CLI trust prompt, which must be answered *before* the tool
     * is mounted. Only parses package.json — nothing in the directory is executed.
     */
    readLocalToolIdentity(localPath: string): { id: string; resolvedPath: string; name: string; displayName: string; version: string } | null {
        try {
            const canonicalPath = this.canonicalizeSafeLocalPath(localPath);
            if (!canonicalPath) {
                return null;
            }

            const validatedPaths = this.getValidatedLocalToolPaths(canonicalPath);
            if (!validatedPaths) {
                return null;
            }

            const packageJson = JSON.parse(fs.readFileSync(validatedPaths.packageJsonPath, "utf-8")) as ToolPackageJson;
            if (!packageJson?.name || typeof packageJson.name !== "string") {
                return null;
            }

            return {
                id: this.getLocalToolId(packageJson.name, canonicalPath),
                resolvedPath: canonicalPath,
                name: packageJson.name,
                displayName: typeof packageJson.displayName === "string" && packageJson.displayName.length > 0 ? packageJson.displayName : packageJson.name,
                version: typeof packageJson.version === "string" && packageJson.version.length > 0 ? packageJson.version : "0.0.0",
            };
        } catch {
            return null;
        }
    }

    /**
     * Load a tool from a local directory (DEBUG MODE ONLY - for tool developers)
     * This allows developers to test their tools without publishing to npm
     * @param localPath - Absolute path to the tool directory
     */
    async loadLocalTool(localPath: string, expectedIdentity?: LocalToolIdentity, provisional = false): Promise<Tool> {
        logInfo(`[ToolManager] [DEBUG] Loading local tool from ${describePath(localPath)}`);

        const canonicalPath = this.canonicalizeSafeLocalPath(localPath);
        if (!canonicalPath) {
            throw new Error("The local tool path does not exist or resolves inside a protected system directory.");
        }

        // Check if it's a directory
        const stats = fs.statSync(canonicalPath);
        if (!stats.isDirectory()) {
            throw new Error("The local tool path is not a directory.");
        }

        // Look for package.json
        const validatedPaths = this.getValidatedLocalToolPaths(canonicalPath);
        if (!validatedPaths) {
            throw new Error("The local tool must contain package.json and dist/index.html inside its canonical directory.");
        }

        // Read and parse package.json
        let packageJson: ToolPackageJson;
        try {
            const packageJsonContent = fs.readFileSync(validatedPaths.packageJsonPath, "utf-8");
            packageJson = JSON.parse(packageJsonContent) as ToolPackageJson;
        } catch {
            throw new Error("Failed to read or parse the local tool package.json.");
        }

        // Verify required fields
        if (!packageJson.name) {
            throw new Error("package.json missing required field: name");
        }

        const toolId = this.getLocalToolId(packageJson.name, canonicalPath);
        if (expectedIdentity && (canonicalPath !== expectedIdentity.resolvedPath || packageJson.name !== expectedIdentity.name || toolId !== expectedIdentity.id)) {
            throw new Error("The local tool identity changed after it was inspected. Run the command again to review the new identity.");
        }

        // Read optional pptb.config.json for invocation capabilities
        let capabilities: string[] | undefined;
        let mcpHeadlessEnabled = false;
        const requestedPptbConfigPath = path.join(canonicalPath, "pptb.config.json");
        if (fs.existsSync(requestedPptbConfigPath)) {
            try {
                const pptbConfigPath = this.canonicalizeContainedPath(canonicalPath, requestedPptbConfigPath);
                if (!pptbConfigPath || !fs.statSync(pptbConfigPath).isFile()) {
                    throw new Error("pptb.config.json resolves outside the local tool directory");
                }
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
            } catch (error) {
                logWarn(`[ToolRegistry] Could not read pptb.config.json for ${toolId}`, { error: error instanceof Error ? error.name : "unknown" });
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

        const tool: Tool = {
            id: toolId,
            name: packageJson.displayName || packageJson.name,
            version: packageJson.version || "0.0.0",
            description: packageJson.description || "Local development tool",
            authors: typeof packageJson.author === "string" ? [packageJson.author] : undefined,
            icon: packageJson.icon,
            localPath: canonicalPath, // Store the canonical local path for loading
            npmPackageName: packageJson.name, // Store the canonical npm package name for invocation lookup
            cspExceptions: packageJson.cspExceptions, // Load CSP exceptions from package.json
            features: packageJson.features, // Load features from package.json (e.g., multi-connection)
            repository: typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url,
            website: packageJson.homepage,
            readmeUrl: packageJson.readme,
            mcpHeadlessEnabled,
            capabilities, // Invocation capability tags from pptb.config.json
        };

        if (provisional) {
            this.provisionalLocalTools.set(toolId, tool);
        } else {
            this.tools.set(toolId, tool);
            this.emit("tool:loaded", tool);
        }

        logInfo(`[ToolManager] [DEBUG] Local tool loaded: ${tool.name} (${toolId})`);
        return tool;
    }

    /**
     * Get webview HTML for a local tool with absolute file paths
     * @param localPath - Absolute path to the tool directory
     */
    getLocalToolWebviewHtml(localPath: string): string | undefined {
        const canonicalPath = this.canonicalizeSafeLocalPath(localPath);
        if (!canonicalPath) {
            logError(new Error(`[ToolManager] Unsafe local path rejected: ${describePath(localPath)}`));
            return undefined;
        }

        const validatedPaths = this.getValidatedLocalToolPaths(canonicalPath);
        const distHtmlPath = validatedPaths?.indexHtmlPath;

        if (distHtmlPath && fs.existsSync(distHtmlPath)) {
            let html = fs.readFileSync(distHtmlPath, "utf-8");

            // Convert relative CSS paths to absolute file:// URLs
            html = html.replace(/<link\s+([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi, (match, before, cssFile, after) => {
                const cssPath = this.canonicalizeContainedPath(validatedPaths.distPath, path.join(validatedPaths.distPath, cssFile));
                if (cssPath && fs.statSync(cssPath).isFile()) {
                    const absolutePath = this.pathToFileUrl(cssPath);
                    return `<link ${before}href="${absolutePath}"${after}>`;
                }
                return match;
            });

            // Convert relative JavaScript paths to absolute file:// URLs
            html = html.replace(/<script\s+([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, before, jsFile, after) => {
                const jsPath = this.canonicalizeContainedPath(validatedPaths.distPath, path.join(validatedPaths.distPath, jsFile));
                if (jsPath && fs.statSync(jsPath).isFile()) {
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
