import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, CallToolResult, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { logError, logInfo } from "../../common/logger";
import { SettingsManager } from "../managers/settingsManager";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { ToolManager } from "../managers/toolsManager";
import { ToolWindowManager } from "../managers/toolWindowManager";
import { logInvocation } from "./agentInvocationLogger";
import { AgentInvocationMode, AgentTool, getAgentInvokableTools, resolveToolId } from "./agentToolRegistry";

const MCP_AUTH_HEADER = "x-mcp-auth-token";
const MCP_AUTH_HEADER_DISPLAY_NAME = "X-MCP-Auth-Token";
const MCP_INVOCATION_META_KEY = "__pptb";
const DEFAULT_TWO_WAY_TIMEOUT_MS = 120000;

interface InvocationMeta {
    mode?: AgentInvocationMode;
    timeoutMs?: number;
}

type InvocationLogParams = Parameters<typeof logInvocation>[0] & {
    invocationMode?: "one-way" | "two-way";
    correlationId?: string;
};

function logInvocationWithMeta(params: InvocationLogParams): void {
    // Some TS language-service states may resolve a narrower logInvocation type.
    // Preserve metadata when supported while keeping call-sites type-safe.
    logInvocation(params as Parameters<typeof logInvocation>[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasObjectProperties(schema: unknown): boolean {
    if (!isRecord(schema) || !isRecord(schema.properties)) {
        return false;
    }

    return Object.keys(schema.properties).length > 0;
}

function parseInvocationMeta(args: Record<string, unknown>): InvocationMeta {
    const raw = args[MCP_INVOCATION_META_KEY];
    if (!isRecord(raw)) {
        return {};
    }

    const mode = raw.mode === "one-way" || raw.mode === "two-way" ? raw.mode : undefined;
    const timeoutMs = typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs) && raw.timeoutMs > 0 ? Math.floor(raw.timeoutMs) : undefined;

    return {
        ...(mode ? { mode } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
    };
}

function stripInvocationMeta(args: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...args };
    delete clone[MCP_INVOCATION_META_KEY];
    return clone;
}

function createInvocationError(text: string): CallToolResult {
    return {
        content: [{ type: "text", text }],
        isError: true,
    };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            timeoutHandle = undefined;
            reject(new Error(timeoutMessage));
        }, timeoutMs);
    });

    return Promise.race([
        promise.then(
            (value) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                return value;
            },
            (error) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                throw error;
            },
        ),
        timeoutPromise,
    ]);
}

function validateAgainstSchema(value: unknown, schema: unknown, path = "$"): string[] {
    if (!isRecord(schema)) {
        return [];
    }

    const errors: string[] = [];
    const schemaType = typeof schema.type === "string" ? schema.type : undefined;

    if (schemaType === "object") {
        if (!isRecord(value)) {
            errors.push(`${path}: expected object`);
            return errors;
        }

        const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
        for (const requiredKey of required) {
            if (!(requiredKey in value)) {
                errors.push(`${path}.${requiredKey}: required field is missing`);
            }
        }

        if (isRecord(schema.properties)) {
            for (const [key, childSchema] of Object.entries(schema.properties)) {
                if (!(key in value)) {
                    continue;
                }
                errors.push(...validateAgainstSchema(value[key], childSchema, `${path}.${key}`));
            }
        }

        return errors;
    }

    if (schemaType === "array") {
        if (!Array.isArray(value)) {
            errors.push(`${path}: expected array`);
            return errors;
        }
        if (schema.items !== undefined) {
            for (let i = 0; i < value.length; i++) {
                errors.push(...validateAgainstSchema(value[i], schema.items, `${path}[${i}]`));
            }
        }
        return errors;
    }

    if (schemaType === "string" && typeof value !== "string") {
        errors.push(`${path}: expected string`);
    } else if (schemaType === "number" && typeof value !== "number") {
        errors.push(`${path}: expected number`);
    } else if (schemaType === "boolean" && typeof value !== "boolean") {
        errors.push(`${path}: expected boolean`);
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.includes(value)) {
        errors.push(`${path}: value must be one of [${schema.enum.join(", ")}]`);
    }

    return errors;
}

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

    isRunning(): boolean {
        return this.httpServer !== null;
    }

    getServerDetails(): {
        address: string;
        authHeaderName: string;
        authHeaderValue: string;
        isRunning: boolean;
    } {
        return {
            address: `http://${this.host}:${this.port}`,
            authHeaderName: MCP_AUTH_HEADER_DISPLAY_NAME,
            authHeaderValue: this.expectedToken,
            isRunning: this.isRunning(),
        };
    }

    private async getAgentTools(): Promise<AgentTool[]> {
        if (this.agentToolsCache === null) {
            this.agentToolsCache = { tools: await getAgentInvokableTools(this.toolRegistryManager) };
        }
        return this.agentToolsCache.tools;
    }

    private inferMode(tool: AgentTool, payload: Record<string, unknown>, requestedMode: AgentInvocationMode | undefined): AgentInvocationMode {
        if (requestedMode && tool.invocationModes.includes(requestedMode)) {
            return requestedMode;
        }

        if (requestedMode && !tool.invocationModes.includes(requestedMode)) {
            throw new Error(`Requested mode '${requestedMode}' is not supported. Supported modes: ${tool.invocationModes.join(", ")}`);
        }

        if (tool.outputSchema.type !== "object" || !isRecord(tool.outputSchema.properties) || Object.keys(tool.outputSchema.properties).length === 0) {
            if (tool.invocationModes.includes("one-way")) {
                return "one-way";
            }
        }

        if (tool.invocationModes.includes(tool.defaultInvocationMode)) {
            return tool.defaultInvocationMode;
        }

        return tool.invocationModes[0] ?? "two-way";
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
                description: `${tool.description} [modes: ${tool.invocationModes.join(", ")}; default: ${tool.defaultInvocationMode}; returnsData: ${hasObjectProperties(tool.outputSchema) ? "yes" : "no"}]`,
                inputSchema: {
                    ...tool.inputSchema,
                    properties: {
                        ...(isRecord(tool.inputSchema.properties) ? tool.inputSchema.properties : {}),
                        [MCP_INVOCATION_META_KEY]: {
                            type: "object",
                            description: "Optional invocation metadata for MCP callers.",
                            properties: {
                                mode: {
                                    type: "string",
                                    enum: tool.invocationModes,
                                    description: `Invocation mode. Defaults to '${tool.defaultInvocationMode}' when omitted.`,
                                },
                                timeoutMs: {
                                    type: "number",
                                    description: "Optional timeout override in milliseconds for this call.",
                                },
                            },
                        },
                    },
                },
                outputSchema: tool.outputSchema,
            })),
        }));

        server.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
            const toolIdFromName = resolveToolId(request.params.name);
            const toolArgs = isRecord(request.params.arguments) ? request.params.arguments : {};
            const invocationMeta = parseInvocationMeta(toolArgs);
            const prefillData = stripInvocationMeta(toolArgs);

            const agentTools = await this.getAgentTools();
            const matchedTool = agentTools.find((tool) => tool.toolId === toolIdFromName);

            if (!matchedTool || !toolIdFromName) {
                logInvocationWithMeta({
                    toolId: `unknown:${request.params.name}`,
                    toolName: request.params.name,
                    connectionId: null,
                    prefillData,
                    outcome: "rejected",
                    error: "Tool not found or not agent-invokable",
                });
                return createInvocationError(`Tool not found or not agent-invokable: ${request.params.name}`);
            }

            const toolId = matchedTool.toolId;
            const displayName = matchedTool.displayName;
            const inputValidationErrors = validateAgainstSchema(prefillData, matchedTool.inputSchema);
            if (inputValidationErrors.length > 0) {
                const errorText = `Input validation failed: ${inputValidationErrors.join("; ")}`;
                logInvocationWithMeta({
                    toolId,
                    toolName: displayName,
                    connectionId: null,
                    prefillData,
                    outcome: "rejected",
                    error: errorText,
                });
                return createInvocationError(errorText);
            }

            const executionMode = matchedTool.executionMode;
            let invocationMode: AgentInvocationMode;

            try {
                invocationMode = this.inferMode(matchedTool, prefillData, invocationMeta.mode);
            } catch (error) {
                const errorText = error instanceof Error ? error.message : String(error);
                logInvocationWithMeta({
                    toolId,
                    toolName: displayName,
                    connectionId: null,
                    prefillData,
                    outcome: "rejected",
                    error: errorText,
                });
                return createInvocationError(errorText);
            }

            switch (executionMode) {
                case "windowed": {
                    if (!this.toolWindowManager) {
                        const errorText = "Tool window manager is not available";
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                        });
                        return createInvocationError(errorText);
                    }

                    const toolRecord = this.toolManager.getTool(matchedTool.toolId);
                    if (!toolRecord) {
                        const errorText = `Tool manifest not found for: ${matchedTool.toolId}`;
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                        });
                        return createInvocationError(errorText);
                    }

                    const correlationId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    const callerInstanceId = `mcp-caller-${correlationId}`;
                    const calleeInstanceId = `${matchedTool.toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    const primaryConnectionId: string | null = null;
                    const secondaryConnectionId: string | null = null;
                    const noReturn = invocationMode === "one-way";

                    try {
                        const launchPromise = this.toolWindowManager.launchToolWithContext(
                            callerInstanceId,
                            calleeInstanceId,
                            toolRecord,
                            primaryConnectionId,
                            secondaryConnectionId,
                            prefillData,
                            noReturn,
                            {
                                source: "mcp",
                                mode: invocationMode,
                                correlationId,
                                timeoutMs: invocationMeta.timeoutMs,
                                expectsResponse: invocationMode === "two-way",
                            },
                        );

                        if (invocationMode === "one-way") {
                            launchPromise.catch((error) => {
                                const errorText = error instanceof Error ? error.message : String(error);
                                logInvocationWithMeta({
                                    toolId,
                                    toolName: displayName,
                                    connectionId: primaryConnectionId,
                                    prefillData,
                                    outcome: "rejected",
                                    error: errorText,
                                });
                            });

                            logInvocationWithMeta({
                                toolId,
                                toolName: displayName,
                                connectionId: primaryConnectionId,
                                prefillData,
                                outcome: "completed",
                            });

                            const responsePayload = {
                                status: "accepted",
                                mode: invocationMode,
                                correlationId,
                            };

                            return {
                                content: [{ type: "text", text: JSON.stringify(responsePayload) }],
                                structuredContent: responsePayload,
                                isError: false,
                            };
                        }

                        const effectiveTimeoutMs = invocationMeta.timeoutMs ?? matchedTool.timeoutMs ?? DEFAULT_TWO_WAY_TIMEOUT_MS;
                        const result = await withTimeout(launchPromise, effectiveTimeoutMs, `Timed out waiting for '${displayName}' to return data after ${effectiveTimeoutMs} ms`);

                        if (result === null) {
                            logInvocationWithMeta({
                                toolId,
                                toolName: displayName,
                                connectionId: primaryConnectionId,
                                prefillData,
                                outcome: "no-result",
                            });
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify({
                                            status: "no_result",
                                            correlationId,
                                            message: "User did not complete the action — the tool window was closed without returning data.",
                                        }),
                                    },
                                ],
                                isError: false,
                            };
                        }

                        const outputValidationErrors = validateAgainstSchema(result, matchedTool.outputSchema);
                        if (outputValidationErrors.length > 0) {
                            const errorText = `Output validation failed: ${outputValidationErrors.join("; ")}`;
                            logInvocationWithMeta({
                                toolId,
                                toolName: displayName,
                                connectionId: primaryConnectionId,
                                prefillData,
                                outcome: "rejected",
                                error: errorText,
                            });
                            return createInvocationError(errorText);
                        }

                        const payload = (result ?? undefined) as Record<string, unknown> | undefined;
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: primaryConnectionId,
                            prefillData,
                            outcome: "completed",
                        });
                        return {
                            content: [{ type: "text", text: JSON.stringify(payload) }],
                            structuredContent: payload,
                            isError: false,
                        };
                    } catch (error) {
                        const errorText = error instanceof Error ? error.message : String(error);
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: primaryConnectionId,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                        });
                        return createInvocationError(`Failed to launch tool: ${errorText}`);
                    }
                }

                default: {
                    const errorText = `Unsupported execution mode: ${executionMode}`;
                    logInvocationWithMeta({
                        toolId,
                        toolName: displayName,
                        connectionId: null,
                        prefillData,
                        outcome: "rejected",
                        error: errorText,
                    });
                    logInfo(`[MCP] Unsupported executionMode '${executionMode}' for tool ${toolId}`);
                    return createInvocationError(errorText);
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
