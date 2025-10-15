import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "../../types";
import { ToolHostManager } from "../toolHost/toolHostManager";
import { ToolBoxAPI } from "../../api/toolboxAPI";

/**
 * Manages tool plugins loaded from npm packages
 * Now integrated with Tool Host for secure, isolated execution
 */
export class ToolManager extends EventEmitter {
    private tools: Map<string, Tool> = new Map();
    private toolsDirectory: string;
    private toolHostManager: ToolHostManager;

    constructor(toolsDirectory: string, api: ToolBoxAPI) {
        super();
        this.toolsDirectory = toolsDirectory;
        this.toolHostManager = new ToolHostManager(api);
        this.ensureToolsDirectory();

        // Forward tool host events
        this.toolHostManager.on("tool:loaded", (tool) => this.emit("tool:loaded", tool));
        this.toolHostManager.on("tool:unloaded", (tool) => this.emit("tool:unloaded", tool));
        this.toolHostManager.on("tool:activated", (tool) => this.emit("tool:activated", tool));
        this.toolHostManager.on("tool:deactivated", (tool) => this.emit("tool:deactivated", tool));
        this.toolHostManager.on("tool:error", ({ tool, error }) => this.emit("tool:error", { tool, error }));
        this.toolHostManager.on("tool:event", ({ tool, event }) => this.emit("tool:event", { tool, event }));
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
     * Now loads the tool into an isolated Tool Host process
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
                main: path.join(toolPath, packageJson.main || "index.js"),
            };

            this.tools.set(tool.id, tool);

            // Load the tool into Tool Host for isolated execution
            await this.toolHostManager.loadTool(tool);

            return tool;
        } catch (error) {
            throw new Error(`Failed to load tool ${packageName}: ${(error as Error).message}`);
        }
    }

    /**
     * Unload a tool
     */
    async unloadTool(toolId: string): Promise<void> {
        const tool = this.tools.get(toolId);
        if (tool) {
            await this.toolHostManager.unloadTool(toolId);
            this.tools.delete(toolId);
        }
    }

    /**
     * Activate a tool (trigger its activation function)
     */
    async activateTool(toolId: string): Promise<void> {
        if (!this.tools.has(toolId)) {
            throw new Error(`Tool ${toolId} not found`);
        }
        await this.toolHostManager.activateTool(toolId);
    }

    /**
     * Execute a command contributed by a tool
     */
    async executeCommand(toolId: string, command: string, ...args: unknown[]): Promise<unknown> {
        if (!this.tools.has(toolId)) {
            throw new Error(`Tool ${toolId} not found`);
        }
        return this.toolHostManager.executeCommand(toolId, command, ...args);
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
     * Dispose and cleanup all tool hosts
     */
    async dispose(): Promise<void> {
        await this.toolHostManager.dispose();
    }

    /**
     * Install a tool via npm
     */
    async installTool(packageName: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawn } = require("child_process");

        return new Promise((resolve, reject) => {
            const npm = process.platform === "win32" ? "npm.cmd" : "npm";
            const install = spawn(npm, ["install", packageName, "--prefix", this.toolsDirectory]);

            install.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`npm install failed with code ${code}`));
                } else {
                    resolve();
                }
            });

            install.on("error", (err: Error) => {
                reject(err);
            });
        });
    }

    /**
     * Uninstall a tool via npm
     */
    async uninstallTool(packageName: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawn } = require("child_process");

        return new Promise((resolve, reject) => {
            const npm = process.platform === "win32" ? "npm.cmd" : "npm";
            const uninstall = spawn(npm, ["uninstall", packageName, "--prefix", this.toolsDirectory]);

            uninstall.on("close", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`npm uninstall failed with code ${code}`));
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
     * Get webview HTML for a tool
     */
    getToolWebviewHtml(packageName: string): string | undefined {
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageName);
        const webviewHtmlPath = path.join(toolPath, "ui", "webview.html");
        if (fs.existsSync(webviewHtmlPath)) {
            return fs.readFileSync(webviewHtmlPath, "utf-8");
        }
        return undefined;
    }
}
