import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { Tool, ToolManifest } from "../../types";
import { ToolRegistryManager } from "./toolRegistryManager";

/**
 * Manages tool plugins - supports both registry-based and legacy npm-based tools
 * Tools are HTML-first and loaded directly into webviews
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
     * Check if a package manager is available globally
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
     * Get the available package manager (pnpm or npm)
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
     * Ensure the tools directory exists
     */
    private ensureToolsDirectory(): void {
        if (!fs.existsSync(this.toolsDirectory)) {
            fs.mkdirSync(this.toolsDirectory, { recursive: true });
        }
    }

    /**
     * Load a tool from registry manifest or npm package
     * Loads tool metadata for webview rendering
     */
    async loadTool(packageNameOrId: string): Promise<Tool> {
        try {
            // First try to load from registry manifest
            const manifest = await this.registryManager.getInstalledManifest(packageNameOrId);
            if (manifest) {
                return this.loadToolFromManifest(manifest);
            }

            // Fallback to npm package (legacy support)
            return await this.loadToolFromNpm(packageNameOrId);
        } catch (error) {
            throw new Error(`Failed to load tool ${packageNameOrId}: ${(error as Error).message}`);
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
     * Load tool from npm package (legacy)
     */
    private async loadToolFromNpm(packageName: string): Promise<Tool> {
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageName);
        const packageJsonPath = path.join(toolPath, "package.json");

        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`Tool package not found: ${packageName}`);
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

        const tool: Tool = {
            id: packageJson.name,
            name: packageJson.displayName || packageJson.name,
            version: packageJson.version,
            description: packageJson.description || "",
            author: packageJson.author || "Unknown",
            icon: packageJson.icon,
        };

        this.tools.set(tool.id, tool);
        this.emit("tool:loaded", tool);

        return tool;
    }

    /**
     * Load all installed tools from registry and npm
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
     * Load all installed tools from a list of package names (legacy npm support)
     */
    async loadInstalledTools(packageNames: string[]): Promise<void> {
        for (const packageName of packageNames) {
            try {
                await this.loadTool(packageName);
            } catch (error) {
                console.error(`Failed to load installed tool ${packageName}:`, error);
            }
        }
    }

    /**
     * Install a tool from the registry (new primary method)
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
     * Uninstall a tool (works for both registry and npm tools)
     */
    async uninstallTool(toolId: string): Promise<void> {
        // Check if it's a registry tool
        const manifest = await this.registryManager.getInstalledManifest(toolId);
        if (manifest) {
            await this.registryManager.uninstallTool(toolId);
            return;
        }

        // Fallback to npm-based uninstall (legacy)
        await this.uninstallToolLegacy(toolId);
    }

    /**
     * Install a tool using package manager (legacy - deprecated)
     * @deprecated Use installToolFromRegistry instead
     */
    async installToolLegacy(packageName: string): Promise<void> {
        const pkgManager = await this.getAvailablePackageManager();
        
        if (!pkgManager) {
            const instructions = this.getInstallInstructions();
            throw new Error(`No package manager found. Please install pnpm or npm globally:\n\n${instructions}`);
        }
        
        return new Promise((resolve, reject) => {
            console.log(`[ToolManager] Installing tool: ${packageName} using ${pkgManager.name}`);
            
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
     * Get installation instructions for package managers
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
     * Uninstall a tool using package manager (legacy - deprecated)
     * @deprecated Use uninstallTool (which handles both registry and npm)
     */
    private async uninstallToolLegacy(packageName: string): Promise<void> {
        const pkgManager = await this.getAvailablePackageManager();
        
        if (!pkgManager) {
            throw new Error("No package manager found. Cannot uninstall tool.");
        }
        
        return new Promise((resolve, reject) => {
            const args = pkgManager.name === "pnpm"
                ? ["remove", packageName, "--dir", this.toolsDirectory]
                : ["uninstall", packageName, "--prefix", this.toolsDirectory];
            
            const uninstall = spawn(pkgManager.command, args, { shell: true });

            uninstall.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`Tool uninstallation failed with code ${code}`));
                } else {
                    resolve();
                }
            });

            uninstall.on("error", (err: Error) => {
                reject(err);
            });
        });
    }

    /**
     * Check for the latest version of a package from npm registry
     */
    async getLatestVersion(packageName: string): Promise<string | null> {
        const pkgManager = await this.getAvailablePackageManager();
        
        if (!pkgManager) {
            return null;
        }
        
        return new Promise((resolve) => {
            const view = spawn(pkgManager.command, ["view", packageName, "version"], { shell: true });

            let output = "";
            
            view.stdout.on("data", (data: Buffer) => {
                output += data.toString();
            });

            view.on("close", (code: number) => {
                if (code !== 0) {
                    resolve(null);
                } else {
                    resolve(output.trim());
                }
            });

            view.on("error", () => {
                resolve(null);
            });
        });
    }

    /**
     * Update a tool to the latest version
     */
    async updateTool(packageName: string): Promise<void> {
        const pkgManager = await this.getAvailablePackageManager();
        
        if (!pkgManager) {
            throw new Error("No package manager found. Cannot update tool.");
        }
        
        return new Promise((resolve, reject) => {
            const args = pkgManager.name === "pnpm"
                ? ["update", packageName, "--dir", this.toolsDirectory]
                : ["update", packageName, "--prefix", this.toolsDirectory];
            
            const update = spawn(pkgManager.command, args, { shell: true });

            update.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`Tool update failed with code ${code}`));
                } else {
                    resolve();
                }
            });

            update.on("error", (err: Error) => {
                reject(err);
            });
        });
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
