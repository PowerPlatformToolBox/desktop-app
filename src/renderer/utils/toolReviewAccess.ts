import type { ToolReviewContext } from "../../common/types";
import { isToolReviewEligible, TOOL_REVIEW_NOT_INSTALLED_MESSAGE } from "../../common/utils/toolReview";

export type ToolReviewAccess = { status: "eligible"; context: ToolReviewContext } | { status: "not-installed" } | { status: "unknown"; error: Error };

/**
 * Resolve whether the given tool can be reviewed. Uses the main process' installed-tool state
 * keyed by tool id; any failure yields "unknown", which never enables rating.
 */
export async function resolveToolReviewAccess(toolId: string): Promise<ToolReviewAccess> {
    try {
        const context = await window.toolboxAPI.getToolReviewContext(toolId);
        if (context && context.toolId === toolId && isToolReviewEligible(context)) {
            return { status: "eligible", context };
        }
        return { status: "not-installed" };
    } catch (error) {
        return { status: "unknown", error: error instanceof Error ? error : new Error(String(error)) };
    }
}

export function getToolReviewUnavailableMessage(access: ToolReviewAccess): string | null {
    if (access.status === "eligible") return null;
    if (access.status === "not-installed") return TOOL_REVIEW_NOT_INSTALLED_MESSAGE;
    return `Could not verify that this tool is installed, so reviews are unavailable: ${access.error.message}`;
}
