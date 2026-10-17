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
 * Fallback icon URLs for SVG placeholders. The markup only carries an index into this list, so
 * `applyToolIconMasks` never reads a URL back out of the DOM.
 */
const fallbackIconUrls: string[] = [];

function registerFallbackIcon(url: string): number {
    const existing = fallbackIconUrls.indexOf(url);
    return existing === -1 ? fallbackIconUrls.push(url) - 1 : existing;
}

/** Fallback icon URL for a placeholder's `data-pptb-icon-fallback` index, if any. */
export function getFallbackIconUrl(index: string | null): string | undefined {
    return index !== null && /^\d+$/.test(index) ? fallbackIconUrls[Number(index)] : undefined;
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
            const fallbackAttr = safeDefaultIconUrl ? ` data-pptb-icon-fallback="${registerFallbackIcon(safeDefaultIconUrl)}"` : "";
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

/** Paint declarations in SVG markup: presentation attributes (`fill="…"`) and CSS (`fill: …`). */
const SVG_PAINT_PATTERN = /\b(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*(?:=\s*["']([^"']*)["']|:\s*([^;"'}<>]+))/gi;
const NAMED_COLOURS: Record<string, string> = { black: "#000000", white: "#ffffff" };

/**
 * Whether an SVG is a single-colour icon that should be drawn as a mask filled with the
 * theme's text colour. That's true when it uses `currentColor` (as the tool publishing docs
 * recommend for theme support), or when every paint resolves to one colour — including
 * unpainted shapes, which default to black. These icons were always drawn as masks, so they
 * keep following the light/dark theme. Anything with two or more colours, a gradient/pattern,
 * or an embedded image is a colour icon and is drawn as authored.
 */
export function isMonochromeSvg(svg: string): boolean {
    // Matches inside XML comments (including an unclosed one) don't count. The markup is only
    // inspected here, never rendered, so comments are skipped rather than stripped.
    const comments = Array.from(svg.matchAll(/<!--[\s\S]*?(?:-->|$)/g), (m) => [m.index, m.index + m[0].length]);
    const inMarkup = (match: RegExpMatchArray) => !comments.some(([start, end]) => match.index! >= start && match.index! < end);
    const anyInMarkup = (pattern: RegExp) => Array.from(svg.matchAll(pattern)).some(inMarkup);

    if (anyInMarkup(/currentcolor/gi)) return true;
    if (anyInMarkup(/<image[\s>]/gi)) return false;

    const colours = new Set<string>();
    for (const match of Array.from(svg.matchAll(SVG_PAINT_PATTERN)).filter(inMarkup)) {
        const value = (match[1] ?? match[2] ?? "").trim().toLowerCase();
        if (!value || ["none", "transparent", "inherit", "initial", "unset"].includes(value)) continue;
        if (value.startsWith("url(")) return false;
        colours.add(normalizeColour(value));
        if (colours.size > 1) return false;
    }
    return true;
}

function normalizeColour(value: string): string {
    const named = NAMED_COLOURS[value];
    if (named) return named;
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
    if (shortHex) return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`;
    return value.replace(/\s+/g, "");
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

/** Load icon markup through the main process. */
const defaultIconSvgLoader: ToolIconSvgLoader = (toolId, iconPath) => (window as unknown as { toolboxAPI: { getToolIconSvg: ToolIconSvgLoader } }).toolboxAPI.getToolIconSvg(toolId, iconPath);

/** How long an icon that couldn't be loaded keeps using the fallback before it's tried again. */
const FAILED_ICON_RETRY_MS = 60_000;

/**
 * Resolved icons by tool id and icon path, so re-rendering the sidebar, homepage or
 * marketplace draws them immediately instead of blanking them while the markup reloads.
 */
const toolIconPlans = new Map<string, { plan: ToolIconPlan | null; resolvedAt: number }>();
const pendingToolIconPlans = new Map<string, Promise<ToolIconPlan | null>>();

/** Clear resolved tool icons (used by tests). */
export function clearToolIconCache(): void {
    toolIconPlans.clear();
    pendingToolIconPlans.clear();
}

function getCachedToolIconPlan(key: string): ToolIconPlan | null | undefined {
    const entry = toolIconPlans.get(key);
    if (!entry) return undefined;
    if (entry.plan === null && Date.now() - entry.resolvedAt > FAILED_ICON_RETRY_MS) {
        toolIconPlans.delete(key);
        return undefined;
    }
    return entry.plan;
}

function loadToolIconPlan(key: string, toolId: string, iconPath: string, loadSvg: ToolIconSvgLoader): Promise<ToolIconPlan | null> {
    let pending = pendingToolIconPlans.get(key);
    if (!pending) {
        pending = Promise.resolve()
            .then(() => loadSvg(toolId, iconPath))
            .catch(() => null)
            .then((svg) => {
                const plan = svg ? planToolIcon(svg) : null;
                toolIconPlans.set(key, { plan, resolvedAt: Date.now() });
                pendingToolIconPlans.delete(key);
                return plan;
            });
        pendingToolIconPlans.set(key, pending);
    }
    return pending;
}

/**
 * Render SVG tool icons placed by `generateToolIconHtml`.
 *
 * The icon markup comes from the main process and is used as a `data:` URL, so it works for
 * locally loaded tools too (a CSS mask on a `pptb-webview://` URL is a cross-origin load that
 * fails). Colour SVGs are drawn as an <img>; single-colour SVGs stay a CSS mask so they follow
 * the light/dark theme. If the markup can't be loaded, the icon falls back to a mask on the
 * original URL (and to the fallback icon if that URL doesn't load).
 *
 * We avoid putting URLs inside an inline `style="..."` string during HTML generation;
 * instead, we set them via DOM APIs to reduce injection risk and to keep escaping correct.
 */
export function applyToolIconMasks(root: ParentNode = document, loadSvg: ToolIconSvgLoader = defaultIconSvgLoader): Promise<void> {
    const elements = root.querySelectorAll<HTMLElement>(".pptb-svg-mask-icon[data-pptb-icon-url]:not([data-pptb-icon-state])");
    return Promise.all(Array.from(elements).map((el) => renderToolIcon(el, loadSvg))).then(() => undefined);
}

function renderToolIcon(el: HTMLElement, loadSvg: ToolIconSvgLoader): Promise<void> {
    const iconUrl = el.getAttribute("data-pptb-icon-url");
    if (!iconUrl) return Promise.resolve();

    const toolId = el.getAttribute("data-pptb-tool-id");
    const iconPath = el.getAttribute("data-pptb-icon-path");
    if (!toolId || !iconPath) {
        drawToolIcon(el, iconUrl, null);
        return Promise.resolve();
    }

    const key = `${toolId}\n${iconPath}`;
    const cached = getCachedToolIconPlan(key);
    if (cached !== undefined) {
        drawToolIcon(el, iconUrl, cached);
        return Promise.resolve();
    }

    el.setAttribute("data-pptb-icon-state", "loading");
    return loadToolIconPlan(key, toolId, iconPath, loadSvg).then((plan) => drawToolIcon(el, iconUrl, plan));
}

function drawToolIcon(el: HTMLElement, iconUrl: string, plan: ToolIconPlan | null): void {
    if (!plan) {
        el.setAttribute("data-pptb-icon-state", "url");
        applyMaskFromUrl(el, iconUrl);
        return;
    }

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

    const fallbackUrl = getFallbackIconUrl(el.getAttribute("data-pptb-icon-fallback"));
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
