/**
 * Utility functions for resolving tool icon URLs
 * Handles conversion of bundled icon paths to pptb-webview:// protocol URLs
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param text - Text to escape
 * @returns Escaped text safe for HTML attributes
 */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Resolve a tool icon URL, converting bundled paths to pptb-webview:// protocol
 * @param toolId - The tool identifier
 * @param iconPath - The icon path from tool manifest (could be URL or relative path)
 * @returns Resolved icon URL suitable for use in img src attribute
 */
export function resolveToolIconUrl(toolId: string, iconPath: string | undefined): string | undefined {
    if (!iconPath) {
        return undefined;
    }

    // If it's already an HTTP(S) URL, return as-is (backward compatibility)
    if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
        return iconPath;
    }

    // If it's a relative path (bundled icon), convert to pptb-webview:// protocol
    // Remove leading ./ or / if present
    const normalizedPath = iconPath.replace(/^\.?\//, "");

    // Only convert paths that look like bundled assets (SVG files)
    if (normalizedPath.endsWith(".svg")) {
        return `pptb-webview://${toolId}/${normalizedPath}`;
    }

    // For non-SVG paths or other formats, return undefined to trigger fallback
    return undefined;
}

/**
 * Generate tool icon HTML with proper fallback handling
 * @param toolId - The tool identifier
 * @param iconPath - The icon path from tool manifest
 * @param toolName - The tool name for alt text
 * @param defaultIcon - The default icon path to use as fallback
 * @returns HTML string for the tool icon
 */
export function generateToolIconHtml(toolId: string, iconPath: string | undefined, toolName: string, defaultIcon: string): string {
    const resolvedUrl = resolveToolIconUrl(toolId, iconPath);
    const escapedToolName = escapeHtml(toolName);
    const escapedDefaultIcon = escapeHtml(defaultIcon);

    if (resolvedUrl) {
        const escapedResolvedUrl = escapeHtml(resolvedUrl);
        return `<img src="${escapedResolvedUrl}" alt="${escapedToolName} icon" class="tool-item-icon-img" onerror="this.src='${escapedDefaultIcon}'" />`;
    } else {
        return `<img src="${escapedDefaultIcon}" alt="${escapedToolName} icon" class="tool-item-icon-img" />`;
    }
}
