import * as fs from "fs";
import * as path from "path";
import { logInfo } from "../../common/logger";
import { ToolManifest } from "../../common/types";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { convertPPTBSchemaToJsonSchema, JsonObjectSchema } from "./schemaConverter";

export type AgentInvocationMode = "one-way" | "two-way";

export interface AgentTool {
    toolId: string;
    displayName: string;
    description: string;
    inputSchema: JsonObjectSchema;
    outputSchema: JsonObjectSchema;
    executionMode: "windowed";
    invocationModes: AgentInvocationMode[];
    defaultInvocationMode: AgentInvocationMode;
    timeoutMs?: number;
}

export interface GetAgentInvokableToolsOptions {
    requireVerified?: boolean;
}

const toolNameMap = new Map<string, string>(); // friendlyName → internalId
const FALLBACK_INVOCATION_MODES: AgentInvocationMode[] = ["two-way"];

function isAgentInvocationMode(value: unknown): value is AgentInvocationMode {
    return value === "one-way" || value === "two-way";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAgentModes(value: unknown): AgentInvocationMode[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((mode): mode is AgentInvocationMode => isAgentInvocationMode(mode));
}

function readAgentConfig(pptbConfig: Record<string, unknown>): Record<string, unknown> | undefined {
    const agents = isRecord(pptbConfig.agents) ? pptbConfig.agents : undefined;
    if (agents) {
        return agents;
    }

    return undefined;
}

export async function getAgentInvokableTools(toolRegistryManager: ToolRegistryManager, options?: GetAgentInvokableToolsOptions): Promise<AgentTool[]> {
    toolNameMap.clear();

    void options?.requireVerified; // for future use, currently unused
    const installedTools: ToolManifest[] = await toolRegistryManager.getInstalledTools();
    logInfo(installedTools.map((t) => `Installed tool: ${t.name} (version ${t.version})`).join("\n"));

    const result: AgentTool[] = [];

    for (const tool of installedTools) {
        const pptbConfigPath = path.join(tool.installPath, "pptb.config.json");
        const friendlyName = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); // MCP tool names can't have spaces
        toolNameMap.set(friendlyName, tool.id);

        if (!fs.existsSync(pptbConfigPath)) {
            continue;
        }

        let pptbConfig: Record<string, unknown>;
        try {
            const raw = fs.readFileSync(pptbConfigPath, "utf-8");
            pptbConfig = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            continue;
        }

        const agentConfig = readAgentConfig(pptbConfig);
        const invocation = pptbConfig.invocation as Record<string, unknown> | undefined;
        const schemaSource = isRecord(invocation) ? invocation : {};
        const invokable = agentConfig?.invokable === true;

        if (!invokable) {
            continue;
        }

        const invocationModesRaw = agentConfig?.modes;
        const parsedModes = normalizeAgentModes(invocationModesRaw);
        const invocationModes: AgentInvocationMode[] = parsedModes.length > 0 ? parsedModes : FALLBACK_INVOCATION_MODES;

        const defaultInvocationModeRaw = agentConfig?.defaultMode;
        let defaultInvocationMode: AgentInvocationMode;
        if (isAgentInvocationMode(defaultInvocationModeRaw) && invocationModes.includes(defaultInvocationModeRaw)) {
            defaultInvocationMode = defaultInvocationModeRaw;
        } else if (invocationModes.includes("two-way")) {
            defaultInvocationMode = "two-way";
        } else {
            defaultInvocationMode = invocationModes[0] ?? "one-way";
        }

        const timeoutMsRaw = agentConfig?.timeoutMS;
        const timeoutMs = typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? Math.floor(timeoutMsRaw) : undefined;

        result.push({
            toolId: tool.id,
            displayName: friendlyName,
            description: tool.description || "",
            inputSchema: convertPPTBSchemaToJsonSchema(schemaSource.prefill),
            outputSchema: convertPPTBSchemaToJsonSchema(schemaSource.returnTopic),
            executionMode: "windowed",
            invocationModes,
            defaultInvocationMode,
            ...(timeoutMs ? { timeoutMs } : {}),
        });
    }

    return result;
}

export function resolveToolId(friendlyName: string): string | undefined {
    return toolNameMap.get(friendlyName);
}
