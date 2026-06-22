import * as fs from "fs";
import * as path from "path";
import { logInfo } from "../../common/logger";
import { ToolManifest } from "../../common/types";
import { ToolRegistryManager } from "../managers/toolRegistryManager";
import { convertPPTBSchemaToJsonSchema, JsonObjectSchema } from "./schemaConverter";

export interface AgentTool {
    toolId: string;
    displayName: string;
    description: string;
    inputSchema: JsonObjectSchema;
    outputSchema: JsonObjectSchema;
    executionMode: "windowed";
}

export interface GetAgentInvokableToolsOptions {
    requireVerified?: boolean;
}

const toolNameMap = new Map<string, string>(); // friendlyName → internalId

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

        const invocation = pptbConfig.invocation as Record<string, unknown> | undefined;
        if (!invocation || invocation.agentInvokable !== true) {
            continue;
        }

        result.push({
            toolId: tool.id,
            displayName: friendlyName,
            description: tool.description || "",
            inputSchema: convertPPTBSchemaToJsonSchema(invocation.prefill),
            outputSchema: convertPPTBSchemaToJsonSchema(invocation.returnTopic),
            executionMode: "windowed",
        });
    }

    return result;
}

export function resolveToolId(friendlyName: string): string | undefined {
    return toolNameMap.get(friendlyName);
}
