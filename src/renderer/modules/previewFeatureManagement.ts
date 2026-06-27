/**
 * Apply preview features visibility setting
 * Controls visibility of preview-gated items (e.g. the MCP Server button)
 */
export function applyPreviewFeaturesVisibility(enablePreviewFeatures: boolean): void {
    const mcpButton = document.getElementById("mcp-btn") as HTMLElement | null;
    if (mcpButton) {
        mcpButton.style.display = enablePreviewFeatures ? "" : "none";
    }
}
