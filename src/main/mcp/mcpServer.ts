import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, CallToolResult, ElicitRequestFormParams, ListToolsRequestSchema, PrimitiveSchemaDefinition } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import os from "os";
import path from "path";
import { logError, logInfo } from "../../common/logger";
import { Connection } from "../../common/types";
import { AuthManager } from "../managers/authManager";
import { ConnectionsManager } from "../managers/connectionsManager";
import { HeadlessJobRecord, HeadlessToolInvocationManager } from "../managers/headlessToolInvocationManager";
import { SettingsManager } from "../managers/settingsManager";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { ToolManager } from "../managers/toolsManager";
import { ToolWindowManager } from "../managers/toolWindowManager";
import { logInvocation } from "./agentInvocationLogger";
import { AgentExecutionMode, AgentInvocationMode, AgentTool, getAgentInvokableTools, resolveToolId } from "./agentToolRegistry";
import { createHeadlessLogger, invokeHeadlessTool } from "./headlessToolRuntime";
import { JsonObjectSchema } from "./schemaConverter";

const MCP_AUTH_HEADER = "x-mcp-auth-token";
const MCP_AUTH_HEADER_DISPLAY_NAME = "X-MCP-Auth-Token";
const MCP_INVOCATION_META_KEY = "__pptb";
const DEFAULT_TWO_WAY_TIMEOUT_MS = 120000;
const MCP_SERVER_CONFIG_KEY = "pptb";

type SupportedClient = "claude-desktop" | "vscode";
type SupportedOs = "macos" | "windows" | "linux";

interface McpClientConfigWriteResult {
    client: SupportedClient;
    os: SupportedOs;
    filePath: string;
    serverName: string;
}

interface InvocationMeta {
    mode?: AgentInvocationMode;
    timeoutMs?: number;
    executionMode?: AgentExecutionMode;
    authToken?: string;
    connectionName?: string;
}

interface ResolvedHeadlessAuthContext {
    authToken?: string;
    source: "provided-token" | "connection-name" | "none";
    connectionName?: string;
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
    const executionMode = raw.executionMode === "windowed" || raw.executionMode === "headless" ? raw.executionMode : undefined;
    const timeoutMs = typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs) && raw.timeoutMs > 0 ? Math.floor(raw.timeoutMs) : undefined;
    const authToken = typeof raw.authToken === "string" && raw.authToken.trim().length > 0 ? raw.authToken.trim() : undefined;
    const connectionName = typeof raw.connectionName === "string" && raw.connectionName.trim().length > 0 ? raw.connectionName.trim() : undefined;

    return {
        ...(mode ? { mode } : {}),
        ...(executionMode ? { executionMode } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
        ...(authToken ? { authToken } : {}),
        ...(connectionName ? { connectionName } : {}),
    };
}

function stripInvocationMeta(args: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...args };
    delete clone[MCP_INVOCATION_META_KEY];
    return clone;
}

/**
 * Parses validation errors to find top-level required-field-missing errors.
 * Only top-level fields ($.fieldName) are returned since elicitation supports flat schemas only.
 */
function extractMissingFieldNames(errors: string[]): string[] {
    const missing: string[] = [];
    for (const err of errors) {
        const match = /^\$\.([^.:]+): required field is missing$/.exec(err);
        if (match?.[1]) {
            missing.push(match[1]);
        }
    }
    return missing;
}

/**
 * Builds a flat elicitation requestedSchema from missing required fields in the tool's input schema.
 * Returns null if any missing field cannot be represented as a primitive (e.g. object or array types),
 * since form-based elicitation only supports flat primitive values.
 */
function buildElicitationProperties(inputSchema: JsonObjectSchema, fieldNames: string[]): Record<string, PrimitiveSchemaDefinition> | null {
    const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {};
    const result: Record<string, PrimitiveSchemaDefinition> = {};

    for (const name of fieldNames) {
        const prop = isRecord(properties[name]) ? (properties[name] as Record<string, unknown>) : undefined;
        const type = typeof prop?.type === "string" ? prop.type : undefined;
        const description = typeof prop?.description === "string" ? prop.description : undefined;
        const title = typeof prop?.title === "string" ? prop.title : undefined;
        const enumValues = Array.isArray(prop?.enum) ? (prop.enum as unknown[]).filter((v): v is string => typeof v === "string") : undefined;

        if (type === "boolean") {
            result[name] = { type: "boolean", ...(title ? { title } : {}), ...(description ? { description } : {}) };
        } else if (type === "number" || type === "integer") {
            result[name] = { type: "number", ...(title ? { title } : {}), ...(description ? { description } : {}) };
        } else if (enumValues && enumValues.length > 0) {
            result[name] = { type: "string", enum: enumValues, ...(title ? { title } : {}), ...(description ? { description } : {}) };
        } else if (type === "string" || type === undefined) {
            result[name] = { type: "string", ...(title ? { title } : {}), ...(description ? { description } : {}) };
        } else {
            // Object or array — cannot be entered via a flat elicitation form
            return null;
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

function createInvocationError(text: string): CallToolResult {
    return {
        content: [{ type: "text", text }],
        isError: true,
    };
}

function createStructuredSuccess(payload: Record<string, unknown>): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: false,
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
    private connectionsManager: ConnectionsManager | null = null;
    private authManager: AuthManager | null = null;
    private expectedToken: string;
    private agentToolsCache: { tools: AgentTool[] } | null = null;
    private headlessInvocationManager: HeadlessToolInvocationManager;

    constructor(port = 7339, host = "127.0.0.1", settingsManager: SettingsManager, toolRegistryManager: ToolRegistryManager, toolManager: ToolManager) {
        this.port = port;
        this.host = host;
        this.settingsManager = settingsManager;
        this.toolRegistryManager = toolRegistryManager;
        this.toolManager = toolManager;
        this.expectedToken = this.settingsManager.getMcpAccessToken();
        this.headlessInvocationManager = new HeadlessToolInvocationManager();

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

    setConnectionAuthManagers(connectionsManager: ConnectionsManager, authManager: AuthManager): void {
        this.connectionsManager = connectionsManager;
        this.authManager = authManager;
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

    async configureClient(client: SupportedClient): Promise<McpClientConfigWriteResult> {
        const resolvedOs = this.resolveHostOS();
        const filePath = this.getClientConfigPath(client, resolvedOs);
        const serverDetails = this.getServerDetails();
        const serverEntry = {
            type: "http",
            url: `${serverDetails.address}/mcp`,
            headers: {
                [MCP_AUTH_HEADER_DISPLAY_NAME]: serverDetails.authHeaderValue,
            },
        };

        const root = await this.readJsonObject(filePath);
        if (client === "claude-desktop") {
            const mcpServers = isRecord(root.mcpServers) ? root.mcpServers : {};
            mcpServers[MCP_SERVER_CONFIG_KEY] = serverEntry;
            root.mcpServers = mcpServers;
        } else {
            const servers = isRecord(root.servers) ? root.servers : {};
            servers[MCP_SERVER_CONFIG_KEY] = serverEntry;
            root.servers = servers;
        }

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, `${JSON.stringify(root, null, 4)}\n`, "utf-8");

        logInfo("[MCP] Updated client configuration", {
            client,
            os: resolvedOs,
            filePath,
            serverName: MCP_SERVER_CONFIG_KEY,
        });

        return {
            client,
            os: resolvedOs,
            filePath,
            serverName: MCP_SERVER_CONFIG_KEY,
        };
    }

    private resolveHostOS(): SupportedOs {
        switch (process.platform) {
            case "darwin":
                return "macos";
            case "win32":
                return "windows";
            default:
                return "linux";
        }
    }

    private getClientConfigPath(client: SupportedClient, hostOs: SupportedOs): string {
        const homeDir = os.homedir();
        if (client === "claude-desktop") {
            if (hostOs === "macos") {
                return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
            }
            if (hostOs === "windows") {
                const appDataDir = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
                return path.join(appDataDir, "Claude", "claude_desktop_config.json");
            }
            return path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
        }

        if (hostOs === "macos") {
            return path.join(homeDir, "Library", "Application Support", "Code", "User", "mcp.json");
        }
        if (hostOs === "windows") {
            const appDataDir = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
            return path.join(appDataDir, "Code", "User", "mcp.json");
        }
        return path.join(homeDir, ".config", "Code", "User", "mcp.json");
    }

    private async readJsonObject(filePath: string): Promise<Record<string, unknown>> {
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const parsed: unknown = JSON.parse(raw);
            if (!isRecord(parsed)) {
                throw new Error(`Expected JSON object at root in '${filePath}'`);
            }
            return parsed;
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === "ENOENT") {
                return {};
            }
            throw error;
        }
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

    private inferExecutionMode(tool: AgentTool, requestedExecutionMode: AgentExecutionMode | undefined): AgentExecutionMode {
        if (requestedExecutionMode && tool.executionModes.includes(requestedExecutionMode)) {
            return requestedExecutionMode;
        }

        if (requestedExecutionMode && !tool.executionModes.includes(requestedExecutionMode)) {
            throw new Error(`Requested execution mode '${requestedExecutionMode}' is not supported. Supported execution modes: ${tool.executionModes.join(", ")}`);
        }

        if (tool.executionModes.includes(tool.defaultExecutionMode)) {
            return tool.defaultExecutionMode;
        }

        return tool.executionModes[0] ?? "windowed";
    }

    private async waitForHeadlessJobCompletion(jobId: string, timeoutMs: number): Promise<HeadlessJobRecord> {
        const deadlineMs = Date.now() + timeoutMs;

        while (Date.now() <= deadlineMs) {
            const job = this.headlessInvocationManager.getJob(jobId);
            if (!job) {
                throw new Error(`Headless job '${jobId}' not found while waiting for completion.`);
            }

            if (job.status === "completed" || job.status === "failed") {
                return job;
            }

            await new Promise<void>((resolve) => {
                setTimeout(resolve, 200);
            });
        }

        throw new Error(`Timed out waiting for headless job '${jobId}' completion after ${timeoutMs} ms.`);
    }

    private getReusableAccessToken(connection: Connection): string | undefined {
        if (!connection.accessToken) {
            return undefined;
        }

        if (!connection.tokenExpiry) {
            return connection.accessToken;
        }

        const expiry = new Date(connection.tokenExpiry).getTime();
        const now = Date.now();

        // Keep a small safety buffer to avoid near-expiry token use.
        if (Number.isFinite(expiry) && expiry - now > 60_000) {
            return connection.accessToken;
        }

        return undefined;
    }

    private async resolveHeadlessAuthContext(invocationMeta: InvocationMeta): Promise<ResolvedHeadlessAuthContext> {
        if (invocationMeta.authToken) {
            return {
                authToken: invocationMeta.authToken,
                source: "provided-token",
            };
        }

        if (!invocationMeta.connectionName) {
            return {
                source: "none",
            };
        }

        if (!this.connectionsManager || !this.authManager) {
            throw new Error("Connection/auth managers are not configured for connectionName-based authentication.");
        }

        const matches = this.connectionsManager.getConnections().filter((c) => c.name.trim().toLowerCase() === invocationMeta.connectionName!.trim().toLowerCase());

        if (matches.length === 0) {
            throw new Error(`No saved connection found with name '${invocationMeta.connectionName}'.`);
        }

        if (matches.length > 1) {
            throw new Error(`Multiple connections found with name '${invocationMeta.connectionName}'. Please make names unique.`);
        }

        const connection = matches[0];
        const reusableToken = this.getReusableAccessToken(connection);
        if (reusableToken) {
            return {
                authToken: reusableToken,
                source: "connection-name",
                connectionName: connection.name,
            };
        }

        let authResult: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string };

        switch (connection.authenticationType) {
            case "clientSecret":
                authResult = await this.authManager.authenticateClientSecret(connection);
                break;
            case "usernamePassword":
                if (connection.msalAccountId) {
                    const silent = await this.authManager.acquireTokenSilently(connection);
                    authResult = { accessToken: silent.accessToken, expiresOn: silent.expiresOn, msalAccountId: connection.msalAccountId };
                } else if (connection.refreshToken) {
                    authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);
                } else {
                    authResult = await this.authManager.authenticateUsernamePassword(connection);
                }
                break;
            case "interactive":
                if (connection.msalAccountId) {
                    const silent = await this.authManager.acquireTokenSilently(connection);
                    authResult = { accessToken: silent.accessToken, expiresOn: silent.expiresOn, msalAccountId: connection.msalAccountId };
                } else if (connection.refreshToken) {
                    authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);
                } else {
                    throw new Error(`Interactive connection '${connection.name}' has no reusable session. Reconnect this connection from UI first, then retry headless invocation.`);
                }
                break;
            case "connectionString":
                throw new Error(`Connection '${connection.name}' uses unsupported authenticationType 'connectionString' for headless token acquisition.`);
            default:
                throw new Error(`Unsupported authentication type for connection '${connection.name}'.`);
        }

        this.connectionsManager.updateConnectionTokens(connection.id, {
            accessToken: authResult.accessToken,
            refreshToken: authResult.refreshToken,
            expiresOn: authResult.expiresOn,
            msalAccountId: authResult.msalAccountId,
        });

        return {
            authToken: authResult.accessToken,
            source: "connection-name",
            connectionName: connection.name,
        };
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
        this.headlessInvocationManager.dispose();
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

        if (req.method === "GET" && req.url) {
            const statusPathMatch = req.url.match(/^\/mcp\/jobs\/([a-zA-Z0-9-]+)(?:\/status)?$/);
            if (statusPathMatch?.[1]) {
                const jobId = statusPathMatch[1];
                const job = this.headlessInvocationManager.getJob(jobId);

                if (!job) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Job not found" }));
                    return;
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        ...job,
                        statusUrl: `/mcp/jobs/${jobId}/status`,
                    }),
                );
                return;
            }
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
                                executionMode: {
                                    type: "string",
                                    enum: tool.executionModes,
                                    description: `Execution mode. Defaults to '${tool.defaultExecutionMode}' when omitted.`,
                                },
                                timeoutMs: {
                                    type: "number",
                                    description: "Optional timeout override in milliseconds for this call.",
                                },
                                authToken: {
                                    type: "string",
                                    description: "Optional caller-provided auth token for headless execution.",
                                },
                                connectionName: {
                                    type: "string",
                                    description: "Optional saved PPTB connection name. Used to resolve an auth token server-side when authToken is omitted.",
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
            let prefillData = stripInvocationMeta(toolArgs);

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
                const missingFields = extractMissingFieldNames(inputValidationErrors);
                let elicitedSuccessfully = false;

                // Attempt elicitation only when every validation error is a missing required field
                // and all of those fields can be represented as flat primitives in a form.
                if (missingFields.length > 0 && missingFields.length === inputValidationErrors.length) {
                    const elicitProperties = buildElicitationProperties(matchedTool.inputSchema, missingFields);
                    if (elicitProperties) {
                        try {
                            const clientCaps = server.server.getClientCapabilities();
                            if (clientCaps?.elicitation?.form) {
                                const elicitParams: ElicitRequestFormParams = {
                                    message: `The tool "${displayName}" requires the following parameters. Please provide values to continue.`,
                                    requestedSchema: {
                                        type: "object",
                                        properties: elicitProperties,
                                        required: missingFields,
                                    },
                                };
                                const elicitResult = await server.server.elicitInput(elicitParams);

                                if (elicitResult.action === "accept" && isRecord(elicitResult.content)) {
                                    const mergedPrefill = { ...prefillData, ...elicitResult.content };
                                    const revalidationErrors = validateAgainstSchema(mergedPrefill, matchedTool.inputSchema);
                                    if (revalidationErrors.length === 0) {
                                        prefillData = mergedPrefill;
                                        elicitedSuccessfully = true;
                                    } else {
                                        const errorText = `Input validation failed after elicitation: ${revalidationErrors.join("; ")}`;
                                        logInvocationWithMeta({ toolId, toolName: displayName, connectionId: null, prefillData, outcome: "rejected", error: errorText });
                                        return createInvocationError(errorText);
                                    }
                                } else {
                                    logInvocationWithMeta({
                                        toolId,
                                        toolName: displayName,
                                        connectionId: null,
                                        prefillData,
                                        outcome: "rejected",
                                        error: "User declined or cancelled parameter elicitation",
                                    });
                                    return createInvocationError(`Tool invocation cancelled: required parameters were not provided for "${displayName}".`);
                                }
                            }
                        } catch {
                            // Elicitation not supported or failed; fall through to the validation error below
                        }
                    }
                }

                if (!elicitedSuccessfully) {
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
            }

            let executionMode: AgentExecutionMode;
            let invocationMode: AgentInvocationMode;

            try {
                executionMode = this.inferExecutionMode(matchedTool, invocationMeta.executionMode);
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
                case "headless": {
                    const effectiveTimeoutMs = invocationMeta.timeoutMs ?? matchedTool.timeoutMs ?? DEFAULT_TWO_WAY_TIMEOUT_MS;
                    const installedManifest = this.toolRegistryManager.getInstalledManifestSync(toolId);
                    let resolvedAuthContext: ResolvedHeadlessAuthContext;

                    if (!installedManifest) {
                        const errorText = `Tool manifest not found for: ${toolId}`;
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                            invocationMode,
                        });
                        return createInvocationError(errorText);
                    }

                    try {
                        resolvedAuthContext = await this.resolveHeadlessAuthContext(invocationMeta);
                    } catch (error) {
                        const errorText = error instanceof Error ? error.message : String(error);
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                            invocationMode,
                        });
                        return createInvocationError(`Failed to resolve authentication context: ${errorText}`);
                    }

                    try {
                        const job = await this.headlessInvocationManager.startJob({
                            toolId,
                            toolName: displayName,
                            timeoutMs: effectiveTimeoutMs,
                            execute: async (jobId) => {
                                const result = await invokeHeadlessTool(installedManifest, prefillData, {
                                    toolId,
                                    toolName: displayName,
                                    invocationMode,
                                    authToken: resolvedAuthContext.authToken,
                                    updateProgress: (percent, message) => {
                                        this.headlessInvocationManager.updateProgress(jobId, percent, message);
                                    },
                                    logger: createHeadlessLogger(toolId),
                                });

                                const outputValidationErrors = validateAgainstSchema(result, matchedTool.outputSchema);
                                if (outputValidationErrors.length > 0) {
                                    throw new Error(`Output validation failed: ${outputValidationErrors.join("; ")}`);
                                }

                                return result;
                            },
                        });

                        if (invocationMode === "two-way") {
                            const finalJob = await this.waitForHeadlessJobCompletion(job.jobId, effectiveTimeoutMs);

                            if (finalJob.status === "failed") {
                                const errorText = finalJob.error || `Headless execution failed for '${displayName}'.`;
                                logInvocationWithMeta({
                                    toolId,
                                    toolName: displayName,
                                    connectionId: null,
                                    prefillData,
                                    outcome: "rejected",
                                    error: errorText,
                                    invocationMode,
                                    correlationId: job.jobId,
                                });
                                return createInvocationError(errorText);
                            }

                            const finalPayload = finalJob.result;
                            if (!finalPayload) {
                                const errorText = `Headless execution for '${displayName}' completed without a payload.`;
                                logInvocationWithMeta({
                                    toolId,
                                    toolName: displayName,
                                    connectionId: null,
                                    prefillData,
                                    outcome: "no-result",
                                    error: errorText,
                                    invocationMode,
                                    correlationId: job.jobId,
                                });
                                return createInvocationError(errorText);
                            }

                            logInvocationWithMeta({
                                toolId,
                                toolName: displayName,
                                connectionId: null,
                                prefillData,
                                outcome: "completed",
                                invocationMode,
                                correlationId: job.jobId,
                            });

                            return createStructuredSuccess(finalPayload);
                        }

                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "completed",
                            invocationMode,
                            correlationId: job.jobId,
                        });

                        return createStructuredSuccess({
                            status: "accepted",
                            executionMode,
                            mode: invocationMode,
                            jobId: job.jobId,
                            jobStatusPath: `/mcp/jobs/${job.jobId}`,
                            statusUrl: `/mcp/jobs/${job.jobId}/status`,
                            jobStatus: "pending",
                            timeoutMs: effectiveTimeoutMs,
                            hasAuthToken: Boolean(resolvedAuthContext.authToken),
                            authSource: resolvedAuthContext.source,
                            connectionName: resolvedAuthContext.connectionName,
                        });
                    } catch (error) {
                        const errorText = error instanceof Error ? error.message : String(error);
                        logInvocationWithMeta({
                            toolId,
                            toolName: displayName,
                            connectionId: null,
                            prefillData,
                            outcome: "rejected",
                            error: errorText,
                            invocationMode,
                        });
                        return createInvocationError(`Failed to start headless execution: ${errorText}`);
                    }
                }

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

                            const responsePayload: Record<string, unknown> = {
                                status: "accepted",
                                executionMode,
                                mode: invocationMode,
                                correlationId,
                            };

                            return createStructuredSuccess(responsePayload);
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
                                structuredContent: {
                                    status: "no_result",
                                    executionMode,
                                    correlationId,
                                    message: "User did not complete the action — the tool window was closed without returning data.",
                                },
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
                        return createStructuredSuccess(payload ?? {});
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
