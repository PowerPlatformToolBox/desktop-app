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
 * @param iconPath - The icon path - can be:
 *   - Relative path for installed tools (e.g., "icon.svg" or "icons/icon.svg")
 *   - Full GitHub Release URL for marketplace display (e.g., "https://github.com/.../icon.svg")
 * @returns Resolved icon URL suitable for use in img src attribute
 */
export function resolveToolIconUrl(toolId: string, iconPath: string | undefined): string | undefined {
    if (!iconPath) {
        return undefined;
    }

    // If it's already a full HTTP(S) URL (e.g., from GitHub Release for marketplace), return as-is
    if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
        return iconPath;
    }

    // Normalize path separators and remove leading ./ or / if present
    let normalizedPath = iconPath.replace(/\\/g, "/").replace(/^\.?\//, "");

    // The pptb-webview protocol handler already serves files from the tool's dist/ folder.
    // If a tool manifest includes a path like "dist/icon.svg", strip the leading "dist/"
    // to avoid requesting dist/dist/icon.svg.
    normalizedPath = normalizedPath.replace(/^dist\//, "");

    // Only support SVG files bundled in dist/ folder
    if (normalizedPath.endsWith(".svg")) {
        return `pptb-webview://${toolId}/${normalizedPath}`;
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
    const safeDefaultIconUrl = isSafeIconUrl(defaultIcon) ? defaultIcon : "";
    const safeDefaultIconAttr = safeDefaultIconUrl ? escapeHtml(safeDefaultIconUrl) : "";

    if (resolvedUrl) {
        // If the resolved URL is an SVG, prefer a CSS mask element so the icon can inherit `currentColor`
        // and automatically adapt to light/dark theme.
        if (isSvgUrl(resolvedUrl)) {
            const escapedResolvedUrl = escapeHtml(resolvedUrl);
            const fallbackAttr = safeDefaultIconAttr ? ` data-pptb-icon-fallback="${safeDefaultIconAttr}"` : "";
            return `<span class="tool-item-icon-img pptb-svg-mask-icon" role="img" aria-label="${escapedToolName} icon" data-pptb-icon-url="${escapedResolvedUrl}"${fallbackAttr}></span>`;
        }

        // Non-SVG: render as a normal <img>
        const escapedResolvedUrl = escapeHtml(resolvedUrl);
        // Only add onerror handler if we have a safe fallback icon
        const onerrorAttr = safeDefaultIconAttr ? ` onerror="this.src='${safeDefaultIconAttr}'"` : "";
        return `<img src="${escapedResolvedUrl}" alt="${escapedToolName} icon" class="tool-item-icon-img"${onerrorAttr} />`;
    } else {
        return safeDefaultIconAttr ? `<img src="${safeDefaultIconAttr}" alt="${escapedToolName} icon" class="tool-item-icon-img" />` : "";
    }
}

/**
 * Apply CSS mask URLs for theme-aware SVG icons.
 *
 * We avoid putting the raw URL inside an inline `style="..."` string during HTML generation;
 * instead, we set it via DOM APIs to reduce injection risk and to keep escaping correct.
 */
export function applyToolIconMasks(root: ParentNode = document): void {
    const elements = root.querySelectorAll<HTMLElement>(".pptb-svg-mask-icon[data-pptb-icon-url]");
    elements.forEach((el) => {
        const iconUrl = el.getAttribute("data-pptb-icon-url");
        if (!iconUrl) return;

        // Set CSS variable used by the mask CSS.
        // Use JSON.stringify to safely quote/escape characters in the CSS string.
        el.style.setProperty("--pptb-icon-url", `url(${JSON.stringify(iconUrl)})`);

        const fallbackUrl = el.getAttribute("data-pptb-icon-fallback");
        if (!fallbackUrl) return;

        // Optional fallback: preflight load; if it fails, replace with fallback <img>.
        // Note: This may cause an extra request, but keeps UX consistent.
        const probe = new Image();
        probe.onerror = () => {
            const img = document.createElement("img");
            img.className = "tool-item-icon-img";
            img.src = fallbackUrl;

            const ariaLabel = el.getAttribute("aria-label") || "";
            img.alt = ariaLabel;

            el.replaceWith(img);
        };
        probe.src = iconUrl;
    });
}

function isSvgUrl(url: string): boolean {
    return /\.svg([?#].*)?$/i.test(url);
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
