import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { Tool } from "../../types";

/**
 * Manages tool plugins loaded from npm packages
 * Tools are HTML-first and loaded directly into webviews
 */
export class ToolManager extends EventEmitter {
    private tools: Map<string, Tool> = new Map();
    private toolsDirectory: string;

    constructor(toolsDirectory: string) {
        super();
        this.toolsDirectory = toolsDirectory;
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
     * Get webview HTML for a tool with injected context
     */
    getToolWebviewHtml(packageName: string, connectionUrl?: string, accessToken?: string): string | undefined {
        const toolPath = path.join(this.toolsDirectory, "node_modules", packageName);
        // TODO - Update to match actual tool structure
        const distHtmlPath = path.join(toolPath, "dist", "index.html");
        //const distHtmlPath = path.join(toolPath, "ui", "webview.html");

        if (fs.existsSync(distHtmlPath)) {
            let html = fs.readFileSync(distHtmlPath, "utf-8");

            // TODO remove in favor of proper auth flows
            // Mock Test Context Injection
            connectionUrl = "https://powermaverick.crm.dynamics.com/";
            accessToken =
                "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IkhTMjNiN0RvN1RjYVUxUm9MSHdwSXEyNFZZZyIsImtpZCI6IkhTMjNiN0RvN1RjYVUxUm9MSHdwSXEyNFZZZyJ9.eyJhdWQiOiJodHRwczovL3Bvd2VybWF2ZXJpY2suY3JtLmR5bmFtaWNzLmNvbS8iLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC8zMWMyMGEyMy0yZWQyLTQ2OGQtYmFhYi00MmVkZjk5ODEyOGIvIiwiaWF0IjoxNzYwNTU0NzgzLCJuYmYiOjE3NjA1NTQ3ODMsImV4cCI6MTc2MDU2MDA3NiwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFYUUFpLzhhQUFBQXUyWGZELzFhWXFsRU0rbDJrbjJveU1KZWNqNExmenkrYldYb2kzdDd2UVdOelNXblc2SVMvelF4cmpGTnlJRTJPTUJRNnAvTmtNSVdYN0MrRFM5WXpSTFUwbUI4UnBYd1ZVUlpERkswaEFLLzE0YXl1eVFYdzRzbnNBQmZMZHNXV1JQcWhPZmZCSHNKVm1wVXpTaEFQZz09IiwiYW1yIjpbInB3ZCIsIm1mYSJdLCJhcHBpZCI6IjUxZjgxNDg5LTEyZWUtNGE5ZS1hYWFlLWEyNTkxZjQ1OTg3ZCIsImFwcGlkYWNyIjoiMCIsImZhbWlseV9uYW1lIjoiTmFnbGVrYXIiLCJnaXZlbl9uYW1lIjoiRGFuaXNoIiwiaWR0eXAiOiJ1c2VyIiwiaXBhZGRyIjoiOTguMTIxLjIzMy41NyIsImxvZ2luX2hpbnQiOiJPLkNpUmtNR0l5WXpBMVl5MHlZemRpTFRRd016SXRZV1V6TXkxaU1tWTRNRGs1TnpRNVltTVNKRE14WXpJd1lUSXpMVEpsWkRJdE5EWTRaQzFpWVdGaUxUUXlaV1JtT1RrNE1USTRZaG9qWVdSdGFXNUFjRzkzWlhKdFlYWmxjbWxqYXk1dmJtMXBZM0p2YzI5bWRDNWpiMjBnQ1E9PSIsIm5hbWUiOiJEYW5pc2ggTmFnbGVrYXIiLCJvaWQiOiJkMGIyYzA1Yy0yYzdiLTQwMzItYWUzMy1iMmY4MDk5NzQ5YmMiLCJwdWlkIjoiMTAwMzIwMDA4RTVERUIzMiIsInJoIjoiMS5BVVVBSXdyQ01kSXVqVWE2cTBMdC1aZ1Npd2NBQUFBQUFBQUF3QUFBQUFBQUFBQmZBWlJGQUEuIiwic2NwIjoidXNlcl9pbXBlcnNvbmF0aW9uIiwic2lkIjoiMDA3Y2Q5MDktOTJiNi1hYjg5LTU5MzMtM2RmZmJhODgxZjc1Iiwic3ViIjoiVDJlTE1BY19hdkZzNEFQNGxRbERTcnlFYzdGZTBuMmZGU2ZCcmpkLTdJRSIsInRlbmFudF9yZWdpb25fc2NvcGUiOiJOQSIsInRpZCI6IjMxYzIwYTIzLTJlZDItNDY4ZC1iYWFiLTQyZWRmOTk4MTI4YiIsInVuaXF1ZV9uYW1lIjoiYWRtaW5AcG93ZXJtYXZlcmljay5vbm1pY3Jvc29mdC5jb20iLCJ1cG4iOiJhZG1pbkBwb3dlcm1hdmVyaWNrLm9ubWljcm9zb2Z0LmNvbSIsInV0aSI6IkVJSVpCTlJiTFVTMWV0QWFtdDBGQUEiLCJ2ZXIiOiIxLjAiLCJ3aWRzIjpbIjYyZTkwMzk0LTY5ZjUtNDIzNy05MTkwLTAxMjE3NzE0NWUxMCIsImI3OWZiZjRkLTNlZjktNDY4OS04MTQzLTc2YjE5NGU4NTUwOSJdLCJ4bXNfZnRkIjoiNXM5N1RRT2RuQVI5Snllb1BIZE95cFBaSkgwcXlvQUlKYnRYNktWR2lJSUJkWE5sWVhOMExXUnpiWE0iLCJ4bXNfaWRyZWwiOiIyMiAxIn0.COX_TNU93E20htg8Dlq7424Hwmqh_1Cvzhwn6nZ7tABK__K4qQoD1g2M3gEBua47BdCfxkesNKJL8A3VzQZJ-jF0omSuSRMAOP-_vmBin93fgbfm9zU6NdLZXVW_GNAkxA6vw0L9Kz_1CbB0oTKXg9uhllcwk21rsjcmiGtmdWesEJ7iaVNdDPIjHnWThDeYWNOOYXGlFyh6hNAEqHxzL2v8Y_1JpJOsdkfj59gP3mD-DcHOlxiNp_WlIu9-pgZLx23uJJQMEME-rsf-RCAhCWJ5cRCEQdD7dSwUeOoOXj2hqfSZkZuHBkOKip9ru6jGgD99nteb-01kowb9l4ICqw";

            // Inject connection context as a script tag before any other scripts
            if (connectionUrl || accessToken) {
                const contextScript = `
                    <script>
                        window.TOOLBOX_CONTEXT = {
                            connectionUrl: ${connectionUrl ? `"${connectionUrl}"` : "null"},
                            accessToken: ${accessToken ? `"${accessToken}"` : "null"},
                            toolId: "${packageName}"
                        };
                    </script>
                `;
                html = html.replace("<head>", "<head>" + contextScript);
            }

            return html;
        }
        return undefined;
    }
}
