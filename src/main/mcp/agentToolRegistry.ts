import * as fs from "fs";
import * as path from "path";
import { logInfo } from "../../common/logger";
import { Tool, ToolManifest } from "../../common/types";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { ToolManager } from "../managers/toolsManager";
import { convertPPTBSchemaToJsonSchema, JsonObjectSchema } from "./schemaConverter";

export type AgentInvocationMode = "one-way" | "two-way";
export type AgentExecutionMode = "windowed" | "headless";

export interface AgentTool {
    toolId: string;
    displayName: string;
    description: string;
    inputSchema: JsonObjectSchema;
    outputSchema: JsonObjectSchema;
    executionModes: AgentExecutionMode[];
    defaultExecutionMode: AgentExecutionMode;
    invocationModes: AgentInvocationMode[];
    defaultInvocationMode: AgentInvocationMode;
    timeoutMs?: number;
}

export interface GetAgentInvokableToolsOptions {
    requireVerified?: boolean;
    toolManager?: ToolManager;
}

interface AgentToolCandidate {
    id: string;
    name: string;
    description: string;
    pptbConfigPath: string;
}

const toolNameMap = new Map<string, string>(); // friendlyName → internalId
const FALLBACK_INVOCATION_MODES: AgentInvocationMode[] = ["two-way"];
const FALLBACK_EXECUTION_MODES: AgentExecutionMode[] = ["windowed"];

function isAgentInvocationMode(value: unknown): value is AgentInvocationMode {
    return value === "one-way" || value === "two-way";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentExecutionMode(value: unknown): value is AgentExecutionMode {
    return value === "windowed" || value === "headless";
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
    logInfo(`[MCP] Loaded ${installedTools.length} installed tools`);

    const candidates: AgentToolCandidate[] = installedTools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        pptbConfigPath: path.join(tool.installPath, "pptb.config.json"),
    }));

    const seenToolIds = new Set(candidates.map((candidate) => candidate.id));
    if (options?.toolManager) {
        const loadedTools: Tool[] = options.toolManager.getAllTools();
        const localLoadedTools = loadedTools.filter((tool) => typeof tool.localPath === "string" && tool.localPath.length > 0);

        for (const tool of localLoadedTools) {
            if (seenToolIds.has(tool.id)) {
                continue;
            }

            const localPath = tool.localPath;
            if (!localPath) {
                continue;
            }

            candidates.push({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                pptbConfigPath: path.join(localPath, "pptb.config.json"),
            });
            seenToolIds.add(tool.id);
        }

        if (localLoadedTools.length > 0) {
            logInfo(`[MCP] Added ${localLoadedTools.length} locally loaded tools for MCP discovery`);
        }
    }

    const result: AgentTool[] = [];

    for (const tool of candidates) {
        const friendlyName = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); // MCP tool names can't have spaces
        toolNameMap.set(friendlyName, tool.id);

        if (!fs.existsSync(tool.pptbConfigPath)) {
            continue;
        }

        let pptbConfig: Record<string, unknown>;
        try {
            const raw = fs.readFileSync(tool.pptbConfigPath, "utf-8");
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

        const supportsHeadless = agentConfig?.headless === true;
        const executionModesRaw = agentConfig?.executionModes;
        const configuredExecutionModes = Array.isArray(executionModesRaw) ? executionModesRaw.filter((mode): mode is AgentExecutionMode => isAgentExecutionMode(mode)) : [];
        const executionModes: AgentExecutionMode[] =
            configuredExecutionModes.length > 0 ? configuredExecutionModes : supportsHeadless ? (["windowed", "headless"] as AgentExecutionMode[]) : FALLBACK_EXECUTION_MODES;
        const defaultExecutionModeRaw = agentConfig?.defaultExecutionMode;
        const defaultExecutionMode: AgentExecutionMode =
            isAgentExecutionMode(defaultExecutionModeRaw) && executionModes.includes(defaultExecutionModeRaw)
                ? defaultExecutionModeRaw
                : executionModes.includes("windowed")
                  ? "windowed"
                  : (executionModes[0] ?? "windowed");

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
            executionModes,
            defaultExecutionMode,
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
