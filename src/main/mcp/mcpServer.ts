import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, CallToolResult, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { logError, logInfo } from "../../common/logger";
import { SettingsManager } from "../managers/settingsManager";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { getAgentInvokableTools } from "./agentToolRegistry";

const MCP_AUTH_HEADER = "x-mcp-auth-token";

export class McpServerManager {
    private httpServer: ReturnType<typeof createServer> | null = null;
    private port: number;
    private host: string;
    private settingsManager: SettingsManager;
    private toolRegistryManager: ToolRegistryManager;
    private expectedToken: string;
    private agentToolsCache: { tools: { name: string; title: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }[] } | null = null;

    constructor(port = 7339, host = "127.0.0.1", settingsManager: SettingsManager, toolRegistryManager: ToolRegistryManager) {
        this.port = port;
        this.host = host;
        this.settingsManager = settingsManager;
        this.toolRegistryManager = toolRegistryManager;
        this.expectedToken = this.settingsManager.getMcpAccessToken();

        this.toolRegistryManager.on("tool:installed", () => {
            this.agentToolsCache = null;
            logInfo("[MCP] Agent tool list invalidated: tool installed");
        });

        this.toolRegistryManager.on("tool:uninstalled", () => {
            this.agentToolsCache = null;
            logInfo("[MCP] Agent tool list invalidated: tool uninstalled");
        });
    }

    private async getAgentTools(): Promise<{ name: string; title: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }[]> {
        if (this.agentToolsCache === null) {
            const agentTools = await getAgentInvokableTools(this.toolRegistryManager);
            this.agentToolsCache = {
                tools: agentTools.map((tool) => ({
                    name: tool.displayName.toLowerCase().replace(/\s+/g, "-"),
                    title: tool.displayName,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    outputSchema: tool.outputSchema,
                })),
            };
        }
        return this.agentToolsCache.tools;
    }

    async start(): Promise<void> {
        if (this.httpServer) {
            logInfo("[MCP] Server already started");
            return;
        }

        this.httpServer = createServer(this.handleRequest.bind(this));

        await new Promise<void>((resolve, reject) => {
            this.httpServer!.listen(this.port, this.host, () => {
                logInfo(`[MCP] Server listening on http://${this.host}:${this.port}`);
                resolve();
            });
            this.httpServer!.on("error", (error) => {
                logError(error instanceof Error ? error : new Error(String(error)));
                reject(error);
            });
        });
    }

    async stop(): Promise<void> {
        if (!this.httpServer) {
            return;
        }

        await this.httpServer.close();
        this.httpServer = null;
        logInfo("[MCP] Server stopped");
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        console.log(req.method, req.url);

        const providedToken = req.headers[MCP_AUTH_HEADER] as string | undefined;

        if (!providedToken || providedToken !== this.expectedToken) {
            logInfo("[MCP] Authentication failed: missing or invalid token");
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized: valid MCP access token required" }));
            return;
        }

        const server = new McpServer({ name: "pptb-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        const agentTools = await this.getAgentTools();

        server.server.registerCapabilities({ tools: { listChanged: true } });
        server.server.setRequestHandler(ListToolsRequestSchema, () => ({
            tools: agentTools.map((tool) => ({
                name: tool.name,
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
            })),
        }));
        server.server.setRequestHandler(CallToolRequestSchema, async (): Promise<CallToolResult> => {
            return {
                content: [{ type: "text", text: "not implemented" }],
                isError: true,
            };
        });

        const cleanup = (): void => {
            transport.close();
        };
        res.on("close", cleanup);
        res.on("finish", cleanup);

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: "Internal server error" }));
            }
        }
    }
}
