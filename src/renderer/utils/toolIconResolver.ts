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
 * Icons must be bundled in the tool's dist/ folder
 * @param toolId - The tool identifier
 * @param iconPath - The icon path relative to dist/ folder (e.g., "icon.svg" or "icons/icon.svg")
 * @returns Resolved icon URL suitable for use in img src attribute
 */
export function resolveToolIconUrl(toolId: string, iconPath: string | undefined): string | undefined {
    if (!iconPath) {
        return undefined;
    }

    // Remove leading ./ or / if present
    const normalizedPath = iconPath.replace(/^\.?\//, "");

    // Only support SVG files bundled in dist/ folder
    if (normalizedPath.endsWith(".svg")) {
        return `pptb-webview://${toolId}/dist/${normalizedPath}`;
    }

    // For non-SVG paths, return undefined to trigger fallback
    return undefined;
}

/**
 * Generate tool icon HTML with proper fallback handling
 * @param toolId - The tool identifier
 * @param iconPath - The icon path from tool manifest
 * @param toolName - The tool name for alt text
 * @param defaultIcon - The default icon path to use as fallback (application-controlled)
 * @returns HTML string for the tool icon
 */
export function generateToolIconHtml(toolId: string, iconPath: string | undefined, toolName: string, defaultIcon: string): string {
    const resolvedUrl = resolveToolIconUrl(toolId, iconPath);
    const escapedToolName = escapeHtml(toolName);
    
    // Validate defaultIcon is a safe URL (not javascript: or data:text/html protocols)
    // Note: defaultIcon is application-controlled, but validate defensively
    const safeDefaultIcon = isSafeIconUrl(defaultIcon) ? escapeHtml(defaultIcon) : "";

    if (resolvedUrl) {
        const escapedResolvedUrl = escapeHtml(resolvedUrl);
        // Only add onerror handler if we have a safe fallback icon
        const onerrorAttr = safeDefaultIcon ? ` onerror="this.src='${safeDefaultIcon}'"` : "";
        return `<img src="${escapedResolvedUrl}" alt="${escapedToolName} icon" class="tool-item-icon-img"${onerrorAttr} />`;
    } else {
        return safeDefaultIcon ? `<img src="${safeDefaultIcon}" alt="${escapedToolName} icon" class="tool-item-icon-img" />` : "";
    }
}

/**
 * Check if a URL is safe for use in icon src attributes
 * Prevents javascript:, vbscript:, and unsafe data: URIs
 * @param url - The URL to validate
 * @returns true if the URL is safe
 */
function isSafeIconUrl(url: string): boolean {
    if (!url) return false;
    const lowerUrl = url.toLowerCase().trim();
    // Block script execution protocols
    if (lowerUrl.startsWith("javascript:") || lowerUrl.startsWith("vbscript:")) return false;
    // Block data URIs that aren't images
    if (lowerUrl.startsWith("data:") && !lowerUrl.startsWith("data:image/")) return false;
    // Allow http(s), file, pptb-webview, relative paths, and image data URIs
    return true;
}
