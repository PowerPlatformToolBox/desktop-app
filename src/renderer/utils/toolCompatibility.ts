import { compareVersions } from "../../common/utils/version";

export interface VersionCompatibilityInfo {
    appVersion: string;
    minSupportedApiVersion: string;
}

interface ToolVersionLike {
    minAPI?: string;
    features?: {
        minAPI?: string;
    };
}

export type UnsupportedReason = "toolbox-too-old" | "tool-outdated" | "unknown";

export interface UnsupportedRequirement {
    reason: UnsupportedReason;
    requiredVersion?: string;
}

export function getUnsupportedRequirement(tool: ToolVersionLike, versionInfo?: VersionCompatibilityInfo | null): UnsupportedRequirement {
    const toolMinApi = tool.minAPI || tool.features?.minAPI;

    if (!toolMinApi) {
        return { reason: "unknown" };
    }

    if (!versionInfo) {
        return { reason: "unknown", requiredVersion: toolMinApi };
    }

    if (compareVersions(toolMinApi, versionInfo.minSupportedApiVersion) < 0) {
        return {
            reason: "tool-outdated",
            requiredVersion: versionInfo.minSupportedApiVersion,
        };
    }

    if (compareVersions(versionInfo.appVersion, toolMinApi) < 0) {
        return {
            reason: "toolbox-too-old",
            requiredVersion: toolMinApi,
        };
    }

    return {
        reason: "unknown",
        requiredVersion: toolMinApi,
    };
}

export function getUnsupportedToolMessage(toolName: string, requirement: UnsupportedRequirement): string {
    if (requirement.reason === "tool-outdated") {
        return requirement.requiredVersion
            ? `${toolName} is built for APIs older than this ToolBox supports (minimum supported API is v${requirement.requiredVersion}). Please update the tool to a newer version or contact the tool author.`
            : `${toolName} is built for APIs older than this ToolBox supports. Please update the tool to a newer version or contact the tool author.`;
    }

    if (requirement.reason === "toolbox-too-old") {
        return requirement.requiredVersion
            ? `${toolName} requires Power Platform ToolBox v${requirement.requiredVersion} or later. Please update your ToolBox to use this tool.`
            : `${toolName} requires a newer version of Power Platform ToolBox. Please update your ToolBox to use this tool.`;
    }

    return `${toolName} is not compatible with this ToolBox version. Please update the tool or contact the tool author.`;
}

export function getUnsupportedBadgeTitle(requirement: UnsupportedRequirement): string {
    if (requirement.reason === "tool-outdated") {
        return requirement.requiredVersion
            ? `Tool update required (ToolBox supports API v${requirement.requiredVersion}+). Update the tool or contact the author`
            : "Tool update required. Update the tool or contact the author";
    }

    if (requirement.reason === "toolbox-too-old") {
        return requirement.requiredVersion ? `Requires ToolBox v${requirement.requiredVersion} or later` : "Requires a newer ToolBox version";
    }

    return "Tool is not compatible with this ToolBox version";
}
