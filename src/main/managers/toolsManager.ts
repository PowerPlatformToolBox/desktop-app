import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { Tool, ToolManifest } from "../../types";
import { ToolRegistryManager } from "./toolRegistryManager";

/**
 * Manages tool plugins using registry-based installation
 * Tools are HTML-first and loaded directly into webviews
 * Note: Legacy npm installation is only available for debug mode
 */
export class ToolManager extends EventEmitter {
    private tools: Map<string, Tool> = new Map();
    private toolsDirectory: string;
    private registryManager: ToolRegistryManager;

    constructor(toolsDirectory: string, registryUrl?: string) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.registryManager = new ToolRegistryManager(toolsDirectory, registryUrl);
        this.ensureToolsDirectory();
        
        // Forward registry events
        this.registryManager.on('tool:installed', (manifest) => {
            this.emit('tool:installed', manifest);
        });
        this.registryManager.on('tool:uninstalled', (toolId) => {
            this.emit('tool:uninstalled', toolId);
        });
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
            return this.loadToolFromManifest(manifest);
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
            author: manifest.author,
            icon: manifest.icon,
        };

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
        for (const manifest of registryTools) {
            try {
                await this.loadTool(manifest.id);
            } catch (error) {
                console.error(`Failed to load registry tool ${manifest.id}:`, error);
            }
        }
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
        return tool;
    }

    /**
     * Get all loaded tools
     */
    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
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
        console.log(`[ToolManager] Installing tool from registry: ${toolId}`);
        const manifest = await this.registryManager.installTool(toolId);
        return manifest;
    }

    /**
     * Fetch available tools from registry
     */
    async fetchAvailableTools() {
        return await this.registryManager.fetchRegistry();
    }

    /**
     * Check for tool updates
     */
    async checkForUpdates(toolId: string) {
        return await this.registryManager.checkForUpdates(toolId);
    }

    /**
     * Uninstall a tool from registry
     */
    async uninstallTool(toolId: string): Promise<void> {
        await this.registryManager.uninstallTool(toolId);
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
            
            const check = spawn(cmd, ["--version"], { shell: true });
            
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
            console.log(`[ToolManager] Found pnpm globally installed`);
            return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", name: "pnpm" };
        }
        
        // Fallback to npm
        const hasNpm = await this.checkPackageManager("npm");
        if (hasNpm) {
            console.log(`[ToolManager] Found npm globally installed`);
            return { command: process.platform === "win32" ? "npm.cmd" : "npm", name: "npm" };
        }
        
        console.error(`[ToolManager] Neither pnpm nor npm found globally installed`);
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
            console.log(`[ToolManager] [DEBUG] Installing tool: ${packageName} using ${pkgManager.name}`);
            
            // Build command based on package manager
            const args = pkgManager.name === "pnpm" 
                ? ["add", packageName, "--dir", this.toolsDirectory, "--no-optional", "--prod"]
                : ["install", packageName, "--prefix", this.toolsDirectory, "--no-optional", "--production"];
            
            const install = spawn(pkgManager.command, args, { shell: true });

            let stderr = "";

            install.stdout?.on("data", (data: Buffer) => {
                const output = data.toString();
                console.log(`[ToolManager] ${pkgManager.name} stdout: ${output}`);
            });

            install.stderr?.on("data", (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                console.error(`[ToolManager] ${pkgManager.name} stderr: ${output}`);
            });

            install.on("close", (code: number) => {
                console.log(`[ToolManager] ${pkgManager.name} process closed with code: ${code}`);
                if (code !== 0) {
                    reject(new Error(`Tool installation failed with code ${code}${stderr ? `\n${stderr}` : ""}`));
                } else {
                    resolve();
                }
            });

            install.on("error", (err: Error) => {
                console.error(`[ToolManager] ${pkgManager.name} process error:`, err);
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
     * Get webview HTML for a tool with absolute file paths
     * Context (connection URL, token) is passed via postMessage after iframe loads
     */
    getToolWebviewHtml(packageName: string): string | undefined {
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageName);
        const distPath = path.join(toolPath, "dist");
        const distHtmlPath = path.join(distPath, "index.html");

        if (fs.existsSync(distHtmlPath)) {
            let html = fs.readFileSync(distHtmlPath, "utf-8");

            // Convert relative CSS paths to absolute file:// URLs
            html = html.replace(/<link\s+([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi, (match, before, cssFile, after) => {
                const cssPath = path.join(distPath, cssFile);
                if (fs.existsSync(cssPath)) {
                    const absolutePath = `file://${cssPath.replace(/\\/g, "/")}`;
                    return `<link ${before}href="${absolutePath}"${after}>`;
                }
                return match;
            });

            // Convert relative JavaScript paths to absolute file:// URLs
            html = html.replace(/<script\s+([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, before, jsFile, after) => {
                const jsPath = path.join(distPath, jsFile);
                if (fs.existsSync(jsPath)) {
                    const absolutePath = `file://${jsPath.replace(/\\/g, "/")}`;
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
}
