import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { logError, logInfo } from "../../common/logger";
import { SettingsManager } from "../managers/settingsManager";

const MCP_AUTH_HEADER = "x-mcp-auth-token";

export class McpServerManager {
    private httpServer: ReturnType<typeof createServer> | null = null;
    private port: number;
    private host: string;
    private settingsManager: SettingsManager;
    private expectedToken: string;

    constructor(port = 7339, host = "127.0.0.1", settingsManager: SettingsManager) {
        this.port = port;
        this.host = host;
        this.settingsManager = settingsManager;
        this.expectedToken = this.settingsManager.getMcpAccessToken();
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