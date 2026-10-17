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
        // `applyToolIconMasks` later swaps in the icon's own markup: colour SVGs become an <img>,
        // monochrome (currentColor) SVGs stay a mask.
        if (isSvgUrl(resolvedUrl)) {
            const escapedResolvedUrl = escapeHtml(resolvedUrl);
            const fallbackAttr = safeDefaultIconAttr ? ` data-pptb-icon-fallback="${safeDefaultIconAttr}"` : "";
            const sourceAttrs = ` data-pptb-tool-id="${escapeHtml(toolId)}" data-pptb-icon-path="${escapeHtml(iconPath ?? "")}"`;
            return `<span class="tool-item-icon-img pptb-svg-mask-icon" role="img" aria-label="${escapedToolName} icon" data-pptb-icon-url="${escapedResolvedUrl}"${sourceAttrs}${fallbackAttr}></span>`;
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
 * A monochrome icon uses `currentColor` (as the tool publishing docs recommend for
 * theme support) and is drawn as a mask filled with the theme's text colour. Any other
 * SVG is a colour icon and is drawn as authored.
 */
export function isMonochromeSvg(svg: string): boolean {
    return /currentcolor/i.test(svg);
}

export function svgToDataUrl(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type ToolIconPlan = { kind: "mask"; url: string } | { kind: "image"; url: string };

/** Decide how to draw an SVG icon from its markup. */
export function planToolIcon(svg: string): ToolIconPlan {
    const url = svgToDataUrl(svg);
    return isMonochromeSvg(svg) ? { kind: "mask", url } : { kind: "image", url };
}

export type ToolIconSvgLoader = (toolId: string, iconPath: string) => Promise<string | null>;

const remoteIconSvgCache = new Map<string, Promise<string | null>>();

/** Load icon markup through the main process. Remote (marketplace) icons are cached per URL. */
const defaultIconSvgLoader: ToolIconSvgLoader = (toolId, iconPath) => {
    const api = (window as unknown as { toolboxAPI: { getToolIconSvg: ToolIconSvgLoader } }).toolboxAPI;
    const load = () => api.getToolIconSvg(toolId, iconPath).catch(() => null);
    if (!/^https?:\/\//i.test(iconPath)) return load();

    const cached = remoteIconSvgCache.get(iconPath);
    if (cached) return cached;

    const pending = load();
    remoteIconSvgCache.set(iconPath, pending);
    void pending.then((svg) => {
        if (svg === null) remoteIconSvgCache.delete(iconPath);
    });
    return pending;
};

/**
 * Render SVG tool icons placed by `generateToolIconHtml`.
 *
 * The icon markup comes from the main process and is used as a `data:` URL, so it works for
 * locally loaded tools too (a CSS mask on a `pptb-webview://` URL is a cross-origin load that
 * fails). Colour SVGs are drawn as an <img>; monochrome (currentColor) SVGs stay a CSS mask so
 * they follow the light/dark theme. If the markup can't be loaded, the icon falls back to a
 * mask on the original URL (and to the fallback icon if that URL doesn't load).
 *
 * We avoid putting URLs inside an inline `style="..."` string during HTML generation;
 * instead, we set them via DOM APIs to reduce injection risk and to keep escaping correct.
 */
export function applyToolIconMasks(root: ParentNode = document, loadSvg: ToolIconSvgLoader = defaultIconSvgLoader): Promise<void> {
    const elements = root.querySelectorAll<HTMLElement>(".pptb-svg-mask-icon[data-pptb-icon-url]:not([data-pptb-icon-state])");
    return Promise.all(Array.from(elements).map((el) => renderToolIcon(el, loadSvg))).then(() => undefined);
}

async function renderToolIcon(el: HTMLElement, loadSvg: ToolIconSvgLoader): Promise<void> {
    const iconUrl = el.getAttribute("data-pptb-icon-url");
    if (!iconUrl) return;
    el.setAttribute("data-pptb-icon-state", "loading");

    const toolId = el.getAttribute("data-pptb-tool-id");
    const iconPath = el.getAttribute("data-pptb-icon-path");
    const svg = toolId && iconPath ? await loadSvg(toolId, iconPath) : null;

    if (!svg) {
        el.setAttribute("data-pptb-icon-state", "url");
        applyMaskFromUrl(el, iconUrl);
        return;
    }

    const plan = planToolIcon(svg);
    if (plan.kind === "mask") {
        el.setAttribute("data-pptb-icon-state", "mask");
        el.style.setProperty("--pptb-icon-url", `url(${JSON.stringify(plan.url)})`);
        return;
    }

    el.replaceWith(createIconImage(plan.url, el.getAttribute("aria-label") || ""));
}

function applyMaskFromUrl(el: HTMLElement, iconUrl: string): void {
    // Set CSS variable used by the mask CSS.
    // Use JSON.stringify to safely quote/escape characters in the CSS string.
    el.style.setProperty("--pptb-icon-url", `url(${JSON.stringify(iconUrl)})`);

    const fallbackUrl = el.getAttribute("data-pptb-icon-fallback");
    if (!fallbackUrl) return;

    // Optional fallback: preflight load; if it fails, replace with fallback <img>.
    // Note: This may cause an extra request, but keeps UX consistent.
    const probe = new Image();
    probe.onerror = () => {
        el.replaceWith(createIconImage(fallbackUrl, el.getAttribute("aria-label") || ""));
    };
    probe.src = iconUrl;
}

function createIconImage(src: string, alt: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "tool-item-icon-img";
    img.src = src;
    img.alt = alt;
    return img;
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
