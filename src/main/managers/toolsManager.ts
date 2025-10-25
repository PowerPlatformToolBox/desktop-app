import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { Tool } from "../../types";
import { app } from "electron";

/**
 * Manages tool plugins loaded from npm packages
 * Tools are HTML-first and loaded directly into webviews
 */
export class ToolManager extends EventEmitter {
    private tools: Map<string, Tool> = new Map();
    private toolsDirectory: string;
    private pnpmPath: string;

    constructor(toolsDirectory: string) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.pnpmPath = this.resolvePnpmPath();
        this.ensureToolsDirectory();
    }

    /**
     * Resolve the path to the bundled pnpm executable
     * This ensures pnpm works in both development and production (packaged app)
     */
    private resolvePnpmPath(): string {
        const isWindows = process.platform === "win32";
        
        console.log(`[ToolManager] Resolving pnpm path...`);
        console.log(`[ToolManager] app.isPackaged: ${app.isPackaged}`);
        console.log(`[ToolManager] process.platform: ${process.platform}`);
        console.log(`[ToolManager] __dirname: ${__dirname}`);
        console.log(`[ToolManager] process.resourcesPath: ${process.resourcesPath}`);
        
        let pnpmCjsPath: string;
        const attemptedPaths: string[] = [];
        
        if (app.isPackaged) {
            // In packaged app, pnpm should be in app.asar.unpacked/node_modules
            const resourcesPath = process.resourcesPath;
            
            // Try app.asar.unpacked first (where unpacked dependencies go)
            pnpmCjsPath = path.join(resourcesPath, "app.asar.unpacked", "node_modules", "pnpm", "bin", "pnpm.cjs");
            attemptedPaths.push(pnpmCjsPath);
            console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
            
            if (!fs.existsSync(pnpmCjsPath)) {
                pnpmCjsPath = path.join(resourcesPath, "app", "node_modules", "pnpm", "bin", "pnpm.cjs");
                attemptedPaths.push(pnpmCjsPath);
                console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
            }
            
            // Try looking in asar itself (might be readable even if not executable)
            if (!fs.existsSync(pnpmCjsPath)) {
                pnpmCjsPath = path.join(resourcesPath, "app.asar", "node_modules", "pnpm", "bin", "pnpm.cjs");
                attemptedPaths.push(pnpmCjsPath);
                console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
            }
            
            // Try the .bin symlink as fallback
            if (!fs.existsSync(pnpmCjsPath)) {
                const pnpmBin = isWindows ? "pnpm.cmd" : "pnpm";
                pnpmCjsPath = path.join(resourcesPath, "app.asar.unpacked", "node_modules", ".bin", pnpmBin);
                attemptedPaths.push(pnpmCjsPath);
                console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
                
                if (!fs.existsSync(pnpmCjsPath)) {
                    pnpmCjsPath = path.join(resourcesPath, "app", "node_modules", ".bin", pnpmBin);
                    attemptedPaths.push(pnpmCjsPath);
                    console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
                }
            }
        } else {
            // In development, try to find pnpm.cjs directly
            pnpmCjsPath = path.join(__dirname, "..", "..", "..", "node_modules", "pnpm", "bin", "pnpm.cjs");
            attemptedPaths.push(pnpmCjsPath);
            console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
            
            // Fallback to .bin wrapper
            if (!fs.existsSync(pnpmCjsPath)) {
                const pnpmBin = isWindows ? "pnpm.cmd" : "pnpm";
                pnpmCjsPath = path.join(__dirname, "..", "..", "..", "node_modules", ".bin", pnpmBin);
                attemptedPaths.push(pnpmCjsPath);
                console.log(`[ToolManager] Checking: ${pnpmCjsPath} - exists: ${fs.existsSync(pnpmCjsPath)}`);
            }
        }
        
        // Fallback to system pnpm if bundled version not found
        if (!fs.existsSync(pnpmCjsPath)) {
            console.error(`[ToolManager] Bundled pnpm not found! Attempted paths:`);
            attemptedPaths.forEach(p => console.error(`  - ${p}`));
            console.error(`[ToolManager] Falling back to system pnpm (this will likely fail)`);
            const pnpmBin = isWindows ? "pnpm.cmd" : "pnpm";
            return pnpmBin; // This will search PATH
        }
        
        console.log(`[ToolManager] Successfully resolved pnpm at: ${pnpmCjsPath}`);
        return pnpmCjsPath;
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
     * Load a tool from an npm package
     * Loads tool metadata for webview rendering
     */
    async loadTool(packageName: string): Promise<Tool> {
        try {
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
        } catch (error) {
            throw new Error(`Failed to load tool ${packageName}: ${(error as Error).message}`);
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
     * Load all installed tools from a list of package names
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
     * Spawn pnpm with the correct executable and arguments
     * Handles both .cjs files (run with node) and native executables
     */
    private spawnPnpm(args: string[]): ReturnType<typeof spawn> {
        // If pnpmPath ends with .cjs, we need to run it with node
        if (this.pnpmPath.endsWith(".cjs")) {
            console.log(`[ToolManager] Spawning pnpm with Node.js: ${process.execPath} ${this.pnpmPath} ${args.join(" ")}`);
            return spawn(process.execPath, [this.pnpmPath, ...args]);
        }
        // Otherwise, execute directly (wrapper script or system pnpm)
        console.log(`[ToolManager] Spawning pnpm directly: ${this.pnpmPath} ${args.join(" ")}`);
        return spawn(this.pnpmPath, args);
    }

    /**
     * Install a tool via pnpm
     * Each tool is installed in its own isolated directory under toolsDirectory
     */
    async installTool(packageName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`[ToolManager] Installing tool: ${packageName}`);
            // Use --dir to specify installation directory
            // --no-optional to skip optional dependencies and save space
            // --prod to install only production dependencies
            const install = this.spawnPnpm(["add", packageName, "--dir", this.toolsDirectory, "--no-optional", "--prod"]);

            install.stdout?.on("data", (data: Buffer) => {
                console.log(`[ToolManager] pnpm stdout: ${data.toString()}`);
            });

            install.stderr?.on("data", (data: Buffer) => {
                console.error(`[ToolManager] pnpm stderr: ${data.toString()}`);
            });

            install.on("close", (code: number) => {
                console.log(`[ToolManager] pnpm process closed with code: ${code}`);
                if (code !== 0) {
                    reject(new Error(`pnpm install failed with code ${code}`));
                } else {
                    resolve();
                }
            });

            install.on("error", (err: Error) => {
                console.error(`[ToolManager] pnpm process error:`, err);
                reject(err);
            });
        });
    }

    /**
     * Uninstall a tool via pnpm
     */
    async uninstallTool(packageName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const uninstall = this.spawnPnpm(["remove", packageName, "--dir", this.toolsDirectory]);

            uninstall.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`pnpm uninstall failed with code ${code}`));
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
        return new Promise((resolve) => {
            const view = this.spawnPnpm(["view", packageName, "version"]);

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
        return new Promise((resolve, reject) => {
            const update = this.spawnPnpm(["update", packageName, "--dir", this.toolsDirectory]);

            update.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`pnpm update failed with code ${code}`));
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
