import { app, protocol } from "electron";
import * as path from "path";
import * as fs from "fs";
import { ToolManager } from "./toolsManager";

/**
 * WebviewProtocolManager
 * 
 * Manages the custom pptb-webview:// protocol for loading tool content
 * in isolated webview contexts with independent CSP policies.
 * 
 * Similar to VS Code's vscode-webview:// protocol, this provides:
 * - Isolated origin for each tool
 * - Independent CSP per tool
 * - Secure file serving with path traversal protection
 * - No inheritance from parent window CSP
 */
export class WebviewProtocolManager {
    private toolManager: ToolManager;
    private toolsDir: string;

    constructor(toolManager: ToolManager) {
        this.toolManager = toolManager;
        this.toolsDir = path.join(app.getPath("userData"), "tools");
    }

    /**
     * Register the pptb-webview protocol scheme
     * Must be called before app.whenReady()
     */
    registerScheme(): void {
        protocol.registerSchemesAsPrivileged([
            {
                scheme: 'pptb-webview',
                privileges: {
                    standard: true,
                    secure: true,
                    supportFetchAPI: true,
                    corsEnabled: true,
                    bypassCSP: false, // Tools have their own independent CSP
                }
            }
        ]);
    }

    /**
     * Register the protocol handler
     * Must be called after app.whenReady()
     */
    registerHandler(): void {
        protocol.registerFileProtocol('pptb-webview', (request, callback) => {
            this.handleProtocolRequest(request, callback);
        });
    }

    /**
     * Handle protocol requests for pptb-webview://
     * URL format: pptb-webview://toolId/path/to/file
     * Special handling: When serving index.html, automatically inject toolboxAPIBridge.js
     */
    private handleProtocolRequest(
        request: Electron.ProtocolRequest,
        callback: (response: string | Electron.ProtocolResponse) => void
    ): void {
        try {
            // Parse the URL: pptb-webview://toolId/path/to/file
            const url = request.url.replace('pptb-webview://', '');
            const [toolId, ...pathParts] = url.split('/');
            const filePath = pathParts.join('/') || 'index.html';

            console.log(`[pptb-webview] Request: ${filePath} for tool: ${toolId}`);

            // Special case: Serve toolboxAPIBridge.js from the renderer directory
            if (filePath === 'toolboxAPIBridge.js') {
                const bridgePath = path.join(__dirname, '../renderer/toolboxAPIBridge.js');
                
                if (!fs.existsSync(bridgePath)) {
                    console.error(`[pptb-webview] Bridge script not found: ${bridgePath}`);
                    callback({ error: -6 }); // FILE_NOT_FOUND
                    return;
                }
                
                console.log(`[pptb-webview] Serving bridge script: ${bridgePath}`);
                callback({ path: bridgePath });
                return;
            }

            // Get the tool
            const tool = this.toolManager.getAllTools().find(t => t.id === toolId);
            
            if (!tool) {
                console.error(`[pptb-webview] Tool not found: ${toolId}`);
                callback({ error: -6 }); // FILE_NOT_FOUND
                return;
            }

            // Determine the tool's base directory
            const toolBaseDir = this.getToolBaseDirectory(tool);
            if (!toolBaseDir) {
                console.error(`[pptb-webview] Cannot determine tool directory for: ${toolId}`);
                callback({ error: -6 });
                return;
            }

            // Build the full file path
            const fullPath = path.join(toolBaseDir, 'dist', filePath);

            // Security: Ensure the path is within the tool's directory
            if (!this.isPathSafe(fullPath, toolBaseDir)) {
                console.error(`[pptb-webview] Path traversal attempt blocked: ${fullPath}`);
                callback({ error: -6 });
                return;
            }

            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                console.error(`[pptb-webview] File not found: ${fullPath}`);
                callback({ error: -6 });
                return;
            }

            // Special handling for HTML files: Inject the bridge script
            if (filePath.endsWith('.html')) {
                try {
                    let htmlContent = fs.readFileSync(fullPath, 'utf8');
                    
                    // Inject the bridge script tag before the closing </head> or at the start of <body>
                    const bridgeScriptTag = '<script src="toolboxAPIBridge.js"></script>';
                    
                    if (htmlContent.includes('</head>')) {
                        htmlContent = htmlContent.replace('</head>', `${bridgeScriptTag}\n</head>`);
                    } else if (htmlContent.includes('<body>')) {
                        htmlContent = htmlContent.replace('<body>', `<body>\n${bridgeScriptTag}`);
                    } else {
                        // No head or body tags, prepend the script
                        htmlContent = bridgeScriptTag + '\n' + htmlContent;
                    }
                    
                    console.log(`[pptb-webview] Injected bridge script into HTML: ${fullPath}`);
                    
                    // Return the modified HTML content with proper MIME type
                    callback({
                        mimeType: 'text/html',
                        data: Buffer.from(htmlContent, 'utf8')
                    });
                    return;
                } catch (error) {
                    console.error(`[pptb-webview] Error injecting bridge script:`, error);
                    // Fall back to serving the file as-is
                }
            }

            console.log(`[pptb-webview] Serving: ${fullPath}`);
            callback({ path: fullPath });

        } catch (error) {
            console.error(`[pptb-webview] Error handling protocol request:`, error);
            callback({ error: -2 }); // FAILED
        }
    }

    /**
     * Get the base directory for a tool
     */
    private getToolBaseDirectory(tool: any): string | null {
        if (tool.localPath) {
            // Local development tool
            return tool.localPath;
        } else if (tool.id) {
            // Installed tool
            return path.join(this.toolsDir, tool.id);
        }
        return null;
    }

    /**
     * Security check: Ensure the requested path is within the tool's directory
     * Prevents path traversal attacks (e.g., ../../etc/passwd)
     */
    private isPathSafe(requestedPath: string, toolBaseDir: string): boolean {
        const normalizedPath = path.normalize(requestedPath);
        const normalizedBase = path.normalize(path.join(toolBaseDir, 'dist'));
        return normalizedPath.startsWith(normalizedBase);
    }

    /**
     * Build the webview URL for a tool
     * Returns: pptb-webview://toolId/index.html
     */
    buildToolUrl(toolId: string, file: string = 'index.html'): string {
        return `pptb-webview://${toolId}/${file}`;
    }

    /**
     * Inject CSP meta tag and bridge script into tool HTML
     * This is called when loading tool HTML to add:
     * 1. Tool-specific CSP meta tag (from tool's cspExceptions)
     * 2. Bridge script for toolboxAPI communication
     */
    injectToolMetadata(html: string, tool: any, bridgeScriptUrl: string): string {
        // Build CSP for the tool
        const cspString = this.buildToolCsp(tool);
        const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${this.escapeHtml(cspString)}">`;
        
        // Bridge script tag
        const bridgeScriptTag = `<script src="${bridgeScriptUrl}"></script>`;
        
        let injectedHtml = html;
        
        // Inject CSP meta tag in <head>
        if (injectedHtml.includes("</head>")) {
            injectedHtml = injectedHtml.replace("</head>", `${cspMetaTag}\n</head>`);
        } else if (injectedHtml.includes("<head>")) {
            injectedHtml = injectedHtml.replace("<head>", `<head>\n${cspMetaTag}`);
        } else {
            // Create head tag if missing
            injectedHtml = `<!DOCTYPE html><html><head>\n${cspMetaTag}\n</head><body>${injectedHtml}</body></html>`;
        }
        
        // Inject bridge script before </head> or at start of <body>
        if (injectedHtml.includes("</head>")) {
            injectedHtml = injectedHtml.replace("</head>", `${bridgeScriptTag}\n</head>`);
        } else if (injectedHtml.includes("<body>")) {
            injectedHtml = injectedHtml.replace("<body>", `<body>\n${bridgeScriptTag}`);
        }
        
        return injectedHtml;
    }

    /**
     * Build CSP string for a tool based on its exceptions
     * Each tool gets its own independent CSP (does NOT inherit from parent)
     */
    private buildToolCsp(tool: any): string {
        const cspExceptions = tool.cspExceptions || {};
        
        // Default CSP directives for tools
        const directives: { [key: string]: string[] } = {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'", "pptb-webview:"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", "data:", "https:"],
            'font-src': ["'self'", "data:"],
            'connect-src': ["'self'"],
        };
        
        // Merge tool's CSP exceptions
        for (const [directive, sources] of Object.entries(cspExceptions)) {
            if (Array.isArray(sources) && sources.length > 0) {
                if (!directives[directive]) {
                    directives[directive] = ["'self'"];
                }
                directives[directive].push(...sources);
            }
        }
        
        // Build CSP string
        return Object.entries(directives)
            .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
            .join('; ');
    }

    /**
     * Escape HTML to prevent injection attacks
     */
    private escapeHtml(text: string): string {
        return text.replace(/"/g, '&quot;');
    }
}
