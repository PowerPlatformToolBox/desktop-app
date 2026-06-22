import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, CallToolResult, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { logError, logInfo } from "../../common/logger";
import { SettingsManager } from "../managers/settingsManager";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { ToolManager } from "../managers/toolsManager";
import { ToolWindowManager } from "../managers/toolWindowManager";
import { AgentTool, getAgentInvokableTools } from "./agentToolRegistry";

const MCP_AUTH_HEADER = "x-mcp-auth-token";

export class McpServerManager {
    private httpServer: ReturnType<typeof createServer> | null = null;
    private port: number;
    private host: string;
    private settingsManager: SettingsManager;
    private toolRegistryManager: ToolRegistryManager;
    private toolManager: ToolManager;
    private toolWindowManager: ToolWindowManager | null = null;
    private expectedToken: string;
    private agentToolsCache: { tools: AgentTool[] } | null = null;

    constructor(port = 7339, host = "127.0.0.1", settingsManager: SettingsManager, toolRegistryManager: ToolRegistryManager, toolManager: ToolManager) {
        this.port = port;
        this.host = host;
        this.settingsManager = settingsManager;
        this.toolRegistryManager = toolRegistryManager;
        this.toolManager = toolManager;
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

    setToolWindowManager(twm: ToolWindowManager): void {
        this.toolWindowManager = twm;
    }

    private async getAgentTools(): Promise<AgentTool[]> {
        if (this.agentToolsCache === null) {
            this.agentToolsCache = { tools: await getAgentInvokableTools(this.toolRegistryManager) };
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
                name: tool.displayName,
                title: tool.displayName,
                description: tool.description,
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
            })),
        }));
        server.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
            const toolName = request.params.name;
            const toolArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

            const agentTools = await this.getAgentTools();
            const matchedTool = agentTools.find((t) => t.displayName === toolName);

            if (!matchedTool) {
                return {
                    content: [{ type: "text", text: `Tool not found or not agent-invokable: ${toolName}` }],
                    isError: true,
                };
            }

            const executionMode = matchedTool.executionMode;

            switch (executionMode) {
                case "windowed": {
                    if (!this.toolWindowManager) {
                        return {
                            content: [{ type: "text", text: "Tool window manager is not available" }],
                            isError: true,
                        };
                    }

                    const toolRecord = this.toolManager.getTool(matchedTool.toolId);
                    if (!toolRecord) {
                        return {
                            content: [{ type: "text", text: `Tool manifest not found for: ${matchedTool.toolId}` }],
                            isError: true,
                        };
                    }

                    const callerInstanceId = `mcp-caller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    const calleeInstanceId = `${matchedTool.toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    const primaryConnectionId: string | null = null;
                    const secondaryConnectionId: string | null = null;
                    const prefillData = toolArgs;
                    const noReturn = false;

                    try {
                        const result = await this.toolWindowManager.launchToolWithContext(
                            callerInstanceId,
                            calleeInstanceId,
                            toolRecord,
                            primaryConnectionId,
                            secondaryConnectionId,
                            prefillData,
                            noReturn,
                        );

                        if (result === null) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify({
                                            status: "no_result",
                                            message: "User did not complete the action — the tool window was closed without returning data.",
                                        }),
                                    },
                                ],
                                isError: false,
                            };
                        }

                        const payload = (result ?? undefined) as Record<string, unknown> | undefined;
                        return {
                            content: [{ type: "text", text: JSON.stringify(payload) }],
                            structuredContent: payload,
                            isError: false,
                        };
                    } catch (error) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Failed to launch tool: ${error instanceof Error ? error.message : String(error)}`,
                                },
                            ],
                            isError: true,
                        };
                    }
                }

                default: {
                    logInfo(`[MCP] Unsupported executionMode "${executionMode}" for tool ${toolName}`);
                    return {
                        content: [{ type: "text", text: `Unsupported execution mode: ${executionMode}` }],
                        isError: true,
                    };
                }
            }
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
